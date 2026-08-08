// Client-side read cache for document blobs (ADR-0055), over the Cache API — kept
// deliberately separate from Dexie / the offline outbox (that store is the upload path's
// turf, ADR-0056). Re-opening a document, even offline, is served from here with no
// network fetch, closing the ADR-0042 offline-read gap that metadata-only caching left.
//
// A blob is immutable by its server fileRef, but the `/content` URL is keyed by docId and
// is reused when a file is replaced. So entries are versioned by the document's
// `updatedAt`: a replace bumps the version, producing a fresh key, and the stale versions
// are evicted when the new one is written.
import { DOC_READ_PHASE, DOC_READ_TIMEOUT_MS } from '../constants';
import { withDeadline } from './deadline';

const CACHE_NAME = 'waypoint-doc-content-v1';

// Absent in non-browser contexts (SSR, unit tests) and in the rare browser without the
// Cache API — every entry point degrades to a plain network fetch.
function cacheStore(): CacheStorage | null {
  return typeof caches !== 'undefined' ? caches : null;
}

async function openCache(): Promise<Cache | null> {
  const store = cacheStore();
  return store ? store.open(CACHE_NAME) : null;
}

/** **Best-effort in time, not only in errors** — the one thing every entry point here
 *  shares, and the reason this module has no bare `try`/`catch` left.
 *
 *  A Cache API call that *throws* was always survivable; one that never *answers* was not,
 *  and it is how a document open used to hang until the app was restarted (field-report
 *  #20): `caches.open()` and `cache.match()` sit ahead of the network, so a jammed storage
 *  handle wedged the first open and the cached one alike, and the handle is per-page, so
 *  reopening the document re-entered the same jam. There is nothing to abort — the promise
 *  stays pending and we stop waiting on it.
 *
 *  The fallback is what "the cache had no answer" means for that entry point, so a new one
 *  is one line here rather than another `try` block. */
function bestEffort<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  return withDeadline(DOC_READ_PHASE.CACHE, DOC_READ_TIMEOUT_MS.CACHE, work).catch(() => fallback);
}

// Cache API keys are absolute request URLs; our URLs may be relative (same-origin prod) or
// absolute (dev API base). Resolve both against the same base so prefix comparison holds.
function resolve(url: string): URL | null {
  try {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost';
    return new URL(url, base);
  } catch {
    return null;
  }
}

/** Same document (path), regardless of the `?v=` version query. */
function samePath(a: string, b: string): boolean {
  const ua = resolve(a);
  const ub = resolve(b);
  return ua != null && ub != null && ua.pathname === ub.pathname;
}

/** Read a previously cached blob, or null on a miss / a failure / silence past the bound. */
export function readCachedBlob(url: string): Promise<Blob | null> {
  return bestEffort(async () => {
    const cache = await openCache();
    const hit = await cache?.match(url);
    return hit ? await hit.blob() : null;
  }, null);
}

/** Store a blob under its versioned URL, evicting any older version of the same document
 *  (a replace mints a new version, so its predecessors are now dead). A quota or write
 *  failure must never break the read it was caching. */
export function writeCachedBlob(url: string, blob: Blob, baseUrl?: string): Promise<void> {
  return bestEffort(async () => {
    const cache = await openCache();
    if (!cache) return;
    if (baseUrl) await evictOtherVersions(cache, baseUrl, url);
    await cache.put(url, new Response(blob));
  }, undefined);
}

async function evictOtherVersions(cache: Cache, baseUrl: string, keep: string): Promise<void> {
  const keepResolved = resolve(keep)?.href;
  const stale = (await cache.keys()).filter(
    (req) => samePath(req.url, baseUrl) && req.url !== keepResolved,
  );
  await Promise.all(stale.map((req) => cache.delete(req)));
}

/** Drop the entire document-blob store (on sign-out / session loss), so decrypted
 *  passports and insurance can't be read under the next session on the device.
 *  No-op when the Cache API is unavailable; best-effort. */
export function clearAllCachedDocuments(): Promise<void> {
  return bestEffort(async () => {
    await cacheStore()?.delete(CACHE_NAME);
  }, undefined);
}

/** Evict every cached version of a document (on delete/replace). `contentUrl` is the
 *  version-less `/content` URL; all `?v=` variants under it are removed. */
export function evictCachedDocument(contentUrl: string): Promise<void> {
  return bestEffort(async () => {
    const cache = await openCache();
    if (!cache) return;
    const dead = (await cache.keys()).filter((req) => samePath(req.url, contentUrl));
    await Promise.all(dead.map((req) => cache.delete(req)));
  }, undefined);
}
