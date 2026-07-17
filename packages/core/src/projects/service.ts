import { and, eq, isNull, ne } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  auditEvent,
  clientCompany,
  clientMembership,
  project,
  projectMembership,
  workspaceMembership,
} from '@garun/db/schema';

import { can, isOwner } from '../identity/policies';
import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from './policies';
import type { ClientCompanyInput, ProjectInput, ProjectPermission } from './types';

export type ProjectServiceErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID_STATE';

export class ProjectServiceError extends Error {
  constructor(readonly code: ProjectServiceErrorCode) {
    super(code);
    this.name = 'ProjectServiceError';
  }
}

interface RequestContext {
  readonly requestId?: string;
}

function requireWorkspacePermission(tenant: TenantContext, permission: Parameters<typeof can>[1]) {
  if (!can(tenant, permission)) throw new ProjectServiceError('FORBIDDEN');
}

export async function createClientCompany(
  client: DatabaseClient,
  tenant: TenantContext,
  input: ClientCompanyInput,
  request: RequestContext = {},
) {
  requireWorkspacePermission(tenant, 'clients.manage');
  return client.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(clientCompany)
      .values({ workspaceId: tenant.workspaceId, ...input })
      .returning({ id: clientCompany.id });
    if (!created) throw new Error('CLIENT_COMPANY_INSERT_FAILED');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'client_company.created',
      entityType: 'client_company',
      entityId: created.id,
      requestId: request.requestId,
    });
    return created;
  });
}

export async function updateClientCompany(
  client: DatabaseClient,
  tenant: TenantContext,
  companyId: string,
  input: ClientCompanyInput,
  request: RequestContext = {},
) {
  requireWorkspacePermission(tenant, 'clients.manage');
  return client.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(clientCompany)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(clientCompany.id, companyId),
          eq(clientCompany.workspaceId, tenant.workspaceId),
          eq(clientCompany.status, 'active'),
        ),
      )
      .returning({ id: clientCompany.id });
    if (!updated) throw new ProjectServiceError('NOT_FOUND');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'client_company.updated',
      entityType: 'client_company',
      entityId: updated.id,
      requestId: request.requestId,
    });
    return updated;
  });
}

export async function setClientCompanyArchived(
  client: DatabaseClient,
  tenant: TenantContext,
  companyId: string,
  archived: boolean,
  request: RequestContext = {},
) {
  requireWorkspacePermission(tenant, 'clients.manage');
  return client.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(clientCompany)
      .set({
        status: archived ? 'archived' : 'active',
        archivedAt: archived ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientCompany.id, companyId),
          eq(clientCompany.workspaceId, tenant.workspaceId),
          archived ? eq(clientCompany.status, 'active') : eq(clientCompany.status, 'archived'),
        ),
      )
      .returning({ id: clientCompany.id });
    if (!updated) throw new ProjectServiceError('NOT_FOUND');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: archived ? 'client_company.archived' : 'client_company.restored',
      entityType: 'client_company',
      entityId: updated.id,
      requestId: request.requestId,
    });
    return updated;
  });
}

export async function createProject(
  client: DatabaseClient,
  tenant: TenantContext,
  input: ProjectInput,
  request: RequestContext = {},
) {
  requireWorkspacePermission(tenant, 'projects.create');
  return client.db.transaction(async (tx) => {
    const [company] = await tx
      .select({ id: clientCompany.id })
      .from(clientCompany)
      .where(
        and(
          eq(clientCompany.id, input.clientCompanyId),
          eq(clientCompany.workspaceId, tenant.workspaceId),
          eq(clientCompany.status, 'active'),
        ),
      )
      .limit(1);
    const [responsible] = await tx
      .select({ id: workspaceMembership.id })
      .from(workspaceMembership)
      .where(
        and(
          eq(workspaceMembership.workspaceId, tenant.workspaceId),
          eq(workspaceMembership.userId, input.ownerUserId),
          eq(workspaceMembership.status, 'active'),
        ),
      )
      .limit(1);
    if (!company || !responsible) throw new ProjectServiceError('NOT_FOUND');
    const [created] = await tx
      .insert(project)
      .values({ workspaceId: tenant.workspaceId, ...input })
      .returning({ id: project.id, slug: project.slug });
    if (!created) throw new Error('PROJECT_INSERT_FAILED');
    await tx.insert(projectMembership).values({
      workspaceId: tenant.workspaceId,
      projectId: created.id,
      userId: input.ownerUserId,
      side: 'internal',
      role: 'owner',
    });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project.created',
      entityType: 'project',
      entityId: created.id,
      requestId: request.requestId,
    });
    return created;
  });
}

async function requireProjectPermission(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  permission: ProjectPermission,
) {
  const access = await resolveProjectAccess(client.db, tenant, slug);
  if (!canAccessProject(access, permission)) throw new ProjectServiceError('NOT_FOUND');
  return access!;
}

export async function updateProject(
  client: DatabaseClient,
  tenant: TenantContext,
  currentSlug: string,
  input: ProjectInput,
  request: RequestContext = {},
) {
  const access = await requireProjectPermission(client, tenant, currentSlug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [company] = await tx
      .select({ id: clientCompany.id })
      .from(clientCompany)
      .where(
        and(
          eq(clientCompany.id, input.clientCompanyId),
          eq(clientCompany.workspaceId, tenant.workspaceId),
          eq(clientCompany.status, 'active'),
        ),
      )
      .limit(1);
    const [responsible] = await tx
      .select({ id: workspaceMembership.id })
      .from(workspaceMembership)
      .where(
        and(
          eq(workspaceMembership.workspaceId, tenant.workspaceId),
          eq(workspaceMembership.userId, input.ownerUserId),
          eq(workspaceMembership.status, 'active'),
        ),
      )
      .limit(1);
    if (!company || !responsible) throw new ProjectServiceError('NOT_FOUND');
    const [updated] = await tx
      .update(project)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(project.id, access.projectId),
          eq(project.workspaceId, tenant.workspaceId),
          ne(project.status, 'archived'),
        ),
      )
      .returning({ id: project.id, slug: project.slug });
    if (!updated) throw new ProjectServiceError('NOT_FOUND');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project.updated',
      entityType: 'project',
      entityId: updated.id,
      requestId: request.requestId,
    });
    return updated;
  });
}

export async function publishProject(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  request: RequestContext = {},
) {
  const access = await requireProjectPermission(client, tenant, slug, 'project.publish');
  return client.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(project)
      .set({ status: 'onboarding', publishedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(project.id, access.projectId),
          eq(project.workspaceId, tenant.workspaceId),
          eq(project.status, 'draft'),
        ),
      )
      .returning({ id: project.id });
    if (!updated) throw new ProjectServiceError('INVALID_STATE');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project.published',
      entityType: 'project',
      entityId: updated.id,
      requestId: request.requestId,
    });
  });
}

export async function setProjectArchived(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  archived: boolean,
  request: RequestContext = {},
) {
  const access = archived
    ? await requireProjectPermission(client, tenant, slug, 'project.archive')
    : await resolveProjectAccess(client.db, tenant, slug);
  if (!access || (!archived && !isOwner(tenant))) throw new ProjectServiceError('NOT_FOUND');
  return client.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: project.status, statusBeforeArchive: project.statusBeforeArchive })
      .from(project)
      .where(and(eq(project.id, access.projectId), eq(project.workspaceId, tenant.workspaceId)))
      .for('update')
      .limit(1);
    if (!current) throw new ProjectServiceError('NOT_FOUND');
    if (archived && current.status === 'archived') throw new ProjectServiceError('INVALID_STATE');
    if (!archived && current.status !== 'archived') throw new ProjectServiceError('INVALID_STATE');
    const restoredStatus =
      current.statusBeforeArchive && current.statusBeforeArchive !== 'archived'
        ? current.statusBeforeArchive
        : 'draft';
    await tx
      .update(project)
      .set({
        status: archived ? 'archived' : restoredStatus,
        statusBeforeArchive: archived ? current.status : null,
        archivedAt: archived ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(project.id, access.projectId), eq(project.workspaceId, tenant.workspaceId)));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: archived ? 'project.archived' : 'project.restored',
      entityType: 'project',
      entityId: access.projectId,
      requestId: request.requestId,
    });
  });
}

export async function addInternalProjectMember(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  userId: string,
  grants: readonly ProjectPermission[],
  request: RequestContext = {},
) {
  const access = await requireProjectPermission(client, tenant, slug, 'project.members.manage');
  return client.db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: workspaceMembership.id })
      .from(workspaceMembership)
      .where(
        and(
          eq(workspaceMembership.workspaceId, tenant.workspaceId),
          eq(workspaceMembership.userId, userId),
          eq(workspaceMembership.status, 'active'),
        ),
      )
      .limit(1);
    if (!member) throw new ProjectServiceError('NOT_FOUND');
    const [clientSide] = await tx
      .select({ id: clientMembership.id })
      .from(clientMembership)
      .where(
        and(
          eq(clientMembership.workspaceId, tenant.workspaceId),
          eq(clientMembership.userId, userId),
          isNull(clientMembership.removedAt),
        ),
      )
      .limit(1);
    if (clientSide) throw new ProjectServiceError('CONFLICT');
    const [created] = await tx
      .insert(projectMembership)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        userId,
        side: 'internal',
        role: 'employee',
        permissions: { version: 1, grants: [...new Set(grants)] },
      })
      .onConflictDoUpdate({
        target: [projectMembership.projectId, projectMembership.userId],
        set: {
          side: 'internal',
          role: 'employee',
          permissions: { version: 1, grants: [...new Set(grants)] },
          joinedAt: new Date(),
          removedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: projectMembership.id });
    if (!created) throw new Error('PROJECT_MEMBERSHIP_UPSERT_FAILED');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_membership.created',
      entityType: 'project_membership',
      entityId: created.id,
      requestId: request.requestId,
      metadata: { targetUserId: userId },
    });
    return created;
  });
}

export async function removeProjectMember(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  membershipId: string,
  request: RequestContext = {},
) {
  const access = await requireProjectPermission(client, tenant, slug, 'project.members.manage');
  if (access.projectStatus === 'archived') throw new ProjectServiceError('INVALID_STATE');
  return client.db.transaction(async (tx) => {
    const [removed] = await tx
      .update(projectMembership)
      .set({ removedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(projectMembership.id, membershipId),
          eq(projectMembership.workspaceId, tenant.workspaceId),
          eq(projectMembership.projectId, access.projectId),
          ne(projectMembership.role, 'owner'),
        ),
      )
      .returning({ id: projectMembership.id, userId: projectMembership.userId });
    if (!removed) throw new ProjectServiceError('NOT_FOUND');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_membership.removed',
      entityType: 'project_membership',
      entityId: removed.id,
      requestId: request.requestId,
      metadata: { targetUserId: removed.userId },
    });
    return removed;
  });
}
