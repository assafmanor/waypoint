import 'reflect-metadata';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { deleteObject, getObject, putObject } from './storage';
import { resetBlobCacheForTests } from './blob-cache';

// The blob cache is a module singleton; clear it between tests so a warm entry from one
// test can't make another see an unexpected hit (or miss).
beforeEach(() => resetBlobCacheForTests());

const s3Env = () => {
  vi.stubEnv('S3_BUCKET', 'my-bucket');
  vi.stubEnv('S3_ENDPOINT', 'https://s3.example.com');
  vi.stubEnv('S3_ACCESS_KEY_ID', 'id');
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret');
};

const commandNames = (send: { mock: { calls: unknown[][] } }): string[] =>
  send.mock.calls.map((call) => (call[0] as object).constructor.name);

describe('storage (S3 branch)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('putObject sends a PutObjectCommand to the configured bucket/key when S3_BUCKET is set', async () => {
    vi.stubEnv('S3_BUCKET', 'my-bucket');
    vi.stubEnv('S3_ENDPOINT', 'https://s3.example.com');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'id');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret');
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    await putObject('doc-1', Buffer.from('hello'));

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as unknown as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 'doc-1',
      Body: Buffer.from('hello'),
    });
  });

  it('getObject sends a GetObjectCommand and returns the body bytes', async () => {
    vi.stubEnv('S3_BUCKET', 'my-bucket');
    vi.stubEnv('S3_ENDPOINT', 'https://s3.example.com');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'id');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret');
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array(Buffer.from('world')) },
    } as never);

    const result = await getObject('doc-1');

    expect(result).toEqual(Buffer.from('world'));
    const command = send.mock.calls[0][0] as unknown as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({ Bucket: 'my-bucket', Key: 'doc-1' });
  });
});

describe('storage (local-disk fallback)', () => {
  const LOCAL_DIR = join(process.cwd(), 'storage', 'documents');

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(LOCAL_DIR, { recursive: true, force: true });
  });

  it('refuses the local-disk fallback in production (fail loud, not silent data loss)', async () => {
    vi.stubEnv('S3_BUCKET', '');
    vi.stubEnv('NODE_ENV', 'production');

    await expect(putObject('doc-1', Buffer.from('bytes'))).rejects.toThrow(
      /S3_BUCKET not configured/,
    );
    await expect(getObject('doc-1')).rejects.toThrow(/S3_BUCKET not configured/);
  });

  it('writes to and reads from local disk outside production when S3 is unset', async () => {
    vi.stubEnv('S3_BUCKET', '');
    vi.stubEnv('NODE_ENV', 'test');

    await putObject('doc-1', Buffer.from('local bytes'));
    expect(await getObject('doc-1')).toEqual(Buffer.from('local bytes'));
  });
});

describe('storage (blob cache read-through, ADR-0055)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('serves a repeat open from the cache — no second S3 GET', async () => {
    s3Env();
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array(Buffer.from('cipher')) },
    } as never);

    expect(await getObject('ref-1')).toEqual(Buffer.from('cipher'));
    expect(await getObject('ref-1')).toEqual(Buffer.from('cipher'));

    expect(commandNames(send).filter((n) => n === 'GetObjectCommand')).toHaveLength(1);
  });

  it('putObject warms the cache so the first open after upload skips S3', async () => {
    s3Env();
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    await putObject('ref-1', Buffer.from('cipher'));
    expect(await getObject('ref-1')).toEqual(Buffer.from('cipher'));

    expect(commandNames(send)).toEqual(['PutObjectCommand']); // no GET reached S3
  });

  it('deleteObject evicts the cache so the next open falls through to S3', async () => {
    s3Env();
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array(Buffer.from('cipher')) },
    } as never);

    await putObject('ref-1', Buffer.from('cipher')); // warms cache
    await deleteObject('ref-1'); // evicts every tier
    await getObject('ref-1'); // must miss → S3 GET

    expect(commandNames(send)).toContain('GetObjectCommand');
  });

  it('serves from the on-disk tier when memory is cold, and stores ciphertext there', async () => {
    s3Env();
    const dir = await mkdtemp(join(tmpdir(), 'wp-storage-cache-'));
    vi.stubEnv('DOC_CACHE_DIR', dir);
    // Stand-in for an AES-256-GCM blob: the storage layer only ever handles ciphertext.
    const cipher = Buffer.from('\x00\x01enc-blob-not-plaintext\xff', 'binary');
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    await putObject('ref-1', cipher); // warms memory + disk

    const onDisk = await readFile(join(dir, 'ref-1'));
    expect(onDisk).toEqual(cipher);
    expect(onDisk.toString('utf8')).not.toContain('plaintext-secret');

    resetBlobCacheForTests(); // drop memory; the disk tier remains warm
    expect(await getObject('ref-1')).toEqual(cipher);
    expect(commandNames(send)).not.toContain('GetObjectCommand'); // served from disk, not S3

    await rm(dir, { recursive: true, force: true });
  });
});
