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
//
// ── WHICH BUILD, AND WHY IT IS RESOLVED HERE RATHER THAN PINNED (2026-08-21) ────────────
//
// **Upstream keeps about a week of dailies, and nobody wrote that down.** ADR-0187 pinned the
// build id in a shared constant so the route's name and the bytes behind it could not drift. The
// half that was missing is that the object the id names is DELETED: measured 2026-08-21,
// `build.protomaps.com` served 0815–0821 and answered 404 for 0814 and everything older. So the
// constant expired seven days after it was typed, this route answered 502 to every range, and the
// map went bare online — no labels, no roads, no borders, with the coarse world layer's fills
// still drawing underneath and nothing on screen able to say why.
//
// So the build id is **resolved from what upstream actually serves** and re-resolved on a TTL.
// The client is told the answer on `/me` rather than compiling one in (see `livePlanetBuild`), and
// this module stays the only place that knows the upstream URL shape.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMapPlanetBuild } from '@waypoint/shared';
import { createByteLru } from '../common/byte-lru';
import {
  DEFAULT_MAP_PLANET_CACHE_MAX_BYTES,
  MAP_PLANET_CACHE_DIR,
  MAP_PLANET_CACHE_MAX_BYTES,
  MAP_TILES_SOURCE_URL,
} from '../common/env';
import type { ByteRange } from './range';

const PLANET_RANGE_TIMEOUT_MS = 15_000;

/** The daily-build channel. **Protomaps say the URLs may change** and ask that people not
 *  hotlink — the long-term answer is our own mirror, and `MAP_TILES_SOURCE_URL` is the seam that
 *  makes swapping to one a config change (it wins over everything below). */
export function protomapsDailyBuildUrl(build: string): string {
  return `https://build.protomaps.com/${build}.pmtiles`;
}

/** How far back to look for a build upstream still holds. Retention measured at **7 dailies**
 *  (2026-08-21); 8 covers the hours before a day's build is published without reaching for one
 *  that has already been collected. */
const BUILD_LOOKBACK_DAYS = 8;
/** How long a resolved build is trusted. Well under retention, so a rotation is picked up long
 *  before the id in flight stops being readable. */
const BUILD_TTL_MS = 6 * 60 * 60 * 1000;
/** A probe is 16 bytes; this bounds the whole resolution, since the candidates go out together. */
const BUILD_PROBE_TIMEOUT_MS = 10_000;
/** The format's own magic, so a probe proves an ARCHIVE rather than merely a 206 — a bucket
 *  serving an error page in a range response would otherwise pass. */
const PMTILES_MAGIC = 'PMTiles';

function maxBytes(): number {
  const raw = process.env[MAP_PLANET_CACHE_MAX_BYTES];
  const parsed = raw ? Number(raw) : DEFAULT_MAP_PLANET_CACHE_MAX_BYTES;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAP_PLANET_CACHE_MAX_BYTES;
}

// Keyed by the exact range asked for **and the build it came out of**: the same tile resolves to
// the same byte range for everyone, so two users looking at one street share entries — but two
// builds are two different archives and one entry must never answer for the other. A block cache
// would hit more often and is not worth the arithmetic until something says otherwise.
const ranges = createByteLru(maxBytes);
const inFlight = new Map<string, Promise<PlanetRange>>();

const TOTAL_BYTES_PREFIX = 8;

function cacheKey(build: string, range: ByteRange): string {
  return `${build}-${range.start}-${range.end}.range`;
}

function cachePath(build: string, range: ByteRange): string | null {
  const dir = process.env[MAP_PLANET_CACHE_DIR];
  return dir ? join(dir, cacheKey(build, range)) : null;
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

async function cachedRange(build: string, range: ByteRange): Promise<PlanetRange | null> {
  const key = cacheKey(build, range);
  const hot = ranges.get(key);
  if (hot) return decodeCacheEntry(hot);
  const path = cachePath(build, range);
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

async function cacheRange(
  build: string,
  range: ByteRange,
  body: Buffer,
  total: number,
): Promise<void> {
  const entry = encodeCacheEntry(body, total);
  ranges.put(cacheKey(build, range), entry);
  const path = cachePath(build, range);
  if (!path) return;
  try {
    await mkdir(process.env[MAP_PLANET_CACHE_DIR]!, { recursive: true });
    await writeFile(path, entry);
  } catch {
    // Best effort: a cache write must never fail a valid upstream read.
  }
}

// ── WHICH BUILD ───────────────────────────────────────────────────────────────────────

/** The operator's own archive, if they named one. It wins over resolution entirely: a mirror is
 *  a deliberate act and may not be a dated protomaps object at all. */
function overrideSourceUrl(): string | undefined {
  return process.env[MAP_TILES_SOURCE_URL] || undefined;
}

/** The build id an URL names, which is its filename without the extension. */
function buildIdOf(url: string): string {
  return (url.split('/').pop() ?? '').replace(/\.pmtiles$/, '');
}

/** The daily ids to try, newest first, in UTC — the timezone upstream names its builds in. */
function candidateBuilds(now = new Date()): string[] {
  const day = 24 * 60 * 60 * 1000;
  return Array.from({ length: BUILD_LOOKBACK_DAYS }, (_, i) =>
    new Date(now.getTime() - i * day).toISOString().slice(0, 10).replace(/-/g, ''),
  );
}

/** **Can this archive actually be range-read right now?** The same contract the read path
 *  demands — a 206 whose bytes are a PMTiles header — so a build that passes here is one whose
 *  tiles will not 404 an hour later. */
async function servesArchive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${PMTILES_MAGIC.length - 1}` },
      signal: AbortSignal.timeout(BUILD_PROBE_TIMEOUT_MS),
    });
    if (res.status !== 206) return false;
    const head = Buffer.from(await res.arrayBuffer());
    return head.subarray(0, PMTILES_MAGIC.length).toString('latin1') === PMTILES_MAGIC;
  } catch {
    return false;
  }
}

let resolved: { build: string; at: number } | null = null;
let resolving: Promise<string | null> | null = null;
/** Probe verdicts, so a stale client's id costs one upstream read per process rather than one per
 *  tile. Bounded by construction: only ids inside the lookback window are ever probed. */
const probed = new Map<string, boolean>();

function nowMs(): number {
  return Date.now();
}

function fresh(): string | null {
  if (!resolved) return null;
  return nowMs() - resolved.at < BUILD_TTL_MS ? resolved.build : null;
}

/**
 * **The newest build upstream will actually serve.**
 *
 * The candidates go out together rather than walking backwards one round trip at a time: the
 * whole resolution is then one probe deep, which is what makes it safe to await on a request
 * path. It runs at boot and then at most once per TTL, so this is a handful of 16-byte reads a
 * day — the politeness the comment at the top of this file is about is untouched.
 *
 * `null` means no build answered: upstream is unreachable, or a mirror is misconfigured. A real
 * state with a real answer at the other end (`/me` says so, the client draws the world layer),
 * never a thrown error on a tile path.
 */
export async function resolveLivePlanetBuild(): Promise<string | null> {
  const override = overrideSourceUrl();
  if (override) return buildIdOf(override);
  const hit = fresh();
  if (hit) return hit;
  if (resolving) return resolving;
  const run = (async () => {
    const candidates = candidateBuilds();
    const verdicts = await Promise.all(
      candidates.map(async (build) => {
        const ok = await servesArchive(protomapsDailyBuildUrl(build));
        probed.set(build, ok);
        return ok;
      }),
    );
    const build = candidates[verdicts.indexOf(true)] ?? null;
    if (build) resolved = { build, at: nowMs() };
    // A failed resolution keeps the last known good id rather than blanking it: an archive that
    // answered an hour ago is a better bet than nothing while upstream is unreachable.
    return build ?? resolved?.build ?? null;
  })();
  resolving = run;
  void run
    .catch(() => null)
    .finally(() => {
      if (resolving === run) resolving = null;
    });
  return run;
}

/**
 * **What `/me` tells the client, without waiting for anybody** (ADR-0187 §1 amendment).
 *
 * Synchronous on purpose: the id is resolved at boot (`MapService.onModuleInit`) and then on a
 * TTL, so `/me` reads a cached string and never blocks on somebody else's bucket. A stale value
 * is refreshed in the background and stays servable meanwhile — the route accepts any build
 * upstream still holds, which is exactly the window this can lag by.
 */
export function livePlanetBuild(): string | null {
  const override = overrideSourceUrl();
  if (override) return buildIdOf(override);
  if (!fresh()) void resolveLivePlanetBuild().catch(() => null);
  return resolved?.build ?? null;
}

/**
 * **May this build id be served?**
 *
 * Not "is it the current one", and that is deliberate. A client's id is at most as fresh as its
 * last `/me`, and the bytes an id names are immutable — so refusing anything but today's build
 * would blank the map of every client that loaded yesterday, for no gain. What it must never
 * become is an open proxy, so the gate is three tests and a client controls none of them: the
 * shape is a daily id (ADR-0187 §1), the date is inside the retention window, and upstream
 * actually serves it.
 */
export async function isServablePlanetBuild(build: string): Promise<boolean> {
  const override = overrideSourceUrl();
  if (override) return build === buildIdOf(override);
  if (!isMapPlanetBuild(build) || !candidateBuilds().includes(build)) return false;
  const seen = probed.get(build);
  if (seen !== undefined) return seen;
  const ok = await servesArchive(protomapsDailyBuildUrl(build));
  probed.set(build, ok);
  return ok;
}

/** The archive a cut reads (`pmtiles extract`), which is the live build unless a mirror is
 *  configured. Throws rather than cutting from a URL nobody serves — a 42 MB archive of
 *  nothing is worse than a logged failure and a retry. */
export async function livePlanetSourceUrl(): Promise<string> {
  const override = overrideSourceUrl();
  if (override) return override;
  const build = await resolveLivePlanetBuild();
  if (!build) {
    throw new Error(
      'no upstream planet build is readable right now (checked the last ' +
        `${BUILD_LOOKBACK_DAYS} dailies; set ${MAP_TILES_SOURCE_URL} to pin a mirror)`,
    );
  }
  return protomapsDailyBuildUrl(build);
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
async function fetchPlanetRange(build: string, range: ByteRange): Promise<PlanetRange> {
  const url = overrideSourceUrl() ?? protomapsDailyBuildUrl(build);
  const res = await fetch(url, {
    headers: { Range: `bytes=${range.start}-${range.end}` },
    signal: AbortSignal.timeout(PLANET_RANGE_TIMEOUT_MS),
  });
  // A 200 means the server ignored the Range and is sending the whole 128 GiB. Refused rather
  // than streamed: it is never what a tile read wanted, and reading it would exhaust this
  // process long before it finished.
  if (res.status !== 206) {
    // **An archive that has been collected while we were serving it.** Forget the verdict that
    // said otherwise so the next resolution re-probes; the alternative is a process that keeps
    // handing out a dead id until it restarts, which is the shape of the bug this replaces.
    if (res.status === 404) {
      probed.delete(build);
      if (resolved?.build === build) resolved = null;
    }
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
  await cacheRange(build, range, body, total);
  return { body, total };
}

export async function readPlanetRange(build: string, range: ByteRange): Promise<PlanetRange> {
  const hit = await cachedRange(build, range);
  if (hit) return hit;

  const key = cacheKey(build, range);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const reading = fetchPlanetRange(build, range);
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
  probed.clear();
  resolved = null;
  resolving = null;
}
