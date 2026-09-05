// **How a day is named**, and it is now named the same way three times over (ADR-0219 §7).
//
// This derivation was written for the public reader (ADR-0213 §2) and lived in
// `backend/src/sharing/itinerary-narrative.fallback.ts`, where it could only ever answer for
// a share. ADR-0219 §2 puts the same title at the head of both day surfaces in the app —
// so the derivation moves here, beside `tripShapeOf` and `derivedPlaceLabel`, which made the
// same move for the same reason (ADR-0213's fourth pass).
//
// **It emits no word of any language.** A day ships a kind and its values
// (`{ kind: 'flightOut', to }`) and each renderer keys its own copy off it — the locale
// boundary this package's CLAUDE.md draws, unchanged by the move.
//
// Everything here is pure and clock-free: the caller assembles `DayFacts` from whatever rows
// it holds (Prisma on the server, trip state in the app) and this decides what to call it.
import {
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_TRIP_SHAPE,
  type SharedDayTitle,
  type SharedDaySummary,
  type ShareTripShape,
} from './sharing';
import { BOOKING_TYPE } from './constants';
import type { BookingType } from './entities';

const MAX_SUMMARY_EVENTS = 2;

/** Consecutive de-duplication: a route is where you *changed* to, not every stop that
 *  repeated the last one. Empty and blank labels drop out entirely. */
export function dedupeConsecutive(labels: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw?.trim();
    if (!label) continue;
    if (out[out.length - 1] === label) continue;
    out.push(label);
  }
  return out;
}

/** One event, as far as "where did this day go" is concerned. A leg states both its ends;
 *  everything else states the one place it is at. */
export interface DayStopEvent {
  placeId?: string;
  fromPlaceId?: string;
  toPlaceId?: string;
}

/**
 * **The places a day touches, in order, legs contributing both their ends.**
 *
 * `DayFacts.stops` in one call, so the app builds it the way the projection does rather than
 * re-deriving "a leg has two ends" from its own rows. Left un-deduped: `fallbackDayTitle`
 * dedupes consecutively itself, and a caller that wants the raw sequence has it.
 *
 * The label is a callback because the two callers hold different rows — a Prisma place, a
 * `Place` from trip state — and both already answer "what do we call this place" through
 * `derivedPlaceLabel`. Handing it in keeps the one-place-label rule intact (ADR-0166 §18).
 */
export function buildDayStopSequence(
  events: readonly DayStopEvent[],
  label: (placeId: string) => string | undefined,
): (string | undefined)[] {
  return events.flatMap((event) => {
    const { fromPlaceId, toPlaceId } = event;
    // Both ends, in travel order, so a leg contributes its origin AND its destination.
    if (fromPlaceId || toPlaceId) return [label(fromPlaceId ?? ''), label(toPlaceId ?? '')];
    return [event.placeId ? label(event.placeId) : undefined];
  });
}

/** How much of a day's stops must agree before their shared claim names the whole day. */
const MAJORITY = 0.6;

/**
 * **The value a clear majority of a day's stops share, or nothing.**
 *
 * The rule behind `DayFacts.region` and `DayFacts.kind`: a day whose eleven stops are all in
 * Skútustaðahreppur is `מיוואטן`, and a day whose stops disagree has no such name and says
 * so. Fewer than two known values is never a majority — one stop agreeing with itself is a
 * stop, not a region.
 */
export function dominantValue(values: readonly (string | undefined)[]): string | undefined {
  const known = values.filter((value): value is string => Boolean(value?.trim()));
  if (known.length < 2) return undefined;
  const counts = new Map<string, number>();
  for (const value of known) counts.set(value, (counts.get(value) ?? 0) + 1);
  const [best, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return count / known.length >= MAJORITY ? best : undefined;
}

/**
 * What one day is made of, as far as naming it is concerned. Assembled by whatever holds the
 * rows — the projection on the server, `lib/day-title.ts` in the app — so this module stays a
 * pure derivation with no Prisma shape and no React state in it.
 */
export interface DayFacts {
  /** Every place the day touches, in order, legs contributing both their ends. */
  stops: readonly (string | null | undefined)[];
  /** The booking types the day holds, in order — the discriminant the phrasing keys off. */
  bookingTypes: readonly (BookingType | null | undefined)[];
  /** Where the day's lodging is, if it has one. */
  lodgingPlace?: string;
  /** Event titles in order, for the fallback second line. */
  eventTitles: readonly string[];
  /** Where a flight on this day lands — an airport's own name, so it is what a MID-trip
   *  flight is titled by and never what the outbound one is. */
  flightTo?: string;
  /** The trip's `destination`, which is what an outbound flight is actually going to.
   *  `נמל התעופה הבינלאומי קפלוויק` is where the plane lands; `איסלנד` is where you are
   *  going, and it is the thing the owner asked the day to say. */
  tripDestination?: string;
  /** **The trip's outbound flight day**, and the test is deliberately narrow: the first day
   *  holding a flight AND the trip's first day holding anything at all. Without the second
   *  half, a domestic trip whose only flight is a hop on day three would announce itself as
   *  flying to the country it never left. */
  outbound?: boolean;
  /** …and the returning one: the last flight day, on the last day holding anything, and not
   *  the same day as the outbound — a single flight day is an departure, never a return. */
  returning?: boolean;
  /** **The region the day's stops share** (Wikidata `P131`), when a clear majority agree.
   *  The best name a day can have, because it is where you WERE rather than what you
   *  happened to stop at — a day whose eleven stops are all in Skútustaðahreppur is
   *  `מיוואטן`, not two of its waterfalls. */
  region?: string;
  /** **What the day's stops ARE** (Wikidata `P31`), when a clear majority agree. Below the
   *  region, because where beats what. */
  kind?: string;
  /** **The trip's shape** (owner, 2026-08-30). On a `base` trip every day leaves from and
   *  returns to the same bed, so a `from ← to` title describes the commute rather than the
   *  day — `רייקיאוויק ← גולפוס` on nine consecutive days says the same false thing nine
   *  times. Absent is treated as "we do not know", which takes today's behaviour. */
  tripShape?: ShareTripShape;
}

/**
 * **A day's headline.** Flights first, because a flight is the one event that renames its
 * whole day — everything else on a travel day is what you did between airports.
 *
 * `flightHome` carries no value on purpose: "home" is not a place this derivation knows, it
 * is the absence of the trip, and naming the destination airport instead is what produced
 * `נתב״ג ← נמל התעופה הבינלאומי קפלוויק` on a returning day.
 *
 * `SHARE_DAY_KIND.NONE` is a legitimate answer — a day with no places and no events has
 * nothing true to say about itself, and inventing something is exactly the mandatory day
 * title the owner rejected. Renderers fall back to the date (the reader) or to the trip's
 * destination (the app's day head, ADR-0219 §2).
 */
export function fallbackDayTitle(facts: DayFacts): SharedDayTitle {
  const flying = facts.bookingTypes.some((type) => type === BOOKING_TYPE.FLIGHT);
  if (flying) {
    if (facts.returning) return { kind: SHARE_DAY_KIND.FLIGHT_HOME };
    if (facts.outbound && facts.tripDestination) {
      return { kind: SHARE_DAY_KIND.FLIGHT_OUT, to: facts.tripDestination };
    }
    if (facts.flightTo) return { kind: SHARE_DAY_KIND.FLIGHT, to: facts.flightTo };
  }
  // **Where you were, then what you saw, then where you went** (ADR-0166's 2026-08-30
  // amendment). Both come from claims the enrichment pass already reads, and both beat a
  // route made of two arbitrary stop names — which is the rule these replace.
  if (facts.region) return { kind: SHARE_DAY_KIND.REGION, at: facts.region };
  if (facts.kind) return { kind: SHARE_DAY_KIND.KIND, of: facts.kind };
  const stops = dedupeConsecutive(facts.stops);
  if (stops.length === 0) return { kind: SHARE_DAY_KIND.NONE };
  // **On a star trip a day is a PLACE, never a route.** Every day of one starts and ends at
  // the same base, so `base ← wherever` describes the commute — and it repeats, nearly
  // identically, for every day of the trip. The furthest stop is what the day was about;
  // the base is already in the header, on the stay line.
  if (facts.tripShape === SHARE_TRIP_SHAPE.BASE) {
    const away = stops.find((stop) => stop !== facts.lodgingPlace) ?? stops[0];
    return { kind: SHARE_DAY_KIND.PLACE, at: away };
  }
  // **A round trip is a place, not a route.** A leg contributes both its endpoints, so a day
  // that leaves Reykjavík and comes back has the same label at both ends, and
  // `רייקיאוויק ← רייקיאוויק` says less than the bare name does.
  const [from] = stops;
  const to = stops[stops.length - 1];
  if (from === to) return { kind: SHARE_DAY_KIND.PLACE, at: from };
  return { kind: SHARE_DAY_KIND.ROUTE, from, to };
}

/**
 * **A day's second line, and it must not repeat the first.**
 *
 * Where you sleep beats what you did: it is the one fact a reader scans a day for that the
 * headline never carries. Only a day with no bed to name falls back to its events — and
 * then to the ones the headline did not already say, which on a flight day is what stopped
 * two airport names printing under a headline made of the same two airport names.
 *
 * The reader's line, not the app's: ADR-0209 names a stay once, as its bookend rows, so the
 * day head has no stay line (ADR-0219 §2). It moves with its title because the two are one
 * derivation and splitting them across two packages is what lets them drift.
 */
export function fallbackDaySummary(facts: DayFacts, title: SharedDayTitle): SharedDaySummary {
  if (facts.lodgingPlace) {
    return { kind: SHARE_DAY_SUMMARY_KIND.STAY, place: facts.lodgingPlace };
  }
  const said = new Set(titleValues(title));
  const titles = facts.eventTitles
    .filter((eventTitle) => !said.has(eventTitle.trim()))
    .slice(0, MAX_SUMMARY_EVENTS);
  return titles.length > 0
    ? { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles }
    : { kind: SHARE_DAY_SUMMARY_KIND.NONE };
}

/** The values a headline already put on screen, so the line under it can avoid them. */
function titleValues(title: SharedDayTitle): string[] {
  switch (title.kind) {
    case SHARE_DAY_KIND.ROUTE:
      return [title.from, title.to];
    case SHARE_DAY_KIND.PLACE:
      return [title.at];
    case SHARE_DAY_KIND.FLIGHT:
    case SHARE_DAY_KIND.FLIGHT_OUT:
      return [title.to];
    default:
      return [];
  }
}
