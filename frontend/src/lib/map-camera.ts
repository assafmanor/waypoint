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
import {
  MAP_CONTROLS_H,
  MAP_FOCUS,
  MAP_FIT_INSET,
  MAP_FLOAT_GAP,
  MAP_PIN,
  MAP_REFIT_FILL_SHARE,
  MAP_SEARCH_CAMERA,
} from '../constants';
import { TUNE, tune } from './dev-tuning';
import { pinClearanceFor, pinHeightFor } from './map-pins';

export interface LatLng {
  lat: number;
  lng: number;
}

/** **Somewhere the camera has been asked to go, once, and how.** The two halves of
 *  ADR-0129 §1 in one value: `frame: true` is the fit — the place among its neighbours,
 *  zoom included — and `frame: false` is a pan at the zoom you are already at.
 *
 *  The intent rides IN the value rather than beside it as a second prop, because the two
 *  must change together and a pair that has to stay in step is the fragility ADR-0121 §4's
 *  memo rules exist to avoid. It is spent once, so a fresh object is what re-asks. */
export interface MapArrival {
  at: LatLng;
  frame: boolean;
}

/** A renderer-neutral viewport/extent handed straight to `CameraMap.fitBounds`. */
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

/** **The middle of a set of points, as a fit would centre them** — the centre of their extent,
 *  not the average of them, so a dense cluster at one end of a leg cannot drag it. `null` for an
 *  empty set, like `boundsOfPoints`. Read by the camera to keep the SUBJECT of a selection in
 *  the visible band when the card under it changes size (ADR-0206 §AC8). */
export function centreOfPoints(points: readonly LatLng[]): LatLng | null {
  const bounds = boundsOfPoints(points);
  if (!bounds) return null;
  return { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 };
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
 * Does `inner` fill enough of `outer` to count as **framed**, rather than merely
 * **visible**? Containment alone conflated the two, and that is a real defect rather
 * than a nicety: once the view is wide — a day whose places are hours apart, or the
 * opening frame before session 134's fix — every later, tighter set is contained by
 * it, so "already fits, don't move" is true forever and no chip, no `אולי`, no day
 * change can ever tighten the frame again. You end up on a country-wide view with
 * three pins in one corner.
 *
 * `||` across the axes, not `&&`: a set is dwarfed only when it is small in **both**
 * directions. A row of stops down one street fills the width and almost none of the
 * height, and that is framed — re-fitting it would be the gratuitous lurch the
 * containment guard exists to prevent.
 *
 * A degenerate view (zero span) is not something to judge against, so it counts as
 * framed and the containment guard alone decides — the caller already refuses to fit
 * into an unsized div (`fitPaddingFor`), and this must not become a second, quieter
 * place that reasons about one.
 *
 * Note the property this gives for free: **the tighter you have zoomed in by hand,
 * the less likely a re-fit**, because a small view makes every ratio larger. So "a
 * manual zoom wins until the next scope change" survives, and it survives most
 * strongly exactly where someone has deliberately gone in close.
 */
export function boundsFillView(outer: MapBounds, inner: MapBounds): boolean {
  const outerLat = outer.north - outer.south;
  const outerLng = outer.east - outer.west;
  if (outerLat <= 0 || outerLng <= 0) return true;
  // Read once, so the two axes are judged against the same share even if the device-pass
  // panel moves it mid-evaluation (ADR-0146 §3).
  const share = tune(TUNE.refitFillShare, MAP_REFIT_FILL_SHARE);
  return (
    (inner.north - inner.south) / outerLat >= share || (inner.east - inner.west) / outerLng >= share
  );
}

/**
 * What the camera should do about a pin set (ADR-0121 §7's table):
 *
 * | Set                          | Decision                                            |
 * | ---------------------------- | --------------------------------------------------- |
 * | No pins                      | `none` — the empty state speaks                     |
 * | Inside the view AND filling  | `none` — moving would be gratuitous                 |
 * | it (`boundsFillView`)        |                                                     |
 * | Inside it but DWARFED by it  | falls through and re-fits — visible is not framed   |
 * | One pin, or all coincident   | `centre` — never `fitBounds` a zero-area extent, or |
 * |                              | it snaps to building-level zoom                     |
 * | Anything else                | `fit` — including a multi-city trip: that IS the    |
 * |                              | extent, and legibility there is §6's dot tier       |
 *
 * The dwarfed row is why the containment guard is now two tests. A zero-area extent
 * fills nothing, so filtering down to a **single** pin also re-frames rather than
 * sitting wherever the wide view left it — the same defect, one pin narrower.
 *
 * Near-coincident (but not identical) pins are left to `fit` — the caller's
 * shared `maxZoom` cap covers them and the single-point case both, rather than a
 * second special case here.
 */
export type CameraTarget =
  { kind: 'none' } | { kind: 'centre'; at: LatLng } | { kind: 'fit'; bounds: MapBounds };

/** Padding may claim at most this share of either axis before it is dropped. */
const MAX_PADDING_SHARE = 0.5;

/**
 * Inset for a fit, in px, **against the canvas being fitted into**. The top carries
 * the floating controls row — derived from the constant that writes
 * `--map-controls-h`, so layout and camera cannot drift apart (ADR-0122 §1) — plus a
 * pin's own clearance, derived from the size a pin will actually be on a canvas that
 * tall (ADR-0123). Nothing about the layout keeps a pin out from under the chips; this
 * is the only thing that does.
 *
 * It became a function of the canvas when the pin's size did. The two honest limits
 * ADR-0122 §1 states rather than papers over are unchanged: it governs a **fit** (a
 * manual pan can still put a pin under the row, and no map larger than its frame can
 * promise otherwise), and `fitPaddingFor` drops padding that would claim half an axis —
 * so at `half`, where the pane is ~260px, the inset is still dropped and a fitted pin
 * can land under the row. Deriving it makes that case cheaper, not solved: the pin is
 * at its floor there, so the inset asks for less than the flat 64px clearance did.
 */
export function mapFitPadding(
  canvasHeightPx: number,
  /** What the place card is occupying at the canvas's bottom right now, or 0 when none
   *  is up (ADR-0122 §7, deferred there and built in ADR-0128 §2). It is a live number
   *  rather than a constant because the card comes and goes on a tap — which is exactly
   *  why the caller reads it through a **ref** and not a dependency: recomputing the
   *  padding must not re-run the framing effect, or tapping a pin would move the camera,
   *  and "a tap never takes away the surface it was made on" is the rule that killed
   *  this inset the first time round. */
  bottomReservePx = 0,
): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  // Every side the pin actually reaches into is derived from the pin (session 144). Only
  // `top` was, so raising the size pushed pins against the left and right edges.
  // Measured from the ANCHOR, which is the tip: up is the body plus the tag, sideways is
  // half the box plus the number badge's overhang, and down is nothing at all.
  const reach = Math.ceil(pinHeightFor(canvasHeightPx) * MAP_PIN.SIDE_REACH);
  const top = MAP_CONTROLS_H + MAP_FLOAT_GAP + pinClearanceFor(canvasHeightPx);
  // THE CARD'S RESERVE IS BEST-EFFORT; THE TOP INSET IS NOT (ADR-0128 §2). Asking for
  // the card's full band blows the block axis past `fitPaddingFor`'s affordability
  // ceiling — measured, a 130px card does it on every phone, at every stop — and that
  // function drops the WHOLE padding, top included. So an unclamped reserve would trade
  // "a pin can hide under the card" for "a pin can hide under the controls row", which
  // is a worse bug and a silent one.
  //
  // Clamped, it degrades instead: the reserve takes whatever the axis has left after the
  // top inset, so a taller canvas carries more of the card and a short one carries a
  // little. Strictly better than the 0 that shipped, and it can never cost the top.
  const affordable = Math.max(0, canvasHeightPx * MAX_PADDING_SHARE - top - MAP_FIT_INSET - 1);
  return {
    top,
    right: MAP_FIT_INSET + reach,
    bottom: MAP_FIT_INSET + Math.floor(Math.min(bottomReservePx, affordable)),
    left: MAP_FIT_INSET + reach,
  };
}

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

/**
 * **How far south of a place the camera must sit for the place to land in the middle of what you
 * can actually see** (ADR-0128 §2's 2026-08-06 amendment), in px of canvas. `0` means "leave the
 * pan alone".
 *
 * A pan centres the place in the canvas. With a card or a form occupying the bottom
 * `bottomReservePx` and the floating controls row occupying `topInsetPx`, the band you can see runs
 * from `top` to `H − reserve`, and its centre is `(reserve − top) / 2` above the canvas's own. So
 * the camera's centre goes that far **south** of the place.
 *
 * **BOTH insets, and the first draft of this used only the bottom one — which breaks in exactly the
 * case the whole thing is for.** The argument for ignoring the top was "a pan centres, so the place
 * cannot be near the top edge", and that holds only while the band is big. It is not: ADR-0148
 * measured the form at 243px of a 372px canvas, leaving a 129px band whose centre is y≈64 — inside
 * the ~88px the controls row and a pin's own upward reach take. Correcting for one occupant by
 * moving the place under the other is not a fix.
 *
 * **Clamped at 0, so it never pushes the place DOWN.** A small card on a tall canvas has a band
 * whose centre sits below the canvas's, and the arithmetic would answer "move the place toward the
 * card" — for a place that was already clear of everything. Nothing owed, nothing moved: the same
 * rule the re-fit guard runs one level up.
 *
 * `topInsetPx` is `mapFitPadding`'s own `top`, passed in rather than re-derived, so the pan and the
 * fit cannot disagree about where the controls row ends.
 */
export function panShiftForReserve(bottomReservePx: number, topInsetPx: number): number {
  if (bottomReservePx <= 0) return 0;
  return Math.max(0, Math.round((bottomReservePx - topInsetPx) / 2));
}

/**
 * **Where the selected place should be sitting, and how far it is from there** — signed px of
 * canvas (positive: the centre goes south, so the place rides up), `0` when it is close enough
 * already.
 *
 * **This started life as a one-way nudge and that was half a rule** (2026-08-06, owner, on the
 * shipped nudge: _"now the issue is the other way around: when switching from full map (with a
 * card open) to half map half list, the pin is not centered anymore"_). Lifting a covered place
 * to the card's edge is right while the card is there; when the card LEAVES and the pane shrinks,
 * that same offset is a place sitting low in a canvas with nothing in it. A rule that only ever
 * pushes one way cannot put anything back.
 *
 * So the target is the **centre of the band you can see**, and it is `panShiftForReserve`'s own
 * arithmetic rather than a second opinion about where that is: `H/2 − shift`. One consequence
 * worth stating, because it is what makes the whole thing coherent — **the pan and this now agree
 * by construction.** A pan puts a new selection at the band's centre; this keeps it there as the
 * band changes underneath it. With no card the shift is 0 and the target is the canvas's own
 * centre, which is exactly where a pan with no card lands.
 *
 * `tolerancePx` is what keeps it from being a second camera driver: a band that moved by a few
 * pixels owes nothing, so the common re-render is a projection read and no write at all.
 */
export function recentreInBand(
  pointY: number,
  canvasH: number,
  bottomReservePx: number,
  topInsetPx: number,
  tolerancePx: number,
): number {
  if (canvasH <= 0) return 0;
  const target = canvasH / 2 - panShiftForReserve(bottomReservePx, topInsetPx);
  const dy = Math.round(pointY - target);
  return Math.abs(dy) <= tolerancePx ? 0 : dy;
}

/**
 * **Locate's ladder, statelessly** (#20, ADR-0127 §2). The first tap gets you to a
 * readable zoom; a repeat tap steps one level in **from wherever the map actually
 * is** — never from a remembered tap count, so a pinch between taps cannot
 * desynchronise it and nothing about it has to live in state (which is also what
 * keeps it clear of ADR-0122 §9's no-prop-that-flips-on-a-tap rule).
 */
export function zoomStepIn(
  current: number | null | undefined,
  floor: number,
  ceiling: number,
): number {
  if (current == null || current < floor) return floor;
  return Math.min(current + 1, ceiling);
}

/**
 * **How much ground to show around a place you were sent to look at** (ADR-0129 §2).
 *
 * A fixed zoom cannot know whether it is dropping you in a dense district or an empty
 * valley, and the owner's report is exactly that: "how much to zoom on a pin should be
 * dynamic and depend on several stuff such as if there are lots of close pins". So the
 * span is derived from **how far the nearest other pins are**: a place with neighbours
 * 200m away shows a few hundred metres, an isolated one shows the default.
 *
 * Returned as BOUNDS centred on the place, not as a zoom, so it feeds the fit path that
 * already exists — inheriting the controls-row padding, the card reserve and the
 * `MAX_FIT` cap rather than needing its own copies of all three.
 *
 * Clamped both ways, and both clamps earn their place: without a **ceiling** one distant
 * neighbour drags the frame out to a region and the place you came to see is a speck;
 * without a **floor** two coincident pins fit a zero-area box and snap to building level,
 * which is the degenerate case ADR-0121 §7's table exists for.
 */
export function focusBoundsFor(at: LatLng, others: readonly LatLng[]): MapBounds {
  // Only the nearest few matter. The question is "what is around this place", and the
  // tenth-nearest pin says nothing about that while dragging the frame out.
  const near = others
    .filter((p) => p.lat !== at.lat || p.lng !== at.lng)
    .map((p) => Math.max(Math.abs(p.lat - at.lat), Math.abs(p.lng - at.lng) * lngScale(at.lat)))
    .sort((a, b) => a - b)
    .slice(0, MAP_FOCUS.NEIGHBOURS);
  // The furthest of the near ones, so a cluster is framed as a cluster rather than around
  // its closest member only — **but only among neighbours that are actually together**
  // (owner, session 169: _"zoom more when the selected is very close to other results"_).
  // A neighbour many times further than the nearest one is not part of its cluster, and
  // letting it set the reach meant a place with something right next door framed as if it
  // had nothing: the close neighbour you wanted to see sat in the middle of a frame sized
  // for the far one.
  const nearest = near[0];
  const cluster =
    nearest == null ? near : near.filter((d) => d <= nearest * MAP_FOCUS.CLUSTER_FACTOR);
  // No neighbours at all → the default span. **Nothing CLOSE is not the same as nothing**
  // (owner, same session): when every neighbour is far, they still set the reach and the
  // ceiling still clamps it, so an isolated place keeps the wider frame it always had
  // rather than zooming in on empty ground.
  const reach = cluster.length > 0 ? cluster[cluster.length - 1] : MAP_FOCUS.DEFAULT_SPAN_DEG;
  const half = Math.min(
    Math.max(reach * MAP_FOCUS.NEIGHBOUR_HEADROOM, MAP_FOCUS.MIN_SPAN_DEG),
    MAP_FOCUS.MAX_SPAN_DEG,
  );
  // Latitude degrees are constant; longitude degrees shrink toward the poles, so the
  // box has to be wider in longitude to cover the same ground (ADR-0129 §2).
  const halfLng = half / lngScale(at.lat);
  return {
    north: at.lat + half,
    south: at.lat - half,
    east: at.lng + halfLng,
    west: at.lng - halfLng,
  };
}

/** How much ground a degree of longitude covers here, relative to a degree of latitude.
 *  Floored, so a near-polar trip cannot divide the span to infinity. */
function lngScale(lat: number): number {
  return Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
}

/** What the camera should do about a **settled set of search results** (ADR-0168 §1).
 *  `pan` keeps the zoom you are on and only centres; `fit` has already decided the extent,
 *  so the caller hands it straight to the padded fit path. */
export type SearchCameraTarget =
  { kind: 'none' } | { kind: 'pan'; at: LatLng } | { kind: 'fit'; bounds: MapBounds };

/**
 * **The camera answers a settled result set** (ADR-0168 §1), which is the report this
 * function exists for: at the map extreme a result off-canvas produced no sign at all that
 * anything had been found — the sheet holds no rows there, so the only evidence was a ring
 * you could not see.
 *
 * `results` is in **Google's own relevance order**, and that matters: the last branch reads
 * `results[0]` as "the answer", which is only true because Text Search ranked it.
 *
 * Four rules, in order, and each one is a guard against a different bad move:
 *
 * | State                                    | Decision | Why not something else                     |
 * | ---------------------------------------- | -------- | ------------------------------------------ |
 * | No results                               | `none`   | Nothing to show; the sheet's own state says so |
 * | Every result already on canvas           | `none`   | **This is the anti-jitter rule.** Consecutive settled queries in one neighbourhood move nothing at all |
 * | The extent fits at the zoom you are on   | `pan`    | Re-fitting would ZOOM for a set you could already have seen — ADR-0129 §1's "no unasked-for zoom", one population over |
 * | Wider than that, but still one area      | `fit`    | The owner's "zoom out and pan"             |
 * | Wider than `SPREAD_CAP_DEG`              | `fit` on the top result's own cluster | Fitting `דואומו` across four Italian cities is a country view of four specks — worse than the frame you had |
 *
 * Note what the containment rule deliberately does NOT use: `boundsFillView`. That test
 * exists so a **filter** can tighten a frame that has gone slack (ADR-0121 §7's dwarfed
 * row), and a filter is a deliberate act on a set you are curating. A query is neither — so
 * "they are all on screen" is the whole of what a search is owed, and zooming in on them
 * because they are small in the frame is exactly the movement the report asks us not to
 * make.
 */
export function searchCameraTarget(
  results: readonly LatLng[],
  view: MapBounds | null,
): SearchCameraTarget {
  const extent = boundsOfPoints(results);
  if (!extent) return { kind: 'none' };
  // No view yet means no framing worth preserving, the same reading the opening fit makes.
  if (!view) return framedSet(extent, results);
  if (boundsContain(view, extent)) return { kind: 'none' };
  const share = MAP_SEARCH_CAMERA.FITS_AT_ZOOM_SHARE;
  const fitsAtZoom =
    extent.north - extent.south <= (view.north - view.south) * share &&
    extent.east - extent.west <= (view.east - view.west) * share;
  if (fitsAtZoom) {
    // The midpoint needs no antimeridian guard, and the reason is structural rather than
    // lucky: `boundsOfPoints` compares longitudes plainly, so a set straddling ±180° has an
    // extent spanning ~358°, which cannot be ≤ 0.8 of any view — so it never reaches this
    // branch. It falls to `framedSet` instead, where the 358° spread trips the cap and the
    // top result is framed among its own cluster, which is a better answer than either a
    // world-wide fit or a sweep the long way round. ADR-0121 §14's stance, inherited.
    return {
      kind: 'pan',
      at: {
        lat: midpoint(extent.north, extent.south),
        lng: midpoint(extent.east, extent.west),
      },
    };
  }
  return framedSet(extent, results);
}

/** The extent, or — when the results are too scattered to be "an area" at all — the
 *  top-ranked one framed among **its own** neighbours, which is `focusBoundsFor`'s existing
 *  cluster guard (ADR-0129 §2) doing exactly the job it was built for. */
function framedSet(extent: MapBounds, results: readonly LatLng[]): SearchCameraTarget {
  const spread = Math.max(
    extent.north - extent.south,
    (extent.east - extent.west) * lngScale(midpoint(extent.north, extent.south)),
  );
  if (spread <= MAP_SEARCH_CAMERA.SPREAD_CAP_DEG) return { kind: 'fit', bounds: extent };
  return { kind: 'fit', bounds: focusBoundsFor(results[0], results) };
}

function midpoint(a: number, b: number): number {
  return (a + b) / 2;
}

export function cameraTargetFor(points: readonly LatLng[], view: MapBounds | null): CameraTarget {
  const bounds = boundsOfPoints(points);
  if (!bounds) return { kind: 'none' };
  // Contained AND filling it: nothing owed. Contained but dwarfed by it falls
  // through to the fit below — "already on screen" was never the same as "framed".
  if (view && boundsContain(view, bounds) && boundsFillView(view, bounds)) {
    return { kind: 'none' };
  }
  if (bounds.north === bounds.south && bounds.east === bounds.west) {
    return { kind: 'centre', at: { lat: bounds.north, lng: bounds.east } };
  }
  return { kind: 'fit', bounds };
}

/** A camera position, which is all `moveCamera` needs. */
export interface CameraAt {
  center: LatLng;
  zoom: number;
}

/**
 * **One frame of a camera move** (ADR-0129 §3), as a pure function of progress.
 *
 * `ease` is the standard ease-in-out cubic — the same shape as the app's
 * `--ease-standard`, expressed here because a rAF loop cannot borrow a CSS curve.
 *
 * Longitude is interpolated the SHORT way round, which matters exactly where
 * `boundsOfPoints` deliberately does not care: a straight lerp from +170 to −170 sweeps
 * the long way across the whole world, and unlike a fit — which nobody notices until a
 * trip spans ±180° — a *visible sweep* is the one thing this function exists to avoid.
 */
export function cameraFrame(from: CameraAt, to: CameraAt, progress: number): CameraAt {
  const t = progress <= 0 ? 0 : progress >= 1 ? 1 : ease(progress);
  let dLng = to.center.lng - from.center.lng;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  return {
    center: {
      lat: from.center.lat + (to.center.lat - from.center.lat) * t,
      lng: from.center.lng + dLng * t,
    },
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  };
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
