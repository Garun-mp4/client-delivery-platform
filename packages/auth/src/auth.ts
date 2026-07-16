import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { eq } from 'drizzle-orm';

import type { WebEnvironment } from '@garun/config';
import type { DatabaseClient } from '@garun/db';
import * as schema from '@garun/db/schema';
import { normalizeEmail } from '@garun/core/identity';

import { enqueueEmail } from './outbox';

export function createAuth(
  database: DatabaseClient['db'],
  environment: WebEnvironment,
  allowBootstrapSignup = false,
) {
  return betterAuth({
    appName: environment.APP_NAME,
    baseURL: environment.PUBLIC_APP_URL,
    secret: environment.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    disabledPaths: ['/sign-up/email', '/sign-in/email', '/sign-in/magic-link'],
    trustedOrigins: [environment.PUBLIC_APP_URL],
    emailAndPassword: { enabled: true, disableSignUp: !allowBootstrapSignup },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 60, storage: 'database' },
    advanced: {
      database: { generateId: 'uuid' },
      cookiePrefix: environment.AUTH_COOKIE_PREFIX,
      useSecureCookies: environment.APP_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: environment.APP_ENV === 'production',
      },
    },
    telemetry: { enabled: false },
    databaseHooks: {
      session: {
        create: {
          async after(createdSession, context) {
            await database.insert(schema.auditEvent).values({
              actorUserId: createdSession.userId,
              action: 'auth.login_succeeded',
              entityType: 'session',
              entityId: createdSession.id,
              requestId: context?.headers?.get('x-request-id') ?? undefined,
            });
          },
        },
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: environment.MAGIC_LINK_TTL_SECONDS,
        storeToken: 'hashed',
        rateLimit: { window: 60, max: 5 },
        async sendMagicLink({ email, url }) {
          const normalizedEmail = normalizeEmail(email);
          const [recipient] = await database
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(eq(schema.user.email, normalizedEmail))
            .limit(1);
          if (!recipient) return;
          await enqueueEmail(database, {
            workspaceId: null,
            eventType: 'auth.magic_link.requested',
            aggregateType: 'user',
            aggregateId: recipient.id,
            payload: { template: 'magic-link', recipientUserId: recipient.id },
            secret: url,
            encryptionKey: environment.OUTBOX_ENCRYPTION_KEY,
          });
        },
      }),
    ],
  });
}

export type GarunAuth = ReturnType<typeof createAuth>;
