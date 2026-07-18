// Client-side read cache for document blobs (ADR-0055), over the Cache API — kept
// deliberately separate from Dexie / the offline outbox (that store is the upload path's
// turf, ADR-0056). Re-opening a document, even offline, is served from here with no
// network fetch, closing the ADR-0042 offline-read gap that metadata-only caching left.
//
// A blob is immutable by its server fileRef, but the `/content` URL is keyed by docId and
// is reused when a file is replaced. So entries are versioned by the document's
// `updatedAt`: a replace bumps the version, producing a fresh key, and the stale versions
// are evicted when the new one is written.

const CACHE_NAME = 'waypoint-doc-content-v1';

// Absent in non-browser contexts (SSR, unit tests) and in the rare browser without the
// Cache API — every entry point degrades to a plain network fetch.
function cacheStore(): CacheStorage | null {
  return typeof caches !== 'undefined' ? caches : null;
}

async function openCache(): Promise<Cache | null> {
  const store = cacheStore();
  if (!store) return null;
  try {
    return await store.open(CACHE_NAME);
  } catch {
    return null;
  }
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

/** Read a previously cached blob, or null on a miss / when the Cache API is unavailable. */
export async function readCachedBlob(url: string): Promise<Blob | null> {
  const cache = await openCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(url);
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

/** Store a blob under its versioned URL, evicting any older version of the same document
 *  (a replace mints a new version, so its predecessors are now dead). */
export async function writeCachedBlob(url: string, blob: Blob, baseUrl?: string): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    if (baseUrl) await evictOtherVersions(cache, baseUrl, url);
    await cache.put(url, new Response(blob));
  } catch {
    // Best-effort: a quota or write failure must never break the read it was caching.
  }
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
export async function clearAllCachedDocuments(): Promise<void> {
  const store = cacheStore();
  if (!store) return;
  try {
    await store.delete(CACHE_NAME);
  } catch {
    // best-effort
  }
}

/** Evict every cached version of a document (on delete/replace). `contentUrl` is the
 *  version-less `/content` URL; all `?v=` variants under it are removed. */
export async function evictCachedDocument(contentUrl: string): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    const dead = (await cache.keys()).filter((req) => samePath(req.url, contentUrl));
    await Promise.all(dead.map((req) => cache.delete(req)));
  } catch {
    // best-effort
  }
}
