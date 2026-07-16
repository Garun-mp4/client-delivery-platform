import { createHash } from 'node:crypto';

import Redis from 'ioredis';

import { environment } from './server';

const globalRateLimit = globalThis as typeof globalThis & { garunRateLimitRedis?: Redis };
const redis =
  globalRateLimit.garunRateLimitRedis ??
  new Redis(environment.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
redis.on('error', () => undefined);
if (environment.APP_ENV !== 'production') globalRateLimit.garunRateLimitRedis = redis;

export async function allowSensitiveRequest(
  namespace: string,
  identifier: string,
  maximum: number,
  windowSeconds: number,
) {
  const digest = createHash('sha256').update(identifier).digest('base64url');
  const key = `rate:${namespace}:${digest}`;
  try {
    const result = await redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
    const count = Number(result?.[0]?.[1] ?? maximum + 1);
    return count <= maximum;
  } catch {
    return false;
  }
}
