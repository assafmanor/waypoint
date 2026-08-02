// **How two bookings belong to one journey — DERIVED, never stored** (ADR-0154 §5,
// extended by ADR-0159).
//
// There are two relations and they are opposites, which is the whole reason one file can
// hold both without a flag: a round trip is a **mirror** (it comes back to where it
// started) and a connection is a **sequence** (it does not). ADR-0154 §7 named that
// distinction and deliberately left the sequence unbuilt; this is it.
//
// Neither is a column. A round trip is two `Booking` rows and a three-leg journey is
// three (ADR-0047 §1) — the timeline needs independent hard events with their own
// instants, statuses and zones — and nothing on any row says they belong together. This
// works out that they do, from what the bookings ARE.
//
// A `pairId` was rejected for three reasons and the third decides it: it needs a
// migration; it drifts the moment someone edits a route; and it would only ever know
// about journeys created through the one control that writes it, missing legs written
// separately, legs written in the two different authoring forms, and anything imported
// from Gmail (ADR-0004 — integrations are pipes). A derivation reads all of them. It is
// also the posture readiness and Now/Next already take (ADR-0018/0027): computed state is
// not written back.
//
// Pure over the shape — no clock, no React, no network — so both layers and every render
// surface get one answer (`packages/shared/CLAUDE.md`).
import { carriesRoute, connectionWindow } from './icons';
import type { Booking } from './entities';

/** Why two bookings are a round-trip pair. A discriminated reason rather than a boolean,
 *  so a surface can say WHICH evidence it found — and so a fourth relation later is an
 *  entry in `PAIR_RULES` rather than another clause in an `||`. */
export type BookingPairReason = 'mirrored-route' | 'shared-code';

export interface BookingPair {
  /** The leg that happens first. */
  outbound: Booking;
  /** The leg that happens second — the return. */
  back: Booking;
  reason: BookingPairReason;
}

/** When a booking happens, in whatever the caller can supply. A `Booking` carries no
 *  schedule — that lives on its linked event (ADR-0047 §1) — so the caller resolves it
 *  and this file stays clock-free.
 *
 *  **Both ends, not just the start**, because the two relations need different halves: a
 *  round trip is ordered by its starts, a connection is measured from an ARRIVAL to the
 *  next departure. One provider answering both is what keeps a second one from drifting
 *  beside it. */
export type BookingWhen = (booking: Booking) => { start?: number; end?: number };

/** Do these two carry the same route, reversed? Both ends must be present on both:
 *  a half-route mirrors nothing, and treating `undefined === undefined` as a match
 *  would pair every route-less transport booking in the trip with every other. */
function mirrorsRoute(a: Booking, b: Booking): boolean {
  return (
    a.fromPlaceId != null &&
    a.toPlaceId != null &&
    a.fromPlaceId === b.toPlaceId &&
    a.toPlaceId === b.fromPlaceId
  );
}

/** One non-empty confirmation code across both — a real round trip is one purchase and
 *  genuinely has one PNR, which is the strongest evidence there is. */
function sharesCode(a: Booking, b: Booking): boolean {
  const code = a.confirmationCode?.trim();
  return !!code && code === b.confirmationCode?.trim();
}

/** The round-trip rules, in the order they are tried. A new relation is an entry here —
 *  not another clause in a condition. */
const PAIR_RULES: readonly {
  reason: BookingPairReason;
  holds: (a: Booking, b: Booking) => boolean;
}[] = [
  { reason: 'shared-code', holds: sharesCode },
  { reason: 'mirrored-route', holds: mirrorsRoute },
];

/** Could these two be legs of one journey at all, before any evidence is weighed?
 *  Both route-shaped and the same mode: a flight does not pair with a train, and a
 *  confirmation code shared with a hotel is a coincidence, not a round trip. */
function comparable(a: Booking, b: Booking): boolean {
  return a.id !== b.id && a.type === b.type && carriesRoute(a.type) && carriesRoute(b.type);
}

/**
 * **Is `b` the leg that continues `a`, and how long is the join?** Minutes on the
 * connection, `null` when these two are not consecutive legs of one journey.
 *
 * Four conditions, and the third is the one that keeps this from swallowing the round
 * trip:
 *
 * 1. Comparable — the same route-shaped type.
 * 2. `a` arrives where `b` departs. The chain itself.
 * 3. `b` does not end where `a` began. **A journey that returns to its origin is a
 *    MIRROR**, and without this an out-and-back inside one day would read as a layover
 *    at the far end. It is also what lets `roundTripPartner` below simply ask this
 *    function first and skip whatever it claims.
 * 4. The gap is real (never negative) and inside the type's own window
 *    (`connectionWindow`: 24h for a flight, 6h for a train or a bus).
 *
 * An unscheduled leg on either side answers `null`. That is not a hole in the rule, it
 * IS the rule: a sequence is an order in time, and a booking with no schedule has no
 * place in one — unlike a round trip, whose unplaced return is still the other half of
 * the purchase.
 */
export function connectionMinutes(a: Booking, b: Booking, when: BookingWhen): number | null {
  if (!comparable(a, b)) return null;
  if (a.toPlaceId == null || a.toPlaceId !== b.fromPlaceId) return null;
  if (a.fromPlaceId == null || b.toPlaceId == null || b.toPlaceId === a.fromPlaceId) return null;
  const window = connectionWindow(a.type);
  if (!window) return null;

  const arrival = when(a).end ?? when(a).start;
  const departure = when(b).start;
  if (arrival == null || departure == null) return null;

  const minutes = Math.round((departure - arrival) / MS_PER_MINUTE);
  if (minutes < 0 || minutes > window.maxGapMinutes) return null;
  return minutes;
}

const MS_PER_MINUTE = 60_000;

/** The nearest leg on one side of `from`, among everything not already in the journey.
 *  Nearest wins for the same reason it does in `roundTripPartner`: with three legs
 *  through one airport, the shortest join is the one that continues this journey. */
function nearest(
  from: Booking,
  all: readonly Booking[],
  when: BookingWhen,
  taken: ReadonlySet<string>,
  forward: boolean,
): Booking | null {
  let best: { leg: Booking; minutes: number } | null = null;
  for (const other of all) {
    if (taken.has(other.id)) continue;
    const minutes = forward
      ? connectionMinutes(from, other, when)
      : connectionMinutes(other, from, when);
    if (minutes == null) continue;
    if (!best || minutes < best.minutes) best = { leg: other, minutes };
  }
  return best?.leg ?? null;
}

/**
 * Every leg of `booking`'s journey, in travel order, `booking` included — so a booking
 * that connects to nothing answers `[booking]`, and no caller needs a special case for
 * "this is not a journey".
 *
 * Walks both ways from the subject, so the middle leg of a three-leg journey finds the
 * whole of it. The `taken` set is the cycle guard: an itinerary that loops back through
 * the same airport inside the window cannot make this run forever.
 */
export function journeyLegs(
  booking: Booking,
  all: readonly Booking[],
  when: BookingWhen,
): Booking[] {
  const legs = [booking];
  const taken = new Set([booking.id]);

  for (;;) {
    const next = nearest(legs[legs.length - 1], all, when, taken, true);
    if (!next) break;
    legs.push(next);
    taken.add(next.id);
  }
  for (;;) {
    const prev = nearest(legs[0], all, when, taken, false);
    if (!prev) break;
    legs.unshift(prev);
    taken.add(prev.id);
  }
  return legs;
}

/**
 * The other leg of `booking`'s round trip, or `null`.
 *
 * Among everything that qualifies, the **nearest in time** wins — which is what keeps
 * three legs of a multi-city trip from all claiming each other. Two candidates with no
 * schedule fall back to the first rule match, since there is nothing to measure.
 *
 * **A connecting leg is not a return**, and that check comes first (ADR-0159). Without
 * it a through-ticketed layover would pair with its own next leg on the shared-code
 * rule — one PNR is exactly what a connection has too — and the app would call the
 * second half of the outbound journey "the return".
 */
export function roundTripPartner(
  booking: Booking,
  all: readonly Booking[],
  when: BookingWhen,
): BookingPair | null {
  const mine = when(booking).start;
  let best: { other: Booking; reason: BookingPairReason; distance: number } | null = null;

  for (const other of all) {
    if (!comparable(booking, other)) continue;
    if (connectionMinutes(booking, other, when) != null) continue;
    if (connectionMinutes(other, booking, when) != null) continue;
    const rule = PAIR_RULES.find((r) => r.holds(booking, other));
    if (!rule) continue;
    const theirs = when(other).start;
    // Unscheduled on either side: no distance to compare, so it ranks last but still
    // counts — a leg you have not placed yet is still the other half of the purchase.
    const distance =
      mine != null && theirs != null ? Math.abs(theirs - mine) : Number.POSITIVE_INFINITY;
    if (!best || distance < best.distance) best = { other, reason: rule.reason, distance };
  }
  if (!best) return null;

  const theirs = when(best.other).start;
  // The later one is the return. With no schedule to order them the subject is treated
  // as the outbound, which is the honest default: it is the one you are looking at.
  const backIsOther = mine == null || theirs == null || theirs >= mine;
  return {
    outbound: backIsOther ? booking : best.other,
    back: backIsOther ? best.other : booking,
    reason: best.reason,
  };
}
