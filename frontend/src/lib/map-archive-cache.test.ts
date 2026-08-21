import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trip } from '@waypoint/shared';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiFetch }));

class MemoryCache {
  readonly rows = new Map<string, Response>();
  async match(key: RequestInfo | URL) {
    return this.rows.get(String(key))?.clone();
  }
  async put(key: RequestInfo | URL, value: Response) {
    this.rows.set(String(key), value.clone());
  }
  async delete(key: RequestInfo | URL) {
    return this.rows.delete(String(key));
  }
  async keys() {
    return [...this.rows.keys()].map((key) => new Request(key));
  }
}

const trip = (id: string, endDate = '2026-08-20') => ({ id, endDate }) as Trip;
let memory: MemoryCache;

beforeEach(() => {
  memory = new MemoryCache();
  apiFetch.mockReset();
  vi.stubGlobal('caches', {
    open: () => Promise.resolve(memory),
    delete: () => Promise.resolve(true),
  });
  vi.stubGlobal('navigator', {
    storage: {
      persist: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 1024 * 1024 * 1024 }),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('downloadMapArchive', () => {
  it('stores a complete archive with byte metadata and can read it without a fetch', async () => {
    apiFetch.mockResolvedValue(
      new Response('abcd', { status: 200, headers: { 'Content-Length': '4' } }),
    );
    const { downloadMapArchive, readLocalMapArchive } = await import('./map-archive-cache');

    await expect(
      downloadMapArchive({
        url: 'https://app.example/trips/t1/map/extract.pmtiles',
        kind: 'extract',
        tripId: 't1',
        currentTripId: 't1',
        now: 10,
      }),
    ).resolves.toMatchObject({ status: 'stored', sizeBytes: 4 });
    await expect(
      readLocalMapArchive('https://app.example/trips/t1/map/extract.pmtiles', 20),
    ).resolves.toMatchObject({ blob: expect.objectContaining({ size: 4 }) });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('records the vintage it was cut from, which is what makes a refresh decidable', async () => {
    // ADR-0186 §6 amendment: without a label on the bytes, "is there something fresher" has no
    // answer and the first download a device ever makes is the map it keeps forever.
    apiFetch.mockResolvedValue(
      new Response('abcd', { status: 200, headers: { 'Content-Length': '4' } }),
    );
    const { downloadMapArchive, readLocalMapArchive } = await import('./map-archive-cache');

    await downloadMapArchive({
      url: 'https://app.example/map/world.pmtiles',
      kind: 'world',
      vintage: 'v7',
      now: 10,
    });
    await expect(
      readLocalMapArchive('https://app.example/map/world.pmtiles', 20),
    ).resolves.toMatchObject({ meta: { vintage: 'v7', downloadedAt: 10 } });
  });

  it('reports 503 as preparing with Retry-After, not as a failed download', async () => {
    apiFetch.mockResolvedValue(
      new Response(null, { status: 503, headers: { 'Retry-After': '9' } }),
    );
    const { downloadMapArchive } = await import('./map-archive-cache');

    await expect(
      downloadMapArchive({
        url: 'https://app.example/trips/t1/map/extract.pmtiles',
        kind: 'extract',
        tripId: 't1',
        currentTripId: 't1',
      }),
    ).resolves.toEqual({ status: 'preparing', retryAfterSeconds: 9 });
  });

  it('checks storage headroom before writing the response body', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({ usage: 99, quota: 100 }),
      },
    });
    apiFetch.mockResolvedValue(
      new Response('abcd', { status: 200, headers: { 'Content-Length': '4' } }),
    );
    const { downloadMapArchive } = await import('./map-archive-cache');

    await expect(
      downloadMapArchive({
        url: 'https://app.example/map/world.pmtiles',
        kind: 'world',
        currentTripId: 't1',
      }),
    ).resolves.toEqual({ status: 'no-space', sizeBytes: 4 });
  });
});

describe('retainMapArchives', () => {
  it('deletes extracts for removed and grace-expired trips while keeping the current trip pinned', async () => {
    const { seedMapArchiveForTests, retainMapArchives, listMapArchives } =
      await import('./map-archive-cache');
    await seedMapArchiveForTests('https://app.example/world', 4, { kind: 'world', now: 1 });
    await seedMapArchiveForTests('https://app.example/current', 4, {
      kind: 'extract',
      tripId: 'current',
      now: 2,
    });
    await seedMapArchiveForTests('https://app.example/expired', 4, {
      kind: 'extract',
      tripId: 'expired',
      now: 3,
    });
    await seedMapArchiveForTests('https://app.example/removed', 4, {
      kind: 'extract',
      tripId: 'removed',
      now: 4,
    });

    await retainMapArchives({
      trips: [trip('current', '2026-08-20'), trip('expired', '2026-07-01')],
      currentTripId: 'current',
      now: Date.parse('2026-08-14T00:00:00Z'),
      budgetBytes: 8,
    });

    await expect(listMapArchives()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'https://app.example/world' }),
        expect.objectContaining({ key: 'https://app.example/current', tripId: 'current' }),
      ]),
    );
    expect((await listMapArchives()).map((entry) => entry.tripId)).not.toContain('expired');
    expect((await listMapArchives()).map((entry) => entry.tripId)).not.toContain('removed');
  });
});
