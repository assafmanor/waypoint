import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { publishMapReading } from '../lib/dev-tuning';

// Dev-only — `MapPane` renders it inside `<Map>` behind `import.meta.env.DEV`, so a
// production build drops the element, this module and everything it imports.
//
// It exists because the live zoom is the readout the ladder's four tunables are calibrated
// against (ADR-0146 §1b) and only the `google.maps.Map` knows it. **It is deliberately
// `PinDensity`'s shape** (ADR-0128 §1): a null-rendering child that takes the map from
// context, listens on `zoom_changed`, and writes somewhere React is not looking. Holding
// no state, it cannot re-render `MapPane` — which on this surface is the difference
// between a dev tool and a marker re-diff on every zoom event (ADR-0121 §4).
export function DevMapProbe({ mapId }: { mapId: string }) {
  const map = useMap(mapId);
  useEffect(() => {
    if (!map) return;
    const sync = () => publishMapReading({ zoom: map.getZoom() ?? null });
    sync();
    const listener = map.addListener('zoom_changed', sync);
    return () => listener.remove();
  }, [map]);

  // **WebGL context loss** (field report #28's device-pass capture, backlog workstream M)
  // — the one load-failure signal production (`MapPane`'s own `mapFailed`) deliberately does
  // NOT act on: a context lost after the map already painted once is "recovered mid-session",
  // a different question from "did it ever load" (§1a stays scoped to the latter). A real DOM
  // event on the canvas Google draws into, so the device pass that finally reproduces #28 on a
  // phone can tell this failure mode from the others rather than guessing from a blank canvas.
  useEffect(() => {
    if (!map) return;
    // Optional-chained on `querySelector` itself, not only its result: the suite's own
    // map fake (`MapPane.test.tsx`'s `FakeZoomMap`) returns a `getDiv()` that is not a
    // real element, and this probe must stay inert against that rather than throw.
    const canvas = map.getDiv?.()?.querySelector?.('canvas');
    if (!canvas) return;
    const lost = () => publishMapReading({ webglContextLost: true });
    const restored = () => publishMapReading({ webglContextLost: false });
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [map]);

  // Trivially reachable and one of the report's own candidates: a device abroad losing its
  // connection mid-session reads identically to a tile failure on the canvas alone.
  useEffect(() => {
    const sync = () => publishMapReading({ online: navigator.onLine });
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return null;
}
