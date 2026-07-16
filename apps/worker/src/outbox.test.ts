import { describe, expect, it } from 'vitest';

import { outboxMessageId, outboxRetry } from './outbox';

describe('outbox delivery policy', () => {
  it('uses a stable delivery identity when an event is retried', () => {
    expect(outboxMessageId('event-42')).toBe('<event-42@garun.local>');
    expect(outboxMessageId('event-42')).toBe(outboxMessageId('event-42'));
  });

  it('backs off and stops after the terminal attempt', () => {
    expect(outboxRetry(1)).toEqual({ retrySeconds: 2, terminal: false });
    expect(outboxRetry(8)).toEqual({ retrySeconds: 256, terminal: true });
    expect(outboxRetry(20)).toEqual({ retrySeconds: 1024, terminal: true });
  });
});
