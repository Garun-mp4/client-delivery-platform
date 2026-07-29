import { createServer, type ServerResponse } from 'node:http';

import Redis from 'ioredis';

import { parseWorkerEnv } from '@garun/config';
import { checkDatabase, createDatabaseClient } from '@garun/db';
import { createLogger, getOrCreateRequestId } from '@garun/observability';
import { ClamAvScanner, S3ObjectStorage } from '@garun/storage';

import { createWorkerHealthResponse } from './health';
import { startFileProcessor } from './files';
import { startOutboxDispatcher } from './outbox';

const environment = parseWorkerEnv();
const logger = createLogger({
  environment: environment.APP_ENV,
  level: environment.LOG_LEVEL,
  service: 'worker',
});
const database = createDatabaseClient(environment.DATABASE_URL);
const stopOutbox = startOutboxDispatcher(database.pool, environment, logger);
const stopFiles = startFileProcessor(database.pool, environment, logger);

function sendJson(response: ServerResponse, statusCode: number, body: unknown, requestId: string) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-request-id': requestId,
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const requestId = getOrCreateRequestId(request.headers['x-request-id']);
  const path = new URL(request.url ?? '/', 'http://worker.local').pathname;

  if (request.method !== 'GET') {
    sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', requestId } }, requestId);
    return;
  }

  if (path === '/health/live') {
    sendJson(response, 200, createWorkerHealthResponse(requestId), requestId);
    return;
  }

  if (path === '/health/ready') {
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
    const scanner = new ClamAvScanner(environment.SCANNER_HOST, environment.SCANNER_PORT);
    const [databaseResult, redisResult, storageResult, scannerResult] = await Promise.allSettled([
      checkDatabase(environment.DATABASE_URL),
      redis.connect().then(() => redis.ping()),
      storage.check(),
      scanner.ping(),
    ]);
    redis.disconnect();

    const health = createWorkerHealthResponse(requestId, {
      database: databaseResult.status === 'fulfilled' ? 'ok' : 'error',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'error',
      storage: storageResult.status === 'fulfilled' ? 'ok' : 'error',
      scanner: scannerResult.status === 'fulfilled' ? 'ok' : 'error',
    });
    sendJson(response, health.status === 'ok' ? 200 : 503, health, requestId);
    return;
  }

  sendJson(response, 404, { error: { code: 'NOT_FOUND', requestId } }, requestId);
});

server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;
server.requestTimeout = 10_000;

server.listen(environment.WORKER_PORT, environment.WORKER_HOST, () => {
  logger.info(
    { host: environment.WORKER_HOST, port: environment.WORKER_PORT },
    'Worker health server started',
  );
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Worker shutdown requested');
  stopOutbox();
  stopFiles();
  server.close((error) => {
    if (error) {
      logger.error({ errorCode: 'WORKER_SHUTDOWN_FAILED' }, 'Worker shutdown failed');
      process.exitCode = 1;
    }
    void database.pool.end();
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
