import { describe, expect, it } from 'vitest';

import { resolveApprovalStatus, validateDecisionInput } from './state-machines';

describe('approval state machine', () => {
  it('resolves any_one after the first approval', () => {
    expect(resolveApprovalStatus('any_one', ['approved'], 3)).toBe('approved');
  });

  it('waits for every required approver in all_required mode', () => {
    expect(resolveApprovalStatus('all_required', ['approved'], 2)).toBe('pending');
    expect(resolveApprovalStatus('all_required', ['approved', 'approved'], 2)).toBe('approved');
  });

  it('resolves to changes_requested immediately', () => {
    expect(resolveApprovalStatus('all_required', ['approved', 'changes_requested'], 3)).toBe(
      'changes_requested',
    );
  });

  it('requires a comment when changes are requested', () => {
    expect(() => validateDecisionInput('changes_requested', ' ')).toThrow('COMMENT_REQUIRED');
    expect(() => validateDecisionInput('changes_requested', 'Исправьте заголовок')).not.toThrow();
  });
});
