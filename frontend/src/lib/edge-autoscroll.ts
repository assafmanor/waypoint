// Edge auto-scroll during a drag (ADR-0116 §5 amendment). A drag that can only
// reach what's already on screen is a drag that can't reach the gap you're aiming
// for — the day's list is taller than the viewport, and the shelf sits at the
// bottom of it. So while the pointer is held near the top or bottom edge, the
// surrounding scroller keeps moving under it.
//
// Shared by BOTH of the builder's drags (a shelf idea onto a gap, and a soft row's
// reorder grip): the reorder drag had the same reach limit, so this is one
// mechanism rather than a second copy (CLAUDE.md rule 8).
import { useCallback, useEffect, useRef } from 'react';
import { DRAG_EDGE_SCROLL_MAX_PX, DRAG_EDGE_SCROLL_ZONE_PX } from '../constants';

/**
 * How far to scroll this frame, from the pointer's viewport position. Negative
 * scrolls up, positive down, 0 anywhere in the middle. The step ramps with how
 * deep into the edge zone the pointer is, so easing toward the edge crawls and
 * pinning against it moves at full speed — a fixed step either overshoots or
 * feels stuck.
 *
 * Pure, so the pacing is testable without layout or a live pointer.
 */
export function edgeScrollStep(
  clientY: number,
  viewportHeight: number,
  zone: number = DRAG_EDGE_SCROLL_ZONE_PX,
  max: number = DRAG_EDGE_SCROLL_MAX_PX,
): number {
  if (viewportHeight <= 0) return 0;
  // A short viewport can't hold two full zones; shrink them rather than overlap,
  // which would make the middle of the screen scroll in both directions at once.
  const edge = Math.min(zone, viewportHeight / 2);
  if (edge <= 0) return 0;
  const fromTop = clientY;
  const fromBottom = viewportHeight - clientY;
  if (fromTop < edge) return -Math.round(max * Math.min(1, (edge - fromTop) / edge));
  if (fromBottom < edge) return Math.round(max * Math.min(1, (edge - fromBottom) / edge));
  return 0;
}

/** The nearest ancestor that actually scrolls vertically — the app's scroll
 *  container is `.body`, not the window, so this walks up rather than assuming. */
function scrollableAncestor(from: HTMLElement | null): HTMLElement | null {
  for (let el = from; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll';
    if (scrolls && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

export interface EdgeAutoScroll {
  /** Begin tracking, resolving the scroller from the dragged element. */
  start: (from: HTMLElement | null) => void;
  /** Feed the pointer's viewport `clientY` on every move. */
  track: (clientY: number) => void;
  /** Stop scrolling (drop, cancel, or unmount). */
  stop: () => void;
}

export function useEdgeAutoScroll(): EdgeAutoScroll {
  const scroller = useRef<HTMLElement | null>(null);
  const y = useRef(0);
  const frame = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    scroller.current = null;
  }, []);

  const tick = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const step = edgeScrollStep(y.current, el.clientHeight);
    if (step !== 0) el.scrollTop += step;
    frame.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(
    (from: HTMLElement | null) => {
      stop();
      scroller.current = scrollableAncestor(from);
      if (scroller.current) frame.current = requestAnimationFrame(tick);
    },
    [stop, tick],
  );

  const track = useCallback((clientY: number) => {
    y.current = clientY;
  }, []);

  // A drag interrupted by an unmount (a mode switch, a day change) must not leave
  // a frame loop running against a detached element.
  useEffect(() => stop, [stop]);

  return { start, track, stop };
}
