import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveTenantContext, type TenantContext } from '@garun/core/identity';
import {
  createMaterialRequest,
  getAvailableFile,
  getPendingUploadForCompletion,
  initiateMaterialUpload,
  listProjectMaterials,
  markUploadCompleted,
  MaterialServiceError,
  reviewMaterialRevision,
} from '@garun/core/materials';
import { createDatabaseClient } from '@garun/db';
import {
  auditEvent,
  clientCompany,
  clientMembership,
  fileObject,
  materialRevision,
  outboxEvent,
  project,
  projectMembership,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const client = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);
const projectSlug = `materials-project-${suffix}`;
let workspaceAId = '';
let workspaceBId = '';
let owner: TenantContext;
let clientUser: TenantContext;
let intruder: TenantContext;

beforeAll(async () => {
  const people = await client.db
    .insert(user)
    .values([
      { name: 'Materials owner', email: `materials-owner-${suffix}@example.test` },
      { name: 'Materials client', email: `materials-client-${suffix}@example.test` },
      { name: 'Materials intruder', email: `materials-intruder-${suffix}@example.test` },
    ])
    .returning({ id: user.id, name: user.name });
  const ownerId = people.find((item) => item.name === 'Materials owner')!.id;
  const clientId = people.find((item) => item.name === 'Materials client')!.id;
  const intruderId = people.find((item) => item.name === 'Materials intruder')!.id;
  const spaces = await client.db
    .insert(workspace)
    .values([
      { name: 'Materials A', slug: `materials-a-${suffix}`, ownerId },
      { name: 'Materials B', slug: `materials-b-${suffix}`, ownerId: intruderId },
    ])
    .returning({ id: workspace.id, slug: workspace.slug });
  workspaceAId = spaces.find((item) => item.slug.startsWith('materials-a'))!.id;
  workspaceBId = spaces.find((item) => item.slug.startsWith('materials-b'))!.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId: workspaceAId, userId: ownerId, role: 'owner' },
    { workspaceId: workspaceAId, userId: clientId, role: 'member' },
    { workspaceId: workspaceBId, userId: intruderId, role: 'owner' },
  ]);
  const [company] = await client.db
    .insert(clientCompany)
    .values({ workspaceId: workspaceAId, name: 'Materials client company' })
    .returning({ id: clientCompany.id });
  await client.db.insert(clientMembership).values({
    workspaceId: workspaceAId,
    clientCompanyId: company!.id,
    userId: clientId,
    role: 'primary',
  });
  const [createdProject] = await client.db
    .insert(project)
    .values({
      workspaceId: workspaceAId,
      clientCompanyId: company!.id,
      name: 'Materials project',
      slug: projectSlug,
      projectType: 'website',
      status: 'in_progress',
      ownerUserId: ownerId,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-09-01',
    })
    .returning({ id: project.id });
  await client.db.insert(projectMembership).values([
    {
      workspaceId: workspaceAId,
      projectId: createdProject!.id,
      userId: ownerId,
      side: 'internal',
      role: 'owner',
    },
    {
      workspaceId: workspaceAId,
      projectId: createdProject!.id,
      userId: clientId,
      side: 'client',
      role: 'client',
    },
  ]);
  const contexts = await Promise.all([
    resolveTenantContext(client.db, ownerId, `materials-a-${suffix}`),
    resolveTenantContext(client.db, clientId, `materials-a-${suffix}`),
    resolveTenantContext(client.db, intruderId, `materials-b-${suffix}`),
  ]);
  if (contexts.some((item) => !item)) throw new Error('Materials tenant setup failed');
  [owner, clientUser, intruder] = contexts as [TenantContext, TenantContext, TenantContext];
});

afterAll(async () => {
  await client.db.delete(workspace).where(eq(workspace.id, workspaceAId));
  await client.db.delete(workspace).where(eq(workspace.id, workspaceBId));
  await client.pool.end();
});

describe('private material lifecycle', () => {
  it('creates request, action, audit/outbox and tenant-scoped quarantined upload', async () => {
    const created = await createMaterialRequest(
      client,
      owner,
      projectSlug,
      {
        title: 'Логотип',
        type: 'logo',
        category: 'Бренд',
        stageId: null,
        requestedFromUserId: clientUser.userId,
        dueAt: new Date('2026-08-10T23:59:59Z'),
      },
      'materials-request',
    );
    const declaration = {
      name: 'logo.png',
      mimeType: 'image/png',
      size: 8,
      checksum: 'a'.repeat(64),
    };
    const first = await initiateMaterialUpload(
      client,
      clientUser,
      projectSlug,
      created.id,
      [declaration],
      'material_upload_key_0001',
      {
        maxWorkspaceBytes: 10_000,
        uploadExpiresAt: new Date(Date.now() + 60_000),
      },
    );
    const repeated = await initiateMaterialUpload(
      client,
      clientUser,
      projectSlug,
      created.id,
      [declaration],
      'material_upload_key_0001',
      {
        maxWorkspaceBytes: 10_000,
        uploadExpiresAt: new Date(Date.now() + 60_000),
      },
    );
    expect(repeated[0]?.id).toBe(first[0]?.id);
    const pending = await getPendingUploadForCompletion(
      client,
      clientUser,
      projectSlug,
      first[0]!.id,
    );
    expect(pending.storageKey).toContain(`${workspaceAId}/`);
    const listing = await listProjectMaterials(client, clientUser, projectSlug);
    expect(listing.materials[0]?.revisions[0]?.files[0]).not.toHaveProperty('name');
    await expect(getAvailableFile(client, clientUser, projectSlug, first[0]!.id)).rejects.toThrow(
      MaterialServiceError,
    );
    await expect(listProjectMaterials(client, intruder, projectSlug)).rejects.toThrow(
      MaterialServiceError,
    );
    const [events, audits] = await Promise.all([
      client.db
        .select()
        .from(outboxEvent)
        .where(
          and(eq(outboxEvent.workspaceId, workspaceAId), eq(outboxEvent.aggregateId, created.id)),
        ),
      client.db
        .select()
        .from(auditEvent)
        .where(and(eq(auditEvent.workspaceId, workspaceAId), eq(auditEvent.entityId, created.id))),
    ]);
    expect(events.some((event) => event.eventType === 'material.requested')).toBe(true);
    expect(audits.some((event) => event.action === 'material.requested')).toBe(true);

    await markUploadCompleted(client, clientUser, projectSlug, first[0]!.id, {
      size: declaration.size,
      mimeType: declaration.mimeType,
      checksum: declaration.checksum,
    });
    const [uploaded] = await client.db
      .select()
      .from(fileObject)
      .where(eq(fileObject.id, first[0]!.id));
    expect(uploaded?.uploadStatus).toBe('uploaded');
    expect(uploaded?.scanStatus).toBe('pending');

    const [revision] = await client.db
      .select()
      .from(materialRevision)
      .where(eq(materialRevision.materialId, created.id));
    await client.db
      .update(fileObject)
      .set({
        uploadStatus: 'available',
        scanStatus: 'clean',
        detectedMimeType: 'image/png',
        checksum: declaration.checksum,
        availableAt: new Date(),
      })
      .where(eq(fileObject.id, first[0]!.id));
    await client.db
      .update(materialRevision)
      .set({ status: 'submitted', submittedAt: new Date() })
      .where(eq(materialRevision.id, revision!.id));
    await reviewMaterialRevision(client, owner, projectSlug, revision!.id, 'accepted', null, true);
    const available = await getAvailableFile(client, clientUser, projectSlug, first[0]!.id);
    expect(available.normalizedName).toBe('logo.png');
    const filtered = await listProjectMaterials(client, clientUser, projectSlug, {
      query: 'logo.png',
      category: 'Бренд',
    });
    expect(filtered.categories).toContain('Бренд');
    expect(filtered.materials).toHaveLength(1);
  });

  it('denies forged targets, cross-tenant IDs and owner-only actions', async () => {
    await expect(
      createMaterialRequest(client, clientUser, projectSlug, {
        title: 'Forbidden',
        type: 'file',
        category: null,
        stageId: null,
        requestedFromUserId: clientUser.userId,
        dueAt: new Date('2026-08-10T23:59:59Z'),
      }),
    ).rejects.toThrow(MaterialServiceError);
    await expect(
      initiateMaterialUpload(
        client,
        clientUser,
        projectSlug,
        crypto.randomUUID(),
        [
          {
            name: 'brief.pdf',
            mimeType: 'application/pdf',
            size: 8,
            checksum: 'b'.repeat(64),
          },
        ],
        'material_upload_key_0002',
        { maxWorkspaceBytes: 10_000, uploadExpiresAt: new Date(Date.now() + 60_000) },
      ),
    ).rejects.toThrow(MaterialServiceError);
    await expect(listProjectMaterials(client, intruder, projectSlug)).rejects.toThrow(
      MaterialServiceError,
    );
    const quotaTarget = await createMaterialRequest(client, owner, projectSlug, {
      title: 'Quota check',
      type: 'file',
      category: null,
      stageId: null,
      requestedFromUserId: clientUser.userId,
      dueAt: new Date('2026-08-10T23:59:59Z'),
    });
    await expect(
      initiateMaterialUpload(
        client,
        clientUser,
        projectSlug,
        quotaTarget.id,
        [
          {
            name: 'brief.pdf',
            mimeType: 'application/pdf',
            size: 8,
            checksum: 'c'.repeat(64),
          },
        ],
        'material_upload_key_quota',
        { maxWorkspaceBytes: 1, uploadExpiresAt: new Date(Date.now() + 60_000) },
      ),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });
});
