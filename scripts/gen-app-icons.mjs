// Rasterizes `frontend/public/favicon.svg` into the four app-icon PNGs (ADR-0087).
//
// ADR-0087 already said the PNGs are cut from the SVG "so the set never drifts", and then
// left the cutting to whoever remembered how — the full-bleed source was never committed,
// and the four files duly diverged in geometry, scale and stroke. This script is that
// sentence made runnable: one source, one command, four outputs.
//
//   node scripts/gen-app-icons.mjs
//
// Playwright's Chromium rather than a raster library, because the mark's amber core is an
// SVG filter (`feGaussianBlur`) and most lightweight rasterizers drop filters silently —
// which would flatten the one glowing element the logo is built around. It follows
// `deploy-swap-check.mjs`'s pattern for that: a bare specifier resolves from this MODULE's
// URL, and `@playwright/test` is a frontend devDependency pnpm does not hoist, so the
// require is anchored at `frontend/package.json` and the cwd does not matter.
//
// **Screenshot the element, never the viewport.** `--window-size` on a headless Chromium
// is the WINDOW, not the page box, so a viewport screenshot came out with the icon
// squeezed into the top of a white band. `locator.screenshot()` is clipped to the `<svg>`
// itself, so the output is square by construction at every size.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved against `frontend/`, where the dependency actually lives (see the header).
const { chromium } = createRequire(new URL('../frontend/package.json', import.meta.url))(
  '@playwright/test',
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'frontend', 'public');
const SOURCE = join(PUBLIC, 'favicon.svg');
const BUNDLED_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** Every raster icon, and the size it is asked for.
 *
 * All four are now FULL BLEED and identical but for their pixel size, which is the point of
 * the ADR-0087 amendment. `pwa-maskable-512` and `apple-touch-icon` were already full-bleed
 * because iOS/Android mask them; `pwa-192`/`pwa-512` drew their own rounded tile with a teal
 * stroke, and that drawn rounding is what looked wrong on a launcher that does not round. */
const ICONS = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'pwa-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const svg = await readFile(SOURCE, 'utf8');

const browser = await chromium.launch({
  executablePath: existsSync(BUNDLED_CHROME) ? BUNDLED_CHROME : undefined,
});
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();

try {
  for (const { file, size } of ICONS) {
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    const shot = await page.locator('svg').screenshot({ omitBackground: false });
    await writeFile(join(PUBLIC, file), shot);
    console.log(`wrote frontend/public/${file} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
