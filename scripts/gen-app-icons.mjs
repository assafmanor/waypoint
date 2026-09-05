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
const SRC = join(ROOT, 'frontend', 'src');
const FONTS = join(SRC, 'assets', 'fonts');
const COVERS = join(ROOT, 'scripts', 'og-covers');

/** The app's real stylesheets, in the app's own import order — later rules win at equal
 *  specificity, so the order is not decoration. Same manifest idea as
 *  `mockups/tools/inline-app-css.mjs`, and here for the same reason: a cover that borrows
 *  `.join-ticket` or `.sh-hero` must render the SHIPPED rules, not a transcription of them.
 *  `shared-itinerary.css` is the live cover's masthead; `App.css` is the join ticket. */
const COVER_SHEETS = ['styles/tokens.css', 'App.css', 'screens/shared-itinerary.css'];
const BUNDLED_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** **The generic filling of the covers' `{{slots}}`** (ADR-0220's 2026-09-06 amendment).
 *  The same two templates are filled with a real trip's facts at request time by
 *  `backend/src/spa/og-cover.template.ts`; what this script cuts is the FALLBACK PNG served
 *  when a code does not resolve, so the defaults live in `defaults.json` beside them rather
 *  than in either filler. */
const COVER_DEFAULTS = JSON.parse(await readFile(join(COVERS, 'defaults.json'), 'utf8'));

/** The avatar row's own spec, from `@waypoint/shared` rather than retyped here — the app, the
 *  backend renderer and this cutter draw the same row. */
const { INVITE_AVATARS } = createRequire(
  new URL('../packages/shared/package.json', import.meta.url),
)('@waypoint/shared');

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

  // **The link-preview covers** (ADR-0220 §2-3, amended 2026-09-05). `html: true` — these
  // render the app's REAL stylesheets from `scripts/og-covers/`, because two of them borrow
  // a shipped tree (`.join-ticket`, `.sh-hero`) and the SVG versions were hand-transcribed
  // coordinates that had already drifted once, in a way only a rendered PNG could show.
  // See `scripts/og-covers/README.md`.
  { source: 'og-cover.html', file: 'og-cover.png', size: 1200, height: 630, html: true },
  { source: 'og-invite.html', file: 'og-invite.png', size: 1200, height: 630, html: true },
  // The third cover, and the reason there is a third: sharing the brand cover made a live
  // itinerary sent to family look like a marketing link (owner, 2026-09-05).
  { source: 'og-live.html', file: 'og-live.png', size: 1200, height: 630, html: true },

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

/** The app's sheets plus the covers' own chrome, read once. */
async function coverCss() {
  const app = await Promise.all(COVER_SHEETS.map((sheet) => readFile(join(SRC, sheet), 'utf8')));
  const own = await readFile(join(COVERS, '_cover.css'), 'utf8');
  return app.join('\n') + '\n' + own;
}

const COVER_CSS = await coverCss();

/** The reader page's own mark, as bytes rather than a path. The runtime renderer aborts every
 *  request before setting content, so `src="/icon-mark-bright.svg"` draws a broken box there;
 *  the cover carries a data URL instead and both fillers read the same file the page loads. */
const BRAND_MARK_DATA_URL =
  'data:image/svg+xml;base64,' +
  (await readFile(join(PUBLIC, 'icon-mark-bright.svg'))).toString('base64');

/** **`{{slot}}` -> value, and an unfilled slot is an error rather than visible braces.**
 *  Two programs fill these templates — this script and the backend — so a slot added to the
 *  HTML for one of them would otherwise ship as literal `{{name}}` in the other's output.
 *  The backend's copy of this function throws for the same reason (`og-cover.template.ts`);
 *  it is eight lines, and sharing it would mean the runtime image carrying this script. */
function fillCoverSlots(template, values) {
  return template.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, raw, text) => {
    const key = raw ?? text;
    if (!(key in values)) throw new Error(`no value for cover slot ${key}`);
    // A TRIPLE brace is markup we build ourselves (the avatar row); a double is text, and
    // text is escaped because on the runtime side it is a trip name somebody typed.
    return raw ? String(values[key]) : escapeHtml(String(values[key]));
  });
}

/** The invite ticket's face row, as many as the member count and no more than the app draws
 *  (`INVITE_AVATARS`). The fallback PNG stands in for a trip nobody could resolve, so it
 *  shows the full row — there is no count for it to contradict. */
function avatarRow(count) {
  return Array.from(
    { length: Math.min(count, INVITE_AVATARS.MAX) },
    (_, i) =>
      `<span class="ticket-av" style="background: ${INVITE_AVATARS.COLORS[i % INVITE_AVATARS.COLORS.length]}">` +
      `${INVITE_AVATARS.GLYPH}</span>`,
  ).join('');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * An HTML cover. **`dir="rtl"` and no `data-theme`**, both deliberate: the app is RTL and
 * half of what these draw is Hebrew, and a PNG has no theme — leaving the attribute off is
 * what pins the artwork to `tokens.css`'s `:root` (light) block, which is the whole of §1.
 */
async function shotHtml(source) {
  const body = fillCoverSlots(await readFile(join(COVERS, source), 'utf8'), {
    ...(COVER_DEFAULTS[source] ?? {}),
    brandMark: BRAND_MARK_DATA_URL,
    avatars: avatarRow(INVITE_AVATARS.MAX),
  });
  await page.setContent(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="UTF-8">` +
      `<style>${FACES}${COVER_CSS}</style></head><body>${body}</body></html>`,
  );
  await page.evaluate(() =>
    Promise.all(
      ['400 12px Assistant', '600 12px Assistant', '700 12px Assistant', '12px "Secular One"'].map(
        (f) => document.fonts.load(f),
      ),
    ),
  );
  return page.locator('.og-cover').screenshot();
}

/** An SVG icon. */
async function shotSvg(source, size, height, fonts, alpha) {
  const svg = await readFile(join(PUBLIC, source), 'utf8');
  await page.setContent(
    `<style>${fonts ? FACES : ''}html,body{margin:0}` +
      `svg{display:block;width:${size}px;height:${height}px}</style>${svg}`,
  );
  if (fonts) await page.evaluate(() => document.fonts.ready);
  // **Screenshot the element, never the viewport** — `--window-size` on a headless Chromium
  // is the WINDOW, not the page box. `omitBackground` keeps the alpha channel for the
  // notification badge, whose entire job is to BE an alpha channel.
  return page.locator('svg').screenshot({ omitBackground: alpha });
}

try {
  for (const {
    source,
    file,
    size,
    height = size,
    fonts = false,
    alpha = false,
    html = false,
  } of ICONS) {
    const shot = html ? await shotHtml(source) : await shotSvg(source, size, height, fonts, alpha);
    await writeFile(join(PUBLIC, file), shot);
    console.log(`wrote frontend/public/${file} (${size}×${height}) from ${source}`);
  }
} finally {
  await browser.close();
}

/** **A cover whose PNG is not 1200×630 is a cover that grew a scrollbar or a stray margin**,
 *  and the card would letterbox it rather than fail. Asserted rather than eyeballed, because
 *  the last two defects in these assets were both invisible in the source. */
for (const { file, size, height = size, html = false } of ICONS.filter((i) => i.html)) {
  const png = await readFile(join(PUBLIC, file));
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (w !== size || h !== height) {
    throw new Error(`${file} came out ${w}×${h}, expected ${size}×${height} (${html})`);
  }
}
