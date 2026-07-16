import { headers } from 'next/headers';

import { createAuth } from '@garun/auth';
import { parseWebEnv } from '@garun/config';
import { createDatabaseClient } from '@garun/db';

const globalServices = globalThis as typeof globalThis & {
  garunDatabase?: ReturnType<typeof createDatabaseClient>;
};

export const environment = parseWebEnv();
export const database =
  globalServices.garunDatabase ?? createDatabaseClient(environment.DATABASE_URL);
if (environment.APP_ENV !== 'production') globalServices.garunDatabase = database;
export const auth = createAuth(database.db, environment);

export async function currentSession() {
  return auth.api.getSession({ headers: await headers() });
}
