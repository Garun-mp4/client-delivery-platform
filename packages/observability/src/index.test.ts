import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, getOrCreateRequestId } from './index';

describe('observability foundation', () => {
  it('redacts credentials from structured logs', () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const logger = createLogger({ service: 'test', destination });

    logger.info({ token: 'sensitive-token', password: 'sensitive-password' }, 'safe event');

    expect(output).not.toContain('sensitive-token');
    expect(output).not.toContain('sensitive-password');
    expect(output).toContain('[REDACTED]');
  });

  it('keeps a bounded incoming correlation id or creates a new one', () => {
    expect(getOrCreateRequestId('request-42')).toBe('request-42');
    expect(getOrCreateRequestId(['first-request', 'second-request'])).toBe('first-request');
    expect(getOrCreateRequestId('x'.repeat(129))).toMatch(/^[0-9a-f-]{36}$/);
    expect(getOrCreateRequestId('unsafe\nheader')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
