import type { ApprovalDecisionValue, ApprovalMode, ApprovalRequestStatus } from './types';

export function resolveApprovalStatus(
  mode: ApprovalMode,
  decisions: readonly ApprovalDecisionValue[],
  requiredApprovers: number,
): ApprovalRequestStatus {
  if (requiredApprovers < 1) throw new Error('APPROVER_REQUIRED');
  if (decisions.includes('changes_requested')) return 'changes_requested';
  const approvals = decisions.filter((decision) => decision === 'approved').length;
  if (mode === 'any_one' && approvals >= 1) return 'approved';
  if (mode === 'all_required' && approvals >= requiredApprovers) return 'approved';
  return 'pending';
}

export function canCancelApproval(status: ApprovalRequestStatus): boolean {
  return status === 'pending';
}

export function validateDecisionInput(
  decision: ApprovalDecisionValue,
  comment: string | null,
): void {
  if (decision === 'changes_requested' && !comment?.trim()) {
    throw new Error('COMMENT_REQUIRED');
  }
}
