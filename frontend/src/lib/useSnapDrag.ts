// The sheet's vertical drag (ADR-0121 §5, widened to a region by ADR-0122 §4).
//
// **Why this is not the shelf's drag mechanism.** ADR-0121 §5 asked the build to
// check whether `useHoldToDrag`'s pointer machinery extracts cleanly into a
// shared hook before writing a new one (CLAUDE.md rule 8). It does not, and the
// reason is written into that hook: the shelf's drag is HOLD-GATED, because a shelf
// card is simultaneously a tap target and a piece of a scrolling strip, so time has
// to arbitrate between scroll and drag; and it deliberately avoids pointer capture,
// because its dragged element can legitimately unmount mid-gesture (dwelling on the
// day strip switches the day under you, ADR-0116 session-119). Neither applies here:
// this region exists to be dragged (nothing to arbitrate, so no hold), it scrolls
// nothing, and it stays mounted for the whole gesture. ADR-0122 §4 re-read this and
// let entry 5 of ADR-0121's build log stand: the window listeners below are now a
// PARTIAL convergence with that hook, and still not an extraction.
//
// Three mechanisms that only matter once the target is a region rather than a bare
// 76×16px handle — all three are the decision, not tuning (ADR-0122 §4):
//
//   1. **A movement slop threshold.** A finger emits `pointermove` on a tap, so a
//      region that flips `moved` on the first move swallows the taps of every control
//      inside it — and the widened region now contains the view toggle and the sort
//      chip. Below `SNAP_DRAG_SLOP_PX` the gesture is a tap and the click passes
//      through; above it, it is a drag and the click that follows is suppressed.
//   2. **Pointer capture at DRAG START, never at `pointerdown`.** Capture is still
//      the reason this hook has it — it routes every move here even when the finger
//      leaves the region, so a fast drag over the map does not hand the pointer to
//      the greedy canvas. But with capture active the following `click` is
//      **retargeted to the capturing element**, so capturing early kills every tap
//      inside the region. Harmless while the target was a bare handle with nothing to
//      click; fatal now.
//   3. **The move listeners sit on the `window`.** The region is ~51px tall and the
//      gesture travels hundreds of px: two frames in, the pointer is outside it, and
//      `pointermove` then bubbles from whatever is under the finger instead.
//
// And a fourth, for a target that is ALSO a scroller (ADR-0122 §4's 2026-09-15
// amendment): **the gesture is claimed at the slop, and on touch the claim is a
// `preventDefault` on the `touchmove`**, which is what stops the browser starting the
// pan it would otherwise take at its own ~8px slop. `touch-action: none` cannot do this
// job — it is evaluated when the gesture starts, before the direction that decides it
// exists — and `useSwipePager` measured the `preventDefault` route for the day surface
// (ADR-0200 §9), so this is the same mechanism a second time rather than a new one.
// A region with no scroll to compete with passes no `claim` and nothing here changes.
import { useCallback, useRef } from 'react';
import { SNAP_DRAG_SLOP_PX } from '../constants';

export interface SnapDragOptions {
  /** The sheet's height right now, in px — where this drag starts from. */
  heightPx: () => number;
  /** Live height during the drag. The caller renders it; nothing is committed. */
  onDrag: (px: number) => void;
  /**
   * Released: the caller snaps to a stop and drops the live height.
   *
   * `velocityPxPerMs` is signed in the sheet's own axis (positive grows it) and is
   * sampled from the **last two** moves, not the whole gesture — a flick is how the
   * finger was moving when it left, not how it averaged.
   */
  onRelease: (px: number, velocityPxPerMs: number) => void;
  /**
   * **Is this gesture ours?** — asked ONCE, at the first move past the slop, with the
   * finger's travel so far (`dy < 0` is a finger moving up, which grows the sheet).
   * `false` stands the hook down for the rest of the gesture: nothing is captured,
   * nothing is prevented, and whatever is under the finger (a list's own scroll) keeps
   * it. Omitted, every gesture past the slop is ours.
   */
  claim?: (travel: { dx: number; dy: number }) => boolean;
}

/** Props to spread on the drag REGION (the sheet's whole top row, not the grab
 *  line — 76×16px is under ADR-0017's touch floor). A region that never scrolls
 *  wants `touch-action: none` in CSS too, so a pan the browser might take on some
 *  ancestor is never in question; a region that DOES scroll leaves it off and lets
 *  `claim` decide, per gesture, whose the pan is. */
export interface SnapDragProps {
  onPointerDown: (e: React.PointerEvent) => void;
}

export function useSnapDrag({
  heightPx,
  onDrag,
  onRelease,
  claim,
}: SnapDragOptions): SnapDragProps {
  // Latest-ref, so a re-render mid-drag (this screen re-renders every second on
  // the clock) can't leave the listeners closed over a stale height or callback.
  const latest = useRef({ heightPx, onDrag, onRelease, claim });
  latest.current = { heightPx, onDrag, onRelease, claim };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only the primary button/finger: a right-click or a second finger landing on
    // the region mid-drag must not restart the gesture from a new origin.
    if (e.button !== 0) return;
    const region = e.currentTarget as HTMLElement;
    // The press's own id, so capture names the real pointer whichever event decides —
    // a `touchmove` carries none, and a guessed one throws `NotFoundError`.
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startHeight = latest.current.heightPx();
    let dragging = false;
    // Stood down: `claim` said no, or the gesture ended. Nothing below acts again.
    let done = false;
    // Two samples, so the release reads the finger's speed as it left rather than
    // the gesture's average. Seeded with the press, which makes a single-move
    // gesture measurable instead of a division by zero.
    let last = { y: e.clientY, t: e.timeStamp };
    let prev = last;

    // Dragging UP grows the sheet: it is anchored at the bottom, so the height is
    // the distance from the finger to that edge.
    const heightAt = (clientY: number) => startHeight - (clientY - startY);

    const unbind = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };

    /** The one decision, taken by whichever event crosses the slop first — the
     *  `pointermove` (a mouse only ever has that one) or the `touchmove` that a finger's
     *  move also dispatches. Idempotent, so the second arrival changes nothing. */
    const decide = (clientX: number, clientY: number) => {
      if (dragging || done) return;
      // Below the slop this is still a tap, and whatever is under the finger keeps it.
      if (Math.abs(clientY - startY) < SNAP_DRAG_SLOP_PX) return;
      const ours = latest.current.claim?.({ dx: clientX - startX, dy: clientY - startY }) ?? true;
      if (!ours) {
        done = true;
        unbind();
        return;
      }
      region.setPointerCapture?.(pointerId);
      dragging = true;
    };

    const move = (ev: PointerEvent) => {
      decide(ev.clientX, ev.clientY);
      if (!dragging) return;
      prev = last;
      last = { y: ev.clientY, t: ev.timeStamp };
      latest.current.onDrag(heightAt(ev.clientY));
    };
    /** **The touch half of the claim.** Once the gesture is ours every `touchmove` is
     *  prevented, so the browser never starts the pan — and only once it is ours: the
     *  spec makes a prevented FIRST `touchmove` forfeit the whole touch's scrolling, so
     *  preventing a move still under the slop would take the list's scroll away from a
     *  gesture `claim` was about to hand it. `cancelable` is false once a scroll is
     *  already under way, and preventing then is a console warning and nothing else. */
    const touchMove = (ev: TouchEvent) => {
      if (done || ev.touches.length !== 1) return;
      const touch = ev.touches[0];
      decide(touch.clientX, touch.clientY);
      if (dragging && ev.cancelable) ev.preventDefault();
    };
    const end = (ev: PointerEvent) => {
      unbind();
      done = true;
      // A press that never passed the slop is a tap, not a drag — releasing must not
      // snap the sheet to whichever stop happens to be nearest its current height.
      if (!dragging) return;
      // A real drag ends in a `click` retargeted to the capturing element. The region
      // holds controls, so that click has to be swallowed rather than treated as a tap
      // on one of them. Only on a release: a cancelled gesture dispatches no click, and
      // a listener left armed for one would swallow the next genuine tap.
      if (ev.type === 'pointerup') {
        region.addEventListener('click', swallow, { capture: true, once: true });
      }
      const dt = Math.max(last.t - prev.t, 1);
      latest.current.onRelease(heightAt(ev.clientY), (prev.y - last.y) / dt);
    };

    window.addEventListener('pointermove', move);
    // Non-passive, because its whole job is `preventDefault`.
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  return { onPointerDown };
}

const swallow = (e: Event) => e.stopPropagation();
