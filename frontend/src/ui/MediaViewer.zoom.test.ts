// The pinch's arithmetic. The GESTURE it serves — the picture leaving the card and going home
// when a finger lifts — is in `MediaViewer.test.tsx`; this file is only the maths, which is
// what makes the focal point assertable at all without a layout engine.
import { describe, expect, it } from 'vitest';
import { clampToRect, clampZoom, pinchTransform, type PinchStart } from './MediaViewer';

/** Fingers ON the picture: the anchor IS the midpoint, which is every case that existed before
 *  the gesture belonged to the whole screen. */
const start: PinchStart = {
  dist: 100,
  mid: { x: 200, y: 200 },
  anchor: { x: 200, y: 200 },
  transform: { scale: 1, tx: 0, ty: 0 },
  origin: { x: 0, y: 0 },
};

describe('clampZoom', () => {
  it('holds scale within [1, 4]', () => {
    expect(clampZoom(0.3)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(9)).toBe(4);
  });
});

describe('pinchTransform', () => {
  it('scales by the finger-distance ratio', () => {
    expect(pinchTransform(start, start.mid, 200).scale).toBe(2);
  });

  it('keeps the content point under a stationary midpoint fixed', () => {
    // Fingers spread around the same midpoint: that point must not drift.
    const r = pinchTransform(start, start.mid, 250);
    expect(r.tx).toBeCloseTo(start.mid.x - r.scale * start.mid.x, 5);
    expect(r.ty).toBeCloseTo(start.mid.y - r.scale * start.mid.y, 5);
  });

  it('pans when the midpoint moves', () => {
    const noZoom = pinchTransform(start, { x: 260, y: 230 }, start.dist);
    expect(noZoom.scale).toBe(1);
    expect(noZoom.tx).toBeCloseTo(60, 5);
    expect(noZoom.ty).toBeCloseTo(30, 5);
  });

  it('respects the max-zoom clamp', () => {
    expect(pinchTransform(start, start.mid, 1000).scale).toBe(4);
  });
});

// **FINGERS OFF THE PICTURE** (2026-08-06). The gesture is the whole screen's now, so the
// midpoint is often outside the box — and an anchor the image does not contain is the one that
// sends it flying, because holding that point still means moving everything else away from it.
describe('pinchTransform with a clamped anchor', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  // Fingers 300px below the picture; the anchor lands on its bottom edge, right below them.
  const below: PinchStart = {
    ...start,
    mid: { x: 50, y: 400 },
    anchor: clampToRect({ x: 50, y: 400 }, rect),
  };

  it('does not move the picture at all before the fingers do', () => {
    // The clamp must be free at rest, or every pinch outside the box would open with a jolt.
    const r = pinchTransform(below, below.mid, below.dist);
    expect(r.scale).toBe(1);
    expect(r.tx).toBeCloseTo(0, 5);
    expect(r.ty).toBeCloseTo(0, 5);
  });

  it('grows the picture from the edge nearest the fingers, not away from them', () => {
    const r = pinchTransform(below, below.mid, 200); // 2×
    // The anchored point — the bottom edge under the fingers — is exactly where it was.
    expect(r.ty + r.scale * rect.height).toBeCloseTo(rect.height, 5);
    // So the picture grows UPWARD: its top rises by its own height, and does not travel the
    // ~300px toward the fingers that an unclamped focal point would have moved it.
    expect(r.ty).toBeCloseTo(-100, 5);
  });

  it('still pans with the fingers once they move', () => {
    const r = pinchTransform(below, { x: 90, y: 380 }, below.dist);
    expect(r.scale).toBe(1);
    expect(r.tx).toBeCloseTo(40, 5);
    expect(r.ty).toBeCloseTo(-20, 5);
  });
});

describe('clampToRect', () => {
  const rect = { left: 10, top: 20, width: 100, height: 50 };

  it('leaves a point inside the box alone', () => {
    expect(clampToRect({ x: 40, y: 40 }, rect)).toEqual({ x: 40, y: 40 });
  });

  it('brings a point outside it to the nearest edge, per axis', () => {
    expect(clampToRect({ x: 400, y: 40 }, rect)).toEqual({ x: 110, y: 40 });
    expect(clampToRect({ x: 40, y: 0 }, rect)).toEqual({ x: 40, y: 20 });
    expect(clampToRect({ x: -5, y: 500 }, rect)).toEqual({ x: 10, y: 70 });
  });
});
