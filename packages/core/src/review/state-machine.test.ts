import { describe, expect, it } from 'vitest';

import { canTransitionFeedback } from './state-machine';

describe('feedback state machine', () => {
  it('keeps workflow changes separate from comments', () => {
    expect(canTransitionFeedback('new', 'accepted', 'internal')).toBe(true);
    expect(canTransitionFeedback('new', 'closed', 'client')).toBe(false);
    expect(canTransitionFeedback('awaiting_verification', 'closed', 'client')).toBe(true);
    expect(canTransitionFeedback('awaiting_verification', 'closed', 'internal')).toBe(false);
    expect(canTransitionFeedback('closed', 'in_progress', 'internal')).toBe(false);
  });
});
