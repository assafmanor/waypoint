// The sheet handle's vertical drag (ADR-0121 §5).
//
// **Why this is not the shelf's drag mechanism.** ADR-0121 §5 asked the build to
// check whether `useHoldToDrag`'s pointer machinery extracts cleanly into a
// shared hook before writing a new one (CLAUDE.md rule 8). It does not, and the
// reason is written into that hook: the shelf's drag deliberately avoids pointer
// capture and listens on the WINDOW, because its dragged element can legitimately
// unmount mid-gesture (dwelling on the day strip switches the day under you,
// ADR-0116 session-119) — and it is HOLD-GATED, because a shelf card is
// simultaneously a tap target and a piece of a scrolling strip, so time has to
// arbitrate between scroll and drag. Neither applies here: a drag handle exists to
// be dragged (nothing to arbitrate, so no hold), it scrolls nothing, and it stays
// mounted for the whole gesture. Extracting the shelf's window-listener +
// hold-timer + click-swallow apparatus would mean a substantial refactor of that
// drag to serve a gesture that wants none of it, so this is the small dedicated
// hook §5's escape hatch calls for.
//
// Pointer capture IS right here, and it is the whole gesture: it routes every
// move to the handle even when the finger leaves it, so a fast drag over the map
// doesn't hand the pointer to the canvas.
import { useCallback, useRef } from 'react';

export interface SnapDragOptions {
  /** The sheet's height right now, in px — where this drag starts from. */
  heightPx: () => number;
  /** Live height during the drag. The caller renders it; nothing is committed. */
  onDrag: (px: number) => void;
  /** Released: the caller snaps to the nearest stop and drops the live height. */
  onRelease: (px: number) => void;
}

/** Props to spread on the handle. It needs `touch-action: none` in CSS, or the
 *  browser claims the vertical pan before the first `pointermove` arrives. */
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
    // the handle mid-drag must not restart the gesture from a new origin.
    if (e.button !== 0) return;
    const handle = e.currentTarget as HTMLElement;
    const startY = e.clientY;
    const startHeight = latest.current.heightPx();
    let moved = false;

    // Dragging UP grows the sheet: it is anchored at the bottom, so the height is
    // the distance from the finger to that edge.
    const heightAt = (clientY: number) => startHeight - (clientY - startY);

    const move = (ev: PointerEvent) => {
      moved = true;
      latest.current.onDrag(heightAt(ev.clientY));
    };
    const end = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      // A press with no movement is a tap, not a drag — releasing must not snap
      // the sheet to whichever stop happens to be nearest its current height.
      if (moved) latest.current.onRelease(heightAt(ev.clientY));
    };

    handle.setPointerCapture?.(e.pointerId);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }, []);

  return { onPointerDown };
}
