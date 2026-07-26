// Snap-height arithmetic for a draggable in-pane sheet (ADR-0121 §5, its logic
// half). Generic on purpose — the stops are the caller's, and nothing here knows
// about maps — so it sits beside the `ui/primitives/SnapSheet` it serves and is
// unit-tested without a DOM.

/** A stop on the height axis: a fixed pixel height (a peek, which should be the
 *  same size on every screen) or a fraction of the container (a half, which
 *  should not). */
export type SnapStop = { px: number } | { fraction: number };

export function stopHeightPx(stop: SnapStop, containerPx: number): number {
  return 'px' in stop ? Math.min(stop.px, containerPx) : stop.fraction * containerPx;
}

/** The same stop as a CSS length, so the resting height is set declaratively and
 *  the browser animates it — one source of truth for the height, and no layout
 *  measurement on a screen that re-renders every second. */
export function stopHeightCss(stop: SnapStop): string {
  if ('px' in stop) return `${stop.px}px`;
  // Rounded, because `0.56 * 100` is `56.00000000000001` in binary floating point
  // and a percentage that long is noise in the DOM.
  return `${Number((stop.fraction * 100).toFixed(PERCENT_PRECISION))}%`;
}
const PERCENT_PRECISION = 4;

/** Keep a dragged height inside the outermost stops, so the gesture can neither
 *  shrink the sheet past its peek nor pull it above the container. */
export function clampToStops<T extends string>(
  heightPx: number,
  containerPx: number,
  stops: Record<T, SnapStop>,
  order: readonly T[],
): number {
  const heights = order.map((id) => stopHeightPx(stops[id], containerPx));
  return Math.min(Math.max(heightPx, Math.min(...heights)), Math.max(...heights));
}

/** The stop a released drag lands on: the nearest one, ties going to the earlier
 *  entry in `order`. Nearest-by-distance rather than by direction-of-travel, so a
 *  short flick that barely moves stays where it was instead of jumping a stop. */
export function nearestStop<T extends string>(
  heightPx: number,
  containerPx: number,
  stops: Record<T, SnapStop>,
  order: readonly T[],
): T {
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
