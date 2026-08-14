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
import { loadMapLibre } from './maplibre';

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
const sources = new Map<string, import('pmtiles').FetchSource>();

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
    const known = sources.get(url);
    if (known) {
      known.setHeaders(headers);
      continue;
    }
    // `credentials: 'include'` alongside the header, because the refresh cookie is same-site and
    // a cross-origin API base would otherwise strip it — belt and braces, and free.
    const source = new FetchSource(url, headers, 'include');
    sources.set(url, source);
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
 *     would fetch it. `MISS` means the archive does not cover where the trip is, and that is a
 *     cutting-bounds bug rather than anything in the client.
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
    const { x, y } = tileAt(z, at.lat, at.lng);
    const tile = await archive.getZxy(z, x, y);
    const bytes = tile ? `${Math.round(tile.data.byteLength / 100) / 10}k` : 'MISS';
    // The bbox is reported only when it is unusable. It stopped being load-bearing when the style
    // began stating its own tile template (amendment 269f) — pmtiles only `console.error`s an
    // invalid one — but an archive whose bounds are inverted is still an archive that was cut
    // wrong, and this is the one place that would say so.
    const bbox =
      header.minLon >= header.maxLon || header.minLat >= header.maxLat ? '/bbox:BAD' : '';
    return `z${header.minZoom}-${header.maxZoom}/${header.numAddressedTiles}t/${z}:${bytes}${bbox}`;
  } catch (error) {
    // Named, not swallowed: `Wrong magic number for PMTiles archive` (the stored blob is not an
    // archive) and `Bad response code: 503` (still building) are different bugs, and this is the
    // only field that would tell them apart.
    return `err:${error instanceof Error ? error.message.slice(0, 48) : 'unknown'}`;
  }
}
