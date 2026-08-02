// **A journey, resolved against trip state** (ADR-0154 §5, ADR-0159).
//
// Both relations — the round trip and the connection — are pure rules in
// `@waypoint/shared` (`booking-journey.ts`) so both layers get one answer. What they
// cannot do is tell the time: a `Booking` carries no schedule, it lives on the linked
// event (ADR-0047 §1), so they ask for a `BookingWhen` and this is where the frontend
// supplies one.
//
// **One provider, not one per relation**, and that is the reason this file exists rather
// than a helper at each host: the pair is ordered by starts and a connection is measured
// from an ARRIVAL, so two call sites deriving their own would eventually disagree about
// when the same booking happens.
import { useMemo } from 'react';
import {
  connectionMinutes,
  journeyLegs,
  roundTripPartner,
  type Booking,
  type BookingPair,
  type BookingWhen,
  type TripEvent,
} from '@waypoint/shared';
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

/**
 * **When a booking happens, from its linked event** — the one derivation both relations
 * read (`BookingWhen`).
 *
 * `start` falls back to the event's `date`, because a leg scheduled to a DAY is still
 * placed: reading it as unscheduled would let the earlier journey be named the return
 * (the defect ADR-0154's build log records). `end` deliberately does NOT fall back — a
 * connection measured from a day boundary instead of an arrival would be off by the
 * whole flight, and `connectionMinutes` already treats a missing arrival as "measure
 * from the departure", which is the honest reading.
 */
export function bookingWhen(events: readonly TripEvent[]): BookingWhen {
  return (booking) => {
    const event = events.find((e) => e.bookingId === booking.id);
    const start = event?.startsAt ?? event?.date;
    return {
      start: start ? Date.parse(start) : undefined,
      end: event?.endsAt ? Date.parse(event.endsAt) : undefined,
    };
  };
}

export function useRoundTripPartner(booking: Booking | null | undefined): RoundTripPartner | null {
  const { bookings, events } = useTrip();
  return useMemo(() => {
    if (!booking) return null;
    const pair = roundTripPartner(booking, bookings, bookingWhen(events));
    if (!pair) return null;
    const isBack = pair.back.id !== booking.id;
    const partner = isBack ? pair.back : pair.outbound;
    return {
      partner,
      leg: isBack ? 'back' : 'out',
      reason: pair.reason,
      partnerEvent: events.find((e) => e.bookingId === partner.id),
    };
  }, [booking, bookings, events]);
}

/** One leg of a journey, with the join that follows it. */
export interface JourneyLeg {
  booking: Booking;
  event?: TripEvent;
  /** Minutes waiting before the NEXT leg departs; absent on the last one. */
  connectionMinutes?: number;
}

export interface Journey {
  legs: JourneyLeg[];
  /** Where the subject sits in it, 0-based. */
  index: number;
}

/**
 * The whole journey a booking belongs to, or `null` when it belongs to no more than
 * itself — so a host can render the fact only when there is one, rather than checking
 * `length > 1` at every call site.
 */
export function useJourney(booking: Booking | null | undefined): Journey | null {
  const { bookings, events } = useTrip();
  return useMemo(() => {
    if (!booking) return null;
    const when = bookingWhen(events);
    const chain = journeyLegs(booking, bookings, when);
    if (chain.length < 2) return null;
    return {
      legs: chain.map((leg, i) => ({
        booking: leg,
        event: events.find((e) => e.bookingId === leg.id),
        connectionMinutes: chain[i + 1]
          ? (connectionMinutes(leg, chain[i + 1], when) ?? undefined)
          : undefined,
      })),
      index: chain.findIndex((l) => l.id === booking.id),
    };
  }, [booking, bookings, events]);
}
