import { headers } from 'next/headers';

import { createAuth } from '@garun/auth';
import { parseWebEnv } from '@garun/config';
import { createDatabaseClient } from '@garun/db';
import { S3ObjectStorage } from '@garun/storage';

const globalServices = globalThis as typeof globalThis & {
  garunDatabase?: ReturnType<typeof createDatabaseClient>;
  garunStorage?: S3ObjectStorage;
};

export const environment = parseWebEnv();
export const database =
  globalServices.garunDatabase ?? createDatabaseClient(environment.DATABASE_URL);
if (environment.APP_ENV !== 'production') globalServices.garunDatabase = database;
export const auth = createAuth(database.db, environment);
export const objectStorage =
  globalServices.garunStorage ??
  new S3ObjectStorage({
    endpoint: environment.STORAGE_ENDPOINT,
    publicEndpoint: environment.STORAGE_PUBLIC_ENDPOINT,
    region: environment.STORAGE_REGION,
    bucket: environment.STORAGE_BUCKET,
    accessKey: environment.STORAGE_ACCESS_KEY,
    secretKey: environment.STORAGE_SECRET_KEY,
    forcePathStyle: environment.STORAGE_FORCE_PATH_STYLE,
  });
if (environment.APP_ENV !== 'production') globalServices.garunStorage = objectStorage;

export async function currentSession() {
  return auth.api.getSession({ headers: await headers() });
}
