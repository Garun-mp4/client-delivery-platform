import { describe, expect, it } from 'vitest';

import { createHealthResponse } from './health';

describe('web health response', () => {
  it('becomes degraded when a dependency check fails', () => {
    expect(createHealthResponse('request-1', { database: 'ok', redis: 'error' })).toMatchObject({
      requestId: 'request-1',
      service: 'web',
      status: 'degraded',
    });
  });
});
