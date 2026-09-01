// **The columns phase B's kinds read off an `Event`, and the two derivations they share**
// (ADR-0198 §2).
//
// Its own module for the same reason `trip-audience` is: three kinds asking the same three
// questions is where a second, subtly-different answer gets written. In particular `eventZone`
// — which wall clock an event's time means — has to be the display's own derivation or a
// notification will print an hour the screen never showed (ADR-0197 §5).
import { eventDisplayZones } from '@waypoint/shared';
import type { TripZones } from '../notification-kind';

/** Exactly the columns the phase-B kinds select. Narrow on purpose: a kind that starts reading
 *  a sixth field adds it here, where the `select` can be checked against it. */
export interface EventRow {
  id: string;
  tripId: string;
  title: string;
  date: Date;
  endDate: Date | null;
  category: string | null;
  icon: string | null;
  kind: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  startWindowEnd: Date | null;
  endWindowStart: Date | null;
  displayTimezone: string | null;
  /** **The place rung of the zone derivation** (2026-09-01). Added because `eventZones` below
   *  resolves per END, and a departure's own zone comes from its booking's `fromPlace` — with
   *  neither of these the resolver can only ask which segment an instant falls in, which for a
   *  flight is the DESTINATION. */
  placeId: string | null;
  bookingId: string | null;
}

export const EVENT_SELECT = {
  id: true,
  tripId: true,
  title: true,
  date: true,
  endDate: true,
  category: true,
  icon: true,
  kind: true,
  status: true,
  startsAt: true,
  endsAt: true,
  startWindowEnd: true,
  endWindowStart: true,
  displayTimezone: true,
  placeId: true,
  bookingId: true,
} as const;

/**
 * **The zone each END of an event's time means** — its own override when it has one, else
 * ADR-0107's per-end resolver.
 *
 * The same shape `dueZone` has for a task deadline, and for the same reason: a pinned zone is
 * a wall clock somebody typed, and deriving over it would print an hour they never chose
 * (ADR-0107 §7).
 *
 * **It returns a PAIR, and that is the 2026-09-01 repair.** This used to call
 * `eventDisplayZone` — one zone, from `currentZone`, with no place rung — which answers _where
 * are you now_ and not _what does this clock say_. A crossing is stamped at the flight's
 * departure, so asking it about a departure yields the DESTINATION: the same defect that made
 * ADR-0213's shared page print `14:30` for a 15:30 Tel Aviv take-off, here on a surface where
 * an hour is worse (ADR-0197 §5: a reminder at the wrong local time is the one bug that gets
 * the feature turned off). A pair forces every caller to say which end it means — and
 * `span-edge` genuinely needs both, since its edge is already tagged `'start' | 'end'`.
 */
export function eventZones(event: EventRow, zones: TripZones): { start: string; end: string } {
  return eventDisplayZones(event as never, {
    bookings: zones.bookings as never,
    places: zones.places as never,
    crossings: zones.crossings,
    primaryZone: zones.primaryZone,
  });
}

/** The calendar day an event belongs to, as the day route keys it. Read in the event's own
 *  zone, so a 01:00 arrival opens the day it landed on rather than the day before. */
export function eventDayKey(event: EventRow, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(event.startsAt ?? event.date);
}
