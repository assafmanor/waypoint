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
  MULTI_ZONE_COUNTRIES,
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
  /** Row-copy detail: empty-day count (`itinerary`), travellers-with-passport
   *  (`documents`), or trip-nights-covered (`lodging`). */
  count?: number;
  /** Denominator for the rollup ("count מתוך total"): travellers (`documents`)
   *  or trip nights (`lodging`). */
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

/** Half-open [startDate, endExclusive) as trip-local date strings — the nights
 *  you need a bed for. UTC-midnight arithmetic, same as tripDates. */
function nightsInSpan(startDate: string, endExclusive: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${endExclusive}T00:00:00Z`);
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t < end; t += MS_PER_DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** The trip destination as a **place**, not as a string — the structured fields
 *  ADR-0113 resolves from the picked destination, which is what lets the
 *  round-trip check below ask where a leg lands instead of what it is called. */
export interface DestinationRef {
  /** The display string (`Trip.destination`), and the name route's input. */
  name: string;
  googlePlaceId?: string;
  /** `Trip.timezone` — the trip's primary zone IS the destination's own zone
   *  (ADR-0113 §2, ADR-0107 §5), derived from the picked destination's point. */
  timezone?: string;
  /** ISO-3166 alpha-2, from the same pick. */
  countryCode?: string;
}

/** Is the endpoint's zone the destination's zone? A `Place.timezone` is resolved
 *  server-side from that place's own coordinates (ADR-0107/0108), so this is a
 *  region test on real location data — and a zone is the coarsest region we
 *  store, which is what a country-sized destination needs. A destination country
 *  known to span several zones accepts any of them, so a leg into Los Angeles
 *  reaches a New-York-zoned trip to the United States; both sides must sit in
 *  that one country's list, so it never widens into a second country. */
function zoneReachesDestination(zone: string | undefined, destination: DestinationRef): boolean {
  const destZone = destination.timezone;
  if (!zone || !destZone) return false;
  if (zone === destZone) return true;
  const countryZones = destination.countryCode
    ? MULTI_ZONE_COUNTRIES[destination.countryCode]
    : undefined;
  return Boolean(countryZones?.includes(zone) && countryZones.includes(destZone));
}

/** Names, case-insensitively and with substring tolerance ("Tokyo, Japan" reaches
 *  "Japan"). All we have for a name-only Place-lite (ADR-0051), and true of an
 *  airport only by luck — "Keflavik" says nothing about "Iceland". */
function nameReachesDestination(placeName: string, destinationName: string): boolean {
  const a = placeName.trim().toLowerCase();
  const b = destinationName.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Does a leg endpoint reach the trip destination? Three independent routes, each
 *  positive evidence and any one of them enough: the endpoint **is** the
 *  destination place, its **zone** is the destination's (the location truth —
 *  Keflavík reaches Iceland because of where it is, which no reading of its name
 *  can establish), or its **name** contains the destination's, which stays the
 *  fallback for a Place-lite that has no location at all.
 *
 *  Nothing here can answer NO: a place no route can place is unconfirmed, and an
 *  unconfirmed leg leaves the check open rather than falsely reading done
 *  (ADR-0061's degradation clause). */
function reachesDestination(place: Place | undefined, destination: DestinationRef): boolean {
  if (!place) return false;
  return (
    (Boolean(place.googlePlaceId) && place.googlePlaceId === destination.googlePlaceId) ||
    zoneReachesDestination(place.timezone, destination) ||
    nameReachesDestination(place.name, destination.name)
  );
}

export function computeReadiness(input: {
  startDate: string;
  endDate: string;
  destination: DestinationRef;
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
  // OUT of it (return), read off the flights' from/to Places — not a bare count.
  const placeOf = (placeId?: string) => places.find((p) => p.id === placeId);
  const flights = bookings.filter((b) => b.type === BOOKING_TYPE.FLIGHT);
  const hasOutbound = flights.some((f) => reachesDestination(placeOf(f.toPlaceId), destination));
  const hasReturn = flights.some((f) => reachesDestination(placeOf(f.fromPlaceId), destination));

  // Lodging night-coverage (ADR-0061): complete only when every trip NIGHT is
  // covered by a hotel booking, not merely "a hotel exists". A booking carries no
  // dates — its span lives on the linked event (date = check-in, endDate =
  // check-out; ADR-0018/0063). A stay with no endDate covers just its own night.
  // Trip nights are [startDate, endDate): the departure day has no night.
  const hotelBookingIds = new Set(
    bookings.filter((b) => b.type === BOOKING_TYPE.HOTEL).map((b) => b.id),
  );
  const coveredNights = new Set<string>();
  for (const e of events) {
    if (!e.bookingId || !hotelBookingIds.has(e.bookingId)) continue;
    const nights = e.endDate && e.endDate > e.date ? nightsInSpan(e.date, e.endDate) : [e.date];
    for (const n of nights) coveredNights.add(n);
  }
  const tripNights = nightsInSpan(startDate, endDate);
  const nightsCovered = tripNights.filter((n) => coveredNights.has(n)).length;

  // Passports (ADR-0061): every traveller should have a passport uploaded. The
  // per-owner picker is deferred (ADR-0015), so uploads are group-owned and can't
  // yet be attributed to a person — so we count passport documents against the
  // traveller head-count rather than by owner.
  // ponytail: counts documents, not owners; tighten to per-owner when the upload
  // owner picker ships.
  const passportCount = documents.filter((d) => d.type === DOCUMENT_TYPE.PASSPORT).length;
  const travelersWithPassport = Math.min(passportCount, travelerIds.length);

  const checks: ReadinessCheck[] = [
    { id: 'flights', done: hasOutbound && hasReturn, hasOutbound, hasReturn },
    {
      id: 'lodging',
      done: tripNights.length === 0 || nightsCovered === tripNights.length,
      count: nightsCovered,
      total: tripNights.length,
    },
    { id: 'itinerary', done: emptyDates.length === 0, count: emptyDates.length },
    {
      id: 'documents',
      done: travelerIds.length > 0 && passportCount >= travelerIds.length,
      count: travelersWithPassport,
      total: travelerIds.length,
    },
    // >1 traveller = the group has actually joined, not just the creator (ADR-0021).
    { id: 'group', done: travelerIds.length > 1 },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  return { pct: Math.round((doneCount / checks.length) * 100), checks, emptyDates };
}
