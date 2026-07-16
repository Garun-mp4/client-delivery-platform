import { z } from 'zod';

const appEnvironmentSchema = z.enum(['local', 'test', 'staging', 'production']);
const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const sharedServerSchema = z.object({
  APP_ENV: appEnvironmentSchema.default('local'),
  APP_NAME: z.string().trim().min(1).default('Garun Workspace'),
  PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  LOG_LEVEL: logLevelSchema.default('info'),
  FILE_MAX_BYTES: z.coerce.number().int().positive().default(104_857_600),
  WORKSPACE_QUOTA_BYTES: z.coerce.number().int().positive().default(10_737_418_240),
  DELETED_FILE_GRACE_DAYS: z.coerce.number().int().nonnegative().default(30),
  TECHNICAL_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

const databaseSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must use postgres:// or postgresql://',
    }),
});

const redisSchema = z.object({
  REDIS_URL: z
    .url()
    .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
      message: 'REDIS_URL must use redis:// or rediss://',
    }),
});

const webSchema = sharedServerSchema.merge(databaseSchema).merge(redisSchema);

const workerSchema = webSchema.extend({
  WORKER_HOST: z.string().trim().min(1).default('127.0.0.1'),
  WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseSchema>;
export type ProductConfig = z.infer<typeof sharedServerSchema>;
export type WebEnvironment = z.infer<typeof webSchema>;
export type WorkerEnvironment = z.infer<typeof workerSchema>;

export function parseProductConfig(environment: NodeJS.ProcessEnv = process.env): ProductConfig {
  return sharedServerSchema.parse(environment);
}

export function parseDatabaseEnv(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  return databaseSchema.parse(environment);
}

export function parseWebEnv(environment: NodeJS.ProcessEnv = process.env): WebEnvironment {
  return webSchema.parse(environment);
}

export function parseWorkerEnv(environment: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  return workerSchema.parse(environment);
}
