// As-the-crow-flies distance between two points, and how it reads (ADR-0109 §7).
// "Near me now" is a list re-sort plus per-row chips, so this is the whole of the
// spatial maths in Phase 4 — no routing, no Google call, no tiles. A straight-line
// metre count is honest for the job it does (ordering nearby places and saying
// roughly how far), and it stays correct offline.
import { DISTANCE_STEP } from '../constants';
import { t } from '../i18n/he';

// The maths moved to `@waypoint/shared` when ADR-0151's `near-the-day` strategy
// needed the same haversine (root rule 8 — generalise the one-off, don't copy it).
// Re-exported here so this file stays the frontend's one distance import.
export { haversineMeters, type LatLng } from '@waypoint/shared';

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
  if (km < DISTANCE_STEP.WHOLE_KM_FROM) return t.map.near.km(Math.round(km * 10) / 10);
  // **A GROUPED NUMBER, BECAUSE THIS FUNCTION HAS SEEN FOUR DIGITS SINCE ADR-0212.** Every
  // caller before it handed over a ring-road leg at most, so `2931 ק״מ` never came up and read
  // as a part number the first time it did. `en-US` and not the locale: the app's numerals are
  // Latin (ADR-0118's own premise) and Hebrew has no separator convention of its own to follow,
  // so this pins the grouping the digits already imply rather than asking the device.
  return t.map.near.km(Math.round(km).toLocaleString('en-US'));
}
