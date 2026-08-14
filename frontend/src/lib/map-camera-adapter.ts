// **The seam between our camera and whoever is drawing** (ADR-0186 §2).
//
// `useMapCamera` is ~700 lines encoding decisions four ADRs argued about — what a fit
// reserves (0128 §2), when the camera is allowed to move at all (0127 §1, 0129 §3), how a
// selection re-centres in a band that changed under it (0122 §7). None of that is about
// Google. So the renderer swap does **not** rewrite it: it narrows what the camera asks
// for to the seven methods it actually calls, and hands MapLibre a facade with that shape.
//
// The alternative was porting 700 lines of camera logic and its ~60-line fake map, to
// arrive at the same behaviour with every one of those decisions re-typed. This is the
// smaller diff AND the one that cannot silently change a rule.
//
// **The facade speaks Google's dialect, deliberately** — `getCenter()` returns an object
// whose `lat`/`lng` are METHODS. `useMapCamera` has a comment about exactly that trap
// (reading them as numbers yields `NaN` all the way to a shift of 0, a silent no-op), and
// changing the dialect would invalidate that comment and the code under it. The dialect is
// the contract; the vendor behind it is not.
import { MercatorCoordinate, type LngLatBoundsLike, type Map as MapLibreMap } from 'maplibre-gl';

/** A coordinate in Google's dialect: accessors, not properties. */
export interface CameraLatLng {
  lat(): number;
  lng(): number;
}

/** A point in the projection's world space — see {@link CameraProjection}. */
export interface CameraWorldPoint {
  x: number;
  y: number;
}

/**
 * **World space, which is mercator × 256.**
 *
 * That is Google's convention (one 256px tile at zoom 0), and `useMapCamera` does its own
 * power-of-two shifts in it. MapLibre's `project()` is SCREEN pixels and would be the
 * wrong space entirely; `MercatorCoordinate` is normalised [0,1] and is the true
 * equivalent, so the adapter scales it rather than approximating with screen coordinates.
 */
export interface CameraProjection {
  fromLatLngToPoint(at: { lat: number; lng: number }): CameraWorldPoint | null;
  fromPointToLatLng(point: CameraWorldPoint): CameraLatLng | null;
}

/** Everything our own code asks of a map — `useMapCamera`, `useCanvasGestures`, `PinDensity`
 *  and (for `resize` alone) `MapPane` — counted from the call sites rather than remembered,
 *  and deliberately nothing more. */
export interface CameraMap {
  getZoom(): number | undefined;
  getCenter(): CameraLatLng | undefined;
  getDiv(): HTMLElement;
  getProjection(): CameraProjection | undefined;
  getBounds(): { getNorthEast(): CameraLatLng; getSouthWest(): CameraLatLng } | null | undefined;
  /** **The map's own zoom limits, which the drag zoom clamps itself to** (ADR-0145 §5).
   *
   *  These are the one place the counted-seven was short, and the compiler is what found it:
   *  `useCanvasGestures` read them as `map.get('minZoom')` — Google's untyped `MVCObject`
   *  accessor, which type-checks against anything and so hid itself from the count. MapLibre
   *  has real accessors, so the string keys go. `undefined` stays legal: `dragZoomLimits`
   *  already falls back to `MAP_DRAG_ZOOM.MIN`/`.MAX` for a map that states no limits. */
  getMinZoom(): number | null | undefined;
  getMaxZoom(): number | null | undefined;
  moveCamera(camera: { center?: { lat: number; lng: number }; zoom?: number }): void;
  fitBounds(
    bounds: { north: number; south: number; east: number; west: number },
    padding?: { top: number; bottom: number; left: number; right: number },
  ): void;
  addListener(type: string, handler: () => void): { remove(): void };
  /** **Re-measure the container.** Not a camera verb, and here because it is the pane's one
   *  remaining ask of the instance: MapLibre measures its container once at construction
   *  (ADR-0186's 2026-08-13 amendment, finding 3), where Google resized itself. `MapPane`
   *  wires it to the resize observer it already runs for the camera's own band, so the two
   *  reads of "the box changed" cannot drift apart. */
  resize(): void;
}

/** Google's world tile size at zoom 0. The one number that makes mercator and Google's
 *  world space the same coordinate system. */
const WORLD_TILE_SIZE = 256;

const asLatLng = (lat: number, lng: number): CameraLatLng => ({ lat: () => lat, lng: () => lng });

/** MapLibre's camera events, under the names the app already listens for. `idle` is the
 *  same word in both; Google's `zoom_changed` is MapLibre's `zoom`. Anything unmapped
 *  passes through, so a new listener does not need an entry here to work. */
const EVENT_ALIASES: Record<string, string> = { zoom_changed: 'zoom' };

/**
 * Present a MapLibre map as the camera's `CameraMap`.
 *
 * Cheap and stateless — a plain object over the live instance, so there is nothing to keep
 * in sync and nothing that can go stale between a press and a drop.
 */
export function cameraMapFor(map: MapLibreMap): CameraMap {
  return {
    getZoom: () => map.getZoom(),
    getCenter: () => {
      const c = map.getCenter();
      return asLatLng(c.lat, c.lng);
    },
    getDiv: () => map.getContainer(),
    resize: () => map.resize(),
    getMinZoom: () => map.getMinZoom(),
    getMaxZoom: () => map.getMaxZoom(),
    // **`null` when there are no bounds, and this is load-bearing rather than defensive.**
    // The first version wrapped unconditionally, so it returned a truthy object even when the
    // map had none — which breaks the contract in two places at once. `readMapBounds` opens
    // with `if (!bounds) return null` and could never fire it, then threw on `getNorth()` of
    // `undefined` inside a React effect. And `useMapCamera` reads a FALSY `getBounds()` as "the
    // map has not rendered, defer the framing to its own `idle`" (the hazard ADR-0121's
    // session-134 entry describes: fitting into an unrendered map resolves to a wild zoom-out,
    // and §7's containment guard then makes it permanent because a zoomed-out view contains
    // every pin forever). A wrapper that is always truthy tells it the opposite.
    getBounds: () => {
      const b = map.getBounds() as ReturnType<MapLibreMap['getBounds']> | null | undefined;
      if (!b) return null;
      return {
        getNorthEast: () => asLatLng(b.getNorth(), b.getEast()),
        getSouthWest: () => asLatLng(b.getSouth(), b.getWest()),
      };
    },
    getProjection: () => ({
      fromLatLngToPoint: ({ lat, lng }) => {
        // Off-globe latitudes have no mercator point; `useMapCamera` already treats a
        // null projection result as "refuse the move" rather than guessing.
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85.051129) {
          return null;
        }
        const m = MercatorCoordinate.fromLngLat([lng, lat]);
        return { x: m.x * WORLD_TILE_SIZE, y: m.y * WORLD_TILE_SIZE };
      },
      fromPointToLatLng: ({ x, y }) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const ll = new MercatorCoordinate(x / WORLD_TILE_SIZE, y / WORLD_TILE_SIZE, 0).toLngLat();
        return asLatLng(ll.lat, ll.lng);
      },
    }),
    // **`jumpTo`, never `easeTo`.** `useMapCamera` owns its own easing and cancellation
    // (ADR-0129 §3's one-eased-driver invariant); a second easer underneath would be two
    // drivers on one map, which is the thing that invariant exists to prevent.
    moveCamera: ({ center, zoom }) => {
      map.jumpTo({
        ...(center ? { center: [center.lng, center.lat] } : {}),
        ...(zoom != null ? { zoom } : {}),
      });
    },
    fitBounds: (bounds, padding) => {
      const box: LngLatBoundsLike = [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ];
      // Padding arrives in the same object shape Google took, which is also MapLibre's —
      // so ADR-0128 §2's card reserve crosses unchanged.
      map.fitBounds(box, { padding, animate: false });
    },
    addListener: (type, handler) => {
      const event = EVENT_ALIASES[type] ?? type;
      map.on(event as 'idle', handler);
      return { remove: () => map.off(event as 'idle', handler) };
    },
  };
}
