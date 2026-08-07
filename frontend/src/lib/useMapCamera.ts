// The camera, applied (ADR-0121 §7 + §13's decomposition). The arithmetic is in
// `lib/map-camera.ts`, unit-tested with no Google present; this is the thin
// imperative half that talks to a live `google.maps.Map`.
//
// Two behaviours, deliberately different:
//   • **Re-framing** answers a control that changed the pin SET (a day/all-days
//     switch, a type chip, `אולי`, `מה נשאר`, near-me). It runs only when the set
//     changes, which is also what gives "a manual pan or zoom wins until the next
//     scope change" for free: nothing else re-frames, so the per-second clock tick
//     and every unrelated re-render leave the camera exactly where the user put it.
//   • **Focusing** answers a selection. It pans, and zooms **in** to a readable zoom
//     when the view is further out than one — never out (ADR-0127 §1). §7's original
//     "focus never zooms" protected the context you were reading, and that protection
//     is entirely about not pulling BACK; being dropped on a country-level view and
//     told the place is somewhere in it protects nothing. `locate` is the same move
//     with a repeat tap stepping one level in from wherever the map is (#20).
//   • **An arrival focus** — `מפה` on an event or a booking — is a fourth case, and it
//     OWNS the next framing (ADR-0127 §3). It is not a pan layered on top of an
//     opening fit: the fit does not run, so the two cannot race.
//
// **The opening framing is a third case, and getting it wrong opened the map on the
// whole world (session 134).** Two hazards compound:
//
//   1. `fitBounds` fired before the pane has laid out fits into a 0×0 div, and with
//      padding larger than the viewport Google resolves that to a wild zoom-OUT.
//   2. §7's containment guard then makes it permanent: a zoomed-out view contains
//      every pin, so "the set already fits, don't move" is true forever.
//
// So the first framing **waits for the map's own `idle`** (which only fires once the
// map has rendered, i.e. is really sized) and **ignores containment** — there is no
// view worth preserving before the map has ever been framed. Only later framings are
// containment-guarded, which is what that guard was always for.
//
// Reduced motion: the camera still MOVES, only the easing is dropped — a pan
// becomes a jump (ADR-0098 §4).
import { useCallback, useEffect, useRef } from 'react';
import {
  cameraTargetFor,
  fitPaddingFor,
  mapFitPadding,
  cameraFrame,
  focusBoundsFor,
  recentreInBand,
  panShiftForReserve,
  searchCameraTarget,
  zoomStepIn,
  type CameraAt,
  type CameraTarget,
  type LatLng,
  type MapArrival,
  type MapBounds,
} from './map-camera';
import {
  doubleTapZoom,
  offsetPxOfWorldPoint,
  worldPointAtOffset,
  zoomAboutPoint,
  type WorldPoint,
} from './canvas-gestures';
import { prefersReducedMotion } from './motion';
import { MAP_CAMERA_EASE, MAP_FLOAT_GAP, MAP_ZOOM } from '../constants';
// The zoom ladder is the device pass's, so these three reads go through the dev accessor
// (ADR-0146 §3). In a production build `tune` IS the identity — no override layer exists.
import { TUNE, tune } from './dev-tuning';

/** The live viewport as our own bounds shape, or `null` before the first idle. */
export function readMapBounds(map: google.maps.Map | null): MapBounds | null {
  const bounds = map?.getBounds();
  if (!bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
}

export interface MapCamera {
  /** Re-frame the given points now, whatever the current view (the frame control's
   *  escape hatch from "a manual pan wins"). */
  reframe: (points: readonly LatLng[]) => void;
  /** Centre on a point at the current zoom — a pan, never a zoom (ADR-0129 §1). */
  focus: (point: LatLng) => void;
  /** Locate's own move: a repeat tap steps one level in from wherever the map is
   *  (#20 / ADR-0127 §2). */
  locate: (point: LatLng) => void;
  /** Frame a place together with what is around it — the arrival, and the place card's
   *  way in to its own pin (ADR-0129 §1/§2). Returns whether it moved. */
  frameOn: (point: LatLng) => boolean;
  /** **Keep `point` in the middle of what you can actually SEE, as that changes underneath it**
   *  (ADR-0122 §7's 2026-08-06 amendment). The same target `focus` pans a new selection to —
   *  so the two agree by construction — re-applied when the CARD or the CANVAS changes rather
   *  than when the selection does. Within tolerance it moves nothing. */
  keepCentred: (point: LatLng) => void;
  /** **A settled set of search results arrived** (ADR-0168 §1) — pan to them, widen to
   *  them, or leave the camera alone, per `searchCameraTarget`. In Google's relevance
   *  order, which the too-scattered branch reads. */
  showResults: (points: readonly LatLng[]) => void;
  /** **The one-finger drag zoom's write** (ADR-0145 §5). Instant and centre-anchored: the
   *  finger IS the animation, so there is nothing to ease — and it cancels any ease in
   *  flight rather than letting ADR-0129 §4's check merely notice it, because within one
   *  frame the ease could still write after us. The gesture tells the camera; the camera
   *  does not guess.
   *
   *  It exists so the gesture is a CALLER of this hook rather than a second writer of the
   *  camera, which is ADR-0129 §3's invariant. */
  zoomTo: (zoom: number) => void;
  /** One eased level in — the double-tap we take over from Google because intercepting the
   *  gesture suppressed its own (ADR-0145 §2). Eased, unlike `zoomTo`: this one is a
   *  discrete move the user asked for once, so it collapses to a single `moveCamera` under
   *  reduced motion like every other (§7).
   *
   *  `offsetPx` is the tapped point relative to the canvas centre, and it **anchors the
   *  zoom there** — restoring what Google's own double-click zoom did before we suppressed
   *  it. Omitted (or with no projection yet) it anchors at the centre. */
  stepZoomIn: (offsetPx?: WorldPoint) => void;
}

export function useMapCamera(
  map: google.maps.Map | null,
  opts: {
    /** The points the camera answers to — the filtered, scoped, pinnable set. */
    points: readonly LatLng[];
    /** Changes exactly when a control changed the SET on purpose. A string, so a
     *  new array identity from a clock tick is not mistaken for a new set. */
    setSignal: string;
    /** Somewhere the camera has been **asked to go**, and whether that may zoom: an
     *  arrival via `מפה` on an event or a booking (ADR-0121 §8), the place card's own
     *  badge, or a form opening on a point (ADR-0148 §3). It **owns the next framing** —
     *  a rule about which intent wins rather than a guard bolted onto the fit
     *  (ADR-0127 §3) — and it is spent once.
     *
     *  **`frame: false` is not a lesser frame, it is the other half of ADR-0129 §1.** A
     *  long press names a pixel you are looking at, so zooming for it is the same
     *  "inconvenient" that rule removed from a pin tap: you did not ask to be taken
     *  anywhere. The pan still happens, because the form has to be clear of the pin. */
    arrival?: MapArrival | null;
    /** Extra points that count as "what is around here" for an `arrival`, without
     *  being points the camera FITS (ADR-0134 §7). The unsaved Google results are the
     *  only caller: choosing between five cafés, the useful context is the other
     *  candidates — but a ring must never pull a fit, because a query moving the camera
     *  is what ADR-0131 §5 forbids. Read through a ref, like `bottomReserve`, and for
     *  the same reason: it changes when the QUERY changes. */
    focusContext?: readonly LatLng[];
    /** What the place card occupies at the canvas's bottom, so a fit does not put a pin
     *  under it (ADR-0122 §7, built in ADR-0128 §2). Read through a ref below, never as a
     *  dependency: it changes on a **tap**, and re-running the framing effect for it
     *  would move the camera when a pin is tapped. */
    bottomReserve?: number | (() => number);
  },
): MapCamera {
  const { points, setSignal, arrival, focusContext, bottomReserve = 0 } = opts;
  // Latest-ref: the effect below is keyed on the signal alone, so it must read
  // the current points rather than close over the ones from the render that
  // happened to change the signal.
  const pointsRef = useRef(points);
  pointsRef.current = points;
  /** Has this map instance ever been framed? Until it has, there is no view worth
   *  preserving — so the opening framing is unconditional. */
  const framed = useRef(false);
  // The card's reserve, as a latest-ref. This is the whole reason the inset is
  // affordable at all: `apply` keeps its `[map]` identity, so the effect below does not
  // re-run when a card opens, so a pin tap still moves nothing (ADR-0122 §7's rule).
  const bottomReserveRef = useRef(bottomReserve);
  bottomReserveRef.current = bottomReserve;
  /** **The reserve as it is RIGHT NOW**, which for the getter form means measuring the card in
   *  the DOM at the moment the camera moves.
   *
   *  A plain number here was not enough and the failure was silent: the screen measures the card
   *  in a layout effect and sets state, and React flushes this component's pending passive
   *  effects **before** re-rendering with it — so the pan keyed on a new selection read the
   *  reserve from the previous render, i.e. 0 on the tap that first raises a card. Reproduced in
   *  isolation before it was fixed (owner: _"Not panning in full map when clicking on a pin"_).
   *  A reading taken here cannot have that bug under any ordering. */
  const reserveNow = (): number => {
    const reserve = bottomReserveRef.current;
    return (typeof reserve === 'function' ? reserve() : reserve) ?? 0;
  };
  /** **Where the centre goes so the card does not cover `point`**, or `null` when there is
   *  nothing to clear or the map cannot answer yet (no projection before it has rendered).
   *
   *  Read through the ref above, and for the reason that ref exists (ADR-0128 §2): the reserve
   *  changes on a **tap**, and as a dependency it would re-run the framing effect — i.e. tapping a
   *  pin would move the camera, which is the rule ADR-0122 §7 exists to hold. A ref read at the
   *  moment a pan runs keeps that intact. */
  const clearOfCard = useCallback(
    (map: google.maps.Map, point: LatLng, zoom: number): LatLng | null => {
      // The canvas's own height, read where the move happens — the same read `apply` makes, and
      // for the same reason: it is what both insets are measured against, and this screen
      // re-renders every second so it must not be state (ADR-0121 §5).
      const canvas = map.getDiv().getBoundingClientRect().height;
      const shift = panShiftForReserve(reserveNow(), mapFitPadding(canvas).top);
      if (shift === 0) return null;
      return throughProjection(map, point, (world) =>
        worldPointAtOffset(world, { x: 0, y: shift }, zoom),
      );
    },
    [],
  );
  const focusContextRef = useRef(focusContext);
  focusContextRef.current = focusContext;
  /** The arrival this camera still owes, and the identity it was claimed from. */
  const owedFrame = useRef<MapArrival | null>(null);
  const lastArrival = useRef<MapArrival | null | undefined>(undefined);

  /** The frame handle of the move in flight, so a new move cancels the old one rather
   *  than fighting it. */
  const raf = useRef(0);
  /** Where the move in flight is going, and the last frame it wrote. Both exist because
   *  an eased move makes the map's own camera a MOVING TARGET for 480ms, and two
   *  decisions read that camera (ADR-0129 §4):
   *
   *   • the step-in ladder asks "where are we now" — during an ease the honest answer is
   *     where we are GOING, or a second tap lands on an interpolated value and #20's
   *     "nothing can desynchronise it" stops being true;
   *   • "a manual pan or zoom wins" (ADR-0121 §7) has to survive the window. If the
   *     camera is not where we last put it, something else moved it — a finger — so we
   *     stand down rather than overwrite the gesture frame by frame. */
  const going = useRef<CameraAt | null>(null);
  const wrote = useRef<CameraAt | null>(null);

  /**
   * **EVERY camera move goes through here** (ADR-0129 §3), and it is ours rather than
   * Google's because Google's cannot be asked for: `fitBounds` animates "depending on an
   * internal heuristic", `panTo` animates only when the move is shorter than the
   * viewport, and `moveCamera` is documented as instant. That heuristic is what made a
   * day change or an arrival "portal" — it is not that the app asked for a jump, it is
   * that nothing could ask for anything else.
   *
   * So: read the current camera, interpolate to the target once per frame with
   * `moveCamera`, and stop. Under `prefers-reduced-motion` it is a single `moveCamera` —
   * the camera still MOVES, only the easing goes (ADR-0098 §4).
   */
  const easeTo = useCallback(
    (to: CameraAt) => {
      if (!map) return;
      cancelAnimationFrame(raf.current);
      going.current = null;
      const fromCenter = map.getCenter();
      const fromZoom = map.getZoom();
      // No camera to interpolate FROM (a map that has not rendered) is not a failure —
      // there is simply nothing to ease across, so land on the target.
      if (!fromCenter || fromZoom == null || prefersReducedMotion()) {
        map.moveCamera({ center: to.center, zoom: to.zoom });
        going.current = null;
        wrote.current = null;
        return;
      }
      const from: CameraAt = {
        center: { lat: fromCenter.lat(), lng: fromCenter.lng() },
        zoom: fromZoom,
      };
      const started = performance.now();
      going.current = to;
      const step = () => {
        // THE USER WINS. If the camera is not where this loop last put it, a finger moved
        // it — Google's own pan/pinch handling writes the camera too — and continuing
        // would overwrite that gesture once a frame until the ease ran out (ADR-0121 §7).
        if (wrote.current && !sameCamera(readCamera(map), wrote.current)) {
          going.current = null;
          return;
        }
        const progress = (performance.now() - started) / MAP_CAMERA_EASE.DURATION_MS;
        const at = cameraFrame(from, to, progress);
        map.moveCamera(at);
        wrote.current = at;
        if (progress < 1) raf.current = requestAnimationFrame(step);
        else going.current = null;
      };
      wrote.current = null;
      step();
    },
    [map],
  );
  // A move in flight when the pane unmounts would keep calling into a dead map.
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /** Where a "look at this place" move should end up. `zoom` `null` keeps the current
   *  one, which is what makes a pin tap a pure pan (ADR-0129 §1).
   *
   *  **AND IT PANS CLEAR OF THE CARD** (ADR-0128 §2's 2026-08-06 amendment; owner: _"selecting a
   *  place on the map (or search) opens the place card with the info (or the various add forms)
   *  and sometimes the card covers the place and the pin. I'd like for the existing pan to be
   *  smarter and pan to where the card/form doesn't cover the place and pin"_).
   *
   *  §2 gave the reserve to the FIT's padding and left the pan centring blindly, which is why the
   *  form is where this bites hardest: measured in ADR-0148, it needs 243px of a 372px canvas at
   *  the `map` stop, so a centred point sits 57px INSIDE it. The card is more forgiving and the
   *  enriched result card is not.
   *
   *  The shift is `panShiftForReserve`'s, applied through Google's own projection at the TARGET
   *  zoom — a pixel is a different distance at every zoom, so using the current one would put the
   *  place in the wrong place whenever the two differ (an arrival that also zooms). With no card
   *  the shift is 0 and the round trip is skipped entirely, so a pin tap with nothing raised
   *  behaves exactly as it always did. */
  const moveTo = useCallback(
    // Reports whether it moved, for the same reason `apply` does: a map with no zoom yet
    // has not rendered, and a panning arrival must be retried on `idle` rather than
    // recorded as a move that never happened.
    (point: LatLng, zoom: number | null): boolean => {
      const current = going.current?.zoom ?? map?.getZoom();
      if (current == null || !map) return false;
      const to = zoom ?? current;
      easeTo({ center: clearOfCard(map, point, to) ?? point, zoom: to });
      return true;
    },
    [map, easeTo],
  );

  /**
   * **THE BAND CHANGED UNDER A PLACE THAT WAS ALREADY CHOSEN** (ADR-0122 §7's 2026-08-06
   * amendment, both halves of it). `focus` above answers a NEW selection and pans to the centre
   * of the visible band; this re-applies that same target when the band itself moves and no
   * selection did — which is the whole set of cases nothing else covers:
   *
   *  - a card RAISED over a place chosen earlier (a sheet-stop change, an arriving enrichment),
   *    which put the card on top of its own pin;
   *  - and the mirror, which the first build of this missed by only ever pushing one way: the
   *    card LEAVING and the pane shrinking, where the offset that had lifted the place clear is
   *    now just a place sitting low in an empty canvas (owner: _"switching from full map … to
   *    half map half list, the pin is not centered anymore"_).
   *
   * Three things keep it from becoming a second camera driver fighting the first:
   *
   *  - **A band that moved by a few pixels owes nothing.** `recentreInBand`'s tolerance makes
   *    the common re-render a projection read and no write.
   *  - **It stands down while a move is in flight.** An ease in progress is already going
   *    somewhere chosen with the reserve in hand (`moveTo` runs `clearOfCard`), so correcting
   *    against an interpolated camera would fight a decision already made.
   *  - **It reads the reserve through the same getter** `moveTo` does, so the two halves cannot
   *    disagree about how big the card is.
   */
  const keepCentred = useCallback(
    (point: LatLng) => {
      if (!map) return;
      // **AGAINST WHERE THE CAMERA IS GOING, not where it happens to be mid-ease.** The first
      // build stood down while a move was in flight, on the reasonable-sounding argument that
      // the move had already chosen its destination with the reserve in hand. That guard turned
      // out to block this function's own correction, which is the one thing it must never do
      // (owner, on the shipped version: _"when changing from half to full map it does work but
      // the map is sitting lower than it would if it was panning from a full map"_). The
      // sequence: the pane resizes, this runs BEFORE the card has rendered, so `reserveNow()` is
      // 0 and it aims at the bare canvas centre — lower than the band centre. Then the card
      // lands, the effect re-runs with the right reserve, and the guard sent it home.
      //
      // Reading the DESTINATION instead is strictly better on both counts: it cannot fight an
      // eased move (it measures against that move's own target, so a correct one computes a
      // delta of 0 and writes nothing), and it CAN correct a stale one. `easeTo` cancels the
      // frame in flight, so re-targeting is one ease replacing another rather than two drivers.
      const going_ = going.current;
      const zoom = going_?.zoom ?? map.getZoom();
      // A LITERAL either way, like every other projection call in this file: `getCenter()` hands
      // back a `google.maps.LatLng`, whose `lat`/`lng` are METHODS, and reading those as numbers
      // yields `NaN` all the way to a shift of 0 — a silent no-op rather than a throw.
      const live = map.getCenter();
      const at = going_?.center ?? (live ? { lat: live.lat(), lng: live.lng() } : null);
      if (zoom == null || !at) return;
      const projection = map.getProjection();
      const centreWorld = projection?.fromLatLngToPoint(at);
      const pointWorld = projection?.fromLatLngToPoint(point);
      if (!centreWorld || !pointWorld) return;
      const canvas = map.getDiv().getBoundingClientRect().height;
      const { y } = offsetPxOfWorldPoint(centreWorld, pointWorld, zoom);
      const dy = recentreInBand(
        canvas / 2 + y,
        canvas,
        reserveNow(),
        mapFitPadding(canvas).top,
        MAP_FLOAT_GAP,
      );
      if (dy === 0) return;
      const to = throughProjection(map, at, (world) =>
        worldPointAtOffset(world, { x: 0, y: dy }, zoom),
      );
      if (to) easeTo({ center: to, zoom });
    },
    [map, easeTo],
  );

  /** Move the camera to suit `candidates`, and report whether it actually did.
   *  `false` also covers "the map is not ready to be fitted", which is what lets the
   *  caller retry rather than record a framing that never happened. */
  const apply = useCallback(
    (candidates: readonly LatLng[], view: MapBounds | null, want?: MapBounds): boolean => {
      if (!map) return false;
      // An explicit `want` is a caller that has already decided the extent (`frameOn`'s
      // neighbour-derived box). It skips the "does the view already frame this" guard on
      // purpose: you asked to be taken to this place, so being near it is not an answer.
      const target: CameraTarget = want
        ? { kind: 'fit', bounds: want }
        : cameraTargetFor(candidates, view);
      if (target.kind === 'none') return false;
      // **The FIRST framing of a map lands; every later one eases** (ADR-0129 §3). A
      // map is constructed with `defaultCenter`, so it always has a camera to
      // interpolate from — but that camera is one nobody chose, and easing out of it
      // would animate a long sweep from a placeholder on every single tab open. Easing a
      // fact is not movement.
      const instant = !framed.current;
      if (target.kind === 'centre') {
        // Never `fitBounds` a zero-area extent — it snaps to building level.
        const to = { center: target.at, zoom: tune(TUNE.zoomPlace, MAP_ZOOM.PLACE) };
        if (instant) map.moveCamera(to);
        else easeTo(to);
        return true;
      }
      const box = map.getDiv().getBoundingClientRect();
      // The div's height is both what the padding is affordable AGAINST and what sizes
      // the pins it has to clear (ADR-0123) — one measurement, read where the fit
      // happens rather than kept in state on a screen that re-renders every second.
      const padding = fitPaddingFor(box, mapFitPadding(box.height, reserveNow()));
      // An unsized div has no honest fit — wait for one rather than zoom to nothing.
      if (padding === null) return false;
      // `fitBounds` is used to LEARN the destination, not to travel to it (ADR-0129 §3).
      // It is the only thing that knows Google's own projection maths, so asking it and
      // reading the answer back beats re-deriving a zoom-for-bounds formula we would get
      // subtly wrong — and it keeps the padding contract exactly as it was. Both calls
      // are synchronous inside one frame, so nothing paints the destination first.
      //
      // Padded by a pin's own height at the top: the teardrop's TIP is the anchor, so
      // its body and any tag extend ABOVE the coordinate.
      const before = map.getCenter();
      const beforeZoom = map.getZoom();
      map.fitBounds(target.bounds, padding);
      // One shared cap covers the single pin above and a cluster of near-coincident ones
      // here, rather than a second special case. Clamped AFTER the fit rather than set as
      // the map's own `maxZoom`, which would also stop the user pinching in.
      const fitted = map.getZoom();
      const centre = map.getCenter();
      if (fitted == null || !centre) return true;
      const to: CameraAt = {
        center: { lat: centre.lat(), lng: centre.lng() },
        zoom: Math.min(fitted, tune(TUNE.zoomMaxFit, MAP_ZOOM.MAX_FIT)),
      };
      // Put the camera back where it was, then ease across it.
      if (!instant && before && beforeZoom != null) {
        map.moveCamera({ center: { lat: before.lat(), lng: before.lng() }, zoom: beforeZoom });
        easeTo(to);
      } else {
        map.moveCamera(to);
      }
      return true;
    },
    [map, easeTo],
  );

  // One effect, three jobs: frame this map instance the first time it can be framed
  // (on `idle`, unconditionally), re-frame when a control changes the set, and cover
  // the case where the pins only arrive after the map does.
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (!map) return;
    // An arrival focus is CLAIMED on the render that brings it and held until a
    // framing spends it. Held, because the screen consumes `focusPlaceId` in a single
    // pass while the map may not be sized for several — so reading the live prop
    // would drop it on exactly the slow arrivals this exists to fix. Claimed on an
    // identity change rather than on truthiness, or every later framing would re-read
    // the same arrival and centre on it forever.
    if (arrival !== lastArrival.current) {
      lastArrival.current = arrival;
      if (arrival) owedFrame.current = arrival;
    }
    const openingFrame = !framed.current;
    const run = () => {
      // **An arrival focus IS the frame, not a pan layered on top of one.** The fit
      // does not run for it, so the two no longer race and there is nothing to
      // out-time — which is the third instance of one family (the fit winning when
      // something else should have: ADR-0121's session-134 entry, session 139's refit
      // guard), and the reason this is a rule about which intent owns the frame.
      const owed = owedFrame.current;
      if (owed) {
        owedFrame.current = null;
        // A framing arrival goes WITH what is around it, not to a fixed zoom (ADR-0129 §2):
        // a place with neighbours 200m away and one alone in a valley want different
        // frames, and a constant cannot tell them apart. It goes through the ordinary fit,
        // so it inherits the padding, the card reserve and the `MAX_FIT` cap. A panning
        // one keeps the zoom you are at and only centres — same path a pin tap takes.
        framed.current = owed.frame ? frameOnRef.current(owed.at) : moveTo(owed.at, null);
        return framed.current;
      }
      const moved = apply(pointsRef.current, openingFrame ? null : readMapBounds(map));
      if (moved) framed.current = true;
      return moved;
    };
    // A map with no bounds has not rendered yet, so there is nothing honest to fit
    // into — and the opening framing is the one that must not guess. (A LATER framing
    // always runs: by then the map has been framed once, so it is live.)
    const rendered = !openingFrame || readMapBounds(map) != null;
    if ((rendered && run()) || !openingFrame || !hasPoints) return;
    // The opening framing did not happen, and the reason is always the same shape:
    // the map is not ready — no bounds yet, or a div measured before layout settled.
    // `idle` is the first moment it is genuinely rendered AND sized, so retry there.
    // The listener stays until a framing actually succeeds: a single attempt is what
    // let an unsized first measurement strand the camera at its opening zoom.
    // …and it stands down if something else framed the map while it was waiting. A settled
    // search set is the one that can (`showResults`), and its own move fires the very `idle`
    // this is listening for — so without the check the opening fit would answer the search's
    // pan by fitting the day's pins on top of it, which is the yank `framed` is supposed to
    // prevent (ADR-0168 §1).
    const listener = map.addListener('idle', () => {
      if (framed.current || run()) listener.remove();
    });
    return () => listener.remove();
    // `setSignal` is the control dependency; re-running on `points` identity would
    // re-frame on every clock tick. `hasPoints` covers pins arriving after the map,
    // and `arrival` is what lets one claim the frame whenever it lands — before the map
    // is sized, or after the fit already took it.
  }, [map, apply, moveTo, setSignal, hasPoints, arrival]);

  const reframe = useCallback(
    (candidates: readonly LatLng[]) => {
      if (apply(candidates, null)) framed.current = true;
    },
    [apply],
  );

  /** **A pin tap and a row tap PAN, and do not zoom** (ADR-0129 §1, restoring
   *  ADR-0121 §7's rule for the two cases it was always right about). Tapping a pin you
   *  can already see and being zoomed for it is the "inconvenient" the owner reported on
   *  a real map: you asked which one it was, not to be taken somewhere. It is the
   *  behaviour Google's own map has for a POI tap — centre it, do not zoom it. */
  const focus = useCallback((point: LatLng) => moveTo(point, null), [moveTo]);

  /** **Zooming to a place is now an intent of its own**, not a side effect of selecting
   *  one: an arrival from `מפה`, or the place card's own way in to its pin. It frames the
   *  place together with its neighbours through the ordinary fit path. */
  const frameOn = useCallback(
    (point: LatLng) => {
      // Two different questions about the same neighbours (ADR-0134 §7): the SPAN reads
      // the context too, so a ring is framed among the other candidates — while the fit's
      // own point list does not, so a ring still pulls nothing.
      const around = [...pointsRef.current, ...(focusContextRef.current ?? [])];
      return apply([point, ...pointsRef.current], null, focusBoundsFor(point, around));
    },
    [apply],
  );
  // The framing effect calls this, and must not re-run when it changes identity.
  const frameOnRef = useRef(frameOn);
  frameOnRef.current = frameOn;

  /**
   * **A SETTLED RESULT SET MOVES THE CAMERA** (ADR-0168 §1), which is a narrow reversal of
   * ADR-0131 §5 rather than a general one: typing still moves nothing, because this is
   * called when a **response lands**, not when a key goes down.
   *
   * It reads the live view and goes through `searchCameraTarget`, so the decision — and
   * every guard on it — is in the pure half where it can be tested (§13). A `fit` is handed
   * to `apply` as an explicit `want`, which is right for two reasons: the containment
   * question has already been answered (differently from `cameraTargetFor`'s), and a
   * `want` inherits the controls-row inset, the card reserve, the `MAX_FIT` cap and the ease.
   *
   * **Nothing happens before the map has a view.** There is no honest answer to "is this
   * already on screen" without one, and the opening framing owns that moment — the same
   * reason the effect above waits for `idle`. `framed` is marked when we move, exactly as
   * `reframe` does, so the opening fit cannot land a frame later and yank the camera off
   * the answer the search just gave.
   *
   * **AND A VIEW NOBODY FRAMED IS NOT AN ANSWER TO THAT QUESTION EITHER** (ADR-0168 §1's
   * 2026-08-07 amendment; owner: _"map search doesn't pan to results while picking a place
   * for a booking/event"_). A map is CONSTRUCTED with a camera — `defaultCentre` when there
   * is a pin to prefer, and the whole world at `MAP_ZOOM.WORLD` when there is not — and the
   * anti-jitter rule reads that placeholder as a frame: a world view contains every result,
   * so "they are all on screen" is true and the camera never moves. It is the same trap the
   * opening fit's own containment guard was written around (session 134), one population
   * over, and it is why the errand is where it shows: you go to the Map to pick a place for
   * your FIRST booking, so the trip has no pins, so nothing ever framed the map. Passing
   * `null` hands the pure function the reading it already has for it.
   */
  const showResults = useCallback(
    (candidates: readonly LatLng[]) => {
      if (!map) return;
      // A map with no bounds has not rendered; a map with bounds it was born with has not
      // been framed. The first is nothing to answer with, the second is nothing to preserve.
      if (!readMapBounds(map)) return;
      const view = framed.current ? readMapBounds(map) : null;
      const target = searchCameraTarget(candidates, view);
      if (target.kind === 'none') return;
      // A pan keeps the zoom you are on — the same move a pin tap makes (ADR-0129 §1).
      const moved =
        target.kind === 'pan' ? moveTo(target.at, null) : apply(candidates, view, target.bounds);
      if (moved) framed.current = true;
    },
    [map, moveTo, apply],
  );

  const locate = useCallback(
    (point: LatLng) =>
      // The zoom the ease is HEADING for, when one is in flight — see `going`. A second
      // tap during the first one's 480ms would otherwise step in from an interpolated
      // value, which is exactly the desynchronisation #20 was made stateless to avoid.
      moveTo(
        point,
        zoomStepIn(
          going.current?.zoom ?? map?.getZoom(),
          tune(TUNE.zoomPlace, MAP_ZOOM.PLACE),
          tune(TUNE.zoomStepInMax, MAP_ZOOM.STEP_IN_MAX),
        ),
      ),
    [map, moveTo],
  );

  /** **A manual, finger-driven zoom** (ADR-0145 §5). No ease and no `framed` bookkeeping:
   *  the gesture is not a framing, it is the user taking the camera — and ADR-0121 §7's
   *  "a manual pan or zoom wins until the next scope change" then holds with nothing
   *  added, because that rule is implemented as an ABSENCE. The framing effect is keyed on
   *  `setSignal`, a drag zoom does not change it, so no fit runs to fight the finger. */
  const zoomTo = useCallback(
    (zoom: number) => {
      if (!map) return;
      // Kill the ease OUTRIGHT rather than relying on its own stand-down check: that check
      // is what saves us from a pinch we cannot intercept, but this gesture we can, and a
      // frame already queued would otherwise write after us.
      cancelAnimationFrame(raf.current);
      going.current = null;
      wrote.current = null;
      map.moveCamera({ zoom });
    },
    [map],
  );

  /** The double-tap step-zoom, which is ours now only because intercepting the gesture
   *  suppressed Google's (ADR-0145 §2). One level in from wherever the camera is — see
   *  `doubleTapZoom`, and note that this deliberately does NOT reuse locate's `zoomStepIn`:
   *  that ladder's floor turned a double-tap on a globe view into a jump to city zoom.
   *  It goes through the existing ease, so it reads as the same object moving as every
   *  other camera change — which Google's own double-click zoom never did (ADR-0129 §3). */
  const stepZoomIn = useCallback(
    (offsetPx?: WorldPoint) => {
      const centre = map?.getCenter();
      if (!map || !centre) return;
      const from = going.current?.zoom ?? map.getZoom();
      if (from == null) return;
      const to = doubleTapZoom(from);
      const at = { lat: centre.lat(), lng: centre.lng() };
      easeTo({ center: anchoredCentre(map, at, offsetPx, from, to) ?? at, zoom: to });
    },
    [map, easeTo],
  );

  return { reframe, focus, frameOn, keepCentred, showResults, locate, zoomTo, stepZoomIn };
}

/** The map's camera as our own shape, or `null` before it has one. */
function readCamera(map: google.maps.Map): CameraAt | null {
  const centre = map.getCenter();
  const zoom = map.getZoom();
  if (!centre || zoom == null) return null;
  return { center: { lat: centre.lat(), lng: centre.lng() }, zoom };
}

/** Is the camera still where we put it? Compared with a tolerance, because a round trip
 *  through Google's own projection does not return bit-identical coordinates — the
 *  question is "did something MOVE this", not "is this the same float". */
function sameCamera(a: CameraAt | null, b: CameraAt): boolean {
  if (!a) return false;
  return (
    Math.abs(a.zoom - b.zoom) < 0.001 &&
    Math.abs(a.center.lat - b.center.lat) < 1e-6 &&
    Math.abs(a.center.lng - b.center.lng) < 1e-6
  );
}

/** **Where the centre must go for the tapped point to stay put** (ADR-0145 §3), or `null`
 *  when it cannot be worked out — no offset, or a map with no projection yet — in which
 *  case the caller anchors at the centre. Degrading rather than failing matters: a map has
 *  no projection until it has rendered, and a double-tap before then should still zoom.
 */
function anchoredCentre(
  map: google.maps.Map,
  centre: LatLng,
  offsetPx: WorldPoint | undefined,
  fromZoom: number,
  toZoom: number,
): LatLng | null {
  if (!offsetPx || (offsetPx.x === 0 && offsetPx.y === 0)) return null;
  return throughProjection(map, centre, (world) =>
    zoomAboutPoint(world, offsetPx, fromZoom, toZoom),
  );
}

/** **Where a screen point is on the map** — what a long press needs to become a place
 *  (ADR-0147 §2). The offset is from the canvas centre, the same convention the anchored
 *  zoom takes.
 *
 *  It reads the map's own centre and zoom rather than taking them: the gesture knows a
 *  pixel and nothing else, and asking the map what it is currently showing is the one
 *  reading that cannot go stale between the press and the drop. `null` when the map has no
 *  projection or no camera yet — a drop is refused rather than guessed at. */
export function latLngAtOffset(map: google.maps.Map, offsetPx: WorldPoint): LatLng | null {
  const centre = map.getCenter();
  const zoom = map.getZoom();
  if (!centre || zoom == null) return null;
  return throughProjection(map, { lat: centre.lat(), lng: centre.lng() }, (world) =>
    worldPointAtOffset(world, offsetPx, zoom),
  );
}

/** The projection round trip both of the above need: hand Google a coordinate, do one
 *  power-of-two shift in ITS world space, hand the result back for un-projecting.
 *
 *  Extracted from `anchoredCentre` when the long press became its second caller (ADR-0147
 *  §2) rather than copied beside it. **Nothing here constructs a `google.maps.Point`:**
 *  `fromLatLngToPoint` hands one back, so it is mutated and returned to
 *  `fromPointToLatLng` — which keeps this clear of the `google.maps` global entirely, and
 *  means both projections are Google's own (ADR-0129 §3). */
function throughProjection(
  map: google.maps.Map,
  centre: LatLng,
  transform: (world: WorldPoint) => WorldPoint,
): LatLng | null {
  const projection = map.getProjection();
  const world = projection?.fromLatLngToPoint(centre);
  if (!projection || !world) return null;
  const moved = transform(world);
  world.x = moved.x;
  world.y = moved.y;
  const next = projection.fromPointToLatLng(world);
  return next ? { lat: next.lat(), lng: next.lng() } : null;
}
