import { describe, expect, it } from 'vitest';

import {
  ApprovalValidationError,
  parseCreateApprovalRequestInput,
  parseDecisionInput,
} from './validation';

describe('approval input validation', () => {
  it('requires explicit acknowledgement before accepting a decision', () => {
    expect(() =>
      parseDecisionInput({
        decision: 'approved',
        idempotencyKey: 'decision-1',
      }),
    ).toThrowError(new ApprovalValidationError('acknowledgementAccepted'));
  });

  it('requires a comment when changes are requested', () => {
    expect(() =>
      parseDecisionInput({
        acknowledgementAccepted: 'yes',
        decision: 'changes_requested',
        idempotencyKey: 'decision-2',
      }),
    ).toThrowError(new ApprovalValidationError('comment'));
  });

  it('deduplicates approvers and accepts the default any-one strategy', () => {
    expect(
      parseCreateApprovalRequestInput({
        entityType: 'project_stage',
        entityId: 'stage-1',
        approverUserIds: ['user-1', 'user-1'],
        mode: 'any_one',
        acknowledgementText: 'Подтверждаю решение по указанному результату.',
        idempotencyKey: 'request-1',
      }),
    ).toMatchObject({
      target: { type: 'project_stage', id: 'stage-1' },
      approverUserIds: ['user-1'],
      mode: 'any_one',
    });
  });
});
