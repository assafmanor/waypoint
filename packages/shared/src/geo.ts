// Straight-line distance, shared. This was `frontend/src/lib/distance.ts`, built
// for the Map's near-me sort (ADR-0109 §7); ADR-0151 §3's `near-the-day` strategy
// is the same arithmetic on the same data one surface over, so the pure half moves
// here rather than being written a second time (root rule 8). `lib/distance.ts`
// re-exports it, so the Map's call site is unchanged.
//
// What did NOT move: `formatDistance`. It renders Hebrew, and UI copy stays on the
// frontend (this package supplies values, consumers supply words).
//
// Also here, for the same reason: the viewport geometry both layers ask about
// (`isSendableViewport`) — the backend to decide what it may send Google, the frontend to
// decide what it may bother sending the backend.
import { z } from 'zod';

/** Mean Earth radius, for the haversine below. */
export const EARTH_RADIUS_M = 6_371_000;

export const latLngSchema = z.object({ lat: z.number(), lng: z.number() });
export type LatLng = z.infer<typeof latLngSchema>;

/** A viewport / extent in degrees — the same shape as the frontend's `MapBounds`, and what
 *  `searchPlacesTextSchema.bias` is. **Four bare numbers, deliberately**: see
 *  {@link isSendableViewport} for why the wire shape must not police the geometry. */
export const geoBoundsSchema = z.object({
  south: z.number(),
  west: z.number(),
  north: z.number(),
  east: z.number(),
});
export type GeoBounds = z.infer<typeof geoBoundsSchema>;

/** **Google's hard cap on the east-west span of a `locationBias.rectangle`, in degrees.**
 *  Not a knob: it is quoted from the contract by the production 400 field report #34 caught —
 *  `Invalid rectangle viewport. The rectangle viewport cannot be wider than 180.` */
export const MAX_VIEWPORT_SPAN_DEG = 180;

const LAT_LIMIT_DEG = 90;
const LNG_LIMIT_DEG = 180;

/**
 * **Can these bounds be sent to Google as a `locationBias.rectangle` at all?** (field report #34)
 *
 * A viewport bias is optional ranking context, so the answer to "no" is to **drop** it — never to
 * clamp it into something sendable. A clamped rectangle ranks results toward a region the user is
 * not looking at, which is a silent wrong answer; a dropped one is merely unranked. For the same
 * reason every "no" here is a reason to omit rather than to refuse: `searchPlacesTextSchema` stays
 * permissive on purpose, because 400-ing a world-wide viewport at our own edge is the identical
 * failure wearing our name.
 *
 * `west > east` is a viewport crossing the antimeridian, which Google reads as an inverted
 * longitude range and not as an error — so it is sendable as-is, but its true span is
 * `east - west + 360`, and the cap applies to that.
 */
export function isSendableViewport(bounds: GeoBounds): boolean {
  const { north, south, east, west } = bounds;
  if (![north, south, east, west].every((n) => Number.isFinite(n))) return false;
  if (south > north) return false;
  if (Math.abs(north) > LAT_LIMIT_DEG || Math.abs(south) > LAT_LIMIT_DEG) return false;
  if (Math.abs(east) > LNG_LIMIT_DEG || Math.abs(west) > LNG_LIMIT_DEG) return false;
  const span = west > east ? east - west + 360 : east - west;
  return span <= MAX_VIEWPORT_SPAN_DEG;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function haversineMeters(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* ── OFFLINE MAP AREAS (ADR-0186 §4) ────────────────────────────────────────────
 *
 * **The download unit is neither the trip nor the country.** The owner is who
 * killed the obvious model, by asking the question it could not answer: _"what if
 * the trip consists of a cross country trip? What about the layovers? Places
 * outside of the trip countries?"_ One bounding box around a trip's places is
 * tolerable for Tokyo→Kyoto→Osaka, is mostly ocean for Iceland's ring road, and
 * is the northern hemisphere for Paris **and** Tokyo.
 *
 * So the unit is a **cluster of the coordinates the trip actually contains**, and
 * that answers all three parts of the question at once: a layover airport is a
 * `Place` like any other (its row already exists — ADR-0166 §18 is built on it),
 * a stop outside the trip's countries is just another cluster, and the empty
 * space between clusters is never downloaded because no coordinate is in it.
 * Nothing here knows what a country is.
 */

/** Two coordinates belong to the same download area when they are within this of
 *  each other — single-link, so a chain of stops along a coast stays ONE area
 *  rather than becoming a string of overlapping boxes.
 *
 *  40km is chosen to sit between the two cases that matter: greater Tokyo's
 *  spread (Shibuya→Narita is ~60km, so the airport is correctly its own area)
 *  and a city's own sprawl (Shibuya→Shinjuku is ~3km). It is a number to
 *  re-measure against real trips, not a constant anything else depends on. */
export const MAP_AREA_LINK_RADIUS_M = 40_000;

/** How much ground each area keeps around its own stops. You walk off the edge of
 *  a box you sized to your pins, so the box is not sized to your pins. */
export const MAP_AREA_PADDING_M = 5_000;

const METRES_PER_DEG_LAT = 111_320;

/** Longitude difference, taking the SHORT way round — so a pair either side of the
 *  antimeridian reads as adjacent rather than as most of the planet apart. */
function lngDelta(a: number, b: number): number {
  const raw = ((b - a + 540) % 360) - 180;
  return raw;
}

/**
 * **The trip's coordinates, grouped into the areas we would download.**
 *
 * Single-link agglomerative: a point joins an area if it is within `radiusM` of
 * ANY point already in it. That is deliberate rather than incidental — a road
 * trip is a chain, and centroid-based clustering would either split it or pull an
 * area's box over ground nobody visits.
 *
 * ponytail: O(n²) over a trip's places, which is dozens. If this ever runs over
 * something with thousands of points, it wants a grid index — not before.
 */
export function clusterLatLngs(
  points: readonly LatLng[],
  radiusM: number = MAP_AREA_LINK_RADIUS_M,
): LatLng[][] {
  const remaining = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const clusters: LatLng[][] = [];
  const taken = new Set<number>();

  for (let i = 0; i < remaining.length; i++) {
    if (taken.has(i)) continue;
    const cluster: LatLng[] = [];
    // Breadth-first over the "within radius of something already in" relation,
    // which is what makes the link single rather than centroid-based.
    const queue = [i];
    taken.add(i);
    while (queue.length > 0) {
      const current = remaining[queue.shift()!]!;
      cluster.push(current);
      for (let j = 0; j < remaining.length; j++) {
        if (taken.has(j)) continue;
        if (haversineMeters(current, remaining[j]!) <= radiusM) {
          taken.add(j);
          queue.push(j);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/**
 * The padded box around one area's points.
 *
 * **Longitudes are accumulated as offsets from the first point**, not as raw
 * values, so an area straddling the antimeridian produces the narrow box it
 * should rather than one spanning the globe. Without that a trip to Fiji would
 * ask to download the whole world at street zoom — a pathological case that is
 * cheap to prevent and expensive to discover.
 */
export function boundsAroundLatLngs(
  points: readonly LatLng[],
  paddingM: number = MAP_AREA_PADDING_M,
): GeoBounds {
  const anchor = points[0]!;
  let minLat = anchor.lat;
  let maxLat = anchor.lat;
  let minOffset = 0;
  let maxOffset = 0;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    const offset = lngDelta(anchor.lng, p.lng);
    minOffset = Math.min(minOffset, offset);
    maxOffset = Math.max(maxOffset, offset);
  }

  const padLat = paddingM / METRES_PER_DEG_LAT;
  // Longitude degrees shrink with latitude, so the padding is widened by the
  // same cosine — a 5km pad at 60°N is twice the degrees it is at the equator.
  const widest = Math.max(Math.abs(minLat), Math.abs(maxLat));
  const cosine = Math.max(Math.cos(toRadians(widest)), 0.01);
  const padLng = paddingM / (METRES_PER_DEG_LAT * cosine);

  const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
  return {
    south: Math.max(-LAT_LIMIT_DEG, minLat - padLat),
    north: Math.min(LAT_LIMIT_DEG, maxLat + padLat),
    west: wrap(anchor.lng + minOffset - padLng),
    east: wrap(anchor.lng + maxOffset + padLng),
  };
}

/** **What a trip would download**, in the order the clusters were found. Pass every
 *  coordinate the trip holds — its places AND its bookings' endpoints — and the
 *  layovers take care of themselves (see the block comment above). */
export function mapDownloadAreas(
  points: readonly LatLng[],
  options: { radiusM?: number; paddingM?: number } = {},
): GeoBounds[] {
  return clusterLatLngs(points, options.radiusM ?? MAP_AREA_LINK_RADIUS_M).map((cluster) =>
    boundsAroundLatLngs(cluster, options.paddingM ?? MAP_AREA_PADDING_M),
  );
}
