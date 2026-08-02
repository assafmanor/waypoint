// "Hold the node, play the exit, THEN tell the caller" — extracted from `Modal`
// (ADR-0140 §1) when the hand-rolled anchored panels needed the same thing (ADR-0144).
//
// Three consumers now: `Modal` (every sheet/dialog/full overlay) and the two panels that
// deliberately do NOT go through it — `IconPicker` and `TimePicker` are anchored to their
// trigger inside a form, so they are popovers rather than layers over the screen, and
// `Modal` would take them out of the flow they belong in. Same exit contract, different
// shape; that is exactly what a hook is for rather than a third copy of the timer
// (rule 8).
import { useCallback, useEffect, useRef, useState } from 'react';
import { motionDurationMs } from './motion';

/** The caller's own close, wrapped so an exit animation can play first.
 *
 *  `closing` is what the CSS keys on. `beginClose` is what EVERY way out must call —
 *  a `✕`, a backdrop tap, Escape, a back — because the whole point of ADR-0103 §2's
 *  one-owner rule is that they cannot disagree, and an exit hung on only some of them
 *  is a surface that snaps shut half the time.
 *
 *  @param onClose what the owner does when the surface is really gone (usually: unmount it)
 *  @param token   the duration token the exit animation runs for
 *  @param delayToken added to `token` when the LAST channel to finish is a delayed one.
 *    A surface whose exit is staggered (the document viewer's scrim leaves after its
 *    card, so the card clears against a still-dimmed room) finishes at delay+duration,
 *    and unmounting at `duration` alone cuts the tail off — which is visible precisely
 *    because it is the background snapping back. Two tokens rather than one summed
 *    literal so reduced motion still zeroes BOTH halves.
 */
export function useExitTransition(onClose: () => void, token = '--t-quick', delayToken?: string) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const beginClose = useCallback(() => {
    // Idempotent: a second back, a backdrop tap and Escape can all land during the exit,
    // and a re-entry would restart the animation on something already leaving.
    if (timer.current !== undefined) return;
    // No animation to wait for (reduced motion, or no stylesheet) means close NOW,
    // synchronously — not on a 0ms timer. A dismissal that lands a macrotask later is a
    // frame of a surface the user already closed, and it would make every caller async
    // for no benefit. See `motionDurationMs` for why an unreadable token counts as
    // "nothing is animating".
    const wait = motionDurationMs(token) + (delayToken ? motionDurationMs(delayToken) : 0);
    if (wait === 0) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    timer.current = setTimeout(() => {
      // Reset BEFORE handing back, so the hook is reusable by a surface that persists
      // and re-opens. `Modal` unmounts on close and never needed it; the anchored panels
      // do not — without this, `closing` stayed true and the guard above made every
      // subsequent close a no-op, so a picker would open once and then never shut.
      timer.current = undefined;
      setClosing(false);
      onCloseRef.current();
    }, wait);
  }, [token, delayToken]);

  // A caller that tears the surface down for its own reasons must not be called back
  // about a close it never asked for.
  useEffect(() => () => clearTimeout(timer.current), []);

  return { closing, beginClose };
}
