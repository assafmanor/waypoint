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
  zoomStepIn,
  zoomToAtLeast,
  type LatLng,
  type MapBounds,
} from './map-camera';
import { prefersReducedMotion } from './motion';
import { MAP_ZOOM } from '../constants';

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
  /** Centre on a point, zooming **in** to a readable zoom when the view is further
   *  out than one — and never out (ADR-0127 §1). */
  focus: (point: LatLng) => void;
  /** Locate's own move: like `focus`, except a repeat tap steps one level in from
   *  wherever the map is (#20 / ADR-0127 §2). */
  locate: (point: LatLng) => void;
}

export function useMapCamera(
  map: google.maps.Map | null,
  opts: {
    /** The points the camera answers to — the filtered, scoped, pinnable set. */
    points: readonly LatLng[];
    /** Changes exactly when a control changed the SET on purpose. A string, so a
     *  new array identity from a clock tick is not mistaken for a new set. */
    setSignal: string;
    /** An arrival that already knows what you came to look at — `מפה` on an event or
     *  a booking (ADR-0121 §8). It **owns the next framing**, and that is a rule about
     *  which intent wins rather than a guard bolted onto the fit (ADR-0127 §3). */
    arrivalFocus?: LatLng | null;
    /** What the place card occupies at the canvas's bottom, so a fit does not put a pin
     *  under it (ADR-0122 §7, built in ADR-0128 §2). Read through a ref below, never as a
     *  dependency: it changes on a **tap**, and re-running the framing effect for it
     *  would move the camera when a pin is tapped. */
    bottomReserve?: number;
  },
): MapCamera {
  const { points, setSignal, arrivalFocus, bottomReserve = 0 } = opts;
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
  /** The arrival focus this camera still owes, and the identity it was claimed from. */
  const owedFocus = useRef<LatLng | null>(null);
  const lastArrival = useRef<LatLng | null | undefined>(undefined);

  /** The one move both "look at this place" verbs make, differing only in the zoom
   *  they ask for. A zoom change means the view was too far out to read the place at
   *  all, so the journey across it is not worth animating — jump, and let the pan
   *  keep its animation for the case where it is actually legible. */
  const moveTo = useCallback(
    (point: LatLng, zoom: number | null) => {
      if (!map) return;
      if (zoom != null) {
        map.setZoom(zoom);
        map.setCenter(point);
        return;
      }
      if (prefersReducedMotion()) map.setCenter(point);
      else map.panTo(point);
    },
    [map],
  );

  /** Move the camera to suit `candidates`, and report whether it actually did.
   *  `false` also covers "the map is not ready to be fitted", which is what lets the
   *  caller retry rather than record a framing that never happened. */
  const apply = useCallback(
    (candidates: readonly LatLng[], view: MapBounds | null): boolean => {
      if (!map) return false;
      const target = cameraTargetFor(candidates, view);
      if (target.kind === 'none') return false;
      if (target.kind === 'centre') {
        // Never `fitBounds` a zero-area extent — it snaps to building level.
        map.setCenter(target.at);
        map.setZoom(MAP_ZOOM.PLACE);
        return true;
      }
      const box = map.getDiv().getBoundingClientRect();
      // The div's height is both what the padding is affordable AGAINST and what sizes
      // the pins it has to clear (ADR-0123) — one measurement, read where the fit
      // happens rather than kept in state on a screen that re-renders every second.
      const padding = fitPaddingFor(box, mapFitPadding(box.height, bottomReserveRef.current));
      // An unsized div has no honest fit — wait for one rather than zoom to nothing.
      if (padding === null) return false;
      // Padded by a pin's own height at the top: the teardrop's TIP is the anchor,
      // so its body and any tag extend ABOVE the coordinate.
      map.fitBounds(target.bounds, padding);
      // One shared cap covers the single pin above and a cluster of near-coincident
      // ones here, rather than a second special case. Clamped AFTER the fit rather
      // than set as the map's own `maxZoom`, which would also stop the user pinching
      // in — and leaves nothing to restore afterwards.
      const zoom = map.getZoom();
      if (zoom != null && zoom > MAP_ZOOM.MAX_FIT) map.setZoom(MAP_ZOOM.MAX_FIT);
      return true;
    },
    [map],
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
    if (arrivalFocus !== lastArrival.current) {
      lastArrival.current = arrivalFocus;
      if (arrivalFocus) owedFocus.current = arrivalFocus;
    }
    const openingFrame = !framed.current;
    const run = () => {
      // **An arrival focus IS the frame, not a pan layered on top of one.** The fit
      // does not run for it, so the two no longer race and there is nothing to
      // out-time — which is the third instance of one family (the fit winning when
      // something else should have: ADR-0121's session-134 entry, session 139's refit
      // guard), and the reason this is a rule about which intent owns the frame.
      const owed = owedFocus.current;
      if (owed) {
        owedFocus.current = null;
        moveTo(owed, MAP_ZOOM.PLACE);
        framed.current = true;
        return true;
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
    const listener = map.addListener('idle', () => {
      if (run()) listener.remove();
    });
    return () => listener.remove();
    // `setSignal` is the control dependency; re-running on `points` identity would
    // re-frame on every clock tick. `hasPoints` covers pins arriving after the map,
    // and `arrivalFocus` is what lets an arrival claim the frame whenever it lands —
    // before the map is sized, or after the fit already took it.
  }, [map, apply, moveTo, setSignal, hasPoints, arrivalFocus]);

  const reframe = useCallback(
    (candidates: readonly LatLng[]) => {
      if (apply(candidates, null)) framed.current = true;
    },
    [apply],
  );

  const focus = useCallback(
    (point: LatLng) => moveTo(point, zoomToAtLeast(map?.getZoom(), MAP_ZOOM.PLACE)),
    [map, moveTo],
  );

  const locate = useCallback(
    (point: LatLng) =>
      moveTo(point, zoomStepIn(map?.getZoom(), MAP_ZOOM.PLACE, MAP_ZOOM.STEP_IN_MAX)),
    [map, moveTo],
  );

  return { reframe, focus, locate };
}
