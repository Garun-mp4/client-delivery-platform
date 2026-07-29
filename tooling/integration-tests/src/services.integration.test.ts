import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { ClamAvScanner } from '@garun/storage';

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for integration tests.`);
  }
  return value;
}

const databaseUrl = requireEnvironment('TEST_DATABASE_URL');
const redisUrl = requireEnvironment('TEST_REDIS_URL');
const minioEndpoint = requireEnvironment('TEST_MINIO_ENDPOINT');
const minioAccessKey = requireEnvironment('TEST_MINIO_ACCESS_KEY');
const minioSecretKey = requireEnvironment('TEST_MINIO_SECRET_KEY');
const mailpitUrl = requireEnvironment('TEST_MAILPIT_URL');
const scannerHost = requireEnvironment('TEST_SCANNER_HOST');
const scannerPort = Number(requireEnvironment('TEST_SCANNER_PORT'));

const pool = new Pool({ connectionString: databaseUrl });
const redis = new Redis(redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
const unauthenticatedRedisUrl = new URL(redisUrl);
unauthenticatedRedisUrl.password = '';
unauthenticatedRedisUrl.username = '';
const unauthenticatedRedis = new Redis(unauthenticatedRedisUrl.toString(), {
  enableOfflineQueue: false,
  enableReadyCheck: false,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
unauthenticatedRedis.on('error', () => undefined);
const s3 = new S3Client({
  endpoint: minioEndpoint,
  forcePathStyle: true,
  region: 'us-east-1',
  credentials: { accessKeyId: minioAccessKey, secretAccessKey: minioSecretKey },
});
const unauthenticatedS3 = new S3Client({
  endpoint: minioEndpoint,
  forcePathStyle: true,
  region: 'us-east-1',
  credentials: { accessKeyId: 'invalid-access-key', secretAccessKey: 'invalid-secret-key' },
});
const scanner = new ClamAvScanner(scannerHost, scannerPort, 10_000);

afterAll(async () => {
  await pool.end();
  redis.disconnect();
  unauthenticatedRedis.disconnect();
  s3.destroy();
  unauthenticatedS3.destroy();
});

describe('local infrastructure', () => {
  it('runs the Drizzle migration in PostgreSQL', async () => {
    const result = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'system_metadata'",
    );
    expect(result.rows).toEqual([{ table_name: 'system_metadata' }]);
  });

  it('accepts authenticated Redis commands', async () => {
    await expect(redis.ping()).resolves.toBe('PONG');
  });

  it('rejects unauthenticated Redis commands', async () => {
    await expect(unauthenticatedRedis.ping()).rejects.toThrow(/NOAUTH/);
  });

  it('exposes an authenticated S3-compatible MinIO API', async () => {
    const result = await s3.send(new ListBucketsCommand({}));
    expect(result.$metadata.httpStatusCode).toBe(200);
  });

  it('rejects invalid MinIO credentials', async () => {
    await expect(unauthenticatedS3.send(new ListBucketsCommand({}))).rejects.toThrow();
  });

  it('exposes the local Mailpit API without sending real email', async () => {
    const response = await fetch(`${mailpitUrl}/api/v1/info`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('scans clean content and rejects the standard antivirus test signature', async () => {
    await expect(
      scanner.scan(new TextEncoder().encode('Garun Workspace clean file')),
    ).resolves.toEqual({
      clean: true,
      engine: 'clamav',
      resultCode: 'CLEAN',
    });
    const antivirusTestSignature =
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    await expect(
      scanner.scan(new TextEncoder().encode(antivirusTestSignature)),
    ).resolves.toMatchObject({
      clean: false,
      engine: 'clamav',
      resultCode: 'INFECTED',
    });
  });
});
