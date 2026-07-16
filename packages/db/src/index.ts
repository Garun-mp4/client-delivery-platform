import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { parseDatabaseEnv } from '@garun/config';

import * as schema from './schema';

export interface DatabaseClient {
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  readonly pool: Pool;
}

export function createDatabaseClient(
  databaseUrl = parseDatabaseEnv().DATABASE_URL,
): DatabaseClient {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  return { db: drizzle({ client: pool, schema }), pool };
}

export async function checkDatabase(databaseUrl?: string): Promise<void> {
  const { pool } = createDatabaseClient(databaseUrl);

  try {
    await pool.query('select 1');
  } finally {
    await pool.end();
  }
}

export { systemMetadata } from './schema';
