import {
  approvalEntityTypes,
  type ApprovalDecisionValue,
  type ApprovalEntityType,
  type ApprovalMode,
  type ApprovalTarget,
  type CreateApprovalRequestInput,
  type RecordExternalDecisionInput,
} from './types';

export class ApprovalValidationError extends Error {
  constructor(readonly field: string) {
    super('INVALID_INPUT');
    this.name = 'ApprovalValidationError';
  }
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new ApprovalValidationError(field);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ApprovalValidationError(field);
  return normalized;
}

function decision(value: unknown): ApprovalDecisionValue {
  if (value !== 'approved' && value !== 'changes_requested') {
    throw new ApprovalValidationError('decision');
  }
  return value;
}

export function parseCreateApprovalRequestInput(
  input: Record<string, unknown>,
): CreateApprovalRequestInput {
  const type = requiredText(input.entityType, 'entityType', 32) as ApprovalEntityType;
  if (!approvalEntityTypes.includes(type)) throw new ApprovalValidationError('entityType');
  const entityId =
    type === 'final_handover' ? undefined : requiredText(input.entityId, 'entityId', 64);
  const target = (type === 'final_handover' ? { type } : { type, id: entityId! }) as ApprovalTarget;
  const approverUserIds = Array.isArray(input.approverUserIds)
    ? input.approverUserIds
    : typeof input.approverUserIds === 'string'
      ? [input.approverUserIds]
      : [];
  const normalizedApprovers = [
    ...new Set(approverUserIds.map((value) => requiredText(value, 'approverUserIds', 64))),
  ];
  if (normalizedApprovers.length < 1 || normalizedApprovers.length > 25) {
    throw new ApprovalValidationError('approverUserIds');
  }
  const mode = requiredText(input.mode, 'mode', 16) as ApprovalMode;
  if (mode !== 'any_one' && mode !== 'all_required') throw new ApprovalValidationError('mode');
  return {
    target,
    approverUserIds: normalizedApprovers,
    mode,
    acknowledgementText: requiredText(input.acknowledgementText, 'acknowledgementText', 4_000),
    idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey', 128),
  };
}

export function parseDecisionInput(input: Record<string, unknown>) {
  if (input.acknowledgementAccepted !== 'yes' && input.acknowledgementAccepted !== true) {
    throw new ApprovalValidationError('acknowledgementAccepted');
  }
  const value = decision(input.decision);
  const comment =
    typeof input.comment === 'string' && input.comment.trim() ? input.comment.trim() : null;
  if (comment && comment.length > 5_000) throw new ApprovalValidationError('comment');
  if (value === 'changes_requested' && !comment) throw new ApprovalValidationError('comment');
  return {
    decision: value,
    comment,
    idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey', 128),
  };
}

export function parseExternalDecisionInput(
  input: Record<string, unknown>,
): RecordExternalDecisionInput {
  const sourceDecisionAt = new Date(requiredText(input.sourceDecisionAt, 'sourceDecisionAt', 64));
  if (Number.isNaN(sourceDecisionAt.valueOf()) || sourceDecisionAt > new Date()) {
    throw new ApprovalValidationError('sourceDecisionAt');
  }
  return {
    decision: decision(input.decision),
    source: requiredText(input.source, 'source', 240),
    sourceDecisionAt,
    explanation: requiredText(input.explanation, 'explanation', 5_000),
    idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey', 128),
  };
}
