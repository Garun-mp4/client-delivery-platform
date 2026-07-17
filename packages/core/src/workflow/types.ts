import type { ProjectAccessContext } from '../projects/types';

export const stageStatuses = [
  'not_started',
  'in_progress',
  'waiting_for_client',
  'ready_for_review',
  'changes_requested',
  'approved',
  'skipped',
] as const;

export type StageStatus = (typeof stageStatuses)[number];
export type ActionStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type ActionPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ScopeStatus = 'draft' | 'client_review' | 'agreed' | 'superseded';

export interface ScopeRevisionInput {
  readonly summary: string;
  readonly goals: readonly string[];
  readonly audience: readonly string[];
  readonly pages: readonly string[];
  readonly features: readonly string[];
  readonly integrations: readonly string[];
  readonly deliverables: readonly string[];
  readonly responsibilities: readonly string[];
  readonly revisionLimits: readonly string[];
  readonly exclusions: readonly string[];
  readonly assumptions: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly contractUrl: string | null;
  readonly proposalUrl: string | null;
  readonly plannedStartDate: string | null;
  readonly plannedEndDate: string | null;
  readonly costMinor: number | null;
  readonly currency: string | null;
}

export interface StageInput {
  readonly name: string;
  readonly description: string | null;
  readonly weight: number;
  readonly ownerUserId: string;
  readonly clientVisible: boolean;
  readonly isRequired: boolean;
  readonly countsTowardProgress: boolean;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string;
  readonly acceptanceCriteria: string | null;
}

export interface ActionInput {
  readonly stageId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly type:
    | 'upload_material'
    | 'answer_question'
    | 'review_version'
    | 'approve_stage'
    | 'make_payment'
    | 'fix_feedback'
    | 'internal'
    | 'other';
  readonly priority: ActionPriority;
  readonly visibility: 'internal' | 'client';
  readonly assigneeUserId: string;
  readonly dueAt: Date;
  readonly isBlocking: boolean;
}

export interface WorkflowAccess {
  readonly project: ProjectAccessContext;
  readonly canManage: boolean;
  readonly canApproveScope: boolean;
}
