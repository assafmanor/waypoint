// The camera's arithmetic, as pure functions (ADR-0121 §7 + §13). "Where should
// the map be looking" is decided here, with no Google present; `useMapCamera`
// only applies the answer.
//
// The rule is ADR-0120's on a canvas: **every list change moves**, so every
// control that changes the pin set moves the camera — a chip that silently
// leaves half its results off-screen is the jump session 130 removed from the
// list. And its two guards: zoom follows the set's EXTENT (three pins on one
// block and three across a country want completely different zoom, which is why
// "how many pins" is the wrong question), and the camera does not move when it
// owes you nothing.
//
// Longitudes are compared plainly, so a set straddling the antimeridian fits the
// long way round. Deliberate: it takes a trip spanning ±180° to notice, and the
// guard would cost every other case a special case (ADR-0121 §14's spirit).

export interface LatLng {
  lat: number;
  lng: number;
}

/** A viewport / extent, in the same shape `google.maps.LatLngBoundsLiteral` uses,
 *  so the hook hands it straight to `fitBounds` with no adapter. */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** The extent of a set of points, or `null` for an empty one — "no pins → leave
 *  the camera alone; the empty state speaks" (ADR-0121 §7). */
export function boundsOfPoints(points: readonly LatLng[]): MapBounds | null {
  if (points.length === 0) return null;
  let { lat: north, lng: east } = points[0];
  let south = north;
  let west = east;
  for (const { lat, lng } of points) {
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  }
  return { north, south, east, west };
}

export function pointInBounds(bounds: MapBounds, point: LatLng): boolean {
  return (
    point.lat <= bounds.north &&
    point.lat >= bounds.south &&
    point.lng <= bounds.east &&
    point.lng >= bounds.west
  );
}

/** How many of these points are on the canvas — the `באזור` readout (ADR-0121
 *  §9). It counts every pin in view, ghosts included: this is a **spatial**
 *  readout, not a facet count, and "how many of our places are around here" is
 *  exactly what the ghost tier is for. */
export function countPointsInBounds(points: readonly LatLng[], bounds: MapBounds | null): number {
  if (!bounds) return 0;
  return points.reduce((n, point) => (pointInBounds(bounds, point) ? n + 1 : n), 0);
}

/** Is `inner` wholly inside `outer`? The containment check behind "re-fit only
 *  when the new set does not already fit the current view" — which is what
 *  removes the "tap `אוכל`, map lurches across the city" case while keeping the
 *  promise that a chip never leaves results off-canvas. */
export function boundsContain(outer: MapBounds, inner: MapBounds): boolean {
  return (
    inner.north <= outer.north &&
    inner.south >= outer.south &&
    inner.east <= outer.east &&
    inner.west >= outer.west
  );
}

/**
 * What the camera should do about a pin set (ADR-0121 §7's table):
 *
 * | Set                          | Decision                                            |
 * | ---------------------------- | --------------------------------------------------- |
 * | No pins                      | `none` — the empty state speaks                     |
 * | Already inside the view      | `none` — moving would be gratuitous                 |
 * | One pin, or all coincident   | `centre` — never `fitBounds` a zero-area extent, or |
 * |                              | it snaps to building-level zoom                     |
 * | Anything else                | `fit` — including a multi-city trip: that IS the    |
 * |                              | extent, and legibility there is §6's dot tier       |
 *
 * Near-coincident (but not identical) pins are left to `fit` — the caller's
 * shared `maxZoom` cap covers them and the single-point case both, rather than a
 * second special case here.
 */
export type CameraTarget =
  { kind: 'none' } | { kind: 'centre'; at: LatLng } | { kind: 'fit'; bounds: MapBounds };

/** Padding for a fit, dropped when the viewport cannot hold it.
 *
 *  `fitBounds` with padding that eats most of the map div produces a degenerate
 *  viewport and zooms far **out** — the "why is the whole world on screen" failure,
 *  and it is worst exactly when it is hardest to see: a div measured before layout
 *  settles is 0×0, where any padding at all is too much. Returning `undefined` (no
 *  padding) costs the topmost pin's tag a few pixels; the alternative costs the
 *  whole framing.
 *
 *  `null` means "don't fit at all yet" — an unsized div has no honest answer, so the
 *  caller waits rather than fitting into nothing. */
export function fitPaddingFor(
  viewport: { width: number; height: number },
  padding: { top: number; right: number; bottom: number; left: number },
): typeof padding | undefined | null {
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  const fits =
    padding.left + padding.right < viewport.width * MAX_PADDING_SHARE &&
    padding.top + padding.bottom < viewport.height * MAX_PADDING_SHARE;
  return fits ? padding : undefined;
}
/** Padding may claim at most this share of either axis before it is dropped. */
const MAX_PADDING_SHARE = 0.5;

export function cameraTargetFor(points: readonly LatLng[], view: MapBounds | null): CameraTarget {
  const bounds = boundsOfPoints(points);
  if (!bounds) return { kind: 'none' };
  if (view && boundsContain(view, bounds)) return { kind: 'none' };
  if (bounds.north === bounds.south && bounds.east === bounds.west) {
    return { kind: 'centre', at: { lat: bounds.north, lng: bounds.east } };
  }
  return { kind: 'fit', bounds };
}
