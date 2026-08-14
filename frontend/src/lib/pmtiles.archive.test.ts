// **A real archive, byte for byte, read by the real library** — and the reason this file is
// separate from `pmtiles.test.ts` is that that one mocks `pmtiles` to watch how we CALL it, while
// this one must not mock it at all.
//
// The gap it closes is the one ADR-0186's amendment 269f had to admit in writing: **no test in this
// repo had ever read a PMTiles archive.** Five rounds of diagnosis on 2026-08-14 turned on what an
// archive's header contains and every one of them was answered by inference, because the suite
// mocked the layer that reads it. So the reading the diagnostic now shows the owner is itself
// unverified — an instrument nobody has checked is not evidence.
//
// So the archive here is assembled from the spec: the 127-byte v3 header at its documented offsets,
// a root directory holding one Hilbert-addressed entry, and the tile bytes it points at. Nothing is
// stubbed below `fetch`, which means the assertions cover pmtiles' own header parser, its directory
// deserialiser, its range arithmetic, and our zoom clamp and formatting on top.
//
// **What it still does NOT cover, and this must not be overstated:** these bytes were written here,
// not by `pmtiles extract`. Whether the deployed cutter writes a usable zoom range and bbox is
// unknown until an archive it produced is read — which needs the runtime image (no `pmtiles` binary
// in this sandbox, no Docker daemon to build one). That remains owed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_WORLD = 'https://app.example/map/world.pmtiles';

vi.mock('./api', () => ({ accessTokenForHeader: () => 'tok-real' }));
vi.mock('./maplibre', () => ({ loadMapLibre: () => Promise.resolve({ addProtocol: () => {} }) }));

/** The spec's magic, `PM` little-endian — pmtiles refuses anything else outright. */
const MAGIC = 0x4d50;
/** Header length, and therefore where the root directory starts here. */
const HEADER_BYTES = 127;
const ROOT_AT = HEADER_BYTES;
const TILE_BYTES = 4200;
/** `Compression.None` / `TileType.Mvt`, so nothing here needs gzip to be readable. */
const NO_COMPRESSION = 1;
const MVT = 1;

/**
 * The Hilbert tile id pmtiles addresses a tile by, written out rather than imported so the entry
 * below is a fact this file states instead of one it borrows from the code under test.
 * `zxyToTileId(1, 1, 0)` is 4: the z1 level starts at id 1, and the north-east quadrant is +3.
 */
const Z1_NORTHEAST = 4;

interface ArchiveShape {
  minZoom?: number;
  maxZoom?: number;
  tileId?: number;
  magic?: number;
  bbox?: [number, number, number, number];
  addressedTiles?: number;
}

/** A whole PMTiles v3 archive holding exactly one tile. */
function buildArchive(shape: ArchiveShape = {}): Uint8Array {
  const {
    minZoom = 0,
    maxZoom = 1,
    tileId = Z1_NORTHEAST,
    magic = MAGIC,
    bbox = [-180, -85, 180, 85],
    addressedTiles = 1,
  } = shape;
  // The directory is laid out first, because its length decides where the tile data starts and the
  // header has to state both.
  const root = new Uint8Array([1, ...varint(tileId), 1, ...varint(TILE_BYTES), 1]);
  const tileAt = ROOT_AT + root.length;
  const bytes = new Uint8Array(tileAt + TILE_BYTES);
  const view = new DataView(bytes.buffer);
  /** The spec stores 64-bit fields little-endian; every value here fits the low word. */
  const u64 = (at: number, value: number) => {
    view.setUint32(at, value, true);
    view.setUint32(at + 4, 0, true);
  };
  /** Coordinates are degrees × 1e7 as signed 32-bit. */
  const deg = (at: number, value: number) => view.setInt32(at, Math.round(value * 1e7), true);

  view.setUint16(0, magic, true);
  view.setUint8(7, 3); // spec version
  u64(8, ROOT_AT);
  u64(16, root.length);
  u64(24, 0); // json metadata offset
  u64(32, 0); // json metadata length
  u64(40, 0); // leaf directory offset
  u64(48, 0); // leaf directory length
  u64(56, tileAt);
  u64(64, TILE_BYTES);
  u64(72, addressedTiles);
  u64(80, 1); // tile entries
  u64(88, 1); // tile contents
  view.setUint8(96, 1); // clustered
  view.setUint8(97, NO_COMPRESSION); // internal compression
  view.setUint8(98, NO_COMPRESSION); // tile compression
  view.setUint8(99, MVT);
  view.setUint8(100, minZoom);
  view.setUint8(101, maxZoom);
  deg(102, bbox[0]);
  deg(106, bbox[1]);
  deg(110, bbox[2]);
  deg(114, bbox[3]);
  view.setUint8(118, maxZoom); // centre zoom
  deg(119, 0);
  deg(123, 0);

  // Entry count, then each field for every entry in its own run. Tile ids are delta-encoded from
  // zero, so the only one here is the id itself; the offset is stored one higher than it is, which
  // is how a zero doubles as "continues the previous entry".
  bytes.set(root, ROOT_AT);
  // Arbitrary content: nothing parses these bytes, the reading only measures how many there are.
  bytes.fill(0x1f, tileAt);
  return bytes;
}

/** Base-128 varint, low group first with the continuation bit set — 4200 needs two bytes. */
function varint(value: number): number[] {
  const digits: number[] = [];
  let left = value;
  while (left > 127) {
    digits.push((left & 127) | 128);
    left >>>= 7;
  }
  digits.push(left);
  return digits;
}

/** Every range the archive was asked for, so a probe that downloads the world is visible. */
let ranges: string[] = [];

function serve(archive: Uint8Array | null) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const range = headers.get('range') ?? '';
    ranges.push(range);
    if (!archive) return Promise.resolve(new Response('', { status: 404 }));
    if (headers.get('Authorization') !== 'Bearer tok-real') {
      // The 401 the owner's phone reported. Asserted rather than assumed: this file reads the
      // archive the way the renderer does, so it must carry what the renderer carries.
      return Promise.resolve(new Response('', { status: 401 }));
    }
    const [start, end] = range.replace('bytes=', '').split('-').map(Number);
    const slice = archive.slice(start, Math.min((end ?? 0) + 1, archive.length));
    return Promise.resolve(
      new Response(slice, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${start + slice.length - 1}/${archive.length}`,
        },
      }),
    );
  }) as typeof globalThis.fetch;
}

async function reading(archive: Uint8Array | null, at: { zoom: number; lat: number; lng: number }) {
  vi.resetModules();
  serve(archive);
  const { archiveReading, ensurePmtilesArchives } = await import('./pmtiles');
  await ensurePmtilesArchives([URL_WORLD]);
  return archiveReading(URL_WORLD, at);
}

/** Bangkok — the reported trip, and the north-east z1 quadrant. */
const BANGKOK = { zoom: 14, lat: 13.75, lng: 100.5 };
/** Santiago — the south-west quadrant, so the same archive misses it. */
const SANTIAGO = { zoom: 14, lat: -33.9, lng: -70.7 };

const originalFetch = globalThis.fetch;

beforeEach(() => {
  ranges = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('archiveReading, against a real PMTiles archive', () => {
  it('reads the header and the tile the camera sits over', async () => {
    // z14 is past this archive's ceiling, so the renderer overzooms z1 — and z1/1/0 is the entry
    // the directory holds.
    await expect(reading(buildArchive(), BANGKOK)).resolves.toBe('z0-1/1t/1:4.2k');
  });

  it('reports MISS for a point the archive does not cover', async () => {
    await expect(reading(buildArchive(), SANTIAGO)).resolves.toBe('z0-1/1t/1:MISS@none/bbox:in');
  });

  // **The state the whole loop is about.** An archive that answers every range request cleanly and
  // holds nothing where the trip is: no status code can tell it from a good one, and before this
  // field the readout said `206` and nothing more.
  it('reports MISS on an archive that is well-formed and empty of this trip', async () => {
    const empty = buildArchive({ tileId: 1, addressedTiles: 0 });
    await expect(reading(empty, BANGKOK)).resolves.toBe('z0-1/0t/1:MISS@none/bbox:in');
  });

  // **The shape the owner's device most likely has**, verified against the real library rather than
  // reasoned about: an archive whose header claims z0-14 while the tiles stop far shallower. At the
  // camera's zoom it MISSES; walking down finds where the coverage actually ends. That is a
  // different bug from an extract of the wrong ground, and `MISS` alone cannot tell them apart.
  it('walks down to the deepest zoom that does hold the point', async () => {
    const shallow = buildArchive({ maxZoom: 14, tileId: Z1_NORTHEAST });
    await expect(reading(shallow, BANGKOK)).resolves.toBe('z0-14/1t/14:MISS@1:4.2k/bbox:in');
  });

  // **The other half of the fork, and the one that would end the loop outright.** A cut is made from
  // the trip's own places and the camera opens on one of them, so a miss should be impossible. If it
  // happens because the archive's own bounds are somewhere else entirely, this says where — no
  // further round trip, and no guessing about which coordinates the cutter was handed.
  it('says the camera is outside the archive’s own bounds, and where those are', async () => {
    const elsewhere = buildArchive({ maxZoom: 14, bbox: [100.4, 13.6, 100.6, 13.9] });
    await expect(reading(elsewhere, SANTIAGO)).resolves.toBe(
      'z0-14/1t/14:MISS@none/bbox:out@13.75,100.50',
    );
  });

  it('names an inverted bbox, which a cutter can write and a status cannot show', async () => {
    const bad = buildArchive({ bbox: [100, 13, 100, 13] });
    await expect(reading(bad, BANGKOK)).resolves.toBe('z0-1/1t/1:4.2k/bbox:BAD');
  });

  // The trip extract's real shape: cut deeper than the world layer. The clamp must then NOT pull
  // the probe down — a reading taken at z1 would say nothing about the zoom the app opens at.
  it('probes the camera’s own zoom when the archive goes that deep', async () => {
    const deep = buildArchive({ maxZoom: 14, tileId: 1 });
    await expect(reading(deep, { ...BANGKOK, zoom: 14 })).resolves.toBe(
      'z0-14/1t/14:MISS@none/bbox:in',
    );
  });

  it('carries the library’s own words when the bytes are not an archive', async () => {
    const notAnArchive = buildArchive({ magic: 0x2121 });
    await expect(reading(notAnArchive, BANGKOK)).resolves.toBe(
      'err:Wrong magic number for PMTiles archive',
    );
  });

  it('carries the HTTP failure when the archive is not there', async () => {
    await expect(reading(buildArchive(), BANGKOK)).resolves.toContain('z0-1');
    await expect(reading(null, BANGKOK)).resolves.toBe('err:Bad response code: 404');
  });

  // A 42.7 MB archive must not be downloaded to take a reading — the property that makes this
  // probe safe to offer on a phone at all.
  it('reads only ranges, never the whole archive', async () => {
    await reading(buildArchive(), BANGKOK);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((range) => /^bytes=\d+-\d+$/.test(range))).toBe(true);
    const total = ranges
      .map((range) => {
        const [start, end] = range.replace('bytes=', '').split('-').map(Number);
        return (end ?? 0) - (start ?? 0) + 1;
      })
      .reduce((sum, span) => sum + span, 0);
    // The header window plus one tile, and nothing like a full read of a planet-sized file.
    expect(total).toBeLessThan(64 * 1024);
  });
});
