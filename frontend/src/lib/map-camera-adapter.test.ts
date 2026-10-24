// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MercatorCoordinate } from 'maplibre-gl';
import { cameraMapFor } from './map-camera-adapter';

/* The seam ADR-0186 §2 rests on. Every case here is one where getting it wrong produces a
   camera that MOVES WRONG rather than one that throws — which is why the adapter is
   tested at all rather than trusted for being thin. */

function fakeMapLibre(overrides: Record<string, unknown> = {}) {
  return {
    getZoom: () => 14,
    getCenter: () => ({ lat: 35.6595, lng: 139.7005 }),
    getContainer: () => document.createElement('div'),
    getBounds: () => ({
      getNorth: () => 35.7,
      getSouth: () => 35.6,
      getEast: () => 139.8,
      getWest: () => 139.6,
    }),
    resize: vi.fn(),
    getMinZoom: () => 2,
    getMaxZoom: () => 18,
    jumpTo: vi.fn(),
    fitBounds: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    ...overrides,
  } as never;
}

describe('cameraMapFor', () => {
  it('hands back coordinates as METHODS, which is the dialect the camera reads', () => {
    // `useMapCamera` documents this trap: reading them as properties yields NaN all the
    // way to a shift of 0 — a silent no-op, never a throw. The dialect is the contract.
    const centre = cameraMapFor(fakeMapLibre()).getCenter()!;
    expect(typeof centre.lat).toBe('function');
    expect(centre.lat()).toBeCloseTo(35.6595, 6);
    expect(centre.lng()).toBeCloseTo(139.7005, 6);
  });

  it('projects into WORLD space, not screen pixels', () => {
    // The whole reason this is not `map.project()`: the camera does its own power-of-two
    // shifts in world space, and screen pixels are a different coordinate system that would
    // still typecheck and still produce plausible-looking numbers.
    const at = { lat: 35.6595, lng: 139.7005 };
    const point = cameraMapFor(fakeMapLibre()).getProjection()!.fromLatLngToPoint(at)!;
    const m = MercatorCoordinate.fromLngLat([at.lng, at.lat]);
    expect(point.x / point.y).toBeCloseTo(m.x / m.y, 9);
  });

  it('scales world space so that screenPx = worldUnits × 2^zoom on THIS renderer', () => {
    // **The one assertion the shipped adapter did not make, and the 2× bug it let through**
    // (2026-08-14). It scaled mercator by Google's 256 while MapLibre draws a 512px world at
    // zoom 0, so every conversion the camera makes between a pixel and a coordinate was
    // doubled: a long press dropped its pin twice as far from the centre as the finger, and
    // the selected-place pan overshot the visible band by the same factor.
    //
    // Asserted against MapLibre's own `worldSize = 512 × 2^zoom` rather than against our
    // constant — restating the constant is exactly what the old test did, and it passed.
    const MAPLIBRE_WORLD_PX_AT_Z0 = 512;
    const zoom = 14;
    const offsetPx = 100;
    const at = { lat: 35.6595, lng: 139.7005 };
    const projection = cameraMapFor(fakeMapLibre()).getProjection()!;

    const world = projection.fromLatLngToPoint(at)!;
    const shifted = projection.fromPointToLatLng({
      x: world.x + offsetPx * 2 ** -zoom,
      y: world.y,
    })!;

    const m = MercatorCoordinate.fromLngLat([at.lng, at.lat]);
    const expected = new MercatorCoordinate(
      m.x + offsetPx / (MAPLIBRE_WORLD_PX_AT_Z0 * 2 ** zoom),
      m.y,
      0,
    ).toLngLat();
    expect(shifted.lng()).toBeCloseTo(expected.lng, 9);
  });

  it('round-trips a coordinate through the projection', () => {
    const projection = cameraMapFor(fakeMapLibre()).getProjection()!;
    const at = { lat: 35.6595, lng: 139.7005 };
    const back = projection.fromPointToLatLng(projection.fromLatLngToPoint(at)!)!;
    expect(back.lat()).toBeCloseTo(at.lat, 9);
    expect(back.lng()).toBeCloseTo(at.lng, 9);
  });

  it('refuses a coordinate with no mercator point rather than guessing one', () => {
    // Past the mercator limit. `useMapCamera` treats null as "refuse the move", which is
    // the honest answer; an Infinity here would move the camera somewhere absurd.
    const projection = cameraMapFor(fakeMapLibre()).getProjection()!;
    expect(projection.fromLatLngToPoint({ lat: 89, lng: 0 })).toBeNull();
    expect(projection.fromLatLngToPoint({ lat: Number.NaN, lng: 0 })).toBeNull();
    expect(projection.fromPointToLatLng({ x: Number.NaN, y: 0 })).toBeNull();
  });

  it('moves with jumpTo, never an ease, because the camera owns easing', () => {
    // ADR-0129 §3's one-eased-driver invariant: a second easer underneath would be two
    // drivers on one map, and they would fight rather than error.
    const map = fakeMapLibre();
    cameraMapFor(map).moveCamera({ center: { lat: 1, lng: 2 }, zoom: 9 });
    expect((map as unknown as { jumpTo: ReturnType<typeof vi.fn> }).jumpTo).toHaveBeenCalledWith({
      center: [2, 1],
      zoom: 9,
    });
  });

  it('passes fit padding straight through, so the card reserve crosses unchanged', () => {
    const map = fakeMapLibre();
    const padding = { top: 10, bottom: 90, left: 8, right: 8 };
    cameraMapFor(map).fitBounds({ north: 1, south: 0, east: 3, west: 2 }, padding);
    const call = (map as unknown as { fitBounds: ReturnType<typeof vi.fn> }).fitBounds.mock
      .calls[0]!;
    expect(call[0]).toEqual([
      [2, 0],
      [3, 1],
    ]);
    expect(call[1]).toMatchObject({ padding, animate: false });
  });

  it('reads bounds corner-wise, in the shape the camera destructures', () => {
    const bounds = cameraMapFor(fakeMapLibre()).getBounds()!;
    expect(bounds.getNorthEast().lat()).toBe(35.7);
    expect(bounds.getNorthEast().lng()).toBe(139.8);
    expect(bounds.getSouthWest().lat()).toBe(35.6);
    expect(bounds.getSouthWest().lng()).toBe(139.6);
  });

  it('translates the one event name that differs, and removes what it added', () => {
    const map = fakeMapLibre();
    const handler = () => {};
    const listener = cameraMapFor(map).addListener('zoom_changed', handler);
    const on = (map as unknown as { on: ReturnType<typeof vi.fn> }).on;
    expect(on.mock.calls[0]![0]).toBe('zoom');
    listener.remove();
    const off = (map as unknown as { off: ReturnType<typeof vi.fn> }).off;
    expect(off.mock.calls[0]).toEqual(['zoom', handler]);
  });

  it('passes an unaliased event through unchanged', () => {
    const map = fakeMapLibre();
    cameraMapFor(map).addListener('idle', () => {});
    expect((map as unknown as { on: ReturnType<typeof vi.fn> }).on.mock.calls[0]![0]).toBe('idle');
  });
});

/* **The two the count missed.** `useCanvasGestures` clamps the drag zoom to the map's own
   limits, and it read them as `map.get('minZoom')` — Google's untyped `MVCObject` accessor,
   which satisfies any type and so hid itself from ADR-0186 §2's table of seven. The compiler
   found it the moment the hook was retyped to `CameraMap`; MapLibre has real accessors, so
   the string keys are gone. Asserted here because a silently absent limit is not a throw —
   `dragZoomLimits` falls back to `MAP_DRAG_ZOOM`'s own numbers, so the gesture would simply
   stop respecting the map's range and nothing would fail. */
describe('the zoom limits the drag gesture clamps to', () => {
  it('reports the map’s own range', () => {
    const camera = cameraMapFor(fakeMapLibre());
    expect(camera.getMinZoom()).toBe(2);
    expect(camera.getMaxZoom()).toBe(18);
  });

  it('passes an unstated limit through as-is, for `dragZoomLimits` to default', () => {
    const camera = cameraMapFor(
      fakeMapLibre({ getMinZoom: () => undefined, getMaxZoom: () => undefined }),
    );
    expect(camera.getMinZoom()).toBeUndefined();
    expect(camera.getMaxZoom()).toBeUndefined();
  });
});

/* **The bug the renderer swap found, and it was not in the swap.** The first version of
   `getBounds` wrapped unconditionally, so it handed back a truthy object for a map with no
   bounds — and `useMapCamera` reads a falsy answer as "this map has not rendered, defer the
   framing to its own `idle`". Two failures in one line: `readMapBounds`'s `if (!bounds)` guard
   became unreachable and then threw on `getNorth()` of `undefined` inside a React effect, and
   the opening framing lost the signal that keeps it from fitting into an unrendered map (the
   whole-world camera of ADR-0121's session-134 entry). Caught only when `MapPane`'s own suite
   started driving the real adapter. */
describe('a map with no bounds yet', () => {
  it('answers null rather than a wrapper around nothing', () => {
    expect(cameraMapFor(fakeMapLibre({ getBounds: () => undefined })).getBounds()).toBeNull();
    expect(cameraMapFor(fakeMapLibre({ getBounds: () => null })).getBounds()).toBeNull();
  });
});
