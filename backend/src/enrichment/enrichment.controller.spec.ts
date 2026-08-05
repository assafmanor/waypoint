import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ENRICHMENT_BLOB_KEY_PREFIX, enrichmentImageContentPath } from '@waypoint/shared';
import { DOC_LOCAL_STORAGE_DIR } from '../common/env';
import { putObject } from '../common/storage';
import { EnrichmentImageController } from './enrichment.controller';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

/** Captures the headers and body the route sets. */
function fakeResponse() {
  const headers: Record<string, string> = {};
  let body: Buffer | undefined;
  return {
    headers,
    get body() {
      return body;
    },
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    send: (buffer: Buffer) => {
      body = buffer;
    },
  };
}

describe('EnrichmentImageController', () => {
  const controller = new EnrichmentImageController();
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'enrichment-route-'));
    vi.stubEnv(DOC_LOCAL_STORAGE_DIR, storageDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(storageDir, { recursive: true, force: true });
  });

  const storeImage = async (bytes = JPEG) => {
    const key = `${ENRICHMENT_BLOB_KEY_PREFIX}${randomUUID()}`;
    await putObject(key, bytes);
    return key;
  };

  it('serves the stored bytes', async () => {
    const key = await storeImage();
    const res = fakeResponse();
    await controller.getImage(key, res);
    expect(res.body).toEqual(JPEG);
  });

  it('derives the content type from the bytes, never from what was claimed', async () => {
    const key = await storeImage();
    const res = fakeResponse();
    await controller.getImage(key, res);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves inline behind a CSP that can load nothing', async () => {
    const key = await storeImage();
    const res = fakeResponse();
    await controller.getImage(key, res);
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('caches immutably, which the key makes honest', async () => {
    const key = await storeImage();
    const res = fakeResponse();
    await controller.getImage(key, res);
    // The key IS the blob's id, so these bytes can never change at this URL.
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
  });

  it('refuses a key outside the enrichment keyspace', async () => {
    // storage.ts is one flat keyspace shared with document blobs. Without the prefix check
    // this @Public route would hand out a document's ciphertext to anyone.
    const documentKey = randomUUID();
    await putObject(documentKey, JPEG);

    await expect(controller.getImage(documentKey, fakeResponse())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s a key that was never stored', async () => {
    await expect(
      controller.getImage(`${ENRICHMENT_BLOB_KEY_PREFIX}${randomUUID()}`, fakeResponse()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s rather than serving bytes that are not an image', async () => {
    const key = await storeImage(Buffer.from('not an image at all, just some text here'));
    // Belt-and-braces: the pipeline already sniffed on the way in, and this is the door out.
    await expect(controller.getImage(key, fakeResponse())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('serves the path the shared builder names', async () => {
    const key = await storeImage();
    // One builder, so no client constructs this URL and a route change reaches every caller.
    expect(enrichmentImageContentPath(key)).toBe(`/enrichment/images/${key}`);
  });
});
