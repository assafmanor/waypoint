import { describe, expect, it } from 'vitest';
import { MAP_EXTRACT_MAXZOOM, isExtractKeyFor, mapExtractKey, mapRegionFor } from './map-region';

/* The pure half of ADR-0186 §4. The clustering itself is covered in
   `packages/shared/src/geo.test.ts` against the owner's own three cases; what is
   asserted here is only what the EXTRACTOR needs — the GeoJSON it hands the CLI, and
   the signature that decides whether a 23MB archive gets rebuilt. */

const SHIBUYA = { lat: 35.6595, lng: 139.7005 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const KYOTO = { lat: 35.0116, lng: 135.7681 };

describe('mapRegionFor', () => {
  it('gives one MultiPolygon ring per area', () => {
    const region = mapRegionFor([SHIBUYA, SHINJUKU, KYOTO])!;
    expect(region.areas).toHaveLength(2);
    expect(region.geojson.type).toBe('MultiPolygon');
    expect(region.geojson.coordinates).toHaveLength(2);
  });

  it('writes rings LONGITUDE first, and closes them', () => {
    // The one ordering mistake here produces a valid archive of the wrong hemisphere
    // rather than an error, so it is asserted rather than trusted.
    const [[ring]] = mapRegionFor([SHIBUYA])!.geojson.coordinates;
    for (const [lng, lat] of ring!) {
      expect(lng).toBeGreaterThan(139);
      expect(lng).toBeLessThan(141);
      expect(lat).toBeGreaterThan(35);
      expect(lat).toBeLessThan(36);
    }
    expect(ring![0]).toEqual(ring![ring!.length - 1]);
  });

  it('is null for a trip with no coordinates, which is a real state', () => {
    // A trip nobody has added a place to yet. Its answer is the world layer alone.
    expect(mapRegionFor([])).toBeNull();
    expect(mapRegionFor([{ lat: Number.NaN, lng: Number.NaN }])).toBeNull();
  });

  describe('signature', () => {
    it('is stable for the same ground', () => {
      expect(mapRegionFor([SHIBUYA, SHINJUKU])!.signature).toBe(
        mapRegionFor([SHIBUYA, SHINJUKU])!.signature,
      );
    });

    it('survives floating-point noise under a metre', () => {
      // Rebuilding 23MB because a coordinate gained a rounding error is the failure
      // this rounding exists to prevent.
      const jittered = { lat: SHIBUYA.lat + 1e-9, lng: SHIBUYA.lng - 1e-9 };
      expect(mapRegionFor([jittered, SHINJUKU])!.signature).toBe(
        mapRegionFor([SHIBUYA, SHINJUKU])!.signature,
      );
    });

    it('changes when the covered ground changes', () => {
      const tokyo = mapRegionFor([SHIBUYA, SHINJUKU])!;
      const tokyoAndKyoto = mapRegionFor([SHIBUYA, SHINJUKU, KYOTO])!;
      expect(tokyoAndKyoto.signature).not.toBe(tokyo.signature);
    });

    it('does NOT change when only the order of the same places changes', () => {
      // A reordered place list is not new ground. Clustering is order-dependent in the
      // order it RETURNS areas, so this is a real risk rather than a hypothetical one.
      const a = mapRegionFor([SHIBUYA, SHINJUKU])!;
      const b = mapRegionFor([SHINJUKU, SHIBUYA])!;
      expect(b.signature).toBe(a.signature);
    });
  });
});

describe('mapExtractKey', () => {
  it('carries the signature, so a rebuild is a new object rather than an overwrite', () => {
    // Atomicity: the old archive stays readable until the new one is stored.
    expect(mapExtractKey('trip-japan-26', 'def456')).not.toBe(
      mapExtractKey('trip-japan-26', 'abc123'),
    );
  });

  it('is FLAT, because the byte sink is a flat keyspace', () => {
    // Not a preference: `storage.ts` writes with a bare `writeFile`, so a `/` in the key
    // asks its local branch to create directories it never has. Found by the first real
    // request — the archive cut fine and the write threw ENOENT.
    expect(mapExtractKey('trip-japan-26', 'abc123')).not.toContain('/');
  });

  it('lets eviction find one trip by prefix, and never a neighbouring one', () => {
    const mine = mapExtractKey('trip-japan-26', 'abc123');
    expect(isExtractKeyFor('trip-japan-26', mine)).toBe(true);
    expect(isExtractKeyFor('trip-paris-26', mine)).toBe(false);
    // A trip id that PREFIXES another must not match it — `trip-1` vs `trip-12`.
    expect(isExtractKeyFor('trip-japan', mine)).toBe(false);
  });
});

describe('MAP_EXTRACT_MAXZOOM', () => {
  it('is the owner-chosen street floor', () => {
    // Named rather than asserted loosely: z15+ is the storage lever ADR-0186 §4 refused,
    // and z13 stops naming streets.
    expect(MAP_EXTRACT_MAXZOOM).toBe(14);
  });
});
