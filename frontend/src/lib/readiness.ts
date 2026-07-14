// Plan-mode prep-dashboard readiness — DERIVED from the trip snapshot, never
// stored (same reasoning as the derived Now/Next: auto-writing a computed state
// needs a trigger, emits sync traffic, and goes stale offline — ADR-0018/0027).
//
// A "check" is a dimension of trip-readiness we can *honestly* detect from data
// we already have. The mockup's other rows — Gmail-imported flights, "passports
// uploaded", "travelers not connected to Google" — depend on features/data that
// don't exist yet (Gmail import + WhatsApp are v1.1; documents aren't in the
// snapshot; connection status isn't exposed). They're intentionally absent here
// rather than faked; see the DEFERRED prep-dashboard tasks.
import { BOOKING_TYPE, type Booking, type TripEvent } from '@waypoint/shared';
import { MS_PER_DAY } from '../constants';

export type CheckId = 'flights' | 'lodging' | 'itinerary' | 'group';

export interface ReadinessCheck {
  id: CheckId;
  /** true = this dimension of prep is complete. */
  done: boolean;
  /** Detail count that gives the row its copy (today: empty-day count for `itinerary`). */
  count?: number;
}

export interface Readiness {
  /** 0..100, rounded — fraction of checks complete. */
  pct: number;
  checks: ReadinessCheck[];
  /** Trip-local dates with no events, in chronological order. */
  emptyDates: string[];
}

/** Inclusive [startDate, endDate] as trip-local calendar-date strings. UTC-midnight
 *  arithmetic diffs whole days without a timezone re-interpreting the boundary
 *  (matches lib/mode.ts's daysUntilStart). */
function tripDates(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t <= end; t += MS_PER_DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function computeReadiness(input: {
  startDate: string;
  endDate: string;
  events: TripEvent[];
  bookings: Booking[];
  memberCount: number;
}): Readiness {
  const { startDate, endDate, events, bookings, memberCount } = input;
  const datesWithEvents = new Set(events.map((e) => e.date));
  const emptyDates = tripDates(startDate, endDate).filter((d) => !datesWithEvents.has(d));

  const checks: ReadinessCheck[] = [
    { id: 'flights', done: bookings.some((b) => b.type === BOOKING_TYPE.FLIGHT) },
    { id: 'lodging', done: bookings.some((b) => b.type === BOOKING_TYPE.HOTEL) },
    { id: 'itinerary', done: emptyDates.length === 0, count: emptyDates.length },
    // >1 member = the group has actually joined, not just the creator (ADR-0021).
    { id: 'group', done: memberCount > 1 },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  return { pct: Math.round((doneCount / checks.length) * 100), checks, emptyDates };
}
