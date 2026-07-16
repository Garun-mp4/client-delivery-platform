import { z } from 'zod';

const appEnvironmentSchema = z.enum(['local', 'test', 'staging', 'production']);
const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const sharedServerShape = {
  APP_ENV: appEnvironmentSchema.default('local'),
  APP_NAME: z.string().trim().min(1).default('Garun Workspace'),
  PUBLIC_APP_URL: z
    .url()
    .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
      message: 'PUBLIC_APP_URL must use http:// or https://',
    })
    .default('http://localhost:3000'),
  LOG_LEVEL: logLevelSchema.default('info'),
  FILE_MAX_BYTES: z.coerce.number().int().positive().default(104_857_600),
  WORKSPACE_QUOTA_BYTES: z.coerce.number().int().positive().default(10_737_418_240),
  DELETED_FILE_GRACE_DAYS: z.coerce.number().int().nonnegative().default(30),
  TECHNICAL_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
} as const;

const databaseShape = {
  DATABASE_URL: z
    .url()
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must use postgres:// or postgresql://',
    }),
} as const;

const redisShape = {
  REDIS_URL: z
    .url()
    .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
      message: 'REDIS_URL must use redis:// or rediss://',
    }),
} as const;

function validateProductConfig(
  value: z.output<z.ZodObject<typeof sharedServerShape>>,
  context: z.RefinementCtx,
) {
  if (value.WORKSPACE_QUOTA_BYTES < value.FILE_MAX_BYTES) {
    context.addIssue({
      code: 'custom',
      message: 'WORKSPACE_QUOTA_BYTES must be at least FILE_MAX_BYTES',
      path: ['WORKSPACE_QUOTA_BYTES'],
    });
  }

  if (value.APP_ENV === 'production') {
    const publicUrl = new URL(value.PUBLIC_APP_URL);
    const localHosts = new Set(['127.0.0.1', '::1', 'localhost']);

    if (publicUrl.protocol !== 'https:' || localHosts.has(publicUrl.hostname)) {
      context.addIssue({
        code: 'custom',
        message: 'PUBLIC_APP_URL must use a non-local HTTPS URL in production',
        path: ['PUBLIC_APP_URL'],
      });
    }
  }
}

const sharedServerSchema = z.object(sharedServerShape).superRefine(validateProductConfig);
const databaseSchema = z.object(databaseShape);

const webSchema = z
  .object({ ...sharedServerShape, ...databaseShape, ...redisShape })
  .superRefine(validateProductConfig);

const workerSchema = z
  .object({
    ...sharedServerShape,
    ...databaseShape,
    ...redisShape,
    WORKER_HOST: z.string().trim().min(1).default('127.0.0.1'),
    WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  })
  .superRefine(validateProductConfig);

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseSchema>;
export type ProductConfig = z.infer<typeof sharedServerSchema>;
export type WebEnvironment = z.infer<typeof webSchema>;
export type WorkerEnvironment = z.infer<typeof workerSchema>;

export class ConfigurationError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`Invalid environment configuration: ${fields.join(', ')}`);
    this.name = 'ConfigurationError';
    this.fields = fields;
  }
}

function parseConfiguration<TSchema extends z.ZodType>(
  schema: TSchema,
  environment: NodeJS.ProcessEnv,
): z.output<TSchema> {
  const result = schema.safeParse(environment);

  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map((issue) =>
          issue.path.length > 0 ? issue.path.join('.') : 'environment',
        ),
      ),
    ];
    throw new ConfigurationError(fields);
  }

  return result.data;
}

export function parseProductConfig(environment: NodeJS.ProcessEnv = process.env): ProductConfig {
  return parseConfiguration(sharedServerSchema, environment);
}

export function parseDatabaseEnv(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  return parseConfiguration(databaseSchema, environment);
}

export function parseWebEnv(environment: NodeJS.ProcessEnv = process.env): WebEnvironment {
  return parseConfiguration(webSchema, environment);
}

export function parseWorkerEnv(environment: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  return parseConfiguration(workerSchema, environment);
}
