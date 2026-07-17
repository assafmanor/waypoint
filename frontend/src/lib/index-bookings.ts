// Index bookings: pair each booking with its linked event (if any) and split
// into past / upcoming for the during-trip view (ADR-0049). A booking's schedule
// lives on its 1:1 linked event (ADR-0047); an unlinked booking has no place on
// the timeline yet, so it's always "upcoming" (something still to schedule).
import { type Booking, type Trip, type TripEvent } from '@waypoint/shared';
import { formatTime, todayInTz } from './time';
import { plainTimingLabel, timingLabels } from './booking-timing';
import { MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';

export interface BookingRow {
  booking: Booking;
  event?: TripEvent; // the linked event, if this booking is scheduled
}

const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);

/** The last calendar day a booking occupies: its check-out for a multi-day span
 *  (endDate), otherwise its single day. Used so an in-progress stay is not filed
 *  under "past" until its check-out has actually passed. */
const lastDay = (event: TripEvent) => event.endDate ?? event.date;

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
  // A multi-day stay stays "upcoming" through check-out day — it drops to "past"
  // only once its last day is behind us, not the morning after check-in.
  const isPast = (r: BookingRow) => !!r.event && lastDay(r.event) < today;
  return {
    upcoming: rows.filter((r) => !isPast(r)).sort(byWhen),
    past: rows.filter(isPast).sort(byWhen),
  };
}

function dayLabel(date: string, trip: Trip, today: string): string {
  if (date === today) return t.index.today;
  const dayNumber = Math.round((Date.parse(date) - Date.parse(trip.startDate)) / MS_PER_DAY) + 1;
  return t.index.dayN(dayNumber);
}

/** The row's schedule line, prefixed with what the time _is_ for this booking type
 *  (ADR-0053 refinement). A multi-day booking (endDate set) flips from its check-in
 *  to its check-out once the check-in day has passed: the check-out day during the
 *  stay, and the check-out _time_ on the check-out day itself. */
export function scheduleLabel(event: TripEvent, booking: Booking, trip: Trip, now: Date): string {
  const today = todayInTz(trip.timezone, now);
  const labels = timingLabels(booking.type);
  const multiDay = !!event.endDate && event.endDate !== event.date;

  if (multiDay && today > event.date) {
    const day = dayLabel(event.endDate!, trip, today);
    const label = plainTimingLabel(labels.end);
    // Before the check-out day the day is enough; on the day itself, name the time.
    return event.endDate === today && event.endsAt
      ? `${label} · ${day} · ${formatTime(event.endsAt, trip.timezone)}`
      : `${label} · ${day}`;
  }

  const day = dayLabel(event.date, trip, today);
  if (!event.startsAt) return day;
  const label = plainTimingLabel(labels.start);
  return `${label} · ${day} · ${formatTime(event.startsAt, trip.timezone)}`;
}
