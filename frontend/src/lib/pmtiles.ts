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
