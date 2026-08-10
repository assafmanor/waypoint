import { describe, expect, it } from 'vitest';
import { MAX_VIEWPORT_SPAN_DEG, isSendableViewport } from './geo';

/* ── VIEWPORT BIAS (field report #34) ────────────────────────────────────────────────────────
   The bias is optional ranking context, so this predicate exists to DROP a rectangle Google
   would refuse — never to clamp one into a region the user is not looking at. The haversine
   above it is covered through `frontend/src/lib/distance.test.ts`, its first consumer. */
describe('isSendableViewport', () => {
  // Derived from the cap, never fixtured against a literal 180, so raising or lowering the
  // constant cannot leave a case passing while testing nothing.
  const HALF_CAP = MAX_VIEWPORT_SPAN_DEG / 2;

  it('accepts an ordinary city viewport', () => {
    expect(isSendableViewport({ south: 35.6, west: 139.6, north: 35.75, east: 139.8 })).toBe(true);
  });

  it('refuses a viewport wider than the cap, which is the production 400', () => {
    // The world view `readMapBounds` hands over at minimum zoom: a 360° span.
    expect(isSendableViewport({ south: -85, west: -180, north: 85, east: 180 })).toBe(false);
    // Exactly at the cap is sendable; one degree past it is not.
    expect(isSendableViewport({ south: -10, west: -HALF_CAP, north: 10, east: HALF_CAP })).toBe(
      true,
    );
    expect(isSendableViewport({ south: -10, west: -HALF_CAP - 1, north: 10, east: HALF_CAP })).toBe(
      false,
    );
  });

  it('measures a wrapped (antimeridian) viewport by its real span, not by the subtraction', () => {
    // Auckland↔Fiji across ±180: west > east, true span 10° — sendable, and Google reads the
    // inverted longitude range as the crossing it is.
    expect(isSendableViewport({ south: -20, west: 175, north: -15, east: -175 })).toBe(true);
    // A wrapped world view: the naive `east - west` is a harmless-looking -0.1 where the real
    // span is 359.9. This is the case a plain subtraction lets through as an invalid rectangle.
    expect(isSendableViewport({ south: -85, west: 100, north: 85, east: 99.9 })).toBe(false);
  });

  it('refuses non-finite, out-of-range and inverted coordinates — omitted, never sent', () => {
    expect(isSendableViewport({ south: NaN, west: 139.6, north: 35.75, east: 139.8 })).toBe(false);
    expect(isSendableViewport({ south: 35.6, west: -Infinity, north: 35.75, east: 139.8 })).toBe(
      false,
    );
    // `south > north` is Google's `low`/`high` handed over upside down.
    expect(isSendableViewport({ south: 35.75, west: 139.6, north: 35.6, east: 139.8 })).toBe(false);
    expect(isSendableViewport({ south: -95, west: 139.6, north: 35.75, east: 139.8 })).toBe(false);
    expect(isSendableViewport({ south: 35.6, west: 139.6, north: 35.75, east: 200 })).toBe(false);
  });
});
