// **The live detail read** (ADR-0187 §1) — a byte-range passthrough to the upstream planet
// archive, cached.
//
// This is deliberately NOT a tile server. The `pmtiles` protocol on the client already walks the
// archive's directories and works out which bytes it wants, so the whole job here is to answer a
// `Range` with those bytes: same renderer, same style, same protocol as the offline read, which
// is ADR-0186 §3's actual principle rather than an exception to it.
//
// **It also narrows §3's "there is no range-proxy" instead of overturning it.** That argument was
// about proxying every tile forever as the PRIMARY mechanism, when the alternative was mirroring
// 128 GB; it is still right about the offline artefact and about the trip's own city, both of
// which are still cut once and served from our own storage. What it was never asked about is
// ground nobody has committed to — the place someone is researching — and that is all this serves.
//
// The cache is what keeps the hotlinking courtesy defensible, and it is not incidental: without it
// every tile a person pans over is a request to somebody else's bucket. Its hot entries are the
// archive's own header and directory pages, which are **the same bytes for every user, every tile,
// forever** — so the bound below buys far more than its size suggests.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createByteLru } from '../common/byte-lru';
import {
  DEFAULT_MAP_PLANET_CACHE_MAX_BYTES,
  MAP_PLANET_CACHE_DIR,
  MAP_PLANET_CACHE_MAX_BYTES,
  MAP_TILES_SOURCE_URL,
} from '../common/env';
import { DEFAULT_TILES_SOURCE } from './pmtiles-extract';
import type { ByteRange } from './range';

const PLANET_RANGE_TIMEOUT_MS = 15_000;

function maxBytes(): number {
  const raw = process.env[MAP_PLANET_CACHE_MAX_BYTES];
  const parsed = raw ? Number(raw) : DEFAULT_MAP_PLANET_CACHE_MAX_BYTES;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAP_PLANET_CACHE_MAX_BYTES;
}

// Keyed by the exact range asked for, which is enough BECAUSE the client is deterministic: the
// same tile at the same zoom resolves to the same byte range for everyone, so two users looking
// at the same street share entries. A block cache would hit more often and is not worth the
// arithmetic until something says otherwise.
const ranges = createByteLru(maxBytes);
const inFlight = new Map<string, Promise<PlanetRange>>();

const TOTAL_BYTES_PREFIX = 8;

function cacheKey(range: ByteRange): string {
  return `${planetBuildId()}-${range.start}-${range.end}.range`;
}

function cachePath(range: ByteRange): string | null {
  const dir = process.env[MAP_PLANET_CACHE_DIR];
  return dir ? join(dir, cacheKey(range)) : null;
}

function encodeCacheEntry(body: Buffer, total: number): Buffer {
  const entry = Buffer.allocUnsafe(TOTAL_BYTES_PREFIX + body.length);
  entry.writeBigUInt64BE(BigInt(total));
  body.copy(entry, TOTAL_BYTES_PREFIX);
  return entry;
}

function decodeCacheEntry(entry: Buffer): PlanetRange | null {
  if (entry.length <= TOTAL_BYTES_PREFIX) return null;
  const total = Number(entry.readBigUInt64BE());
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  return { body: entry.subarray(TOTAL_BYTES_PREFIX), total };
}

async function cachedRange(range: ByteRange): Promise<PlanetRange | null> {
  const key = cacheKey(range);
  const hot = ranges.get(key);
  if (hot) return decodeCacheEntry(hot);
  const path = cachePath(range);
  if (!path) return null;
  try {
    const warm = await readFile(path);
    const decoded = decodeCacheEntry(warm);
    if (!decoded) return null;
    ranges.put(key, warm);
    return decoded;
  } catch {
    return null;
  }
}

async function cacheRange(range: ByteRange, body: Buffer, total: number): Promise<void> {
  const entry = encodeCacheEntry(body, total);
  ranges.put(cacheKey(range), entry);
  const path = cachePath(range);
  if (!path) return;
  try {
    await mkdir(process.env[MAP_PLANET_CACHE_DIR]!, { recursive: true });
    await writeFile(path, entry);
  } catch {
    // Best effort: a cache write must never fail a valid upstream read.
  }
}

export function planetSourceUrl(): string {
  return process.env[MAP_TILES_SOURCE_URL] || DEFAULT_TILES_SOURCE;
}

/**
 * **Which build this server will serve, taken from the URL it actually reads.**
 *
 * Derived rather than configured separately, so the route's name and the bytes behind it cannot
 * drift: if `MAP_TILES_SOURCE_URL` is pointed at a new daily build, the build id in the path
 * changes with it and every client cache is busted by the URL changing (ADR-0187 §1). A client
 * built against the previous one then gets a 404 rather than directory pages that no longer
 * describe the archive, which is the failure this whole scheme exists to make loud.
 */
export function planetBuildId(): string {
  const name = planetSourceUrl().split('/').pop() ?? '';
  return name.replace(/\.pmtiles$/, '');
}

export interface PlanetRange {
  body: Buffer;
  /** The archive's full length, for the `Content-Range` we answer with. */
  total: number;
}

/**
 * Read one byte range of the planet, from cache or upstream.
 *
 * Throws when upstream refuses. The caller turns that into a status the renderer can report —
 * silence is the one thing this workstream has repeatedly proved is worse than an error.
 */
async function fetchPlanetRange(range: ByteRange): Promise<PlanetRange> {
  const res = await fetch(planetSourceUrl(), {
    headers: { Range: `bytes=${range.start}-${range.end}` },
    signal: AbortSignal.timeout(PLANET_RANGE_TIMEOUT_MS),
  });
  // A 200 means the server ignored the Range and is sending the whole 128 GiB. Refused rather
  // than streamed: it is never what a tile read wanted, and reading it would exhaust this
  // process long before it finished.
  if (res.status !== 206) {
    throw new Error(`upstream answered ${res.status} to a range request`);
  }
  // `bytes <start>-<end>/<total>` — the only place the archive's length is stated, and free.
  const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
  const returnedStart = Number(contentRange?.[1]);
  const returnedEnd = Number(contentRange?.[2]);
  const total = Number(contentRange?.[3]);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('upstream range response carried no usable Content-Range');
  }
  if (returnedStart !== range.start || returnedEnd !== range.end) {
    throw new Error(
      `upstream returned bytes ${returnedStart}-${returnedEnd} for requested bytes ${range.start}-${range.end}`,
    );
  }

  const body = Buffer.from(await res.arrayBuffer());
  const expectedLength = range.end - range.start + 1;
  if (body.length !== expectedLength) {
    throw new Error(`upstream returned ${body.length} bytes for requested ${expectedLength}`);
  }
  await cacheRange(range, body, total);
  return { body, total };
}

export async function readPlanetRange(range: ByteRange): Promise<PlanetRange> {
  const hit = await cachedRange(range);
  if (hit) return hit;

  const key = cacheKey(range);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const reading = fetchPlanetRange(range);
  inFlight.set(key, reading);
  try {
    return await reading;
  } finally {
    if (inFlight.get(key) === reading) inFlight.delete(key);
  }
}

/** Test-only: the module singletons must not leak between tests. */
export function resetPlanetCacheForTests(): void {
  ranges.clear();
  inFlight.clear();
}
