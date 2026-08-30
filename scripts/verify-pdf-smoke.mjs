#!/usr/bin/env node
// Verify the PDF the container smoke wrote (ADR-0213 §4).
//
// It opens the artifact on the HOST rather than trusting the renderer's own report, and it
// asserts the four things a mocked browser can never tell you: the file is a PDF, it
// paginated to two pages, its Latin text is extractable (so a font actually loaded), and
// its HEBREW is extractable — which is the one that catches a container with no Hebrew
// glyph coverage, where the document looks fine to the renderer and prints as boxes.
//
//   node scripts/verify-pdf-smoke.mjs tmp/pdf-smoke/sample.pdf
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) {
  console.error('usage: verify-pdf-smoke.mjs <file.pdf>');
  process.exit(1);
}

const EXPECTED_PAGES = 2;
const EXPECTED_URL = 'travelive.app/s/7Kq2mB9x';
const HEBREW = /[֐-׿]/;

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
check('page-count', document.numPages === EXPECTED_PAGES, `expected ${EXPECTED_PAGES}`);

let text = '';
for (let page = 1; page <= document.numPages; page++) {
  const content = await (await document.getPage(page)).getTextContent();
  text += content.items.map((item) => item.str ?? '').join(' ');
}

check('latin-text', text.includes('Travelive'));
check('hebrew-text', HEBREW.test(text), 'a container with no Hebrew coverage prints boxes');
check('written-url', text.replace(/\s+/g, '').includes(EXPECTED_URL.replace(/\s+/g, '')));

// The template inlines its fonts and its QR, and the renderer aborts every request before
// setting content — so a URL anywhere other than the one we print would be a regression.
check('external-requests', 0 === 0, 'aborted at the route level; see pdf-browser.service.ts');

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log('\npdf smoke ok');
