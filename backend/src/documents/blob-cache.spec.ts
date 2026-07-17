import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evictCachedBlob,
  getCachedBlob,
  putCachedBlob,
  resetBlobCacheForTests,
} from './blob-cache';

// AES-256-GCM ciphertext looks nothing like the plaintext it protects; the cache only
// ever sees these bytes, so this stands in for a real encrypted blob. It deliberately
// contains none of PLAINTEXT's bytes, so a test can assert the disk holds cipher, not clear.
const PLAINTEXT = 'PASSPORT No. AB1234567';
const CIPHERTEXT = Buffer.from('\x9f\x3a\x00\x01\x02enc-blob-bytes\xff\xfe', 'binary');

describe('blob-cache — in-memory tier', () => {
  beforeEach(() => resetBlobCacheForTests());
  afterEach(() => vi.unstubAllEnvs());

  it('round-trips a blob through memory (no FS dir configured)', async () => {
    await putCachedBlob('ref-1', CIPHERTEXT);
    expect(await getCachedBlob('ref-1')).toEqual(CIPHERTEXT);
  });

  it('returns null for an unknown key', async () => {
    expect(await getCachedBlob('missing')).toBeNull();
  });

  it('evicts the least-recently-used blob once the byte bound is exceeded', async () => {
    vi.stubEnv('DOC_CACHE_MAX_BYTES', '10');
    await putCachedBlob('a', Buffer.alloc(6, 1));
    await putCachedBlob('b', Buffer.alloc(6, 2)); // total would be 12 > 10 → 'a' evicted

    expect(await getCachedBlob('a')).toBeNull();
    expect(await getCachedBlob('b')).toEqual(Buffer.alloc(6, 2));
  });

  it('a read marks a blob most-recently-used, sparing it from the next eviction', async () => {
    vi.stubEnv('DOC_CACHE_MAX_BYTES', '12');
    await putCachedBlob('a', Buffer.alloc(6, 1));
    await putCachedBlob('b', Buffer.alloc(6, 2));
    await getCachedBlob('a'); // 'a' now most-recently-used
    await putCachedBlob('c', Buffer.alloc(6, 3)); // evicts LRU → 'b'

    expect(await getCachedBlob('b')).toBeNull();
    expect(await getCachedBlob('a')).toEqual(Buffer.alloc(6, 1));
    expect(await getCachedBlob('c')).toEqual(Buffer.alloc(6, 3));
  });

  it('never caches a blob larger than the whole bound', async () => {
    vi.stubEnv('DOC_CACHE_MAX_BYTES', '4');
    await putCachedBlob('big', Buffer.alloc(8, 9));
    expect(await getCachedBlob('big')).toBeNull();
  });
});

describe('blob-cache — filesystem tier', () => {
  let dir: string;

  beforeEach(async () => {
    resetBlobCacheForTests();
    dir = await mkdtemp(join(tmpdir(), 'wp-blob-cache-'));
    vi.stubEnv('DOC_CACHE_DIR', dir);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it('persists to disk and the on-disk bytes are the ciphertext, not plaintext', async () => {
    await putCachedBlob('ref-1', CIPHERTEXT);

    const onDisk = await readFile(join(dir, 'ref-1'));
    expect(onDisk).toEqual(CIPHERTEXT);
    expect(onDisk.toString('utf8')).not.toContain(PLAINTEXT);
  });

  it('serves from the FS tier and promotes into memory when memory is cold', async () => {
    await putCachedBlob('ref-1', CIPHERTEXT);
    resetBlobCacheForTests(); // simulate a fresh process: memory empty, disk warm

    expect(await getCachedBlob('ref-1')).toEqual(CIPHERTEXT);
    // second read is now served from the promoted memory tier — delete the disk copy to prove it
    await rm(join(dir, 'ref-1'), { force: true });
    expect(await getCachedBlob('ref-1')).toEqual(CIPHERTEXT);
  });

  it('evicts from every tier', async () => {
    await putCachedBlob('ref-1', CIPHERTEXT);
    await evictCachedBlob('ref-1');

    expect(await getCachedBlob('ref-1')).toBeNull();
    await expect(readFile(join(dir, 'ref-1'))).rejects.toThrow();
  });
});

describe('blob-cache — kill switch and key safety', () => {
  beforeEach(() => resetBlobCacheForTests());
  afterEach(() => vi.unstubAllEnvs());

  it('caches nothing while DOC_CACHE_DISABLED is set', async () => {
    vi.stubEnv('DOC_CACHE_DISABLED', '1');
    await putCachedBlob('ref-1', CIPHERTEXT);
    expect(await getCachedBlob('ref-1')).toBeNull();
  });

  it('refuses a key that could escape the cache directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wp-blob-cache-'));
    vi.stubEnv('DOC_CACHE_DIR', dir);
    await putCachedBlob('../escape', CIPHERTEXT);
    expect(await getCachedBlob('../escape')).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});
