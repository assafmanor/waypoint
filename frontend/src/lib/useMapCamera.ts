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
//   • **Focusing** answers a selection. It PANS at the current zoom and never
//     changes it — zooming on selection throws away the context you were reading.
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
  /** Re-frame the given points now, whatever the current view (the re-centre
   *  control's escape hatch from "a manual pan wins"). */
  reframe: (points: readonly LatLng[]) => void;
  /** Centre on a point at the current zoom. */
  focus: (point: LatLng) => void;
}

export function useMapCamera(
  map: google.maps.Map | null,
  opts: {
    /** The points the camera answers to — the filtered, scoped, pinnable set. */
    points: readonly LatLng[];
    /** Changes exactly when a control changed the SET on purpose. A string, so a
     *  new array identity from a clock tick is not mistaken for a new set. */
    setSignal: string;
  },
): MapCamera {
  const { points, setSignal } = opts;
  // Latest-ref: the effect below is keyed on the signal alone, so it must read
  // the current points rather than close over the ones from the render that
  // happened to change the signal.
  const pointsRef = useRef(points);
  pointsRef.current = points;
  /** Has this map instance ever been framed? Until it has, there is no view worth
   *  preserving — so the opening framing is unconditional. */
  const framed = useRef(false);

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
        map.setZoom(MAP_ZOOM.SINGLE_PIN);
        return true;
      }
      const box = map.getDiv().getBoundingClientRect();
      // The div's height is both what the padding is affordable AGAINST and what sizes
      // the pins it has to clear (ADR-0123) — one measurement, read where the fit
      // happens rather than kept in state on a screen that re-renders every second.
      const padding = fitPaddingFor(box, mapFitPadding(box.height));
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
    const openingFrame = !framed.current;
    const run = () => {
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
    // re-frame on every clock tick. `hasPoints` covers pins arriving after the map.
  }, [map, apply, setSignal, hasPoints]);

  const reframe = useCallback(
    (candidates: readonly LatLng[]) => {
      if (apply(candidates, null)) framed.current = true;
    },
    [apply],
  );

  const focus = useCallback(
    (point: LatLng) => {
      if (!map) return;
      if (prefersReducedMotion()) map.setCenter(point);
      else map.panTo(point);
    },
    [map],
  );

  return { reframe, focus };
}
