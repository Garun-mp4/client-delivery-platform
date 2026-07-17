import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';

import { normalizeEmail } from '@garun/core/identity';
import { parseWebEnv } from '@garun/config';
import { account, auditEvent, user, workspace, workspaceMembership } from '@garun/db/schema';
import { createDatabaseClient } from '@garun/db';

import { createAuth } from './auth';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required variable: ${name}`);
  return value;
}

const email = normalizeEmail(required('BOOTSTRAP_OWNER_EMAIL'));
const name = required('BOOTSTRAP_OWNER_NAME');
const password = required('BOOTSTRAP_OWNER_PASSWORD');
const workspaceName = required('BOOTSTRAP_WORKSPACE_NAME');
const workspaceSlug = required('BOOTSTRAP_WORKSPACE_SLUG').toLowerCase();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceSlug))
  throw new Error('BOOTSTRAP_WORKSPACE_SLUG is invalid');
if (password.length < 12)
  throw new Error('BOOTSTRAP_OWNER_PASSWORD must contain at least 12 characters');

const environment = parseWebEnv();
const client = createDatabaseClient(environment.DATABASE_URL);

try {
  let [owner] = await client.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!owner) {
    const bootstrapAuth = createAuth(client.db, environment, true);
    await bootstrapAuth.api.signUpEmail({ body: { email, name, password } });
    [owner] = await client.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
  }
  if (!owner) throw new Error('BOOTSTRAP_USER_FAILED');

  const passwordHash = await hashPassword(password);
  await client.db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, owner.id));
    const [credential] = await tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, owner.id), eq(account.providerId, 'credential')))
      .limit(1);
    if (!credential) {
      await tx.insert(account).values({
        accountId: owner.id,
        providerId: 'credential',
        userId: owner.id,
        password: passwordHash,
      });
    }
  });

  const result = await client.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: workspace.id, ownerId: workspace.ownerId })
      .from(workspace)
      .where(eq(workspace.slug, workspaceSlug))
      .limit(1);
    if (existing) {
      if (existing.ownerId !== owner.id) throw new Error('BOOTSTRAP_SLUG_CONFLICT');
      return { workspaceId: existing.id, created: false };
    }
    const [created] = await tx
      .insert(workspace)
      .values({ name: workspaceName, slug: workspaceSlug, ownerId: owner.id })
      .returning({ id: workspace.id });
    if (!created) throw new Error('BOOTSTRAP_WORKSPACE_FAILED');
    const [membership] = await tx
      .insert(workspaceMembership)
      .values({ workspaceId: created.id, userId: owner.id, role: 'owner' })
      .returning({ id: workspaceMembership.id });
    if (!membership) throw new Error('BOOTSTRAP_MEMBERSHIP_FAILED');
    await tx.insert(auditEvent).values({
      workspaceId: created.id,
      actorUserId: owner.id,
      action: 'workspace.owner_bootstrapped',
      entityType: 'workspace',
      entityId: created.id,
      metadata: { source: 'cli' },
    });
    return { workspaceId: created.id, created: true };
  });
  process.stdout.write(
    result.created
      ? 'Owner workspace created successfully.\n'
      : 'Owner workspace already exists; no changes made.\n',
  );
} finally {
  await client.pool.end();
}
