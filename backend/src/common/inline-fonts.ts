import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **`@font-face` rules carrying their own bytes**, for every document this backend renders in
 * Chromium with the network cut (`sharing/render-browser.service.ts`).
 *
 * Extracted from `itinerary-pdf.template.ts` when the link-preview covers needed the same
 * faces (ADR-0220's 2026-09-06 amendment) — rule 8. The two callers want different SETS,
 * which is why the face list is a parameter rather than a constant here: the paper takes the
 * monochrome emoji face (see `assets/fonts/README.md`), and a cover takes none, because a
 * cover is a screenshot and wants the system's COLOUR emoji font behind it.
 */

const FONT_DIR_CANDIDATES = [
  // The runtime image copies both sets — the app's faces and the PDF-only emoji — here.
  '/app/pdf-fonts',
  // Running from source (`pnpm dev`, specs): the frontend's own copies…
  join(__dirname, '..', '..', '..', 'frontend', 'src', 'assets', 'fonts'),
  join(process.cwd(), '..', 'frontend', 'src', 'assets', 'fonts'),
  // …and the one face the app has no use for (see `backend/assets/fonts/README.md`).
  join(__dirname, '..', '..', 'assets', 'fonts'),
  join(process.cwd(), 'assets', 'fonts'),
  join(process.cwd(), 'backend', 'assets', 'fonts'),
];

/**
 * **The unicode-range split is load-bearing, exactly as it is in `styles/fonts.css`.**
 *
 * Google ships each family as several files split by script, and this app is Hebrew-first
 * (ADR-0009). Declaring both Assistant faces without a range makes the LATIN one — which
 * carries no Hebrew glyphs — win for every Hebrew codepoint, and every heading and event
 * title silently falls back to a system font. That is invisible to a screenshot in a
 * container that happens to have Hebrew coverage, and it is what made the first render of
 * the PDF template produce a document whose Hebrew could not be extracted at all.
 */
export const HEBREW_RANGE = 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F';
export const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, ' +
  'U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

/**
 * Deliberately excludes the ranges the app faces already answer — U+2000-206F (which carries
 * the bidi isolates `ltrIsolate` writes) and U+25CC (Assistant's dotted circle) — so the only
 * codepoints that reach an emoji face are ones nothing else can draw.
 */
export const EMOJI_RANGE =
  'U+203C, U+2049, U+2139, U+2194-21AA, U+231A-231B, U+2328, U+23CF-23FA, U+24C2, ' +
  'U+25AA-25AB, U+25B6, U+25C0, U+25FB-25FE, U+2600-27BF, U+2934-2935, U+2B00-2B55, ' +
  'U+3030, U+303D, U+3297, U+3299, U+FE0F, U+20E3, U+1F000-1FAFF';

/** `[family, weight, woff2 filename, unicode-range]`. */
export type FontFace = readonly [string, string, string, string];

const cache = new Map<string, string>();

/**
 * Inline `@font-face` rules for one caller's faces. **Read once per face list** — the bytes
 * are ~100 KB and identical per render, and a disk read per document is a syscall on the hot
 * path for nothing.
 *
 * A missing file is not a failed render: the document still draws in the fallback stack, and
 * the callers' fixture specs assert that the files were found.
 */
export function inlineFaces(cacheKey: string, faces: readonly FontFace[]): string {
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;
  const rules: string[] = [];
  for (const [family, weight, file, range] of faces) {
    for (const dir of FONT_DIR_CANDIDATES) {
      try {
        const bytes = readFileSync(join(dir, file));
        rules.push(
          `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
            `font-display:block;unicode-range:${range};` +
            `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`,
        );
        break;
      } catch {
        // Try the next candidate.
      }
    }
  }
  const css = rules.join('');
  cache.set(cacheKey, css);
  return css;
}

/** Reset the memoized faces. Tests only — the paths never change at runtime. */
export function resetInlinedFontCache(): void {
  cache.clear();
}
