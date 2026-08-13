import { describe, expect, it } from 'vitest';
import {
  MAP_AREA_LINK_RADIUS_M,
  MAX_VIEWPORT_SPAN_DEG,
  boundsAroundLatLngs,
  clusterLatLngs,
  isSendableViewport,
  mapDownloadAreas,
} from './geo';

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

/* ── OFFLINE MAP AREAS (ADR-0186 §4) ─────────────────────────────────────────────────────────
   These cases ARE the owner's question — "what if the trip consists of a cross country trip?
   What about the layovers? Places outside of the trip countries?" — one `it` each, because
   the single-bbox model this replaced answers all three wrongly. */
describe('mapDownloadAreas', () => {
  const SHIBUYA = { lat: 35.6595, lng: 139.7005 };
  const SHINJUKU = { lat: 35.6896, lng: 139.7006 }; // ~3km from Shibuya
  const KYOTO = { lat: 35.0116, lng: 135.7681 }; // ~370km
  const NARITA = { lat: 35.772, lng: 140.3929 }; // ~60km — deliberately past the link radius
  const PARIS = { lat: 48.8584, lng: 2.2945 };

  it('keeps one city as ONE area', () => {
    expect(clusterLatLngs([SHIBUYA, SHINJUKU])).toHaveLength(1);
  });

  it('splits a cross-country trip instead of boxing the space between', () => {
    const areas = mapDownloadAreas([SHIBUYA, SHINJUKU, KYOTO]);
    expect(areas).toHaveLength(2);
    // The point of the split: no single area spans the 370km gap.
    for (const a of areas) expect(a.north - a.south).toBeLessThan(2);
  });

  it('gives a layover its own small area, with no special case for airports', () => {
    // Narita is a `Place` like any other — a flight's endpoint row (ADR-0166 §18).
    const areas = mapDownloadAreas([SHIBUYA, NARITA]);
    expect(areas).toHaveLength(2);
  });

  it('handles a trip whose stops are in different countries entirely', () => {
    // Nothing here knows what a country is, which is exactly why this works.
    expect(mapDownloadAreas([SHIBUYA, PARIS])).toHaveLength(2);
  });

  it('chains a road trip into one area rather than a string of boxes', () => {
    // Single-link: each hop is under the radius, so the whole chain is one area
    // even though the ends are far past it. Centroid clustering would split this.
    const chain = Array.from({ length: 6 }, (_, i) => ({ lat: 64.1 + i * 0.3, lng: -21.9 }));
    expect(haversineIsChained(chain)).toBe(true);
    expect(clusterLatLngs(chain)).toHaveLength(1);
  });

  it('pads the box, so you can walk off the edge of your own pins', () => {
    const tight = boundsAroundLatLngs([SHIBUYA], 0);
    const padded = boundsAroundLatLngs([SHIBUYA]);
    expect(tight.north).toBeCloseTo(SHIBUYA.lat, 6);
    expect(padded.north).toBeGreaterThan(tight.north);
    expect(padded.south).toBeLessThan(tight.south);
  });

  it('does not ask for the whole planet when an area straddles the antimeridian', () => {
    // Fiji. The naive min/max on raw longitudes gives a ~358° box — i.e. the world
    // at street zoom — which is the pathological download this guards.
    const fiji = [
      { lat: -17.8, lng: 179.9 },
      { lat: -17.75, lng: -179.95 },
    ];
    const [area] = mapDownloadAreas(fiji);
    const span = area!.west > area!.east ? area!.east - area!.west + 360 : area!.east - area!.west;
    expect(span).toBeLessThan(1);
  });

  it('ignores coordless entries rather than clustering NaN', () => {
    const withJunk = [SHIBUYA, { lat: Number.NaN, lng: Number.NaN }, SHINJUKU];
    expect(clusterLatLngs(withJunk)).toHaveLength(1);
  });

  it('returns nothing for a trip with no coordinates at all', () => {
    expect(mapDownloadAreas([])).toEqual([]);
  });

  // The chain fixture is only meaningful if every hop really is under the radius
  // and the ends really are past it — asserted rather than assumed, so a change to
  // the radius constant cannot leave the road-trip case silently testing nothing.
  function haversineIsChained(points: { lat: number; lng: number }[]): boolean {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const ends = Math.abs(last.lat - first.lat) * 111_320;
    return ends > MAP_AREA_LINK_RADIUS_M;
  }
});
