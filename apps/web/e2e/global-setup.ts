import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { eq } from 'drizzle-orm';

import { createAuth } from '@garun/auth';
import { parseWebEnv } from '@garun/config';
import { createDatabaseClient } from '@garun/db';
import { auditEvent, user, workspace, workspaceMembership } from '@garun/db/schema';

export default async function globalSetup() {
  if (existsSync('.env')) loadEnvFile('.env');
  const environment = parseWebEnv();
  const database = createDatabaseClient(environment.DATABASE_URL);
  const email = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const password = process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!';
  try {
    let [owner] = await database.db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!owner) {
      const bootstrapAuth = createAuth(database.db, environment, true);
      await bootstrapAuth.api.signUpEmail({ body: { email, name: 'E2E владелец', password } });
      [owner] = await database.db.select({ id: user.id }).from(user).where(eq(user.email, email));
    }
    if (!owner) throw new Error('E2E owner bootstrap failed');
    const [existing] = await database.db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.slug, 'e2e-studio'));
    if (!existing) {
      await database.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(workspace)
          .values({ name: 'E2E студия', slug: 'e2e-studio', ownerId: owner.id })
          .returning({ id: workspace.id });
        if (!created) throw new Error('E2E workspace bootstrap failed');
        await tx
          .insert(workspaceMembership)
          .values({ workspaceId: created.id, userId: owner.id, role: 'owner' });
        await tx.insert(auditEvent).values({
          workspaceId: created.id,
          actorUserId: owner.id,
          action: 'workspace.owner_bootstrapped',
          entityType: 'workspace',
          entityId: created.id,
          metadata: { source: 'e2e' },
        });
      });
    }
  } finally {
    await database.pool.end();
  }
  const mailpit = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';
  await fetch(`${mailpit}/api/v1/messages`, { method: 'DELETE' });
}
