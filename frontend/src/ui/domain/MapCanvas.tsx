// **The ground, rendered by code we own** (ADR-0186 §1, Phase 2).
//
// One `maplibregl.Map` held in a `useRef`, created once, removed on unmount. No React
// wrapper, deliberately: `react-map-gl` would shorten this file and hand back exactly the
// thing that started field report #35 — a wrapper's module-global, write-once lifecycle
// state that no consumer can reset (`__resetModuleState` is vis.gl's own test-only hook, and
// we shipped a fix that had to call it). Our usage is the seven methods §2 counts. A wrapper
// buys ergonomics we do not need for a lifecycle we would not own.
//
// **What this component deliberately does NOT do.** It does not own pins, the camera, the
// sheet, or any of the decisions in `lib/`. `useMapCamera` drives it through
// `cameraMapFor` (ADR-0186's Phase 1 adapter), and pins stay the DOM elements ADR-0121 §6
// built. This file is the canvas and its lifecycle, nothing else — which is why the swap in
// `MapPane` is a small diff rather than a rewrite.
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { mapBackground, mapStyle } from '../../lib/map-style';
import type { MapColorScheme } from '../../lib/map-config';

/** Where the archives live. Both are read through the `pmtiles://` protocol, so neither this
 *  component nor the style knows whether it got a range read over the network or a local
 *  file (ADR-0186 §3) — which is the single idea that keeps offline from being a second
 *  system. `trip` is absent until the backend has built that trip's extract; the world layer
 *  alone is a correct, coarser map rather than a blank one (§4). */
export interface MapTileUrls {
  world: string;
  trip?: string;
}

export interface MapCanvasProps {
  scheme: MapColorScheme;
  urls: MapTileUrls;
  centre: { lat: number; lng: number };
  zoom: number;
  /** Handed the live instance once, and `null` on teardown. The consumer wraps it in
   *  `cameraMapFor` — this component does not decide anything about the camera. */
  onMap: (map: MapLibreMap | null) => void;
  /** The first settled frame. MapLibre has no single "tiles painted" event, so this is the
   *  first `idle` AFTER `load`: `load` means the style is applied and the first frame is
   *  drawn, `idle` means nothing further is pending. That pair is the honest equivalent of
   *  Google's `onTilesLoaded`, which is what the pane's watchdog waits on. */
  onFirstPaint?: () => void;
  /** Every later settle, for the pane's `onViewChange`. */
  onIdle?: () => void;
  /** MapLibre's `error` event. Unlike the Google loader there is no page-global status to
   *  get stuck in, so this is per-instance and per-failure. */
  onError?: (error: Error) => void;
}

/**
 * **Registering the `pmtiles://` protocol is global, and that is worth being explicit
 * about**, since a page-global is exactly what this migration exists to escape.
 *
 * The distinction that makes it acceptable: `addProtocol` registers a *handler*, not a
 * *status*. There is no success/failure latch, nothing is written once and read forever, and
 * a failed tile read fails that read only. What poisoned the Google path was a one-shot
 * `LOADED`/`FAILED` global that every later map inherited; a URL scheme handler has no such
 * state to inherit.
 *
 * Guarded so a remount does not stack handlers, and never torn down: a second pane mounting
 * while the first is unmounting would otherwise pull the protocol out from under it.
 */
let protocolReady: Promise<void> | null = null;
async function ensurePmtilesProtocol(): Promise<void> {
  protocolReady ??= (async () => {
    const [{ addProtocol }, { Protocol }] = await Promise.all([
      import('maplibre-gl'),
      import('pmtiles'),
    ]);
    const protocol = new Protocol();
    addProtocol('pmtiles', protocol.tile);
  })();
  return protocolReady;
}

export function MapCanvas({
  scheme,
  urls,
  centre,
  zoom,
  onMap,
  onFirstPaint,
  onIdle,
  onError,
}: MapCanvasProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Latest-refs for the callbacks, so a consumer re-rendering every second (which
  // `screens/Map.tsx` does) cannot tear down and rebuild the map. ADR-0121 §4's hazard
  // survives the renderer swap: the reason changes from "a rebuild is billed" to "a rebuild
  // is a blank canvas and a lost camera", and the discipline is identical.
  const cbRef = useRef({ onMap, onFirstPaint, onIdle, onError });
  cbRef.current = { onMap, onFirstPaint, onIdle, onError };
  // Construction-time values, latched: MapLibre takes an opening camera and then owns it, so
  // re-reading these would fight whatever the user or the camera hook last did.
  const openingRef = useRef({ centre, zoom, scheme, urls });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const holder = holderRef.current;
    if (!holder) return;
    const opening = openingRef.current;

    void (async () => {
      try {
        await ensurePmtilesProtocol();
        if (!live) return;
        const { Map: MapLibre } = await import('maplibre-gl');
        if (!live) return;
        const map = new MapLibre({
          container: holder,
          style: mapStyle(opening.scheme, opening.urls),
          // **`[lng, lat]`, not `{lat, lng}`** — MapLibre is GeoJSON-ordered and the app is
          // not. This one line is where the two conventions meet, and it is the reason
          // `cameraMapFor` exists rather than the app learning a second dialect.
          center: [opening.centre.lng, opening.centre.lat],
          zoom: opening.zoom,
          // Our own attribution lives in the style's `attribution` (ADR-0186's
          // `MAP_ATTRIBUTION`); MapLibre's own control is vendor chrome on an RTL page, and
          // §2 is explicit that we author the chrome rather than switch theirs off.
          attributionControl: false,
          // ADR-0121 §12's decisions, which stop being suppressions and become choices:
          // there is no vendor POI layer and no vendor UI to disable here.
          keyboard: false,
        });
        mapRef.current = map;

        // One-shot: the first settled frame is what the pane's watchdog is waiting for.
        map.once('load', () => {
          map.once('idle', () => {
            if (live) cbRef.current.onFirstPaint?.();
          });
        });
        map.on('idle', () => {
          if (live) cbRef.current.onIdle?.();
        });
        map.on('error', (event) => {
          if (!live) return;
          // **MapLibre's error event carries `ErrorLike`, not `Error`** — it has a `message`
          // and no guaranteed `name`, so it cannot be handed straight to anything typed for
          // `Error`. Normalised here rather than at each consumer.
          //
          // A tile that 404s arrives as an `error` too, so this must not be read as "the map
          // is dead" by itself — the pane decides that from whether anything ever painted.
          const raw: unknown = event.error;
          cbRef.current.onError?.(
            raw instanceof Error
              ? raw
              : new Error(
                  typeof raw === 'object' && raw !== null && 'message' in raw
                    ? String((raw as { message: unknown }).message)
                    : 'maplibre error',
                ),
          );
        });

        cbRef.current.onMap(map);
      } catch (error) {
        if (!live) return;
        // A failure HERE is the module or the protocol, not a tile: the canvas cannot exist,
        // so say so rather than leaving an empty box.
        setFailed(true);
        cbRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      live = false;
      cbRef.current.onMap(null);
      // `remove()` releases the WebGL context and every listener. Not doing this is how a
      // tab-switching app accumulates contexts until the browser starts reclaiming them —
      // which is the failure mode session 264 spent a day chasing on the Google renderer.
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Deliberately once per mount. Everything live arrives through `cbRef` or through the
    // camera hook driving the instance; a dependency here would mean rebuilding the map.
  }, []);

  return (
    <div
      className="map-canvas"
      ref={holderRef}
      // The style's own background, painted on the holder so the first frame is the map's
      // ground colour rather than the page showing through while tiles arrive.
      style={{ background: mapBackground(scheme) }}
      data-map-failed={failed ? '' : undefined}
    />
  );
}
