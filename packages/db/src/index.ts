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
  const connectionString = databaseUrl ?? parseDatabaseEnv().DATABASE_URL;
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 2_000,
    max: 1,
    query_timeout: 2_000,
    statement_timeout: 2_000,
  });

  try {
    await pool.query('select 1');
  } finally {
    await pool.end();
  }
}

export * from './schema';
