// Home quick-access derivations (ADR-0050). Pure so the "next code" selection is
// unit-testable without rendering Home.
import { BOOKING_TYPE, type Booking, type TripEvent } from '@waypoint/shared';
import { eventPhase } from './time';

export interface CodedBooking {
  booking: Booking;
  event: TripEvent;
}

const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);

/** WiFi lives on the hotel booking's `details` blob (ADR-0047), not a TripNote. */
export interface HotelWifi {
  network?: string;
  password?: string;
}

const hasWifi = (w?: HotelWifi): w is HotelWifi => !!w && (!!w.network || !!w.password);

/** The hotel WiFi to surface on Home's quick-access — only while you're checked in
 *  (ADR-0087): among hotel bookings carrying `details.wifi`, the one whose linked
 *  stay event span contains `now` (check-in ≤ now < check-out). Matches ADR-0059's
 *  "inside a booking = where you are": before check-in and after check-out the
 *  tile is absent, so WiFi surfaces exactly when it's useful. A hotel with no
 *  linked stay event has no known window; it falls back to being shown so a user's
 *  WiFi isn't hidden merely for lacking a schedule. Returns `undefined` when no
 *  hotel qualifies — the tile is then absent (derived, not managed, ADR-0050). */
export function hotelWifi(
  bookings: Booking[],
  events: TripEvent[],
  now: number,
): HotelWifi | undefined {
  let fallback: HotelWifi | undefined;
  for (const booking of bookings) {
    if (booking.type !== BOOKING_TYPE.HOTEL) continue;
    const wifi = booking.details?.wifi as HotelWifi | undefined;
    if (!hasWifi(wifi)) continue;
    const event = events.find((e) => e.bookingId === booking.id);
    const start = event?.startsAt ? Date.parse(event.startsAt) : undefined;
    const end = event?.endsAt ? Date.parse(event.endsAt) : undefined;
    if (start === undefined || end === undefined) {
      fallback ??= wifi;
      continue;
    }
    if (now >= start && now < end) return wifi;
  }
  return fallback;
}

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
