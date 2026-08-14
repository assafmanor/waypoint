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

  it('projects into WORLD space (mercator × 256), not screen pixels', () => {
    // The whole reason this is not `map.project()`: the camera does its own power-of-two
    // shifts in Google's world space, and screen pixels are a different coordinate system
    // that would still typecheck and still produce plausible-looking numbers.
    const at = { lat: 35.6595, lng: 139.7005 };
    const point = cameraMapFor(fakeMapLibre()).getProjection()!.fromLatLngToPoint(at)!;
    const m = MercatorCoordinate.fromLngLat([at.lng, at.lat]);
    expect(point.x).toBeCloseTo(m.x * 256, 6);
    expect(point.y).toBeCloseTo(m.y * 256, 6);
    // Sanity against the convention itself: the whole world is 256 wide at zoom 0, so
    // Tokyo sits a little past three-quarters across it.
    expect(point.x).toBeGreaterThan(192);
    expect(point.x).toBeLessThan(256);
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
