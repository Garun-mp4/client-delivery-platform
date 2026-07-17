import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  acceptInvitation,
  createAuth,
  createClientProjectInvitation,
  decryptOutboxSecret,
} from '@garun/auth';
import { resolveTenantContext, type TenantContext } from '@garun/core/identity';
import {
  canAccessProject,
  createClientCompany,
  createProject,
  getClientProject,
  getInternalClientCompany,
  publishProject,
  removeProjectMember,
  resolveProjectAccess,
  setProjectArchived,
} from '@garun/core/projects';
import { createDatabaseClient } from '@garun/db';
import {
  auditEvent,
  clientMembership,
  invitation,
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
const ownerAEmail = `project-owner-a-${suffix}@example.test`;
const ownerBEmail = `project-owner-b-${suffix}@example.test`;
const clientEmail = `project-client-${suffix}@example.test`;
const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const environment = {
  APP_ENV: 'test' as const,
  APP_NAME: 'Garun Workspace Test',
  PUBLIC_APP_URL: 'http://localhost:3000',
  LOG_LEVEL: 'silent' as const,
  FILE_MAX_BYTES: 104_857_600,
  WORKSPACE_QUOTA_BYTES: 10_737_418_240,
  DELETED_FILE_GRACE_DAYS: 30,
  TECHNICAL_LOG_RETENTION_DAYS: 90,
  DATABASE_URL: databaseUrl,
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'project-integration-secret-at-least-32-characters',
  AUTH_COOKIE_PREFIX: `garun-project-test-${suffix}`,
  INVITATION_TTL_HOURS: 72,
  MAGIC_LINK_TTL_SECONDS: 900,
  OUTBOX_ENCRYPTION_KEY: encryptionKey,
};

let ownerAId = '';
let ownerBId = '';
let workspaceAId = '';
let workspaceBId = '';
let tenantA: TenantContext;
let tenantB: TenantContext;
let companyAId = '';
let companyBId = '';
let projectAId = '';
let clientUserId = '';

async function createIdentity(email: string, name: string) {
  const auth = createAuth(client.db, environment, true);
  await auth.api.signUpEmail({
    body: { email, name, password: 'ProjectIntegration-2026!' },
  });
  const [identity] = await client.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (!identity) throw new Error('identity setup failed');
  return identity.id;
}

async function invitationToken(invitationId: string) {
  const [event] = await client.db
    .select({ secret: outboxEvent.encryptedSecret })
    .from(outboxEvent)
    .where(
      and(
        eq(outboxEvent.aggregateId, invitationId),
        eq(outboxEvent.eventType, 'project_invitation.email.requested'),
      ),
    );
  if (!event?.secret) throw new Error('project invitation token missing');
  const token = new URL(decryptOutboxSecret(event.secret, encryptionKey)).pathname
    .split('/')
    .at(-1);
  if (!token) throw new Error('project invitation token malformed');
  return token;
}

beforeAll(async () => {
  [ownerAId, ownerBId] = await Promise.all([
    createIdentity(ownerAEmail, 'Owner A'),
    createIdentity(ownerBEmail, 'Owner B'),
  ]);
  const spaces = await client.db
    .insert(workspace)
    .values([
      { name: 'Project Workspace A', slug: `project-a-${suffix}`, ownerId: ownerAId },
      { name: 'Project Workspace B', slug: `project-b-${suffix}`, ownerId: ownerBId },
    ])
    .returning({ id: workspace.id, slug: workspace.slug, ownerId: workspace.ownerId });
  const spaceA = spaces.find((space) => space.ownerId === ownerAId);
  const spaceB = spaces.find((space) => space.ownerId === ownerBId);
  if (!spaceA || !spaceB) throw new Error('workspace setup failed');
  workspaceAId = spaceA.id;
  workspaceBId = spaceB.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId: workspaceAId, userId: ownerAId, role: 'owner' },
    { workspaceId: workspaceBId, userId: ownerBId, role: 'owner' },
  ]);
  const [resolvedA, resolvedB] = await Promise.all([
    resolveTenantContext(client.db, ownerAId, spaceA.slug),
    resolveTenantContext(client.db, ownerBId, spaceB.slug),
  ]);
  if (!resolvedA || !resolvedB) throw new Error('tenant setup failed');
  tenantA = resolvedA;
  tenantB = resolvedB;

  const [companyA, companyB] = await Promise.all([
    createClientCompany(client, tenantA, {
      name: 'Клиент A',
      legalName: null,
      website: 'https://client-a.example/',
      phone: null,
      email: null,
      messenger: null,
      internalNotes: 'Секретная внутренняя заметка A',
    }),
    createClientCompany(client, tenantB, {
      name: 'Клиент B',
      legalName: null,
      website: null,
      phone: null,
      email: null,
      messenger: null,
      internalNotes: 'Секретная внутренняя заметка B',
    }),
  ]);
  companyAId = companyA.id;
  companyBId = companyB.id;
  const [createdA] = await Promise.all([
    createProject(client, tenantA, {
      clientCompanyId: companyAId,
      name: 'Проект A',
      slug: `site-a-${suffix}`,
      description: 'Клиентское описание A',
      projectType: 'website',
      ownerUserId: ownerAId,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-09-15',
    }),
    createProject(client, tenantB, {
      clientCompanyId: companyBId,
      name: 'Проект B',
      slug: `site-b-${suffix}`,
      description: null,
      projectType: 'landing',
      ownerUserId: ownerBId,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-31',
    }),
  ]);
  projectAId = createdA.id;
});

afterAll(async () => {
  await client.db.delete(workspace).where(inArray(workspace.id, [workspaceAId, workspaceBId]));
  await client.db.delete(user).where(inArray(user.email, [ownerAEmail, ownerBEmail, clientEmail]));
  await client.pool.end();
});

describe('clients, projects and explicit access grants', () => {
  it('scopes client companies and projects to their server tenant', async () => {
    expect(await getInternalClientCompany(client.db, tenantA, companyBId)).toBeNull();
    expect(await resolveProjectAccess(client.db, tenantA, `site-b-${suffix}`)).toBeNull();
    await expect(
      createProject(client, tenantA, {
        clientCompanyId: companyBId,
        name: 'Подмена tenant',
        slug: `idor-${suffix}`,
        description: null,
        projectType: 'other',
        ownerUserId: ownerAId,
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-08-02',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps a draft invisible, then atomically applies company and project grants', async () => {
    const ownerAccess = await resolveProjectAccess(client.db, tenantA, `site-a-${suffix}`);
    expect(canAccessProject(ownerAccess, 'project.publish')).toBe(true);
    await expect(
      createClientProjectInvitation(client, tenantA, {
        email: clientEmail,
        projectSlug: `site-a-${suffix}`,
        projectRole: 'client',
        companyRole: 'primary',
        canApprove: false,
        appUrl: environment.PUBLIC_APP_URL,
        encryptionKey,
        ttlHours: 72,
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });

    await publishProject(client, tenantA, `site-a-${suffix}`, { requestId: 'publish-project-a' });
    const createdInvite = await createClientProjectInvitation(
      client,
      tenantA,
      {
        email: clientEmail,
        projectSlug: `site-a-${suffix}`,
        projectRole: 'client',
        companyRole: 'primary',
        canApprove: false,
        appUrl: environment.PUBLIC_APP_URL,
        encryptionKey,
        ttlHours: 72,
      },
      { requestId: 'invite-client-a' },
    );
    const accepted = await acceptInvitation(client, await invitationToken(createdInvite.id), {
      requestId: 'accept-client-a',
    });
    clientUserId = accepted.userId;
    expect(accepted.projectSlug).toBe(`site-a-${suffix}`);
    const [companyGrant, projectGrant] = await Promise.all([
      client.db
        .select({ role: clientMembership.role })
        .from(clientMembership)
        .where(
          and(
            eq(clientMembership.clientCompanyId, companyAId),
            eq(clientMembership.userId, clientUserId),
          ),
        ),
      client.db
        .select({ side: projectMembership.side, role: projectMembership.role })
        .from(projectMembership)
        .where(
          and(
            eq(projectMembership.projectId, projectAId),
            eq(projectMembership.userId, clientUserId),
          ),
        ),
    ]);
    expect(companyGrant[0]?.role).toBe('primary');
    expect(projectGrant[0]).toEqual({ side: 'client', role: 'client' });
  });

  it('returns an allowlisted client DTO and denies other projects and tenants', async () => {
    const clientTenant = await resolveTenantContext(client.db, clientUserId, `project-a-${suffix}`);
    if (!clientTenant) throw new Error('client tenant missing');
    const dto = await getClientProject(client.db, clientTenant, `site-a-${suffix}`);
    expect(dto?.name).toBe('Проект A');
    expect(JSON.stringify(dto)).not.toContain('Секретная внутренняя заметка');
    expect(dto).not.toHaveProperty('workspaceId');
    expect(await resolveProjectAccess(client.db, clientTenant, `site-b-${suffix}`)).toBeNull();

    const second = await createProject(client, tenantA, {
      clientCompanyId: companyAId,
      name: 'Закрытый проект той же компании',
      slug: `private-a-${suffix}`,
      description: null,
      projectType: 'redesign',
      ownerUserId: ownerAId,
      plannedStartDate: '2026-10-01',
      plannedEndDate: '2026-11-01',
    });
    await publishProject(client, tenantA, second.slug);
    expect(await resolveProjectAccess(client.db, clientTenant, second.slug)).toBeNull();
  });

  it('does not duplicate memberships when the same user is invited again', async () => {
    const repeated = await createClientProjectInvitation(client, tenantA, {
      email: clientEmail,
      projectSlug: `site-a-${suffix}`,
      projectRole: 'client',
      companyRole: 'primary',
      canApprove: false,
      appUrl: environment.PUBLIC_APP_URL,
      encryptionKey,
      ttlHours: 72,
    });
    await acceptInvitation(client, await invitationToken(repeated.id));
    const [companyRows, projectRows] = await Promise.all([
      client.db
        .select({ id: clientMembership.id })
        .from(clientMembership)
        .where(
          and(
            eq(clientMembership.clientCompanyId, companyAId),
            eq(clientMembership.userId, clientUserId),
          ),
        ),
      client.db
        .select({ id: projectMembership.id })
        .from(projectMembership)
        .where(
          and(
            eq(projectMembership.projectId, projectAId),
            eq(projectMembership.userId, clientUserId),
          ),
        ),
    ]);
    expect(companyRows).toHaveLength(1);
    expect(projectRows).toHaveLength(1);
  });

  it('revokes project access immediately and keeps removal tenant scoped', async () => {
    const [membership] = await client.db
      .select({ id: projectMembership.id })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.projectId, projectAId),
          eq(projectMembership.userId, clientUserId),
        ),
      );
    if (!membership) throw new Error('project membership missing');
    await expect(
      removeProjectMember(client, tenantB, `site-b-${suffix}`, membership.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await removeProjectMember(client, tenantA, `site-a-${suffix}`, membership.id, {
      requestId: 'remove-project-client',
    });
    const clientTenant = await resolveTenantContext(client.db, clientUserId, `project-a-${suffix}`);
    if (!clientTenant) throw new Error('client tenant missing');
    expect(await resolveProjectAccess(client.db, clientTenant, `site-a-${suffix}`)).toBeNull();
    const [event] = await client.db
      .select({ requestId: auditEvent.requestId })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.entityId, membership.id),
          eq(auditEvent.action, 'project_membership.removed'),
        ),
      );
    expect(event?.requestId).toBe('remove-project-client');
  });

  it('makes archived projects read-only and restores their prior status with audit events', async () => {
    await setProjectArchived(client, tenantA, `site-a-${suffix}`, true, {
      requestId: 'archive-project-a',
    });
    const archived = await resolveProjectAccess(client.db, tenantA, `site-a-${suffix}`);
    expect(canAccessProject(archived, 'project.view.internal')).toBe(true);
    expect(canAccessProject(archived, 'project.edit')).toBe(false);
    await setProjectArchived(client, tenantA, `site-a-${suffix}`, false, {
      requestId: 'restore-project-a',
    });
    const [restored] = await client.db
      .select({ status: project.status, previous: project.statusBeforeArchive })
      .from(project)
      .where(eq(project.id, projectAId));
    expect(restored).toEqual({ status: 'onboarding', previous: null });
    const events = await client.db
      .select({ action: auditEvent.action })
      .from(auditEvent)
      .where(eq(auditEvent.entityId, projectAId));
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'project.created',
        'project.published',
        'project.archived',
        'project.restored',
      ]),
    );
  });

  it('stores no raw invitation token in invitation or outbox payload', async () => {
    const [latest] = await client.db
      .select({ id: invitation.id, tokenHash: invitation.tokenHash })
      .from(invitation)
      .where(eq(invitation.email, clientEmail));
    const [event] = await client.db
      .select({ payload: outboxEvent.payload })
      .from(outboxEvent)
      .where(eq(outboxEvent.aggregateId, latest!.id));
    expect(event?.payload.template).toBe('project-invitation');
    expect(JSON.stringify(event?.payload)).not.toContain('/invite/');
    expect(latest?.tokenHash).not.toContain('http');
  });
});
