import { and, eq, isNull } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import { project, projectMembership } from '@garun/db/schema';

import { isOwner } from '../identity/policies';
import type { TenantContext } from '../identity/tenant';
import {
  projectPermissions,
  type ProjectAccessContext,
  type ProjectPermission,
  type ProjectRole,
} from './types';

const rolePermissions: Readonly<Record<ProjectRole, ReadonlySet<ProjectPermission>>> = {
  owner: new Set(projectPermissions),
  employee: new Set(['project.view']),
  client: new Set(['project.view']),
  observer: new Set(['project.view']),
};

export function canAccessProject(
  context: ProjectAccessContext | null,
  permission: ProjectPermission,
): boolean {
  if (!context) return false;
  if (context.side === 'client' && context.projectStatus === 'draft') return false;
  if (
    context.projectStatus === 'archived' &&
    permission !== 'project.view' &&
    permission !== 'project.view.internal'
  ) {
    return false;
  }
  const explicit = context.explicitGrants.filter((item): item is ProjectPermission =>
    projectPermissions.includes(item as ProjectPermission),
  );
  return rolePermissions[context.role].has(permission) || explicit.includes(permission);
}

export async function resolveProjectAccess(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  projectSlug: string,
): Promise<ProjectAccessContext | null> {
  const [row] = await database
    .select({
      projectId: project.id,
      projectSlug: project.slug,
      projectStatus: project.status,
      side: projectMembership.side,
      role: projectMembership.role,
      permissions: projectMembership.permissions,
    })
    .from(project)
    .leftJoin(
      projectMembership,
      and(
        eq(projectMembership.projectId, project.id),
        eq(projectMembership.workspaceId, tenant.workspaceId),
        eq(projectMembership.userId, tenant.userId),
        isNull(projectMembership.removedAt),
      ),
    )
    .where(and(eq(project.workspaceId, tenant.workspaceId), eq(project.slug, projectSlug)))
    .limit(1);
  if (!row) return null;
  if (isOwner(tenant)) {
    return {
      tenant,
      projectId: row.projectId,
      projectSlug: row.projectSlug,
      projectStatus: row.projectStatus,
      side: 'internal',
      role: 'owner',
      explicitGrants: [],
    };
  }
  if (!row.side || !row.role) return null;
  const permissions = row.permissions as { version?: unknown; grants?: unknown } | null;
  const grants =
    permissions?.version === 1 && Array.isArray(permissions.grants)
      ? permissions.grants.filter((value): value is string => typeof value === 'string')
      : [];
  const context: ProjectAccessContext = {
    tenant,
    projectId: row.projectId,
    projectSlug: row.projectSlug,
    projectStatus: row.projectStatus,
    side: row.side,
    role: row.role,
    explicitGrants: grants,
  };
  return canAccessProject(context, 'project.view') ? context : null;
}
