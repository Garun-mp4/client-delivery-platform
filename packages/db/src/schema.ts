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
export const scopeRevisionStatus = pgEnum('scope_revision_status', [
  'draft',
  'client_review',
  'agreed',
  'superseded',
]);
export const scopeDecisionType = pgEnum('scope_decision_type', ['agreed', 'changes_requested']);
export const projectStageStatus = pgEnum('project_stage_status', [
  'not_started',
  'in_progress',
  'waiting_for_client',
  'ready_for_review',
  'changes_requested',
  'approved',
  'skipped',
]);
export const actionItemType = pgEnum('action_item_type', [
  'upload_material',
  'answer_question',
  'review_version',
  'approve_stage',
  'make_payment',
  'fix_feedback',
  'internal',
  'other',
]);
export const actionItemStatus = pgEnum('action_item_status', [
  'open',
  'in_progress',
  'done',
  'cancelled',
]);
export const actionItemPriority = pgEnum('action_item_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);
export const actionItemVisibility = pgEnum('action_item_visibility', ['internal', 'client']);
export const questionnaireStatus = pgEnum('questionnaire_status', [
  'open',
  'submitted',
  'completed',
  'cancelled',
]);
export const questionnaireSubmissionStatus = pgEnum('questionnaire_submission_status', [
  'submitted',
  'clarification_requested',
  'accepted',
]);
export const materialType = pgEnum('material_type', [
  'text',
  'contact',
  'link',
  'file',
  'image',
  'video',
  'logo',
  'document',
  'details',
  'service',
  'testimonial',
  'employee',
  'legal_text',
  'other',
]);
export const materialStatus = pgEnum('material_status', [
  'requested',
  'uploaded',
  'clarification',
  'accepted',
  'replaced',
  'not_required',
]);
export const materialRevisionStatus = pgEnum('material_revision_status', [
  'uploading',
  'pending_scan',
  'submitted',
  'clarification_requested',
  'accepted',
  'replaced',
  'rejected',
]);
export const fileUploadStatus = pgEnum('file_upload_status', [
  'initiated',
  'uploaded',
  'scanning',
  'available',
  'rejected',
  'failed',
  'deleted',
]);
export const fileScanStatus = pgEnum('file_scan_status', [
  'pending',
  'scanning',
  'clean',
  'infected',
  'error',
]);
export const fileVisibility = pgEnum('file_visibility', ['project', 'internal']);

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
    progressCompletedWeight: integer('progress_completed_weight').notNull().default(0),
    progressTotalWeight: integer('progress_total_weight').notNull().default(0),
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
      'project_progress_weights_check',
      sql`${table.progressCompletedWeight} >= 0 AND ${table.progressTotalWeight} >= 0 AND ${table.progressCompletedWeight} <= ${table.progressTotalWeight}`,
    ),
    check(
      'project_archive_state_check',
      sql`(${table.status} = 'archived' AND ${table.statusBeforeArchive} IS NOT NULL AND ${table.statusBeforeArchive} <> 'archived') OR (${table.status} <> 'archived' AND ${table.statusBeforeArchive} IS NULL)`,
    ),
  ],
);

export const projectScopeRevision = pgTable(
  'project_scope_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    revision: integer('revision').notNull(),
    status: scopeRevisionStatus('status').notNull().default('draft'),
    summary: text('summary').notNull(),
    goals: jsonb('goals').$type<string[]>().notNull().default([]),
    audience: jsonb('audience').$type<string[]>().notNull().default([]),
    pages: jsonb('pages').$type<string[]>().notNull().default([]),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    integrations: jsonb('integrations').$type<string[]>().notNull().default([]),
    deliverables: jsonb('deliverables').$type<string[]>().notNull().default([]),
    responsibilities: jsonb('responsibilities').$type<string[]>().notNull().default([]),
    revisionLimits: jsonb('revision_limits').$type<string[]>().notNull().default([]),
    exclusions: jsonb('exclusions').$type<string[]>().notNull().default([]),
    assumptions: jsonb('assumptions').$type<string[]>().notNull().default([]),
    acceptanceCriteria: jsonb('acceptance_criteria').$type<string[]>().notNull().default([]),
    contractUrl: text('contract_url'),
    proposalUrl: text('proposal_url'),
    plannedStartDate: date('planned_start_date', { mode: 'string' }),
    plannedEndDate: date('planned_end_date', { mode: 'string' }),
    costMinor: bigint('cost_minor', { mode: 'number' }),
    currency: text('currency'),
    createdByUserId: uuid('created_by_user_id').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    agreedByUserId: uuid('agreed_by_user_id'),
    agreedAt: timestamp('agreed_at', { withTimezone: true, mode: 'date' }),
    supersededAt: timestamp('superseded_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'scope_revision_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'scope_revision_creator_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('scope_revision_project_revision_unique').on(table.projectId, table.revision),
    uniqueIndex('scope_revision_id_workspace_unique').on(table.id, table.workspaceId),
    uniqueIndex('scope_revision_id_project_workspace_unique').on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    index('scope_revision_project_status_idx').on(table.projectId, table.status),
    check('scope_revision_positive_revision_check', sql`${table.revision} > 0`),
    check(
      'scope_revision_dates_check',
      sql`${table.plannedStartDate} IS NULL OR ${table.plannedEndDate} IS NULL OR ${table.plannedEndDate} >= ${table.plannedStartDate}`,
    ),
    check(
      'scope_revision_cost_currency_check',
      sql`(${table.costMinor} IS NULL AND ${table.currency} IS NULL) OR (${table.costMinor} >= 0 AND char_length(${table.currency}) = 3)`,
    ),
    check(
      'scope_revision_state_timestamps_check',
      sql`(${table.status} = 'draft' AND ${table.submittedAt} IS NULL AND ${table.agreedAt} IS NULL AND ${table.supersededAt} IS NULL) OR (${table.status} = 'client_review' AND ${table.submittedAt} IS NOT NULL AND ${table.agreedAt} IS NULL AND ${table.supersededAt} IS NULL) OR (${table.status} = 'agreed' AND ${table.submittedAt} IS NOT NULL AND ${table.agreedAt} IS NOT NULL AND ${table.agreedByUserId} IS NOT NULL AND ${table.supersededAt} IS NULL) OR (${table.status} = 'superseded' AND ${table.supersededAt} IS NOT NULL)`,
    ),
  ],
);

export const scopeRevisionApprover = pgTable(
  'scope_revision_approver',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    scopeRevisionId: uuid('scope_revision_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.scopeRevisionId, table.projectId, table.workspaceId],
      foreignColumns: [
        projectScopeRevision.id,
        projectScopeRevision.projectId,
        projectScopeRevision.workspaceId,
      ],
      name: 'scope_approver_revision_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'scope_approver_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'scope_approver_user_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('scope_approver_revision_user_unique').on(table.scopeRevisionId, table.userId),
    uniqueIndex('scope_approver_revision_user_workspace_unique').on(
      table.scopeRevisionId,
      table.userId,
      table.workspaceId,
    ),
    uniqueIndex('scope_approver_revision_user_project_workspace_unique').on(
      table.scopeRevisionId,
      table.userId,
      table.projectId,
      table.workspaceId,
    ),
    index('scope_approver_user_idx').on(table.workspaceId, table.userId),
  ],
);

export const scopeApprovalDecision = pgTable(
  'scope_approval_decision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    scopeRevisionId: uuid('scope_revision_id').notNull(),
    approverUserId: uuid('approver_user_id').notNull(),
    decision: scopeDecisionType('decision').notNull(),
    comment: text('comment'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.scopeRevisionId, table.approverUserId, table.projectId, table.workspaceId],
      foreignColumns: [
        scopeRevisionApprover.scopeRevisionId,
        scopeRevisionApprover.userId,
        scopeRevisionApprover.projectId,
        scopeRevisionApprover.workspaceId,
      ],
      name: 'scope_decision_assigned_approver_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'scope_decision_project_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('scope_decision_revision_approver_unique').on(
      table.scopeRevisionId,
      table.approverUserId,
    ),
    index('scope_decision_project_created_idx').on(table.projectId, table.createdAt),
  ],
);

export const projectStage = pgTable(
  'project_stage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    orderIndex: integer('order_index').notNull(),
    weight: integer('weight').notNull(),
    status: projectStageStatus('status').notNull().default('not_started'),
    ownerUserId: uuid('owner_user_id').notNull(),
    clientVisible: boolean('client_visible').notNull().default(true),
    isRequired: boolean('is_required').notNull().default(true),
    countsTowardProgress: boolean('counts_toward_progress').notNull().default(true),
    plannedStartDate: date('planned_start_date', { mode: 'string' }).notNull(),
    plannedEndDate: date('planned_end_date', { mode: 'string' }).notNull(),
    actualStartAt: timestamp('actual_start_at', { withTimezone: true, mode: 'date' }),
    actualEndAt: timestamp('actual_end_at', { withTimezone: true, mode: 'date' }),
    acceptanceCriteria: text('acceptance_criteria'),
    resultSummary: text('result_summary'),
    skipReason: text('skip_reason'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'project_stage_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.ownerUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'project_stage_owner_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('project_stage_project_order_unique').on(table.projectId, table.orderIndex),
    uniqueIndex('project_stage_id_project_workspace_unique').on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    index('project_stage_project_status_idx').on(table.projectId, table.status),
    check('project_stage_positive_weight_check', sql`${table.weight} > 0`),
    check('project_stage_nonnegative_order_check', sql`${table.orderIndex} >= 0`),
    check('project_stage_dates_check', sql`${table.plannedEndDate} >= ${table.plannedStartDate}`),
    check(
      'project_stage_skip_reason_check',
      sql`${table.status} <> 'skipped' OR nullif(btrim(${table.skipReason}), '') IS NOT NULL`,
    ),
    check(
      'project_stage_review_result_check',
      sql`${table.status} NOT IN ('ready_for_review', 'approved') OR nullif(btrim(${table.resultSummary}), '') IS NOT NULL`,
    ),
  ],
);

export const actionItem = pgTable(
  'action_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    stageId: uuid('stage_id'),
    title: text('title').notNull(),
    description: text('description'),
    type: actionItemType('type').notNull().default('other'),
    status: actionItemStatus('status').notNull().default('open'),
    priority: actionItemPriority('priority').notNull().default('normal'),
    visibility: actionItemVisibility('visibility').notNull(),
    assigneeUserId: uuid('assignee_user_id').notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    isBlocking: boolean('is_blocking').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'action_item_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.stageId, table.projectId, table.workspaceId],
      foreignColumns: [projectStage.id, projectStage.projectId, projectStage.workspaceId],
      name: 'action_item_stage_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.assigneeUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'action_item_assignee_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'action_item_creator_workspace_fk',
    }).onDelete('cascade'),
    index('action_item_assignee_status_due_idx').on(
      table.workspaceId,
      table.assigneeUserId,
      table.status,
      table.dueAt,
    ),
    index('action_item_project_status_due_idx').on(table.projectId, table.status, table.dueAt),
    check(
      'action_item_terminal_timestamps_check',
      sql`(${table.status} = 'done' AND ${table.completedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL AND ${table.completedAt} IS NULL) OR (${table.status} IN ('open', 'in_progress') AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL)`,
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
    uniqueIndex('project_membership_project_workspace_user_unique').on(
      table.projectId,
      table.workspaceId,
      table.userId,
    ),
    index('project_membership_workspace_user_idx').on(table.workspaceId, table.userId),
    check(
      'project_membership_side_role_check',
      sql`(${table.side} = 'internal' AND ${table.role} IN ('owner', 'employee')) OR (${table.side} = 'client' AND ${table.role} IN ('client', 'observer'))`,
    ),
  ],
);

export const questionnaire = pgTable(
  'questionnaire',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    schemaVersion: integer('schema_version').notNull().default(1),
    schemaSnapshot: jsonb('schema_snapshot').$type<unknown>().notNull(),
    status: questionnaireStatus('status').notNull().default('open'),
    assignedToUserId: uuid('assigned_to_user_id').notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'questionnaire_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.workspaceId, table.assignedToUserId],
      foreignColumns: [
        projectMembership.projectId,
        projectMembership.workspaceId,
        projectMembership.userId,
      ],
      name: 'questionnaire_assignee_project_membership_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'questionnaire_creator_workspace_membership_fk',
    }).onDelete('cascade'),
    uniqueIndex('questionnaire_id_workspace_unique').on(table.id, table.workspaceId),
    uniqueIndex('questionnaire_id_project_workspace_unique').on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    index('questionnaire_project_status_idx').on(table.projectId, table.status),
    index('questionnaire_assignee_status_due_idx').on(
      table.workspaceId,
      table.assignedToUserId,
      table.status,
      table.dueAt,
    ),
    check('questionnaire_schema_version_check', sql`${table.schemaVersion} > 0`),
    check(
      'questionnaire_state_timestamps_check',
      sql`(${table.status} = 'open' AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'submitted' AND ${table.submittedAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'completed' AND ${table.submittedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL) OR (${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL AND ${table.completedAt} IS NULL)`,
    ),
  ],
);

export const questionnaireDraft = pgTable(
  'questionnaire_draft',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    questionnaireId: uuid('questionnaire_id').notNull(),
    userId: uuid('user_id').notNull(),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    version: integer('version').notNull().default(1),
    lastIdempotencyKey: text('last_idempotency_key'),
    lastSavedAt: timestamp('last_saved_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.questionnaireId, table.projectId, table.workspaceId],
      foreignColumns: [questionnaire.id, questionnaire.projectId, questionnaire.workspaceId],
      name: 'questionnaire_draft_questionnaire_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.workspaceId, table.userId],
      foreignColumns: [
        projectMembership.projectId,
        projectMembership.workspaceId,
        projectMembership.userId,
      ],
      name: 'questionnaire_draft_user_project_membership_fk',
    }).onDelete('cascade'),
    uniqueIndex('questionnaire_draft_questionnaire_unique').on(table.questionnaireId),
    index('questionnaire_draft_user_updated_idx').on(
      table.workspaceId,
      table.userId,
      table.updatedAt,
    ),
    check('questionnaire_draft_version_check', sql`${table.version} > 0`),
  ],
);

export const questionnaireSubmission = pgTable(
  'questionnaire_submission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    questionnaireId: uuid('questionnaire_id').notNull(),
    revision: integer('revision').notNull(),
    schemaSnapshot: jsonb('schema_snapshot').$type<unknown>().notNull(),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull(),
    status: questionnaireSubmissionStatus('status').notNull().default('submitted'),
    submittedByUserId: uuid('submitted_by_user_id').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    reviewedByUserId: uuid('reviewed_by_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewComment: text('review_comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.questionnaireId, table.projectId, table.workspaceId],
      foreignColumns: [questionnaire.id, questionnaire.projectId, questionnaire.workspaceId],
      name: 'questionnaire_submission_questionnaire_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.workspaceId, table.submittedByUserId],
      foreignColumns: [
        projectMembership.projectId,
        projectMembership.workspaceId,
        projectMembership.userId,
      ],
      name: 'questionnaire_submission_submitter_project_membership_fk',
    }).onDelete('cascade'),
    uniqueIndex('questionnaire_submission_questionnaire_revision_unique').on(
      table.questionnaireId,
      table.revision,
    ),
    uniqueIndex('questionnaire_submission_id_project_workspace_unique').on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    uniqueIndex('questionnaire_submission_id_questionnaire_project_workspace_unique').on(
      table.id,
      table.questionnaireId,
      table.projectId,
      table.workspaceId,
    ),
    index('questionnaire_submission_questionnaire_created_idx').on(
      table.questionnaireId,
      table.createdAt,
    ),
    check('questionnaire_submission_revision_check', sql`${table.revision} > 0`),
    check(
      'questionnaire_submission_review_state_check',
      sql`(${table.status} = 'submitted' AND ${table.reviewedByUserId} IS NULL AND ${table.reviewedAt} IS NULL AND ${table.reviewComment} IS NULL) OR (${table.status} = 'clarification_requested' AND ${table.reviewedByUserId} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL AND nullif(btrim(${table.reviewComment}), '') IS NOT NULL) OR (${table.status} = 'accepted' AND ${table.reviewedByUserId} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`,
    ),
  ],
);

export const questionnaireAnswerComment = pgTable(
  'questionnaire_answer_comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    questionnaireId: uuid('questionnaire_id').notNull(),
    submissionId: uuid('submission_id').notNull(),
    fieldId: text('field_id').notNull(),
    body: text('body').notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.submissionId, table.questionnaireId, table.projectId, table.workspaceId],
      foreignColumns: [
        questionnaireSubmission.id,
        questionnaireSubmission.questionnaireId,
        questionnaireSubmission.projectId,
        questionnaireSubmission.workspaceId,
      ],
      name: 'questionnaire_comment_submission_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.questionnaireId, table.projectId, table.workspaceId],
      foreignColumns: [questionnaire.id, questionnaire.projectId, questionnaire.workspaceId],
      name: 'questionnaire_comment_questionnaire_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'questionnaire_comment_author_workspace_membership_fk',
    }).onDelete('cascade'),
    index('questionnaire_comment_submission_field_idx').on(table.submissionId, table.fieldId),
    check(
      'questionnaire_comment_field_nonempty_check',
      sql`nullif(btrim(${table.fieldId}), '') IS NOT NULL`,
    ),
    check(
      'questionnaire_comment_body_nonempty_check',
      sql`nullif(btrim(${table.body}), '') IS NOT NULL`,
    ),
  ],
);

export const material = pgTable(
  'material',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    stageId: uuid('stage_id'),
    actionItemId: uuid('action_item_id'),
    type: materialType('type').notNull(),
    title: text('title').notNull(),
    category: text('category'),
    status: materialStatus('status').notNull().default('requested'),
    currentRevisionId: uuid('current_revision_id'),
    requestedFromUserId: uuid('requested_from_user_id').notNull(),
    requestedByUserId: uuid('requested_by_user_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    finalAt: timestamp('final_at', { withTimezone: true, mode: 'date' }),
    notRequiredReason: text('not_required_reason'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'material_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.stageId, table.projectId, table.workspaceId],
      foreignColumns: [projectStage.id, projectStage.projectId, projectStage.workspaceId],
      name: 'material_stage_project_workspace_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.workspaceId, table.requestedFromUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'material_requested_from_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.requestedByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'material_requested_by_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('material_id_project_workspace_unique').on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    index('material_project_status_category_idx').on(table.projectId, table.status, table.category),
    index('material_requested_from_status_idx').on(
      table.workspaceId,
      table.requestedFromUserId,
      table.status,
    ),
    check(
      'material_not_required_reason_check',
      sql`${table.status} <> 'not_required' OR nullif(btrim(${table.notRequiredReason}), '') IS NOT NULL`,
    ),
  ],
);

export interface MaterialRevisionContent {
  readonly text?: string;
  readonly url?: string;
}

export const materialRevision = pgTable(
  'material_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    materialId: uuid('material_id').notNull(),
    revision: integer('revision').notNull(),
    status: materialRevisionStatus('status').notNull(),
    content: jsonb('content').$type<MaterialRevisionContent>().notNull().default({}),
    idempotencyKey: text('idempotency_key').notNull(),
    expectedFileCount: integer('expected_file_count').notNull().default(0),
    submittedByUserId: uuid('submitted_by_user_id').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    acceptedByUserId: uuid('accepted_by_user_id'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    reviewComment: text('review_comment'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.materialId, table.projectId, table.workspaceId],
      foreignColumns: [material.id, material.projectId, material.workspaceId],
      name: 'material_revision_material_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.submittedByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'material_revision_submitter_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.acceptedByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'material_revision_acceptor_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('material_revision_material_revision_unique').on(table.materialId, table.revision),
    uniqueIndex('material_revision_material_idempotency_unique').on(
      table.materialId,
      table.idempotencyKey,
    ),
    uniqueIndex('material_revision_id_project_workspace_unique').on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    index('material_revision_material_status_idx').on(table.materialId, table.status),
    check('material_revision_positive_revision_check', sql`${table.revision} > 0`),
    check('material_revision_file_count_check', sql`${table.expectedFileCount} >= 0`),
  ],
);

export const fileObject = pgTable(
  'file_object',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    storageKey: text('storage_key').notNull(),
    previewStorageKey: text('preview_storage_key'),
    originalName: text('original_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    declaredMimeType: text('declared_mime_type').notNull(),
    detectedMimeType: text('detected_mime_type'),
    size: bigint('size', { mode: 'number' }).notNull(),
    clientChecksum: text('client_checksum').notNull(),
    uploadSessionKey: text('upload_session_key').notNull(),
    checksum: text('checksum'),
    uploadStatus: fileUploadStatus('upload_status').notNull().default('initiated'),
    scanStatus: fileScanStatus('scan_status').notNull().default('pending'),
    scannerEngine: text('scanner_engine'),
    scanResultCode: text('scan_result_code'),
    scanStartedAt: timestamp('scan_started_at', { withTimezone: true, mode: 'date' }),
    processingAttempts: integer('processing_attempts').notNull().default(0),
    nextProcessingAt: timestamp('next_processing_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    scannedAt: timestamp('scanned_at', { withTimezone: true, mode: 'date' }),
    uploadedByUserId: uuid('uploaded_by_user_id').notNull(),
    uploadExpiresAt: timestamp('upload_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
      name: 'file_object_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workspaceId, table.uploadedByUserId],
      foreignColumns: [workspaceMembership.workspaceId, workspaceMembership.userId],
      name: 'file_object_uploader_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('file_object_storage_key_unique').on(table.storageKey),
    uniqueIndex('file_object_workspace_uploader_session_unique').on(
      table.workspaceId,
      table.uploadedByUserId,
      table.uploadSessionKey,
    ),
    uniqueIndex('file_object_id_project_workspace_unique').on(
      table.id,
      table.projectId,
      table.workspaceId,
    ),
    index('file_object_scan_queue_idx').on(table.uploadStatus, table.scanStatus, table.createdAt),
    index('file_object_workspace_quota_idx').on(table.workspaceId, table.uploadStatus),
    index('file_object_upload_expiry_idx').on(table.uploadStatus, table.uploadExpiresAt),
    check('file_object_positive_size_check', sql`${table.size} > 0`),
  ],
);

export const fileLink = pgTable(
  'file_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    fileObjectId: uuid('file_object_id').notNull(),
    materialRevisionId: uuid('material_revision_id'),
    questionnaireId: uuid('questionnaire_id'),
    questionnaireFieldId: text('questionnaire_field_id'),
    label: text('label'),
    visibility: fileVisibility('visibility').notNull().default('project'),
    version: integer('version').notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.fileObjectId, table.projectId, table.workspaceId],
      foreignColumns: [fileObject.id, fileObject.projectId, fileObject.workspaceId],
      name: 'file_link_object_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.questionnaireId, table.projectId, table.workspaceId],
      foreignColumns: [questionnaire.id, questionnaire.projectId, questionnaire.workspaceId],
      name: 'file_link_questionnaire_project_workspace_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.materialRevisionId, table.projectId, table.workspaceId],
      foreignColumns: [
        materialRevision.id,
        materialRevision.projectId,
        materialRevision.workspaceId,
      ],
      name: 'file_link_revision_project_workspace_fk',
    }).onDelete('cascade'),
    uniqueIndex('file_link_revision_object_unique')
      .on(table.materialRevisionId, table.fileObjectId)
      .where(sql`${table.materialRevisionId} IS NOT NULL`),
    uniqueIndex('file_link_questionnaire_field_object_unique')
      .on(table.questionnaireId, table.questionnaireFieldId, table.fileObjectId)
      .where(sql`${table.questionnaireId} IS NOT NULL`),
    index('file_link_revision_current_idx').on(table.materialRevisionId, table.isCurrent),
    check('file_link_positive_version_check', sql`${table.version} > 0`),
    check(
      'file_link_single_context_check',
      sql`(${table.materialRevisionId} IS NOT NULL AND ${table.questionnaireId} IS NULL AND ${table.questionnaireFieldId} IS NULL) OR (${table.materialRevisionId} IS NULL AND ${table.questionnaireId} IS NOT NULL AND nullif(btrim(${table.questionnaireFieldId}), '') IS NOT NULL)`,
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
  readonly fromStatus?: string;
  readonly toStatus?: string;
  readonly revision?: number;
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
  readonly template:
    | 'workspace-invitation'
    | 'project-invitation'
    | 'magic-link'
    | 'material-request'
    | 'domain-event';
  readonly recipientUserId?: string;
  readonly invitationId?: string;
  readonly projectId?: string;
  readonly entityType?: string;
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
