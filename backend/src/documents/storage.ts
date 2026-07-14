import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  requireEnv,
  S3_ACCESS_KEY_ID,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_REGION,
  S3_SECRET_ACCESS_KEY,
} from '../common/env';

// Swappable byte sink for encrypted document blobs, keyed by `Document.fileRef`.
// Mirrors this codebase's existing swap idiom (DEV_AUTH branch in jwt-auth.guard.ts /
// sync.gateway.ts): the real path (S3_BUCKET set) is checked first, local disk is the
// dev-only fallback — no DI interface, add one only if a second real caller needs it.
const LOCAL_DIR = join(process.cwd(), 'storage', 'documents');

function s3Client(): S3Client {
  return new S3Client({
    endpoint: requireEnv(S3_ENDPOINT),
    region: process.env[S3_REGION] || 'auto',
    forcePathStyle: true, // required by non-AWS S3-compatible endpoints (Railway, R2)
    credentials: {
      accessKeyId: requireEnv(S3_ACCESS_KEY_ID),
      secretAccessKey: requireEnv(S3_SECRET_ACCESS_KEY),
    },
  });
}

export async function putObject(key: string, body: Buffer): Promise<void> {
  const bucket = process.env[S3_BUCKET];
  if (bucket) {
    await s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    return;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(join(LOCAL_DIR, key), body);
}

export async function getObject(key: string): Promise<Buffer> {
  const bucket = process.env[S3_BUCKET];
  if (bucket) {
    const result = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }
  return readFile(join(LOCAL_DIR, key));
}
