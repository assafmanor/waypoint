// **What the app calls a day, and it is what the reader calls it** (ADR-0219 §2).
//
// The derivation itself is `@waypoint/shared`'s (`fallbackDayTitle` over `DayFacts`, moved
// there in phase 2 for exactly this): flights first, then the region the day's stops share,
// then what they are, then the furthest stop or the route. What lives here is the app's half —
// assembling `DayFacts` from trip state, and saying the result in Hebrew.
//
// **`dayTitleText` was `SharedItinerary`'s** and is not any more. The projection ships
// `{ kind, …values }` rather than a composed line precisely so each renderer supplies its own
// words (ADR-0213's 2026-08-30 amendment), and there are three renderers now. Values are
// isolated one at a time (`autoIsolate`), which leaves the sentence around them in the page's
// RTL flow — so the element holding the result must NOT carry `dir="auto"`, which skips
// isolates when it sniffs and would fall back to LTR on a fully isolated line.
import {
  BOOKING_TYPE,
  ROUTE_ARROW,
  SHARE_DAY_KIND,
  buildDayStopSequence,
  eventStopPlaceId,
  dominantValue,
  fallbackDayTitle,
  isTransportEvent,
  resolveTextVariant,
  SUMMARY_LANG_PREFERENCE,
  tripShapeOf,
  type Booking,
  type BookingType,
  type DayFacts,
  type Place,
  type SharedDayTitle,
  type TripEnrichments,
  type Trip,
  type TripEvent,
} from '@waypoint/shared';
import { autoIsolate } from './bidi';
import { placeLabelOf, type PlaceLabels } from './place-label';
import { ambientEventsOnDate, dayBookendStays } from './glance';
import { t } from '../i18n/he';

/** The derived headline, said in words. Empty for `NONE` — a day with nothing in it has no
 *  true title, and the caller falls back rather than inventing one. */
export function dayTitleText(title: SharedDayTitle): string {
  switch (title.kind) {
    case SHARE_DAY_KIND.FLIGHT_OUT:
      return t.share.public.dayTitle.flightOut(autoIsolate(title.to));
    case SHARE_DAY_KIND.FLIGHT_HOME:
      return t.share.public.dayTitle.flightHome;
    case SHARE_DAY_KIND.FLIGHT:
      return t.share.public.dayTitle.flight(autoIsolate(title.to));
    case SHARE_DAY_KIND.ROUTE:
      return `${autoIsolate(title.from)}${ROUTE_ARROW}${autoIsolate(title.to)}`;
    case SHARE_DAY_KIND.PLACE:
      return autoIsolate(title.at);
    case SHARE_DAY_KIND.REGION:
      return autoIsolate(title.at);
    case SHARE_DAY_KIND.KIND:
      return t.share.public.dayTitle.kind(autoIsolate(title.of));
    case SHARE_DAY_KIND.TEXT:
      return title.text;
    case SHARE_DAY_KIND.NONE:
      return '';
    default:
      // **Exhaustive, and it has to be.** A `default: return ''` swallowed a new kind
      // silently — the two added on 2026-08-30 would have rendered as nothing at all, on a
      // typecheck that passed. `never` makes the next one a compile error here.
      return assertNever(title);
  }
}

/** The compiler's proof that a union was handled. Throwing is unreachable by construction;
 *  it exists so the type error is the one that fires. */
function assertNever(value: never): string {
  void value;
  return '';
}

/** Everything the app holds that a day's name is derived from. Gathered by the screen, which
 *  is the only thing with the trip state; passed whole so the two day surfaces cannot assemble
 *  it two ways (`frontend/CLAUDE.md`: a difference about a FACT is what ADR-0159 §1 forbids). */
export interface DayFactsInput {
  trip: Pick<Trip, 'destination' | 'startDate'>;
  date: string;
  /** The day's own events, and the whole trip's — the second is what says whether THIS day is
   *  the way out or the way home, which is a whole-trip question. */
  dayEvents: TripEvent[];
  events: TripEvent[];
  bookings: Booking[];
  places: Place[];
  placeLabels: PlaceLabels;
  enrichments: TripEnrichments;
}

/**
 * **The day's facts, assembled from trip state** — the app's answer to what the sharing
 * projection assembles from Prisma rows.
 *
 * Every rule inside it belongs to `@waypoint/shared`: the stops sequence (a leg contributes
 * both its ends), the region/kind majority, and the trip's shape. What is answered here is
 * only where those inputs come from.
 */
export function buildDayFacts({
  trip,
  date,
  dayEvents,
  events,
  bookings,
  places,
  placeLabels,
  enrichments,
}: DayFactsInput): DayFacts {
  const bookingOf = (event: TripEvent) =>
    event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const label = (placeId: string) =>
    placeLabelOf(placeLabels, placeId, places.find((p) => p.id === placeId)?.name);
  /** The two claims the enrichment pass reads, in the reader's own `he` → `en` preference. */
  const textOf = (placeId: string | undefined, field: 'kind' | 'region') => {
    const variants = placeId ? enrichments[placeId]?.[field] : undefined;
    return variants ? resolveTextVariant(variants, SUMMARY_LANG_PREFERENCE)?.value : undefined;
  };
  // Only the SETTLED stops vote: a transport leg's endpoints are airports, and an airport's
  // region would name a travel day after the municipality of its runway.
  const settled = dayEvents.filter((event) => !isTransportEvent(event, bookingOf(event)));

  /** **Where a row IS**, which is not `event.placeId`: ADR-0048 clears that column on every
   *  booking-backed row, so reading it alone puts the day's hotels, restaurants and tickets at
   *  nowhere — the day named by the two unbooked stops between them, and voting on its region
   *  with a fraction of its stops. */
  const stopOf = (event: TripEvent) => {
    const booking = bookingOf(event);
    return {
      placeId: eventStopPlaceId(event, booking),
      fromPlaceId: booking?.fromPlaceId,
      toPlaceId: booking?.toPlaceId,
      // What the trip calls it, for a place whose NAME is its own street address.
      title: event.title,
    };
  };
  /** A place's stored address, for `isAddressLabel`'s half that the label cannot answer. */
  const addressOf = (placeId: string) => places.find((p) => p.id === placeId)?.address;

  /** The stop's own name, for a row whose label is where it IS rather than what it is called. */
  const stayLabel = (event: TripEvent) => label(stopOf(event).placeId ?? '');

  const isFlight = (event: TripEvent) => bookingOf(event)?.type === BOOKING_TYPE.FLIGHT;
  /** Which days hold anything, and which hold a flight — both whole-trip questions, and both
   *  tested against the days that hold anything at all rather than against the calendar: a
   *  trip padded with empty days on either side still departs on its first real one. */
  const busyDates = [...new Set(events.map((event) => event.date))].sort();
  const flightDates = busyDates.filter((day) =>
    events.some((event) => event.date === day && isFlight(event)),
  );
  const firstFlight = flightDates[0];
  const lastFlight = flightDates[flightDates.length - 1];

  // **The trip's shape**, from the bases it sleeps at (ADR-0219 §2 via `tripShapeOf`). On a
  // `base` trip every day leaves from and returns to the same bed, so a `from ← to` title
  // describes the commute rather than the day.
  const nights = busyDates.map((day) => {
    const stay = ambientEventsOnDate(events, day).find((event) => event.placeId || event.title);
    return stay ? (stayLabel(stay) ?? stay.title) : undefined;
  });
  // Where the night IS, not what the booking is called: a lodging's own title is a brand — which
  // is a claim `event.placeId` cannot honour, since a booked hotel has none (`eventStopPlaceId`).
  const bookends = dayBookendStays(events, date);
  const sleeps = bookends.sleeps ?? bookends.woke;

  return {
    stops: buildDayStopSequence(dayEvents.map(stopOf), label, addressOf),
    bookingTypes: dayEvents.map((event) => bookingOf(event)?.type as BookingType | undefined),
    lodgingPlace: sleeps ? (stayLabel(sleeps) ?? sleeps.title) : undefined,
    eventTitles: dayEvents.map((event) => event.title),
    // Where a flight on this day lands — an airport's own name, so it is what a MID-trip
    // flight is titled by and never what the outbound one is.
    flightTo: dayEvents
      .filter(isFlight)
      .map((event) => label(bookingOf(event)?.toPlaceId ?? ''))
      .filter(Boolean)
      .at(-1),
    tripDestination: trip.destination.trim() || undefined,
    outbound: date === firstFlight && firstFlight === busyDates[0],
    returning:
      date !== firstFlight && date === lastFlight && lastFlight === busyDates[busyDates.length - 1],
    region: dominantValue(settled.map((event) => textOf(stopOf(event).placeId, 'region'))),
    kind: dominantValue(settled.map((event) => textOf(stopOf(event).placeId, 'kind'))),
    tripShape: tripShapeOf(nights).shape,
  };
}

/**
 * **What the day's head says it is.**
 *
 * `trip.destination` on `NONE` — that is what the old `.sec-title` heading carried and the one
 * word an empty day still has (ADR-0219 §2). The trip ordinal and the destination are the
 * header anchor's and the trip name's, so neither is repeated in the head.
 */
export function dayHeadTitle(input: DayFactsInput): string {
  return dayTitleText(fallbackDayTitle(buildDayFacts(input))) || input.trip.destination;
}
