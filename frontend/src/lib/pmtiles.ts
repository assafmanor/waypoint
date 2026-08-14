// **The archive reads, authenticated** (ADR-0186 §3, corrected 2026-08-14).
//
// The `pmtiles://` protocol turns one style URL into a stream of HTTP **range** requests, and it
// issues them itself — deep inside MapLibre, on a worker thread. So they do not go through
// `lib/api.ts`'s `apiFetch`, they carry none of its headers, and against ADR-0020's global
// `JwtAuthGuard` ("every route needs a Bearer access JWT unless marked `@Public()`") every single
// one came back **401**. Read from the owner's phone:
//
//     gl:ok canvas:ok pane:411x596 painted:n tiles:0 … err:Error: Bad response code: 401
//
// That is the whole bug, and it was invisible to every test in the repo because e2e has no backend
// and no guard, so an unauthenticated tile read looks identical to an authenticated one there.
//
// **`FetchSource` is the sanctioned seam**, and pmtiles' own docs say so in as many words: _"This
// should be used instead of maplibre's `transformRequest` for PMTiles archives."_ It owns a mutable
// `Headers`, which is what makes a rotating token survivable — the archive object is registered
// once and its headers are re-set on every map build.
//
// **Why not make the routes public instead.** For the world layer that would arguably be right —
// `MapController` calls it _"the same public OSM ground for everyone"_ — but the trip extract must
// stay guarded whatever happens: the areas it covers say where the group is going, which is
// exactly the kind of thing ADR-0039 removes a member's access to. Making a route public is a
// security decision, so it is raised rather than taken here; authenticating the read fixes both
// archives and widens nothing.
import { accessTokenForHeader } from './api';
import { readLocalMapArchive } from './map-archive-cache';
import { loadMapLibre } from './maplibre';
import type { RangeResponse, Source } from 'pmtiles';

/** A camera, as numbers rather than as the readout's formatted string. */
export interface ArchiveProbePoint {
  zoom: number;
  lat: number;
  lng: number;
}

/** The protocol handler, registered once per page — see `MapCanvas` on why a URL-scheme handler is
 *  not the kind of page-global this migration exists to escape (it holds no status). */
let registry: import('pmtiles').Protocol | null = null;
/** One `FetchSource` per archive URL, kept so its headers can be refreshed rather than the archive
 *  re-registered — re-adding would drop the header/directory caches that make range reads cheap. */
type ArchiveSource =
  | { kind: 'remote'; source: import('pmtiles').FetchSource }
  | { kind: 'local'; source: Source; downloadedAt: number };

const sources = new Map<string, ArchiveSource>();

class BlobSource implements Source {
  constructor(
    private readonly key: string,
    private readonly blob: Blob,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await this.blob.slice(offset, offset + length).arrayBuffer() };
  }
}

/** The Bearer header, or none. Built fresh each time: the token rotates. */
function authHeaders(): Headers {
  const headers = new Headers();
  const token = accessTokenForHeader();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

/**
 * Make sure the `pmtiles://` protocol is registered and every archive in `urls` is known to it,
 * with current credentials.
 *
 * Idempotent and safe to call per map build. Guarded so a remount does not stack handlers, and
 * never torn down: a second pane mounting while the first unmounts would otherwise pull the
 * protocol out from under it.
 */
export async function ensurePmtilesArchives(urls: readonly string[]): Promise<void> {
  const [{ addProtocol }, { FetchSource, PMTiles, Protocol }] = await Promise.all([
    loadMapLibre(),
    import('pmtiles'),
  ]);
  if (!registry) {
    registry = new Protocol();
    addProtocol('pmtiles', registry.tile);
  }
  const headers = authHeaders();
  for (const url of urls) {
    const local = await readLocalMapArchive(url).catch(() => null);
    const known = sources.get(url);
    if (local && known?.kind === 'local' && known.downloadedAt === local.meta.downloadedAt) {
      continue;
    }
    if (!local && known?.kind === 'remote') {
      known.source.setHeaders(headers);
      continue;
    }
    if (local) {
      const source = new BlobSource(url, local.blob);
      sources.set(url, { kind: 'local', source, downloadedAt: local.meta.downloadedAt });
      registry.add(new PMTiles(source));
      continue;
    }
    // `credentials: 'include'` alongside the header, because the refresh cookie is same-site and
    // a cross-origin API base would otherwise strip it — belt and braces, and free.
    const source = new FetchSource(url, headers, 'include');
    sources.set(url, { kind: 'remote', source });
    registry.add(new PMTiles(source));
  }
}

/** Slippy tile containing a point, clamped into the grid — z/x/y is how a tile is addressed
 *  inside an archive, and the only reason this math is here is that nothing else in the app
 *  needed it (the renderer does it internally, on a worker thread we cannot ask). */
function tileAt(z: number, lat: number, lng: number): { x: number; y: number } {
  const side = 2 ** z;
  const clamp = (v: number) => Math.min(side - 1, Math.max(0, Math.floor(v)));
  const rad = (lat * Math.PI) / 180;
  return {
    x: clamp(((lng + 180) / 360) * side),
    y: clamp(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * side),
  };
}

/**
 * **Where the archive says it covers, relative to where we are looking** — free, because the header
 * is already read, and decisive in the one case a `MISS` leaves ambiguous.
 *
 * A cut is made from the trip's own places plus a pad, and the camera opens on one of those places,
 * so a miss at the camera should be impossible. When it happens anyway, this is what splits it:
 *
 *   - `bbox:out@13.75,100.50` — the archive's own bounds do not contain the camera. It was cut from
 *     the wrong coordinates, and the centre it names is where it went instead.
 *   - `bbox:in`               — the archive claims this ground and does not hold the tile, so the
 *     fault is in what was written inside a correct region.
 *
 * Reported only on a miss (a hit needs no explanation), except `BAD`, which is worth saying always:
 * inverted bounds mean the cut itself was malformed, whoever asks.
 */
function coverage(
  header: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  at: ArchiveProbePoint,
  hit: boolean,
): string {
  const { minLon, minLat, maxLon, maxLat } = header;
  if (minLon >= maxLon || minLat >= maxLat) return '/bbox:BAD';
  if (hit) return '';
  const inside = at.lng >= minLon && at.lng <= maxLon && at.lat >= minLat && at.lat <= maxLat;
  if (inside) return '/bbox:in';
  const centre = `${((minLat + maxLat) / 2).toFixed(2)},${((minLon + maxLon) / 2).toFixed(2)}`;
  return `/bbox:out@${centre}`;
}

/**
 * **What the archive itself says it holds, and whether it holds the tile under the camera.**
 *
 * The fact five rounds of diagnosis on 2026-08-14 never read. Each round measured the archive from
 * the outside — first that a request settled (`tile:101ms`), then that it settled with a 206 — and
 * both readings were `206/105ms` beside `tiles:0 err:none`, which is to say: the bytes arrive and
 * nothing draws. Nothing on the page could answer the next question, so it had to be asked of the
 * owner's phone twice.
 *
 * These three answer it outright:
 *
 *   - **`z0-6`** — the header's own zoom range. **No test in this repo has ever read an archive our
 *     `pmtiles extract` produced** (no `pmtiles` binary in the sandbox, no Docker daemon to build
 *     the image that has one), so what the cutter writes here is inferred, not known. If it is not
 *     what `map-style.ts` declares, that mismatch is the bug on its own.
 *   - **`8221t`** — addressed tiles. `0t` is an archive that was cut and is empty, which no HTTP
 *     status can distinguish from a good one.
 *   - **`6:4.2k`** — the tile the renderer would ask for at this camera, fetched the same way it
 *     would fetch it, and on a `MISS` the deepest zoom over the same point that DOES hold bytes.
 *
 * **Why the walk down exists, and it is the whole of the 2026-08-14 evening.** The reading
 * `extract:206/411ms[z0-14/127t/14:MISS]` says the trip's archive was cut, is well-formed, serves
 * clean 206s, and has nothing at the camera — and two completely different bugs produce that:
 *
 *   - `14:MISS@none`     — no zoom over this point holds anything: the extract covers **other
 *                          ground**, so the region handed to `pmtiles extract` is wrong.
 *   - `14:MISS@10:3.1k`  — this ground is in the archive but only to z10: the header's `maxZoom`
 *                          **overstates** what was cut, so the style asks for a level that is not
 *                          there. A different fix, in a different file.
 *
 * Guessing between those two is what has cost this workstream six sessions, so the readout answers
 * it instead. The walk stops at the first hit, which is one extra range read in the healthy case.
 *
 * Read through the **registered** archive, deliberately: it shares the header and directory caches
 * the renderer is using, so this reports on the map on screen rather than on a fresh read that
 * might succeed where the renderer's failed (ADR-0146 §5's mistake, in a new place).
 */
export async function archiveReading(url: string, at: ArchiveProbePoint | null): Promise<string> {
  const archive = registry?.get(url);
  if (!archive) return 'unregistered';
  if (!at) return 'nocam';
  try {
    const header = await archive.getHeader();
    const z = Math.min(Math.max(Math.floor(at.zoom), header.minZoom), header.maxZoom);
    /** The bytes this archive holds over the point at one zoom, or null for a miss. */
    const bytesAt = async (zoom: number): Promise<string | null> => {
      const { x, y } = tileAt(zoom, at.lat, at.lng);
      const tile = await archive.getZxy(zoom, x, y);
      return tile ? `${Math.round(tile.data.byteLength / 100) / 10}k` : null;
    };
    /** Walked only after a miss, and only down to the archive's own floor: below `minZoom`
     *  pmtiles refuses the lookup, so a miss there would say nothing about coverage. */
    const deepestBelow = async (from: number): Promise<string> => {
      for (let zoom = from - 1; zoom >= header.minZoom; zoom--) {
        const found = await bytesAt(zoom);
        if (found) return `@${zoom}:${found}`;
      }
      return '@none';
    };
    const held = await bytesAt(z);
    const bytes = held ?? `MISS${await deepestBelow(z)}`;
    return `z${header.minZoom}-${header.maxZoom}/${header.numAddressedTiles}t/${z}:${bytes}${coverage(header, at, held != null)}`;
  } catch (error) {
    // Named, not swallowed: `Wrong magic number for PMTiles archive` (the stored blob is not an
    // archive) and `Bad response code: 503` (still building) are different bugs, and this is the
    // only field that would tell them apart.
    return `err:${error instanceof Error ? error.message.slice(0, 48) : 'unknown'}`;
  }
}
