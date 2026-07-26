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
// Reduced motion: the camera still MOVES, only the easing is dropped — a pan
// becomes a jump (ADR-0098 §4).
import { useCallback, useEffect, useRef } from 'react';
import { cameraTargetFor, type LatLng, type MapBounds } from './map-camera';
import { prefersReducedMotion } from './motion';
import { MAP_FIT_PADDING, MAP_ZOOM } from '../constants';

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

  const apply = useCallback(
    (candidates: readonly LatLng[], view: MapBounds | null) => {
      if (!map) return;
      const target = cameraTargetFor(candidates, view);
      if (target.kind === 'none') return;
      if (target.kind === 'centre') {
        // Never `fitBounds` a zero-area extent — it snaps to building level.
        map.setCenter(target.at);
        map.setZoom(MAP_ZOOM.SINGLE_PIN);
        return;
      }
      // One shared cap covers the single pin above and a cluster of
      // near-coincident ones here, rather than a second special case. It is set
      // around the fit only: capping the map's own `maxZoom` would also stop the
      // user pinching in, which is not what the guard is for.
      map.setOptions({ maxZoom: MAP_ZOOM.MAX_FIT });
      // Padded by a pin's own height at the top: the teardrop's TIP is the anchor,
      // so its body and any tag extend ABOVE the coordinate.
      map.fitBounds(target.bounds, { ...MAP_FIT_PADDING });
      map.setOptions({ maxZoom: null });
    },
    [map],
  );

  // The set changed → re-frame, but only if it does not already fit the view.
  useEffect(() => {
    apply(pointsRef.current, readMapBounds(map));
    // `setSignal` is the whole dependency on purpose (hence the ref above):
    // re-running on `points` identity would re-frame on every clock tick.
  }, [setSignal, apply]);

  const reframe = useCallback((candidates: readonly LatLng[]) => apply(candidates, null), [apply]);

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
