import { S3ObjectStorage } from './s3';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment configuration: ${name}`);
  return value;
}

const storage = new S3ObjectStorage({
  endpoint: required('STORAGE_ENDPOINT'),
  publicEndpoint: required('STORAGE_PUBLIC_ENDPOINT'),
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  bucket: required('STORAGE_BUCKET'),
  accessKey: required('STORAGE_ACCESS_KEY'),
  secretKey: required('STORAGE_SECRET_KEY'),
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
});

await storage.ensurePrivateBucket(required('PUBLIC_APP_URL'));
process.stdout.write('Private object storage bucket is ready.\n');
