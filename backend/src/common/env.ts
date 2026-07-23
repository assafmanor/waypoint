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
// fall back to local disk (backend/src/documents/storage.ts).
// DOC_LOCAL_STORAGE_DIR overrides where that dev-only fallback writes blobs; unset →
// `<cwd>/storage/documents`. Set it in tests so parallel spec files don't share one dir.
export const DOC_LOCAL_STORAGE_DIR = 'DOC_LOCAL_STORAGE_DIR';
export const S3_ENDPOINT = 'S3_ENDPOINT';
export const S3_BUCKET = 'S3_BUCKET';
export const S3_ACCESS_KEY_ID = 'S3_ACCESS_KEY_ID';
export const S3_SECRET_ACCESS_KEY = 'S3_SECRET_ACCESS_KEY';
export const S3_REGION = 'S3_REGION';

// Document blob read cache (ADR-0055). The cache holds ciphertext only and is never a
// source of truth, so an unset FS dir (memory-only) or a lost dir on redeploy is fine —
// a miss falls through to S3 (backend/src/documents/blob-cache.ts).
export const DOC_CACHE_DIR = 'DOC_CACHE_DIR'; // local-FS tier path; unset → memory-only
export const DOC_CACHE_MAX_BYTES = 'DOC_CACHE_MAX_BYTES'; // in-memory LRU bound (bytes)
export const DOC_CACHE_DISABLED = 'DOC_CACHE_DISABLED'; // kill switch (any truthy value)

/** In-memory LRU bound when `DOC_CACHE_MAX_BYTES` is unset — 64 MB comfortably holds a
 *  handful of passport scans / booking PDFs for a ~5-person trip. */
export const DEFAULT_DOC_CACHE_MAX_BYTES = 64 * 1024 * 1024;

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
