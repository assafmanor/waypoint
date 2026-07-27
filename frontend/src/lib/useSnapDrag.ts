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
}

/** Props to spread on the drag REGION (the sheet's whole top row, not the grab
 *  line — 76×16px is under ADR-0017's touch floor). It needs `touch-action: none`
 *  in CSS, or the browser claims the vertical pan before the first `pointermove`
 *  arrives. */
export interface SnapDragProps {
  onPointerDown: (e: React.PointerEvent) => void;
}

export function useSnapDrag({ heightPx, onDrag, onRelease }: SnapDragOptions): SnapDragProps {
  // Latest-ref, so a re-render mid-drag (this screen re-renders every second on
  // the clock) can't leave the listeners closed over a stale height or callback.
  const latest = useRef({ heightPx, onDrag, onRelease });
  latest.current = { heightPx, onDrag, onRelease };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only the primary button/finger: a right-click or a second finger landing on
    // the region mid-drag must not restart the gesture from a new origin.
    if (e.button !== 0) return;
    const region = e.currentTarget as HTMLElement;
    const startY = e.clientY;
    const startHeight = latest.current.heightPx();
    let dragging = false;
    // Two samples, so the release reads the finger's speed as it left rather than
    // the gesture's average. Seeded with the press, which makes a single-move
    // gesture measurable instead of a division by zero.
    let last = { y: e.clientY, t: e.timeStamp };
    let prev = last;

    // Dragging UP grows the sheet: it is anchored at the bottom, so the height is
    // the distance from the finger to that edge.
    const heightAt = (clientY: number) => startHeight - (clientY - startY);

    const move = (ev: PointerEvent) => {
      // Below the slop this is still a tap, and whatever is under the finger keeps it.
      if (!dragging && Math.abs(ev.clientY - startY) < SNAP_DRAG_SLOP_PX) return;
      if (!dragging) {
        region.setPointerCapture?.(ev.pointerId);
        dragging = true;
      }
      prev = last;
      last = { y: ev.clientY, t: ev.timeStamp };
      latest.current.onDrag(heightAt(ev.clientY));
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
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
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  return { onPointerDown };
}

const swallow = (e: Event) => e.stopPropagation();
