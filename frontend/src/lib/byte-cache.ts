// A Cache-API byte store with tiny enumerable metadata and byte-budget LRU eviction.
// Map archives are its first consumer (ADR-0186 §6); document blobs can adopt the same shape
// later without being migrated in this change.
import { getNow } from './useClock';

export interface ByteCacheMeta {
  key: string;
  sizeBytes: number;
  lastUsedAt: number;
}

export interface ByteCacheHit<T extends ByteCacheMeta> {
  blob: Blob;
  meta: T;
}

function store(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

function origin(): string {
  return typeof location === 'undefined' ? 'http://localhost' : location.origin;
}

function validMeta(value: unknown): value is ByteCacheMeta {
  if (!value || typeof value !== 'object') return false;
  const meta = value as Partial<ByteCacheMeta>;
  return (
    typeof meta.key === 'string' &&
    Number.isFinite(meta.sizeBytes) &&
    meta.sizeBytes! >= 0 &&
    Number.isFinite(meta.lastUsedAt)
  );
}

export function createByteCache<T extends ByteCacheMeta>(name: string) {
  const metaPrefix = `${origin()}/__waypoint-cache-meta__/${encodeURIComponent(name)}/`;
  const metaKey = (key: string) => `${metaPrefix}${encodeURIComponent(key)}`;
  const open = () => store()?.open(name) ?? Promise.resolve(null);

  const writeMeta = async (cache: Cache, meta: T): Promise<void> => {
    await cache.put(
      metaKey(meta.key),
      new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }),
    );
  };

  const readMeta = async (cache: Cache, key: string): Promise<T | null> => {
    const response = await cache.match(metaKey(key));
    if (!response) return null;
    try {
      const value: unknown = await response.json();
      return validMeta(value) ? (value as T) : null;
    } catch {
      return null;
    }
  };

  const remove = async (key: string): Promise<void> => {
    const cache = await open();
    if (!cache) return;
    await Promise.all([cache.delete(key), cache.delete(metaKey(key))]);
  };

  const entries = async (): Promise<T[]> => {
    const cache = await open();
    if (!cache) return [];
    const keys = await cache.keys();
    const metadata = await Promise.all(
      keys
        .map((request) => request.url)
        .filter((url) => url.startsWith(metaPrefix))
        .map(async (url) => {
          const response = await cache.match(url);
          if (!response) return null;
          try {
            const value: unknown = await response.json();
            return validMeta(value) ? (value as T) : null;
          } catch {
            return null;
          }
        }),
    );
    const found: T[] = [];
    for (const meta of metadata) if (meta != null) found.push(meta as T);
    return found;
  };

  return {
    async read(key: string, now = getNow()): Promise<ByteCacheHit<T> | null> {
      const cache = await open();
      if (!cache) return null;
      const [response, meta] = await Promise.all([cache.match(key), readMeta(cache, key)]);
      if (!response || !meta) return null;
      const touched = { ...meta, lastUsedAt: now };
      await writeMeta(cache, touched);
      return { blob: await response.blob(), meta: touched };
    },

    async put(key: string, response: Response, meta: T): Promise<void> {
      const cache = await open();
      if (!cache) throw new Error('Cache API unavailable');
      await writeMeta(cache, meta);
      try {
        await cache.put(key, response);
      } catch (error) {
        await cache.delete(metaKey(key));
        throw error;
      }
    },

    entries,
    remove,

    async makeRoom(opts: {
      budgetBytes: number;
      incomingBytes: number;
      replacingKey?: string;
      pinned: (entry: T) => boolean;
    }): Promise<boolean> {
      const all = await entries();
      const replacing = all.find((entry) => entry.key === opts.replacingKey)?.sizeBytes ?? 0;
      let used = all.reduce((sum, entry) => sum + entry.sizeBytes, 0) - replacing;
      if (used + opts.incomingBytes <= opts.budgetBytes) return true;
      const candidates = all
        .filter((entry) => entry.key !== opts.replacingKey && !opts.pinned(entry))
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      for (const entry of candidates) {
        await remove(entry.key);
        used -= entry.sizeBytes;
        if (used + opts.incomingBytes <= opts.budgetBytes) return true;
      }
      return false;
    },

    async clear(): Promise<void> {
      await store()?.delete(name);
    },
  };
}
