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
