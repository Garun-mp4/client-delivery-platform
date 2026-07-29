export const approvalEntityTypes = [
  'scope_revision',
  'project_stage',
  'site_version',
  'file_object',
  'final_handover',
] as const;

export type ApprovalEntityType = (typeof approvalEntityTypes)[number];
export type ApprovalMode = 'any_one' | 'all_required';
export type ApprovalDecisionValue = 'approved' | 'changes_requested';
export type ApprovalRequestStatus =
  'pending' | 'approved' | 'changes_requested' | 'cancelled' | 'invalidated';

export type ApprovalTarget =
  | { readonly type: 'scope_revision'; readonly id: string }
  | { readonly type: 'project_stage'; readonly id: string }
  | { readonly type: 'site_version'; readonly id: string }
  | { readonly type: 'file_object'; readonly id: string }
  | { readonly type: 'final_handover' };

export interface CreateApprovalRequestInput {
  readonly target: ApprovalTarget;
  readonly approverUserIds: readonly string[];
  readonly mode: ApprovalMode;
  readonly acknowledgementText: string;
  readonly idempotencyKey: string;
}

export interface DecideApprovalInput {
  readonly decision: ApprovalDecisionValue;
  readonly comment: string | null;
  readonly idempotencyKey: string;
  readonly networkFingerprint?: string;
  readonly userAgent?: string;
}

export interface RecordExternalDecisionInput {
  readonly decision: ApprovalDecisionValue;
  readonly source: string;
  readonly sourceDecisionAt: Date;
  readonly explanation: string;
  readonly idempotencyKey: string;
}
