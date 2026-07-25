// Edge auto-scroll during a drag (ADR-0116 §5 amendment). A drag that can only
// reach what's already on screen is a drag that can't reach the gap you're aiming
// for — the day's list is taller than the viewport, and the shelf sits at the
// bottom of it. So while the pointer is held near the top or bottom edge, the
// surrounding scroller keeps moving under it — but only once the drag has ASKED for
// that edge, never merely because it was lifted there (`gateEdgeStep`).
//
// Shared by BOTH of the builder's drags (a shelf idea onto a gap, and a soft row's
// reorder grip): the reorder drag had the same reach limit, so this is one
// mechanism rather than a second copy (CLAUDE.md rule 8).
import { useCallback, useEffect, useRef } from 'react';
import {
  DRAG_EDGE_SCROLL_MAX_PX,
  DRAG_EDGE_SCROLL_RELEASE_PX,
  DRAG_EDGE_SCROLL_ZONE_PX,
  DRAG_SCROLLER_MIN_OVERFLOW_PX,
} from '../constants';

/**
 * How far to scroll this frame, from the pointer's position INSIDE the scroller's
 * box (`clientY - scrollerTop`) and that box's height — not the viewport's. Negative
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

/** Which edge band a step is pulling toward, or `null` from the middle. The bands
 *  never overlap (`edgeScrollStep` shrinks them on a short viewport), so a pointer
 *  is in at most one of them and a single value describes it. */
export type EdgeDirection = 'up' | 'down' | null;

export function edgeDirection(step: number): EdgeDirection {
  if (step < 0) return 'up';
  if (step > 0) return 'down';
  return null;
}

/** The band a drag was LIFTED in, with the position (inside the scroller's box) it
 *  was lifted at — the reference the release is measured from. `null` for a drag
 *  that began clear of both bands, which is gated by nothing. */
export type EdgeLatch = { dir: 'up' | 'down'; from: number } | null;

export function edgeLatchAt(step: number, y: number): EdgeLatch {
  const dir = edgeDirection(step);
  return dir ? { dir, from: y } : null;
}

/**
 * A drag that ARMS inside an edge band must not scroll on its own. The shelf sits
 * at the bottom of the list and the header at the top, so a card or a row picked up
 * near either end is already deep in a band, and the page ran away under a finger
 * that had not moved yet: you pressed, held, and the list took off.
 *
 * So the band the drag started in is latched off — but only until the drag says it
 * wants it, which it can say two ways:
 *
 * - **leaving the band**, after which it behaves like any other; or
 * - **pushing deeper into it** than the point it was lifted at. Holding a card still
 *   at the bottom of the shelf and dragging it further down are the same *position*
 *   and opposite *intentions*, and only the movement since the lift tells them apart.
 *   Without this, an edge you started near was an edge you could not scroll toward
 *   without first walking `DRAG_EDGE_SCROLL_ZONE_PX` away from it and back.
 *
 * The opposite band is never latched: moving toward it is a deliberate reach for
 * something off-screen from the first pixel, which is what the auto-scroll is for.
 *
 * Returns the step to apply and the latch as it stands after this frame.
 */
export function gateEdgeStep(
  step: number,
  y: number,
  latch: EdgeLatch,
  release: number = DRAG_EDGE_SCROLL_RELEASE_PX,
): { step: number; latch: EdgeLatch } {
  if (!latch || edgeDirection(step) !== latch.dir) return { step, latch: null };
  const toward = latch.dir === 'down' ? y - latch.from : latch.from - y;
  return toward >= release ? { step, latch: null } : { step: 0, latch };
}

/** The nearest ancestor that actually scrolls vertically — the app's scroll
 *  container is `.body`, not the window, so this walks up rather than assuming.
 *
 *  The overflow threshold is load-bearing, not defensive: a horizontally-scrolling
 *  strip (`.shelf { overflow-x: auto }`) reports `overflowY: auto` too, because CSS
 *  makes the other axis compute to `auto` when one axis is not `visible`. Such a
 *  strip is usually a pixel or two taller than its box, so a bare
 *  `scrollHeight > clientHeight` test picks the STRIP as the scroller and the drag
 *  ends up nudging it instead of scrolling the page. */
export function nearestScroller(from: HTMLElement | null): HTMLElement | null {
  for (let el = from; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll';
    if (scrolls && el.scrollHeight - el.clientHeight > DRAG_SCROLLER_MIN_OVERFLOW_PX) return el;
  }
  return null;
}

export interface DragPoint {
  clientX: number;
  clientY: number;
}

export interface EdgeAutoScroll {
  /** Begin tracking, resolving the scroller from the dragged element. `at` is where
   *  the drag was lifted: it seeds the tracked position (the loop runs before the
   *  first move arrives, and an unseeded origin reads as "pinned to the top edge")
   *  and decides which band, if any, starts out latched off. `onFrame`
   *  fires after every frame that actually scrolled, with the pointer's last known
   *  position: content moved under a stationary finger, so whatever the drag is
   *  hovering has changed and its hit-test has to run again. Without it, holding at
   *  the edge scrolls a gap into view that never lights up and can't be dropped on. */
  start: (from: HTMLElement | null, at: DragPoint, onFrame?: (point: DragPoint) => void) => void;
  /** Feed the pointer's viewport position on every move. */
  track: (point: DragPoint) => void;
  /** Stop scrolling (drop, cancel, or unmount). */
  stop: () => void;
}

export function useEdgeAutoScroll(): EdgeAutoScroll {
  const scroller = useRef<HTMLElement | null>(null);
  const point = useRef<DragPoint>({ clientX: 0, clientY: 0 });
  const onFrame = useRef<((p: DragPoint) => void) | null>(null);
  const frame = useRef<number | null>(null);
  const latch = useRef<EdgeLatch>(null);

  const stop = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    scroller.current = null;
    onFrame.current = null;
    latch.current = null;
  }, []);

  const tick = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // The edge bands belong to the SCROLLER's box, not the viewport's: `.body` starts
    // below the app header, so feeding a raw viewport `clientY` against the
    // scroller's height offsets both bands by the header's height — a finger resting
    // in the middle of the list reads as "past the bottom edge" and the list runs
    // away under it (e2e/shelf-drag.spec.ts pins this).
    const box = el.getBoundingClientRect();
    // Gated, so the band the drag was lifted in stays quiet until the drag asks for it
    // — by leaving it, or by pushing further toward that edge than it was lifted at.
    const y = point.current.clientY - box.top;
    const { step, latch: next } = gateEdgeStep(edgeScrollStep(y, box.height), y, latch.current);
    latch.current = next;
    if (step !== 0) {
      const before = el.scrollTop;
      el.scrollTop += step;
      // Only when it really moved: at the top or bottom of the scroller the step is
      // still non-zero but nothing changes, and re-running the hit-test then would
      // be pure churn.
      if (el.scrollTop !== before) onFrame.current?.(point.current);
    }
    frame.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(
    (from: HTMLElement | null, at: DragPoint, frameCallback?: (p: DragPoint) => void) => {
      stop();
      const el = nearestScroller(from);
      scroller.current = el;
      onFrame.current = frameCallback ?? null;
      // Seeded from the lift point rather than left at the previous drag's last
      // position (or, on the first drag, at 0,0 — which reads as pinned against the
      // top edge, so every drag began by yanking the list upward).
      point.current = at;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const y = at.clientY - box.top;
      latch.current = edgeLatchAt(edgeScrollStep(y, box.height), y);
      frame.current = requestAnimationFrame(tick);
    },
    [stop, tick],
  );

  const track = useCallback((next: DragPoint) => {
    point.current = next;
  }, []);

  // A drag interrupted by an unmount (a mode switch, a day change) must not leave
  // a frame loop running against a detached element.
  useEffect(() => stop, [stop]);

  return { start, track, stop };
}
