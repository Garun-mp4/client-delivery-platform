import { describe, expect, it, vi } from 'vitest';

import { withDatabaseReadRetry } from './index';

describe('withDatabaseReadRetry', () => {
  it('retries a read after a nested transient DNS failure', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        Object.assign(new Error('query failed'), {
          cause: Object.assign(new Error('temporary DNS failure'), { code: 'EAI_AGAIN' }),
        }),
      )
      .mockResolvedValue('ready');

    await expect(withDatabaseReadRetry(operation, { delaysMs: [0] })).resolves.toBe('ready');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient query error', async () => {
    const error = Object.assign(new Error('constraint failed'), { code: '23505' });
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(withDatabaseReadRetry(operation, { delaysMs: [0, 0] })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
