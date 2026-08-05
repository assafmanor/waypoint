import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEnrichmentBlobKey, MAX_ENRICHMENT_IMAGE_BYTES } from '@waypoint/shared';
import { DOC_LOCAL_STORAGE_DIR } from '../common/env';
import { getObject } from '../common/storage';
import { EnrichmentImagePipeline } from './image-pipeline';
import {
  DisallowedHostError,
  ResponseTooLargeError,
  type EnrichmentFetcher,
} from './outbound-fetch';

// Real signature bytes, since the whole point is that the SNIFFER decides the type.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const NOT_AN_IMAGE = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

const THUMB_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Sensoji_2023.jpg/800px-Sensoji_2023.jpg';

/** A fetcher stub: providers and this pipeline both take one, which is what keeps them
 *  testable with no socket. */
function fetcherReturning(result: Buffer | Error | { status: number }): {
  fetcher: EnrichmentFetcher;
  calls: { url: string; maxBytes?: number }[];
} {
  const calls: { url: string; maxBytes?: number }[] = [];
  const fetcher = {
    async fetch(url: string, options?: { maxBytes?: number }) {
      calls.push({ url, maxBytes: options?.maxBytes });
      if (result instanceof Error) throw result;
      if (Buffer.isBuffer(result)) {
        return { url, status: 200, contentType: 'image/jpeg', body: result };
      }
      return { url, status: result.status, contentType: null, body: Buffer.alloc(0) };
    },
  } as unknown as EnrichmentFetcher;
  return { fetcher, calls };
}

describe('EnrichmentImagePipeline', () => {
  let storageDir: string;

  beforeEach(async () => {
    // An isolated blob dir so parallel spec files never share one (storage.ts's own note).
    storageDir = await mkdtemp(join(tmpdir(), 'enrichment-images-'));
    vi.stubEnv(DOC_LOCAL_STORAGE_DIR, storageDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(storageDir, { recursive: true, force: true });
  });

  it('stores the fetched bytes and reports what they are', async () => {
    const { fetcher } = fetcherReturning(JPEG);
    const stored = await new EnrichmentImagePipeline(fetcher).store(THUMB_URL);

    expect(stored).not.toBeNull();
    expect(stored!.mimeType).toBe('image/jpeg');
    expect(stored!.sizeBytes).toBe(JPEG.byteLength);
    // Round-trips through the real storage layer, so the bytes are actually retrievable.
    await expect(getObject(stored!.blobKey)).resolves.toEqual(JPEG);
  });

  it('prefixes the key so the public route can tell it from a document blob', async () => {
    const { fetcher } = fetcherReturning(JPEG);
    const stored = await new EnrichmentImagePipeline(fetcher).store(THUMB_URL);
    expect(isEnrichmentBlobKey(stored!.blobKey)).toBe(true);
  });

  it('mints a fresh key per store, so a stored URL is immutable', async () => {
    const pipeline = new EnrichmentImagePipeline(fetcherReturning(JPEG).fetcher);
    const first = await pipeline.store(THUMB_URL);
    const second = await pipeline.store(THUMB_URL);
    expect(first!.blobKey).not.toBe(second!.blobKey);
  });

  it('lets the SNIFFER decide the type, not the filename (§12.5)', async () => {
    // Katz's `P18` is a PNG served under a `.jpg` name — the very first real fetch in the
    // spike, and the reason the sniffer is in this pipeline at all.
    const { fetcher } = fetcherReturning(PNG);
    const stored = await new EnrichmentImagePipeline(fetcher).store(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/x/Katz.jpg/800px-Katz.jpg',
    );
    expect(stored!.mimeType).toBe('image/png');
  });

  it('refuses bytes that are not a supported raster image', async () => {
    const { fetcher } = fetcherReturning(NOT_AN_IMAGE);
    // SVG has no binary signature, so "unrecognised" already rejects the one image type
    // that is a script document — and this response goes back out inline.
    expect(await new EnrichmentImagePipeline(fetcher).store(THUMB_URL)).toBeNull();
  });

  it('passes the image byte cap, which is far below a Commons original', async () => {
    const { fetcher, calls } = fetcherReturning(JPEG);
    await new EnrichmentImagePipeline(fetcher).store(THUMB_URL);
    expect(calls[0]?.maxBytes).toBe(MAX_ENRICHMENT_IMAGE_BYTES);
    // The spike found originals up to 26.3 MB; we must never warehouse one.
    expect(MAX_ENRICHMENT_IMAGE_BYTES).toBeLessThan(26 * 1024 * 1024);
  });

  it('returns null rather than throwing when the host is refused', async () => {
    const { fetcher } = fetcherReturning(new DisallowedHostError('https://attacker.test/x.jpg'));
    // An image URL from a third-party response is the SSRF seat §7 is about — and one bad
    // candidate must not fail the whole pass.
    expect(
      await new EnrichmentImagePipeline(fetcher).store('https://attacker.test/x.jpg'),
    ).toBeNull();
  });

  it('returns null when the body exceeds the cap', async () => {
    const { fetcher } = fetcherReturning(new ResponseTooLargeError(MAX_ENRICHMENT_IMAGE_BYTES));
    expect(await new EnrichmentImagePipeline(fetcher).store(THUMB_URL)).toBeNull();
  });

  it('returns null on a non-200 rather than storing an error page', async () => {
    const { fetcher } = fetcherReturning({ status: 404 });
    expect(await new EnrichmentImagePipeline(fetcher).store(THUMB_URL)).toBeNull();
  });

  it('knows nothing about places or providers', async () => {
    // The link-preview backlog item is promised this pipeline (ADR-0166 Consequences), which
    // only holds while `store` takes a bare URL and returns a bare blob.
    const { fetcher } = fetcherReturning(JPEG);
    const pipeline = new EnrichmentImagePipeline(fetcher);
    expect(pipeline.store.length).toBe(1);
  });
});
