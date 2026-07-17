export const permissions = [
  'workspace.view',
  'members.invite',
  'members.manage',
  'sessions.revoke.other',
] as const;

export type Permission = (typeof permissions)[number];
export type WorkspaceRole = 'owner' | 'member';

const rolePermissions: Readonly<Record<WorkspaceRole, ReadonlySet<Permission>>> = {
  owner: new Set(permissions),
  member: new Set(['workspace.view']),
};

export interface PolicySubject {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  readonly membershipStatus: 'active' | 'disabled';
  readonly workspaceStatus: 'active' | 'suspended';
  readonly explicitGrants: readonly string[];
}

export function parsePermissionGrants(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as { version?: unknown; grants?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.grants)) return [];
  return candidate.grants.filter((grant): grant is string => typeof grant === 'string');
}

export function can(subject: PolicySubject | null, permission: Permission): boolean {
  if (!subject || subject.membershipStatus !== 'active' || subject.workspaceStatus !== 'active') {
    return false;
  }
  const explicit = subject.explicitGrants.filter((item): item is Permission =>
    permissions.includes(item as Permission),
  );
  return rolePermissions[subject.role].has(permission) || explicit.includes(permission);
}

export function isOwner(subject: PolicySubject | null): boolean {
  return subject?.role === 'owner' && can(subject, 'workspace.view');
}
