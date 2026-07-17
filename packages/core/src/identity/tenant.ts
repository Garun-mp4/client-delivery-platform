import { and, eq } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import { user, workspace, workspaceMembership } from '@garun/db/schema';

import { parsePermissionGrants, type PolicySubject } from './policies';

export interface TenantContext extends PolicySubject {
  readonly workspaceSlug: string;
}

export async function resolveTenantContext(
  database: DatabaseClient['db'],
  userId: string,
  workspaceSlug: string,
): Promise<TenantContext | null> {
  const [row] = await database
    .select({
      userId: user.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      workspaceStatus: workspace.status,
      role: workspaceMembership.role,
      membershipStatus: workspaceMembership.status,
      permissions: workspaceMembership.permissions,
    })
    .from(workspaceMembership)
    .innerJoin(user, eq(user.id, workspaceMembership.userId))
    .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
    .where(
      and(
        eq(workspaceMembership.userId, userId),
        eq(workspace.slug, workspaceSlug),
        eq(user.status, 'active'),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    userId: row.userId,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    workspaceStatus: row.workspaceStatus,
    role: row.role,
    membershipStatus: row.membershipStatus,
    explicitGrants: parsePermissionGrants(row.permissions),
  };
}

export function scopeToTenant<T extends { workspaceId: string }>(
  context: TenantContext,
  value: T,
): T | null {
  return value.workspaceId === context.workspaceId ? value : null;
}
