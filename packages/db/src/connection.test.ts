import { describe, expect, it } from 'vitest';

import { createDatabaseConnectionOptions } from './index';

describe('database connection options', () => {
  it('keeps a plain connection string when no custom CA is configured', () => {
    expect(createDatabaseConnectionOptions('postgresql://db.example.test/app')).toEqual({
      connectionString: 'postgresql://db.example.test/app',
    });
  });

  it('uses the configured CA and removes URL SSL settings that would override it', () => {
    const options = createDatabaseConnectionOptions(
      'postgresql://db.example.test/app?sslmode=require&uselibpqcompat=true',
      'test-ca',
    );

    expect(options.connectionString).toBe('postgresql://db.example.test/app');
    expect(options.ssl).toEqual({ ca: 'test-ca', rejectUnauthorized: true });
  });
});
