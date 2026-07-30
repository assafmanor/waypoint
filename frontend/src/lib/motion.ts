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
export function motionDurationMs(token: string): number {
  if (prefersReducedMotion() || typeof window === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith('ms') ? n : n * 1000;
}
