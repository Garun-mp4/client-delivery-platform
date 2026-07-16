import { describe, expect, it } from 'vitest';

import { can, parsePermissionGrants, type PolicySubject } from './policies';

const member: PolicySubject = {
  userId: 'user-a',
  workspaceId: 'workspace-a',
  role: 'member',
  membershipStatus: 'active',
  workspaceStatus: 'active',
  explicitGrants: [],
};

describe('workspace policies', () => {
  it('denies by default and grants members only workspace view', () => {
    expect(can(null, 'workspace.view')).toBe(false);
    expect(can(member, 'workspace.view')).toBe(true);
    expect(can(member, 'members.invite')).toBe(false);
  });
  it('immediately denies disabled memberships', () =>
    expect(can({ ...member, membershipStatus: 'disabled' }, 'workspace.view')).toBe(false));
  it('allows owner-only operations for active owners', () =>
    expect(can({ ...member, role: 'owner' }, 'sessions.revoke.other')).toBe(true));
  it('treats malformed permission JSON as no explicit grants', () => {
    expect(parsePermissionGrants({ version: 2, grants: ['members.invite'] })).toEqual([]);
    expect(parsePermissionGrants({ version: 1, grants: ['workspace.view', 42] })).toEqual([
      'workspace.view',
    ]);
  });
});
