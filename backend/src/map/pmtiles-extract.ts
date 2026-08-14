// **Cutting a slice out of the planet** (ADR-0186 §3/§4) — a thin wrapper over
// `go-pmtiles`, whose `extract` reads the SOURCE over HTTP range requests and writes a
// small local archive.
//
// **Why a binary rather than a library.** There is no JS writer for the format worth
// having; the Go CLI is the reference implementation, is a single static binary with no
// runtime deps, and is what the Dockerfile installs. It runs a handful of times per trip
// **ever** (see below), so the process cost is irrelevant.
//
// The numbers that make the whole design work, measured 2026-08-13 against the real
// 127.88 GiB daily build:
//
//   whole world, z0–6   →  42.7 MB,  4s,   5 range requests
//   central Tokyo, z0–14 →  22.7 MB, 13s,  40 range requests
//
// That is why nothing here proxies tiles: upstream is touched once per area, not once
// per tile (ADR-0186 §3's 2026-08-13 amendment).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MAP_TILES_SOURCE_URL, PMTILES_BIN } from '../common/env';
import type { MapRegionGeoJson } from './map-region';

const execFileAsync = promisify(execFile);

/** Parallel range requests. 8 took Tokyo to 13s; the source is a public bucket, so this
 *  is politeness as much as speed. */
const DOWNLOAD_THREADS = 8;

/** The default daily-build channel. Overridable by env because **Protomaps say the URLs
 *  may change** and ask that people not hotlink — the long-term answer is our own mirror
 *  of the source, and this is the seam that makes swapping to one a config change. */
export const DEFAULT_TILES_SOURCE = 'https://build.protomaps.com/20260813.pmtiles';

export interface ExtractSpec {
  /** Absolute path the archive is written to. */
  outPath: string;
  maxZoom: number;
  /** Absolute path to a GeoJSON file, or absent for the whole world (the z0–6 layer). */
  regionPath?: string;
  source?: string;
}

/**
 * The argv, built separately from the running of it so the interesting half is testable
 * with no binary present. Every flag here is load-bearing:
 *
 * - `--maxzoom` is the size lever (each level roughly doubles the archive).
 * - `--region` restricts to the trip's areas; **omitting it is what makes a world layer**.
 * - `--download-threads` is why Tokyo takes 13s rather than 100.
 */
export function extractArgs(spec: ExtractSpec): string[] {
  const args = [
    'extract',
    spec.source ?? process.env[MAP_TILES_SOURCE_URL] ?? DEFAULT_TILES_SOURCE,
    spec.outPath,
    `--maxzoom=${spec.maxZoom}`,
    `--download-threads=${DOWNLOAD_THREADS}`,
  ];
  if (spec.regionPath) args.push(`--region=${spec.regionPath}`);
  return args;
}

/** Injected so a test can assert the argv and the temp-file lifecycle without a network
 *  or a binary — the same shape `storage.ts` uses for its swap, rather than a DI
 *  interface for one real implementation. */
export type ExtractRunner = (bin: string, args: string[]) => Promise<void>;

const defaultRunner: ExtractRunner = async (bin, args) => {
  await execFileAsync(bin, args, {
    // An extract is bounded work (13s measured for a city) but it is network-bound, so
    // this is a "something is wrong" ceiling rather than an expected duration.
    timeout: 5 * 60_000,
    maxBuffer: 1024 * 1024,
  });
};

/**
 * Build one archive and return its bytes.
 *
 * The region is written to a temp file because the CLI takes a PATH, not a literal, and
 * the whole temp directory is removed in a `finally` — an extract that throws must not
 * leave a partial 23MB file on a container's disk.
 */
export async function buildExtract(
  spec: { maxZoom: number; region?: MapRegionGeoJson; source?: string },
  run: ExtractRunner = defaultRunner,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'waypoint-map-'));
  try {
    const outPath = join(dir, 'out.pmtiles');
    let regionPath: string | undefined;
    if (spec.region) {
      regionPath = join(dir, 'region.geojson');
      await writeFile(regionPath, JSON.stringify(spec.region), 'utf8');
    }
    const args = extractArgs({ outPath, maxZoom: spec.maxZoom, regionPath, source: spec.source });
    try {
      await run(process.env[PMTILES_BIN] || 'pmtiles', args);
    } catch (error) {
      throw new Error(explainExtractFailure(error), { cause: error });
    }
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * **Say what went wrong in one line, because the raw failure buries it.**
 *
 * `execFile` rejects with `Command failed: pmtiles extract …` and a Node stack; what the CLI
 * actually said is on its **stdout**, several frames down in a log. On 2026-08-14 the sentence
 * that mattered was one line inside forty:
 *
 *     tls: failed to verify certificate: x509: certificate signed by unknown authority
 *
 * That is not a tile problem, a network problem or a quota problem — it is the **runtime image
 * having no system CA store**, and the reason it is easy to misread is that nothing else in the
 * image is affected: Node bundles its own CA bundle, so every `fetch` from JavaScript verifies
 * fine while the Go binary beside it cannot verify anything. Naming it here means the next person
 * reads a fix rather than a stack.
 */
export function explainExtractFailure(error: unknown): string {
  const said = [
    (error as { stdout?: unknown } | null)?.stdout,
    (error as { stderr?: unknown } | null)?.stderr,
    error instanceof Error ? error.message : String(error),
  ]
    .map((part) => (typeof part === 'string' ? part : ''))
    .join('\n');
  if (/x509|certificate signed by unknown authority|failed to verify certificate/i.test(said)) {
    return (
      'pmtiles could not verify the upstream TLS certificate: the runtime image has no system ' +
      'CA store. Install `ca-certificates` in the RUNTIME stage — Node bundles its own bundle, ' +
      'so only the Go binary is affected and nothing else in the image looks broken.'
    );
  }
  if (/ENOENT|not found/i.test(said)) {
    return 'the `pmtiles` binary is not on PATH in this image (see `PMTILES_BIN`).';
  }
  return `pmtiles extract failed: ${said.split('\n').find(Boolean) ?? 'no output'}`;
}
