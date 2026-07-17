import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  actionItem,
  auditEvent,
  clientMembership,
  outboxEvent,
  project,
  projectMembership,
  projectScopeRevision,
  projectStage,
  scopeApprovalDecision,
  scopeRevisionApprover,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { calculateProgress, canTransitionAction, validateStageTransition } from './state-machines';
import type {
  ActionInput,
  ActionStatus,
  ScopeRevisionInput,
  StageInput,
  StageStatus,
} from './types';

export type WorkflowErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID_STATE';

export class WorkflowServiceError extends Error {
  constructor(readonly code: WorkflowErrorCode) {
    super(code);
    this.name = 'WorkflowServiceError';
  }
}

interface RequestContext {
  readonly requestId?: string;
}

async function requireAccess(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  permission: 'project.view' | 'project.edit',
) {
  if (tenant.membershipStatus !== 'active' || tenant.workspaceStatus !== 'active') {
    throw new WorkflowServiceError('NOT_FOUND');
  }
  const access = await resolveProjectAccess(client.db, tenant, slug);
  if (!canAccessProject(access, permission)) throw new WorkflowServiceError('NOT_FOUND');
  return access!;
}

function domainEvent(
  workspaceId: string,
  projectId: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
) {
  return {
    workspaceId,
    eventType,
    aggregateType,
    aggregateId,
    payload: { template: 'domain-event' as const, projectId, entityType: aggregateType },
  };
}

export async function createScopeRevision(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  input: ScopeRevisionInput,
  request: RequestContext = {},
) {
  const access = await requireAccess(client, tenant, slug, 'project.edit');
  return client.db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${project} where ${project.id} = ${access.projectId} and ${project.workspaceId} = ${tenant.workspaceId} for update`,
    );
    const [latest] = await tx
      .select({ revision: projectScopeRevision.revision, status: projectScopeRevision.status })
      .from(projectScopeRevision)
      .where(
        and(
          eq(projectScopeRevision.projectId, access.projectId),
          eq(projectScopeRevision.workspaceId, tenant.workspaceId),
        ),
      )
      .orderBy(desc(projectScopeRevision.revision))
      .limit(1);
    if (latest?.status === 'draft' || latest?.status === 'client_review') {
      throw new WorkflowServiceError('CONFLICT');
    }
    const [created] = await tx
      .insert(projectScopeRevision)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        revision: (latest?.revision ?? 0) + 1,
        createdByUserId: tenant.userId,
        ...input,
        goals: [...input.goals],
        audience: [...input.audience],
        pages: [...input.pages],
        features: [...input.features],
        integrations: [...input.integrations],
        deliverables: [...input.deliverables],
        responsibilities: [...input.responsibilities],
        revisionLimits: [...input.revisionLimits],
        exclusions: [...input.exclusions],
        assumptions: [...input.assumptions],
        acceptanceCriteria: [...input.acceptanceCriteria],
      })
      .returning({ id: projectScopeRevision.id, revision: projectScopeRevision.revision });
    if (!created) throw new Error('SCOPE_INSERT_FAILED');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'scope_revision.created',
      entityType: 'scope_revision',
      entityId: created.id,
      requestId: request.requestId,
      metadata: { revision: created.revision },
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(tenant.workspaceId, access.projectId, 'scope.created', 'scope', created.id),
      );
    return created;
  });
}

export async function submitScopeRevision(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  revisionId: string,
  approverUserId: string,
  request: RequestContext = {},
) {
  const access = await requireAccess(client, tenant, slug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [approver] = await tx
      .select({ userId: projectMembership.userId })
      .from(projectMembership)
      .innerJoin(
        clientMembership,
        and(
          eq(clientMembership.workspaceId, projectMembership.workspaceId),
          eq(clientMembership.userId, projectMembership.userId),
          isNull(clientMembership.removedAt),
          eq(clientMembership.canApprove, true),
        ),
      )
      .where(
        and(
          eq(projectMembership.workspaceId, tenant.workspaceId),
          eq(projectMembership.projectId, access.projectId),
          eq(projectMembership.userId, approverUserId),
          eq(projectMembership.side, 'client'),
          isNull(projectMembership.removedAt),
        ),
      )
      .limit(1);
    if (!approver) throw new WorkflowServiceError('NOT_FOUND');
    const [updated] = await tx
      .update(projectScopeRevision)
      .set({ status: 'client_review', submittedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(projectScopeRevision.id, revisionId),
          eq(projectScopeRevision.projectId, access.projectId),
          eq(projectScopeRevision.workspaceId, tenant.workspaceId),
          eq(projectScopeRevision.status, 'draft'),
        ),
      )
      .returning({ id: projectScopeRevision.id, revision: projectScopeRevision.revision });
    if (!updated) throw new WorkflowServiceError('CONFLICT');
    await tx.insert(scopeRevisionApprover).values({
      workspaceId: tenant.workspaceId,
      projectId: access.projectId,
      scopeRevisionId: updated.id,
      userId: approverUserId,
    });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'scope_revision.submitted',
      entityType: 'scope_revision',
      entityId: updated.id,
      requestId: request.requestId,
      metadata: { revision: updated.revision, targetUserId: approverUserId },
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(tenant.workspaceId, access.projectId, 'scope.submitted', 'scope', updated.id),
      );
    return updated;
  });
}

export async function decideScopeRevision(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  revisionId: string,
  decision: 'agreed' | 'changes_requested',
  comment: string | null,
  request: RequestContext = {},
) {
  const access = await requireAccess(client, tenant, slug, 'project.view');
  if (access.side !== 'client') throw new WorkflowServiceError('FORBIDDEN');
  return client.db.transaction(async (tx) => {
    const [assigned] = await tx
      .select({ id: scopeRevisionApprover.id })
      .from(scopeRevisionApprover)
      .where(
        and(
          eq(scopeRevisionApprover.workspaceId, tenant.workspaceId),
          eq(scopeRevisionApprover.projectId, access.projectId),
          eq(scopeRevisionApprover.scopeRevisionId, revisionId),
          eq(scopeRevisionApprover.userId, tenant.userId),
        ),
      )
      .limit(1);
    if (!assigned) throw new WorkflowServiceError('NOT_FOUND');
    const [revision] = await tx
      .select()
      .from(projectScopeRevision)
      .where(
        and(
          eq(projectScopeRevision.id, revisionId),
          eq(projectScopeRevision.workspaceId, tenant.workspaceId),
          eq(projectScopeRevision.projectId, access.projectId),
          eq(projectScopeRevision.status, 'client_review'),
        ),
      )
      .limit(1);
    if (!revision) throw new WorkflowServiceError('CONFLICT');
    if (decision === 'changes_requested' && !comment?.trim()) {
      throw new WorkflowServiceError('INVALID_STATE');
    }
    await tx.insert(scopeApprovalDecision).values({
      workspaceId: tenant.workspaceId,
      projectId: access.projectId,
      scopeRevisionId: revision.id,
      approverUserId: tenant.userId,
      decision,
      comment: comment?.trim() || null,
    });
    if (decision === 'agreed') {
      await tx
        .update(projectScopeRevision)
        .set({ status: 'superseded', supersededAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(projectScopeRevision.projectId, access.projectId),
            eq(projectScopeRevision.workspaceId, tenant.workspaceId),
            eq(projectScopeRevision.status, 'agreed'),
            ne(projectScopeRevision.id, revision.id),
          ),
        );
      await tx
        .update(projectScopeRevision)
        .set({
          status: 'agreed',
          agreedByUserId: tenant.userId,
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
        createdByUserId: revision.createdByUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: `scope_revision.${decision}`,
      entityType: 'scope_revision',
      entityId: revision.id,
      requestId: request.requestId,
      metadata: { revision: revision.revision },
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(
          tenant.workspaceId,
          access.projectId,
          `scope.${decision}`,
          'scope',
          revision.id,
        ),
      );
    return { id: revision.id, decision };
  });
}

async function recalculateProgress(
  tx: Parameters<Parameters<DatabaseClient['db']['transaction']>[0]>[0],
  workspaceId: string,
  projectId: string,
) {
  const stages = await tx
    .select({
      weight: projectStage.weight,
      status: projectStage.status,
      countsTowardProgress: projectStage.countsTowardProgress,
      skipReason: projectStage.skipReason,
    })
    .from(projectStage)
    .where(and(eq(projectStage.workspaceId, workspaceId), eq(projectStage.projectId, projectId)));
  const progress = calculateProgress(stages);
  await tx
    .update(project)
    .set({
      progressCompletedWeight: progress.completedWeight,
      progressTotalWeight: progress.totalWeight,
      updatedAt: new Date(),
    })
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)));
  return progress;
}

export async function createStage(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  input: StageInput,
  request: RequestContext = {},
) {
  const access = await requireAccess(client, tenant, slug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: projectMembership.id })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.workspaceId, tenant.workspaceId),
          eq(projectMembership.projectId, access.projectId),
          eq(projectMembership.userId, input.ownerUserId),
          eq(projectMembership.side, 'internal'),
          isNull(projectMembership.removedAt),
        ),
      )
      .limit(1);
    if (!owner) throw new WorkflowServiceError('NOT_FOUND');
    await tx.execute(
      sql`select id from ${project} where ${project.id} = ${access.projectId} and ${project.workspaceId} = ${tenant.workspaceId} for update`,
    );
    const [last] = await tx
      .select({ orderIndex: projectStage.orderIndex })
      .from(projectStage)
      .where(eq(projectStage.projectId, access.projectId))
      .orderBy(desc(projectStage.orderIndex))
      .limit(1);
    const [created] = await tx
      .insert(projectStage)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        orderIndex: (last?.orderIndex ?? -1) + 1,
        ...input,
      })
      .returning({ id: projectStage.id });
    if (!created) throw new Error('STAGE_INSERT_FAILED');
    await recalculateProgress(tx, tenant.workspaceId, access.projectId);
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_stage.created',
      entityType: 'project_stage',
      entityId: created.id,
      requestId: request.requestId,
    });
    return created;
  });
}

export async function transitionStage(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  stageId: string,
  to: StageStatus,
  input: { resultSummary?: string | null; skipReason?: string | null },
  request: RequestContext = {},
) {
  const access = await requireAccess(client, tenant, slug, 'project.edit');
  if (to === 'approved') throw new WorkflowServiceError('INVALID_STATE');
  return client.db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        status: projectStage.status,
        resultSummary: projectStage.resultSummary,
        skipReason: projectStage.skipReason,
        actualStartAt: projectStage.actualStartAt,
        actualEndAt: projectStage.actualEndAt,
      })
      .from(projectStage)
      .where(
        and(
          eq(projectStage.id, stageId),
          eq(projectStage.projectId, access.projectId),
          eq(projectStage.workspaceId, tenant.workspaceId),
        ),
      )
      .for('update')
      .limit(1);
    if (!current) throw new WorkflowServiceError('NOT_FOUND');
    try {
      validateStageTransition(current.status, to, input);
    } catch {
      throw new WorkflowServiceError('INVALID_STATE');
    }
    await tx
      .update(projectStage)
      .set({
        status: to,
        resultSummary:
          to === 'ready_for_review' ? (input.resultSummary?.trim() ?? null) : current.resultSummary,
        skipReason:
          to === 'skipped'
            ? (input.skipReason?.trim() ?? null)
            : to === 'not_started'
              ? null
              : current.skipReason,
        actualStartAt:
          to === 'in_progress' && current.status === 'not_started'
            ? new Date()
            : current.actualStartAt,
        actualEndAt:
          to === 'skipped' ? new Date() : to === 'not_started' ? null : current.actualEndAt,
        updatedAt: new Date(),
      })
      .where(eq(projectStage.id, stageId));
    await recalculateProgress(tx, tenant.workspaceId, access.projectId);
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_stage.status_changed',
      entityType: 'project_stage',
      entityId: stageId,
      requestId: request.requestId,
      metadata: { fromStatus: current.status, toStatus: to },
    });
    return { id: stageId, status: to };
  });
}

export async function createAction(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  input: ActionInput,
  request: RequestContext = {},
) {
  const access = await requireAccess(client, tenant, slug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [assignee] = await tx
      .select({ side: projectMembership.side })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.workspaceId, tenant.workspaceId),
          eq(projectMembership.projectId, access.projectId),
          eq(projectMembership.userId, input.assigneeUserId),
          isNull(projectMembership.removedAt),
        ),
      )
      .limit(1);
    if (
      !assignee ||
      (input.visibility === 'client' && assignee.side !== 'client') ||
      (input.visibility === 'internal' && assignee.side !== 'internal')
    ) {
      throw new WorkflowServiceError('NOT_FOUND');
    }
    if (input.stageId) {
      const [stage] = await tx
        .select({ id: projectStage.id })
        .from(projectStage)
        .where(
          and(
            eq(projectStage.id, input.stageId),
            eq(projectStage.projectId, access.projectId),
            eq(projectStage.workspaceId, tenant.workspaceId),
          ),
        )
        .limit(1);
      if (!stage) throw new WorkflowServiceError('NOT_FOUND');
    }
    const [created] = await tx
      .insert(actionItem)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        createdByUserId: tenant.userId,
        ...input,
      })
      .returning({ id: actionItem.id });
    if (!created) throw new Error('ACTION_INSERT_FAILED');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'action_item.created',
      entityType: 'action_item',
      entityId: created.id,
      requestId: request.requestId,
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(tenant.workspaceId, access.projectId, 'action.created', 'action', created.id),
      );
    return created;
  });
}

export async function transitionAction(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  actionId: string,
  to: ActionStatus,
  request: RequestContext = {},
) {
  const access = await requireAccess(client, tenant, slug, 'project.view');
  return client.db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        status: actionItem.status,
        assigneeUserId: actionItem.assigneeUserId,
        visibility: actionItem.visibility,
      })
      .from(actionItem)
      .where(
        and(
          eq(actionItem.id, actionId),
          eq(actionItem.projectId, access.projectId),
          eq(actionItem.workspaceId, tenant.workspaceId),
        ),
      )
      .for('update')
      .limit(1);
    if (!current) throw new WorkflowServiceError('NOT_FOUND');
    const clientAllowed =
      access.side === 'client' &&
      current.visibility === 'client' &&
      current.assigneeUserId === tenant.userId &&
      to !== 'cancelled';
    if (access.side === 'client' && !clientAllowed) throw new WorkflowServiceError('NOT_FOUND');
    if (access.side === 'internal' && !canAccessProject(access, 'project.edit')) {
      throw new WorkflowServiceError('NOT_FOUND');
    }
    if (!canTransitionAction(current.status, to)) throw new WorkflowServiceError('CONFLICT');
    await tx
      .update(actionItem)
      .set({
        status: to,
        completedAt: to === 'done' ? new Date() : null,
        cancelledAt: to === 'cancelled' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(actionItem.id, actionId));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'action_item.status_changed',
      entityType: 'action_item',
      entityId: actionId,
      requestId: request.requestId,
      metadata: { fromStatus: current.status, toStatus: to },
    });
    return { id: actionId, status: to };
  });
}
