import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { parseDatabaseEnv } from '@garun/config';

import { createDatabaseConnectionOptions } from './index';

const environment = parseDatabaseEnv();
const connectionOptions = createDatabaseConnectionOptions(
  environment.DATABASE_URL,
  environment.DATABASE_SSL_CA,
);
const pool = new Pool({
  ...connectionOptions,
  max: 1,
});

try {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  await migrate(drizzle(pool), {
    migrationsFolder: resolve(import.meta.dirname, '../migrations'),
  });
} finally {
  await pool.end();
}
