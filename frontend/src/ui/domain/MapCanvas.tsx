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
import { isGroundSource, mapBackground, mapStyle } from '../../lib/map-style';
import { loadMapLibre, type MapLibreModule } from '../../lib/maplibre';
import { ensurePmtilesArchives } from '../../lib/pmtiles';
import type { MapColorScheme, MapTileUrls } from '../../lib/map-config';
// MapLibre's own stylesheet, which is not decoration: `.maplibregl-marker` is where a
// marker's `position: absolute` comes from, and without it every pin falls into normal flow
// and stacks into a column outside the pane (ADR-0186's 2026-08-13 amendment, finding 1).
import 'maplibre-gl/dist/maplibre-gl.css';

/** Re-exported for this component's own consumers. It is DECLARED in `lib/map-config`, which
 *  is what resolves the URLs — a `lib/` module cannot import from `ui/`, and the shape has one
 *  home rather than two names for one thing (rule 8). */
export type { MapTileUrls };

export interface MapCanvasProps {
  scheme: MapColorScheme;
  urls: MapTileUrls;
  centre: { lat: number; lng: number };
  zoom: number;
  /** Handed the live instance once, and `null` on teardown. The consumer wraps it in
   *  `cameraMapFor` — this component does not decide anything about the camera.
   *
   *  **The module comes with it, and that is not a convenience.** A consumer drawing markers
   *  needs `maplibregl.Marker`, and by the time an instance exists the module is loaded — so
   *  handing it over means markers are constructed in the SAME commit as the map rather than a
   *  microtask later, which is the difference between a pin that is in the DOM when the pin set
   *  changes and one that arrives after. Re-entering `loadMapLibre()` at the consumer would
   *  resolve from the same cache and still cost that hop. */
  onMap: (map: MapLibreMap | null, gl: MapLibreModule | null) => void;
  /**
   * **The first frame with actual ground on it** — the watchdog's input, and the successor to
   * Google's `onTilesLoaded`.
   *
   * **`load` + `idle` is NOT that, and shipping it as if it were put a blank map on the owner's
   * phone with nothing said** (2026-08-14). Both events settle on their own schedule: `load`
   * means the style parsed and a frame was drawn, `idle` means nothing further is pending — and
   * a map whose every tile request 404'd satisfies both, because "nothing pending" includes
   * "nothing left to fail". So the pane latched `tilesPainted`, the watchdog was satisfied, and
   * the cue, the retry pill and the diagnostic — all of which render under `!tilesPainted` —
   * stayed away from a canvas showing nothing but its own background colour. That is field
   * report #28 verbatim, arrived at from a new direction.
   *
   * So this waits for a TILE: MapLibre reports each one through `sourcedata` with the source id
   * and the tile it belongs to, and one such event is proof the archive is being read and parsed.
   * Idles keep coming, so if tiles are merely slow this still fires when they land and clears the
   * notice by itself; if they never come it never fires, and the pane says so.
   */
  onFirstPaint?: () => void;
  /** Every later settle, for the pane's `onViewChange`. */
  onIdle?: () => void;
  /** **One tile of our ground loaded and parsed.** Fired per tile, so the pane can count them
   *  for the diagnostic — which it cannot do any other way: MapLibre fetches on a WORKER thread,
   *  so `performance.getEntriesByType('resource')` on the main thread never sees a tile request
   *  and the old `tiles:N` reading was structurally stuck at zero. */
  onTileLoad?: () => void;
  /** MapLibre's `error` event. Unlike the Google loader there is no page-global status to
   *  get stuck in, so this is per-instance and per-failure.
   *
   *  **A tile that 404s arrives here**, so this is not evidence that the map is dead — the
   *  pane decides that from whether anything ever painted. See `onUnavailable` for the
   *  failure that IS terminal. */
  onError?: (error: Error) => void;
  /** **There is no canvas and there cannot be one** — the renderer module or the `pmtiles`
   *  protocol failed, so construction never happened.
   *
   *  Split from `onError` because the pane's two answers are opposite: this one replaces the
   *  canvas with `ErrorState` in the pane's own slot, where a tile error must change nothing
   *  at all. One callback for both would force the pane to guess which it got, and guessing
   *  wrong in the lenient direction is a blank canvas with no affordance — field report #28. */
  onUnavailable?: (error: Error) => void;
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
  onUnavailable,
  onTileLoad,
}: MapCanvasProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Latest-refs for the callbacks, so a consumer re-rendering every second (which
  // `screens/Map.tsx` does) cannot tear down and rebuild the map. ADR-0121 §4's hazard
  // survives the renderer swap: the reason changes from "a rebuild is billed" to "a rebuild
  // is a blank canvas and a lost camera", and the discipline is identical.
  const cbRef = useRef({ onMap, onFirstPaint, onIdle, onError, onUnavailable, onTileLoad });
  cbRef.current = { onMap, onFirstPaint, onIdle, onError, onUnavailable, onTileLoad };
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
        // **Both archives, with credentials, before the style can ask for a tile.** Registering
        // them is what puts the app's Bearer token on every range read — without it ADR-0020's
        // global guard answers 401 to all of them and the ground never draws (see `lib/pmtiles`).
        await ensurePmtilesArchives(
          [opening.urls.world, opening.urls.trip].filter((url): url is string => !!url),
        );
        if (!live) return;
        const gl = await loadMapLibre();
        if (!live) return;
        const map = new gl.Map({
          container: holder,
          style: mapStyle(opening.scheme, opening.urls),
          // **`[lng, lat]`, not `{lat, lng}`** — MapLibre is GeoJSON-ordered and the app is
          // not. This one line is where the two conventions meet, and it is the reason
          // `cameraMapFor` exists rather than the app learning a second dialect.
          center: [opening.centre.lng, opening.centre.lat],
          zoom: opening.zoom,
          // MapLibre's own attribution control is vendor chrome that ignores an RTL page, and
          // §2 is explicit that we author the chrome rather than switch theirs off. **So the
          // pane renders `MAP_ATTRIBUTION` itself** — switching this off while trusting the
          // style's `attribution` field would show nothing at all, and OSM's ODbL attribution
          // is not optional (ADR-0186's Consequences). See `.map-attrib` in `MapPane`.
          attributionControl: false,
          // ADR-0121 §12's decisions, which stop being suppressions and become choices:
          // there is no vendor POI layer and no vendor UI to disable here.
          keyboard: false,
        });
        mapRef.current = map;

        // **Has any tile of our own ground actually arrived?** A `sourcedata` event carrying a
        // `tile` is one that loaded and parsed — which is the fact `load`/`idle` cannot give us
        // (see `onFirstPaint`). Filtered by source id so a future second source cannot answer for
        // the one the ground is drawn from.
        let tileSeen = false;
        map.on('sourcedata', (event) => {
          if (!live || !event.tile || !isGroundSource(event.sourceId)) return;
          tileSeen = true;
          cbRef.current.onTileLoad?.();
        });

        // One-shot, but *armed* on every idle rather than only the first: tiles that are merely
        // slow arrive after several idles, and the notice has to clear itself when they do.
        let painted = false;
        map.on('idle', () => {
          if (!live) return;
          if (!painted && tileSeen) {
            painted = true;
            cbRef.current.onFirstPaint?.();
          }
          cbRef.current.onIdle?.();
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
          // **A stale token heals itself here.** `apiFetch` rotates the access token on a 401 and
          // the archive's headers were snapshotted at construction, so tiles fetched after a
          // rotation would keep being refused with the map already painted — i.e. silently, since
          // the cue only guards the FIRST paint. Re-setting the headers costs nothing and makes the
          // next tile request carry the current token.
          void ensurePmtilesArchives(
            [opening.urls.world, opening.urls.trip].filter((url): url is string => !!url),
          );
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

        cbRef.current.onMap(map, gl);
      } catch (error) {
        if (!live) return;
        // A failure HERE is the module or the protocol, not a tile: the canvas cannot exist,
        // so say so rather than leaving an empty box. Reported through `onUnavailable`, which
        // is the pane's terminal signal — never through `onError`, which a single missing
        // tile also reaches.
        setFailed(true);
        cbRef.current.onUnavailable?.(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return () => {
      live = false;
      cbRef.current.onMap(null, null);
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
