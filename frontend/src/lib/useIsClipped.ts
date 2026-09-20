// **Is this box hiding some of its own content?** One measurement, for every surface that
// bounds text and then has to offer a way to the rest of it (ADR-0235 §7).
//
// Extracted from `PlaceKnowledge`, which had it first and wrote down why it is a measurement
// rather than a count: a character count cannot know the width it is laid out at, and **a
// control offering to reveal nothing is worse than no control**. `NoteSection` is the second
// caller and would otherwise have copied the same four lines — root rule 8's own threshold.
//
// `useLayoutEffect` so the answer is in place before the first paint; a control that appears
// one frame late is a control that moves under a thumb already travelling towards the text.
//
// **jsdom reports both metrics as 0**, so it answers `false` there. That is the honest result
// for a surface with no layout — and it means the clip's consequences are proven in the e2e
// suite (`e2e/place-decide.spec.ts` already does this for the place card) rather than asserted
// in a unit test that has no box to measure.
import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * @param ref   the bounded element itself — the one carrying the `max-height`, not its parent.
 * @param deps  what could change the answer: the text, and any state that lifts the bound.
 *              The element's WIDTH is not in here and cannot be: a resize is answered by the
 *              next render, which on this app's surfaces is an orientation change or a font
 *              load rather than a drag.
 */
export function useIsClipped(ref: RefObject<HTMLElement | null>, deps: unknown[]): boolean {
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    // The `+ 1` is not superstition: a fractional line height makes `scrollHeight` exceed
    // `clientHeight` by a sub-pixel on a box that clips nothing, and without it every note
    // in the app would carry a control that reveals one rounding error.
    setClipped(!!el && el.scrollHeight > el.clientHeight + 1);
    // The dep array is the CALLER's, spread in — which is the whole point of the hook and
    // also why no exhaustive-deps rule can check it here. Each caller lists what could
    // change the answer for its own text; getting that list wrong shows up as a control
    // that does not appear, not as a crash.
  }, deps);
  return clipped;
}
