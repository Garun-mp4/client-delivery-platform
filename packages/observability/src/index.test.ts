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

    logger.info(
      {
        environment: {
          BETTER_AUTH_SECRET: 'better-auth-secret',
          DATABASE_URL: 'postgresql://user:database-secret@database.example.test/app',
          OUTBOX_ENCRYPTION_KEY: 'outbox-encryption-secret',
          REDIS_URL: 'redis://:redis-secret@redis.example.test:6379',
        },
        password: 'sensitive-password',
        request: { headers: { authorization: 'Bearer sensitive-authorization' } },
        token: 'sensitive-token',
        url: 'https://example.test/magic/private-token',
      },
      'safe event',
    );

    expect(output).not.toContain('sensitive-token');
    expect(output).not.toContain('sensitive-password');
    expect(output).not.toContain('database-secret');
    expect(output).not.toContain('redis-secret');
    expect(output).not.toContain('sensitive-authorization');
    expect(output).not.toContain('better-auth-secret');
    expect(output).not.toContain('outbox-encryption-secret');
    expect(output).not.toContain('private-token');
    expect(output).toContain('[REDACTED]');
  });

  it('keeps a bounded incoming correlation id or creates a new one', () => {
    expect(getOrCreateRequestId('request-42')).toBe('request-42');
    expect(getOrCreateRequestId(['first-request', 'second-request'])).toBe('first-request');
    expect(getOrCreateRequestId('x'.repeat(129))).toMatch(/^[0-9a-f-]{36}$/);
    expect(getOrCreateRequestId('unsafe\nheader')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
