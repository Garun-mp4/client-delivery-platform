import type { ActionStatus, StageStatus } from './types';

const stageTransitions: Readonly<Record<StageStatus, ReadonlySet<StageStatus>>> = {
  not_started: new Set(['in_progress', 'skipped']),
  in_progress: new Set(['waiting_for_client', 'ready_for_review', 'skipped']),
  waiting_for_client: new Set(['in_progress', 'ready_for_review', 'skipped']),
  ready_for_review: new Set(['changes_requested']),
  changes_requested: new Set(['in_progress', 'ready_for_review']),
  approved: new Set(['changes_requested']),
  skipped: new Set(['not_started']),
};

const actionTransitions: Readonly<Record<ActionStatus, ReadonlySet<ActionStatus>>> = {
  open: new Set(['in_progress', 'done', 'cancelled']),
  in_progress: new Set(['done', 'cancelled']),
  done: new Set(),
  cancelled: new Set(),
};

export function canTransitionStage(from: StageStatus, to: StageStatus): boolean {
  return stageTransitions[from].has(to);
}

export function validateStageTransition(
  from: StageStatus,
  to: StageStatus,
  input: { resultSummary?: string | null; skipReason?: string | null },
): void {
  if (!canTransitionStage(from, to)) throw new Error('INVALID_STAGE_TRANSITION');
  if (to === 'ready_for_review' && !input.resultSummary?.trim()) {
    throw new Error('STAGE_RESULT_REQUIRED');
  }
  if (to === 'skipped' && !input.skipReason?.trim()) throw new Error('STAGE_SKIP_REASON_REQUIRED');
}

export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  return actionTransitions[from].has(to);
}

export interface ProgressStage {
  readonly weight: number;
  readonly status: StageStatus;
  readonly countsTowardProgress: boolean;
  readonly skipReason?: string | null;
}

export function calculateProgress(stages: readonly ProgressStage[]) {
  let completedWeight = 0;
  let totalWeight = 0;
  for (const stage of stages) {
    if (!stage.countsTowardProgress) continue;
    totalWeight += stage.weight;
    if (stage.status === 'approved' || (stage.status === 'skipped' && stage.skipReason?.trim())) {
      completedWeight += stage.weight;
    }
  }
  return {
    completedWeight,
    totalWeight,
    percent: totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 100),
  };
}

export function isActionOverdue(
  action: { status: ActionStatus; dueAt: Date },
  now = new Date(),
): boolean {
  return (action.status === 'open' || action.status === 'in_progress') && action.dueAt < now;
}

const priorityScore = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

export function compareActions(
  left: { priority: keyof typeof priorityScore; dueAt: Date; createdAt: Date },
  right: { priority: keyof typeof priorityScore; dueAt: Date; createdAt: Date },
  now = new Date(),
): number {
  const leftOverdue = left.dueAt < now;
  const rightOverdue = right.dueAt < now;
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
  const priority = priorityScore[left.priority] - priorityScore[right.priority];
  if (priority !== 0) return priority;
  const due = left.dueAt.valueOf() - right.dueAt.valueOf();
  return due || left.createdAt.valueOf() - right.createdAt.valueOf();
}

export function canCompleteProject(input: {
  readonly stages: readonly {
    readonly isRequired: boolean;
    readonly status: StageStatus;
    readonly skipReason?: string | null;
  }[];
  readonly hasBlockingActions: boolean;
  readonly hasFinalAgreement: boolean;
  readonly handoverComplete: boolean;
  readonly hasRequiredUnpaidPayment: boolean;
}) {
  const reasons: string[] = [];
  if (
    input.stages.some(
      (stage) =>
        stage.isRequired &&
        stage.status !== 'approved' &&
        !(stage.status === 'skipped' && stage.skipReason?.trim()),
    )
  ) {
    reasons.push('REQUIRED_STAGE_INCOMPLETE');
  }
  if (input.hasBlockingActions) reasons.push('BLOCKING_ACTIONS');
  if (!input.hasFinalAgreement) reasons.push('FINAL_APPROVAL_REQUIRED');
  if (!input.handoverComplete) reasons.push('HANDOVER_INCOMPLETE');
  if (input.hasRequiredUnpaidPayment) reasons.push('REQUIRED_PAYMENT_UNPAID');
  return { allowed: reasons.length === 0, reasons };
}

export function diffScopeRevisions(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const ignored = new Set([
    'id',
    'workspaceId',
    'projectId',
    'revision',
    'status',
    'createdByUserId',
    'submittedAt',
    'agreedByUserId',
    'agreedAt',
    'supersededAt',
    'createdAt',
    'updatedAt',
  ]);
  return Object.keys(current)
    .filter((field) => !ignored.has(field))
    .flatMap((field) => {
      const before = previous[field];
      const after = current[field];
      return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ field, before, after }];
    });
}
