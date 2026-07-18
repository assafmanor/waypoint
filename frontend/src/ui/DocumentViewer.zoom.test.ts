import { describe, expect, it } from 'vitest';
import { clampZoom, pinchTransform, zoomAtPoint, type PinchStart } from './DocumentViewer';

const start: PinchStart = {
  dist: 100,
  mid: { x: 200, y: 200 },
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

describe('zoomAtPoint', () => {
  it('leaves the tapped point stationary', () => {
    const point = { x: 120, y: 90 };
    const r = zoomAtPoint(point, { x: 0, y: 0 }, { scale: 1, tx: 0, ty: 0 }, 2.5);
    // screen = origin + t + scale * contentPoint; the tapped point maps back to itself.
    expect(r.tx + r.scale * point.x).toBeCloseTo(point.x, 5);
    expect(r.ty + r.scale * point.y).toBeCloseTo(point.y, 5);
  });
});
