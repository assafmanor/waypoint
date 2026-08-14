// Vendors the basemap's glyph ranges into `frontend/public/map-glyphs/` (ADR-0186 §3).
//
// A GL renderer does not use the page's fonts: it fetches pre-rendered SDF glyphs from the
// style's `glyphs` URL, one 256-codepoint range at a time. That URL pointed at
// `protomaps.github.io`, which is a vendor host on a user's fetch path — and, more to the
// point for Phase 3, a map downloaded for a flight draws no labels at all without it.
//
// Committed rather than fetched at build time: these bytes never change, a Docker build has
// no reason to reach GitHub, and a font that 404s in production is a silent map (the SPA
// fallback answers a miss, not the file). Re-run only when `@protomaps/basemaps` starts
// naming a fontstack we do not have — `map-style.test.ts` fails when it does.
//
//   node scripts/fetch-map-glyphs.mjs
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'frontend', 'public', 'map-glyphs');

// Resolved from the frontend workspace, which is where the dependency is installed —
// this file lives a directory up and pnpm does not hoist it to the root.
const require = createRequire(pathToFileURL(join(ROOT, 'frontend', 'package.json')));
const { layers, namedFlavor } = await import(
  pathToFileURL(require.resolve('@protomaps/basemaps')).href
);
const UPSTREAM = 'https://protomaps.github.io/basemaps-assets/fonts';

// The glyph range MapLibre asks for, and there are 256 of them covering the BMP. Every one
// is fetched, including the empty ones: a missing range is a request that fails at render
// time in whatever country nobody tested, and an empty .pbf is 8 bytes.
const RANGE_SIZE = 256;
const RANGES = 65536 / RANGE_SIZE;

/** The fontstacks the style actually names, read out of the generated layers rather than
 *  listed here — the list is upstream's to change, and `{ lang: 'he' }` decides part of it
 *  (the Devanagari stack, for one, is not emitted for Hebrew). */
function fontstacks() {
  const found = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === 'string' && value.startsWith('Noto')) found.add(value);
  };
  for (const scheme of ['light', 'dark']) {
    for (const layer of layers('protomaps', namedFlavor(scheme), { lang: 'he' })) {
      walk(layer.layout?.['text-font']);
    }
  }
  return [...found].sort();
}

const stacks = fontstacks();
console.log(`fontstacks: ${stacks.join(', ')}`);

let bytes = 0;
for (const stack of stacks) {
  await mkdir(join(OUT, stack), { recursive: true });
  for (let i = 0; i < RANGES; i += 1) {
    const range = `${i * RANGE_SIZE}-${(i + 1) * RANGE_SIZE - 1}`;
    const url = `${UPSTREAM}/${encodeURIComponent(stack)}/${range}.pbf`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    bytes += body.byteLength;
    await writeFile(join(OUT, stack, `${range}.pbf`), body);
  }
  console.log(`  ${stack}: ${RANGES} ranges`);
}
console.log(`${(bytes / 1e6).toFixed(1)} MB in ${OUT}`);
