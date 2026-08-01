// Straight-line distance, shared. This was `frontend/src/lib/distance.ts`, built
// for the Map's near-me sort (ADR-0109 §7); ADR-0151 §3's `near-the-day` strategy
// is the same arithmetic on the same data one surface over, so the pure half moves
// here rather than being written a second time (root rule 8). `lib/distance.ts`
// re-exports it, so the Map's call site is unchanged.
//
// What did NOT move: `formatDistance`. It renders Hebrew, and UI copy stays on the
// frontend (this package supplies values, consumers supply words).
import { z } from 'zod';

/** Mean Earth radius, for the haversine below. */
export const EARTH_RADIUS_M = 6_371_000;

export const latLngSchema = z.object({ lat: z.number(), lng: z.number() });
export type LatLng = z.infer<typeof latLngSchema>;

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
