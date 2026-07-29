import { describe, expect, it } from 'vitest';

import { S3ObjectStorage } from './s3';

const storage = new S3ObjectStorage({
  endpoint: 'https://storage.internal.invalid',
  publicEndpoint: 'https://files.example.test',
  region: 'us-east-1',
  bucket: 'private-files',
  accessKey: 'test-access-key',
  secretKey: 'test-secret-key',
  forcePathStyle: true,
});

describe('S3 signed URLs', () => {
  it('binds upload length, MIME and checksum metadata to a short-lived URL', async () => {
    const signed = new URL(
      await storage.signUpload({
        key: 'workspace/project/file/original',
        contentType: 'text/plain',
        size: 42,
        checksum: 'a'.repeat(64),
        expiresIn: 900,
      }),
    );

    expect(signed.origin).toBe('https://files.example.test');
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('900');
    const headers = signed.searchParams.get('X-Amz-SignedHeaders')?.split(';');
    expect(headers).toEqual(
      expect.arrayContaining([
        'content-length',
        'content-type',
        'host',
        'x-amz-meta-client-sha256',
      ]),
    );
  });

  it('forces an encoded attachment filename and a shorter download lifetime', async () => {
    const signed = new URL(
      await storage.signDownload({
        key: 'workspace/project/file/original',
        filename: 'бриф клиента.pdf',
        contentType: 'application/pdf',
        disposition: 'attachment',
        expiresIn: 60,
      }),
    );

    expect(signed.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(signed.searchParams.get('response-content-disposition')).toContain('attachment');
    expect(signed.searchParams.get('response-content-disposition')).not.toContain('\r');
  });
});
