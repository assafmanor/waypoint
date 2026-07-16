// Index bookings: pair each booking with its linked event (if any) and split
// into past / upcoming for the during-trip view (ADR-0049). A booking's schedule
// lives on its 1:1 linked event (ADR-0047); an unlinked booking has no place on
// the timeline yet, so it's always "upcoming" (something still to schedule).
import { type Booking, type TripEvent } from '@waypoint/shared';
import { todayInTz } from './time';

export interface BookingRow {
  booking: Booking;
  event?: TripEvent; // the linked event, if this booking is scheduled
}

const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);

/** Sort key for a row: scheduled rows by their event's instant (ascending),
 *  unscheduled rows last (they still need placing on the itinerary). */
function byWhen(a: BookingRow, b: BookingRow): number {
  if (!a.event && !b.event) return a.booking.title.localeCompare(b.booking.title);
  if (!a.event) return 1;
  if (!b.event) return -1;
  return a.event.date.localeCompare(b.event.date) || ms(a.event.startsAt) - ms(b.event.startsAt);
}

export function splitBookings(
  bookings: Booking[],
  events: TripEvent[],
  timezone: string,
  now: number,
): { upcoming: BookingRow[]; past: BookingRow[] } {
  const today = todayInTz(timezone, new Date(now));
  const rows: BookingRow[] = bookings.map((booking) => ({
    booking,
    event: events.find((e) => e.bookingId === booking.id),
  }));
  const isPast = (r: BookingRow) => !!r.event && r.event.date < today;
  return {
    upcoming: rows.filter((r) => !isPast(r)).sort(byWhen),
    past: rows.filter(isPast).sort(byWhen),
  };
}
