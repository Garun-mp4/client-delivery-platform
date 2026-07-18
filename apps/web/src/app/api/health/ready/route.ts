import { NextResponse } from 'next/server';
import Redis from 'ioredis';

import { parseWebEnv } from '@garun/config';
import { checkDatabase } from '@garun/db';
import { createLogger, getOrCreateRequestId } from '@garun/observability';
import { S3ObjectStorage } from '@garun/storage';

import { createHealthResponse } from '@/lib/health';

export const dynamic = 'force-dynamic';

const logger = createLogger({ environment: process.env.APP_ENV, service: 'web' });

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request.headers.get('x-request-id'));

  try {
    const environment = parseWebEnv();
    const redis = new Redis(environment.REDIS_URL, {
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);

    const storage = new S3ObjectStorage({
      endpoint: environment.STORAGE_ENDPOINT,
      publicEndpoint: environment.STORAGE_PUBLIC_ENDPOINT,
      region: environment.STORAGE_REGION,
      bucket: environment.STORAGE_BUCKET,
      accessKey: environment.STORAGE_ACCESS_KEY,
      secretKey: environment.STORAGE_SECRET_KEY,
      forcePathStyle: environment.STORAGE_FORCE_PATH_STYLE,
    });
    const [databaseResult, redisResult, storageResult] = await Promise.allSettled([
      checkDatabase(environment.DATABASE_URL),
      redis.connect().then(() => redis.ping()),
      storage.check(),
    ]);
    redis.disconnect();

    const response = createHealthResponse(requestId, {
      database: databaseResult.status === 'fulfilled' ? 'ok' : 'error',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'error',
      storage: storageResult.status === 'fulfilled' ? 'ok' : 'error',
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
