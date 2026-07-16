import { defineConfig } from 'drizzle-kit';

import { parseDatabaseEnv } from '@garun/config';

const environment = parseDatabaseEnv();

export default defineConfig({
  dialect: 'postgresql',
  out: './migrations',
  schema: './src/schema.ts',
  dbCredentials: { url: environment.DATABASE_URL },
  strict: true,
  verbose: true,
});
