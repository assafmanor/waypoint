// Rasterizes `frontend/public/*.svg` into every raster asset the app ships (ADR-0087,
// extended by ADR-0220 for the two link-preview covers and the notification badge).
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
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved against `frontend/`, where the dependency actually lives (see the header).
const { chromium } = createRequire(new URL('../frontend/package.json', import.meta.url))(
  '@playwright/test',
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'frontend', 'public');
const FONTS = join(ROOT, 'frontend', 'src', 'assets', 'fonts');
const BUNDLED_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** Every raster icon, and the size it is asked for.
 *
 * All four are now FULL BLEED and identical but for their pixel size, which is the point of
 * the ADR-0087 amendment. `pwa-maskable-512` and `apple-touch-icon` were already full-bleed
 * because iOS/Android mask them; `pwa-192`/`pwa-512` drew their own rounded tile with a teal
 * stroke, and that drawn rounding is what looked wrong on a launcher that does not round. */
const ICONS = [
  { source: 'favicon.svg', file: 'pwa-192.png', size: 192 },
  { source: 'favicon.svg', file: 'pwa-512.png', size: 512 },
  { source: 'favicon.svg', file: 'pwa-maskable-512.png', size: 512 },
  { source: 'favicon.svg', file: 'apple-touch-icon.png', size: 180 },

  // **The link-preview covers** (ADR-0220 §2-3). 1200x630 is Open Graph's own
  // recommendation and the size WhatsApp promotes to a large card; below ~300px wide it
  // degrades to a thumbnail beside the text, which is the layout the covers were measured
  // against and rejected. They carry Hebrew and Latin type, so `fonts: true`.
  { source: 'og-cover.svg', file: 'og-cover.png', size: 1200, height: 630, fonts: true },
  { source: 'og-invite.svg', file: 'og-invite.png', size: 1200, height: 630, fonts: true },

  // **Android's small notification icon** (ADR-0220 §6), and the one asset here that MUST
  // keep its alpha: Android paints the small icon from the alpha channel, so a white
  // background would restore the exact white rectangle this file exists to end. 96px is
  // the size Chrome asks for; the artwork is inset to 0.86 in the SVG itself.
  { source: 'notification-badge.svg', file: 'notification-badge.png', size: 96, alpha: true },
];

const browser = await chromium.launch({
  executablePath: existsSync(BUNDLED_CHROME) ? BUNDLED_CHROME : undefined,
});
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();

/**
 * **The app's own faces, inlined as data URLs.** The covers set `font-family: 'Secular One'`
 * and `'Assistant'` in the SVG, and headless Chromium has neither — nor can it fetch them,
 * since `page.setContent` has no origin to resolve a relative path against. Without this the
 * wordmark rasterizes in a system fallback and the Hebrew line rasterizes as boxes, which is
 * a defect that looks like a design choice.
 *
 * Same technique the itinerary PDF uses (`itinerary-pdf.template.ts` inlines these faces for
 * the same reason, in the same kind of browser). Read once, reused for both covers.
 */
async function fontFaces() {
  const files = (await readdir(FONTS)).filter((f) => f.endsWith('.woff2'));
  const faces = [];
  for (const file of files) {
    // `assistant-hebrew.woff2` → family `Assistant`; `secular-one-latin.woff2` → `Secular
    // One`. The subset suffix is dropped and the rest title-cased, which is exactly how
    // `styles/fonts.css` names them — three subsets per family, all declared under one name,
    // so the browser picks by coverage.
    const family = file
      .replace(/\.woff2$/, '')
      .replace(/-(hebrew|latin-ext|latin)$/, '')
      .split('-')
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' ');
    const base64 = (await readFile(join(FONTS, file))).toString('base64');
    // 400 and 600 are both declared from the same file on purpose: these are the static
    // subsets the app ships, and `font-weight: 600` on a 400-only family would otherwise
    // synthesise a bold. `Secular One` has one weight by design.
    faces.push(
      `@font-face{font-family:'${family}';font-weight:400 700;font-display:block;` +
        `src:url(data:font/woff2;base64,${base64}) format('woff2')}`,
    );
  }
  return faces.join('');
}

const FACES = await fontFaces();

try {
  for (const { source, file, size, height = size, fonts = false, alpha = false } of ICONS) {
    const svg = await readFile(join(PUBLIC, source), 'utf8');
    await page.setContent(
      `<style>${fonts ? FACES : ''}html,body{margin:0}` +
        `svg{display:block;width:${size}px;height:${height}px}</style>${svg}`,
    );
    // The faces are `font-display: block` and inlined, so this resolves immediately — but
    // it resolves AFTER layout has seen them, which is the part that matters: a screenshot
    // taken in the same tick as `setContent` can catch the fallback metrics.
    if (fonts) await page.evaluate(() => document.fonts.ready);
    // **Screenshot the element, never the viewport** — `--window-size` on a headless
    // Chromium is the WINDOW, not the page box. `omitBackground` keeps the alpha channel
    // for the notification badge, whose entire job is to BE an alpha channel.
    const shot = await page.locator('svg').screenshot({ omitBackground: alpha });
    await writeFile(join(PUBLIC, file), shot);
    console.log(`wrote frontend/public/${file} (${size}×${height}) from ${source}`);
  }
} finally {
  await browser.close();
}
