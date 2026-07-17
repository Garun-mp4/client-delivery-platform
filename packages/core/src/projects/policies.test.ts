import { describe, expect, it } from 'vitest';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject } from './policies';
import type { ProjectAccessContext } from './types';

const tenant: TenantContext = {
  userId: 'user-a',
  workspaceId: 'workspace-a',
  workspaceSlug: 'workspace-a',
  role: 'member',
  membershipStatus: 'active',
  workspaceStatus: 'active',
  explicitGrants: [],
};

function context(overrides: Partial<ProjectAccessContext> = {}): ProjectAccessContext {
  return {
    tenant,
    projectId: 'project-a',
    projectSlug: 'project-a',
    projectStatus: 'onboarding',
    side: 'client',
    role: 'client',
    explicitGrants: [],
    ...overrides,
  };
}

describe('project policies', () => {
  it('hides drafts from client-side memberships', () => {
    expect(canAccessProject(context({ projectStatus: 'draft' }), 'project.view')).toBe(false);
  });

  it('keeps observers read-only', () => {
    const observer = context({ role: 'observer' });
    expect(canAccessProject(observer, 'project.view')).toBe(true);
    expect(canAccessProject(observer, 'project.edit')).toBe(false);
    expect(canAccessProject(observer, 'project.members.manage')).toBe(false);
  });

  it('allows only reads from archived projects', () => {
    const archived = context({ projectStatus: 'archived', side: 'internal', role: 'owner' });
    expect(canAccessProject(archived, 'project.view.internal')).toBe(true);
    expect(canAccessProject(archived, 'project.edit')).toBe(false);
    expect(canAccessProject(archived, 'project.archive')).toBe(false);
  });

  it('uses explicit employee grants without accepting unknown permissions', () => {
    const employee = context({
      side: 'internal',
      role: 'employee',
      explicitGrants: ['project.view.internal', 'project.edit', 'project.superuser'],
    });
    expect(canAccessProject(employee, 'project.view.internal')).toBe(true);
    expect(canAccessProject(employee, 'project.edit')).toBe(true);
    expect(canAccessProject(employee, 'project.archive')).toBe(false);
  });
});
