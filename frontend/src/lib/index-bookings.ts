// Index bookings: pair each booking with its linked event (if any) and split
// into past / upcoming for the during-trip view (ADR-0049). A booking's schedule
// lives on its 1:1 linked event (ADR-0047); an unlinked booking has no place on
// the timeline yet, so it's always "upcoming" (something still to schedule).
import { type Booking, type BookingType, type Trip, type TripEvent } from '@waypoint/shared';
import { formatTime, isEventPast, relativeDay, todayInTz } from './time';
import { plainTimingLabel, timingLabels } from './booking-timing';
import { FILTER_STAGGER_MAX_MS, FILTER_STAGGER_MS, MS_PER_DAY } from '../constants';

/** The bookings-screen category filter (ADR-0098 §2): every `BookingType` plus
 *  an "all" option. Kept beside the type it filters, not a bare string literal
 *  at each call site. */
export const CATEGORY_ALL = 'all';
export type CategoryFilter = BookingType | typeof CATEGORY_ALL;

/** Category-chip match: "all" passes everything, otherwise an exact type match. */
export function matchesCategory(booking: Booking, category: CategoryFilter): boolean {
  return category === CATEGORY_ALL || booking.type === category;
}

/** Search match: title or confirmation code, case-insensitive. An empty/blank
 *  query matches everything (ADR-0098 §2). */
export function matchesQuery(booking: Booking, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    booking.title.toLowerCase().includes(q) || !!booking.confirmationCode?.toLowerCase().includes(q)
  );
}

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

export interface VisibleRow {
  row: BookingRow;
  visible: boolean;
  /** Reveal transition-delay (ms) for a visible row — 0 for a hidden one. */
  delayMs: number;
}

/** Per-row visibility against the current category/search filter, plus a
 *  staggered reveal delay (ADR-0098 §4 motion). `startIndex` lets a caller
 *  chain upcoming → past into one continuous stagger across both lists; the
 *  returned `nextIndex` is that chained call's `startIndex`. */
export function visibleRows(
  rows: BookingRow[],
  category: CategoryFilter,
  query: string,
  startIndex = 0,
): { rows: VisibleRow[]; nextIndex: number } {
  let i = startIndex;
  const out = rows.map((row) => {
    const visible = matchesCategory(row.booking, category) && matchesQuery(row.booking, query);
    const delayMs = visible ? Math.min(i * FILTER_STAGGER_MS, FILTER_STAGGER_MAX_MS) : 0;
    if (visible) i++;
    return { row, visible, delayMs };
  });
  return { rows: out, nextIndex: i };
}

export function splitBookings(
  bookings: Booking[],
  events: TripEvent[],
  timezone: string,
  now: number,
): { upcoming: BookingRow[]; past: BookingRow[] } {
  const at = new Date(now);
  const rows: BookingRow[] = bookings.map((booking) => ({
    booking,
    event: events.find((e) => e.bookingId === booking.id),
  }));
  // A booking is behind you once its linked event's closing edge has passed
  // (ADR-0049): a flight at landing, a hotel at check-out, an untimed booking at
  // midnight. An unlinked booking has no place on the timeline yet, so it's never
  // past. The edge is derived type-agnostically by `eventEndBoundary`.
  const isPast = (r: BookingRow) => !!r.event && isEventPast(r.event, at, timezone);
  return {
    upcoming: rows.filter((r) => !isPast(r)).sort(byWhen),
    past: rows.filter(isPast).sort(byWhen),
  };
}

/** A booking's day as a relative label (ADR-0085) — היום / מחר / עוד N ימים ahead,
 *  אתמול / שלשום / לפני N ימים for the ones already behind you. Both dates are
 *  trip-tz calendar days (YYYY-MM-DD), so the diff is whole-day and DST-safe. */
function dayLabel(date: string, today: string): string {
  const delta = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
  );
  return relativeDay(delta);
}

/** The row's schedule line, prefixed with what the time _is_ for this booking type
 *  (ADR-0053 refinement). A multi-day booking (endDate set) flips from its check-in
 *  to its check-out once the check-in day has passed: the check-out day during the
 *  stay, and the check-out _time_ on the check-out day itself.
 *
 *  A booking already behind you (ADR-0089) drops the transition verb: naming the
 *  action ("נחיתה", "צ׳ק-אאוט") only helps while it's still ahead of you — once
 *  it's in the past-bookings list the day + duration answer "when was it", and
 *  the verb is noise. Past-ness is the same edge `splitBookings` files on. */
export function scheduleLabel(event: TripEvent, booking: Booking, trip: Trip, now: Date): string {
  const today = todayInTz(trip.timezone, now);
  const labels = timingLabels(booking.type);
  const multiDay = !!event.endDate && event.endDate !== event.date;
  const past = isEventPast(event, now, trip.timezone);
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

  if (multiDay && today > event.date) {
    const day = dayLabel(event.endDate!, today);
    const label = past ? undefined : plainTimingLabel(labels.end);
    // Before the check-out day the day is enough; on the day itself, name the time.
    return event.endDate === today && event.endsAt
      ? join(label, day, formatTime(event.endsAt, trip.timezone))
      : join(label, day);
  }

  const day = dayLabel(event.date, today);
  if (!event.startsAt) return day;
  const label = past ? undefined : plainTimingLabel(labels.start);
  return join(label, day, formatTime(event.startsAt, trip.timezone));
}
