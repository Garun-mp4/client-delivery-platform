import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  actionItem,
  clientMembership,
  project,
  projectMembership,
  projectScopeRevision,
  projectStage,
  scopeRevisionApprover,
  user,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { isOwner } from '../identity/policies';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { compareActions } from './state-machines';

export async function getProjectWorkflow(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  slug: string,
) {
  if (tenant.membershipStatus !== 'active' || tenant.workspaceStatus !== 'active') return null;
  const access = await resolveProjectAccess(database, tenant, slug);
  if (!canAccessProject(access, 'project.view')) return null;
  const clientFilter = access?.side === 'client' ? eq(projectStage.clientVisible, true) : undefined;
  const [projectRow, revisions, stages, actions] = await Promise.all([
    database
      .select({
        id: project.id,
        name: project.name,
        status: project.status,
        progressCompletedWeight: project.progressCompletedWeight,
        progressTotalWeight: project.progressTotalWeight,
      })
      .from(project)
      .where(and(eq(project.id, access!.projectId), eq(project.workspaceId, tenant.workspaceId)))
      .limit(1),
    database
      .select()
      .from(projectScopeRevision)
      .where(
        and(
          eq(projectScopeRevision.projectId, access!.projectId),
          eq(projectScopeRevision.workspaceId, tenant.workspaceId),
          access?.side === 'client'
            ? inArray(projectScopeRevision.status, ['client_review', 'agreed'])
            : undefined,
        ),
      )
      .orderBy(desc(projectScopeRevision.revision)),
    database
      .select()
      .from(projectStage)
      .where(
        and(
          eq(projectStage.projectId, access!.projectId),
          eq(projectStage.workspaceId, tenant.workspaceId),
          clientFilter,
        ),
      )
      .orderBy(asc(projectStage.orderIndex)),
    database
      .select({
        id: actionItem.id,
        stageId: actionItem.stageId,
        title: actionItem.title,
        description: actionItem.description,
        type: actionItem.type,
        status: actionItem.status,
        priority: actionItem.priority,
        visibility: actionItem.visibility,
        assigneeUserId: actionItem.assigneeUserId,
        assigneeName: user.name,
        dueAt: actionItem.dueAt,
        isBlocking: actionItem.isBlocking,
        createdAt: actionItem.createdAt,
      })
      .from(actionItem)
      .innerJoin(user, eq(user.id, actionItem.assigneeUserId))
      .where(
        and(
          eq(actionItem.projectId, access!.projectId),
          eq(actionItem.workspaceId, tenant.workspaceId),
          access?.side === 'client' ? eq(actionItem.visibility, 'client') : undefined,
        ),
      )
      .orderBy(asc(actionItem.dueAt)),
  ]);
  if (!projectRow[0]) return null;
  const visibleActions =
    access?.side === 'client'
      ? actions.filter((action) => action.assigneeUserId === tenant.userId)
      : actions;
  const openActions = visibleActions
    .filter((action) => action.status === 'open' || action.status === 'in_progress')
    .sort((left, right) => compareActions(left, right));
  const blockedByClient =
    [...visibleActions]
      .filter(
        (action) =>
          action.isBlocking &&
          action.visibility === 'client' &&
          (action.status === 'open' || action.status === 'in_progress'),
      )
      .sort((left, right) => compareActions(left, right))[0] ?? null;
  return {
    access: access!,
    project: projectRow[0],
    revisions,
    stages,
    actions: visibleActions,
    nextAction: openActions[0] ?? null,
    blockedByClient,
    progressPercent:
      projectRow[0].progressTotalWeight === 0
        ? 0
        : Math.round(
            (projectRow[0].progressCompletedWeight / projectRow[0].progressTotalWeight) * 100,
          ),
  };
}

export async function listWorkflowAssignees(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  slug: string,
) {
  const access = await resolveProjectAccess(database, tenant, slug);
  if (!canAccessProject(access, 'project.view.internal')) return [];
  return database
    .select({
      userId: projectMembership.userId,
      name: user.name,
      side: projectMembership.side,
      role: projectMembership.role,
      canApprove: clientMembership.canApprove,
    })
    .from(projectMembership)
    .innerJoin(user, eq(user.id, projectMembership.userId))
    .leftJoin(
      clientMembership,
      and(
        eq(clientMembership.workspaceId, projectMembership.workspaceId),
        eq(clientMembership.userId, projectMembership.userId),
        isNull(clientMembership.removedAt),
      ),
    )
    .where(
      and(
        eq(projectMembership.workspaceId, tenant.workspaceId),
        eq(projectMembership.projectId, access!.projectId),
        isNull(projectMembership.removedAt),
      ),
    )
    .orderBy(asc(user.name));
}

export async function isAssignedScopeApprover(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  revisionId: string,
) {
  const [row] = await database
    .select({ id: scopeRevisionApprover.id })
    .from(scopeRevisionApprover)
    .where(
      and(
        eq(scopeRevisionApprover.workspaceId, tenant.workspaceId),
        eq(scopeRevisionApprover.scopeRevisionId, revisionId),
        eq(scopeRevisionApprover.userId, tenant.userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listWorkspaceWorkflowOverview(
  database: DatabaseClient['db'],
  tenant: TenantContext,
) {
  if (
    !isOwner(tenant) ||
    tenant.membershipStatus !== 'active' ||
    tenant.workspaceStatus !== 'active'
  ) {
    return [];
  }
  const [projects, blockingActions] = await Promise.all([
    database
      .select({
        id: project.id,
        progressCompletedWeight: project.progressCompletedWeight,
        progressTotalWeight: project.progressTotalWeight,
      })
      .from(project)
      .where(eq(project.workspaceId, tenant.workspaceId)),
    database
      .select({
        projectId: actionItem.projectId,
        id: actionItem.id,
        title: actionItem.title,
        priority: actionItem.priority,
        dueAt: actionItem.dueAt,
        createdAt: actionItem.createdAt,
      })
      .from(actionItem)
      .where(
        and(
          eq(actionItem.workspaceId, tenant.workspaceId),
          eq(actionItem.visibility, 'client'),
          eq(actionItem.isBlocking, true),
          inArray(actionItem.status, ['open', 'in_progress']),
        ),
      ),
  ]);
  return projects.map((item) => {
    const blockingAction =
      blockingActions
        .filter((action) => action.projectId === item.id)
        .sort((left, right) => compareActions(left, right))[0] ?? null;
    return {
      projectId: item.id,
      progressPercent:
        item.progressTotalWeight === 0
          ? 0
          : Math.round((item.progressCompletedWeight / item.progressTotalWeight) * 100),
      blockingAction,
    };
  });
}
