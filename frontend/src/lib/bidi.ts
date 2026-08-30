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

/** The two scripts `baseDirection` weighs. Letters only — digits and punctuation are
 *  bidi-neutral and belong to whichever run surrounds them, so counting them would let a
 *  price list decide a note's direction. */
const HEBREW_LETTERS = /[\u0590-\u05FF]/g;
const LATIN_LETTERS = /[A-Za-z\u00C0-\u024F]/g;

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

// FIRST STRONG ISOLATE. Same containment as `ltrIsolate`, but the run decides its OWN
// direction from its first strong character instead of being forced left-to-right.
const FIRST_STRONG_ISOLATE = '\u2068';

/**
 * **A value the app did not write, placed inside a line the app composed.**
 *
 * The distinction from `ltrIsolate` is what the run IS, not where it sits: a time, a code or
 * a signed number is Latin by construction and takes `ltrIsolate`; a place name, an event
 * title or a person's name arrives in whatever script the world gave it, so forcing it LTR
 * would lay a Hebrew one out backwards. First-strong asks the run itself.
 *
 * Reach for it whenever a line joins several such values with punctuation — `A · B`, or a
 * route's `from ← to`. Without it the whole line's direction is decided by whichever value
 * happens to come first, so two rows differing only in their data lay out differently and
 * the separator between them lands on the wrong side (ADR-0118; the owner's report about
 * route arrows pointing the wrong way on Latin place names).
 *
 * **A container of isolates must not carry `dir="auto"`**: `auto` skips isolated content
 * when it sniffs, finds no strong character, and falls back to LTR. Let it inherit the
 * page instead.
 */
export function autoIsolate(value: string): string {
  return `${FIRST_STRONG_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`;
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

/**
 * **The base direction of a block of STORED text, decided by what the text mostly is.**
 *
 * `dir="auto"` is the app's usual answer and it is the wrong one here, for a reason that only
 * shows on real content: `auto` resolves from the **first strong character** and nothing else.
 * A note that opens `TL;DR — מה לעשות כדי להטיס DJI Mini 5 Pro כחוק באיסלנד` has 26 Hebrew
 * letters against 14 Latin, and `auto` lays the whole thing out **left to right** because the
 * `T` of `TL;DR` came first — so every Hebrew line in it reads from the wrong end. Reported
 * against the shipped note screen (owner, 2026-08-22), and the tell was that the note's
 * TITLE was fine: it happened to start with a Hebrew word.
 *
 * So the question this answers is not "what comes first" but "what is this text", and the
 * honest measure of that is which script the letters actually belong to. Ties go to RTL: the
 * app is Hebrew-first (design-language.md), so a genuinely balanced note is a Hebrew note
 * with a lot of Latin in it.
 *
 * `undefined` means "no letters at all" — a note of digits, times or emoji. That renders no
 * `dir`, which lets it inherit the page's RTL, and it is the same thing the notes screen's own
 * row has always done (it carries no `dir` and reads correctly).
 *
 * **This is for a BLOCK of prose the app did not write.** It is not a replacement for
 * `dir="auto"` on a single value (an address, a place name) — there, one field is one run and
 * the first strong character is exactly the right signal. Nor for `ltrIsolate`, which is about
 * a run INSIDE a line rather than the line's own direction.
 */
export function baseDirection(text: string): 'rtl' | 'ltr' | undefined {
  const hebrew = text.match(HEBREW_LETTERS)?.length ?? 0;
  const latin = text.match(LATIN_LETTERS)?.length ?? 0;
  if (!hebrew && !latin) return undefined;
  return hebrew >= latin ? 'rtl' : 'ltr';
}
