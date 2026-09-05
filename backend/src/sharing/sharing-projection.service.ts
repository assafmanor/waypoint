import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BOOKING_TYPE,
  EVENT_CATEGORY,
  EVENT_KIND,
  TRAVEL_MODE,
  TRAVEL_MODES,
} from '@waypoint/shared';
import {
  SHARE_DAYPART_ORDER,
  SHARE_DETAIL_LEVEL,
  defaultLegTravelMode,
  derivedTravelMode,
  isRoutableMode,
  legTravelMode,
  routeLegKey,
  shareDaypart,
  sharePreviousNight,
  edgeMeaning,
  shareTimeLabel,
  TIME_MEANING,
  type SharedTime,
  sharedItinerarySchema,
  dayAmbientZone,
  eventDisplayZones,
  tripZoneCrossings,
  type ZoneCrossing,
  zoneOffsetMinutes,
  type ShareDaypart,
  type ShareDetailLevel,
  type SharedAppendix,
  type SharedDay,
  type SharedEvent,
  type SharedItinerary,
  type BookingType,
  type EventCategory,
  type LegTravelMode,
  type SharedDayTitle,
  derivedPlaceLabel,
  shortPlaceLabel,
  placeIataCode,
  NARRATIVE_SEPARATOR,
  ROUTE_ARROW,
  SHARE_OP_KIND,
  tripShapeOf,
  buildDayStopSequence,
  dayPhoto,
  isTransportEvent,
  dominantValue,
  type DayPhotoEvent,
  type DayPhotoPlace,
  type DayStopEvent,
  type EventKind,
  fallbackDaySummary,
  fallbackDayTitle,
  type DayFacts,
  type SharedCommitment,
  type SharedOp,
  resolveTextVariant,
  SUMMARY_LANG_PREFERENCE,
  type SharedPhoto,
  type TripEnrichments,
} from '@waypoint/shared';

import { EnrichmentService } from '../enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyNarrative,
  fallbackTripTitle,
  routeLabelsFrom,
  routeStrip,
} from './itinerary-narrative.fallback';
import { ItineraryNarrativeService } from './itinerary-narrative.service';
import {
  SHARE_EVENT_SELECT,
  SHARE_PLACE_SELECT,
  SHARE_SECRET_BOOKING_SELECT,
  SHARE_ZONE_BOOKING_SELECT,
  type ShareEventRow,
  type SharePlaceRow,
} from './sharing.select';

/** The policy a projection runs under — the `TripShare` row, nothing more. */
export interface SharePolicy {
  id: string;
  tripId: string;
  code: string;
  detailLevel: ShareDetailLevel;
  includeBookingSecrets: boolean;
  includeNotesAndTasks: boolean;
  includeTravelerIdentity: boolean;
}

/** A calendar day as `YYYY-MM-DD`. `Event.date` is a `@db.Date`, which Prisma hands back at
 *  UTC midnight, so the UTC slice IS the stored day — no zone enters here. */
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** The calendar day before, for an event whose clock says it belongs to the night before.
 *  Built by arithmetic on the UTC-midnight `@db.Date`, so no zone and no DST enters. */
const previousDayKey = (date: Date): string =>
  dayKey(new Date(date.getTime() - 24 * 60 * 60 * 1000));

const GOOGLE_MAPS_SEARCH = 'https://www.google.com/maps/search/?api=1&query=';

/** The app's only locale today (ADR-0009). A parameter rather than a constant at the call
 *  site because a generated narrative is keyed by it, and a second locale must not silently
 *  reuse the first one's words. */
const DEFAULT_LOCALE = 'he';

/**
 * **A place's public label — the app's own three-rung chain, not a second worse one**
 * (owner, 2026-08-30: _"Why נתב״ג to Frankfurt?? What does it have to do with anything?"_).
 *
 * This used to be `nickname || name`: rung 1 and rung 3 without its stripping, and no rung
 * 2 at all. `derivedPlaceLabel` has answered `תל אביב` for `נמל התעופה בן גוריון` since
 * ADR-0166 §18 shipped in July — it just lived in `frontend/src/lib/` where the server
 * could not call it, so the projection wrote its own and every shared surface printed
 * `נמל התעופה של פרנקפורט (Frankfurter Flughafen – FRA)`. That name is also why the flight
 * rows blew their width and the day title ellipsised mid-string under bidi.
 *
 * Never the `googlePlaceId`, never the coordinates — the enrichment map is keyed by place
 * id here and the Google id is only how the store was read.
 */
type LabelledPlace = { id: string; name: string; nickname: string | null };
type PlaceLabeller = (place: LabelledPlace | null) => string | undefined;

const labelWith =
  (enrichments: TripEnrichments): PlaceLabeller =>
  (place) => {
    if (!place) return undefined;
    // Prisma answers `null` where the shared `Place` says `undefined`; normalised here
    // rather than by widening the shared type for one caller.
    const derived = derivedPlaceLabel(
      { name: place.name, nickname: place.nickname ?? undefined },
      enrichments[place.id],
    );
    return (derived?.trim() || shortPlaceLabel(place.name)).trim() || undefined;
  };

/**
 * **The trip's fixed points, derived from the schedule** (ADR-0213's 2026-08-30 amendment).
 *
 * A row is here when its event is `hard` (ADR-0011) or a booking backs it — the two ways
 * the app already says "this is a commitment". Nothing new is stored and nothing is
 * authored: this is the same events the days hold, asked a different question.
 *
 * **Consecutive nights in the same place are one row.** Eleven `לינה` lines is the wall of
 * text this block exists to replace, and "eleven nights, Reykjavík then Flúðir then seven
 * more" is what a reader actually wants to know. The run is broken by a different place,
 * never by a gap in the dates: a night unrecorded in the middle of a stay is a hole in the
 * data, not a checkout.
 */
function collectCommitments(
  byDay: { date: string; events: ShareEventRow[] }[],
  placeLabel: PlaceLabeller,
  labelById: ReadonlyMap<string, string | undefined>,
  ops: OpsByHost,
): SharedCommitment[] {
  const out: SharedCommitment[] = [];
  byDay.forEach(({ date, events }, index) => {
    for (const event of events) {
      const type = event.booking?.type as BookingType | undefined;
      if (!type && event.kind !== EVENT_KIND.HARD) continue;
      if (!type) continue; // a hard event with no booking has no type to name it by

      const place = placeLabel(event.place);
      const to = labelById.get(event.booking?.toPlaceId ?? '');
      const from = labelById.get(event.booking?.fromPlaceId ?? '');
      // **A stay has no row in the schedule any more**, so whatever hangs off it would
      // have been lifted out and dropped. It rides here, where a reader looks for a hotel.
      const rowOps = [
        ...(ops.byEvent.get(event.id) ?? []),
        ...(event.bookingId ? (ops.byBooking.get(event.bookingId) ?? []) : []),
      ];

      // A stay extends the run above it rather than opening a new row.
      const previous = out.at(-1);
      if (
        type === BOOKING_TYPE.HOTEL &&
        previous?.bookingType === BOOKING_TYPE.HOTEL &&
        previous.detail === place
      ) {
        previous.endDate = date;
        continue;
      }

      out.push(
        stripUndefined({
          bookingType: type,
          title: from && to ? routeTitle(from, to) : event.title,
          detail: type === BOOKING_TYPE.HOTEL ? place : (place ?? to),
          date,
          endDate: type === BOOKING_TYPE.HOTEL ? date : undefined,
          dayOrdinal: index + 1,
          ops: rowOps.length > 0 ? rowOps : undefined,
        }) as SharedCommitment,
      );
    }
  });
  return out;
}

/**
 * **What a clear majority of a day's stops agree on**, or nothing at all.
 *
 * A day is only named for its region or its kind when the day really is about one — two
 * waterfalls out of eleven stops is not a day of waterfalls, and naming it one would be the
 * same confident-and-wrong move as `Stuðlagil Canyon ← Baugur Bjólfs`. The threshold is
 * over the stops that HAVE an answer, not over every stop: a car park has no Wikidata item
 * and should not be able to veto a day, but it should not count towards one either.
 */
/**
 * **How much of a stop's description a share may spend** (owner, 2026-08-30: _"Too long
 * descriptions, if there's an option to shorten them or cap the length"_).
 *
 * Capped at the SOURCE rather than clamped in CSS, because the two renderers fail
 * differently and only one of them can scroll: `-webkit-line-clamp` hides the overflow on
 * the phone, and on A4 a five-line Wikipedia lede simply takes five lines of a column that
 * has twelve days to fit. One number, applied once, and both surfaces get a caption that
 * fits the two lines they each reserve for it.
 *
 * A sentence boundary is preferred over a word boundary because a description that stops
 * mid-clause reads as broken data rather than as a summary.
 */
const CAPTION_MAX_CHARS = 150;

function capCaption(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text || text.length <= CAPTION_MAX_CHARS) return text || undefined;
  const window = text.slice(0, CAPTION_MAX_CHARS);
  // A period only counts as a sentence end when a space follows it, or `Mt. Stapafell` and
  // `road 862.5` would each end the sentence they are inside.
  const sentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('? '),
    window.lastIndexOf('! '),
  );
  if (sentence > CAPTION_MAX_CHARS / 3) return text.slice(0, sentence + 1);
  const word = window.lastIndexOf(' ');
  return `${(word > 0 ? window.slice(0, word) : window).trimEnd()}…`;
}

/**
 * **A journey is chained over the whole trip, not inside one day** (owner, 2026-08-30:
 * _"Sometimes journeys with layovers aren't recognized properly, for example when it crosses
 * a day"_).
 *
 * The first build walked each day's own event list, so `TLV 22:40 → VIE` and
 * `VIE 01:15 → KEF` — the common shape of a red-eye with a layover — were two unrelated
 * rows on two different days, which is precisely the case a layover most needs naming. The
 * chain condition never had anything to do with the calendar; only the loop did.
 *
 * So the pass runs once over every scheduled event in trip order and returns two things: the
 * legs of each journey keyed by its FIRST leg, and the set of legs some earlier leg has
 * absorbed. A day then renders a journey where it departs and skips what belongs to a
 * journey that departed before it — a journey belongs to the day it leaves on, which is the
 * day a reader is packing for.
 */
interface JourneyChains {
  chainByLead: Map<string, ShareEventRow[]>;
  absorbed: Set<string>;
  /** Every leg → the journey it belongs to, single-leg journeys included. A day asks this
   *  where its flight ENDS, which is not where its last leg lands when that leg connects. */
  chainOf: Map<string, ShareEventRow[]>;
}

/**
 * **How long a wait can be and still be one journey** (owner, 2026-08-30).
 *
 * The reported case: a leg lands 02:00 and the next departs 11:00 the same day. Chaining them
 * made one journey, and a journey renders on the day its FIRST leg departs — which for a
 * 02:00 departure is the night before by `sharePreviousNight`. So both legs and the whole
 * return moved two days back and **the last day of the trip rendered empty**.
 *
 * Nine hours is not a layover, it is a day with a flight at each end: you clear immigration,
 * you leave the airport, you eat somewhere. Six is the line — long enough to keep the 110
 * minutes the cross-day fix was built for, short enough that a wait you could spend in a city
 * stays two rows on the two days it actually occupies.
 */
const MAX_LAYOVER_MINUTES = 6 * 60;

function chainJourneys(scheduledInTripOrder: readonly ShareEventRow[]): JourneyChains {
  const chainByLead = new Map<string, ShareEventRow[]>();
  const absorbed = new Set<string>();
  const chainOf = new Map<string, ShareEventRow[]>();
  for (let i = 0; i < scheduledInTripOrder.length; i += 1) {
    const chain = [scheduledInTripOrder[i]];
    while (
      i + 1 < scheduledInTripOrder.length &&
      continuesJourney(chain.at(-1)!, scheduledInTripOrder[i + 1]) &&
      (layoverMinutes(chain.at(-1)!, scheduledInTripOrder[i + 1]) ?? 0) <= MAX_LAYOVER_MINUTES
    ) {
      chain.push(scheduledInTripOrder[(i += 1)]);
      absorbed.add(chain.at(-1)!.id);
    }
    if (chain.length > 1) chainByLead.set(chain[0].id, chain);
    for (const leg of chain) chainOf.set(leg.id, chain);
  }
  return { chainByLead, absorbed, chainOf };
}

/**
 * **How long it took, and what the clock did** (owner, 2026-08-31: _"Flights and stuff like
 * that should also show duration and timezone changes, like in the app"_).
 *
 * The app has both on every event row already — `lib/duration.ts`'s ladder and ADR-0107's
 * zone pill — and a shared flight was the one surface without them. Both are computed here
 * as NUMBERS: the projection ships values and each renderer owns its words, which is the same
 * rule that keeps the day titles renderer-agnostic.
 *
 * The shift is measured at each end's own instant, so a leg that crosses a DST boundary is
 * honest about it: the arrival zone's offset AT LANDING minus the departure zone's AT
 * TAKE-OFF. Zero is absent, not zero — a renderer draws a pill only where there is a jump.
 */
function travelFacts(
  event: ShareEventRow,
  placeById: ReadonlyMap<string, { timezone: string | null }>,
): { durationMinutes?: number; zoneShiftMinutes?: number } {
  const from = event.startsAt;
  const to = event.endsAt;
  const durationMinutes =
    from && to ? Math.round((to.getTime() - from.getTime()) / 60_000) : undefined;

  const fromZone = placeById.get(event.booking?.fromPlaceId ?? '')?.timezone;
  const toZone = placeById.get(event.booking?.toPlaceId ?? '')?.timezone;
  const shift =
    from && to && fromZone && toZone
      ? zoneOffsetMinutes(to, toZone) - zoneOffsetMinutes(from, fromZone)
      : 0;

  return stripUndefined({
    durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : undefined,
    zoneShiftMinutes: shift === 0 ? undefined : shift,
  });
}

/**
 * **A day that a journey flew through, folded into the day the journey left on.**
 *
 * The reported shape: a return departs Iceland at 02:00 and lands in Tel Aviv at 15:25 the
 * following afternoon. `sharePreviousNight` puts the 02:00 departure on the night before, the
 * journey renders where its first leg departs, and the calendar day in between is left with
 * nothing in it at all — a blank card at the end of the trip.
 *
 * Absorbing is deliberately narrow. A following day is folded in only when it is EMPTY of
 * scheduled rows, so a day that has its own morning keeps its own card and the journey simply
 * appears on the day it left. Nothing is dropped: the absorbed date becomes the card's
 * `endDate`, so the header can say `21–22` and a reader can see where the time went.
 */
/** The calendar date a day's journeys stop moving on — the latest arrival among the transport
 *  rows placed on it, as a plain `YYYY-MM-DD` so it compares with `byDay`'s own keys. Empty
 *  string when nothing here arrives anywhere, which makes the caller's `<=` refuse every
 *  candidate rather than absorbing on a missing value. */
function journeyLandingDate(events: readonly ShareEventRow[]): string {
  let latest = '';
  for (const event of events) {
    if (!isTransport(event) || !event.endsAt) continue;
    const date = event.endsAt.toISOString().slice(0, 10);
    if (date > latest) latest = date;
  }
  return latest;
}

function absorbSpannedDays(
  days: readonly SharedDay[],
  byDay: readonly { date: string; events: ShareEventRow[] }[],
): SharedDay[] {
  const isEmpty = (index: number): boolean =>
    (days[index]?.sections.length ?? 0) === 0 && !days[index]?.stay;

  const out: SharedDay[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    // Only a day that ENDS in the air can swallow the next one: the journey is what spans
    // the midnight, and a day with no journey has nothing to span with.
    const spans = day.sections.some((section) => section.events.some((event) => event.legs));
    // **And it swallows only as far as it FLIES.** Absorbing every empty day that followed
    // made a card say `07–09` for a journey that lands on the 08th — a trailing empty day
    // of the trip is not part of the flight, it is a day nobody planned yet, and merging it
    // in tells the reader they are in the air for it. The landing date is the journey's own
    // last arrival, so the reach is one day per midnight actually crossed.
    let last = i;
    if (spans) {
      const landing = journeyLandingDate(byDay[i]?.events ?? []);
      while (last + 1 < days.length && isEmpty(last + 1) && byDay[last + 1].date <= landing) {
        last += 1;
      }
    }
    out.push(last > i ? { ...day, endDate: byDay[last].date } : day);
    i = last;
  }
  return out;
}

/** Where an op hangs: on the event, on the booking behind it, or on neither. The two maps
 *  are separate because a note may be written against either host and, to a reader, they
 *  are the same row — so the row asks both. */
interface OpsByHost {
  byEvent: Map<string, SharedOp[]>;
  byBooking: Map<string, SharedOp[]>;
  /** Attached to nothing, and published under its own heading rather than smuggled onto
   *  whichever row happened to be first. This is the packing list. */
  unattached: SharedOp[];
}

/** **Does this leg continue that one?** The whole journey derivation, and it needed no
 *  column: a chain is a transport booking whose `fromPlaceId` is the previous booking's
 *  `toPlaceId`. Both must be transport — a hotel between two flights shares no place id
 *  with either and could never have chained, which is the case that was reported. */
const continuesJourney = (previous: ShareEventRow, next: ShareEventRow): boolean => {
  if (!isTransport(previous) || !isTransport(next)) return false;
  const arrival = previous.booking?.toPlaceId;
  const departure = next.booking?.fromPlaceId;
  return Boolean(arrival && departure && arrival === departure);
};

/** The wait between two chained legs, in whole minutes. `null` on either end means we
 *  cannot say, and a wait we cannot measure is not printed as zero. */
const layoverMinutes = (previous: ShareEventRow, next: ShareEventRow): number | undefined => {
  const from = previous.endsAt?.getTime();
  const to = next.startsAt?.getTime();
  if (from === undefined || to === undefined) return undefined;
  const minutes = Math.round((to - from) / 60_000);
  return minutes > 0 ? minutes : undefined;
};

/** `TLV → VIE`, for the one surface with room for it. ADR-0166 §18 keeps the IATA code off
 *  row-shaped surfaces because it doubles their width; a leg inside a journey block has a
 *  second line, and a code is what you check against a boarding pass. Absent unless BOTH
 *  ends have one — half a pair says less than none. */
const legCode = (
  event: ShareEventRow,
  codeById: ReadonlyMap<string, string | undefined>,
): string | undefined => {
  const from = codeById.get(event.booking?.fromPlaceId ?? '');
  const to = codeById.get(event.booking?.toPlaceId ?? '');
  return from && to ? `${from} → ${to}` : undefined;
};

/** The journey's own name. `ROUTE_ARROW` carries its isolates, so this composes in the
 *  contract's vocabulary rather than each renderer inventing a separator. */
const routeTitle = (from: string, to: string): string => `${from}${ROUTE_ARROW}${to}`;

/** Drop the keys whose value is `undefined`, because every schema here is a `strictObject`
 *  and an explicit `undefined` is not the same as an absent key to `exactOptionalPropertyTypes`
 *  — "absent, not empty" is the contract's own rule (`sharedEventSchema`). */
const stripUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

/**
 * **WHAT A ROW'S CLOCK MEANS** (ADR-0213's 2026-08-31 amendment §1) — `edgeMeaning`'s answer,
 * turned into the labels a renderer prints.
 *
 * The rule this replaces was `event.hard`, which is ADR-0011's COMMITMENT axis answering a
 * question about MEANING. Two consequences it had, both fixed here rather than exposed: a
 * soft two-hour hike lost its end on paper while keeping it on the phone, and a multi-day
 * car hire — hard, because a booking backs it — printed `10:00–18:00` for a week, the same
 * reversed range that got stays pulled out of the schedule.
 *
 * `edgeMeaning` is asked of the START edge, because the row is placed on the day its start
 * falls in (`groupByDay`) and it is that edge the reader is looking at. A `held` span's far
 * end is a different day's fact, so it is deliberately NOT printed as the other half of a
 * range — which is exactly the defect above.
 */
/**
 * **The zone context a shared clock is resolved against**, and the seam between Prisma rows
 * and `@waypoint/shared`'s resolvers.
 *
 * This replaces `common/event-zone.util.ts`, which is **deleted** (2026-09-01): it held one
 * `eventDisplayZone` returning a single zone from `currentZone`, with no place rung — the
 * answer to _where are you now_, standing in for _what does this clock say_. Both of its
 * readers now ask the per-end resolver in `@waypoint/shared`, so the file's remaining value
 * was a two-field interface and its remaining risk was that the next person looking for a
 * zone would find the wrong function first. The four arrays here are all already loaded for
 * the crossing derivation, so the richer answer costs no query.
 */
interface ShareZoneContext {
  crossings: ZoneCrossing[];
  primaryZone: string;
  bookings: unknown[];
  places: unknown[];
  /** **Prisma's event rows with their DATE columns spelled the way `@waypoint/shared` types
   *  them** — see `zoneEventEvidence`. The other three arrays cross the seam raw because the
   *  resolvers read only fields whose runtime shapes already match; these do not. */
  events: unknown[];
}

/**
 * **The one place Prisma's `Date` columns are translated rather than cast** (2026-09-03).
 *
 * Every other array in `ShareZoneContext` goes through `as never` because the shared
 * resolvers read fields whose runtime shapes already agree. `eventsOnDate` does not: it
 * compares day keys as STRINGS, so a `Date` sitting in `date`/`endDate` matches nothing and
 * answers "no event is on this day" — a silently empty vote, not a type error, which would
 * have put every card back on the trip's primary zone with all the machinery in place.
 * Instants are normalised alongside them so the next reader may hand this to anything in
 * `zones.ts`, not only to the two functions that ignore them.
 */
function zoneEventEvidence(events: ShareEventRow[]): unknown[] {
  return events.map((event) => ({
    ...event,
    date: dayKey(event.date),
    endDate: event.endDate ? dayKey(event.endDate) : undefined,
    startsAt: event.startsAt?.toISOString(),
    endsAt: event.endsAt?.toISOString(),
  }));
}

/** **Which zone a DAY is lived in** — `dayAmbientZone`, the same answer the app's day
 *  surfaces frame a day with, at the one cast site `displayZones` established below. This is
 *  what a shared card says "now" in (`SharedDay.timezone`). */
function dayZone(date: string, zones: ShareZoneContext): string {
  return dayAmbientZone(date, {
    events: zones.events as never,
    bookings: zones.bookings as never,
    places: zones.places as never,
    crossings: zones.crossings,
    primaryZone: zones.primaryZone,
  });
}

/**
 * **Which zone each END of a row is printed in** (owner, 2026-09-01: _"The timezone
 * derivation is simply wrong"_).
 *
 * One cast site rather than four: the shared resolvers are typed against `@waypoint/shared`'s
 * entity shapes and Prisma hands us row types that are structurally compatible for the fields
 * they read — the same seam `tripZoneCrossings` is already called across, one screen up.
 * Naming it once means the next caller cannot pick a different seam.
 */
function displayZones(
  event: ShareEventRow,
  zones: ShareZoneContext,
): { start: string; end: string } {
  return eventDisplayZones(event as never, {
    bookings: zones.bookings as never,
    places: zones.places as never,
    crossings: zones.crossings,
    primaryZone: zones.primaryZone,
  });
}

function sharedTimeOf(
  event: ShareEventRow,
  zones: { start: string; end: string },
): SharedTime | undefined {
  if (!event.startsAt) return undefined;
  const label = shareTimeLabel(event.startsAt, zones.start);
  const meaning = edgeMeaning(
    {
      // Prisma's columns are nullable and `TripEvent`'s fields are optional, which is the
      // same absence spelled two ways — `?? undefined` is the seam every other reader here
      // crosses too.
      category: (event.category as EventCategory | null) ?? undefined,
      icon: event.icon ?? undefined,
      startWindowEnd: event.startWindowEnd?.toISOString(),
      endWindowStart: event.endWindowStart?.toISOString(),
    },
    'start',
  );
  if (meaning === TIME_MEANING.WINDOW) {
    // Both bounds authored, so both print — and this is the ONE case where the second label
    // is the window's own ceiling rather than the event's `endsAt`.
    // The window's ceiling is the same edge as its floor, so it takes the START zone.
    const ceiling = event.startWindowEnd
      ? shareTimeLabel(event.startWindowEnd, zones.start)
      : undefined;
    return ceiling && ceiling !== label
      ? { label, endLabel: ceiling, meaning }
      : { label, meaning };
  }
  if (meaning === TIME_MEANING.NOT_BEFORE) return { label, meaning };
  // `exact`: the end prints when there is one and it differs — a flight's arrival, a hike's
  // finish. No `hard` gate, which is the change.
  // **The far end in ITS OWN zone** — a flight's arrival is a fact about where it lands.
  const endLabel = event.endsAt ? shareTimeLabel(event.endsAt, zones.end) : undefined;
  return endLabel && endLabel !== label
    ? { label, endLabel, meaning: TIME_MEANING.EXACT }
    : { label, meaning: TIME_MEANING.EXACT };
}

/**
 * **A chained journey's clock: the whole span, as one range.**
 *
 * Kept beside `sharedTimeOf` because it answers the same question for the one row shape that
 * function cannot see — a journey is assembled from several events after the fact, so its
 * clock is not any single event's edge. Returns a spread rather than a value so the caller
 * overrides `time` exactly the way it already overrides `endLabel`, and a journey with no
 * departure label leaves the field alone rather than writing an explicit `undefined`.
 */
function journeyClock(
  startLabel: string | undefined,
  endLabel: string | undefined,
): { time?: SharedTime } {
  if (!startLabel) return {};
  return {
    time:
      endLabel && endLabel !== startLabel
        ? { label: startLabel, endLabel, meaning: TIME_MEANING.EXACT }
        : { label: startLabel, meaning: TIME_MEANING.EXACT },
  };
}

/**
 * **THE TWO MOMENTS A DAY'S STAY HAS** (ADR-0213's 2026-08-31 amendment §2).
 *
 * A check-in window is the commonest flexible time this app holds, and sharing showed it
 * nowhere: the fourth amendment moved the stay out of the schedule and into `day.stay`, a
 * name with no clock — for the good reason that as a ROW it sorted into the afternoon by its
 * check-in hour and printed `15:00–11:00` across midnight. So the two moments come back to
 * the day's FRAME rather than to the schedule, which is the one place a stay still exists.
 *
 * `checkIn` belongs to the day the run BEGINS: a middle night has no arrival. `checkOut`
 * belongs to the day after the run ends and names the place being left, which on a transfer
 * day is not the place the frame names — hence its own `place`.
 *
 * Both are read through `sharedTimeOf`, so a hotel with an authored window prints
 * `17:00–21:00` and one with only a floor prints `מ-15:00`, exactly as a row would.
 */
function stayMoments(
  stayRows: readonly (ShareEventRow | undefined)[],
  stays: readonly (string | undefined)[],
  index: number,
  detail: ShareDetailLevel,
  zones: ShareZoneContext,
): { checkIn?: SharedTime; checkOut?: SharedTime } {
  // Summary carries no clock at all — the same line `projectEvent` draws.
  if (detail === SHARE_DETAIL_LEVEL.SUMMARY) return {};
  const out: { checkIn?: SharedTime; checkOut?: SharedTime } = {};

  const here = stayRows[index];
  const previous = stays[index - 1];
  // The run begins here: either nothing preceded it, or you slept somewhere else last night.
  if (here && stays[index] !== previous) {
    const time = sharedTimeOf(here, displayZones(here, zones));
    if (time) out.checkIn = time;
  }

  // …and the night before ended, so this morning you left it. Read off THAT row's own end,
  // which is the check-out instant — never off today's stay, whose end is days away.
  const left = stayRows[index - 1];
  if (previous && previous !== stays[index] && left?.endsAt) {
    // A check-out is the stay's FAR end, so it is printed in the stay's end zone.
    const zone = displayZones(left, zones).end;
    const meaning = edgeMeaning(
      {
        category: (left.category as EventCategory | null) ?? undefined,
        icon: left.icon ?? undefined,
        startWindowEnd: left.startWindowEnd?.toISOString(),
        endWindowStart: left.endWindowStart?.toISOString(),
      },
      'end',
    );
    const label = shareTimeLabel(left.endsAt, zone);
    // **The place it belongs to is NOT published** (2026-08-31). It is the card directly
    // above — whose header the reader page never collapses — and naming it here made the day
    // read future → past → future while spending amber on a place. `previous` is still read,
    // as the test for whether last night was somewhere ELSE; it just no longer travels.
    out.checkOut =
      meaning === TIME_MEANING.WINDOW && left.endWindowStart
        ? // A closed window on the OUT edge opens at `endWindowStart` and shuts at the
          // check-out itself — the earliest you may leave and the latest, in that order.
          { label: shareTimeLabel(left.endWindowStart, zone), endLabel: label, meaning }
        : { label, meaning };
  }
  return out;
}

/** **Is this event a way of getting somewhere, rather than somewhere to be?** The rule is
 *  `@waypoint/shared`'s `isTransportEvent` since ADR-0219 phase 4 — it used to be a literal
 *  list of four booking types here, under a comment saying `BOOKING_TYPE_TO_CATEGORY` already
 *  maps between the two vocabularies and this should name no third set. The app needed the
 *  same question and generalised the one-off rather than copying it (root rule 8). */
const isTransport = (event: ShareEventRow): boolean =>
  isTransportEvent(
    { category: event.category as EventCategory },
    event.booking ? { type: event.booking.type as BookingType } : undefined,
  );

/**
 * **Everything an anonymous reader is ever handed**, built once and consumed unchanged by
 * the public page and the PDF (ADR-0213 §1).
 *
 * Two rules run through all of it. First, the level decides what is QUERIED, not what is
 * deleted afterwards — see `sharing.select.ts` for why that ordering is the safety property
 * rather than a style choice. Second, every wall clock printed anywhere comes from
 * `eventDisplayZone`, ADR-0107's one resolver, so the page, the PDF and a notification can
 * never disagree about what hour an event is at.
 */
@Injectable()
export class SharingProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly narrative: ItineraryNarrativeService,
    private readonly enrichment: EnrichmentService,
  ) {}

  /** Resolve a public code to its live projection. A missing, revoked or rotated code is
   *  the same `NotFoundException` — the response must not distinguish "never existed" from
   *  "was withdrawn", or the 404 becomes a trip-existence oracle. */
  async byCode(code: string, locale = DEFAULT_LOCALE): Promise<SharedItinerary> {
    return this.project(await this.requireActiveShare(code), locale);
  }

  async requireActiveShare(code: string): Promise<SharePolicy> {
    const share = await this.prisma.tripShare.findFirst({
      where: { code, revokedAt: null },
      select: {
        id: true,
        tripId: true,
        code: true,
        detailLevel: true,
        includeBookingSecrets: true,
        includeNotesAndTasks: true,
        includeTravelerIdentity: true,
      },
    });
    if (!share) throw new NotFoundException('Shared itinerary unavailable');
    return share;
  }

  async project(share: SharePolicy, locale = DEFAULT_LOCALE): Promise<SharedItinerary> {
    const detail = share.detailLevel;
    const orienting = detail !== SHARE_DETAIL_LEVEL.SUMMARY;

    const [trip, events, places, zoneBookings] = await Promise.all([
      this.prisma.trip.findUniqueOrThrow({
        where: { id: share.tripId },
        select: {
          name: true,
          destination: true,
          icon: true,
          startDate: true,
          endDate: true,
          timezone: true,
        },
      }),
      this.prisma.event.findMany({
        where: { tripId: share.tripId },
        select: SHARE_EVENT_SELECT,
        orderBy: [{ date: 'asc' }, { startsAt: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.place.findMany({ where: { tripId: share.tripId }, select: SHARE_PLACE_SELECT }),
      this.prisma.booking.findMany({
        where: { tripId: share.tripId },
        select: SHARE_ZONE_BOOKING_SELECT,
      }),
    ]);

    const zones: ShareZoneContext = {
      // The shared derivation reads four fields off these rows; Prisma's shapes are
      // structurally compatible for all of them, exactly as the notification sweep does it.
      crossings: tripZoneCrossings(events as never, zoneBookings as never, places as never),
      primaryZone: trip.timezone,
      // **The same two arrays the crossings were built from**, carried so a printed clock can
      // ask what each END means rather than which segment the instant falls in — the place
      // rung `currentZone` deliberately does not have. No extra query: both are already here.
      bookings: zoneBookings,
      places,
      // **And the events, so a DAY can be asked too.** The day consensus (ADR-0107
      // session-100) reads the day's own events; without them the projection could say what
      // an event's clock means and still not say which zone the day it sits in is lived in.
      events: zoneEventEvidence(events),
    };

    // **What a day PASSES THROUGH, and a transport event passes through two places.**
    // (owner, 2026-08-30: _"I don't understand the titles for each day. Why doesn't it
    // include the first and last legs?"_) A flight, a drive or a transfer carries its
    // endpoints on its BOOKING — `fromPlaceId`/`toPlaceId` — and nothing on `event.place`.
    // The day title read only `event.place`, so the legs that define where a day went were
    // the one kind of event it could not see: a flight day had no title at all and fell
    // back to its date, and a driving day's route started at whichever sight happened to
    // have a pin. `journeyLookup` below already knew to look at the booking; this is the
    // same knowledge, in the derivation that names the day.
    // **Read only, and the `stale` list is deliberately dropped.** `readForPlaces` also
    // reports which places want a fresh pass, and every other caller acts on that. This one
    // must not: `/s/<code>` is unauthenticated, so a reader who could make the server fetch
    // would be a rate-limited outbound amplifier behind an 8-character credential. What is
    // in the store is what the page shows.
    const { enrichments } = await this.enrichment.readForPlaces(places);
    const placeLabel = labelWith(enrichments);

    const labelById = new Map(places.map((place) => [place.id, placeLabel(place)]));
    // The airport codes, for the one surface with room for them (`legCode`). Same read as
    // the labels — `placeIataCode` is the other thing ADR-0166 §18 stored and the sharing
    // renderers never asked for.
    const placeById = new Map(places.map((place) => [place.id, place] as const));
    const codeById = new Map(
      places.map((place) => [place.id, placeIataCode(enrichments[place.id])] as const),
    );
    // **The two claims the enrichment pass already reads** (ADR-0166's 2026-08-30
    // amendment). `he` then `en`, the same preference the summary and the served city
    // carry, because all three land in the same Hebrew page.
    const textOf = (placeId: string | undefined, field: 'kind' | 'region' | 'summary') => {
      const variants = placeId ? enrichments[placeId]?.[field] : undefined;
      return variants ? resolveTextVariant(variants, SUMMARY_LANG_PREFERENCE)?.value : undefined;
    };
    /** A row, as the shared derivations want it. Prisma answers `null` where the shared
     *  shapes say `undefined`, and `Date` where they say `string` — a difference that is
     *  silent rather than a type error the moment anything casts, so it is spelled out
     *  here and nowhere else (`packages/shared/CLAUDE.md`). */
    const stopEventOf = (event: ShareEventRow): DayStopEvent => ({
      placeId: event.placeId ?? undefined,
      fromPlaceId: event.booking?.fromPlaceId ?? undefined,
      toPlaceId: event.booking?.toPlaceId ?? undefined,
    });
    const photoEventOf = (event: ShareEventRow): DayPhotoEvent => ({
      placeId: event.placeId ?? undefined,
      // `Date` → ISO. The rank scores dwell as `Date.parse(endsAt) - Date.parse(startsAt)`,
      // and a `Date` handed to it stringifies to something `Date.parse` cannot read — every
      // stop would score zero dwell and the day would be pictured by its ratings alone.
      startsAt: event.startsAt?.toISOString(),
      endsAt: event.endsAt?.toISOString(),
      bookingId: event.bookingId ?? undefined,
      kind: event.kind as EventKind,
      title: event.title,
    });
    const photoPlaceById: ReadonlyMap<string, DayPhotoPlace> = new Map(
      places.map((place) => [
        place.id,
        {
          id: place.id,
          nickname: place.nickname ?? undefined,
          icon: place.icon ?? undefined,
          userRatingsTotal: place.userRatingsTotal ?? undefined,
        },
      ]),
    );
    const isFlight = (event: ShareEventRow): boolean => event.booking?.type === BOOKING_TYPE.FLIGHT;

    const byDay = this.groupByDay(events, trip.startDate, trip.endDate, zones);
    const journeys = orienting
      ? await this.journeyLookup(share.tripId, byDay, places, zoneBookings)
      : undefined;

    // **Which day is the way out and which is the way home** — a whole-trip question, so it
    // is answered here and handed to the per-day derivation as two booleans. Both ends are
    // tested against the days that hold anything at all, not against the calendar: a trip
    // padded with empty days on either side still departs on its first real one.
    const holdsEvents = byDay.map(({ events: dayEvents }) => dayEvents.length > 0);
    const flightDay = byDay.map(({ events: dayEvents }) => dayEvents.some(isFlight));
    const firstFlight = flightDay.indexOf(true);
    const lastFlight = flightDay.lastIndexOf(true);
    const firstBusy = holdsEvents.indexOf(true);
    const lastBusy = holdsEvents.lastIndexOf(true);

    const dayFacts = (dayEvents: ShareEventRow[], index: number): DayFacts => ({
      stops: buildDayStopSequence(dayEvents.map(stopEventOf), (placeId) => labelById.get(placeId)),
      bookingTypes: dayEvents.map((event) => event.booking?.type as BookingType | undefined),
      // The night, named by where it is rather than by what the booking is called: a
      // lodging's own title is a brand, and the place is where you will be.
      lodgingPlace: dayEvents
        .filter((event) => event.booking?.type === BOOKING_TYPE.HOTEL)
        .map((event) => placeLabel(event.place) ?? event.title)
        .find(Boolean),
      eventTitles: dayEvents.map((event) => event.title),
      // **Where the journey ENDS, not where its last leg of this day lands** (owner,
      // 2026-08-30: _"the title is טיסה לפרנקפורט even though Frankfurt is the connecting
      // flight"_). Frankfurt is where you change planes; naming a day after it describes an
      // airport nobody chose to visit. The chain already knows its own final leg.
      flightTo: dayEvents
        .filter(isFlight)
        .map((event) => {
          const journey = chains.chainOf.get(event.id);
          const final = journey?.at(-1) ?? event;
          return labelById.get(final.booking?.toPlaceId ?? '');
        })
        .filter(Boolean)
        .at(-1),
      tripDestination: trip.destination.trim() || undefined,
      outbound: index === firstFlight && firstFlight === firstBusy,
      // A return journey can straddle midnight, so the day that DEPARTS on it is returning
      // too — otherwise the last night out gets titled by the airport it connects through.
      returning:
        index !== firstFlight &&
        lastFlight === lastBusy &&
        dayEvents.some((event) => isFlight(event) && homewardLegIds.has(event.id)),
    });

    // **Everything operational, keyed by the row it belongs to** — one set of queries for
    // the whole trip rather than one per event, and empty when the level or the toggles say
    // so. See `loadOps`; this is what dissolved the appendix.
    const ops = await this.loadOps(share, detail);
    const travelers = await this.travelers(share);

    // **The shape is derived from the nights, and the day titles depend on the shape** —
    // so the stays are collected first rather than the days being built twice. Owner,
    // 2026-08-30, reading `רייקיאוויק ← סנייפלסנס`: _"it is actually a circumnavigation
    // (טיול מתגלגל maybe), where you switch locations every day … Then there's טיול כוכב
    // where you stay at one place"_.
    /** The lodging row a day is framed by, kept whole — the label for the frame, and the
     *  event itself so the day can also state the two moments it has (2026-08-31 amendment
     *  §2). It used to map straight to a string, which is why a check-in window could not be
     *  projected: the row it lives on had already been thrown away. */
    const stayRows = byDay.map(({ events: dayEvents }) =>
      dayEvents.find(
        (event) =>
          event.booking?.type === BOOKING_TYPE.HOTEL && (placeLabel(event.place) || event.title),
      ),
    );
    const stays = stayRows.map((event) =>
      event ? (placeLabel(event.place) ?? event.title) : undefined,
    );
    const shape = tripShapeOf(stays);

    // **Chained once, over the whole trip.** A journey that departs at 22:40 and lands the
    // next morning is one journey; a per-day pass could never see that (`chainJourneys`).
    const chains = chainJourneys(
      byDay.flatMap(({ events }) =>
        events.filter((event) => event.booking?.type !== BOOKING_TYPE.HOTEL),
      ),
    );

    // **The legs of the journey home**, which is what makes a day "returning" — not its
    // index. A return that departs 23:40 and lands the next morning occupies two days, and
    // both of them are the way home.
    const everyFlight = byDay.flatMap(({ events }) => events.filter(isFlight));
    const homewardLegIds = new Set(
      (everyFlight.length > 0
        ? (chains.chainOf.get(everyFlight[everyFlight.length - 1].id) ?? [
            everyFlight[everyFlight.length - 1],
          ])
        : []
      ).map((leg) => leg.id),
    );

    const days: SharedDay[] = byDay.map(({ date, events: dayEvents }, index) => {
      // **The stay leaves the schedule before anything else looks at it.** A lodging event
      // sorts by its check-in hour, which put it between the two legs of the outbound
      // flight; and its `startsAt`/`endsAt` span midnight, so it printed `15:00–11:00`.
      // Both stop being true once it is the day's frame rather than one of its rows.
      const scheduled = dayEvents.filter((event) => event.booking?.type !== BOOKING_TYPE.HOTEL);
      const projected = this.withJourneys(
        scheduled,
        zones,
        detail,
        journeys,
        placeLabel,
        ops,
        labelById,
        codeById,
        (placeId) => capCaption(textOf(placeId, 'summary')),
        chains,
        placeById,
      );
      const facts = {
        ...dayFacts(dayEvents, index),
        tripShape: shape.shape,
        // Only the settled stops vote: a transport leg's endpoints are airports, and an
        // airport's region would name a travel day after the municipality of its runway.
        region: dominantValue(
          dayEvents
            .filter((event) => !isTransport(event))
            .map((event) => textOf(event.placeId ?? undefined, 'region')),
        ),
        kind: dominantValue(
          dayEvents
            .filter((event) => !isTransport(event))
            .map((event) => textOf(event.placeId ?? undefined, 'kind')),
        ),
      };
      const title: SharedDayTitle = fallbackDayTitle(facts);
      return {
        ordinal: index + 1,
        date,
        // **The zone this card's clock means** (`SharedDay.timezone`) — the day's own events
        // when they agree, else the segment, never the destination by default.
        timezone: dayZone(date, zones),
        stay: stays[index],
        ...stayMoments(stayRows, stays, index, detail, zones),
        // **Absent freely**: a day whose stops clear no confidence gate gets no photo. Nine
        // days with pictures and three without reads as honest; three days showing the
        // wrong mountain destroys trust in the other nine.
        ...(() => {
          const photo = dayPhoto(
            dayEvents.map(photoEventOf),
            photoPlaceById,
            enrichments,
            (place) => labelById.get(place.id),
          );
          return photo ? { photo } : {};
        })(),
        title,
        summary: fallbackDaySummary(facts, title),
        sections: this.groupByDaypart(projected),
      };
    });

    // **A day a journey passed through is not a day of its own** (owner, 2026-08-31: _"the
    // last day appears totally empty … maybe the days should be combined to one"_). See
    // `SharedDay.endDate`: capping the layover only moved the seam, because the return
    // genuinely occupies both dates. The card says so instead.
    const combined = absorbSpannedDays(days, byDay);

    // **The trip's fixed points, five lines above the seventy-nine** (owner, 2026-08-30:
    // _"Maybe these sharings should have sections for important stuff, like flights,
    // reservations etc."_). Derived here rather than queried, because "what is fixed" is a
    // question about the SCHEDULE — a booking with no event is not a moment in the trip,
    // and a hard event with no booking (ADR-0011 allows one) still is.
    //
    // Consecutive nights in the same place collapse to one row: eleven `לינה` lines is the
    // wall of text this block exists to replace.
    // **Not at Summary** (owner, 2026-08-30: _"Should summary mode show bookings? It seems
    // excessive for a summary"_). §1's levels are inspire / orient / operate, and a ledger of
    // dates and providers is the middle two — a Summary that lists `06.09 · נתב״ג ← קפלאוויק`
    // is exactly the exact-fact leak the level exists to refuse. Not projected rather than
    // not drawn: this file's rule is that the level decides what is SENT, which is what the
    // spec named "Summary shows no exact fact the projection did not send" is about — and
    // this block had been slipping past it because a date is a fact nobody thought to check.
    const commitments =
      detail === SHARE_DETAIL_LEVEL.SUMMARY
        ? []
        : collectCommitments(byDay, placeLabel, labelById, ops);

    // **The route is where the trip WAS, not the airports it passed through** (owner,
    // 2026-08-30, on the masthead strip: _"Seems very redundant"_). Every day contributes
    // one stop, and a day's transport endpoints are its worst candidates — an airport's
    // full name is long, says nothing about the day, and repeats on the two days that
    // bracket every trip. So a day offers its first NON-transport stop and only falls back
    // to a transport one when it has nothing else, which is what turned
    // `נתב״ג · Stokksnes · … · נמל התעופה הבינלאומי קפלוויק` into the places themselves.
    const principalStop = (dayEvents: ShareEventRow[]): string | undefined => {
      const settled = dayEvents.filter(
        (event) => !isTransport(event) && Boolean(placeLabel(event.place)),
      );
      return settled.length > 0
        ? placeLabel(settled[0].place)
        : buildDayStopSequence(dayEvents.map(stopEventOf), (placeId) =>
            labelById.get(placeId),
          ).find(Boolean);
    };

    // **The whole route, then a slice of it to draw.** The title's endpoints are the trip's
    // first and last stop; the strip shows at most `MAX_ROUTE_LABELS` of them. Capping
    // before the title was taken is what produced `Kerið Crater ← אסבירג׳י` on a twelve-day
    // trip — the far end was day EIGHT's first place, not where the trip finished.
    const wholeRoute = routeLabelsFrom(
      byDay.map(({ events: dayEvents }) => principalStop(dayEvents)),
    );
    const routeLabels = routeStrip(wholeRoute);

    // Words last, and never in the reader's way: a stored generated narrative may replace
    // these strings, and anything else — no result, a stale hash, an invalid one, no
    // provider at all — returns the deterministic ones without waiting (ADR-0213 §2).
    const narrative = await this.narrative.resolve(share.tripId, days, routeLabels, locale, {
      title: fallbackTripTitle(wholeRoute, trip.name),
      // Deliberately empty for a deterministic narrative: the counts beside it are
      // `trip.*` fields, and the sentence joining them is each renderer's own copy.
      summary: '',
    });

    return sharedItinerarySchema.parse({
      status: 'live',
      detailLevel: detail,
      generatedAt: new Date().toISOString(),
      shareUrl: `/s/${share.code}`,
      trip: {
        name: trip.name,
        destination: trip.destination,
        icon: trip.icon,
        startDate: dayKey(trip.startDate),
        endDate: dayKey(trip.endDate),
        // The zone, not a stamped `today` — the reader's device resolves the calendar day
        // itself (eleventh amendment §6). Already selected above for `zones.primaryZone`.
        timezone: trip.timezone,
        dayCount: days.length,
        eventCount: events.length,
        routeLabels,
        // The count is the ROUTE's, never the strip's — `routeLabels` is capped at
        // `MAX_ROUTE_LABELS`, and printing its length as the trip's stop count told a
        // twelve-day, ten-stop trip that it had eight.
        routeStopCount: wholeRoute.length,
        shape: shape.shape,
        baseCount: shape.baseCount,
        ...(travelers ? { travelers } : {}),
      },

      narrative: {
        source: narrative.source,
        title: narrative.title,
        summary: narrative.summary,
      },
      days: applyNarrative(combined, narrative),
      commitments,
      appendix:
        detail === SHARE_DETAIL_LEVEL.EVERYTHING ? this.buildAppendix(ops.unattached) : undefined,
    });
  }

  /**
   * **A journey is one row, not N rows a same-day event can wedge itself between** (owner,
   * 2026-08-30: _"Bad event ordering when it comes to the flights and hotels … no layover
   * detection and visualization"_).
   *
   * The reported case is a day reading TLV→VIE, an apartment check-in, then VIE→KEF —
   * because the check-in's clock time sorts between the two legs, and because the two legs
   * land in different dayparts (18:15 is afternoon, 19:00 is evening) so the daypart spine
   * split them too. Neither is a sorting bug: the rows were in the right order for what the
   * projection thought they were, which is three unrelated events.
   *
   * **Nothing is stored and nothing needed to be.** A leg continues the one before it
   * exactly when the previous booking's `toPlaceId` is this booking's `fromPlaceId`, and
   * the wait between them is the gap from `endsAt` to the next `startsAt`. A half-built
   * `connectsToPrevious`/`layoverMinutes` pair of columns was written for this and reverted
   * — the chain was derivable the whole time.
   *
   * The group takes the FIRST leg's daypart, so a journey that departs in the afternoon and
   * lands at night is an afternoon journey rather than two half-journeys. It is drawn as
   * one `SharedEvent` carrying `legs`, so a renderer that ignores `legs` still shows one
   * correct row rather than a hole.
   */
  private withJourneys(
    dayEvents: ShareEventRow[],
    zones: ShareZoneContext,
    detail: ShareDetailLevel,
    journeys: Map<string, SharedEvent['journey']> | undefined,
    placeLabel: PlaceLabeller,
    ops: OpsByHost,
    labelById: ReadonlyMap<string, string | undefined>,
    codeById: ReadonlyMap<string, string | undefined>,
    captionOf: (placeId: string | undefined) => string | undefined,
    chains: JourneyChains,
    placeById: ReadonlyMap<string, { timezone: string | null }>,
  ): SharedEvent[] {
    const one = (event: ShareEventRow): SharedEvent =>
      this.projectEvent(
        event,
        zones,
        detail,
        journeys?.get(event.id),
        placeLabel,
        ops,
        captionOf,
        placeById,
      );

    const out: SharedEvent[] = [];
    for (const event of dayEvents) {
      // A leg an earlier departure already absorbed has no row of its own — including when
      // that departure was yesterday, which is the whole point of chaining trip-wide.
      if (chains.absorbed.has(event.id)) continue;
      const chain = chains.chainByLead.get(event.id);
      if (!chain) {
        out.push(one(event));
        continue;
      }

      const first = chain[0];
      const last = chain.at(-1)!;
      const head = one(first);
      const from = labelById.get(first.booking?.fromPlaceId ?? '');
      const to = labelById.get(last.booking?.toPlaceId ?? '');
      out.push({
        ...head,
        // The journey's own identity replaces the first leg's — a reader wants
        // `תל אביב ← רייקיאוויק`, not `תל אביב ← וינה` with the rest hidden inside.
        title: from && to ? routeTitle(from, to) : head.title,
        // **And the header names only where it ENDS** (ninth amendment §1). The route is
        // already spelled out by the legs beneath it, so repeating it above them is what
        // put the same two airports on the card three times.
        journeyTo: to,
        endLabel: one(last).endLabel,
        // **The journey's own clock, not leg one's** (owner, 2026-09-01, with a screenshot of
        // each renderer: _"The pdf shows on the title row the flight times wrong, it only
        // shows the first flight and not the overall journey. The live sharing page shows this
        // correctly"_).
        //
        // `endLabel` on the line above was overridden here and `time` was not — and `time` is
        // the field the twelfth amendment §1 made the single authority on what a row's clock
        // says. So paper spelled the field and printed leg one's `02:20–05:50` where the
        // journey runs to `15:25`, while the reader page derived its own span from
        // `startLabel`/`endLabel` and was right for a reason that had nothing to do with the
        // contract. **Two surfaces disagreeing about a fact** (ADR-0159 §1), and the renderer
        // that obeyed the contract was the wrong one — which is the tell that the defect is
        // here, not in either template.
        //
        // A journey's clock is one plain range, first departure to last arrival: there is no
        // flexible edge to preserve, because a chain exists only where every leg is a booked
        // flight with both ends authored.
        ...journeyClock(head.startLabel, one(last).endLabel),
        // …and so do its FACTS. Spreading `head` gave the row leg one's duration and leg
        // one's zone shift, which on a two-leg journey is most of a day understated. The
        // span is the first departure to the last arrival, and the shift is origin to final
        // destination — the two ends a reader is comparing.
        ...travelFacts(
          {
            ...first,
            endsAt: last.endsAt,
            booking: { ...first.booking, toPlaceId: last.booking?.toPlaceId },
          } as ShareEventRow,
          placeById,
        ),
        legs: chain.map((event, index) => {
          const leg = one(event);
          const previous = index > 0 ? chain[index - 1] : undefined;
          // **A leg names its own endpoints.** The event's stored title is whatever was
          // typed — `טיסה` on all three of the owner's legs — which inside a journey block
          // is three identical rows. The endpoints are what tell them apart.
          const legFrom = labelById.get(event.booking?.fromPlaceId ?? '');
          const legTo = labelById.get(event.booking?.toPlaceId ?? '');
          return stripUndefined({
            title: legFrom && legTo ? routeTitle(legFrom, legTo) : leg.title,
            code: legCode(event, codeById),
            startLabel: leg.startLabel,
            endLabel: leg.endLabel,
            layoverMinutes: previous ? layoverMinutes(previous, event) : undefined,
            // The place you WAIT in — the previous leg's arrival, which is this leg's
            // departure. Composing the line from `title` printed the route you are about to
            // fly instead (`המתנה בוינה ← קפלאוויק`).
            layoverPlace: previous ? legFrom : undefined,
            // **Its own flight time, and only that** (ninth amendment §2). `travelFacts`
            // answers duration AND zone shift; a leg takes the first and leaves the second
            // to the journey, because the shift a traveller acts on is origin-to-destination
            // and three signed numbers on one journey describe one clock change.
            durationMinutes: travelFacts(event, placeById).durationMinutes,
          });
        }),
      });
    }
    return out;
  }

  /**
   * **Everything operational, keyed by the row it belongs to** (ADR-0213's 2026-08-30
   * amendment, reversing §4).
   *
   * `buildAppendix` used to answer this with four `where: { tripId }` queries and no join,
   * which is why the shipped page showed twenty-four confirmation codes attached to nothing
   * — and why the notes toggle, which promises `רק תוכן שמחובר למסלול`, published every
   * note in the trip. The links were there all along: `Note.eventId|bookingId` is a closed
   * union from the first migration, `DocumentAttachment` binds a file to an event or a
   * booking, and `Event.bookingId` is `@unique`.
   *
   * One set of queries for the whole trip, each gated on its own toggle exactly as the
   * appendix's were, and each indexed by BOTH host keys — a note may hang off the event or
   * off the booking behind it, and to a reader those are the same row.
   */
  private async loadOps(share: SharePolicy, detail: ShareDetailLevel): Promise<OpsByHost> {
    const empty: OpsByHost = { byEvent: new Map(), byBooking: new Map(), unattached: [] };
    if (detail !== SHARE_DETAIL_LEVEL.EVERYTHING) return empty;

    const push = (map: Map<string, SharedOp[]>, key: string | null, op: SharedOp): void => {
      if (!key) return;
      const list = map.get(key);
      if (list) list.push(op);
      else map.set(key, [op]);
    };
    const out: OpsByHost = { byEvent: new Map(), byBooking: new Map(), unattached: [] };

    if (share.includeBookingSecrets) {
      const bookings = await this.prisma.booking.findMany({
        where: { tripId: share.tripId },
        select: SHARE_SECRET_BOOKING_SELECT,
      });
      for (const booking of bookings) {
        const code = booking.confirmationCode?.trim();
        if (!code) continue;
        push(out.byBooking, booking.id, {
          kind: SHARE_OP_KIND.CODE,
          code,
          ...(booking.provider?.trim() ? { provider: booking.provider.trim() } : {}),
        });
      }
    }

    if (share.includeNotesAndTasks) {
      // **Notes only.** A task is the group's own chore list and a viewer is not the person
      // doing it (owner, 2026-08-30) — so the task query is gone rather than filtered, which
      // is the difference between not showing them and not loading them.
      const notes = await this.prisma.note.findMany({
        where: { tripId: share.tripId },
        select: { title: true, body: true, eventId: true, bookingId: true },
      });
      for (const note of notes) {
        const title = note.title?.trim();
        const body = note.body?.trim();
        if (!title && !body) continue;
        const op: SharedOp = stripUndefined({
          kind: SHARE_OP_KIND.NOTE,
          title: title || undefined,
          body: body || undefined,
        }) as SharedOp;
        if (note.eventId) push(out.byEvent, note.eventId, op);
        else if (note.bookingId) push(out.byBooking, note.bookingId, op);
        // **Attached to nothing is a real answer, not a leftover.** A packing list belongs
        // to the trip; it is published under its own heading rather than smuggled onto
        // whichever row happened to be first.
        else out.unattached.push(op);
      }
    }

    const selected = await this.prisma.tripShareDocument.findMany({
      where: { shareId: share.id },
      select: { document: { select: { id: true, title: true, mimeType: true } } },
    });
    if (selected.length > 0) {
      const attachments = await this.prisma.documentAttachment.findMany({
        where: { tripId: share.tripId, documentId: { in: selected.map((row) => row.document.id) } },
        select: { documentId: true, eventId: true, bookingId: true },
      });
      const hostsByDocument = new Map<
        string,
        { eventId: string | null; bookingId: string | null }[]
      >();
      for (const row of attachments) {
        const list = hostsByDocument.get(row.documentId);
        if (list) list.push(row);
        else hostsByDocument.set(row.documentId, [row]);
      }
      for (const { document } of selected) {
        const op: SharedOp = {
          kind: SHARE_OP_KIND.FILE,
          handle: document.id,
          title: document.title,
          mimeType: document.mimeType,
        };
        const hosts = hostsByDocument.get(document.id);
        if (!hosts?.length) {
          out.unattached.push(op);
          continue;
        }
        for (const host of hosts) {
          if (host.eventId) push(out.byEvent, host.eventId, op);
          else if (host.bookingId) push(out.byBooking, host.bookingId, op);
        }
      }
    }
    return out;
  }

  /**
   * The day spine: every day of the trip, plus any day an event landed on outside it, in
   * order. Days with nothing in them are kept — a shared trip that silently skips its
   * quiet days misrepresents its own length.
   */
  private groupByDay(
    events: ShareEventRow[],
    startDate: Date,
    endDate: Date,
    zones: ShareZoneContext,
  ): { date: string; events: ShareEventRow[] }[] {
    const grouped = new Map<string, ShareEventRow[]>();
    // An ambient multi-day span is listed on the day it starts, once (ADR-0209): repeating a
    // four-night stay on four days reads as four stays.
    for (const event of events) {
      // **A pre-dawn hour is the night before** (`sharePreviousNight`). Read in the event's
      // OWN display zone, ADR-0107's resolver, so a landing is filed by the clock the
      // traveller reads it on and not by the trip's primary zone.
      const key = sharePreviousNight(event.startsAt, displayZones(event, zones).start)
        ? previousDayKey(event.date)
        : dayKey(event.date);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }
    for (
      let cursor = new Date(startDate);
      cursor <= endDate;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const key = dayKey(cursor);
      if (!grouped.has(key)) grouped.set(key, []);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEvents]) => ({ date, events: dayEvents }));
  }

  private projectEvent(
    event: ShareEventRow,
    zones: ShareZoneContext,
    detail: ShareDetailLevel,
    journey: SharedEvent['journey'],
    placeLabel: PlaceLabeller,
    ops: OpsByHost,
    captionOf: (placeId: string | undefined) => string | undefined,
    placeById: ReadonlyMap<string, { timezone: string | null }>,
  ): SharedEvent {
    const zone = displayZones(event, zones);
    // **Which part of the day a row sits in is a question about where it STARTS** — a flight
    // leaving Tel Aviv in the afternoon is an afternoon row, whatever hour it lands at.
    const daypart = shareDaypart(event.startsAt, zone.start);
    const base: SharedEvent = {
      title: event.title,
      icon: event.icon,
      // Prisma types both of these as plain strings — the enum lives in the schema, not in
      // the generated client — so the cast is where the column's domain is re-asserted, the
      // same shape `journeyLookup` uses for `leg.mode`.
      category: event.category as EventCategory | null,
      // **What this row IS, when a booking says so.** The type only: a `hotel` here lets a
      // renderer print `לינה` beside the hotel's own name, and nothing operational travels
      // with it (owner, 2026-08-30).
      bookingType: (event.booking?.type as BookingType | undefined) ?? undefined,
      daypart,
      hard: event.kind === EVENT_KIND.HARD,
    };
    if (detail === SHARE_DETAIL_LEVEL.SUMMARY) return base;

    const label = placeLabel(event.place);
    const address = event.place?.address?.trim() || undefined;
    // **A stop's one-line description, at every level** (owner, 2026-08-30). Public
    // knowledge about a public place: it reveals nothing about the trip, which is why it
    // is not behind a sensitive toggle and why Summary — the level whose whole job is to
    // inspire — is the one that gains most from it.
    const caption = captionOf(event.placeId ?? undefined);
    // **A row asks BOTH hosts.** A note may be written against the event or against the
    // booking behind it (`Note`'s union allows either) and to a reader those are one row,
    // so a row that only asked one would drop half the material for no reason a reader
    // could see. `Event.bookingId` is `@unique`, so there is no double-counting to fear.
    const rowOps = [
      ...(ops.byEvent.get(event.id) ?? []),
      ...(event.bookingId ? (ops.byBooking.get(event.bookingId) ?? []) : []),
    ];
    return {
      ...base,
      ...(caption ? { caption } : {}),
      ...(rowOps.length > 0 ? { ops: rowOps } : {}),
      // **Each end in its own zone** (2026-09-01): a departure is a fact about where you
      // board and an arrival about where you land, so a zone-crossing leg prints two clocks
      // that are not in the same zone — and its wall-clock difference is then correctly NOT
      // its duration.
      startLabel: event.startsAt ? shareTimeLabel(event.startsAt, zone.start) : undefined,
      endLabel: event.endsAt ? shareTimeLabel(event.endsAt, zone.end) : undefined,
      ...(sharedTimeOf(event, zone) ? { time: sharedTimeOf(event, zone)! } : {}),
      ...(isTransport(event) ? travelFacts(event, placeById) : {}),
      placeName: label,
      address,
      // Built from the public display text, so opening a map never requires the projection
      // to carry a coordinate the owner did not choose to publish.
      mapUrl: label
        ? `${GOOGLE_MAPS_SEARCH}${encodeURIComponent([label, address].filter(Boolean).join(', '))}`
        : undefined,
      journey,
    };
  }

  /** Dayparts in reading order, and only the ones that hold something. */
  private groupByDaypart(
    events: SharedEvent[],
  ): { daypart: ShareDaypart; events: SharedEvent[] }[] {
    return SHARE_DAYPART_ORDER.map((daypart) => ({
      daypart,
      events: events.filter((event) => event.daypart === daypart),
    })).filter((section) => section.events.length > 0);
  }

  /**
   * The journey INTO each event, read from the leg cache and **never computed**.
   *
   * A public unauthenticated route that could trigger a routing provider call would be a
   * free proxy for anyone holding a link; a page that only prints legs somebody already
   * looked at is honest and costs one indexed read. A pair with no stored leg simply has
   * no journey line.
   */
  private async journeyLookup(
    tripId: string,
    byDay: { events: ShareEventRow[] }[],
    places: SharePlaceRow[],
    bookings: { type: string }[],
  ): Promise<Map<string, SharedEvent['journey']>> {
    const coordOf = new Map(
      places
        .filter((place) => place.lat != null && place.lng != null)
        .map((place) => [place.id, { lat: place.lat as number, lng: place.lng as number }]),
    );
    const pairs: {
      eventId: string;
      fromPlaceId: string;
      toPlaceId: string;
      from: { lat: number; lng: number };
      to: { lat: number; lng: number };
      keys: string[];
    }[] = [];
    /**
     * **The chain is between PLACED rows, not between adjacent ones** (owner, 2026-08-31:
     * _"between day parts the transit line gets omitted"_ — reported as a daypart bug and it
     * is not one; the sections are rendered from the same rows either way).
     *
     * Pairing `events[i - 1]` with `events[i]` means a row with no place breaks the chain on
     * BOTH sides: an ice cave with no address between two hotels deleted the drive into it
     * and the drive out of it, so a day showed one journey where it has three. Carrying the
     * last placed row forward instead leaves the placeless row where it is and joins the two
     * points that actually exist.
     *
     * **What that costs, stated rather than hidden:** the printed leg is then the DIRECT
     * route between two known points and does not count a stop the reader can see between
     * them. That is the honest shape here — the alternative is printing nothing at all — but
     * it is a real understatement on a day with an unplaced detour, and the app's own
     * `planLegs` has the identical gap (backlogged, not fixed from a read-only projection).
     */
    for (const { events } of byDay) {
      let prevId: string | undefined;
      let prev: { lat: number; lng: number } | undefined;
      for (const event of events) {
        const to = event.placeId ?? event.booking?.fromPlaceId;
        const b = to ? coordOf.get(to) : undefined;
        const fromId = prevId;
        const a0 = prev;
        if (fromId && a0 && to && b && fromId !== to) {
          pairs.push({
            eventId: event.id,
            fromPlaceId: fromId,
            toPlaceId: to,
            from: a0,
            to: b,
            keys: TRAVEL_MODES.map((mode) => routeLegKey(a0, b, mode)),
          });
        }
        // Where the row LEAVES you, which is the far end of a booking rather than its start.
        const from = event.placeId ?? event.booking?.toPlaceId;
        const a = from ? coordOf.get(from) : undefined;
        if (from && a) {
          prevId = from;
          prev = a;
        }
      }
    }
    if (pairs.length === 0) return new Map();

    const [legs, overrides] = await Promise.all([
      this.prisma.routeLeg.findMany({
        where: { key: { in: [...new Set(pairs.flatMap((pair) => pair.keys))] } },
        select: { key: true, mode: true, durationSeconds: true, distanceMeters: true },
      }),
      this.prisma.travelModeOverride.findMany({
        where: { tripId },
        // `updatedAt` because `legTravelMode` resolves duplicate rows for one pair by taking
        // the NEWEST, and a caller that omits it silently changes that tie-break.
        select: { fromPlaceId: true, toPlaceId: true, mode: true, updatedAt: true },
      }),
    ]);
    const legByKey = new Map(legs.map((leg) => [leg.key, leg]));

    /**
     * **The trip's own fallback**, for a leg whose ends carry no coordinates at all — the same
     * `derivedTravelMode` the app hands `legTravelMode`, so a trip with a car hire falls back to
     * driving here exactly as it does on the board.
     */
    const tripMode = derivedTravelMode(bookings as { type: BookingType }[]);
    const overrideRows = overrides.map((row) => ({
      fromPlaceId: row.fromPlaceId,
      toPlaceId: row.toPlaceId,
      mode: row.mode as LegTravelMode,
      updatedAt: row.updatedAt.toISOString(),
    }));

    const out = new Map<string, SharedEvent['journey']>();
    for (const pair of pairs) {
      /**
       * **The app's rule, not one of this file's own** (owner, 2026-08-30: _"There's something
       * wrong with the walking vs driving derivation. It shows walking even though the real
       * schedule shows driving"_).
       *
       * It used to take "the first mode that has an answer, in `TRAVEL_MODES` order" — and that
       * order opens with `walking`, while `useDayTravel` caches EVERY mode for every leg
       * precisely so a mode question costs no request. So a leg with a cached walk always
       * answered walking, whatever the app was showing, and a ⁦38 km⁩ drive printed as a walk on
       * both renderers. The rule was never this file's to invent: `legTravelMode` and
       * `defaultLegTravelMode` are in `@waypoint/shared` exactly so the board, the Map and a
       * server-side projection cannot disagree about a leg (root rule 8).
       *
       * That also repairs the override lookup, which built its own `from>to` key while overrides
       * are stored **canonicalised** by `travelOverridePair` — so a pair declared in the other
       * direction was silently missed. `legTravelMode` keys them the one way.
       */
      const walkKey = routeLegKey(pair.from, pair.to, TRAVEL_MODE.WALKING);
      const resolved = legTravelMode(overrideRows, pair.fromPlaceId, pair.toPlaceId, () =>
        defaultLegTravelMode(
          pair.from,
          pair.to,
          tripMode,
          legByKey.get(walkKey)?.durationSeconds ?? null,
        ),
      );
      // **A declared תחב״צ leg is never routed** (ADR-0206 §AM5), so there is no duration to
      // print and this projection has no shape for a distance without one. It gets no journey
      // line rather than a line naming a mode it did not travel — which is the defect above,
      // one step quieter.
      if (!isRoutableMode(resolved)) continue;
      const leg = legByKey.get(routeLegKey(pair.from, pair.to, resolved));
      if (!leg) continue;
      out.set(pair.eventId, {
        // Prisma types the column as a string; the shared contract names the enum, and the
        // key this was fetched by was built from a `TravelMode`.
        mode: leg.mode as LegTravelMode,
        minutes: Math.round(leg.durationSeconds / 60),
        km: Math.round(leg.distanceMeters / 100) / 10,
      });
    }
    return out;
  }

  /**
   * Everything's block for what is attached to nothing — and it no longer asks the database
   * a single question of its own.
   *
   * It used to run its own note, task and document queries beside `loadOps`, and that second
   * copy was the defect, not a redundancy: `loadOps` filters by linkage and this did not, so
   * the toggle promising `רק תוכן שמחובר למסלול` published every note in the trip, and every
   * note that DID have a host printed twice — once on its row and once here. The rows'
   * queries already produce `unattached` as a by-product of deciding where each op goes, so
   * that is the whole of the answer (ADR-0096: one mechanism, not two).
   *
   * Travelers stay a query, because a traveller is not an op and hangs off no row.
   */
  private buildAppendix(unattached: readonly SharedOp[]): SharedAppendix | undefined {
    return unattached.length > 0 ? { ops: [...unattached] } : undefined;
  }

  /**
   * **Who is going** — the trip's own identity, not a block at the foot (owner, 2026-08-30).
   *
   * Names only. There is no toggle anywhere that reveals an email, which is why the `select`
   * cannot name one rather than the mapper choosing not to read it.
   */
  private async travelers(share: SharePolicy): Promise<string[] | undefined> {
    if (!share.includeTravelerIdentity) return undefined;
    const members = await this.prisma.membership.findMany({
      where: { tripId: share.tripId },
      select: { user: { select: { displayName: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    const names = members.map((member) => member.user.displayName).filter(Boolean);
    return names.length > 0 ? names : undefined;
  }
}
