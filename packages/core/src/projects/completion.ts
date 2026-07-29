import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  actionItem,
  approvalRequest,
  auditEvent,
  outboxEvent,
  project,
  projectHandoverChecklistItem,
  projectStage,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from './policies';

export const handoverChecklist = [
  { key: 'production_url', label: 'Рабочий адрес сайта передан клиенту' },
  { key: 'access_transfer', label: 'Необходимые доступы переданы безопасным способом' },
  { key: 'backup', label: 'Резервная копия подготовлена' },
  { key: 'instructions', label: 'Инструкция по работе и поддержке передана' },
] as const;

export type HandoverChecklistKey = (typeof handoverChecklist)[number]['key'];

export class ProjectCompletionError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'INVALID_STATE'
      | 'STAGES_INCOMPLETE'
      | 'BLOCKING_ACTIONS'
      | 'FINAL_APPROVAL_REQUIRED'
      | 'HANDOVER_INCOMPLETE',
  ) {
    super(code);
    this.name = 'ProjectCompletionError';
  }
}

async function requireCompletionAccess(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.complete')) throw new ProjectCompletionError('NOT_FOUND');
  return access!;
}

export async function getProjectCompletionState(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await requireCompletionAccess(client, tenant, projectSlug);
  const [stages, blockingActions, latestApproval, storedItems] = await Promise.all([
    client.db
      .select({
        id: projectStage.id,
        name: projectStage.name,
        status: projectStage.status,
        skipReason: projectStage.skipReason,
      })
      .from(projectStage)
      .where(
        and(
          eq(projectStage.workspaceId, tenant.workspaceId),
          eq(projectStage.projectId, access.projectId),
          eq(projectStage.isRequired, true),
        ),
      ),
    client.db
      .select({ id: actionItem.id })
      .from(actionItem)
      .where(
        and(
          eq(actionItem.workspaceId, tenant.workspaceId),
          eq(actionItem.projectId, access.projectId),
          eq(actionItem.isBlocking, true),
          inArray(actionItem.status, ['open', 'in_progress']),
        ),
      ),
    client.db
      .select({ id: approvalRequest.id, status: approvalRequest.status })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.workspaceId, tenant.workspaceId),
          eq(approvalRequest.projectId, access.projectId),
          eq(approvalRequest.entityType, 'final_handover'),
        ),
      )
      .orderBy(desc(approvalRequest.createdAt))
      .limit(1),
    client.db
      .select()
      .from(projectHandoverChecklistItem)
      .where(
        and(
          eq(projectHandoverChecklistItem.workspaceId, tenant.workspaceId),
          eq(projectHandoverChecklistItem.projectId, access.projectId),
        ),
      ),
  ]);
  const storedByKey = new Map(storedItems.map((item) => [item.itemKey, item]));
  const checklist = handoverChecklist.map((definition) => ({
    ...definition,
    completedAt: storedByKey.get(definition.key)?.completedAt ?? null,
  }));
  const stagesReady = stages.every(
    (stage) =>
      stage.status === 'approved' ||
      (stage.status === 'skipped' && Boolean(stage.skipReason?.trim())),
  );
  const finalApprovalReady = latestApproval[0]?.status === 'approved';
  const handoverReady = checklist.every((item) => item.completedAt !== null);
  return {
    projectId: access.projectId,
    stages,
    blockingActions: blockingActions.length,
    finalApprovalStatus: latestApproval[0]?.status ?? null,
    checklist,
    gates: {
      stagesReady,
      noBlockingActions: blockingActions.length === 0,
      finalApprovalReady,
      handoverReady,
    },
    canComplete: stagesReady && blockingActions.length === 0 && finalApprovalReady && handoverReady,
  };
}

export async function setHandoverChecklistItem(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  itemKey: HandoverChecklistKey,
  completed: boolean,
  requestId?: string,
) {
  const definition = handoverChecklist.find((item) => item.key === itemKey);
  if (!definition) throw new ProjectCompletionError('NOT_FOUND');
  const access = await requireCompletionAccess(client, tenant, projectSlug);
  if (access.projectStatus === 'archived' || access.projectStatus === 'completed') {
    throw new ProjectCompletionError('INVALID_STATE');
  }
  await client.db.transaction(async (tx) => {
    await tx
      .insert(projectHandoverChecklistItem)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        itemKey,
        label: definition.label,
        completedAt: completed ? new Date() : null,
        completedByUserId: completed ? tenant.userId : null,
      })
      .onConflictDoUpdate({
        target: [projectHandoverChecklistItem.projectId, projectHandoverChecklistItem.itemKey],
        set: {
          label: definition.label,
          completedAt: completed ? new Date() : null,
          completedByUserId: completed ? tenant.userId : null,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: completed ? 'handover.item_completed' : 'handover.item_reopened',
      entityType: 'project',
      entityId: access.projectId,
      requestId,
      metadata: { source: itemKey },
    });
  });
}

export async function completeProject(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  requestId?: string,
) {
  const access = await requireCompletionAccess(client, tenant, projectSlug);
  return client.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: project.id, status: project.status })
      .from(project)
      .where(and(eq(project.id, access.projectId), eq(project.workspaceId, tenant.workspaceId)))
      .for('update')
      .limit(1);
    if (!current) throw new ProjectCompletionError('NOT_FOUND');
    if (current.status === 'completed') return current;
    if (current.status === 'archived') throw new ProjectCompletionError('INVALID_STATE');

    const [invalidStage] = await tx
      .select({ id: projectStage.id })
      .from(projectStage)
      .where(
        and(
          eq(projectStage.workspaceId, tenant.workspaceId),
          eq(projectStage.projectId, current.id),
          eq(projectStage.isRequired, true),
          orStageIncomplete(),
        ),
      )
      .limit(1);
    if (invalidStage) throw new ProjectCompletionError('STAGES_INCOMPLETE');
    const [blocking] = await tx
      .select({ id: actionItem.id })
      .from(actionItem)
      .where(
        and(
          eq(actionItem.workspaceId, tenant.workspaceId),
          eq(actionItem.projectId, current.id),
          eq(actionItem.isBlocking, true),
          inArray(actionItem.status, ['open', 'in_progress']),
        ),
      )
      .limit(1);
    if (blocking) throw new ProjectCompletionError('BLOCKING_ACTIONS');
    const [latestFinalApproval] = await tx
      .select({ status: approvalRequest.status })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.workspaceId, tenant.workspaceId),
          eq(approvalRequest.projectId, current.id),
          eq(approvalRequest.entityType, 'final_handover'),
        ),
      )
      .orderBy(desc(approvalRequest.createdAt))
      .limit(1);
    if (latestFinalApproval?.status !== 'approved') {
      throw new ProjectCompletionError('FINAL_APPROVAL_REQUIRED');
    }
    const items = await tx
      .select({
        key: projectHandoverChecklistItem.itemKey,
        completedAt: projectHandoverChecklistItem.completedAt,
      })
      .from(projectHandoverChecklistItem)
      .where(
        and(
          eq(projectHandoverChecklistItem.workspaceId, tenant.workspaceId),
          eq(projectHandoverChecklistItem.projectId, current.id),
          eq(projectHandoverChecklistItem.required, true),
        ),
      );
    const completedKeys = new Set(items.filter((item) => item.completedAt).map((item) => item.key));
    if (!handoverChecklist.every((item) => completedKeys.has(item.key))) {
      throw new ProjectCompletionError('HANDOVER_INCOMPLETE');
    }
    const now = new Date();
    await tx
      .update(project)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(and(eq(project.id, current.id), ne(project.status, 'archived')));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project.completed',
      entityType: 'project',
      entityId: current.id,
      requestId,
    });
    await tx.insert(outboxEvent).values({
      workspaceId: tenant.workspaceId,
      eventType: 'project.completed',
      aggregateType: 'project',
      aggregateId: current.id,
      payload: {
        template: 'domain-event',
        projectId: current.id,
        entityType: 'project',
      },
    });
    return { id: current.id, status: 'completed' as const };
  });
}

function orStageIncomplete() {
  return inArray(projectStage.status, [
    'not_started',
    'in_progress',
    'waiting_for_client',
    'ready_for_review',
    'changes_requested',
  ]);
}
