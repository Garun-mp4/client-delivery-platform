import { describe, expect, it } from 'vitest';

import { createErrorEnvelope } from './index';

describe('error envelope', () => {
  it('keeps a stable request identifier', () => {
    expect(createErrorEnvelope('request-1')).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Не удалось выполнить запрос.',
        fieldErrors: {},
        requestId: 'request-1',
      },
    });
  });
});
