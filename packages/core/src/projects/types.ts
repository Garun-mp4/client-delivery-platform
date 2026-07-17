import type { TenantContext } from '../identity/tenant';

export const projectPermissions = [
  'project.view',
  'project.view.internal',
  'project.edit',
  'project.publish',
  'project.archive',
  'project.members.manage',
] as const;

export type ProjectPermission = (typeof projectPermissions)[number];
export type ProjectRole = 'owner' | 'employee' | 'client' | 'observer';
export type ProjectSide = 'internal' | 'client';
export type ProjectStatus =
  | 'draft'
  | 'onboarding'
  | 'in_progress'
  | 'waiting_for_client'
  | 'review'
  | 'paused'
  | 'completed'
  | 'maintenance'
  | 'archived';

export interface ProjectAccessContext {
  readonly tenant: TenantContext;
  readonly projectId: string;
  readonly projectSlug: string;
  readonly projectStatus: ProjectStatus;
  readonly side: ProjectSide;
  readonly role: ProjectRole;
  readonly explicitGrants: readonly string[];
}

export interface ClientCompanyInput {
  readonly name: string;
  readonly legalName: string | null;
  readonly website: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly messenger: string | null;
  readonly internalNotes: string | null;
}

export interface ProjectInput {
  readonly clientCompanyId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly projectType: 'website' | 'landing' | 'ecommerce' | 'redesign' | 'other';
  readonly ownerUserId: string;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string;
}

export interface ClientProjectDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly projectType: ProjectInput['projectType'];
  readonly status: ProjectStatus;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string;
  readonly company: { readonly name: string };
  readonly access: { readonly role: 'client' | 'observer'; readonly readOnly: boolean };
}
