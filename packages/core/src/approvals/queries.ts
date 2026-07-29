import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  approvalDecision,
  approvalRequest,
  approvalRequestApprover,
  auditEvent,
  externalDecisionRecord,
  fileLink,
  fileObject,
  projectScopeRevision,
  projectStage,
  siteVersion,
  user,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { ApprovalServiceError } from './services';

export async function getProjectApprovals(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) throw new ApprovalServiceError('NOT_FOUND');
  const assignedFilter =
    access!.side === 'client'
      ? inArray(
          approvalRequest.id,
          client.db
            .select({ id: approvalRequestApprover.approvalRequestId })
            .from(approvalRequestApprover)
            .where(
              and(
                eq(approvalRequestApprover.workspaceId, tenant.workspaceId),
                eq(approvalRequestApprover.userId, tenant.userId),
              ),
            ),
        )
      : undefined;
  const requests = await client.db
    .select()
    .from(approvalRequest)
    .where(
      and(
        eq(approvalRequest.workspaceId, tenant.workspaceId),
        eq(approvalRequest.projectId, access!.projectId),
        assignedFilter,
      ),
    )
    .orderBy(desc(approvalRequest.createdAt));
  if (requests.length === 0) {
    return { access: access!, requests: [], approvers: [], decisions: [], external: [] };
  }
  const requestIds = requests.map((item) => item.id);
  const [approvers, decisions, external] = await Promise.all([
    client.db
      .select({
        requestId: approvalRequestApprover.approvalRequestId,
        userId: approvalRequestApprover.userId,
        name: user.name,
      })
      .from(approvalRequestApprover)
      .innerJoin(user, eq(user.id, approvalRequestApprover.userId))
      .where(inArray(approvalRequestApprover.approvalRequestId, requestIds)),
    client.db
      .select({
        id: approvalDecision.id,
        requestId: approvalDecision.approvalRequestId,
        approverUserId: approvalDecision.approverUserId,
        decision: approvalDecision.decision,
        comment: approvalDecision.comment,
        decidedAt: approvalDecision.decidedAt,
      })
      .from(approvalDecision)
      .where(inArray(approvalDecision.approvalRequestId, requestIds)),
    client.db
      .select({
        id: externalDecisionRecord.id,
        requestId: externalDecisionRecord.approvalRequestId,
        decision: externalDecisionRecord.decision,
        source: externalDecisionRecord.source,
        sourceDecisionAt: externalDecisionRecord.sourceDecisionAt,
        explanation: externalDecisionRecord.explanation,
        recordedByUserId: externalDecisionRecord.recordedByUserId,
        createdAt: externalDecisionRecord.createdAt,
      })
      .from(externalDecisionRecord)
      .where(inArray(externalDecisionRecord.approvalRequestId, requestIds)),
  ]);
  return { access: access!, requests, approvers, decisions, external };
}

export async function listApprovalTargets(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.edit')) throw new ApprovalServiceError('NOT_FOUND');
  const [scopes, stages, versions, files] = await Promise.all([
    client.db
      .select({ id: projectScopeRevision.id, revision: projectScopeRevision.revision })
      .from(projectScopeRevision)
      .where(
        and(
          eq(projectScopeRevision.workspaceId, tenant.workspaceId),
          eq(projectScopeRevision.projectId, access!.projectId),
          eq(projectScopeRevision.status, 'draft'),
        ),
      ),
    client.db
      .select({ id: projectStage.id, name: projectStage.name })
      .from(projectStage)
      .where(
        and(
          eq(projectStage.workspaceId, tenant.workspaceId),
          eq(projectStage.projectId, access!.projectId),
          eq(projectStage.status, 'ready_for_review'),
          eq(projectStage.clientVisible, true),
        ),
      ),
    client.db
      .select({ id: siteVersion.id, name: siteVersion.name, version: siteVersion.versionNumber })
      .from(siteVersion)
      .where(
        and(
          eq(siteVersion.workspaceId, tenant.workspaceId),
          eq(siteVersion.projectId, access!.projectId),
          eq(siteVersion.clientVisible, true),
          eq(siteVersion.securityStatus, 'safe'),
          eq(siteVersion.availabilityStatus, 'reachable'),
        ),
      ),
    client.db
      .selectDistinct({ id: fileObject.id, name: fileObject.normalizedName })
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
          eq(fileObject.workspaceId, tenant.workspaceId),
          eq(fileObject.projectId, access!.projectId),
          eq(fileObject.uploadStatus, 'available'),
          eq(fileObject.scanStatus, 'clean'),
          isNull(fileObject.deletedAt),
        ),
      ),
  ]);
  return {
    scopes,
    stages,
    versions,
    files,
    finalHandover: true,
  };
}

const clientAuditActions = new Set([
  'approval_request.created',
  'approval_request.cancelled',
  'approval_request.invalidated',
  'approval_decision.approved',
  'approval_decision.changes_requested',
  'approval_decision.recorded_externally',
]);

export async function listApprovalAudit(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  filters: { readonly action?: string; readonly actorUserId?: string } = {},
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) throw new ApprovalServiceError('NOT_FOUND');
  const assignedRequestIds =
    access!.side === 'client'
      ? client.db
          .select({ id: approvalRequestApprover.approvalRequestId })
          .from(approvalRequestApprover)
          .where(
            and(
              eq(approvalRequestApprover.workspaceId, tenant.workspaceId),
              eq(approvalRequestApprover.userId, tenant.userId),
            ),
          )
      : undefined;
  const requestIds = client.db
    .select({ id: approvalRequest.id })
    .from(approvalRequest)
    .where(
      and(
        eq(approvalRequest.workspaceId, tenant.workspaceId),
        eq(approvalRequest.projectId, access!.projectId),
        assignedRequestIds ? inArray(approvalRequest.id, assignedRequestIds) : undefined,
      ),
    );
  const allowedActions =
    access!.side === 'client'
      ? [...clientAuditActions]
      : filters.action && clientAuditActions.has(filters.action)
        ? [filters.action]
        : [...clientAuditActions];
  const rows = await client.db
    .select({
      id: auditEvent.id,
      actorUserId: auditEvent.actorUserId,
      action: auditEvent.action,
      entityId: auditEvent.entityId,
      createdAt: auditEvent.createdAt,
      actorName: user.name,
    })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .where(
      and(
        eq(auditEvent.workspaceId, tenant.workspaceId),
        inArray(auditEvent.entityId, requestIds),
        inArray(auditEvent.action, allowedActions),
        filters.actorUserId && access!.side === 'internal'
          ? eq(auditEvent.actorUserId, filters.actorUserId)
          : undefined,
      ),
    )
    .orderBy(desc(auditEvent.createdAt))
    .limit(200);
  return rows;
}
