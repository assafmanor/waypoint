// ADR-0021 resolution rule. Never stored server-side — recomputed on load;
// the manual override lives in state/active-trip-id.tsx.
import type { Trip } from '@waypoint/shared';
import { todayInTz } from './time';

export type TripChip = 'now' | 'soon' | 'past';

/** The all-trips row chip (ADR-0033) — same in-progress/upcoming/past split
 *  `resolveActiveTrip` uses, just not collapsed into a single pick. */
export function tripChip(trip: Trip, now: Date): TripChip {
  const today = todayInTz(trip.timezone, now);
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
 *  - Otherwise it's a cold reopen: a live trip opens directly, nothing live
 *    goes to /trips (ADR-0033). A restored last-opened id only wins here when it
 *    is *itself* live (last-opened among overlapping live trips, ADR-0021); a
 *    stale non-live id must not shadow a trip that is live right now — the bug
 *    this rule fixes (a reopen landing on the last trip instead of the live one).
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

  const resolved = resolveActiveTrip(trips, now);
  if (!resolved || tripChip(resolved, now) !== 'now') return { redirect: '/trips' };
  return { tripId: resolved.id };
}

export function resolveActiveTrip(trips: Trip[], now: Date): Trip | null {
  if (trips.length === 0) return null;

  const inProgress = trips.filter((t) => {
    const today = todayInTz(t.timezone, now);
    return today >= t.startDate && today <= t.endDate;
  });
  if (inProgress.length > 0) {
    // ponytail: overlapping in-progress trips are an explicitly deferred case
    // (ADR-0021) — pick the one that started first, deterministic and good
    // enough until "which trip is primary now" gets a real resolution.
    return [...inProgress].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  }

  const upcoming = trips.filter((t) => todayInTz(t.timezone, now) < t.startDate);
  if (upcoming.length > 0) {
    return [...upcoming].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  }

  const past = trips.filter((t) => todayInTz(t.timezone, now) > t.endDate);
  return [...past].sort((a, b) => (a.endDate > b.endDate ? -1 : 1))[0];
}
