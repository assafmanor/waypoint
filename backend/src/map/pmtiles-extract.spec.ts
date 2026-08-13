import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { MAP_TILES_SOURCE_URL, PMTILES_BIN } from '../common/env';
import { DEFAULT_TILES_SOURCE, buildExtract, extractArgs } from './pmtiles-extract';

/* The runner is injected, so everything here runs with no binary and no network. What
   is asserted is the argv (a wrong flag produces a valid archive of the wrong thing,
   never an error) and the temp-file lifecycle (a failed extract must not strand a
   partial 23MB file on a container's disk). */

afterEach(() => {
  delete process.env[MAP_TILES_SOURCE_URL];
  delete process.env[PMTILES_BIN];
});

describe('extractArgs', () => {
  const base = { outPath: '/tmp/out.pmtiles', maxZoom: 14 };

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

  it('reads the source from env, so a mirror is a config change', () => {
    expect(extractArgs(base)).toContain(DEFAULT_TILES_SOURCE);
    process.env[MAP_TILES_SOURCE_URL] = 'https://mirror.example/planet.pmtiles';
    expect(extractArgs(base)).toContain('https://mirror.example/planet.pmtiles');
  });

  it('puts the source before the output, in the order the CLI expects', () => {
    const args = extractArgs(base);
    expect(args[0]).toBe('extract');
    expect(args.indexOf(DEFAULT_TILES_SOURCE)).toBeLessThan(args.indexOf(base.outPath));
  });
});

describe('buildExtract', () => {
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
