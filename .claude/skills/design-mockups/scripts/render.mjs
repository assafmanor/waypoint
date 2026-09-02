#!/usr/bin/env node
/* Render a mockup the way it is meant to be judged: every theme × every screen
 * width the file offers, plus the numbers it read off its own DOM.
 *
 * WHY THIS EXISTS. A mockup that was never opened is a document, not a mockup —
 * and every defect in `references/pitfalls.md` was found by looking at a
 * rendered page, not by reading its source. This makes looking cheap.
 *
 *   node .claude/skills/design-mockups/scripts/render.mjs mockups/foo-v1.html
 *
 * It drives the file's OWN controls rather than setting `data-theme` directly,
 * so whatever the toggle wires up (re-measuring, repainting) runs exactly as it
 * does for a person. A file with no controls still renders once.
 *
 * Output: PNGs + a `measurements.md` under
 * `.claude/skills/design-mockups/.renders/<file>/`, and console errors — an
 * uncaught error mid-script leaves half the frames unpainted, which reads as a
 * design problem until you notice the console.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** Playwright may be the repo's or the machine's; try both before giving up. */
async function loadChromium() {
  const tries = ['playwright', 'playwright-core'];
  for (const name of tries) {
    try {
      return require(name).chromium;
    } catch {
      /* keep looking */
    }
  }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright')).chromium;
  } catch {
    throw new Error(
      'playwright not found. Install it (`pnpm install` in frontend/, or ' +
        '`npm i -g playwright`); Chromium itself is already at PLAYWRIGHT_BROWSERS_PATH.',
    );
  }
}

const file = process.argv[2];
if (!file) {
  console.error('usage: render.mjs <mockup.html> [--out <dir>]');
  process.exit(1);
}
const abs = path.resolve(file);
const outIdx = process.argv.indexOf('--out');
const outDir =
  outIdx > -1
    ? path.resolve(process.argv[outIdx + 1])
    : path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        '..',
        '.renders',
        path.basename(abs, '.html'),
      );

const chromium = await loadChromium();
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1200 } });

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));

/* Google Fonts, fetched through curl and served back to the page.
 *
 * This is not a nicety. A sandboxed session cannot reach fonts.googleapis.com
 * from the browser, so the page silently falls back to a system font — and
 * every width in the measurement table is then a measurement of the wrong
 * typeface, in a file whose whole claim is that its numbers are real. curl is
 * already configured for this environment's proxy and CA bundle, so it gets
 * through where Chromium does not. If it fails too, the page still renders and
 * the font report below says the numbers are not to be trusted. */
await page.route('**://fonts.g*/**', async (route) => {
  try {
    const body = execFileSync(
      'curl',
      ['-sSL', '--max-time', '20', '-A', 'Mozilla/5.0', route.request().url()],
      { maxBuffer: 1 << 26 },
    );
    await route.fulfill({ status: 200, body, headers: { 'access-control-allow-origin': '*' } });
  } catch {
    await route.abort();
  }
});

await page.goto(`file://${abs}`, { waitUntil: 'networkidle' });

const fonts = await page.evaluate(() => {
  const loaded = new Set();
  for (const f of document.fonts) if (f.status === 'loaded') loaded.add(f.family);
  return [...loaded];
});
if (!fonts.length) {
  problems.push(
    'NO WEBFONT LOADED — the page fell back to a system font, so every measured ' +
      'width is wrong. Do not quote numbers from this run.',
  );
}

/** The file's own control groups, so its wiring runs instead of being bypassed. */
const groups = await page.evaluate(() => {
  const read = (attr) =>
    [...document.querySelectorAll(`.controls button[data-${attr}]`)].map(
      (b) => b.dataset[attr === 'theme' ? 'theme' : 'w'],
    );
  return { themes: read('theme'), widths: read('w') };
});
const themes = groups.themes.length ? groups.themes : [null];
const widths = groups.widths.length ? groups.widths : [null];

/* A THROWAWAY SHOT BEFORE THE LOOP, AND IT IS LOAD-BEARING.
 *
 * `document.fonts.ready` (and `document.fonts.load`) resolve when a face has been
 * FETCHED; Chromium may still be laying the page out in the fallback until something
 * forces the application, and `requestAnimationFrame` does not reliably do it for
 * content far below the fold. Playwright's own screenshot DOES — it waits for fonts —
 * so shooting once and discarding it makes every pass of the loop measure the same
 * typeface as every other.
 *
 * Found on `the-now-line-is-inside-something-v1.html`: one `.wp-event-timemeta` came
 * back ⁦105.8px⁩ wide in the first pass and ⁦123.4px⁩ in the third, which is the
 * difference between a grid cell that wraps and one that does not — so the file
 * reported ⁦72px⁩ for `light-360` and ⁦91px⁩ for `dark-360` FOR THE SAME BOX, with no
 * error and a full measurement table either way. The shape of that failure is the
 * dangerous one: the wrong number was the one saying the change cost nothing. */
await page.screenshot({ fullPage: true });
await page.waitForTimeout(150);

const report = [
  `# ${path.basename(abs)}`,
  '',
  fonts.length ? `Webfonts loaded: ${fonts.join(', ')}.` : '**No webfont loaded — widths are not trustworthy.**',
  '',
];

for (const theme of themes) {
  for (const width of widths) {
    if (theme) await page.click(`.controls button[data-theme="${theme}"]`);
    if (width) await page.click(`.controls button[data-w="${width}"]`);
    await page.waitForTimeout(400); // let any height transition settle before measuring

    const name = [theme ?? 'default', width ? `${width}px` : 'default'].join('-');
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });

    const table = await page.evaluate(() =>
      [...document.querySelectorAll('#meas tbody tr')].map((tr) =>
        [...tr.children].map((td) => td.textContent.trim()),
      ),
    );
    report.push(`## ${name}`, '');
    if (table.length) {
      report.push('| מה נמדד | ערך | מול מה |', '| --- | --- | --- |');
      for (const r of table) report.push(`| ${r.join(' | ')} |`);
    } else {
      report.push('_No `#meas` table — a mockup with no measurements is arguing from vibes._');
    }
    report.push('');
    console.log(`✓ ${name}`);
  }
}

await browser.close();
await writeFile(path.join(outDir, 'measurements.md'), report.join('\n'));

console.log(`\nscreenshots + measurements.md → ${outDir}`);
if (problems.length) {
  console.log('\nPROBLEMS (a thrown error leaves frames unpainted — fix these first):');
  for (const p of [...new Set(problems)]) console.log(`  · ${p}`);
} else {
  console.log('no console errors');
}
