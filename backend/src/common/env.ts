// Env var *names* used by more than one call site, defined once so a typo or a
// bracket-vs-dot slip can't silently read the wrong (undefined) property.
export const JWT_SECRET = 'JWT_SECRET';
export const TOKEN_ENCRYPTION_KEY = 'TOKEN_ENCRYPTION_KEY';
export const GOOGLE_CLIENT_ID = 'GOOGLE_CLIENT_ID';
export const GOOGLE_CLIENT_SECRET = 'GOOGLE_CLIENT_SECRET';
export const GOOGLE_OAUTH_REDIRECT_URI = 'GOOGLE_OAUTH_REDIRECT_URI';
export const FRONTEND_URL = 'FRONTEND_URL';
export const DEV_AUTH = 'DEV_AUTH';
export const DOC_ENCRYPTION_KEY = 'DOC_ENCRYPTION_KEY';

// Google Maps Platform server key (ADR-0108 §1): Places API (New) + (later) Routes,
// held only by the backend proxy, never sent to the browser. Read via requireEnv at
// call time so a dev/test box without the key still boots (the picker routes 500 if hit).
export const GOOGLE_MAPS_SERVER_KEY = 'GOOGLE_MAPS_SERVER_KEY';

// Per-member·trip rate limits on the paid Places proxy routes (ADR-0108 §5). The
// mechanism + the per-member·trip keying are the decision; these integers are a
// starting point, env-tunable without a deploy. Two windows per route: a per-minute
// burst cap and a per-day drip cap.
export const PLACES_SEARCH_LIMIT_PER_MIN = 'PLACES_SEARCH_LIMIT_PER_MIN';
export const PLACES_SEARCH_LIMIT_PER_DAY = 'PLACES_SEARCH_LIMIT_PER_DAY';
export const PLACES_RESOLVE_LIMIT_PER_MIN = 'PLACES_RESOLVE_LIMIT_PER_MIN';
export const PLACES_RESOLVE_LIMIT_PER_DAY = 'PLACES_RESOLVE_LIMIT_PER_DAY';

/** Defaults for the proxy throttle windows (ADR-0108 §5 table). Search is the free-
 *  but-scrapeable surface (loose); resolve spends a paid Place Details call (tight). */
export const DEFAULT_PLACES_SEARCH_LIMIT_PER_MIN = 120;
export const DEFAULT_PLACES_SEARCH_LIMIT_PER_DAY = 2000;
export const DEFAULT_PLACES_RESOLVE_LIMIT_PER_MIN = 30;
export const DEFAULT_PLACES_RESOLVE_LIMIT_PER_DAY = 500;

// Railway Storage Bucket (S3-compatible, ADR-0031). S3_BUCKET unset → documents
// fall back to local disk (backend/src/common/storage.ts).
// DOC_LOCAL_STORAGE_DIR overrides where that dev-only fallback writes blobs; unset →
// `<cwd>/storage/documents`. Set it in tests so parallel spec files don't share one dir.
export const DOC_LOCAL_STORAGE_DIR = 'DOC_LOCAL_STORAGE_DIR';
export const S3_ENDPOINT = 'S3_ENDPOINT';
export const S3_BUCKET = 'S3_BUCKET';
export const S3_ACCESS_KEY_ID = 'S3_ACCESS_KEY_ID';
export const S3_SECRET_ACCESS_KEY = 'S3_SECRET_ACCESS_KEY';
export const S3_REGION = 'S3_REGION';

/** The upstream planet archive an offline extract is cut from (ADR-0186 §3). Env-named
 *  rather than hard-coded because Protomaps state their build URLs may change and ask
 *  that people mirror rather than hotlink — this is the seam that makes moving to our
 *  own mirror a config change instead of a deploy. */
export const MAP_TILES_SOURCE_URL = 'MAP_TILES_SOURCE_URL';
/** Path to the `go-pmtiles` binary; the Dockerfile puts it on `PATH`, so this exists for
 *  a dev machine that keeps it somewhere else. */
export const PMTILES_BIN = 'PMTILES_BIN';
/** In-memory bound for the live planet proxy's range cache (ADR-0187 §1). Its hot entries are
 *  the archive's own directory pages — the same bytes for every user, every tile, forever — so
 *  a modest bound buys most of the win. */
export const MAP_PLANET_CACHE_MAX_BYTES = 'MAP_PLANET_CACHE_MAX_BYTES';
/** Optional persistent tier. Railway points this at the service volume; unset keeps the cache
 * memory-only for local development. */
export const MAP_PLANET_CACHE_DIR = 'MAP_PLANET_CACHE_DIR';
export const DEFAULT_MAP_PLANET_CACHE_MAX_BYTES = 128 * 1024 * 1024;

// Document blob read cache (ADR-0055). The cache holds ciphertext only and is never a
// source of truth, so an unset FS dir (memory-only) or a lost dir on redeploy is fine —
// a miss falls through to S3 (backend/src/common/blob-cache.ts).
export const DOC_CACHE_DIR = 'DOC_CACHE_DIR'; // local-FS tier path; unset → memory-only
export const DOC_CACHE_MAX_BYTES = 'DOC_CACHE_MAX_BYTES'; // in-memory LRU bound (bytes)
export const DOC_CACHE_DISABLED = 'DOC_CACHE_DISABLED'; // kill switch (any truthy value)

/** In-memory LRU bound when `DOC_CACHE_MAX_BYTES` is unset — 64 MB comfortably holds a
 *  handful of passport scans / booking PDFs for a ~5-person trip. */
export const DEFAULT_DOC_CACHE_MAX_BYTES = 64 * 1024 * 1024;

// Outbound enrichment fetches (ADR-0166 §7). A server that retrieves a URL which arrived
// in a third-party API response is an SSRF seat, so the fetcher is host-allowlisted,
// timeboxed and size-capped — these two tune the last two without a deploy. The allowlist
// itself is code, not env: it is a fixed, known set of sources, and a host you can add by
// setting a variable is not much of an allowlist.
export const ENRICHMENT_FETCH_TIMEOUT_MS = 'ENRICHMENT_FETCH_TIMEOUT_MS';
export const ENRICHMENT_JSON_MAX_BYTES = 'ENRICHMENT_JSON_MAX_BYTES';

/** **Kill switch for outbound enrichment** (any truthy value stops every pass).
 *
 *  Same shape as `DOC_CACHE_DISABLED`: env-gated, read per call so it can be flipped without
 *  a code change and stubbed in a test. Enrichment is the one thing in this app that talks to
 *  third parties on its own initiative, so it gets the one switch that stops it doing that —
 *  without taking down the reads, which serve already-stored data and are unaffected. */
export const ENRICHMENT_DISABLED = 'ENRICHMENT_DISABLED';

/** The FX feed's kill switch (ADR-0180 §7), and the second variable of its kind for
 *  the same reason the first exists: this is now the second thing in the app that
 *  talks to a third party on its own initiative, and it gets the one switch that
 *  stops it doing so. Reads are unaffected — they serve the stored row, so flipping
 *  this freezes the rate rather than removing the card. */
export const FX_DISABLED = 'FX_DISABLED';

/** Per-request timeout for a rate fetch. Shorter than enrichment's, because this is
 *  one small JSON document from one host rather than a cold entity read, and nothing
 *  user-facing waits on it either way. */
export const FX_FETCH_TIMEOUT_MS = 5000;

/** Per-request timeout for an enrichment fetch. Generous enough for a cold Wikidata
 *  entity read, short enough that a slow source degrades one field rather than holding up
 *  a pass (§5.4) — nothing user-facing is waiting on it either way (§6). */
export const DEFAULT_ENRICHMENT_FETCH_TIMEOUT_MS = 8000;

/** Ceiling on a JSON response body. A `wbgetentities` reply for one item with all its
 *  claims is tens of KB; 2 MB is well clear of that and still bounds a hostile or broken
 *  upstream, since the whole body is buffered to parse it. Image bytes pass their own,
 *  larger cap explicitly (Phase 2). */
export const DEFAULT_ENRICHMENT_JSON_MAX_BYTES = 2 * 1024 * 1024;

/** Dev-only default for `FRONTEND_URL` (single-origin in prod, ADR-0020, so this
 *  fallback never applies there). */
export const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

/** Throws with the var's own name if unset — pass one of the constants above. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

/** A positive-integer env var with a fallback (used for the tunable throttle
 *  limits). A missing or non-numeric/non-positive value falls back rather than
 *  silently disabling a rate limit. */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** The `DEV_AUTH` un-tokened-request bypass, gated so it can never be live in
 *  production (defense-in-depth behind the boot-time refusal in validateConfig,
 *  backend-review B-04). */
export function isDevAuthEnabled(): boolean {
  return process.env[DEV_AUTH] === '1' && process.env.NODE_ENV !== 'production';
}
