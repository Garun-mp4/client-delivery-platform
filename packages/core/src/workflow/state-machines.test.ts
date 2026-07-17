import { describe, expect, it } from 'vitest';

import {
  calculateProgress,
  canCompleteProject,
  canTransitionAction,
  compareActions,
  isActionOverdue,
  validateStageTransition,
} from './state-machines';

describe('workflow state machines', () => {
  it('enforces stage guards and rejects shortcuts', () => {
    expect(() =>
      validateStageTransition('in_progress', 'ready_for_review', { resultSummary: '' }),
    ).toThrow('STAGE_RESULT_REQUIRED');
    expect(() => validateStageTransition('not_started', 'skipped', {})).toThrow(
      'STAGE_SKIP_REASON_REQUIRED',
    );
    expect(() =>
      validateStageTransition('not_started', 'approved', { resultSummary: 'Готово' }),
    ).toThrow('INVALID_STAGE_TRANSITION');
    expect(() =>
      validateStageTransition('in_progress', 'ready_for_review', {
        resultSummary: 'Передан макет',
      }),
    ).not.toThrow();
  });

  it('calculates exact weighted progress and handles reopening', () => {
    const initial = calculateProgress([
      { weight: 2, status: 'approved', countsTowardProgress: true },
      { weight: 3, status: 'skipped', skipReason: 'Не требуется', countsTowardProgress: true },
      { weight: 5, status: 'in_progress', countsTowardProgress: true },
      { weight: 100, status: 'approved', countsTowardProgress: false },
    ]);
    expect(initial).toEqual({ completedWeight: 5, totalWeight: 10, percent: 50 });
    expect(
      calculateProgress([
        { weight: 2, status: 'changes_requested', countsTowardProgress: true },
        { weight: 3, status: 'skipped', skipReason: 'Не требуется', countsTowardProgress: true },
        { weight: 5, status: 'in_progress', countsTowardProgress: true },
      ]),
    ).toEqual({ completedWeight: 3, totalWeight: 10, percent: 30 });
    expect(calculateProgress([])).toEqual({ completedWeight: 0, totalWeight: 0, percent: 0 });
  });

  it('keeps action transitions finite and ranks overdue work first', () => {
    expect(canTransitionAction('open', 'done')).toBe(true);
    expect(canTransitionAction('done', 'open')).toBe(false);
    const now = new Date('2026-07-17T12:00:00.000Z');
    expect(isActionOverdue({ status: 'open', dueAt: new Date('2026-07-16T00:00:00Z') }, now)).toBe(
      true,
    );
    expect(isActionOverdue({ status: 'done', dueAt: new Date('2026-07-16T00:00:00Z') }, now)).toBe(
      false,
    );
    const overdue = {
      priority: 'low' as const,
      dueAt: new Date('2026-07-16T00:00:00Z'),
      createdAt: new Date('2026-07-10T00:00:00Z'),
    };
    const urgent = {
      priority: 'urgent' as const,
      dueAt: new Date('2026-07-20T00:00:00Z'),
      createdAt: new Date('2026-07-11T00:00:00Z'),
    };
    expect(compareActions(overdue, urgent, now)).toBeLessThan(0);
  });

  it('denies completion while a required stage or handover remains open', () => {
    expect(
      canCompleteProject({
        stages: [{ isRequired: true, status: 'in_progress' }],
        hasBlockingActions: false,
        hasFinalAgreement: true,
        handoverComplete: false,
        hasRequiredUnpaidPayment: false,
      }),
    ).toEqual({
      allowed: false,
      reasons: ['REQUIRED_STAGE_INCOMPLETE', 'HANDOVER_INCOMPLETE'],
    });
  });
});
