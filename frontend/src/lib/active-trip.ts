// ADR-0021 resolution rule. Never stored server-side — recomputed on load;
// the manual override lives in state/active-trip-id.tsx.
import type { Trip } from '@waypoint/shared';
import { DEVICE_TIMEZONE } from '../constants';
import { todayInTz } from './time';

export type TripChip = 'now' | 'soon' | 'past';

/** The all-trips row chip (ADR-0033) — the in-progress/upcoming/past split the
 *  landing rule reads, just not collapsed into a single pick. Counted from the
 *  **device's** today, like `daysUntilStartOnDevice` (ADR-0107, 2026-09-10): neither
 *  the list nor the landing has an itinerary loaded, so the person is wherever the
 *  phone is — on the trip's own zone a westward trip was still `soon` fifteen hours
 *  before its flight and the app opened on the list (owner, 2026-09-10). */
export function tripChip(trip: Trip, now: Date): TripChip {
  const today = todayInTz(DEVICE_TIMEZONE, now);
  if (today >= trip.startDate && today <= trip.endDate) return 'now';
  return today < trip.startDate ? 'soon' : 'past';
}

/** Where a load lands (ADR-0033 landing rule, refining ADR-0021).
 *  `{ tripId }` mounts that trip's surface; `{ redirect: '/trips' }` sends the
 *  All-trips home. */
export type Landing = { tripId: string } | { redirect: '/trips' };

/** Decide the landing surface on a load.
 *
 *  - `pickedThisSession`: the stored id came from an explicit pick this session
 *    (tapping a trip on /trips, creating, or joining). Such a pick is honored
 *    regardless of whether the trip is live — you asked for it.
 *  - Otherwise it's a cold reopen, and the rule is **one unambiguous answer opens,
 *    anything else is the list's to resolve** (ADR-0033, 2026-09-10 amendment). A
 *    restored last-opened id wins only when it is *itself* live (last-opened among
 *    overlapping live trips, ADR-0021); a stale non-live id must not shadow a trip
 *    that is live right now. Then: exactly one live trip opens; with none live,
 *    exactly one unfinished trip opens; two or more candidates go to /trips.
 */
export function resolveLanding(
  trips: Trip[],
  storedTripId: string | null,
  pickedThisSession: boolean,
  now: Date,
): Landing {
  const storedTrip = storedTripId ? (trips.find((t) => t.id === storedTripId) ?? null) : null;

  if (pickedThisSession && storedTrip) return { tripId: storedTrip.id };

  if (storedTrip && tripChip(storedTrip, now) === 'now') return { tripId: storedTrip.id };

  const live = trips.filter((t) => tripChip(t, now) === 'now');
  const candidates = live.length > 0 ? live : trips.filter((t) => tripChip(t, now) === 'soon');
  if (candidates.length === 1) return { tripId: candidates[0].id };
  return { redirect: '/trips' };
}
