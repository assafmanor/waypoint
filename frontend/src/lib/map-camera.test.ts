import { describe, expect, it } from 'vitest';
import {
  boundsContain,
  boundsOfPoints,
  cameraTargetFor,
  countPointsInBounds,
  fitPaddingFor,
  pointInBounds,
} from './map-camera';
import { MAP_FIT_PADDING } from '../constants';

const TOKYO = { lat: 35.68, lng: 139.76 };
const KYOTO = { lat: 35.01, lng: 135.77 };

describe('boundsOfPoints (ADR-0121 §7)', () => {
  it('is null for an empty set — no pins, so the camera is left alone', () => {
    expect(boundsOfPoints([])).toBeNull();
  });

  it('spans the extent, not the count: two pins bound both', () => {
    expect(boundsOfPoints([TOKYO, KYOTO])).toEqual({
      north: 35.68,
      south: 35.01,
      east: 139.76,
      west: 135.77,
    });
  });

  it('a single pin has a zero-area extent — which is why it is never fitted', () => {
    expect(boundsOfPoints([TOKYO])).toEqual({
      north: 35.68,
      south: 35.68,
      east: 139.76,
      west: 139.76,
    });
  });
});

describe('bounds containment', () => {
  const view = { north: 36, south: 35, east: 140, west: 135 };

  it('holds a point inside, edges included', () => {
    expect(pointInBounds(view, TOKYO)).toBe(true);
    expect(pointInBounds(view, { lat: 36, lng: 135 })).toBe(true);
    expect(pointInBounds(view, { lat: 37, lng: 139 })).toBe(false);
  });

  it('contains a wholly-inside extent, and not one that pokes out', () => {
    expect(boundsContain(view, { north: 35.9, south: 35.1, east: 139, west: 136 })).toBe(true);
    expect(boundsContain(view, { north: 36.5, south: 35.1, east: 139, west: 136 })).toBe(false);
  });

  // The `באזור` readout: how many of our places are on the canvas right now.
  it('counts the points on the canvas, and nothing before the first idle', () => {
    expect(countPointsInBounds([TOKYO, KYOTO], view)).toBe(2);
    expect(countPointsInBounds([TOKYO, { lat: 1, lng: 1 }], view)).toBe(1);
    expect(countPointsInBounds([TOKYO], null)).toBe(0);
  });
});

describe('cameraTargetFor — it moves only when it owes you something (§7)', () => {
  it('does nothing for an empty set: the empty state speaks', () => {
    expect(cameraTargetFor([], null)).toEqual({ kind: 'none' });
  });

  it('does nothing when the new set already fits the current view', () => {
    const view = { north: 36, south: 34, east: 141, west: 134 };
    // This is what removes the "tap אוכל, map lurches across the city" case while
    // keeping the promise that a chip never leaves results off-canvas.
    expect(cameraTargetFor([TOKYO, KYOTO], view)).toEqual({ kind: 'none' });
  });

  it('centres a single pin rather than fitting it — a zero-area fit maxes the zoom', () => {
    expect(cameraTargetFor([TOKYO], null)).toEqual({ kind: 'centre', at: TOKYO });
  });

  it('centres several EXACTLY coincident pins for the same reason', () => {
    expect(cameraTargetFor([TOKYO, { ...TOKYO }], null)).toEqual({ kind: 'centre', at: TOKYO });
  });

  it('fits anything with real extent, including a multi-city trip', () => {
    expect(cameraTargetFor([TOKYO, KYOTO], null)).toEqual({
      kind: 'fit',
      bounds: { north: 35.68, south: 35.01, east: 139.76, west: 135.77 },
    });
  });

  it('re-fits when the set has grown past the current view', () => {
    const view = { north: 35.7, south: 35.6, east: 139.8, west: 139.7 };
    expect(cameraTargetFor([TOKYO, KYOTO], view).kind).toBe('fit');
  });

  // Near-coincident (but not identical) pins go through `fit`: the caller's shared
  // maxZoom cap covers them and the single-pin case both, rather than a second
  // special case here.
  it('leaves near-coincident pins to the fit + the shared zoom cap', () => {
    const nudged = { lat: TOKYO.lat + 0.0002, lng: TOKYO.lng + 0.0002 };
    expect(cameraTargetFor([TOKYO, nudged], null).kind).toBe('fit');
  });
});

// Session 134 — the two halves of "the map always opens zoomed out and centred".
// Both are here because both are pure, and together they say why the opening framing
// is a third case rather than a re-frame.
describe('why the opening camera has to ignore containment', () => {
  it('a wide view contains everything, so containment says "do not move" forever', () => {
    const world = { north: 85, south: -85, east: 180, west: -180 };
    const day = [
      { lat: 35.68, lng: 139.76 },
      { lat: 35.71, lng: 139.78 },
    ];
    // This is correct for a RE-frame ("the chip's results are all on screen already")
    // and catastrophic for the FIRST one: a map opened on the world would never fit
    // its pins, and no later control change could rescue it either, since the view
    // still contains them. Hence the caller passes `null` for the opening framing.
    expect(cameraTargetFor(day, world)).toEqual({ kind: 'none' });
    expect(cameraTargetFor(day, null).kind).toBe('fit');
  });
});

describe('fitPaddingFor — the other half of the zoom-out', () => {
  const PHONE = { width: 390, height: 320 };

  it('passes the padding through when the viewport can hold it', () => {
    expect(fitPaddingFor(PHONE, MAP_FIT_PADDING)).toEqual(MAP_FIT_PADDING);
  });

  // `fitBounds` with padding eating most of the div resolves to a degenerate
  // viewport and zooms far OUT — losing a pin's tag beats losing the framing.
  it('drops the padding when it would claim half an axis', () => {
    expect(fitPaddingFor({ width: 390, height: 120 }, MAP_FIT_PADDING)).toBeUndefined();
    expect(fitPaddingFor({ width: 100, height: 320 }, MAP_FIT_PADDING)).toBeUndefined();
  });

  // `null` is distinct from "no padding": an unsized div is measured BEFORE layout
  // settles, and there is no honest fit into nothing — the caller waits instead.
  it('refuses outright on an unsized div', () => {
    expect(fitPaddingFor({ width: 0, height: 0 }, MAP_FIT_PADDING)).toBeNull();
    expect(fitPaddingFor({ width: 390, height: 0 }, MAP_FIT_PADDING)).toBeNull();
  });
});
