import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAP_PLANET_CACHE_DIR,
  MAP_PLANET_CACHE_MAX_BYTES,
  MAP_TILES_SOURCE_URL,
} from '../common/env';
import { planetBuildId, readPlanetRange, resetPlanetCacheForTests } from './planet';

const originalFetch = globalThis.fetch;
let cacheDir: string;

function upstream(body: string, contentRange = `bytes 10-${9 + body.length}/1000`) {
  return vi.fn().mockResolvedValue(
    new Response(body, {
      status: 206,
      headers: { 'Content-Range': contentRange },
    }),
  );
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
  delete process.env[MAP_PLANET_CACHE_DIR];
  delete process.env[MAP_PLANET_CACHE_MAX_BYTES];
  delete process.env[MAP_TILES_SOURCE_URL];
  resetPlanetCacheForTests();
  await rm(cacheDir, { recursive: true, force: true });
});

describe('planetBuildId', () => {
  it('comes from the immutable object the server actually reads', () => {
    expect(planetBuildId()).toBe('20260813');
  });
});

describe('readPlanetRange', () => {
  it('forwards exactly one closed range and returns its total length', async () => {
    const fetch = upstream('abcd');
    globalThis.fetch = fetch;

    await expect(readPlanetRange({ start: 10, end: 13 })).resolves.toEqual({
      body: Buffer.from('abcd'),
      total: 1000,
    });
    expect(fetch).toHaveBeenCalledWith('https://tiles.example/20260813.pmtiles', {
      headers: { Range: 'bytes=10-13' },
      signal: expect.any(AbortSignal),
    });
  });

  it('refuses a 206 whose Content-Range does not match the bytes requested', async () => {
    globalThis.fetch = upstream('abcd', 'bytes 11-14/1000');

    await expect(readPlanetRange({ start: 10, end: 13 })).rejects.toThrow(
      'upstream returned bytes 11-14 for requested bytes 10-13',
    );
  });

  it('refuses a short body rather than caching truncated tile bytes', async () => {
    globalThis.fetch = upstream('abc', 'bytes 10-13/1000');

    await expect(readPlanetRange({ start: 10, end: 13 })).rejects.toThrow(
      'upstream returned 3 bytes for requested 4',
    );
  });

  it('reuses the persistent tier after the in-memory cache is lost', async () => {
    const firstFetch = upstream('abcd');
    globalThis.fetch = firstFetch;
    await readPlanetRange({ start: 10, end: 13 });
    resetPlanetCacheForTests();

    const secondFetch = vi.fn().mockRejectedValue(new Error('offline upstream'));
    globalThis.fetch = secondFetch;
    await expect(readPlanetRange({ start: 10, end: 13 })).resolves.toEqual({
      body: Buffer.from('abcd'),
      total: 1000,
    });
    expect(secondFetch).not.toHaveBeenCalled();
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

    const first = readPlanetRange({ start: 10, end: 13 });
    const second = readPlanetRange({ start: 10, end: 13 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { body: Buffer.from('abcd'), total: 1000 },
      { body: Buffer.from('abcd'), total: 1000 },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
