// As-the-crow-flies distance between two points, and how it reads (ADR-0109 §7).
// "Near me now" is a list re-sort plus per-row chips, so this is the whole of the
// spatial maths in Phase 4 — no routing, no Google call, no tiles. A straight-line
// metre count is honest for the job it does (ordering nearby places and saying
// roughly how far), and it stays correct offline.
import { EARTH_RADIUS_M, DISTANCE_STEP } from '../constants';
import { t } from '../i18n/he';

export interface LatLng {
  lat: number;
  lng: number;
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

/**
 * A distance as a person reads it on a row chip: metres rounded to a walkable step
 * below a kilometre ("90 מ׳"), one decimal up to the far threshold ("1.1 ק״מ"), and
 * whole kilometres past it ("12 ק״מ"). Precision drops as the number grows because
 * the extra digit stops meaning anything — nobody navigates by "11.6 ק״מ".
 */
export function formatDistance(meters: number): string {
  if (meters < DISTANCE_STEP.KM_FROM_M) {
    const step = DISTANCE_STEP.NEAR_ROUND_M;
    return t.map.near.meters(Math.max(step, Math.round(meters / step) * step));
  }
  const km = meters / DISTANCE_STEP.KM_FROM_M;
  return t.map.near.km(
    km < DISTANCE_STEP.WHOLE_KM_FROM ? Math.round(km * 10) / 10 : Math.round(km),
  );
}
