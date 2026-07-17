import { and, desc, eq, isNull } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  auditEvent,
  outboxEvent,
  projectMembership,
  questionnaire,
  questionnaireAnswerComment,
  questionnaireDraft,
  questionnaireSubmission,
  workspaceMembership,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import type {
  QuestionnaireAnswers,
  QuestionnaireInput,
  QuestionnaireReviewDecision,
  QuestionnaireSchema,
} from './types';
import {
  parseQuestionnaireSchema,
  sanitizeQuestionnaireDraft,
  validateQuestionnaireAnswers,
} from './validation';

export type QuestionnaireServiceErrorCode =
  'NOT_FOUND' | 'CONFLICT' | 'INVALID_STATE' | 'VALIDATION_FAILED';

export class QuestionnaireServiceError extends Error {
  constructor(
    readonly code: QuestionnaireServiceErrorCode,
    readonly details?: Readonly<Record<string, string>>,
    readonly currentVersion?: number,
  ) {
    super(code);
    this.name = 'QuestionnaireServiceError';
  }
}

interface RequestContext {
  readonly requestId?: string;
}

async function requireProjectAccess(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  permission: 'project.view' | 'project.edit',
) {
  const access = await resolveProjectAccess(client.db, tenant, slug);
  if (!canAccessProject(access, permission)) throw new QuestionnaireServiceError('NOT_FOUND');
  return access!;
}

function domainEvent(
  workspaceId: string,
  projectId: string,
  eventType: string,
  aggregateId: string,
) {
  return {
    workspaceId,
    eventType,
    aggregateType: 'questionnaire',
    aggregateId,
    payload: {
      template: 'domain-event' as const,
      projectId,
      entityType: 'questionnaire',
    },
  };
}

export async function createQuestionnaire(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  input: QuestionnaireInput,
  request: RequestContext = {},
) {
  const access = await requireProjectAccess(client, tenant, projectSlug, 'project.edit');
  if (access.projectStatus === 'archived') throw new QuestionnaireServiceError('INVALID_STATE');
  const schema = parseQuestionnaireSchema(input.schema);
  return client.db.transaction(async (tx) => {
    const [assignee] = await tx
      .select({ id: projectMembership.id })
      .from(projectMembership)
      .innerJoin(
        workspaceMembership,
        and(
          eq(workspaceMembership.workspaceId, projectMembership.workspaceId),
          eq(workspaceMembership.userId, projectMembership.userId),
          eq(workspaceMembership.status, 'active'),
        ),
      )
      .where(
        and(
          eq(projectMembership.projectId, access.projectId),
          eq(projectMembership.workspaceId, tenant.workspaceId),
          eq(projectMembership.userId, input.assignedToUserId),
          eq(projectMembership.side, 'client'),
          eq(projectMembership.role, 'client'),
          isNull(projectMembership.removedAt),
        ),
      )
      .limit(1);
    if (!assignee) throw new QuestionnaireServiceError('NOT_FOUND');
    const [created] = await tx
      .insert(questionnaire)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        title: input.title,
        description: input.description,
        schemaSnapshot: schema,
        assignedToUserId: input.assignedToUserId,
        createdByUserId: tenant.userId,
        dueAt: input.dueAt,
      })
      .returning({ id: questionnaire.id });
    if (!created) throw new Error('QUESTIONNAIRE_INSERT_FAILED');
    await tx.insert(questionnaireDraft).values({
      workspaceId: tenant.workspaceId,
      projectId: access.projectId,
      questionnaireId: created.id,
      userId: input.assignedToUserId,
    });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'questionnaire.created',
      entityType: 'questionnaire',
      entityId: created.id,
      requestId: request.requestId,
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(tenant.workspaceId, access.projectId, 'questionnaire.created', created.id),
      );
    return created;
  });
}

async function lockedQuestionnaire(
  tx: Parameters<Parameters<DatabaseClient['db']['transaction']>[0]>[0],
  tenant: TenantContext,
  projectId: string,
  questionnaireId: string,
) {
  const [item] = await tx
    .select({
      id: questionnaire.id,
      status: questionnaire.status,
      assignedToUserId: questionnaire.assignedToUserId,
      schemaSnapshot: questionnaire.schemaSnapshot,
    })
    .from(questionnaire)
    .where(
      and(
        eq(questionnaire.id, questionnaireId),
        eq(questionnaire.projectId, projectId),
        eq(questionnaire.workspaceId, tenant.workspaceId),
      ),
    )
    .for('update')
    .limit(1);
  if (!item) throw new QuestionnaireServiceError('NOT_FOUND');
  return {
    ...item,
    schema: parseQuestionnaireSchema(item.schemaSnapshot, { allowFileFields: true }),
  };
}

export async function autosaveQuestionnaireDraft(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  questionnaireId: string,
  input: {
    readonly answers: QuestionnaireAnswers;
    readonly version: number;
    readonly idempotencyKey: string;
  },
) {
  const access = await requireProjectAccess(client, tenant, projectSlug, 'project.view');
  if (access.side !== 'client' || access.role !== 'client' || access.projectStatus === 'archived') {
    throw new QuestionnaireServiceError('NOT_FOUND');
  }
  if (
    !Number.isInteger(input.version) ||
    input.version < 1 ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(input.idempotencyKey)
  ) {
    throw new QuestionnaireServiceError('VALIDATION_FAILED');
  }
  return client.db.transaction(async (tx) => {
    const item = await lockedQuestionnaire(tx, tenant, access.projectId, questionnaireId);
    if (item.assignedToUserId !== tenant.userId) throw new QuestionnaireServiceError('NOT_FOUND');
    if (item.status !== 'open') throw new QuestionnaireServiceError('INVALID_STATE');
    const answers = sanitizeQuestionnaireDraft(item.schema, input.answers);
    const [draft] = await tx
      .select({
        answers: questionnaireDraft.answers,
        version: questionnaireDraft.version,
        lastIdempotencyKey: questionnaireDraft.lastIdempotencyKey,
        lastSavedAt: questionnaireDraft.lastSavedAt,
      })
      .from(questionnaireDraft)
      .where(
        and(
          eq(questionnaireDraft.questionnaireId, item.id),
          eq(questionnaireDraft.workspaceId, tenant.workspaceId),
          eq(questionnaireDraft.userId, tenant.userId),
        ),
      )
      .for('update')
      .limit(1);
    if (!draft) throw new QuestionnaireServiceError('NOT_FOUND');
    if (draft.lastIdempotencyKey === input.idempotencyKey) {
      return {
        version: draft.version,
        lastSavedAt: draft.lastSavedAt,
        progress: validateQuestionnaireAnswers(item.schema, draft.answers),
      };
    }
    if (draft.version !== input.version) {
      throw new QuestionnaireServiceError('CONFLICT', undefined, draft.version);
    }
    const [saved] = await tx
      .update(questionnaireDraft)
      .set({
        answers,
        version: draft.version + 1,
        lastIdempotencyKey: input.idempotencyKey,
        lastSavedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(questionnaireDraft.questionnaireId, item.id))
      .returning({
        version: questionnaireDraft.version,
        lastSavedAt: questionnaireDraft.lastSavedAt,
      });
    if (!saved) throw new Error('QUESTIONNAIRE_DRAFT_UPDATE_FAILED');
    return {
      ...saved,
      progress: validateQuestionnaireAnswers(item.schema, answers),
    };
  });
}

export async function submitQuestionnaire(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  questionnaireId: string,
  expectedVersion: number,
  request: RequestContext = {},
) {
  const access = await requireProjectAccess(client, tenant, projectSlug, 'project.view');
  if (access.side !== 'client' || access.role !== 'client' || access.projectStatus === 'archived') {
    throw new QuestionnaireServiceError('NOT_FOUND');
  }
  return client.db.transaction(async (tx) => {
    const item = await lockedQuestionnaire(tx, tenant, access.projectId, questionnaireId);
    if (item.assignedToUserId !== tenant.userId) throw new QuestionnaireServiceError('NOT_FOUND');
    if (item.status !== 'open') throw new QuestionnaireServiceError('INVALID_STATE');
    const [draft] = await tx
      .select({ answers: questionnaireDraft.answers, version: questionnaireDraft.version })
      .from(questionnaireDraft)
      .where(
        and(
          eq(questionnaireDraft.questionnaireId, item.id),
          eq(questionnaireDraft.userId, tenant.userId),
          eq(questionnaireDraft.workspaceId, tenant.workspaceId),
        ),
      )
      .for('update')
      .limit(1);
    if (!draft) throw new QuestionnaireServiceError('NOT_FOUND');
    if (draft.version !== expectedVersion) {
      throw new QuestionnaireServiceError('CONFLICT', undefined, draft.version);
    }
    const validation = validateQuestionnaireAnswers(item.schema, draft.answers, {
      requireComplete: true,
    });
    if (Object.keys(validation.errors).length > 0) {
      throw new QuestionnaireServiceError('VALIDATION_FAILED', validation.errors);
    }
    const [latest] = await tx
      .select({ revision: questionnaireSubmission.revision })
      .from(questionnaireSubmission)
      .where(eq(questionnaireSubmission.questionnaireId, item.id))
      .orderBy(desc(questionnaireSubmission.revision))
      .limit(1);
    const revision = (latest?.revision ?? 0) + 1;
    const now = new Date();
    const [submission] = await tx
      .insert(questionnaireSubmission)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        questionnaireId: item.id,
        revision,
        schemaSnapshot: item.schema,
        answers: validation.answers,
        submittedByUserId: tenant.userId,
        submittedAt: now,
      })
      .returning({ id: questionnaireSubmission.id });
    if (!submission) throw new Error('QUESTIONNAIRE_SUBMISSION_INSERT_FAILED');
    await tx
      .update(questionnaire)
      .set({ status: 'submitted', submittedAt: now, updatedAt: now })
      .where(eq(questionnaire.id, item.id));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'questionnaire.submitted',
      entityType: 'questionnaire_submission',
      entityId: submission.id,
      requestId: request.requestId,
      metadata: { revision },
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(tenant.workspaceId, access.projectId, 'questionnaire.submitted', submission.id),
      );
    return { id: submission.id, revision };
  });
}

export async function reviewQuestionnaireSubmission(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  questionnaireId: string,
  submissionId: string,
  decision: QuestionnaireReviewDecision,
  comment: string | null,
  request: RequestContext = {},
) {
  const access = await requireProjectAccess(client, tenant, projectSlug, 'project.edit');
  if (access.projectStatus === 'archived') throw new QuestionnaireServiceError('INVALID_STATE');
  const normalizedComment = comment?.trim() || null;
  if (
    (decision === 'clarification_requested' && !normalizedComment) ||
    (normalizedComment?.length ?? 0) > 5_000
  ) {
    throw new QuestionnaireServiceError('VALIDATION_FAILED');
  }
  return client.db.transaction(async (tx) => {
    const item = await lockedQuestionnaire(tx, tenant, access.projectId, questionnaireId);
    if (item.status !== 'submitted') throw new QuestionnaireServiceError('INVALID_STATE');
    const [submission] = await tx
      .select({ id: questionnaireSubmission.id, revision: questionnaireSubmission.revision })
      .from(questionnaireSubmission)
      .where(
        and(
          eq(questionnaireSubmission.id, submissionId),
          eq(questionnaireSubmission.questionnaireId, item.id),
          eq(questionnaireSubmission.workspaceId, tenant.workspaceId),
          eq(questionnaireSubmission.status, 'submitted'),
        ),
      )
      .for('update')
      .limit(1);
    if (!submission) throw new QuestionnaireServiceError('NOT_FOUND');
    const now = new Date();
    await tx
      .update(questionnaireSubmission)
      .set({
        status: decision,
        reviewedByUserId: tenant.userId,
        reviewedAt: now,
        reviewComment: normalizedComment,
      })
      .where(eq(questionnaireSubmission.id, submission.id));
    await tx
      .update(questionnaire)
      .set({
        status: decision === 'accepted' ? 'completed' : 'open',
        completedAt: decision === 'accepted' ? now : null,
        updatedAt: now,
      })
      .where(eq(questionnaire.id, item.id));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action:
        decision === 'accepted'
          ? 'questionnaire.accepted'
          : 'questionnaire.clarification_requested',
      entityType: 'questionnaire_submission',
      entityId: submission.id,
      requestId: request.requestId,
      metadata: { revision: submission.revision },
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(
          tenant.workspaceId,
          access.projectId,
          `questionnaire.${decision}`,
          submission.id,
        ),
      );
    return { id: submission.id, status: decision };
  });
}

function collectFieldIds(schema: QuestionnaireSchema) {
  return new Set(
    schema.sections.flatMap((section) =>
      section.fields.flatMap((field) => [
        field.id,
        ...(field.fields?.map((child) => child.id) ?? []),
      ]),
    ),
  );
}

export async function commentOnQuestionnaireAnswer(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  questionnaireId: string,
  submissionId: string,
  fieldId: string,
  body: string,
  request: RequestContext = {},
) {
  const access = await requireProjectAccess(client, tenant, projectSlug, 'project.view');
  const normalizedBody = body.trim();
  if (!normalizedBody || normalizedBody.length > 5_000 || !/^[a-z][a-z0-9_]{1,63}$/.test(fieldId)) {
    throw new QuestionnaireServiceError('VALIDATION_FAILED');
  }
  return client.db.transaction(async (tx) => {
    const item = await lockedQuestionnaire(tx, tenant, access.projectId, questionnaireId);
    if (access.side === 'client' && item.assignedToUserId !== tenant.userId) {
      throw new QuestionnaireServiceError('NOT_FOUND');
    }
    if (!collectFieldIds(item.schema).has(fieldId)) {
      throw new QuestionnaireServiceError('NOT_FOUND');
    }
    const [submission] = await tx
      .select({ id: questionnaireSubmission.id })
      .from(questionnaireSubmission)
      .where(
        and(
          eq(questionnaireSubmission.id, submissionId),
          eq(questionnaireSubmission.questionnaireId, item.id),
          eq(questionnaireSubmission.workspaceId, tenant.workspaceId),
        ),
      )
      .limit(1);
    if (!submission) throw new QuestionnaireServiceError('NOT_FOUND');
    const [created] = await tx
      .insert(questionnaireAnswerComment)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        questionnaireId: item.id,
        submissionId: submission.id,
        fieldId,
        body: normalizedBody,
        createdByUserId: tenant.userId,
      })
      .returning({ id: questionnaireAnswerComment.id });
    if (!created) throw new Error('QUESTIONNAIRE_COMMENT_INSERT_FAILED');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'questionnaire.answer_commented',
      entityType: 'questionnaire_answer_comment',
      entityId: created.id,
      requestId: request.requestId,
    });
    return created;
  });
}
