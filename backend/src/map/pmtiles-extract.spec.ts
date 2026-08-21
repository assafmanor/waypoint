import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { MAP_TILES_SOURCE_URL, PMTILES_BIN } from '../common/env';
import { buildExtract, extractArgs, explainExtractFailure } from './pmtiles-extract';

/* The source is resolved by `planet.ts` and passed IN (it used to default to a build id pinned
   in a shared constant, which upstream deletes after a week). Every case here names its own, so
   nothing in this file can reach the network. */
const SOURCE = 'https://tiles.example/20260821.pmtiles';

/* The runner is injected, so everything here runs with no binary and no network. What
   is asserted is the argv (a wrong flag produces a valid archive of the wrong thing,
   never an error) and the temp-file lifecycle (a failed extract must not strand a
   partial 23MB file on a container's disk). */

afterEach(() => {
  delete process.env[MAP_TILES_SOURCE_URL];
  delete process.env[PMTILES_BIN];
});

describe('extractArgs', () => {
  const base = { outPath: '/tmp/out.pmtiles', maxZoom: 14, source: SOURCE };

  it('cuts to the requested zoom, which is the size lever', () => {
    expect(extractArgs(base)).toContain('--maxzoom=14');
  });

  it('restricts to a region when there is one', () => {
    expect(extractArgs({ ...base, regionPath: '/tmp/r.geojson' })).toContain(
      '--region=/tmp/r.geojson',
    );
  });

  it('omits the region entirely for the world layer', () => {
    // Absence of `--region` IS what makes a whole-world archive — asserted because a
    // stray empty flag would silently cut nothing.
    expect(extractArgs(base).some((a) => a.startsWith('--region'))).toBe(false);
  });

  it('cuts from the archive it was handed, never one of its own choosing', () => {
    expect(extractArgs(base)).toContain(SOURCE);
    expect(extractArgs({ ...base, source: 'https://mirror.example/planet.pmtiles' })).toContain(
      'https://mirror.example/planet.pmtiles',
    );
  });

  it('puts the source before the output, in the order the CLI expects', () => {
    const args = extractArgs(base);
    expect(args[0]).toBe('extract');
    expect(args.indexOf(SOURCE)).toBeLessThan(args.indexOf(base.outPath));
  });
});

describe('buildExtract', () => {
  // `MAP_TILES_SOURCE_URL` wins over resolution, so setting it is what keeps these offline.
  beforeEach(() => {
    process.env[MAP_TILES_SOURCE_URL] = SOURCE;
  });

  it('writes the region to a file and hands the CLI its path', async () => {
    const region = { type: 'MultiPolygon' as const, coordinates: [[[[139, 35]]]] };
    let seenRegion: unknown;
    await buildExtract({ maxZoom: 14, region }, async (_bin, args) => {
      const flag = args.find((a) => a.startsWith('--region='))!;
      seenRegion = JSON.parse(await readFile(flag.slice('--region='.length), 'utf8'));
      await writeFile(args[2]!, Buffer.from('archive'));
    });
    expect(seenRegion).toEqual(region);
  });

  it('returns the archive bytes the CLI wrote', async () => {
    const bytes = await buildExtract({ maxZoom: 6 }, async (_bin, args) => {
      await writeFile(args[2]!, Buffer.from('pmtiles-bytes'));
    });
    expect(bytes.toString()).toBe('pmtiles-bytes');
  });

  it('cleans up its temp directory even when the extract throws', async () => {
    // The failure that matters: a 23MB partial left behind on every failed build.
    let tempOut = '';
    await expect(
      buildExtract({ maxZoom: 14 }, async (_bin, args) => {
        tempOut = args[2]!;
        await writeFile(tempOut, Buffer.from('partial'));
        throw new Error('range request failed');
      }),
    ).rejects.toThrow('range request failed');
    expect(tempOut).not.toBe('');
    expect(existsSync(tempOut)).toBe(false);
  });

  it('uses the binary from env when one is named', async () => {
    process.env[PMTILES_BIN] = '/opt/pmtiles';
    const bin = vi.fn(async (_b: string, args: string[]) => {
      await writeFile(args[2]!, Buffer.from('x'));
    });
    await buildExtract({ maxZoom: 6 }, bin);
    expect(bin.mock.calls[0]![0]).toBe('/opt/pmtiles');
  });
});

/* **The 2026-08-14 outage, as one assertion.** The map failed to load and the reading said
   `err: Bad response code: 500`; the cause was one line on the CLI's stdout, forty lines into a
   Nest stack: `tls: failed to verify certificate: x509: certificate signed by unknown authority`.
   The runtime image had no system CA store, because `ca-certificates` was installed in the stage
   that DOWNLOADS the binary and only the binary was copied forward. What makes it easy to misread
   is that nothing else breaks: Node bundles its own CA bundle, so the app's own HTTPS calls all
   verified fine while the Go binary beside it could verify nothing. */
describe('explainExtractFailure', () => {
  it('names the missing CA store, which is not a network or a tile problem', () => {
    const said = explainExtractFailure(
      Object.assign(new Error('Command failed: pmtiles extract https://build.protomaps.com/x'), {
        stdout:
          'main.go:185: Failed to extract, Failed to create range reader, ' +
          'Get "https://build.protomaps.com/x": tls: failed to verify certificate: ' +
          'x509: certificate signed by unknown authority\n',
        stderr: '',
      }),
    );
    expect(said).toContain('ca-certificates');
    expect(said).toContain('RUNTIME');
  });

  it('names a missing binary separately, since the fix is a different one', () => {
    expect(explainExtractFailure(Object.assign(new Error('spawn pmtiles ENOENT'), {}))).toContain(
      'not on PATH',
    );
  });

  it('passes anything else through with the CLI’s own first line', () => {
    const said = explainExtractFailure(
      Object.assign(new Error('Command failed'), { stdout: 'region is empty\n' }),
    );
    expect(said).toContain('region is empty');
  });
});
