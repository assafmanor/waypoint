// A byte-bounded LRU of buffers, extracted from `blob-cache.ts`'s in-memory tier when the map's
// planet proxy needed the same thing (ADR-0187 §1) — rule 8's "generalize the one-off rather than
// add a second one beside it". The two callers differ in everything else (`blob-cache` has a
// filesystem tier, a kill switch and a path-safety rule that only make sense for documents), so
// what is shared is exactly this: a Map in insertion order, a byte counter, and evict-oldest.
//
// A `Map` keeps insertion order, so the first key is the least-recently-used; a read re-inserts
// its key to mark it most-recently-used.

export interface ByteLru {
  get(key: string): Buffer | null;
  put(key: string, value: Buffer): void;
  drop(key: string): void;
  clear(): void;
  readonly bytes: number;
}

/** `maxBytes` is a function rather than a number because both callers read their bound from the
 *  environment per call, so a test can stub it after the cache exists. */
export function createByteLru(maxBytes: () => number): ByteLru {
  const entries = new Map<string, Buffer>();
  let bytes = 0;

  const drop = (key: string): void => {
    const existing = entries.get(key);
    if (!existing) return;
    entries.delete(key);
    bytes -= existing.length;
  };

  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return null;
      entries.delete(key);
      entries.set(key, hit); // move to most-recently-used
      return hit;
    },
    put(key, value) {
      drop(key);
      // One value larger than the whole bound would evict everything and still overflow, so it is
      // never worth holding — the caller's slower tier (or upstream) still has it.
      if (value.length > maxBytes()) return;
      entries.set(key, value);
      bytes += value.length;
      while (bytes > maxBytes()) {
        const oldest = entries.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        drop(oldest);
      }
    },
    drop,
    clear() {
      entries.clear();
      bytes = 0;
    },
    get bytes() {
      return bytes;
    },
  };
}
