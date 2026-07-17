import 'reflect-metadata';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { getObject, putObject } from './storage';

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
