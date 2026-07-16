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
});
