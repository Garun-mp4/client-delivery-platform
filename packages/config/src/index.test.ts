import { describe, expect, it } from 'vitest';

import { parseProductConfig, parseWebEnv } from './index';

describe('runtime configuration', () => {
  it('provides documented product defaults without production secrets', () => {
    const config = parseProductConfig({});

    expect(config).toMatchObject({
      APP_NAME: 'Garun Workspace',
      FILE_MAX_BYTES: 104_857_600,
      WORKSPACE_QUOTA_BYTES: 10_737_418_240,
      DELETED_FILE_GRACE_DAYS: 30,
      TECHNICAL_LOG_RETENTION_DAYS: 90,
    });
  });

  it('fails fast for an invalid database protocol', () => {
    expect(() =>
      parseWebEnv({
        DATABASE_URL: 'https://database.example.test',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('requires HTTPS for a production public URL', () => {
    expect(() =>
      parseWebEnv({
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://database.example.test/app',
        PUBLIC_APP_URL: 'http://app.example.test',
        REDIS_URL: 'rediss://redis.example.test',
        BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
        OUTBOX_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      }),
    ).toThrow(/PUBLIC_APP_URL/);
  });

  it('rejects a workspace quota smaller than the per-file limit', () => {
    expect(() =>
      parseProductConfig({
        FILE_MAX_BYTES: '200',
        WORKSPACE_QUOTA_BYTES: '100',
      }),
    ).toThrow(/WORKSPACE_QUOTA_BYTES/);
  });

  it('does not expose rejected credential values in configuration errors', () => {
    const secretValue = 'review-secret-value';

    expect(() =>
      parseWebEnv({
        DATABASE_URL: secretValue,
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow(/DATABASE_URL/);

    try {
      parseWebEnv({ DATABASE_URL: secretValue, REDIS_URL: 'redis://localhost:6379' });
    } catch (error) {
      expect(String(error)).not.toContain(secretValue);
    }
  });
});
