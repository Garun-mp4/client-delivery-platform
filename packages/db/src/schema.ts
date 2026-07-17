import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
  check,
  date,
  foreignKey,
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
export const clientCompanyStatus = pgEnum('client_company_status', ['active', 'archived']);
export const clientMembershipRole = pgEnum('client_membership_role', ['primary', 'member']);
export const projectStatus = pgEnum('project_status', [
  'draft',
  'onboarding',
  'in_progress',
  'waiting_for_client',
  'review',
  'paused',
  'completed',
  'maintenance',
  'archived',
]);
export const projectType = pgEnum('project_type', [
  'website',
  'landing',
  'ecommerce',
  'redesign',
  'other',
]);
export const projectMembershipSide = pgEnum('project_membership_side', ['internal', 'client']);
export const projectMembershipRole = pgEnum('project_membership_role', [
  'owner',
  'employee',
  'client',
  'observer',
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
    uniqueIndex('invitation_id_workspace_unique').on(table.id, table.workspaceId),
    uniqueIndex('invitation_active_workspace_email_unique')
      .on(table.workspaceId, table.email)
      .where(sql`${table.status} = 'pending'`),
    index('invitation_workspace_status_idx').on(table.workspaceId, table.status),
    index('invitation_email_idx').on(table.email),
  ],
);

export const clientCompany = pgTable(
  'client_company',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    website: text('website'),
    phone: text('phone'),
    email: text('email'),
    messenger: text('messenger'),
    internalNotes: text('internal_notes'),
    status: clientCompanyStatus('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('client_company_id_workspace_unique').on(table.id, table.workspaceId),
    index('client_company_workspace_status_idx').on(table.workspaceId, table.status),
    index('client_company_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
  ],
);

export const clientMembership = pgTable(
  'client_membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    clientCompanyId: uuid('client_company_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: clientMembershipRole('role').notNull().default('member'),
    canApprove: boolean('can_approve').notNull().default(false),
    canManageMembers: boolean('can_manage_members').notNull().default(false),
    removedAt: timestamp('removed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientCompanyId, table.workspaceId],
      foreignColumns: [clientCompany.id, clientCompany.workspaceId],
      name: 'client_membership_company_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'client_membership_workspace_user_fk',
    }).onDelete('cascade'),
    uniqueIndex('client_membership_company_user_unique').on(table.clientCompanyId, table.userId),
    index('client_membership_workspace_user_idx').on(table.workspaceId, table.userId),
  ],
);

export const project = pgTable(
  'project',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    clientCompanyId: uuid('client_company_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    projectType: projectType('project_type').notNull(),
    status: projectStatus('status').notNull().default('draft'),
    statusBeforeArchive: projectStatus('status_before_archive'),
    ownerUserId: uuid('owner_user_id').notNull(),
    plannedStartDate: date('planned_start_date', { mode: 'string' }).notNull(),
    plannedEndDate: date('planned_end_date', { mode: 'string' }).notNull(),
    clientAccessMode: text('client_access_mode').notNull().default('explicit_grants'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientCompanyId, table.workspaceId],
      foreignColumns: [clientCompany.id, clientCompany.workspaceId],
      name: 'project_company_workspace_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.ownerUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'project_owner_workspace_membership_fk',
    }).onDelete('restrict'),
    uniqueIndex('project_workspace_slug_unique').on(table.workspaceId, table.slug),
    uniqueIndex('project_id_workspace_unique').on(table.id, table.workspaceId),
    index('project_workspace_status_idx').on(table.workspaceId, table.status),
    index('project_company_status_idx').on(table.clientCompanyId, table.status),
    check('project_planned_dates_check', sql`${table.plannedEndDate} >= ${table.plannedStartDate}`),
    check(
      'project_archive_state_check',
      sql`(${table.status} = 'archived' AND ${table.statusBeforeArchive} IS NOT NULL AND ${table.statusBeforeArchive} <> 'archived') OR (${table.status} <> 'archived' AND ${table.statusBeforeArchive} IS NULL)`,
    ),
  ],
);

export const projectMembership = pgTable(
  'project_membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id').notNull(),
    side: projectMembershipSide('side').notNull(),
    role: projectMembershipRole('role').notNull(),
    permissions: jsonb('permissions')
      .$type<{ version: 1; grants: string[] }>()
      .notNull()
      .default({ version: 1, grants: [] }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'project_membership_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'project_membership_workspace_user_fk',
    }).onDelete('cascade'),
    uniqueIndex('project_membership_project_user_unique').on(table.projectId, table.userId),
    index('project_membership_workspace_user_idx').on(table.workspaceId, table.userId),
    check(
      'project_membership_side_role_check',
      sql`(${table.side} = 'internal' AND ${table.role} IN ('owner', 'employee')) OR (${table.side} = 'client' AND ${table.role} IN ('client', 'observer'))`,
    ),
  ],
);

export const clientInvitationContext = pgTable(
  'client_invitation_context',
  {
    invitationId: uuid('invitation_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    clientCompanyId: uuid('client_company_id').notNull(),
    role: clientMembershipRole('role').notNull().default('member'),
    canApprove: boolean('can_approve').notNull().default(false),
    canManageMembers: boolean('can_manage_members').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.invitationId, table.workspaceId],
      foreignColumns: [invitation.id, invitation.workspaceId],
      name: 'client_invitation_invitation_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientCompanyId, table.workspaceId],
      foreignColumns: [clientCompany.id, clientCompany.workspaceId],
      name: 'client_invitation_company_workspace_fk',
    }).onDelete('cascade'),
    index('client_invitation_workspace_company_idx').on(table.workspaceId, table.clientCompanyId),
  ],
);

export const invitationProjectGrant = pgTable(
  'invitation_project_grant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invitationId: uuid('invitation_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    role: projectMembershipRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.invitationId, table.workspaceId],
      foreignColumns: [invitation.id, invitation.workspaceId],
      name: 'invitation_project_grant_invitation_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'invitation_project_grant_project_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('invitation_project_grant_invitation_project_unique').on(
      table.invitationId,
      table.projectId,
    ),
    index('invitation_project_grant_project_idx').on(table.projectId),
    check('invitation_project_grant_role_check', sql`${table.role} IN ('client', 'observer')`),
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
  readonly template: 'workspace-invitation' | 'project-invitation' | 'magic-link';
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
