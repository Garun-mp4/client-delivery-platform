import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getProjectExportArtifact,
  listProjectExports,
  requestProjectExport,
} from '@garun/core/exports';
import { resolveTenantContext, type TenantContext } from '@garun/core/identity';
import { createDatabaseClient } from '@garun/db';
import {
  clientCompany,
  exportJob,
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

let workspaceAId = '';
let workspaceBId = '';
let projectAId = '';
let clientMembershipId = '';
let ownerA: TenantContext;
let ownerB: TenantContext;
let clientA: TenantContext;
let ownerAId = '';
let ownerBId = '';
let clientAId = '';
const projectSlug = `export-project-${suffix}`;

beforeAll(async () => {
  const identities = await client.db
    .insert(user)
    .values([
      { name: 'Export owner A', email: `export-owner-a-${suffix}@example.test` },
      { name: 'Export owner B', email: `export-owner-b-${suffix}@example.test` },
      { name: 'Export client A', email: `export-client-a-${suffix}@example.test` },
    ])
    .returning({ id: user.id, email: user.email });
  ownerAId = identities.find((item) => item.email.includes('owner-a'))!.id;
  ownerBId = identities.find((item) => item.email.includes('owner-b'))!.id;
  clientAId = identities.find((item) => item.email.includes('client-a'))!.id;
  const spaces = await client.db
    .insert(workspace)
    .values([
      { name: 'Export workspace A', slug: `export-a-${suffix}`, ownerId: ownerAId },
      { name: 'Export workspace B', slug: `export-b-${suffix}`, ownerId: ownerBId },
    ])
    .returning({ id: workspace.id, slug: workspace.slug });
  workspaceAId = spaces.find((item) => item.slug === `export-a-${suffix}`)!.id;
  workspaceBId = spaces.find((item) => item.slug === `export-b-${suffix}`)!.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId: workspaceAId, userId: ownerAId, role: 'owner' },
    { workspaceId: workspaceAId, userId: clientAId, role: 'member' },
    { workspaceId: workspaceBId, userId: ownerBId, role: 'owner' },
  ]);
  const [company] = await client.db
    .insert(clientCompany)
    .values({ workspaceId: workspaceAId, name: 'Export client company' })
    .returning({ id: clientCompany.id });
  const [createdProject] = await client.db
    .insert(project)
    .values({
      workspaceId: workspaceAId,
      clientCompanyId: company!.id,
      name: 'Export project',
      slug: projectSlug,
      projectType: 'website',
      status: 'in_progress',
      ownerUserId: ownerAId,
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-08-31',
    })
    .returning({ id: project.id });
  projectAId = createdProject!.id;
  const [membership] = await client.db
    .insert(projectMembership)
    .values({
      workspaceId: workspaceAId,
      projectId: projectAId,
      userId: clientAId,
      side: 'client',
      role: 'client',
      permissions: { version: 1, grants: [] },
    })
    .returning({ id: projectMembership.id });
  clientMembershipId = membership!.id;
  const contexts = await Promise.all([
    resolveTenantContext(client.db, ownerAId, `export-a-${suffix}`),
    resolveTenantContext(client.db, ownerBId, `export-b-${suffix}`),
    resolveTenantContext(client.db, clientAId, `export-a-${suffix}`),
  ]);
  if (!contexts[0] || !contexts[1] || !contexts[2]) throw new Error('tenant setup failed');
  [ownerA, ownerB, clientA] = contexts as [TenantContext, TenantContext, TenantContext];
});

afterAll(async () => {
  await client.db.delete(exportJob).where(eq(exportJob.workspaceId, workspaceAId));
  await client.db.delete(workspace).where(eq(workspace.id, workspaceAId));
  await client.db.delete(workspace).where(eq(workspace.id, workspaceBId));
  await client.db
    .delete(user)
    .where(and(eq(user.id, ownerAId), eq(user.email, `export-owner-a-${suffix}@example.test`)));
  await client.db.delete(user).where(eq(user.id, ownerBId));
  await client.db.delete(user).where(eq(user.id, clientAId));
  await client.pool.end();
});

describe('Milestone 10 project exports', () => {
  it('is idempotent and fixes the actor-safe audience at request time', async () => {
    const key = crypto.randomUUID();
    const first = await requestProjectExport(client, ownerA, projectSlug, key);
    const repeated = await requestProjectExport(client, ownerA, projectSlug, key);
    const clientJob = await requestProjectExport(client, clientA, projectSlug, crypto.randomUUID());

    expect(first.id).toBe(repeated.id);
    expect(first.audience).toBe('internal');
    expect(clientJob.audience).toBe('client');
    expect((await listProjectExports(client, clientA, projectSlug)).map((item) => item.id)).toEqual(
      [clientJob.id],
    );
  });

  it('requires tenant, requester and current project access for an artifact', async () => {
    const job = await requestProjectExport(client, ownerA, projectSlug, crypto.randomUUID());
    await client.db
      .update(exportJob)
      .set({
        status: 'succeeded',
        artifactStorageKey: `exports/${workspaceAId}/${projectAId}/${job.id}.tar.gz`,
        artifactSha256: 'a'.repeat(64),
        artifactSize: 128,
        attachmentCount: 0,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(exportJob.id, job.id));

    await expect(
      getProjectExportArtifact(client, ownerA, projectSlug, job.id),
    ).resolves.toMatchObject({
      exportId: job.id,
      checksum: 'a'.repeat(64),
    });
    await expect(
      getProjectExportArtifact(client, ownerB, projectSlug, job.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      getProjectExportArtifact(client, clientA, projectSlug, job.id),
    ).rejects.toMatchObject({ code: 'NOT_READY' });

    await client.db
      .update(projectMembership)
      .set({ removedAt: new Date() })
      .where(eq(projectMembership.id, clientMembershipId));
    await expect(listProjectExports(client, clientA, projectSlug)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
