import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  acceptInvitation,
  createAuth,
  createInvitation,
  createInvitationSessionResponse,
  decryptOutboxSecret,
  revokeInvitation,
} from '@garun/auth';
import type { InvitationError } from '@garun/auth';
import {
  can,
  createOneTimeToken,
  hashOneTimeToken,
  resolveTenantContext,
  scopeToTenant,
  type TenantContext,
} from '@garun/core/identity';
import { createDatabaseClient } from '@garun/db';
import {
  auditEvent,
  invitation,
  outboxEvent,
  session,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const client = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);
const ownerEmail = `owner-${suffix}@example.test`;
const memberEmail = `member-${suffix}@example.test`;
const encryptionKey = Buffer.alloc(32, 4).toString('base64');
const authEnvironment = {
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
  BETTER_AUTH_SECRET: 'integration-test-secret-at-least-32-characters',
  AUTH_COOKIE_PREFIX: `garun-test-${suffix}`,
  INVITATION_TTL_HOURS: 72,
  MAGIC_LINK_TTL_SECONDS: 900,
  OUTBOX_ENCRYPTION_KEY: encryptionKey,
};

let ownerId = '';
let workspaceAId = '';
let workspaceBId = '';
let ownerTenant: TenantContext;

beforeAll(async () => {
  const auth = createAuth(client.db, authEnvironment, true);
  await auth.api.signUpEmail({
    body: { email: ownerEmail, name: 'Owner', password: 'IntegrationPassword-2026!' },
  });
  const [owner] = await client.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, ownerEmail));
  if (!owner) throw new Error('owner setup failed');
  ownerId = owner.id;
  await client.db
    .update(user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, ownerId));
  [workspaceAId, workspaceBId] = await client.db.transaction(async (tx) => {
    const spaces = await tx
      .insert(workspace)
      .values([
        { name: 'A', slug: `a-${suffix}`, ownerId },
        { name: 'B', slug: `b-${suffix}`, ownerId },
      ])
      .returning({ id: workspace.id });
    if (!spaces[0] || !spaces[1]) throw new Error('workspace setup failed');
    await tx
      .insert(workspaceMembership)
      .values({ workspaceId: spaces[0].id, userId: ownerId, role: 'owner' });
    return [spaces[0].id, spaces[1].id];
  });
  const resolved = await resolveTenantContext(client.db, ownerId, `a-${suffix}`);
  if (!resolved) throw new Error('tenant setup failed');
  ownerTenant = resolved;
});

afterAll(async () => {
  await client.db.delete(workspace).where(inArray(workspace.id, [workspaceAId, workspaceBId]));
  await client.db.delete(user).where(eq(user.email, ownerEmail));
  await client.db.delete(user).where(eq(user.email, memberEmail));
  await client.pool.end();
});

describe('identity and tenant isolation', () => {
  it('keeps a trusted bootstrap owner credential after magic-link login', async () => {
    let magicLinkUrl = '';
    const auth = createAuth(client.db, authEnvironment, false, async ({ url }) => {
      magicLinkUrl = url;
    });
    await auth.api.signInMagicLink({
      body: {
        email: ownerEmail,
        callbackURL: `/workspace/a-${suffix}`,
        errorCallbackURL: '/login?error=link',
      },
      headers: new Headers({ origin: authEnvironment.PUBLIC_APP_URL }),
    });
    expect(magicLinkUrl).not.toBe('');
    const magicLinkResponse = await auth.handler(
      new Request(magicLinkUrl, {
        headers: new Headers({ origin: authEnvironment.PUBLIC_APP_URL }),
      }),
    );
    expect(magicLinkResponse.status).toBeGreaterThanOrEqual(300);
    expect(magicLinkResponse.status).toBeLessThan(400);

    const passwordResponse = await auth.api.signInEmail({
      body: { email: ownerEmail, password: 'IntegrationPassword-2026!' },
      headers: new Headers({ origin: authEnvironment.PUBLIC_APP_URL }),
      asResponse: true,
    });
    expect(passwordResponse.ok).toBe(true);
  });

  it('persists and revokes a database-backed session', async () => {
    const auth = createAuth(client.db, authEnvironment);
    const response = await auth.api.signInEmail({
      body: { email: ownerEmail, password: 'IntegrationPassword-2026!' },
      headers: new Headers({ origin: authEnvironment.PUBLIC_APP_URL }),
      asResponse: true,
    });
    expect(response.ok).toBe(true);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const persisted = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(persisted?.user.id).toBe(ownerId);
    if (!persisted) throw new Error('session missing');
    await client.db.delete(session).where(eq(session.id, persisted.session.id));
    await expect(auth.api.getSession({ headers: new Headers({ cookie }) })).resolves.toBeNull();
  });

  it('denies cross-tenant, IDOR and owner-only actions by default', async () => {
    expect(await resolveTenantContext(client.db, ownerId, `b-${suffix}`)).toBeNull();
    expect(scopeToTenant(ownerTenant, { workspaceId: workspaceBId, value: 'spoofed' })).toBeNull();
    expect(can({ ...ownerTenant, role: 'member' }, 'members.invite')).toBe(false);
    expect(can({ ...ownerTenant, membershipStatus: 'disabled' }, 'workspace.view')).toBe(false);
    await client.db
      .update(workspaceMembership)
      .set({ status: 'disabled' })
      .where(
        and(
          eq(workspaceMembership.workspaceId, workspaceAId),
          eq(workspaceMembership.userId, ownerId),
        ),
      );
    expect(
      can(await resolveTenantContext(client.db, ownerId, `a-${suffix}`), 'workspace.view'),
    ).toBe(false);
    await client.db
      .update(workspaceMembership)
      .set({ status: 'active' })
      .where(
        and(
          eq(workspaceMembership.workspaceId, workspaceAId),
          eq(workspaceMembership.userId, ownerId),
        ),
      );
  });

  it('accepts an invitation atomically and cannot consume it twice', async () => {
    const created = await createInvitation(
      client,
      ownerTenant,
      { email: memberEmail, appUrl: authEnvironment.PUBLIC_APP_URL, encryptionKey, ttlHours: 72 },
      { requestId: 'integration-request' },
    );
    const [queued] = await client.db
      .select()
      .from(outboxEvent)
      .where(
        and(
          eq(outboxEvent.aggregateId, created.id),
          eq(outboxEvent.eventType, 'invitation.email.requested'),
        ),
      );
    expect(queued?.payload).toEqual({ template: 'workspace-invitation', invitationId: created.id });
    expect(JSON.stringify(queued?.payload)).not.toContain('/invite/');
    if (!queued?.encryptedSecret) throw new Error('encrypted invitation missing');
    const link = decryptOutboxSecret(queued.encryptedSecret, encryptionKey);
    const token = new URL(link).pathname.split('/').at(-1);
    if (!token) throw new Error('token missing');
    const [stored] = await client.db
      .select({ hash: invitation.tokenHash })
      .from(invitation)
      .where(eq(invitation.id, created.id));
    expect(stored?.hash).not.toBe(token);
    const accepted = await acceptInvitation(client, token, { requestId: 'integration-accept' });
    const [membership] = await client.db
      .select()
      .from(workspaceMembership)
      .where(
        and(
          eq(workspaceMembership.workspaceId, workspaceAId),
          eq(workspaceMembership.userId, accepted.userId),
        ),
      );
    expect(membership?.role).toBe('member');
    const sessionResponse = await createInvitationSessionResponse(client.db, authEnvironment, {
      email: memberEmail,
      callbackURL: `/workspace/a-${suffix}`,
      headers: new Headers({ origin: authEnvironment.PUBLIC_APP_URL }),
    });
    expect(sessionResponse.status).toBeGreaterThanOrEqual(300);
    expect(sessionResponse.status).toBeLessThan(400);
    expect(sessionResponse.headers.get('location')).toContain(`/workspace/a-${suffix}`);
    const cookie = sessionResponse.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const memberSession = await createAuth(client.db, authEnvironment).api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(memberSession?.user.id).toBe(accepted.userId);
    const rejection: Partial<InvitationError> = { code: 'INVITATION_INVALID' };
    await expect(acceptInvitation(client, token)).rejects.toMatchObject(rejection);
    const events = await client.db
      .select({ action: auditEvent.action })
      .from(auditEvent)
      .where(eq(auditEvent.entityId, created.id));
    expect(events.map((event) => event.action)).toContain('invitation.created');
    expect(events.map((event) => event.action)).toContain('invitation.accepted');
  });

  it('rejects revoked and expired invitation tokens', async () => {
    const created = await createInvitation(client, ownerTenant, {
      email: `revoked-${suffix}@example.test`,
      appUrl: authEnvironment.PUBLIC_APP_URL,
      encryptionKey,
      ttlHours: 72,
    });
    const [queued] = await client.db
      .select({ secret: outboxEvent.encryptedSecret })
      .from(outboxEvent)
      .where(eq(outboxEvent.aggregateId, created.id));
    if (!queued?.secret) throw new Error('revoked token fixture missing');
    const revokedToken = new URL(decryptOutboxSecret(queued.secret, encryptionKey)).pathname
      .split('/')
      .at(-1);
    if (!revokedToken) throw new Error('revoked token missing');
    await revokeInvitation(client, ownerTenant, created.id);
    await expect(acceptInvitation(client, revokedToken)).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
    });

    const expiredToken = createOneTimeToken();
    await client.db.insert(invitation).values({
      workspaceId: workspaceAId,
      email: `expired-${suffix}@example.test`,
      tokenHash: hashOneTimeToken(expiredToken),
      expiresAt: new Date(Date.now() - 1_000),
      invitedById: ownerId,
    });
    await expect(acceptInvitation(client, expiredToken)).rejects.toMatchObject({
      code: 'INVITATION_EXPIRED',
    });
  });
});
