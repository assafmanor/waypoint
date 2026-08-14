// The archive layer has one job the suite can hold on to: **address the right bytes, with the app's
// credentials, and say what it found.** Everything else about it happens on a worker thread inside
// MapLibre, where nothing here can look — which is exactly why what IS reachable is pinned.
//
// This file exists because `lib/pmtiles.ts` shipped without it, and the two bugs it would have
// caught are the two that reached the owner's phone: an unauthenticated read (401), and a reading
// that reported health it had not measured.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORLD = 'https://app.example/map/world.pmtiles';
const TRIP = 'https://app.example/trips/t1/map/tiles.pmtiles';

/** A whole-world archive cut to z6, the shape `MAP_WORLD_MAXZOOM` describes. */
const WORLD_HEADER = {
  minZoom: 0,
  maxZoom: 6,
  numAddressedTiles: 8221,
  minLon: -180,
  minLat: -85,
  maxLon: 180,
  maxLat: 85,
};

const fake = vi.hoisted(() => ({
  addProtocol: vi.fn(),
  token: null as string | null,
  protocols: 0,
  /** Every `PMTiles` built, in order — a re-registration is visible as a second entry. */
  constructed: [] as string[],
  /** The live `FetchSource` per URL, so a header refresh is observable. */
  sources: new Map<string, { headers: Headers; credentials?: string; refreshes: number }>(),
  /** What each archive should answer. */
  plan: new Map<string, { header?: Record<string, number> | Error; tiles?: Map<string, number> }>(),
  /** The `z/x/y` each archive was asked for. */
  asked: new Map<string, string[]>(),
}));

vi.mock('./api', () => ({ accessTokenForHeader: () => fake.token }));
vi.mock('./maplibre', () => ({
  loadMapLibre: () => Promise.resolve({ addProtocol: fake.addProtocol }),
}));
vi.mock('pmtiles', () => {
  class FetchSource {
    constructor(
      readonly url: string,
      headers: Headers,
      credentials?: string,
    ) {
      fake.sources.set(url, { headers, credentials, refreshes: 0 });
    }
    getKey() {
      return this.url;
    }
    setHeaders(headers: Headers) {
      const live = fake.sources.get(this.url);
      if (live) {
        live.headers = headers;
        live.refreshes += 1;
      }
    }
  }
  class PMTiles {
    constructor(readonly source: FetchSource) {
      fake.constructed.push(source.url);
    }
    getHeader() {
      const planned = fake.plan.get(this.source.url)?.header;
      if (planned instanceof Error) return Promise.reject(planned);
      return Promise.resolve(planned ?? WORLD_HEADER);
    }
    getZxy(z: number, x: number, y: number) {
      const key = `${z}/${x}/${y}`;
      const log = fake.asked.get(this.source.url) ?? [];
      log.push(key);
      fake.asked.set(this.source.url, log);
      const bytes = fake.plan.get(this.source.url)?.tiles?.get(key);
      return Promise.resolve(bytes == null ? undefined : { data: new ArrayBuffer(bytes) });
    }
  }
  class Protocol {
    readonly tiles = new Map<string, PMTiles>();
    readonly tile = () => {};
    constructor() {
      fake.protocols += 1;
    }
    add(archive: PMTiles) {
      this.tiles.set(archive.source.getKey(), archive);
    }
    get(url: string) {
      return this.tiles.get(url);
    }
  }
  return { FetchSource, PMTiles, Protocol };
});

/** `lib/pmtiles.ts` holds the registry at module scope on purpose (a protocol handler is
 *  page-global), so every test gets a fresh module rather than inheriting the last one's archives. */
async function freshModule() {
  vi.resetModules();
  return import('./pmtiles');
}

beforeEach(() => {
  fake.addProtocol.mockClear();
  fake.token = null;
  fake.protocols = 0;
  fake.constructed.length = 0;
  fake.sources.clear();
  fake.plan.clear();
  fake.asked.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ensurePmtilesArchives', () => {
  it('registers the pmtiles:// protocol exactly once, however often it is called', async () => {
    const { ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    await ensurePmtilesArchives([WORLD, TRIP]);
    await ensurePmtilesArchives([TRIP]);
    expect(fake.addProtocol).toHaveBeenCalledTimes(1);
    expect(fake.addProtocol.mock.calls[0]?.[0]).toBe('pmtiles');
    expect(fake.protocols).toBe(1);
  });

  // **The 401.** The tile reads happen on a worker thread and never touch `apiFetch`, so if the
  // header is not set here it is not set anywhere, and ADR-0020's global guard refuses every one.
  it('registers each archive carrying the app’s Bearer token', async () => {
    fake.token = 'tok-123';
    const { ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD, TRIP]);
    expect(fake.constructed).toEqual([WORLD, TRIP]);
    for (const url of [WORLD, TRIP]) {
      expect(fake.sources.get(url)?.headers.get('Authorization')).toBe('Bearer tok-123');
      expect(fake.sources.get(url)?.credentials).toBe('include');
    }
  });

  it('sends no Authorization header when there is no token', async () => {
    const { ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    expect(fake.sources.get(WORLD)?.headers.has('Authorization')).toBe(false);
  });

  // A rotating token has to reach an archive that is already registered, and re-adding it would
  // throw away the header/directory caches that make range reads cheap.
  it('refreshes a known archive’s headers instead of registering it again', async () => {
    fake.token = 'first';
    const { ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    fake.token = 'second';
    await ensurePmtilesArchives([WORLD]);
    expect(fake.constructed).toEqual([WORLD]);
    expect(fake.sources.get(WORLD)?.refreshes).toBe(1);
    expect(fake.sources.get(WORLD)?.headers.get('Authorization')).toBe('Bearer second');
  });
});

describe('archiveReading', () => {
  const bangkok = { zoom: 14, lat: 13.75, lng: 100.5 };

  it('says so when the archive was never registered, rather than guessing', async () => {
    const { archiveReading } = await freshModule();
    await expect(archiveReading(WORLD, bangkok)).resolves.toBe('unregistered');
  });

  it('says so when there is no camera to address a tile from', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    await expect(archiveReading(WORLD, null)).resolves.toBe('nocam');
  });

  // The reading the five diagnosis rounds needed: zoom range, tile count, and the bytes actually
  // held under the camera.
  it('reports the header’s zooms, its tile count and the bytes under the camera', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    // z14 is past this archive's ceiling, so the renderer overzooms tile z6 — probe the same one.
    // The addressing itself is checked against hand-verifiable quadrants further down; this key is
    // only the one Bangkok lands in.
    const asked = '6/49/29';
    fake.plan.set(WORLD, { tiles: new Map([[asked, 4200]]) });
    await expect(archiveReading(WORLD, bangkok)).resolves.toBe('z0-6/8221t/6:4.2k');
    expect(fake.asked.get(WORLD)).toEqual([asked]);
  });

  // `206` beside `MISS` is a cut that succeeded and does not cover the trip — a cutting-bounds bug,
  // and indistinguishable from health by any HTTP status.
  it('reports MISS when the archive holds no tile there', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([TRIP]);
    fake.plan.set(TRIP, { header: { ...WORLD_HEADER, maxZoom: 14, numAddressedTiles: 531 } });
    await expect(archiveReading(TRIP, bangkok)).resolves.toBe('z0-14/531t/14:MISS');
  });

  it('clamps the probe into the header’s zoom range, the way the renderer overzooms', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD, TRIP]);
    fake.plan.set(TRIP, { header: { ...WORLD_HEADER, minZoom: 8, maxZoom: 14 } });
    await archiveReading(WORLD, { ...bangkok, zoom: 17.4 });
    await archiveReading(TRIP, { ...bangkok, zoom: 3 });
    expect(fake.asked.get(WORLD)?.[0]).toMatch(/^6\//);
    expect(fake.asked.get(TRIP)?.[0]).toMatch(/^8\//);
  });

  it('names an inverted bbox, which no status code would reveal', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([TRIP]);
    fake.plan.set(TRIP, { header: { ...WORLD_HEADER, minLon: 100, maxLon: 100 } });
    await expect(archiveReading(TRIP, bangkok)).resolves.toContain('/bbox:BAD');
  });

  // The two failures worth telling apart: the stored blob is not an archive, and the archive is
  // still being cut. Both were live possibilities on 2026-08-14.
  it.each([['Wrong magic number for PMTiles archive'], ['Bad response code: 503']])(
    'carries the read failure’s own message: %s',
    async (message) => {
      const { archiveReading, ensurePmtilesArchives } = await freshModule();
      await ensurePmtilesArchives([WORLD]);
      fake.plan.set(WORLD, { header: new Error(message) });
      await expect(archiveReading(WORLD, bangkok)).resolves.toBe(`err:${message}`);
    },
  );

  it('truncates a runaway message so the readout stays one line', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    fake.plan.set(WORLD, { header: new Error('x'.repeat(300)) });
    await expect(archiveReading(WORLD, bangkok)).resolves.toBe(`err:${'x'.repeat(48)}`);
  });

  // The tile math, checked where it can be checked by hand: at z1 the world is four tiles, and
  // Bangkok is the north-east one. A wrong sign or a flipped axis fails here and nowhere else.
  it('addresses the tile the point is actually in', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    fake.plan.set(WORLD, { header: { ...WORLD_HEADER, maxZoom: 1 } });
    await archiveReading(WORLD, { zoom: 1, lat: 13.75, lng: 100.5 });
    await archiveReading(WORLD, { zoom: 1, lat: -33.9, lng: -70.7 });
    expect(fake.asked.get(WORLD)).toEqual(['1/1/0', '1/0/1']);
  });

  it('clamps a point at the edge of the grid rather than addressing outside it', async () => {
    const { archiveReading, ensurePmtilesArchives } = await freshModule();
    await ensurePmtilesArchives([WORLD]);
    fake.plan.set(WORLD, { header: { ...WORLD_HEADER, maxZoom: 1 } });
    await archiveReading(WORLD, { zoom: 1, lat: 89.9, lng: 180 });
    expect(fake.asked.get(WORLD)).toEqual(['1/1/0']);
  });
});
