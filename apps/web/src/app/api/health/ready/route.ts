import { NextResponse } from 'next/server';
import Redis from 'ioredis';

import { parseWebEnv } from '@garun/config';
import { checkDatabase } from '@garun/db';
import { createLogger, getOrCreateRequestId } from '@garun/observability';

import { createHealthResponse } from '@/lib/health';

export const dynamic = 'force-dynamic';

const logger = createLogger({ service: 'web' });

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request.headers.get('x-request-id'));

  try {
    const environment = parseWebEnv();
    const redis = new Redis(environment.REDIS_URL, {
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    redis.on('error', () => undefined);

    const [databaseResult, redisResult] = await Promise.allSettled([
      checkDatabase(environment.DATABASE_URL),
      redis.connect().then(() => redis.ping()),
    ]);
    redis.disconnect();

    const response = createHealthResponse(requestId, {
      database: databaseResult.status === 'fulfilled' ? 'ok' : 'error',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'error',
    });

    return NextResponse.json(response, {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
      status: response.status === 'ok' ? 200 : 503,
    });
  } catch {
    logger.error({ errorCode: 'READINESS_FAILED', requestId }, 'Readiness check failed');
    return NextResponse.json(createHealthResponse(requestId, { configuration: 'error' }), {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
      status: 503,
    });
  }
}
