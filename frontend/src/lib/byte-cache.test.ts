import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createByteCache, type ByteCacheMeta } from './byte-cache';

interface Entry extends ByteCacheMeta {
  tripId?: string;
}

class MemoryCache {
  readonly rows = new Map<string, Response>();

  async match(key: RequestInfo | URL): Promise<Response | undefined> {
    return this.rows.get(String(key))?.clone();
  }

  async put(key: RequestInfo | URL, value: Response): Promise<void> {
    this.rows.set(String(key), value.clone());
  }

  async delete(key: RequestInfo | URL): Promise<boolean> {
    return this.rows.delete(String(key));
  }

  async keys(): Promise<Request[]> {
    return [...this.rows.keys()].map((key) => new Request(key));
  }
}

let memory: MemoryCache;

beforeEach(() => {
  memory = new MemoryCache();
  vi.stubGlobal('caches', {
    open: () => Promise.resolve(memory),
    delete: () => Promise.resolve(true),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('createByteCache', () => {
  it('stores bytes separately from small enumerable metadata and touches only the metadata', async () => {
    const cache = createByteCache<Entry>('test-byte-cache');
    await cache.put('https://app.example/a.pmtiles', new Response('abcd'), {
      key: 'https://app.example/a.pmtiles',
      sizeBytes: 4,
      lastUsedAt: 10,
      tripId: 't1',
    });

    await expect(cache.read('https://app.example/a.pmtiles', 20)).resolves.toMatchObject({
      blob: expect.objectContaining({ size: 4 }),
      meta: { key: 'https://app.example/a.pmtiles', sizeBytes: 4, lastUsedAt: 20, tripId: 't1' },
    });
    await expect(cache.entries()).resolves.toEqual([
      { key: 'https://app.example/a.pmtiles', sizeBytes: 4, lastUsedAt: 20, tripId: 't1' },
    ]);
  });

  // ── A FAILED REPLACE MUST NOT STRAND THE BYTES IT WAS REPLACING ─────────────────────
  //
  // Every put was a first write until an archive gained a vintage and a refresh started
  // overwriting the entry it renews (ADR-0186 §6 amendment). The old rollback deleted the meta
  // unconditionally, which for a replace leaves the previous bytes in the cache with nothing
  // describing them: `read` needs both halves, so the device would report "no archive" — and
  // re-download 42.7 MB it is still holding — while those bytes sit outside `entries()`, outside
  // the byte budget and outside eviction's reach.
  it('keeps the previous entry readable when a REPLACE fails mid-write', async () => {
    const cache = createByteCache<Entry>('test-byte-cache');
    const key = 'https://app.example/world.pmtiles';
    await cache.put(key, new Response('old!'), { key, sizeBytes: 4, lastUsedAt: 10 });

    // Only the archive's own write fails; the small meta writes still work, which is the real
    // shape of a quota or connection failure on a 42.7 MB body.
    const realPut = memory.put.bind(memory);
    memory.put = (k, v) =>
      String(k).includes('cache-meta')
        ? realPut(k, v)
        : Promise.reject(new Error('quota exceeded'));
    await expect(
      cache.put(key, new Response('newer'), { key, sizeBytes: 5, lastUsedAt: 20 }),
    ).rejects.toThrow('quota exceeded');
    memory.put = realPut;

    // The old archive is still there, still described, still counted.
    await expect(cache.read(key, 30)).resolves.toMatchObject({
      blob: expect.objectContaining({ size: 4 }),
      meta: { sizeBytes: 4 },
    });
    await expect(cache.entries()).resolves.toHaveLength(1);
  });

  it('leaves nothing behind when a FIRST write fails', async () => {
    const cache = createByteCache<Entry>('test-byte-cache');
    const key = 'https://app.example/extract.pmtiles';
    const realPut = memory.put.bind(memory);
    memory.put = (k, v) =>
      String(k).includes('cache-meta')
        ? realPut(k, v)
        : Promise.reject(new Error('quota exceeded'));

    await expect(
      cache.put(key, new Response('abcd'), { key, sizeBytes: 4, lastUsedAt: 10 }),
    ).rejects.toThrow('quota exceeded');
    memory.put = realPut;
    // No bytes were stored, so a meta describing them would be a lie the budget believes.
    await expect(cache.entries()).resolves.toEqual([]);
  });

  it('evicts least-recently-used unpinned entries until an incoming value fits', async () => {
    const cache = createByteCache<Entry>('test-byte-cache');
    const put = (key: string, sizeBytes: number, lastUsedAt: number, tripId?: string) =>
      cache.put(key, new Response('x'.repeat(sizeBytes)), { key, sizeBytes, lastUsedAt, tripId });
    await put('https://app.example/world', 4, 1);
    await put('https://app.example/old', 3, 2, 'old');
    await put('https://app.example/hot', 3, 3, 'current');

    await expect(
      cache.makeRoom({
        budgetBytes: 10,
        incomingBytes: 3,
        pinned: (entry) => !entry.tripId || entry.tripId === 'current',
      }),
    ).resolves.toBe(true);
    await expect(cache.entries()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'https://app.example/world' }),
        expect.objectContaining({ key: 'https://app.example/hot' }),
      ]),
    );
    expect((await cache.entries()).some((entry) => entry.key.endsWith('/old'))).toBe(false);
  });

  it('refuses an incoming value when pinned bytes leave no room', async () => {
    const cache = createByteCache<Entry>('test-byte-cache');
    await cache.put('https://app.example/world', new Response('12345678'), {
      key: 'https://app.example/world',
      sizeBytes: 8,
      lastUsedAt: 1,
    });

    await expect(
      cache.makeRoom({ budgetBytes: 10, incomingBytes: 3, pinned: () => true }),
    ).resolves.toBe(false);
  });
});
