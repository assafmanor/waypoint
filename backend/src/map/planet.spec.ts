import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAP_PLANET_CACHE_DIR,
  MAP_PLANET_CACHE_MAX_BYTES,
  MAP_TILES_SOURCE_URL,
} from '../common/env';
import {
  isServablePlanetBuild,
  livePlanetBuild,
  livePlanetSourceUrl,
  readPlanetRange,
  resetPlanetCacheForTests,
  resolveLivePlanetBuild,
} from './planet';

const originalFetch = globalThis.fetch;
let cacheDir: string;

/** The day the retention window was measured: upstream held 0815–0821 and 404'd 0814. */
const TODAY = '2026-08-21T12:00:00.000Z';
const daily = (build: string) => `https://build.protomaps.com/${build}.pmtiles`;

/** A fresh `Response` per call — a body can only be read once, so a shared one lies about
 *  the second read. */
function upstream(body: string, contentRange = `bytes 10-${9 + body.length}/1000`) {
  return vi.fn().mockImplementation(
    () =>
      new Response(body, {
        status: 206,
        headers: { 'Content-Range': contentRange },
      }),
  );
}

/** Upstream as it actually behaves: a handful of dailies present, everything older collected. */
function upstreamHolding(builds: string[]) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const build = url.split('/').pop()!.replace('.pmtiles', '');
    if (!builds.includes(build)) return Promise.resolve(new Response('not found', { status: 404 }));
    const range = String((init?.headers as Record<string, string> | undefined)?.Range ?? '');
    // The probe asks for the header's magic; a tile read asks for anything else.
    return Promise.resolve(
      range === 'bytes=0-6'
        ? new Response('PMTiles', { status: 206, headers: { 'Content-Range': 'bytes 0-6/1000' } })
        : new Response('abcd', { status: 206, headers: { 'Content-Range': 'bytes 10-13/1000' } }),
    );
  });
}

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'waypoint-planet-'));
  process.env[MAP_PLANET_CACHE_DIR] = cacheDir;
  process.env[MAP_PLANET_CACHE_MAX_BYTES] = '1024';
  process.env[MAP_TILES_SOURCE_URL] = 'https://tiles.example/20260813.pmtiles';
  resetPlanetCacheForTests();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  delete process.env[MAP_PLANET_CACHE_DIR];
  delete process.env[MAP_PLANET_CACHE_MAX_BYTES];
  delete process.env[MAP_TILES_SOURCE_URL];
  resetPlanetCacheForTests();
  await rm(cacheDir, { recursive: true, force: true });
});

describe('readPlanetRange', () => {
  it('forwards exactly one closed range and returns its total length', async () => {
    const fetch = upstream('abcd');
    globalThis.fetch = fetch;

    await expect(readPlanetRange('20260813', { start: 10, end: 13 })).resolves.toEqual({
      body: Buffer.from('abcd'),
      total: 1000,
    });
    expect(fetch).toHaveBeenCalledWith('https://tiles.example/20260813.pmtiles', {
      headers: { Range: 'bytes=10-13' },
      signal: expect.any(AbortSignal),
    });
  });

  it('reads the daily build it was asked for when no mirror is configured', async () => {
    delete process.env[MAP_TILES_SOURCE_URL];
    const fetch = upstream('abcd');
    globalThis.fetch = fetch;

    await readPlanetRange('20260821', { start: 10, end: 13 });
    expect(fetch).toHaveBeenCalledWith(daily('20260821'), expect.anything());
  });

  it('refuses a 206 whose Content-Range does not match the bytes requested', async () => {
    globalThis.fetch = upstream('abcd', 'bytes 11-14/1000');

    await expect(readPlanetRange('20260813', { start: 10, end: 13 })).rejects.toThrow(
      'upstream returned bytes 11-14 for requested bytes 10-13',
    );
  });

  it('refuses a short body rather than caching truncated tile bytes', async () => {
    globalThis.fetch = upstream('abc', 'bytes 10-13/1000');

    await expect(readPlanetRange('20260813', { start: 10, end: 13 })).rejects.toThrow(
      'upstream returned 3 bytes for requested 4',
    );
  });

  it('reuses the persistent tier after the in-memory cache is lost', async () => {
    const firstFetch = upstream('abcd');
    globalThis.fetch = firstFetch;
    await readPlanetRange('20260813', { start: 10, end: 13 });
    resetPlanetCacheForTests();

    const secondFetch = vi.fn().mockRejectedValue(new Error('offline upstream'));
    globalThis.fetch = secondFetch;
    await expect(readPlanetRange('20260813', { start: 10, end: 13 })).resolves.toEqual({
      body: Buffer.from('abcd'),
      total: 1000,
    });
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('never answers one build with another build’s bytes', async () => {
    // Two builds are two archives, and the same byte offset means different things in each — the
    // corruption ADR-0187 §1 put the id in the URL to prevent, which the cache must respect too.
    delete process.env[MAP_TILES_SOURCE_URL];
    const fetch = upstream('abcd');
    globalThis.fetch = fetch;

    await readPlanetRange('20260821', { start: 10, end: 13 });
    await readPlanetRange('20260820', { start: 10, end: 13 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares one upstream request when two maps ask for the same cold range together', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn().mockImplementation(async () => {
      await gate;
      return new Response('abcd', {
        status: 206,
        headers: { 'Content-Range': 'bytes 10-13/1000' },
      });
    });
    globalThis.fetch = fetch;

    const first = readPlanetRange('20260813', { start: 10, end: 13 });
    const second = readPlanetRange('20260813', { start: 10, end: 13 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { body: Buffer.from('abcd'), total: 1000 },
      { body: Buffer.from('abcd'), total: 1000 },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ── WHICH BUILD (the 2026-08-21 bug) ─────────────────────────────────────────────────
//
// The whole of it: the id was a constant in the bundle, upstream keeps about a week of dailies,
// and once it was collected every range read 404'd. Online detail drew nothing and the map lost
// its cities, roads and borders with no error on screen — the coarse world layer's fills kept
// painting, so the pane believed it had a map.
describe('resolveLivePlanetBuild', () => {
  beforeEach(() => {
    delete process.env[MAP_TILES_SOURCE_URL];
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TODAY));
  });

  it('resolves the NEWEST build upstream actually serves', async () => {
    globalThis.fetch = upstreamHolding(['20260819', '20260818']);
    await expect(resolveLivePlanetBuild()).resolves.toBe('20260819');
    expect(livePlanetBuild()).toBe('20260819');
  });

  it("takes today's build the moment it exists", async () => {
    globalThis.fetch = upstreamHolding(['20260821', '20260820']);
    await expect(resolveLivePlanetBuild()).resolves.toBe('20260821');
  });

  it('answers null when nothing upstream is readable, rather than a build nobody serves', async () => {
    globalThis.fetch = upstreamHolding([]);
    await expect(resolveLivePlanetBuild()).resolves.toBeNull();
    expect(livePlanetBuild()).toBeNull();
  });

  it('probes once and then serves the answer from memory', async () => {
    const fetch = upstreamHolding(['20260821']);
    globalThis.fetch = fetch;
    await resolveLivePlanetBuild();
    const probes = fetch.mock.calls.length;
    await resolveLivePlanetBuild();
    expect(fetch.mock.calls.length).toBe(probes);
  });

  it('refuses a 206 that is not a PMTiles archive — a bucket error page passes otherwise', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('<html>', { status: 206, headers: { 'Content-Range': 'bytes 0-6/7' } }),
      );
    await expect(resolveLivePlanetBuild()).resolves.toBeNull();
  });

  it('is the configured mirror when there is one, with no probing at all', async () => {
    process.env[MAP_TILES_SOURCE_URL] = 'https://mirror.example/our-planet.pmtiles';
    const fetch = upstreamHolding(['20260821']);
    globalThis.fetch = fetch;
    await expect(resolveLivePlanetBuild()).resolves.toBe('our-planet');
    await expect(livePlanetSourceUrl()).resolves.toBe('https://mirror.example/our-planet.pmtiles');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses to cut an extract from a source nobody serves', async () => {
    globalThis.fetch = upstreamHolding([]);
    await expect(livePlanetSourceUrl()).rejects.toThrow('no upstream planet build is readable');
  });

  it('forgets a resolved build that upstream collects while we are serving it', async () => {
    globalThis.fetch = upstreamHolding(['20260821']);
    await expect(resolveLivePlanetBuild()).resolves.toBe('20260821');

    globalThis.fetch = upstreamHolding(['20260820']);
    await expect(readPlanetRange('20260821', { start: 10, end: 13 })).rejects.toThrow(
      'upstream answered 404',
    );
    // The next resolution re-probes rather than handing out the dead id until a restart.
    await expect(resolveLivePlanetBuild()).resolves.toBe('20260820');
  });
});

describe('isServablePlanetBuild', () => {
  beforeEach(() => {
    delete process.env[MAP_TILES_SOURCE_URL];
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TODAY));
  });

  it('serves any build inside the retention window that upstream still holds', async () => {
    globalThis.fetch = upstreamHolding(['20260821', '20260820']);
    // Not only today's: a client's id is as fresh as its last `/me`, and yesterday's bytes are
    // immutable and readable — refusing them would blank a map for no gain.
    await expect(isServablePlanetBuild('20260820')).resolves.toBe(true);
  });

  it('refuses a build upstream has collected', async () => {
    globalThis.fetch = upstreamHolding(['20260821']);
    await expect(isServablePlanetBuild('20260816')).resolves.toBe(false);
  });

  it('refuses anything that is not a daily id, without asking upstream', async () => {
    const fetch = upstreamHolding(['20260821']);
    globalThis.fetch = fetch;
    await expect(isServablePlanetBuild('../secrets')).resolves.toBe(false);
    await expect(isServablePlanetBuild('latest')).resolves.toBe(false);
    // Right shape, outside the window — still no request, so this can never be an open proxy.
    await expect(isServablePlanetBuild('20240101')).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves exactly the configured mirror and nothing else', async () => {
    process.env[MAP_TILES_SOURCE_URL] = 'https://mirror.example/our-planet.pmtiles';
    await expect(isServablePlanetBuild('our-planet')).resolves.toBe(true);
    await expect(isServablePlanetBuild('20260821')).resolves.toBe(false);
  });
});
