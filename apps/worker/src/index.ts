import { createServer, type ServerResponse } from 'node:http';

import Redis from 'ioredis';

import { parseWorkerEnv } from '@garun/config';
import { checkDatabase } from '@garun/db';
import { createLogger, getOrCreateRequestId } from '@garun/observability';

import { createWorkerHealthResponse } from './health';

const environment = parseWorkerEnv();
const logger = createLogger({ service: 'worker', level: environment.LOG_LEVEL });

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
    });
    redis.on('error', () => undefined);

    const [databaseResult, redisResult] = await Promise.allSettled([
      checkDatabase(environment.DATABASE_URL),
      redis.connect().then(() => redis.ping()),
    ]);
    redis.disconnect();

    const health = createWorkerHealthResponse(requestId, {
      database: databaseResult.status === 'fulfilled' ? 'ok' : 'error',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'error',
    });
    sendJson(response, health.status === 'ok' ? 200 : 503, health, requestId);
    return;
  }

  sendJson(response, 404, { error: { code: 'NOT_FOUND', requestId } }, requestId);
});

server.listen(environment.WORKER_PORT, environment.WORKER_HOST, () => {
  logger.info(
    { host: environment.WORKER_HOST, port: environment.WORKER_PORT },
    'Worker health server started',
  );
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'Worker shutdown requested');
  server.close((error) => {
    if (error) {
      logger.error({ errorCode: 'WORKER_SHUTDOWN_FAILED' }, 'Worker shutdown failed');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
