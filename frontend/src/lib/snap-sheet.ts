// Snap-height arithmetic for a draggable in-pane sheet (ADR-0121 §5, its logic
// half; the third stop variant and the velocity term are ADR-0122 §3/§4). Generic
// on purpose — the stops are the caller's, and nothing here knows about maps — so
// it sits beside the `ui/primitives/SnapSheet` it serves and is unit-tested without
// a DOM.
import { SNAP_FLICK_PX_PER_MS } from '../constants';

/** A stop on the height axis:
 *
 *  - `px` — a fixed height, for a stop made of fixed chrome (the sheet's own top
 *    row), which should be the same size on every screen;
 *  - `fraction` — a proportion of the container (a half), which should not;
 *  - `inset` — the container MINUS a fixed height, which is how "a sheet that must
 *    not cover the thing above it" is expressible at all (ADR-0122 §3): the Map's
 *    full height stops below the controls row floating over its canvas, and the
 *    clamp then keeps a drag from pulling the sheet over that row for free. */
export type SnapStop = { px: number } | { fraction: number } | { inset: number };

export function stopHeightPx(stop: SnapStop, containerPx: number): number {
  if ('px' in stop) return Math.min(stop.px, containerPx);
  if ('inset' in stop) return Math.max(containerPx - stop.inset, 0);
  return stop.fraction * containerPx;
}

/** The same stop as a CSS length, so the resting height is set declaratively and
 *  the browser animates it — one source of truth for the height, and no layout
 *  measurement on a screen that re-renders every second. */
export function stopHeightCss(stop: SnapStop): string {
  if ('px' in stop) return `${stop.px}px`;
  if ('inset' in stop) return `calc(100% - ${stop.inset}px)`;
  // Rounded, because `0.56 * 100` is `56.00000000000001` in binary floating point
  // and a percentage that long is noise in the DOM.
  return `${Number((stop.fraction * 100).toFixed(PERCENT_PRECISION))}%`;
}
const PERCENT_PRECISION = 4;

/** Keep a dragged height inside the outermost stops, so the gesture can neither
 *  shrink the sheet past its lowest stop nor pull it above the container. */
export function clampToStops<T extends string>(
  heightPx: number,
  containerPx: number,
  stops: Record<T, SnapStop>,
  order: readonly T[],
): number {
  const heights = order.map((id) => stopHeightPx(stops[id], containerPx));
  return Math.min(Math.max(heightPx, Math.min(...heights)), Math.max(...heights));
}

/**
 * The stop a released drag lands on.
 *
 * Below the flick threshold it is the NEAREST one by distance, ties going to the
 * earlier entry in `order` — exactly as it always was, and what makes a slow drag
 * that barely moves stay where it was.
 *
 * At or above `SNAP_FLICK_PX_PER_MS` it is the first stop strictly beyond the release
 * height **in the direction of travel**, clamped at the extremes. Distance alone made
 * a real flick that travels little snap back to where it started, which is most of
 * what "moving between the sheet's heights is unpleasant" meant (ADR-0122 §4).
 *
 * `velocityPxPerMs` is signed in the sheet's own axis: positive GROWS it (the finger
 * went up, since the sheet is anchored at the bottom). Omitted — or zero, which is a
 * press with no movement — nothing about the old behaviour changes.
 */
export function nearestStop<T extends string>(
  heightPx: number,
  containerPx: number,
  stops: Record<T, SnapStop>,
  order: readonly T[],
  velocityPxPerMs = 0,
): T {
  if (Math.abs(velocityPxPerMs) >= SNAP_FLICK_PX_PER_MS) {
    const ranked = order
      .map((id) => ({ id, px: stopHeightPx(stops[id], containerPx) }))
      .sort((a, b) => a.px - b.px);
    const up = velocityPxPerMs > 0;
    // The epsilon keeps a flick released exactly ON a stop from counting that stop as
    // "beyond" itself, which would make a fast gesture that lands on a boundary a no-op.
    const beyond = up
      ? ranked.find((s) => s.px > heightPx + STOP_EPSILON_PX)
      : [...ranked].reverse().find((s) => s.px < heightPx - STOP_EPSILON_PX);
    if (beyond) return beyond.id;
    return up ? ranked[ranked.length - 1].id : ranked[0].id;
  }
  let best = order[0];
  let bestGap = Infinity;
  for (const id of order) {
    const gap = Math.abs(stopHeightPx(stops[id], containerPx) - heightPx);
    if (gap < bestGap) {
      bestGap = gap;
      best = id;
    }
  }
  return best;
}
const STOP_EPSILON_PX = 1;
