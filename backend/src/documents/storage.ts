import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  requireEnv,
  S3_ACCESS_KEY_ID,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_REGION,
  S3_SECRET_ACCESS_KEY,
} from '../common/env';
import { evictCachedBlob, getCachedBlob, putCachedBlob } from './blob-cache';

// Swappable byte sink for encrypted document blobs, keyed by `Document.fileRef`.
// Mirrors this codebase's existing swap idiom (DEV_AUTH branch in jwt-auth.guard.ts /
// sync.gateway.ts): the real path (S3_BUCKET set) is checked first, local disk is the
// dev-only fallback — no DI interface, add one only if a second real caller needs it.
const LOCAL_DIR = join(process.cwd(), 'storage', 'documents');

// Which backend to use: the configured S3 bucket, or `null` for the local-disk
// fallback. The fallback is dev-only — Railway's container filesystem is ephemeral
// (ADR-0031 chose S3 Storage Buckets precisely to avoid this), so writing blobs to
// local disk in production silently loses every document on the next redeploy
// (ENOENT on later reads). Fail loud at the misconfiguration instead of at data loss.
function storageBucket(): string | null {
  const bucket = process.env[S3_BUCKET];
  if (bucket) return bucket;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${S3_BUCKET} not configured: production document storage requires an S3 bucket ` +
        `(${S3_ENDPOINT}, ${S3_ACCESS_KEY_ID}, ${S3_SECRET_ACCESS_KEY}). The local-disk ` +
        `fallback is dev-only and loses uploads on redeploy (ephemeral filesystem).`,
    );
  }
  return null;
}

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
  const bucket = storageBucket();
  if (bucket) {
    await s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
  } else {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(join(LOCAL_DIR, key), body);
  }
  // Warm the cache so the first open after an upload is served locally (ADR-0055).
  await putCachedBlob(key, body);
}

export async function getObject(key: string): Promise<Buffer> {
  // Read-through: memory → filesystem → S3, populating the tiers that missed (ADR-0055).
  const cached = await getCachedBlob(key);
  if (cached) return cached;

  const bucket = storageBucket();
  let bytes: Buffer;
  if (bucket) {
    const result = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    bytes = Buffer.from((await result.Body?.transformToByteArray()) ?? []);
  } else {
    bytes = await readFile(join(LOCAL_DIR, key));
  }
  await putCachedBlob(key, bytes);
  return bytes;
}

export async function deleteObject(key: string): Promise<void> {
  // Evict every cache tier first — a fileRef is retired for good on delete/replace, so a
  // lingering entry could only serve a blob whose backing object is about to vanish.
  await evictCachedBlob(key);
  const bucket = storageBucket();
  if (bucket) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  await rm(join(LOCAL_DIR, key), { force: true });
}
