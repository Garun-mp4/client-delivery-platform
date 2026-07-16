import { describe, expect, it } from 'vitest';

import { createWorkerHealthResponse } from './health';

describe('worker health response', () => {
  it('reports dependency failures without their sensitive details', () => {
    expect(createWorkerHealthResponse('worker-request', { database: 'error' })).toEqual({
      checks: { database: 'error' },
      requestId: 'worker-request',
      service: 'worker',
      status: 'degraded',
    });
  });
});
