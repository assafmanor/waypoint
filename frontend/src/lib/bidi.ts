// Bidi mechanics for the Hebrew UI (design-language.md §RTL, ADR-0118). Mixing a
// number with Hebrew text has exactly two rules, and they live here because getting
// either wrong changes what a token *says*:
//
//   1. A Latin/numeric run embedded in Hebrew keeps its own left-to-right order —
//      `ltrIsolate`. A sign is the case that bites: in an RTL flow the "−" of
//      "−3" is a neutral character and lands on the wrong side of the digits.
//   2. A token that carries a Hebrew unit word belongs to the RTL flow, so the
//      number reads first — `measure`. The LTR island is the number, NEVER the
//      number together with its unit: forcing `dir="ltr"` over the whole token
//      lays it out left-to-right, so a Hebrew reader meets the unit before the
//      number ("ק״מ 9" for what should read "9 ק״מ").
//
// Both work as plain strings, which is why they're here and not a component:
// number-plus-unit copy also lands in `title`/`aria-label` attributes, where a
// nested `<span dir="…">` can't go.

// LEFT-TO-RIGHT ISOLATE / POP DIRECTIONAL ISOLATE. Isolate rather than embed
// (U+202A): the run can't reorder its neighbours and they can't reorder it, and
// `dir="auto"` skips isolated content when it sniffs a direction — so a Hebrew unit
// beside the island still decides the token's direction.
const LTR_ISOLATE = '⁦';
const POP_DIRECTIONAL_ISOLATE = '⁩';

/** Bidi control characters (isolates, embeddings, marks), for stripping a token
 *  back to its plain text. */
const BIDI_CONTROLS = /[⁦-⁩‪-‮‎‏]/g;

/**
 * A Latin/numeric run that must read left-to-right inside Hebrew text: a signed
 * number, an `H:MM`, a code. Invisible in the rendered string.
 */
export function ltrIsolate(run: string | number): string {
  return `${LTR_ISOLATE}${run}${POP_DIRECTIONAL_ISOLATE}`;
}

/**
 * A measurement token — the number as an LTR island, the Hebrew unit after it in
 * the RTL flow: `measure(9, 'ק״מ')` reads "9 ק״מ", `measure('−3', 'ש׳')` reads
 * "−3 ש׳". Every "number + Hebrew unit" string is built this way, and its element
 * never forces `dir="ltr"` (ADR-0118) — the two together are what keep the number
 * in front of its unit.
 */
export function measure(value: string | number, unit: string): string {
  return `${ltrIsolate(value)} ${unit}`;
}

/** The same text without its invisible bidi controls — for assertions and for
 *  anywhere the plain characters are what matters (comparison, clipboard). */
export function withoutBidiControls(text: string): string {
  return text.replace(BIDI_CONTROLS, '');
}
