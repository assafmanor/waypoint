#!/usr/bin/env node
// Pull the PDF renderer's real stylesheet out of `itinerary-pdf.template.ts`
// and inline it into a mockup — the print-side twin of `inline-app-css.mjs`.
//
// Why this exists rather than a hand-copy: the print mockups have hand-copied
// this CSS since ADR-0213 was designed, and `docs/design/mockups.md` records
// drift as the catalog's chronic failure. The A4 renderer's CSS is not a `.css`
// file — it lives inside a `return \`…\`` template literal, which is why the
// existing inliner cannot see it — so the extraction is by markers instead of
// by path, and it REFUSES a block containing an interpolation rather than
// inlining something that is not literally what ships.
//
// Usage:  node mockups/tools/extract-pdf-css.mjs <mockup.html> [...more.html]
//
// Contract, per file: a manifest comment, then the generated block it fills.
//
//   <!-- PDF-CSS: backend/src/sharing/itinerary-pdf.template.ts -->
//   <style data-pdf-css>…generated…</style>
//
// Idempotent. A mockup with no manifest is skipped, not an error.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = /<!--\s*PDF-CSS:\s*([^>]+?)\s*-->/;
const BLOCK = /(<style data-pdf-css>)[\s\S]*?(<\/style>)/;

/** The renderer's page CSS: from the palette that opens it to the closing tag.
 *  Both markers are load-bearing — the font faces above are built by a call and
 *  the running footer below is a separate string with its own interpolation. */
const START = ':root{--pdf-ink';
const END = '</style></head>';

async function extract(source) {
  const ts = await readFile(path.join(REPO, source), 'utf8');
  const from = ts.indexOf(START);
  const to = ts.indexOf(END);
  if (from < 0 || to < 0 || to < from) throw new Error(`${source}: markers not found`);
  const css = ts.slice(from, to).trim();
  // A `${…}` here would mean the shipped CSS is computed and this copy would be
  // a guess at one of its outputs. Refuse rather than quietly inline the guess.
  if (css.includes('${') || css.includes('`')) {
    throw new Error(`${source}: the style block interpolates; extraction would not be truthful`);
  }
  return css;
}

async function inline(file) {
  const html = await readFile(file, 'utf8');
  const manifest = html.match(MANIFEST);
  if (!manifest) return `${path.basename(file)}: no PDF-CSS manifest, skipped`;
  if (!BLOCK.test(html)) throw new Error(`${file}: manifest with no <style data-pdf-css> block`);

  const css = await extract(manifest[1].trim());
  const banner =
    `\n      /* GENERATED — do not edit. Extracted verbatim from\n` +
    `         ${manifest[1].trim()} by mockups/tools/extract-pdf-css.mjs.\n` +
    `         Re-run after any change to that renderer. */\n`;
  // Replace via a function so `$&`/`$1` inside the css stay literal — the same
  // guard `inline-app-css.mjs` carries, and CSS full of `$` is not hypothetical.
  const next = html.replace(BLOCK, (_m, open, close) => `${open}${banner}${css}\n    ${close}`);
  if (next === html) return `${path.basename(file)}: already current`;
  await writeFile(file, next);
  return `${path.basename(file)}: inlined the A4 renderer's css (${(css.length / 1024).toFixed(1)} kB)`;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node mockups/tools/extract-pdf-css.mjs <mockup.html> [...]');
  process.exit(1);
}
for (const file of files) console.log(await inline(file));
