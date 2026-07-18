// Plan-mode prep-dashboard readiness — DERIVED from the trip snapshot, never
// stored (same reasoning as the derived Now/Next: auto-writing a computed state
// needs a trigger, emits sync traffic, and goes stale offline — ADR-0018/0027).
//
// A "check" is a dimension of trip-readiness we can *honestly* detect from data
// we already have (ADR-0045, ADR-0061). Five checks, all real-data-only:
// flights (round-trip aware), lodging, itinerary (empty days), documents
// (per-traveller passports, now that documents ride the snapshot — ADR-0058),
// and group. Still-deferred signals (Gmail import, Google-connection, WhatsApp)
// have no data/feature behind them and stay out rather than faked (ADR-0004).
import {
  BOOKING_TYPE,
  DOCUMENT_TYPE,
  type Booking,
  type DocumentSummary,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { MS_PER_DAY } from '../constants';

export type CheckId = 'flights' | 'lodging' | 'itinerary' | 'documents' | 'group';

export interface ReadinessCheck {
  id: CheckId;
  /** true = this dimension of prep is complete. */
  done: boolean;
  /** Row-copy detail: empty-day count (`itinerary`) or travellers-with-passport (`documents`). */
  count?: number;
  /** Total travellers, for the `documents` rollup ("count מתוך total"). */
  total?: number;
  /** `flights`: is there a leg reaching the destination (outbound) / leaving it (return)? */
  hasOutbound?: boolean;
  hasReturn?: boolean;
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

/** Does a leg endpoint (a name-only Place, ADR-0051) reach the trip destination?
 *  Names are all we have pre-picker, so match case-insensitively with substring
 *  tolerance ("Tokyo, Japan" reaches "Japan"). A missing place can't be confirmed,
 *  so it returns false — the check stays open (ADR-0061 degradation clause). */
function reachesDestination(placeName: string | undefined, destination: string): boolean {
  if (!placeName) return false;
  const a = placeName.trim().toLowerCase();
  const b = destination.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function computeReadiness(input: {
  startDate: string;
  endDate: string;
  destination: string;
  events: TripEvent[];
  bookings: Booking[];
  places: Place[];
  documents: DocumentSummary[];
  travelerIds: string[];
}): Readiness {
  const { startDate, endDate, destination, events, bookings, places, documents, travelerIds } =
    input;

  const datesWithEvents = new Set(events.map((e) => e.date));
  const emptyDates = tripDates(startDate, endDate).filter((d) => !datesWithEvents.has(d));

  // Round-trip flights (ADR-0061): a leg INTO the destination (outbound) and a leg
  // OUT of it (return), read off the flights' from/to Place names — not a bare count.
  const nameOf = (placeId?: string) => places.find((p) => p.id === placeId)?.name;
  const flights = bookings.filter((b) => b.type === BOOKING_TYPE.FLIGHT);
  const hasOutbound = flights.some((f) => reachesDestination(nameOf(f.toPlaceId), destination));
  const hasReturn = flights.some((f) => reachesDestination(nameOf(f.fromPlaceId), destination));

  // Per-traveller passports (ADR-0061): complete only when every traveller has
  // uploaded a passport of their own (a group-owned doc doesn't cover a person).
  const passportOwners = new Set(
    documents
      .filter((d) => d.type === DOCUMENT_TYPE.PASSPORT && d.ownerUserId)
      .map((d) => d.ownerUserId),
  );
  const travelersWithPassport = travelerIds.filter((id) => passportOwners.has(id)).length;

  const checks: ReadinessCheck[] = [
    { id: 'flights', done: hasOutbound && hasReturn, hasOutbound, hasReturn },
    { id: 'lodging', done: bookings.some((b) => b.type === BOOKING_TYPE.HOTEL) },
    { id: 'itinerary', done: emptyDates.length === 0, count: emptyDates.length },
    {
      id: 'documents',
      done: travelerIds.length > 0 && travelersWithPassport === travelerIds.length,
      count: travelersWithPassport,
      total: travelerIds.length,
    },
    // >1 traveller = the group has actually joined, not just the creator (ADR-0021).
    { id: 'group', done: travelerIds.length > 1 },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  return { pct: Math.round((doneCount / checks.length) * 100), checks, emptyDates };
}
