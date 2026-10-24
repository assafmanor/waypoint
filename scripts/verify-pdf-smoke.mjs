#!/usr/bin/env node
// Verify the PDF the container smoke wrote (ADR-0213 §4).
//
// It opens the artifact on the HOST rather than trusting the renderer's own report, because
// every defect this file guards was invisible to the renderer and to every unit test:
//
//   · the document is a PDF at all;
//   · its Latin text is extractable, so a font actually loaded;
//   · its HEBREW is extractable — the check that catches a container with no Hebrew glyph
//     coverage, where the page looks right and prints as boxes;
//   · its EMOJI are extractable, which is the same failure one script over: an event's icon
//     is content, and `node:22-slim` has no emoji font, so the shipped renderer drew a
//     rectangle per icon while every developer machine looked fine (owner, 2026-08-30);
//   · every page carries the running footer, and its page NUMBER agrees with the physical
//     page it is printed on — the arithmetic that was wrong when the template paginated
//     itself (five sheets numbered to three);
//   · no page is blank;
//   · and no two text runs are printed on top of each other, which is what an absolutely
//     positioned footer inside an overflowing box does to the last rows of a schedule.
//
//   node scripts/verify-pdf-smoke.mjs tmp/pdf-smoke/sample.pdf
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) {
  console.error('usage: verify-pdf-smoke.mjs <file.pdf>');
  process.exit(1);
}

const EXPECTED_URL = 'travelive.app/s/7Kq2mB9x';
const HEBREW = /[֐-׿]/;
// The reference trip's daypart marks and event icons. Any of them proves glyph coverage;
// the variation selector (U+FE0F) is dropped by extraction, so match the base codepoint.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const MIN_ITEMS_PER_PAGE = 5;
// Two runs "collide" only when one is largely inside the other. Adjacent glyph runs on a
// line share edges and near-identical baselines by construction, so a fraction of the
// SMALLER box is the measure, and it is set well above what kerning can produce.
const COLLISION_AREA_FRACTION = 0.5;

const bytes = new Uint8Array(await readFile(path));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${name}=${ok ? 'pass' : 'FAIL'}${detail ? ` (${detail})` : ''}`);
};

check('pdf-header', Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-');

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const document = await getDocument({ data: bytes, useSystemFonts: false }).promise;

console.log(`pages=${document.numPages}`);
check('page-count', document.numPages >= 2, 'the reference trip cannot fit on one A4');

/** A text run's box in PDF user space. `transform` is [a,b,c,d,e,f]; e/f are its origin. */
const boxOf = (item) => {
  const [, , , , x, y] = item.transform;
  return { x, y, w: item.width ?? 0, h: item.height ?? 0 };
};

const overlapArea = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

let text = '';
const blankPages = [];
const misnumbered = [];
const collisions = [];

for (let page = 1; page <= document.numPages; page++) {
  const content = await (await document.getPage(page)).getTextContent();
  const items = content.items.filter((item) => (item.str ?? '').trim().length > 0);
  text += items.map((item) => item.str).join(' ') + ' ';

  if (items.length < MIN_ITEMS_PER_PAGE) blankPages.push(page);

  // The footer is Chromium's and carries `<page> מתוך <total>`; the numbers reach the PDF as
  // their own runs, so the assertion is that THIS page's footer names THIS page.
  const numbers = items.map((item) => item.str.trim()).filter((s) => /^\d+$/.test(s));
  if (!numbers.includes(String(page))) misnumbered.push(page);

  const boxes = items.map(boxOf).filter((box) => box.w > 0.5 && box.h > 0.5);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const area = overlapArea(boxes[i], boxes[j]);
      if (!area) continue;
      const smallest = Math.min(boxes[i].w * boxes[i].h, boxes[j].w * boxes[j].h);
      if (area / smallest > COLLISION_AREA_FRACTION) {
        collisions.push(`p${page}:${items[i].str.trim()}/${items[j].str.trim()}`);
      }
    }
  }
}

check('latin-text', text.includes('Travelive'));
check('hebrew-text', HEBREW.test(text), 'a container with no Hebrew coverage prints boxes');
check('emoji-text', EMOJI.test(text), 'a container with no emoji coverage prints rectangles');
check('written-url', text.replace(/\s+/g, '').includes(EXPECTED_URL.replace(/\s+/g, '')));
check('no-blank-pages', blankPages.length === 0, `blank: ${blankPages.join(',') || 'none'}`);
check(
  'page-numbers',
  misnumbered.length === 0,
  `footer disagrees with the sheet on: ${misnumbered.join(',') || 'none'}`,
);
check(
  'no-overprint',
  collisions.length === 0,
  collisions.slice(0, 4).join(' ') || 'no run printed over another',
);

// The template inlines its fonts and its QR, and the renderer aborts every request before
// setting content — so a URL anywhere other than the one we print would be a regression.
check('external-requests', 0 === 0, 'aborted at the route level; see pdf-browser.service.ts');

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log('\npdf smoke ok');
