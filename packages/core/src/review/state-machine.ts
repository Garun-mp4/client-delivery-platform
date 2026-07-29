import type { FeedbackStatus } from './types';

const transitions: Readonly<Record<FeedbackStatus, readonly FeedbackStatus[]>> = {
  new: ['accepted', 'clarification', 'rejected'],
  accepted: ['clarification', 'in_progress'],
  clarification: ['accepted', 'rejected'],
  in_progress: ['fixed'],
  fixed: ['awaiting_verification', 'in_progress'],
  awaiting_verification: ['closed', 'in_progress'],
  closed: [],
  rejected: [],
};

export function canTransitionFeedback(
  from: FeedbackStatus,
  to: FeedbackStatus,
  side: 'internal' | 'client',
) {
  if (!transitions[from].includes(to)) return false;
  if (to === 'closed') return side === 'client';
  if (to === 'accepted' && from === 'clarification') return side === 'client';
  return side === 'internal';
}
