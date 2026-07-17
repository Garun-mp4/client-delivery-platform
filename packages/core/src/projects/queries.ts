import { and, asc, desc, eq, isNull, ne, or } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  clientCompany,
  clientMembership,
  invitation,
  invitationProjectGrant,
  project,
  projectMembership,
  user,
  workspaceMembership,
} from '@garun/db/schema';

import { isOwner } from '../identity/policies';
import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from './policies';
import type { ClientProjectDto } from './types';

export async function listClientCompanies(database: DatabaseClient['db'], tenant: TenantContext) {
  if (!isOwner(tenant)) return [];
  return database
    .select({
      id: clientCompany.id,
      name: clientCompany.name,
      email: clientCompany.email,
      website: clientCompany.website,
      status: clientCompany.status,
      updatedAt: clientCompany.updatedAt,
    })
    .from(clientCompany)
    .where(eq(clientCompany.workspaceId, tenant.workspaceId))
    .orderBy(asc(clientCompany.name));
}

export async function getInternalClientCompany(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  companyId: string,
) {
  if (!isOwner(tenant)) return null;
  const [company] = await database
    .select()
    .from(clientCompany)
    .where(and(eq(clientCompany.id, companyId), eq(clientCompany.workspaceId, tenant.workspaceId)))
    .limit(1);
  return company ?? null;
}

export async function listActiveClientCompanies(
  database: DatabaseClient['db'],
  tenant: TenantContext,
) {
  if (!isOwner(tenant)) return [];
  return database
    .select({ id: clientCompany.id, name: clientCompany.name })
    .from(clientCompany)
    .where(
      and(eq(clientCompany.workspaceId, tenant.workspaceId), eq(clientCompany.status, 'active')),
    )
    .orderBy(asc(clientCompany.name));
}

export async function listInternalWorkspaceMembers(
  database: DatabaseClient['db'],
  tenant: TenantContext,
) {
  if (!isOwner(tenant)) return [];
  return database
    .select({ id: user.id, name: user.name, email: user.email, role: workspaceMembership.role })
    .from(workspaceMembership)
    .innerJoin(user, eq(user.id, workspaceMembership.userId))
    .leftJoin(
      clientMembership,
      and(
        eq(clientMembership.workspaceId, workspaceMembership.workspaceId),
        eq(clientMembership.userId, workspaceMembership.userId),
        isNull(clientMembership.removedAt),
      ),
    )
    .where(
      and(
        eq(workspaceMembership.workspaceId, tenant.workspaceId),
        eq(workspaceMembership.status, 'active'),
        isNull(clientMembership.id),
      ),
    )
    .orderBy(asc(user.name));
}

export async function listProjects(database: DatabaseClient['db'], tenant: TenantContext) {
  if (isOwner(tenant)) {
    return database
      .select({
        id: project.id,
        clientCompanyId: project.clientCompanyId,
        slug: project.slug,
        name: project.name,
        status: project.status,
        plannedEndDate: project.plannedEndDate,
        companyName: clientCompany.name,
        role: projectMembership.role,
        side: projectMembership.side,
      })
      .from(project)
      .innerJoin(clientCompany, eq(clientCompany.id, project.clientCompanyId))
      .leftJoin(
        projectMembership,
        and(
          eq(projectMembership.projectId, project.id),
          eq(projectMembership.userId, tenant.userId),
          isNull(projectMembership.removedAt),
        ),
      )
      .where(eq(project.workspaceId, tenant.workspaceId))
      .orderBy(desc(project.updatedAt));
  }
  return database
    .select({
      id: project.id,
      clientCompanyId: project.clientCompanyId,
      slug: project.slug,
      name: project.name,
      status: project.status,
      plannedEndDate: project.plannedEndDate,
      companyName: clientCompany.name,
      role: projectMembership.role,
      side: projectMembership.side,
    })
    .from(projectMembership)
    .innerJoin(
      project,
      and(eq(project.id, projectMembership.projectId), eq(project.workspaceId, tenant.workspaceId)),
    )
    .innerJoin(clientCompany, eq(clientCompany.id, project.clientCompanyId))
    .where(
      and(
        eq(projectMembership.workspaceId, tenant.workspaceId),
        eq(projectMembership.userId, tenant.userId),
        isNull(projectMembership.removedAt),
        or(eq(projectMembership.side, 'internal'), ne(project.status, 'draft')),
      ),
    )
    .orderBy(desc(project.updatedAt));
}

export async function getInternalProject(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  slug: string,
) {
  const access = await resolveProjectAccess(database, tenant, slug);
  if (!canAccessProject(access, 'project.view.internal')) return null;
  const [row] = await database
    .select({
      id: project.id,
      workspaceId: project.workspaceId,
      clientCompanyId: project.clientCompanyId,
      companyName: clientCompany.name,
      name: project.name,
      slug: project.slug,
      description: project.description,
      projectType: project.projectType,
      status: project.status,
      ownerUserId: project.ownerUserId,
      ownerName: user.name,
      plannedStartDate: project.plannedStartDate,
      plannedEndDate: project.plannedEndDate,
      publishedAt: project.publishedAt,
      archivedAt: project.archivedAt,
    })
    .from(project)
    .innerJoin(clientCompany, eq(clientCompany.id, project.clientCompanyId))
    .innerJoin(user, eq(user.id, project.ownerUserId))
    .where(and(eq(project.id, access!.projectId), eq(project.workspaceId, tenant.workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function getClientProject(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  slug: string,
  preview = false,
): Promise<ClientProjectDto | null> {
  const access = await resolveProjectAccess(database, tenant, slug);
  const ownerPreview = preview && isOwner(tenant) && access;
  const effective = ownerPreview ? { ...access, side: 'client' as const } : access;
  if (!ownerPreview && !canAccessProject(effective, 'project.view')) return null;
  if (!preview && effective?.side !== 'client') return null;
  const [row] = await database
    .select({
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      projectType: project.projectType,
      status: project.status,
      plannedStartDate: project.plannedStartDate,
      plannedEndDate: project.plannedEndDate,
      companyName: clientCompany.name,
    })
    .from(project)
    .innerJoin(clientCompany, eq(clientCompany.id, project.clientCompanyId))
    .where(and(eq(project.id, effective!.projectId), eq(project.workspaceId, tenant.workspaceId)))
    .limit(1);
  if (!row || (!preview && row.status === 'draft')) return null;
  const role = effective?.role === 'observer' ? 'observer' : 'client';
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    projectType: row.projectType,
    status: row.status,
    plannedStartDate: row.plannedStartDate,
    plannedEndDate: row.plannedEndDate,
    company: { name: row.companyName },
    access: { role, readOnly: true },
  };
}

export async function listProjectMembers(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  slug: string,
) {
  const access = await resolveProjectAccess(database, tenant, slug);
  if (!canAccessProject(access, 'project.view.internal')) return [];
  return database
    .select({
      id: projectMembership.id,
      userId: projectMembership.userId,
      name: user.name,
      email: user.email,
      side: projectMembership.side,
      role: projectMembership.role,
      permissions: projectMembership.permissions,
    })
    .from(projectMembership)
    .innerJoin(user, eq(user.id, projectMembership.userId))
    .where(
      and(
        eq(projectMembership.workspaceId, tenant.workspaceId),
        eq(projectMembership.projectId, access!.projectId),
        isNull(projectMembership.removedAt),
      ),
    )
    .orderBy(asc(user.name));
}

export async function listProjectInvitations(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  slug: string,
) {
  const access = await resolveProjectAccess(database, tenant, slug);
  if (!canAccessProject(access, 'project.view.internal')) return [];
  return database
    .select({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      role: invitationProjectGrant.role,
    })
    .from(invitationProjectGrant)
    .innerJoin(
      invitation,
      and(
        eq(invitation.id, invitationProjectGrant.invitationId),
        eq(invitation.workspaceId, invitationProjectGrant.workspaceId),
      ),
    )
    .where(
      and(
        eq(invitationProjectGrant.workspaceId, tenant.workspaceId),
        eq(invitationProjectGrant.projectId, access!.projectId),
      ),
    )
    .orderBy(desc(invitation.createdAt));
}
