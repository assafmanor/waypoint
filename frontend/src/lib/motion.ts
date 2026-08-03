/** Motion helpers shared by everything that has to time an animation from JS.
 *
 *  `readDurationMs` started as a private function in `App.tsx` serving the mode
 *  switch's disarm timer. G1's overlay exit and G2's route transition need the same
 *  read, so it was generalized here rather than copied a second time (ADR-0096) —
 *  and `motionDurationMs` is the one that should almost always be called, because a
 *  raw duration is a bug waiting to happen under reduced motion. */

/** True when the user (or a headless/test env without matchMedia) wants reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/** Read a CSS duration token (e.g. `--t-cinematic`) off `:root` as milliseconds, so
 *  a JS timer follows `tokens.css` instead of duplicating its values. Falls back to
 *  `--t-base`, then a literal, if the token is missing or unparseable. */
export function readDurationMs(token: string): number {
  if (typeof window === 'undefined') return FALLBACK_MS;
  const root = document.documentElement;
  const read = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  const raw = read(token) || read('--t-base');
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return FALLBACK_MS;
  return raw.endsWith('ms') ? n : n * 1000; // tokens are ms, but tolerate `s`
}

const FALLBACK_MS = 400;

/** The duration a timer should actually wait for before treating an animation as
 *  finished: the token's value, or **0** when no animation will play.
 *
 *  This is the correctness case, not a courtesy (ADR-0140). Whatever state exists
 *  only *during* an animation — the overlay exit's `is-closing`, a route
 *  transition's direction — has to resolve when there is no animation, or it
 *  outlives its own reason. A dismissed sheet that waits out a 140ms animation
 *  nobody is playing is a sheet still covering the screen and still holding focus.
 *
 *  Two ways there is no animation, and both must return 0:
 *
 *  - **Reduced motion.** `App.css` kills every `animation`/`transition` with
 *    `!important`, so reading the same condition here is what makes the CSS and the
 *    timer impossible to disagree.
 *  - **The token cannot be read at all** — `tokens.css` absent. `readDurationMs`
 *    answers 400 there, which is right for its own caller (the mode switch wants a
 *    sane duration for a transition that may still be running) and wrong for this
 *    one: not knowing a duration means not knowing an animation is running, and
 *    guessing 400ms of held-open overlay is strictly worse than closing now. It is
 *    also what every jsdom test sees, which is why they can assert a close
 *    synchronously without stubbing a clock. */
/** How far an element's centre sits from the viewport's, in px, clamped.
 *
 *  The one measurement an overlay needs in order to appear to grow out of the thing
 *  that was tapped. It is expressed as an OFFSET rather than as a percentage because a
 *  centred overlay's card centre *is* the viewport centre, so the caller needs no
 *  second measurement of the card — which matters, since the card has not been laid
 *  out yet at the moment the row is tapped. Feed it to
 *  `transform-origin: 50% calc(50% + var(--…))`.
 *
 *  Answers `null` when there is nothing to measure, and that is a real case rather than
 *  a failure: a document opened from a note deep link (`?doc=`) has no row it came
 *  from, so the overlay is summoned at its centre instead.
 *
 *  Clamped because an origin far outside the card turns a scale into a slide across the
 *  screen; the cap keeps the effect a growth from roughly the right place. */
export function overlayOriginOffset(el: Element | null | undefined): number | null {
  if (!el || typeof window === 'undefined') return null;
  const rect = el.getBoundingClientRect();
  // jsdom reports every rect as zero, which would read as "dead centre" — a lie the
  // unit suite cannot see through. Treat an unmeasurable element as absent.
  if (rect.height === 0 && rect.width === 0) return null;
  const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
  const cap = window.innerHeight * ORIGIN_CLAMP;
  return Math.round(Math.max(-cap, Math.min(cap, offset)));
}

const ORIGIN_CLAMP = 0.42;

/** An element's viewport box. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * An element's box, or **`null` when it cannot be trusted** — the guard is the whole
 * reason this exists rather than a `getBoundingClientRect` at the call site.
 *
 * jsdom reports every rect as zero, so anything measured there reads as a 0×0 box at
 * the origin: a flight would start from the top-left corner at no size, and no unit
 * test could see it (`frontend/CLAUDE.md` records three landing bugs of exactly this
 * family). Both callers that already measure learned to check — `overlayOriginOffset`
 * just above, and the trip handoff's `beginTripHandoff`, which refuses to fly a glyph
 * it cannot measure. This is that check, named once instead of a third time (rule 8).
 *
 * **Zero on either axis disqualifies the box**, which is stricter than
 * `overlayOriginOffset`'s "zero on both". For an offset a flat element still has a
 * meaningful centre; for a box flight a zero-height end is not a smaller flight, it is
 * an interpolation to a collapse.
 */
export function measuredBox(el: Element | null | undefined): Box | null {
  if (!el || typeof window === 'undefined') return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * A raw token value off `:root`, for the motion channels JS cannot compute — in
 * practice the easing curves, which a Web Animations call has to pass as a string.
 *
 * Answers `''` when unreadable, and a caller should hand that to WAAPI as `undefined`
 * (its own default) rather than treat it as an error. That path is nearly unreachable
 * by construction: an unreadable `tokens.css` also makes `motionDurationMs` answer 0,
 * and nothing animates at all.
 */
export function readMotionToken(token: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

export function motionDurationMs(token: string): number {
  if (prefersReducedMotion() || typeof window === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith('ms') ? n : n * 1000;
}
