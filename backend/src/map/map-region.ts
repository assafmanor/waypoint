// **What a trip's offline map covers** (ADR-0186 §4) — the pure half, so the part
// that decides WHAT to download is testable without a binary, a bucket or a trip.
//
// The clustering itself lives in `@waypoint/shared`'s `geo.ts`, because the frontend
// needs the same answer to show what a download costs (rule 8: one derivation, two
// layers). What is here is only the two things the EXTRACTOR needs and nobody else:
// the region as GeoJSON, and a signature that says whether an existing extract is
// still the right one.
import { createHash } from 'node:crypto';
import { mapDownloadAreas, type GeoBounds, type LatLng, MAP_TRIP_MAXZOOM } from '@waypoint/shared';

/** The detail floor an area is cut to (ADR-0186 §4, owner's call). Street names and
 *  building footprints — enough to walk a neighbourhood, which is what the map is for
 *  on the ground. Measured at **22.7 MB** for ~32×28km of central Tokyo. */
export const MAP_EXTRACT_MAXZOOM = MAP_TRIP_MAXZOOM;

/** **One extract per TRIP, not per cluster** — a refinement of §4 that costs nothing and
 *  removes a moving part. `pmtiles extract` takes a GeoJSON MultiPolygon, so every one of
 *  the trip's areas goes into a single archive: one artefact to build, one to store, one
 *  to download, and no seams between areas to reason about. §4's "one extract per cluster"
 *  was describing what is INCLUDED, and that is unchanged — the clusters still decide the
 *  shape, they just no longer each need a file. */
export interface MapRegion {
  /** The areas, in `mapDownloadAreas` order — what a size estimate and a "4 areas" readout
   *  are counted from. */
  areas: GeoBounds[];
  /** The `--region` argument: a MultiPolygon whose rings are those areas. */
  geojson: MapRegionGeoJson;
  /** Changes exactly when the covered ground changes, and at no other time — so a trip
   *  whose places were merely renamed does not rebuild a 23MB archive. Also the storage
   *  key, which is what makes a rebuild atomic: a new signature is a new object, and the
   *  old one stays readable until it is dropped. */
  signature: string;
}

export interface MapRegionGeoJson {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

/** A closed ring in GeoJSON winding order, from a box. Longitude first, per the spec —
 *  the one ordering mistake in this file that would silently produce an archive of the
 *  wrong hemisphere rather than an error. */
function ringOf(b: GeoBounds): number[][] {
  return [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north],
    [b.west, b.south],
  ];
}

/** Rounded before hashing, so floating-point noise in a coordinate cannot invalidate an
 *  archive that covers the identical ground. Five places is ~1m, far under the 5km pad. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * **Every coordinate the trip holds** → the region we would cut for it.
 *
 * Pass places AND booking endpoints: that is what makes a layover need no special case
 * (ADR-0186 §4). Coordless entries are dropped by the clusterer, and a trip with no
 * coordinates at all yields no areas — which is a real state (a trip nobody has added a
 * place to yet), and its answer is the shared world layer alone.
 */
export function mapRegionFor(points: readonly LatLng[]): MapRegion | null {
  const areas = mapDownloadAreas(points);
  if (areas.length === 0) return null;

  const geojson: MapRegionGeoJson = {
    type: 'MultiPolygon',
    coordinates: areas.map((area) => [ringOf(area)]),
  };
  const signature = createHash('sha256')
    .update(
      JSON.stringify([
        MAP_EXTRACT_MAXZOOM,
        areas.map((a) => [round(a.west), round(a.south), round(a.east), round(a.north)]),
      ]),
    )
    .digest('hex')
    .slice(0, 16);

  return { areas, geojson, signature };
}

/** The prefix every map object shares, so Phase 3's eviction can find a trip's archives
 *  without a second index. */
export const MAP_KEY_PREFIX = 'map_';

/** Where a built extract lives in the byte sink (`common/storage.ts`). The signature is
 *  IN the key on purpose — see `MapRegion.signature`.
 *
 * **Flat, not `map/<tripId>/<sig>`**, and that is the sink's contract rather than a
 * preference: `storage.ts` is "one flat keyspace of UUIDs" and writes with a bare
 * `writeFile`, so a key containing `/` asks its local-disk branch to create directories
 * it has never had to (found by the first real request — the archive cut fine and the
 * write threw `ENOENT`). Prefix-matching gives eviction everything a folder would have. */
export function mapExtractKey(tripId: string, signature: string): string {
  return `${MAP_KEY_PREFIX}${tripId}_${signature}.pmtiles`;
}

/** Every extract belonging to one trip, for eviction — see `mapExtractKey` on why this is
 *  a prefix test rather than a directory listing. */
export function isExtractKeyFor(tripId: string, key: string): boolean {
  return key.startsWith(`${MAP_KEY_PREFIX}${tripId}_`) && key.endsWith('.pmtiles');
}
