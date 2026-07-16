import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

export const userStatus = pgEnum('user_status', ['active', 'disabled']);
export const workspaceStatus = pgEnum('workspace_status', ['active', 'suspended']);
export const membershipRole = pgEnum('membership_role', ['owner', 'member']);
export const membershipStatus = pgEnum('membership_status', ['active', 'disabled']);
export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);
export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'processing',
  'delivered',
  'failed',
]);

// Better Auth core model. Application code always writes a normalized lowercase email.
export const user = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    status: userStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (table) => [uniqueIndex('user_email_unique').on(table.email)],
);

export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('account_provider_account_unique').on(table.providerId, table.accountId),
    index('account_user_idx').on(table.userId),
  ],
);

export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    token: text('token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_user_idx').on(table.userId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const rateLimit = pgTable(
  'rate_limit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [uniqueIndex('rate_limit_key_unique').on(table.key)],
);

export const workspace = pgTable(
  'workspace',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    locale: text('locale').notNull().default('ru'),
    timezone: text('timezone').notNull().default('Europe/Moscow'),
    status: workspaceStatus('status').notNull().default('active'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    logoFileId: uuid('logo_file_id'),
    accentColor: text('accent_color'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('workspace_slug_unique').on(table.slug),
    index('workspace_owner_idx').on(table.ownerId),
  ],
);

export const workspaceMembership = pgTable(
  'workspace_membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    status: membershipStatus('status').notNull().default('active'),
    permissions: jsonb('permissions')
      .$type<{ version: 1; grants: string[] }>()
      .notNull()
      .default({ version: 1, grants: [] }),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('workspace_membership_workspace_user_unique').on(table.workspaceId, table.userId),
    index('workspace_membership_user_status_idx').on(table.userId, table.status),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: membershipRole('role').notNull().default('member'),
    tokenHash: text('token_hash').notNull(),
    status: invitationStatus('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    invitedById: uuid('invited_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    acceptedById: uuid('accepted_by_id').references(() => user.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('invitation_token_hash_unique').on(table.tokenHash),
    uniqueIndex('invitation_active_workspace_email_unique')
      .on(table.workspaceId, table.email)
      .where(sql`${table.status} = 'pending'`),
    index('invitation_workspace_status_idx').on(table.workspaceId, table.status),
    index('invitation_email_idx').on(table.email),
  ],
);

export interface AuditMetadata {
  readonly emailMask?: string;
  readonly reasonCode?: string;
  readonly source?: string;
  readonly targetUserId?: string;
}

export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspace.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').$type<AuditMetadata>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('audit_actor_created_idx').on(table.actorUserId, table.createdAt),
  ],
);

export interface OutboxPayload {
  readonly template: 'workspace-invitation' | 'magic-link';
  readonly recipientUserId?: string;
  readonly invitationId?: string;
}

export const outboxEvent = pgTable(
  'outbox_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspace.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').$type<OutboxPayload>().notNull(),
    encryptedSecret: text('encrypted_secret'),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    lastErrorCode: text('last_error_code'),
    ...timestamps,
  },
  (table) => [
    index('outbox_dispatch_idx').on(table.status, table.availableAt),
    index('outbox_workspace_created_idx').on(table.workspaceId, table.createdAt),
  ],
);

export const systemMetadata = pgTable('system_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
