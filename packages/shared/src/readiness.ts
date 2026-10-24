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
import { BOOKING_TYPE, DOCUMENT_TYPE, EVENT_CATEGORY } from './constants';
import { MULTI_ZONE_COUNTRIES } from './destinations';
import { spendsSpanInMotion } from './icons';
import type { Booking, DocumentSummary, Place, Trip, TripEvent } from './entities';
import { addDays, MS_PER_DAY, MS_PER_MINUTE, tripDates, zonedIso } from './trip-dates';

/** **The hours a night is slept in**, as trip-local wall clock — the window readiness
 *  measures a night's sleepable stretch inside (ADR-0061's 2026-08-14 amendment). The end
 *  reads on the FOLLOWING calendar day, which is what makes the pair a night rather than
 *  an evening. Deliberately wider than anyone sleeps: it is the span a bed could be used
 *  in, and what gets subtracted from it is the transport that provably occupied it.
 *
 *  Moved here from `frontend/src/constants.ts` with this module (ADR-0198 phase C), which
 *  was their only reader — they mean nothing outside this derivation. */
const NIGHT_WINDOW_START_TIME = '22:00';
const NIGHT_WINDOW_END_TIME = '08:00';

/** **The shortest stretch that still reads as a night in a bed.** Below it, nobody books
 *  a room — a 01:00 departure leaves three hours between dinner and the airport, and a
 *  bus arriving at 04:00 leaves four before the day starts. Above it (a 06:00 flight
 *  leaves eight), you slept somewhere and the lodging check should still be asking where.
 *  Tunable: it is the one number separating those two readings. */
const SLEEPABLE_NIGHT_MIN_MINUTES = 5 * 60;

export type CheckId = 'flights' | 'lodging' | 'itinerary' | 'documents' | 'group';

export interface ReadinessCheck {
  id: CheckId;
  /** true = this dimension of prep is complete. */
  done: boolean;
  /** Row-copy detail: empty-day count (`itinerary`), travellers-with-passport
   *  (`documents`), or trip-nights-covered (`lodging`). */
  count?: number;
  /** Denominator for the rollup ("count מתוך total"): travellers (`documents`) or, for
   *  `lodging`, the trip nights that NEED a bed — a night spent in the air or on a night
   *  bus leaves the denominator rather than sitting in it uncovered forever. */
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
  // **Both operands are guarded, and the second consumer is why** (ADR-0203 §5). While
  // `computeReadiness` was the only caller these arrived from a loaded Trip and were always
  // strings. A FORM calls this on every render, and a trip whose destination is not set yet
  // hands `undefined` — which threw inside render, and an exception in render with no error
  // boundary anywhere in the app takes the whole screen (the same blank-screen shape
  // `DateField`'s clear note records). Empty already answers false, so an absent name
  // answering false is the existing rule rather than a new one.
  const a = (placeName ?? '').trim().toLowerCase();
  const b = (destinationName ?? '').trim().toLowerCase();
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
 *  (ADR-0061's degradation clause).
 *
 *  **Exported since ADR-0203 §5, and the reason is the defect that ADR was written about
 *  one function over.** This is the app's only answer to "is this leg the way there or the
 *  way back", and while it was module-private the booking form could not ask it — so a
 *  form offering the trip's first day and its last day had no way to tell which one a
 *  journey wanted, and offered both. ADR-0154 recorded the same shape about `PlanHome`:
 *  _"the app knows what a round trip is, in exactly one corner, and the form it would help
 *  never hears about it."_ Two consumers now, and the degradation clause above is what
 *  makes it safe for the second: it can only ever REMOVE a suggestion, never add a wrong
 *  one. */
/** **The destination, as the four fields `reachesDestination` reads.**
 *
 *  Extracted rather than written a second time (rule 8). `useAutomaticTasks` had this object
 *  inline as part of an eight-field `computeReadiness` call, which was right while it was the
 *  only caller; the booking form asking the same question is what makes it a shared
 *  derivation. A `Pick` rather than a whole `Trip` so a caller with only the fields — a
 *  server route, a test — can supply them. */
export const destinationRefOf = (
  trip: Pick<
    Trip,
    'destination' | 'destinationGooglePlaceId' | 'timezone' | 'destinationCountryCode'
  >,
): DestinationRef => ({
  name: trip.destination,
  googlePlaceId: trip.destinationGooglePlaceId,
  timezone: trip.timezone,
  countryCode: trip.destinationCountryCode,
});

export function reachesDestination(place: Place | undefined, destination: DestinationRef): boolean {
  if (!place) return false;
  return (
    (Boolean(place.googlePlaceId) && place.googlePlaceId === destination.googlePlaceId) ||
    zoneReachesDestination(place.timezone, destination) ||
    nameReachesDestination(place.name, destination.name)
  );
}

/** **A stretch of a night nobody could have been in a bed for**, plus which side of the
 *  destination it leaves you on. Only a booked leg that CARRIES you (`spendsSpanInMotion`)
 *  becomes one: an unbooked event has no type, so a taxi and a car hire are the same shape
 *  to us, and crediting the wrong one would be the false pass ADR-0061 forbids. */
interface TransitLeg {
  start: number;
  end: number;
  /** Its origin is the destination — after this leg you are no longer here. */
  leavesDestination: boolean;
  /** Its endpoint is the destination — after this leg you are here. */
  arrivesAtDestination: boolean;
}

/** The carried legs of the trip, in chronological order. A `Booking` holds no schedule
 *  (ADR-0047 §1), so the instants come off its linked event; a leg with no times is not
 *  a leg here, which is what keeps an untimed flight from silently emptying a night. */
function transitLegs(
  events: TripEvent[],
  bookings: Booking[],
  placeOf: (placeId?: string) => Place | undefined,
  destination: DestinationRef,
): TransitLeg[] {
  const carried = new Map<string, Booking>();
  for (const b of bookings) if (spendsSpanInMotion(b.type)) carried.set(b.id, b);
  const legs: TransitLeg[] = [];
  for (const e of events) {
    const booking = e.bookingId ? carried.get(e.bookingId) : undefined;
    if (!booking || !e.startsAt || !e.endsAt) continue;
    const start = Date.parse(e.startsAt);
    const end = Date.parse(e.endsAt);
    if (!(end > start)) continue;
    legs.push({
      start,
      end,
      leavesDestination: reachesDestination(placeOf(booking.fromPlaceId), destination),
      arrivesAtDestination: reachesDestination(placeOf(booking.toPlaceId), destination),
    });
  }
  return legs.sort((a, b) => a.start - b.start);
}

/** **Was there a bed-shaped gap in this night?** (ADR-0061's 2026-08-14 amendment.)
 *
 *  Take the night's window and subtract two things: the time you spent **in motion**, and
 *  the time you spent **somewhere else** — a leg out of the destination ends your presence,
 *  a leg into it starts one. What is left is the longest stretch a room could have been
 *  slept in; below `SLEEPABLE_NIGHT_MIN_MINUTES` nobody books one.
 *
 *  Both subtractions are needed and the 01:00 departure is why. An overlap test alone
 *  scores a 01:00 flight out and a 01:00 flight in the same, and they are opposite facts:
 *  the first consumes the night, the second is the reason you want the bed.
 *
 *  **It can only ever say "no bed needed", never "no bed booked".** An untimed leg, an
 *  endpoint no route can place, a trip with no zone: nothing is subtracted, the window
 *  stays whole, and the check stays open — the same degradation direction ADR-0061 chose. */
function nightNeedsABed(date: string, legs: TransitLeg[], timezone: string | undefined): boolean {
  if (!timezone) return true;
  const windowStart = Date.parse(zonedIso(date, NIGHT_WINDOW_START_TIME, timezone));
  const windowEnd = Date.parse(zonedIso(addDays(date, 1), NIGHT_WINDOW_END_TIME, timezone));

  let longest = 0;
  let cursor = windowStart;
  // You are here until a leg says otherwise. A departure that happened entirely before
  // the window leaves this true, so the night reads as needing a bed — open, never a
  // false pass.
  let present = true;
  const considerGap = (from: number, to: number) => {
    if (present && to - from > longest) longest = to - from;
  };

  for (const leg of legs) {
    if (leg.start >= windowEnd || leg.end <= windowStart) continue;
    if (leg.start > cursor) considerGap(cursor, Math.min(leg.start, windowEnd));
    cursor = Math.max(cursor, Math.min(leg.end, windowEnd));
    // An arrival wins over a departure, so a hop between two places inside the
    // destination (both endpoints reach it) leaves you here rather than away.
    if (leg.arrivesAtDestination) present = true;
    else if (leg.leavesDestination) present = false;
  }
  considerGap(cursor, windowEnd);

  return longest >= SLEEPABLE_NIGHT_MIN_MINUTES * MS_PER_MINUTE;
}

/**
 * The five checks, from the trip snapshot.
 *
 * **Day keys are compared as STRINGS here** — `datesWithEvents`, the covered-night set, the
 * empty-day filter — so a caller holding database rows must spell `startDate`, `endDate` and
 * every event's `date`/`endDate` as `YYYY-MM-DD` before it gets here. A `Date` object matches
 * nothing and reads as *no event on that day* rather than as a type error: on the server that
 * is `itinerary` and `lodging` false-open forever, which is what a notification then says out
 * loud (owner report, 2026-09-04). `eventsOnDate` in `zones.ts` carries the same warning for
 * the same reason; the backend's conversion is `trips.mapper.ts`.
 */
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

  // Lodging night-coverage (ADR-0061): complete only when every trip night that NEEDS a
  // bed has one, not merely "a hotel exists". A booking carries no dates — its span lives
  // on the linked event (date = check-in, endDate = check-out; ADR-0018/0063). A stay with
  // no endDate covers just its own night. Trip nights are [startDate, endDate): the
  // departure day has no night.
  //
  // Two widenings, both from the 2026-08-14 amendment, and both only ever CLOSE a night
  // the old rule left falsely open: a lodging-category event covers its nights without a
  // booking (the friend's spare room, the campsite), and a night with no sleepable stretch
  // left in it does not need a bed at all (see `nightNeedsABed`).
  const hotelBookingIds = new Set(
    bookings.filter((b) => b.type === BOOKING_TYPE.HOTEL).map((b) => b.id),
  );
  const coveredNights = new Set<string>();
  for (const e of events) {
    const isStay =
      (e.bookingId != null && hotelBookingIds.has(e.bookingId)) ||
      e.category === EVENT_CATEGORY.LODGING;
    if (!isStay) continue;
    const nights = e.endDate && e.endDate > e.date ? nightsInSpan(e.date, e.endDate) : [e.date];
    for (const n of nights) coveredNights.add(n);
  }
  const legs = transitLegs(events, bookings, placeOf, destination);
  const nightsNeedingABed = nightsInSpan(startDate, endDate).filter((n) =>
    nightNeedsABed(n, legs, destination.timezone),
  );
  const nightsCovered = nightsNeedingABed.filter((n) => coveredNights.has(n)).length;

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
      done: nightsCovered === nightsNeedingABed.length,
      count: nightsCovered,
      total: nightsNeedingABed.length,
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
