import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageConfiguration {
  readonly endpoint: string;
  readonly publicEndpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly forcePathStyle: boolean;
}

function client(config: StorageConfiguration, publicEndpoint = false) {
  return new S3Client({
    endpoint: publicEndpoint ? config.publicEndpoint : config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export class S3ObjectStorage {
  readonly #internal: S3Client;
  readonly #public: S3Client;

  constructor(readonly config: StorageConfiguration) {
    this.#internal = client(config);
    this.#public = client(config, true);
  }

  async ensurePrivateBucket(allowedOrigin?: string) {
    try {
      await this.#internal.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch {
      await this.#internal.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
    }
    if (allowedOrigin) {
      try {
        await this.#internal.send(
          new PutBucketCorsCommand({
            Bucket: this.config.bucket,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedOrigins: [allowedOrigin],
                  AllowedMethods: ['PUT'],
                  AllowedHeaders: ['content-type', 'x-amz-*'],
                  ExposeHeaders: ['etag'],
                  MaxAgeSeconds: 600,
                },
              ],
            },
          }),
        );
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'NotImplemented') throw error;
      }
    }
  }

  async check() {
    await this.#internal.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
  }

  async signUpload(input: {
    readonly key: string;
    readonly contentType: string;
    readonly size: number;
    readonly checksum: string;
    readonly expiresIn: number;
  }) {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      ContentLength: input.size,
      ContentType: input.contentType,
      Metadata: { 'client-sha256': input.checksum },
    });
    return getSignedUrl(this.#public, command, {
      expiresIn: input.expiresIn,
      signableHeaders: new Set(['content-type']),
      unhoistableHeaders: new Set(['x-amz-meta-client-sha256']),
    });
  }

  async signDownload(input: {
    readonly key: string;
    readonly filename: string;
    readonly contentType: string;
    readonly disposition: 'attachment' | 'inline';
    readonly expiresIn: number;
  }) {
    const safeName = input.filename.replaceAll(/["\\\r\n]/g, '_');
    return getSignedUrl(
      this.#public,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        ResponseContentType: input.contentType,
        ResponseContentDisposition: `${input.disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      }),
      { expiresIn: input.expiresIn },
    );
  }

  head(key: string) {
    return this.#internal.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  get(key: string) {
    return this.#internal.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  put(key: string, body: Uint8Array, contentType: string) {
    return this.#internal.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  delete(key: string) {
    return this.#internal.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
