import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { parseDatabaseEnv } from '@garun/config';

import * as schema from './schema';

export interface DatabaseConnectionOptions {
  readonly connectionString: string;
  readonly ssl?: {
    readonly ca: string;
    readonly rejectUnauthorized: true;
  };
}

export interface DatabaseClient {
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  readonly pool: Pool;
}

const transientReadErrorCodes = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
]);

function findErrorCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') return null;
    const value = current as { readonly code?: unknown; readonly cause?: unknown };
    if (typeof value.code === 'string') return value.code;
    current = value.cause;
  }
  return null;
}

export async function withDatabaseReadRetry<T>(
  operation: () => Promise<T>,
  options: { readonly delaysMs?: readonly number[] } = {},
): Promise<T> {
  const delays = options.delaysMs ?? [100, 300];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !transientReadErrorCodes.has(findErrorCode(error) ?? '')) {
        throw error;
      }
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function createDatabaseClient(
  databaseUrl = parseDatabaseEnv().DATABASE_URL,
  databaseSslCa = process.env.DATABASE_SSL_CA,
): DatabaseClient {
  const pool = new Pool({
    ...createDatabaseConnectionOptions(databaseUrl, databaseSslCa),
    max: 10,
  });
  return { db: drizzle({ client: pool, schema }), pool };
}

export function createDatabaseConnectionOptions(
  databaseUrl: string,
  databaseSslCa?: string,
): DatabaseConnectionOptions {
  if (!databaseSslCa) return { connectionString: databaseUrl };

  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.delete('sslmode');
  connectionUrl.searchParams.delete('uselibpqcompat');

  return {
    connectionString: connectionUrl.toString(),
    ssl: { ca: databaseSslCa, rejectUnauthorized: true },
  };
}

export async function checkDatabase(
  databaseUrl?: string,
  databaseSslCa = process.env.DATABASE_SSL_CA,
): Promise<void> {
  const connectionString = databaseUrl ?? parseDatabaseEnv().DATABASE_URL;
  const pool = new Pool({
    ...createDatabaseConnectionOptions(connectionString, databaseSslCa),
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
