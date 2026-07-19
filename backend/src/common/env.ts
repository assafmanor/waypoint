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

// Railway Storage Bucket (S3-compatible, ADR-0031). S3_BUCKET unset → documents
// fall back to local disk (backend/src/documents/storage.ts).
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

/** The `DEV_AUTH` un-tokened-request bypass, gated so it can never be live in
 *  production (defense-in-depth behind the boot-time refusal in validateConfig,
 *  backend-review B-04). */
export function isDevAuthEnabled(): boolean {
  return process.env[DEV_AUTH] === '1' && process.env.NODE_ENV !== 'production';
}
