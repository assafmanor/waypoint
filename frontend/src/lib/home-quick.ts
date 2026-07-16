// Home quick-access derivations (ADR-0050). Pure so the "next code" selection is
// unit-testable without rendering Home.
import { type Booking, type TripEvent } from '@waypoint/shared';
import { eventPhase } from './time';

export interface CodedBooking {
  booking: Booking;
  event: TripEvent;
}

const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);

/** The next confirmation code you'll need (ADR-0050): among bookings that carry a
 *  `confirmationCode` and are scheduled (a linked event with a start that is now
 *  or upcoming), the earliest one. May be a later booking than the board's
 *  immediate next event. Returns `undefined` when there's no such booking — the
 *  quick-access tile is then absent (derived, not managed). */
export function nextCodedBooking(
  bookings: Booking[],
  events: TripEvent[],
  now: number,
): CodedBooking | undefined {
  const at = new Date(now);
  const candidates: CodedBooking[] = [];
  for (const booking of bookings) {
    if (!booking.confirmationCode) continue;
    const event = events.find((e) => e.bookingId === booking.id && e.startsAt);
    if (!event) continue;
    const phase = eventPhase(event, at);
    if (phase === 'now' || phase === 'upcoming') candidates.push({ booking, event });
  }
  candidates.sort((a, b) => ms(a.event.startsAt) - ms(b.event.startsAt));
  return candidates[0];
}
