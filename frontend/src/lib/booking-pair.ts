// **The round-trip pair, resolved against trip state** (ADR-0154 §5).
//
// The rule itself is pure and lives in `@waypoint/shared` (`booking-pair.ts`) so both
// layers get one answer. What it cannot do is tell the time: a `Booking` carries no
// schedule — that lives on its linked event (ADR-0047 §1) — so it asks for a
// `BookingStartAt` and this is where the frontend supplies one.
//
// A hook rather than a helper per host, because there are two hosts already (the detail
// and the delete prompt's two call sites) and each would otherwise re-derive `startAt`
// from `events`. That is the shape that drifts.
import { useMemo } from 'react';
import { roundTripPartner, type Booking, type BookingPair, type TripEvent } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';

/** Which leg the OTHER booking is. The subject is whichever this one isn't. */
export type PartnerLeg = 'out' | 'back';

export interface RoundTripPartner {
  partner: Booking;
  leg: PartnerLeg;
  reason: BookingPair['reason'];
  /** The partner's own schedule, or `undefined` if it has none yet. */
  partnerEvent?: TripEvent;
}

export function useRoundTripPartner(booking: Booking | null | undefined): RoundTripPartner | null {
  const { bookings, events } = useTrip();
  return useMemo(() => {
    if (!booking) return null;
    const eventFor = (b: Booking) => events.find((e) => e.bookingId === b.id);
    // An event with a date but no instant still orders the pair — a leg scheduled to a
    // day is placed, and reading it as unscheduled would make the earlier one the return.
    const startAt = (b: Booking) => {
      const when = eventFor(b);
      const iso = when?.startsAt ?? when?.date;
      return iso ? Date.parse(iso) : undefined;
    };
    const pair = roundTripPartner(booking, bookings, startAt);
    if (!pair) return null;
    const isBack = pair.back.id !== booking.id;
    const partner = isBack ? pair.back : pair.outbound;
    return {
      partner,
      leg: isBack ? 'back' : 'out',
      reason: pair.reason,
      partnerEvent: eventFor(partner),
    };
  }, [booking, bookings, events]);
}
