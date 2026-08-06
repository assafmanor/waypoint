/**
 * Eat the ONE `click` a completed gesture fires, then disarm — by the click itself, or by a
 * timeout if that click never comes.
 *
 * **The timeout is not belt-and-braces, it is the half that keeps being forgotten.** A real
 * drag reliably ends in a click, so a `once` listener alone looks correct; a long-press DROP
 * does not, because that pipeline `preventDefault`s the touch stream that would have
 * synthesised one, and a two-finger pinch may end with no click at all. A stranded `once`
 * listener then swallows the user's **next genuine tap** — which presents as "the thing I
 * tapped didn't respond", e.g. a tap outside the `IconPicker` failing to close it, since that
 * panel's own dismissal is a bubble-phase `click` on `document` and this guard stops
 * propagation ahead of it.
 *
 * **It is armed by the RELEASE, never by the gesture completing**, and for a long press those
 * are not the same moment: a hold fires at `DRAG_HOLD_MS` with the finger still down, and this
 * window is `DRAG_CLICK_SWALLOW_MS` long — so arming at the drop covered a click that had not
 * happened yet and was gone by the time it did (ADR-0148's amendment).
 *
 * **And `stopPropagation` only speaks to the DOM.** Where a click also reaches a third party by
 * another road — Google's map `click`, which it dispatches to its own subscribers — the surface
 * has to refuse that stream itself while this is armed. Same arm, same disarm, same timeout;
 * `useCanvasGestures`'s `gestureTapRef` is the worked example.
 *
 * Extracted from `useCanvasGestures` when `MediaViewer`'s pinch needed exactly this — a gesture
 * that now starts anywhere on a full-screen overlay whose backdrop click is the ONE close, so a
 * stray synthesised click would dismiss the viewer the pinch was zooming (root CLAUDE.md rule 8:
 * generalize the one-off rather than adding a second beside it).
 */
import { DRAG_CLICK_SWALLOW_MS } from '../constants';

export function armClickSwallow(onDisarm?: () => void): () => void {
  const disarm = () => {
    clearTimeout(timer);
    document.removeEventListener('click', once, true);
    onDisarm?.();
  };
  const once = (e: Event) => {
    e.stopPropagation();
    disarm();
  };
  const timer = setTimeout(disarm, DRAG_CLICK_SWALLOW_MS);
  document.addEventListener('click', once, true);
  return disarm;
}
