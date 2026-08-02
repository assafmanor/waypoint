// **A round trip is DERIVED, not stored** (ADR-0154 §5).
//
// A round trip is two `Booking` rows (ADR-0047 §1) — the timeline needs two independent
// hard events with their own instants, statuses and zones — and nothing on either row
// says they belong together. This works out that they do, from what the bookings ARE.
//
// A `pairId` column was rejected for three reasons, and the third is the one that
// decides it: it needs a migration; it drifts the moment someone edits a route; and it
// would only ever know about pairs created through the round-trip control, missing legs
// written separately, legs written in the two different authoring forms, and anything
// imported from Gmail (ADR-0004 — integrations are pipes). A derivation reads all of
// them. It is also the posture readiness and Now/Next already take (ADR-0018/0027):
// computed state is not written back.
//
// Pure over the shape — no clock, no React, no network — so both layers and every render
// surface get one answer (`packages/shared/CLAUDE.md`).
import { carriesRoute } from './icons';
import type { Booking } from './entities';

/** Why two bookings are a pair. A discriminated reason rather than a boolean, so a
 *  surface can say WHICH evidence it found — and so a fourth relation later is an entry
 *  in `PAIR_RULES` rather than another clause in an `||`. */
export type BookingPairReason = 'mirrored-route' | 'shared-code';

export interface BookingPair {
  /** The leg that happens first. */
  outbound: Booking;
  /** The leg that happens second — the return. */
  back: Booking;
  reason: BookingPairReason;
}

/** When two bookings are scheduled, in whatever the caller can supply. The pair rule
 *  needs an ORDER (which leg is the return) and a NEARNESS (which candidate wins), and
 *  a `Booking` carries neither — its schedule lives on its linked event (ADR-0047 §1).
 *  So the caller resolves that, and this file stays clock-free. */
export type BookingStartAt = (booking: Booking) => number | undefined;

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

/** The rules, in the order they are tried. A new relation (a split stay, a multi-city
 *  sequence) is an entry here — not another clause in a condition. */
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
 * The other leg of `booking`'s round trip, or `null`.
 *
 * Among everything that qualifies, the **nearest in time** wins — which is what keeps
 * three legs of a multi-city trip from all claiming each other. Two candidates with no
 * schedule fall back to the first rule match, since there is nothing to measure.
 */
export function roundTripPartner(
  booking: Booking,
  all: readonly Booking[],
  startAt: BookingStartAt,
): BookingPair | null {
  const mine = startAt(booking);
  let best: { other: Booking; reason: BookingPairReason; distance: number } | null = null;

  for (const other of all) {
    if (!comparable(booking, other)) continue;
    const rule = PAIR_RULES.find((r) => r.holds(booking, other));
    if (!rule) continue;
    const theirs = startAt(other);
    // Unscheduled on either side: no distance to compare, so it ranks last but still
    // counts — a leg you have not placed yet is still the other half of the purchase.
    const distance =
      mine != null && theirs != null ? Math.abs(theirs - mine) : Number.POSITIVE_INFINITY;
    if (!best || distance < best.distance) best = { other, reason: rule.reason, distance };
  }
  if (!best) return null;

  const theirs = startAt(best.other);
  // The later one is the return. With no schedule to order them the subject is treated
  // as the outbound, which is the honest default: it is the one you are looking at.
  const backIsOther = mine == null || theirs == null || theirs >= mine;
  return {
    outbound: backIsOther ? booking : best.other,
    back: backIsOther ? best.other : booking,
    reason: best.reason,
  };
}
