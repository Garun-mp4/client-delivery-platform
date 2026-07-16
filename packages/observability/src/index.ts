import pino, { type DestinationStream, type Logger, type LevelWithSilent } from 'pino';

const redactPaths = [
  'authorization',
  'cookie',
  'password',
  'token',
  'link',
  'url',
  'encryptedSecret',
  'magicLink',
  'previewSecret',
  'DATABASE_URL',
  'REDIS_URL',
  'BETTER_AUTH_SECRET',
  'OUTBOX_ENCRYPTION_KEY',
  'databaseUrl',
  'redisUrl',
  '*.DATABASE_URL',
  '*.REDIS_URL',
  '*.BETTER_AUTH_SECRET',
  '*.OUTBOX_ENCRYPTION_KEY',
  '*.authorization',
  '*.cookie',
  '*.magicLink',
  '*.encryptedSecret',
  '*.link',
  '*.password',
  '*.previewSecret',
  '*.token',
  '*.url',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
] as const;

export interface LoggerOptions {
  readonly service: string;
  readonly environment?: string;
  readonly level?: LevelWithSilent;
  readonly destination?: DestinationStream;
}

export function createLogger({
  service,
  environment = 'unknown',
  level = 'info',
  destination,
}: LoggerOptions): Logger {
  const options: pino.LoggerOptions = {
    base: { environment, service },
    level,
    messageKey: 'message',
    redact: {
      paths: [...redactPaths],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return destination ? pino(options, destination) : pino(options);
}

export function getOrCreateRequestId(value: string | readonly string[] | null | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const candidate = rawValue?.trim();
  return candidate && candidate.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(candidate)
    ? candidate
    : crypto.randomUUID();
}
