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
  return null;
}
