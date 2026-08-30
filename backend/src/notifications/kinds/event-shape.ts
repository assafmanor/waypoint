// **The columns phase B's kinds read off an `Event`, and the two derivations they share**
// (ADR-0198 §2).
//
// Its own module for the same reason `trip-audience` is: three kinds asking the same three
// questions is where a second, subtly-different answer gets written. In particular `eventZone`
// — which wall clock an event's time means — has to be the display's own derivation or a
// notification will print an hour the screen never showed (ADR-0197 §5).
import { eventDisplayZone } from '../../common/event-zone.util';
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
} as const;

/**
 * **The zone an event's time means** — its own override when it has one, else ADR-0107's
 * resolver at the instant in question.
 *
 * The same shape `dueZone` has for a task deadline, and for the same reason: a pinned zone is
 * a wall clock somebody typed, and deriving over it would print an hour they never chose
 * (ADR-0107 §7).
 *
 * The derivation itself moved to `common/event-zone.util.ts` when ADR-0213's shared
 * itinerary became its second reader; this stays as the name the phase-B kinds call.
 */
export function eventZone(event: EventRow, zones: TripZones, atMs?: number): string {
  return eventDisplayZone(event, zones, atMs);
}

/** The calendar day an event belongs to, as the day route keys it. Read in the event's own
 *  zone, so a 01:00 arrival opens the day it landed on rather than the day before. */
export function eventDayKey(event: EventRow, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(event.startsAt ?? event.date);
}
