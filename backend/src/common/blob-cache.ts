// Two-tier, ciphertext-only read cache for document blobs (ADR-0055), keyed by the
// immutable `Document.fileRef`. A blob's bytes never change for a given fileRef —
// replacing a file mints a fresh fileRef and deletes the old blob — so entries need
// eviction on delete/replace only, never content invalidation.
//
// Both tiers hold exactly the bytes S3 holds: AES-256-GCM ciphertext. Caching plaintext
// on disk would put passport scans on the container filesystem and erode ADR-0015/0034's
// at-rest protection, so the cache stays ciphertext-only. Decrypt still runs per read
// (upstream in documents.service) — the win is skipping the S3 round-trip.
//
// The filesystem tier is a cache, never a source of truth (ADR-0031): the ephemeral
// container FS may drop it on redeploy, and a miss simply falls through to S3.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createByteLru } from './byte-lru';
import {
  DEFAULT_DOC_CACHE_MAX_BYTES,
  DOC_CACHE_DIR,
  DOC_CACHE_DISABLED,
  DOC_CACHE_MAX_BYTES,
} from './env';

// In-memory LRU bounded by total bytes — `byte-lru.ts`, which is this tier extracted when the
// map's planet proxy needed the same shape (ADR-0187 §1). The bound is passed as a function
// because it is read from the environment per call, below.
const memory = createByteLru(() => maxBytes());

// Env is read per call (not at module load) so tests can `stubEnv` it, mirroring
// storage.ts's own late reads of the S3_* vars.
function disabled(): boolean {
  return Boolean(process.env[DOC_CACHE_DISABLED]);
}

function maxBytes(): number {
  const raw = process.env[DOC_CACHE_MAX_BYTES];
  const parsed = raw ? Number(raw) : DEFAULT_DOC_CACHE_MAX_BYTES;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DOC_CACHE_MAX_BYTES;
}

function cacheDir(): string | null {
  return process.env[DOC_CACHE_DIR] || null;
}

// fileRef is a server-minted UUID, but a cache key is never trusted into a path: reject
// anything that could escape the cache directory.
function safeKey(key: string): boolean {
  return key.length > 0 && !key.includes('/') && !key.includes('\\') && !key.includes('..');
}

async function fsGet(key: string): Promise<Buffer | null> {
  const dir = cacheDir();
  if (!dir) return null;
  try {
    return await readFile(join(dir, key));
  } catch {
    return null; // a miss (or a dir dropped on redeploy) falls through to S3
  }
}

async function fsPut(key: string, buf: Buffer): Promise<void> {
  const dir = cacheDir();
  if (!dir) return;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, key), buf);
  } catch {
    // Best-effort: a write failure (disk full, permissions) must not fail the read it
    // was warming — the source of truth is still S3.
  }
}

async function fsEvict(key: string): Promise<void> {
  const dir = cacheDir();
  if (!dir) return;
  await rm(join(dir, key), { force: true }).catch(() => undefined);
}

/** Read a cached ciphertext blob: memory → filesystem. A filesystem hit is promoted into
 *  memory. Returns null on a miss or when the cache is disabled. */
export async function getCachedBlob(key: string): Promise<Buffer | null> {
  if (disabled() || !safeKey(key)) return null;
  const hot = memory.get(key);
  if (hot) return hot;
  const warm = await fsGet(key);
  if (warm) {
    memory.put(key, warm);
    return warm;
  }
  return null;
}

/** Warm both tiers with a blob — the just-read S3 body, or the just-written upload. */
export async function putCachedBlob(key: string, buf: Buffer): Promise<void> {
  if (disabled() || !safeKey(key)) return;
  memory.put(key, buf);
  await fsPut(key, buf);
}

/** Evict a blob from every tier — the only invalidation a fileRef-keyed cache ever needs
 *  (on delete/replace). Runs even when the cache is disabled, to clear a tier left behind
 *  from before the kill switch was flipped. */
export async function evictCachedBlob(key: string): Promise<void> {
  if (!safeKey(key)) return;
  memory.drop(key);
  await fsEvict(key);
}

/** Test-only: drop the in-memory tier so the module singleton can't leak across tests. */
export function resetBlobCacheForTests(): void {
  memory.clear();
}
