import { createHash } from 'node:crypto';

import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  approvalDecision,
  approvalRequest,
  approvalRequestApprover,
  auditEvent,
  clientMembership,
  externalDecisionRecord,
  feedbackItem,
  fileLink,
  fileObject,
  outboxEvent,
  project,
  projectMembership,
  projectScopeRevision,
  projectStage,
  siteVersion,
  user,
} from '@garun/db/schema';

import { isOwner } from '../identity/policies';
import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { calculateProgress } from '../workflow/state-machines';
import { resolveApprovalStatus, validateDecisionInput } from './state-machines';
import type {
  ApprovalEntityType,
  ApprovalTarget,
  CreateApprovalRequestInput,
  DecideApprovalInput,
  RecordExternalDecisionInput,
} from './types';

export type ApprovalErrorCode =
  'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID_STATE' | 'STALE_ENTITY' | 'BLOCKING_FEEDBACK';

export class ApprovalServiceError extends Error {
  constructor(readonly code: ApprovalErrorCode) {
    super(code);
    this.name = 'ApprovalServiceError';
  }
}

interface RequestContext {
  readonly requestId?: string;
}

type Transaction = Parameters<Parameters<DatabaseClient['db']['transaction']>[0]>[0];

interface TargetSnapshot {
  readonly type: ApprovalEntityType;
  readonly targetKey: string;
  readonly scopeRevisionId?: string;
  readonly stageId?: string;
  readonly siteVersionId?: string;
  readonly fileObjectId?: string;
  readonly revision: string;
  readonly snapshot: {
    readonly title: string;
    readonly summary?: string;
    readonly revision: string;
    readonly capturedAt: string;
    readonly details: Readonly<Record<string, string | number | boolean | null>>;
  };
}

function databaseErrorCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') return null;
    const candidate = current as { readonly code?: unknown; readonly cause?: unknown };
    if (typeof candidate.code === 'string') return candidate.code;
    current = candidate.cause;
  }
  return null;
}

async function serializableTransaction<T>(
  client: DatabaseClient,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.db.transaction(operation, { isolationLevel: 'serializable' });
    } catch (error) {
      const retryable = new Set(['40001', '40P01']).has(databaseErrorCode(error) ?? '');
      if (!retryable || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cleanUserAgent(value?: string): string | null {
  if (!value) return null;
  const cleaned = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .trim();
  return cleaned ? cleaned.slice(0, 256) : null;
}

async function requireProject(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  permission: 'project.view' | 'project.edit',
) {
  if (tenant.membershipStatus !== 'active' || tenant.workspaceStatus !== 'active') {
    throw new ApprovalServiceError('NOT_FOUND');
  }
  const access = await resolveProjectAccess(client.db, tenant, slug);
  if (!canAccessProject(access, permission)) throw new ApprovalServiceError('NOT_FOUND');
  return access!;
}

async function loadTarget(
  tx: Transaction,
  workspaceId: string,
  projectId: string,
  target: ApprovalTarget,
): Promise<TargetSnapshot> {
  const capturedAt = new Date().toISOString();
  if (target.type === 'scope_revision') {
    const [row] = await tx
      .select()
      .from(projectScopeRevision)
      .where(
        and(
          eq(projectScopeRevision.id, target.id),
          eq(projectScopeRevision.workspaceId, workspaceId),
          eq(projectScopeRevision.projectId, projectId),
          inArray(projectScopeRevision.status, ['draft', 'client_review']),
        ),
      )
      .limit(1);
    if (!row) throw new ApprovalServiceError('NOT_FOUND');
    const revision = String(row.revision);
    return {
      type: target.type,
      targetKey: `scope_revision:${row.id}`,
      scopeRevisionId: row.id,
      revision,
      snapshot: {
        title: `Границы проекта · версия ${row.revision}`,
        summary: row.summary,
        revision,
        capturedAt,
        details: {
          goals: row.goals.join('\n'),
          pages: row.pages.join('\n'),
          deliverables: row.deliverables.join('\n'),
          acceptanceCriteria: row.acceptanceCriteria.join('\n'),
          plannedStartDate: row.plannedStartDate,
          plannedEndDate: row.plannedEndDate,
          costMinor: row.costMinor,
          currency: row.currency,
        },
      },
    };
  }
  if (target.type === 'project_stage') {
    const [row] = await tx
      .select()
      .from(projectStage)
      .where(
        and(
          eq(projectStage.id, target.id),
          eq(projectStage.workspaceId, workspaceId),
          eq(projectStage.projectId, projectId),
          eq(projectStage.status, 'ready_for_review'),
          eq(projectStage.clientVisible, true),
        ),
      )
      .limit(1);
    if (!row) throw new ApprovalServiceError('NOT_FOUND');
    const revision = checksum({
      status: row.status,
      resultSummary: row.resultSummary,
      acceptanceCriteria: row.acceptanceCriteria,
    });
    return {
      type: target.type,
      targetKey: `project_stage:${row.id}`,
      stageId: row.id,
      revision,
      snapshot: {
        title: row.name,
        summary: row.resultSummary ?? undefined,
        revision,
        capturedAt,
        details: {
          description: row.description,
          acceptanceCriteria: row.acceptanceCriteria,
          plannedEndDate: row.plannedEndDate,
          resultSummary: row.resultSummary,
        },
      },
    };
  }
  if (target.type === 'site_version') {
    const [row] = await tx
      .select()
      .from(siteVersion)
      .where(
        and(
          eq(siteVersion.id, target.id),
          eq(siteVersion.workspaceId, workspaceId),
          eq(siteVersion.projectId, projectId),
          eq(siteVersion.clientVisible, true),
          eq(siteVersion.securityStatus, 'safe'),
          eq(siteVersion.availabilityStatus, 'reachable'),
        ),
      )
      .limit(1);
    if (!row?.publishedAt) throw new ApprovalServiceError('NOT_FOUND');
    const revision = checksum({
      versionNumber: row.versionNumber,
      url: row.url,
      changeLog: row.changeLog,
      checkInstructions: row.checkInstructions,
      publishedAt: row.publishedAt.toISOString(),
    });
    return {
      type: target.type,
      targetKey: `site_version:${row.id}`,
      siteVersionId: row.id,
      revision,
      snapshot: {
        title: `${row.name} · версия ${row.versionNumber}`,
        summary: row.description ?? undefined,
        revision,
        capturedAt,
        details: {
          changeLog: row.changeLog,
          checkInstructions: row.checkInstructions,
          environmentType: row.environmentType,
          publishedAt: row.publishedAt.toISOString(),
        },
      },
    };
  }
  if (target.type === 'file_object') {
    const [row] = await tx
      .select()
      .from(fileObject)
      .innerJoin(
        fileLink,
        and(
          eq(fileLink.fileObjectId, fileObject.id),
          eq(fileLink.workspaceId, fileObject.workspaceId),
          eq(fileLink.projectId, fileObject.projectId),
          eq(fileLink.visibility, 'project'),
          eq(fileLink.isCurrent, true),
        ),
      )
      .where(
        and(
          eq(fileObject.id, target.id),
          eq(fileObject.workspaceId, workspaceId),
          eq(fileObject.projectId, projectId),
          eq(fileObject.uploadStatus, 'available'),
          eq(fileObject.scanStatus, 'clean'),
          isNull(fileObject.deletedAt),
        ),
      )
      .limit(1);
    const file = row?.file_object;
    if (!file?.checksum) throw new ApprovalServiceError('NOT_FOUND');
    return {
      type: target.type,
      targetKey: `file_object:${file.id}`,
      fileObjectId: file.id,
      revision: file.checksum,
      snapshot: {
        title: file.normalizedName,
        revision: file.checksum,
        capturedAt,
        details: {
          mimeType: file.detectedMimeType,
          size: file.size,
          checksum: file.checksum,
        },
      },
    };
  }
  const [row] = await tx
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      progressCompletedWeight: project.progressCompletedWeight,
      progressTotalWeight: project.progressTotalWeight,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new ApprovalServiceError('NOT_FOUND');
  const revision = checksum({
    status: row.status,
    progressCompletedWeight: row.progressCompletedWeight,
    progressTotalWeight: row.progressTotalWeight,
    updatedAt: row.updatedAt.toISOString(),
  });
  return {
    type: 'final_handover',
    targetKey: `final_handover:${row.id}`,
    revision,
    snapshot: {
      title: `Финальная передача · ${row.name}`,
      revision,
      capturedAt,
      details: {
        status: row.status,
        progressCompletedWeight: row.progressCompletedWeight,
        progressTotalWeight: row.progressTotalWeight,
      },
    },
  };
}

async function assertNoBlockingFeedback(
  tx: Transaction,
  workspaceId: string,
  projectId: string,
  target: TargetSnapshot,
) {
  if (!target.stageId && !target.siteVersionId) return;
  const [blocking] = await tx
    .select({ id: feedbackItem.id })
    .from(feedbackItem)
    .innerJoin(siteVersion, eq(siteVersion.id, feedbackItem.siteVersionId))
    .where(
      and(
        eq(feedbackItem.workspaceId, workspaceId),
        eq(feedbackItem.projectId, projectId),
        eq(feedbackItem.priority, 'blocking'),
        ne(feedbackItem.status, 'closed'),
        ne(feedbackItem.status, 'rejected'),
        target.siteVersionId ? eq(feedbackItem.siteVersionId, target.siteVersionId) : undefined,
        target.stageId ? eq(siteVersion.stageId, target.stageId) : undefined,
      ),
    )
    .limit(1);
  if (blocking) throw new ApprovalServiceError('BLOCKING_FEEDBACK');
}

async function assertApprovers(
  tx: Transaction,
  workspaceId: string,
  projectId: string,
  userIds: readonly string[],
) {
  const rows = await tx
    .select({ userId: projectMembership.userId })
    .from(projectMembership)
    .innerJoin(
      clientMembership,
      and(
        eq(clientMembership.workspaceId, projectMembership.workspaceId),
        eq(clientMembership.userId, projectMembership.userId),
        eq(clientMembership.canApprove, true),
        isNull(clientMembership.removedAt),
      ),
    )
    .where(
      and(
        eq(projectMembership.workspaceId, workspaceId),
        eq(projectMembership.projectId, projectId),
        eq(projectMembership.side, 'client'),
        isNull(projectMembership.removedAt),
        inArray(projectMembership.userId, [...userIds]),
      ),
    );
  if (new Set(rows.map((row) => row.userId)).size !== userIds.length) {
    throw new ApprovalServiceError('NOT_FOUND');
  }
}

function approvalDomainEvent(
  workspaceId: string,
  projectId: string,
  eventType: string,
  requestId: string,
) {
  return {
    workspaceId,
    eventType,
    aggregateType: 'approval_request',
    aggregateId: requestId,
    payload: {
      template: 'domain-event' as const,
      projectId,
      entityType: 'approval_request',
    },
  };
}

export async function createApprovalRequest(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  input: CreateApprovalRequestInput,
  request: RequestContext = {},
) {
  const access = await requireProject(client, tenant, projectSlug, 'project.edit');
  if (access.side !== 'internal') throw new ApprovalServiceError('NOT_FOUND');
  return client.db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${project} where ${project.id} = ${access.projectId} and ${project.workspaceId} = ${tenant.workspaceId} for update`,
    );
    const [existing] = await tx
      .select({ id: approvalRequest.id, status: approvalRequest.status })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.workspaceId, tenant.workspaceId),
          eq(approvalRequest.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;
    await assertApprovers(tx, tenant.workspaceId, access.projectId, input.approverUserIds);
    const target = await loadTarget(tx, tenant.workspaceId, access.projectId, input.target);
    await assertNoBlockingFeedback(tx, tenant.workspaceId, access.projectId, target);
    const replaceFamily =
      target.type === 'scope_revision' ||
      target.type === 'site_version' ||
      target.type === 'final_handover';
    const pending = await tx
      .select({
        id: approvalRequest.id,
        targetKey: approvalRequest.targetKey,
        entityRevision: approvalRequest.entityRevision,
      })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.workspaceId, tenant.workspaceId),
          eq(approvalRequest.projectId, access.projectId),
          eq(approvalRequest.status, 'pending'),
          replaceFamily
            ? eq(approvalRequest.entityType, target.type)
            : eq(approvalRequest.targetKey, target.targetKey),
        ),
      )
      .for('update');
    if (
      pending.some(
        (item) => item.targetKey === target.targetKey && item.entityRevision === target.revision,
      )
    ) {
      throw new ApprovalServiceError('CONFLICT');
    }
    if (pending.length > 0) {
      const invalidatedAt = new Date();
      await tx
        .update(approvalRequest)
        .set({ status: 'invalidated', invalidatedAt, updatedAt: invalidatedAt })
        .where(
          inArray(
            approvalRequest.id,
            pending.map((item) => item.id),
          ),
        );
      await tx.insert(auditEvent).values(
        pending.map((item) => ({
          workspaceId: tenant.workspaceId,
          actorUserId: tenant.userId,
          action: 'approval_request.invalidated',
          entityType: 'approval_request',
          entityId: item.id,
          requestId: request.requestId,
          metadata: { reasonCode: 'NEW_ENTITY_REVISION' },
        })),
      );
    }
    const [created] = await tx
      .insert(approvalRequest)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        entityType: target.type,
        targetKey: target.targetKey,
        scopeRevisionId: target.scopeRevisionId,
        stageId: target.stageId,
        siteVersionId: target.siteVersionId,
        fileObjectId: target.fileObjectId,
        entityRevision: target.revision,
        entitySnapshot: target.snapshot,
        snapshotChecksum: checksum(target.snapshot),
        acknowledgementText: input.acknowledgementText.trim(),
        acknowledgementChecksum: checksum(input.acknowledgementText.trim()),
        mode: input.mode,
        requestedByUserId: tenant.userId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: approvalRequest.id, status: approvalRequest.status });
    if (!created) throw new Error('APPROVAL_REQUEST_INSERT_FAILED');
    await tx.insert(approvalRequestApprover).values(
      input.approverUserIds.map((userId) => ({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        approvalRequestId: created.id,
        userId,
      })),
    );
    if (target.scopeRevisionId) {
      await tx
        .update(projectScopeRevision)
        .set({ status: 'client_review', submittedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(projectScopeRevision.id, target.scopeRevisionId),
            eq(projectScopeRevision.status, 'draft'),
          ),
        );
    }
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'approval_request.created',
      entityType: 'approval_request',
      entityId: created.id,
      requestId: request.requestId,
      metadata: { source: target.type },
    });
    await tx
      .insert(outboxEvent)
      .values(
        approvalDomainEvent(tenant.workspaceId, access.projectId, 'approval.requested', created.id),
      );
    return created;
  });
}

async function applyResolvedOutcome(
  tx: Transaction,
  row: typeof approvalRequest.$inferSelect,
  status: 'approved' | 'changes_requested',
  actorUserId: string,
) {
  if (row.scopeRevisionId) {
    const [revision] = await tx
      .select()
      .from(projectScopeRevision)
      .where(eq(projectScopeRevision.id, row.scopeRevisionId))
      .limit(1);
    if (!revision) throw new ApprovalServiceError('STALE_ENTITY');
    if (status === 'approved') {
      await tx
        .update(projectScopeRevision)
        .set({ status: 'superseded', supersededAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(projectScopeRevision.projectId, row.projectId),
            eq(projectScopeRevision.workspaceId, row.workspaceId),
            eq(projectScopeRevision.status, 'agreed'),
            ne(projectScopeRevision.id, revision.id),
          ),
        );
      await tx
        .update(projectScopeRevision)
        .set({
          status: 'agreed',
          agreedByUserId: actorUserId,
          agreedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectScopeRevision.id, revision.id));
    } else {
      await tx
        .update(projectScopeRevision)
        .set({ status: 'superseded', supersededAt: new Date(), updatedAt: new Date() })
        .where(eq(projectScopeRevision.id, revision.id));
      await tx.insert(projectScopeRevision).values({
        ...revision,
        id: undefined,
        revision: revision.revision + 1,
        status: 'draft',
        submittedAt: null,
        agreedByUserId: null,
        agreedAt: null,
        supersededAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  if (row.stageId) {
    await tx
      .update(projectStage)
      .set({
        status: status === 'approved' ? 'approved' : 'changes_requested',
        actualEndAt: status === 'approved' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(projectStage.id, row.stageId));
    const stages = await tx
      .select({
        weight: projectStage.weight,
        status: projectStage.status,
        countsTowardProgress: projectStage.countsTowardProgress,
        skipReason: projectStage.skipReason,
      })
      .from(projectStage)
      .where(
        and(
          eq(projectStage.workspaceId, row.workspaceId),
          eq(projectStage.projectId, row.projectId),
        ),
      );
    const progress = calculateProgress(stages);
    await tx
      .update(project)
      .set({
        progressCompletedWeight: progress.completedWeight,
        progressTotalWeight: progress.totalWeight,
        updatedAt: new Date(),
      })
      .where(and(eq(project.id, row.projectId), eq(project.workspaceId, row.workspaceId)));
  }
}

async function assertTargetFresh(tx: Transaction, row: typeof approvalRequest.$inferSelect) {
  const target: ApprovalTarget = row.scopeRevisionId
    ? { type: 'scope_revision', id: row.scopeRevisionId }
    : row.stageId
      ? { type: 'project_stage', id: row.stageId }
      : row.siteVersionId
        ? { type: 'site_version', id: row.siteVersionId }
        : row.fileObjectId
          ? { type: 'file_object', id: row.fileObjectId }
          : { type: 'final_handover' };
  const current = await loadTarget(tx, row.workspaceId, row.projectId, target);
  if (current.revision !== row.entityRevision) throw new ApprovalServiceError('STALE_ENTITY');
  await assertNoBlockingFeedback(tx, row.workspaceId, row.projectId, current);
}

export async function decideApprovalRequest(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  approvalRequestId: string,
  input: DecideApprovalInput,
  request: RequestContext = {},
) {
  validateDecisionInput(input.decision, input.comment);
  const access = await requireProject(client, tenant, projectSlug, 'project.view');
  if (access.side !== 'client') throw new ApprovalServiceError('NOT_FOUND');
  return serializableTransaction(client, async (tx) => {
    const [duplicate] = await tx
      .select({
        id: approvalDecision.id,
        decision: approvalDecision.decision,
        status: approvalRequest.status,
      })
      .from(approvalDecision)
      .innerJoin(approvalRequest, eq(approvalRequest.id, approvalDecision.approvalRequestId))
      .where(
        and(
          eq(approvalDecision.approvalRequestId, approvalRequestId),
          eq(approvalDecision.approverUserId, tenant.userId),
          eq(approvalDecision.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (duplicate) return { ...duplicate, duplicate: true };
    const [row] = await tx
      .select()
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.id, approvalRequestId),
          eq(approvalRequest.workspaceId, tenant.workspaceId),
          eq(approvalRequest.projectId, access.projectId),
        ),
      )
      .for('update')
      .limit(1);
    if (!row) throw new ApprovalServiceError('NOT_FOUND');
    if (row.status !== 'pending') throw new ApprovalServiceError('CONFLICT');
    const [assigned] = await tx
      .select({ id: approvalRequestApprover.id })
      .from(approvalRequestApprover)
      .innerJoin(
        projectMembership,
        and(
          eq(projectMembership.projectId, approvalRequestApprover.projectId),
          eq(projectMembership.workspaceId, approvalRequestApprover.workspaceId),
          eq(projectMembership.userId, approvalRequestApprover.userId),
          eq(projectMembership.side, 'client'),
          isNull(projectMembership.removedAt),
        ),
      )
      .innerJoin(
        clientMembership,
        and(
          eq(clientMembership.workspaceId, approvalRequestApprover.workspaceId),
          eq(clientMembership.userId, approvalRequestApprover.userId),
          eq(clientMembership.canApprove, true),
          isNull(clientMembership.removedAt),
        ),
      )
      .where(
        and(
          eq(approvalRequestApprover.approvalRequestId, row.id),
          eq(approvalRequestApprover.userId, tenant.userId),
        ),
      )
      .limit(1);
    if (!assigned) throw new ApprovalServiceError('NOT_FOUND');
    await assertTargetFresh(tx, row);
    const [created] = await tx
      .insert(approvalDecision)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        approvalRequestId: row.id,
        approverUserId: tenant.userId,
        decision: input.decision,
        comment: input.comment?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        networkFingerprint: input.networkFingerprint?.slice(0, 128),
        userAgent: cleanUserAgent(input.userAgent),
      })
      .returning({ id: approvalDecision.id, decision: approvalDecision.decision });
    if (!created) throw new Error('APPROVAL_DECISION_INSERT_FAILED');
    const [counts] = await tx
      .select({
        decisions: count(approvalDecision.id),
        approvers: count(approvalRequestApprover.id),
      })
      .from(approvalRequestApprover)
      .leftJoin(
        approvalDecision,
        and(
          eq(approvalDecision.approvalRequestId, approvalRequestApprover.approvalRequestId),
          eq(approvalDecision.approverUserId, approvalRequestApprover.userId),
        ),
      )
      .where(eq(approvalRequestApprover.approvalRequestId, row.id));
    const decisions = await tx
      .select({ decision: approvalDecision.decision })
      .from(approvalDecision)
      .where(eq(approvalDecision.approvalRequestId, row.id));
    const status = resolveApprovalStatus(
      row.mode,
      decisions.map((item) => item.decision),
      Number(counts?.approvers ?? 0),
    );
    if (status === 'approved' || status === 'changes_requested') {
      await applyResolvedOutcome(tx, row, status, tenant.userId);
      await tx
        .update(approvalRequest)
        .set({ status, resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(approvalRequest.id, row.id));
    }
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: `approval_decision.${input.decision}`,
      entityType: 'approval_request',
      entityId: row.id,
      requestId: request.requestId,
      metadata: { source: row.entityType, toStatus: status },
    });
    await tx
      .insert(outboxEvent)
      .values(
        approvalDomainEvent(
          tenant.workspaceId,
          access.projectId,
          `approval.${input.decision}`,
          row.id,
        ),
      );
    return { ...created, status, duplicate: false };
  });
}

export async function cancelApprovalRequest(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  approvalRequestId: string,
  reason: string,
  request: RequestContext = {},
) {
  const access = await requireProject(client, tenant, projectSlug, 'project.edit');
  if (!isOwner(tenant) || access.role !== 'owner') throw new ApprovalServiceError('NOT_FOUND');
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 2_000) {
    throw new ApprovalServiceError('INVALID_STATE');
  }
  return client.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(approvalRequest)
      .set({
        status: 'cancelled',
        cancelReason: normalizedReason,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(approvalRequest.id, approvalRequestId),
          eq(approvalRequest.workspaceId, tenant.workspaceId),
          eq(approvalRequest.projectId, access.projectId),
          eq(approvalRequest.status, 'pending'),
        ),
      )
      .returning({ id: approvalRequest.id });
    if (!updated) throw new ApprovalServiceError('CONFLICT');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'approval_request.cancelled',
      entityType: 'approval_request',
      entityId: updated.id,
      requestId: request.requestId,
      metadata: { reasonCode: 'OWNER_CANCELLED' },
    });
    return updated;
  });
}

export async function recordExternalDecision(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  approvalRequestId: string,
  input: RecordExternalDecisionInput,
  request: RequestContext = {},
) {
  const access = await requireProject(client, tenant, projectSlug, 'project.edit');
  if (!isOwner(tenant) || access.role !== 'owner') throw new ApprovalServiceError('NOT_FOUND');
  return serializableTransaction(client, async (tx) => {
    const [row] = await tx
      .select()
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.id, approvalRequestId),
          eq(approvalRequest.workspaceId, tenant.workspaceId),
          eq(approvalRequest.projectId, access.projectId),
        ),
      )
      .for('update')
      .limit(1);
    if (!row) throw new ApprovalServiceError('NOT_FOUND');
    if (row.status !== 'pending') throw new ApprovalServiceError('CONFLICT');
    await assertTargetFresh(tx, row);
    const [created] = await tx
      .insert(externalDecisionRecord)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        approvalRequestId: row.id,
        decision: input.decision,
        source: input.source.trim(),
        sourceDecisionAt: input.sourceDecisionAt,
        recordedByUserId: tenant.userId,
        explanation: input.explanation.trim(),
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: externalDecisionRecord.id });
    if (!created) throw new Error('EXTERNAL_DECISION_INSERT_FAILED');
    await applyResolvedOutcome(tx, row, input.decision, tenant.userId);
    await tx
      .update(approvalRequest)
      .set({ status: input.decision, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(approvalRequest.id, row.id));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'approval_decision.recorded_externally',
      entityType: 'approval_request',
      entityId: row.id,
      requestId: request.requestId,
      metadata: { source: input.source.trim(), toStatus: input.decision },
    });
    return created;
  });
}

export async function listEligibleApprovers(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await requireProject(client, tenant, projectSlug, 'project.view');
  if (access.side !== 'internal') return [];
  return client.db
    .select({ userId: projectMembership.userId, name: user.name })
    .from(projectMembership)
    .innerJoin(user, eq(user.id, projectMembership.userId))
    .innerJoin(
      clientMembership,
      and(
        eq(clientMembership.workspaceId, projectMembership.workspaceId),
        eq(clientMembership.userId, projectMembership.userId),
        eq(clientMembership.canApprove, true),
        isNull(clientMembership.removedAt),
      ),
    )
    .where(
      and(
        eq(projectMembership.workspaceId, tenant.workspaceId),
        eq(projectMembership.projectId, access.projectId),
        eq(projectMembership.side, 'client'),
        isNull(projectMembership.removedAt),
      ),
    );
}
