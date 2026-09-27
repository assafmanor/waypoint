// **WHAT A FINISHED TRIP ADDS UP TO** (ADR-0239 §9, the epic's Phase 2).
//
// One pure derivation, so the memory Home, the past-tense narrative, the trip book and the
// group-chat card cannot print different numbers for the same trip. Two adapters fill its input
// — the app from its snapshot and the device's leg cache, the server from Prisma and `RouteLeg` —
// and neither decides anything.
//
// §9's three rules are the shape of every figure here:
//   1. **It counts what happened.** A soft row counts once it is marked `היינו`; a hard row counts
//      unless it was skipped (hard rows are not settled, ADR-0044). A figure that rows still
//      unresolved could change says how many (`12 מקומות · 2 לא סומנו`).
//   2. **An estimate says so.** A ground distance with any leg the cache did not hold falls back
//      to the great circle and carries `estimate`. Nothing here is a track (ADR-0006).
//   3. **No source is absent, not zero** (ADR-0045) — `{ state: 'absent' }`, the same two states
//      the enrichment store uses, so a renderer cannot print `0 ק״מ` for a trip nobody measured.
import {
  BOOKING_TYPE,
  EVENT_CATEGORY,
  EVENT_KIND,
  EVENT_STATUS,
  TRAVEL_MODE,
  TRANSIT_LEG_MODE,
  TRAVEL_MODES,
} from './constants';
import { eventStopPlaceId } from './booking-event';
import type { Booking, EventCategory, MaybeItem, Place, Trip, TripEvent } from './entities';
import {
  SUMMARY_LANG_PREFERENCE,
  resolveTextVariant,
  type DeliveredEnrichmentFields,
  type TextVariants,
  type TripEnrichments,
} from './enrichment';
import { haversineMeters, type LatLng } from './geo';
import { carriesRoute } from './icons';
import {
  ROUTE_MIN_CROW_M,
  carriedBookingMeters,
  coordOf,
  defaultLegTravelMode,
  derivedTravelMode,
  legTravelMode,
  routeLegKey,
  type LegModeOverrideRow,
  type TravelEstimate,
} from './routing';
import { dayPhoto, type DayPhotoPlace, type SharedPhoto } from './sharing';
import { dedupeConsecutive, dominantValue } from './day-title';
import { MS_PER_MINUTE, tripDates, zoneOffsetMinutes } from './trip-dates';
import { tripZoneCrossings } from './zones';

/** A figure, or the honest absence of one. `unresolved` is how many unsettled rows could still
 *  move it; `estimate` means at least part of it is a great-circle stand-in. */
export type RecapFigure<T = number> =
  { state: 'absent' } | { state: 'present'; value: T; estimate?: true; unresolved?: number };

export const RECAP_ABSENT = { state: 'absent' } as const satisfies RecapFigure<never>;

function present<T>(
  value: T,
  opts: { estimate?: boolean; unresolved?: number } = {},
): RecapFigure<T> {
  return {
    state: 'present',
    value,
    ...(opts.estimate ? { estimate: true as const } : {}),
    ...(opts.unresolved ? { unresolved: opts.unresolved } : {}),
  };
}

/** The leg cache as the recap reads it: `routeLegKey` → what the router answered. */
export type RecapLegs = ReadonlyMap<
  string,
  Pick<TravelEstimate, 'distanceMeters' | 'durationSeconds'>
>;

export interface TripRecapInput {
  trip: Pick<Trip, 'startDate' | 'endDate'>;
  events: readonly TripEvent[];
  bookings: readonly Booking[];
  places: readonly Place[];
  maybes: readonly Pick<MaybeItem, 'id' | 'consumed'>[];
  enrichments: TripEnrichments;
  overrides: readonly LegModeOverrideRow[];
  /** Only the keys `tripRecapLegKeys` names are read; a missing key is a great-circle estimate. */
  legs: RecapLegs;
  /** What the trip calls a place (`derivedPlaceLabel` on either end), for the cover's caption. */
  placeLabel?: (placeId: string) => string | undefined;
}

export interface CategoryCount {
  category: EventCategory;
  count: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface TripRecap {
  figures: {
    days: RecapFigure;
    nights: RecapFigure;
    /** Distinct beds slept in. */
    beds: RecapFigure;
    /** Distinct places visited, lodging and transport ends excluded. */
    places: RecapFigure;
    placesByCategory: RecapFigure<CategoryCount[]>;
    /** Wikidata's "what kind of thing" (`KIND`), most frequent first. */
    kinds: RecapFigure<LabelCount[]>;
    /** Where the trip went (`REGION`, else an airport's `SERVED_CITY`), in visit order. */
    regions: RecapFigure<string[]>;
    /** **Where the trip went, day by day**: each day's dominant region, consecutive repeats
     *  folded. Absent below two entries, so a one-city trip draws no strip (ADR-0240 §4). */
    route: RecapFigure<string[]>;
    groundMeters: RecapFigure;
    footMeters: RecapFigure;
    airMeters: RecapFigure;
    airMinutes: RecapFigure;
    zonesCrossed: RecapFigure;
    /** **The furthest the clock moved from home**, in minutes, signed (`+360` is six hours
     *  ahead). Home is the first crossing's origin; `0` when every crossing came back. */
    zoneShiftMinutes: RecapFigure;
  };
  superlatives: {
    busiestDay: RecapFigure<{ date: string; places: number }>;
    longestWalkDay: RecapFigure<{ date: string; meters: number }>;
    longestFlight: RecapFigure<{ bookingId: string; meters: number }>;
    longestStop: RecapFigure<{ eventId: string; minutes: number }>;
  };
  /** Soft rows nobody marked, in schedule order — the ids a straggler sheet walks. */
  stragglers: string[];
  /** What we meant to do and did not: skipped soft rows, then ideas never used. */
  nextTime: { skipped: string[]; ideas: string[] };
  /** `dayPhoto`'s rank over every row that happened, so the cover is the trip's best-ranked shot.
   *  Re-ranked on every read: an image a refresh removed falls through to the next one. */
  cover: SharedPhoto | undefined;
}

const isSoft = (event: TripEvent) => event.kind === EVENT_KIND.SOFT;

/** ADR-0239 §9's "happened": a soft row marked `היינו`, or a hard row nobody skipped. */
export function recapHappened(event: Pick<TripEvent, 'kind' | 'status'>): boolean {
  return event.kind === EVENT_KIND.HARD
    ? event.status !== EVENT_STATUS.SKIPPED
    : event.status === EVENT_STATUS.DONE;
}

const isUnresolved = (event: TripEvent) => isSoft(event) && event.status === EVENT_STATUS.PLANNED;

/** The order the server's route pack warms a day in (date, time, then hand order), so the legs
 *  the recap asks for are the ones the pack already holds. Untimed rows sort last, as Postgres
 *  sorts a null `startsAt`. */
function scheduleOrder(a: TripEvent, b: TripEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startsAt !== b.startsAt) {
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return Date.parse(a.startsAt) - Date.parse(b.startsAt);
  }
  return a.sortOrder - b.sortOrder;
}

interface Stop {
  placeId: string | undefined;
  /** The pair from here to the next stop is inside one booked transport row (carried, not walked
   *  or driven), so it is not a ground leg. */
  carriedToNext?: boolean;
}

interface GroundPair {
  date: string;
  fromPlaceId: string;
  toPlaceId: string;
  from: LatLng;
  to: LatLng;
}

interface Context {
  input: Omit<TripRecapInput, 'legs'>;
  bookingById: Map<string, Booking>;
  happened: TripEvent[];
  unresolved: TripEvent[];
}

function contextOf(input: Omit<TripRecapInput, 'legs'>): Context {
  const sorted = [...input.events].sort(scheduleOrder);
  return {
    input,
    bookingById: new Map(input.bookings.map((booking) => [booking.id, booking])),
    happened: sorted.filter(recapHappened),
    unresolved: sorted.filter(isUnresolved),
  };
}

/** A row's single place, or `undefined` for a transport row, whose two ends are not a place you
 *  visited (`eventStopPlaceId`). */
function stopPlaceOf(ctx: Context, event: TripEvent): string | undefined {
  const booking = event.bookingId ? ctx.bookingById.get(event.bookingId) : undefined;
  return eventStopPlaceId(event, booking);
}

function isLodging(ctx: Context, event: TripEvent, place: Place | undefined): boolean {
  const booking = event.bookingId ? ctx.bookingById.get(event.bookingId) : undefined;
  if (booking) return booking.type === BOOKING_TYPE.HOTEL;
  return (event.category ?? place?.category) === EVENT_CATEGORY.LODGING;
}

/** Consecutive placed stops of each day's happened rows. A transport row contributes both ends
 *  with the pair between them marked carried. */
function groundPairs(ctx: Context): GroundPair[] {
  const byDate = new Map<string, Stop[]>();
  for (const event of ctx.happened) {
    const stops = byDate.get(event.date) ?? [];
    byDate.set(event.date, stops);
    const booking = event.bookingId ? ctx.bookingById.get(event.bookingId) : undefined;
    if (booking && carriesRoute(booking.type)) {
      stops.push({ placeId: booking.fromPlaceId, carriedToNext: true });
      stops.push({ placeId: booking.toPlaceId });
    } else {
      stops.push({ placeId: stopPlaceOf(ctx, event) });
    }
  }
  const pairs: GroundPair[] = [];
  for (const [date, stops] of byDate) {
    // A placeless stop is crossed rather than breaking the chain (ADR-0232).
    const placed = stops.filter((stop) => coordOf(ctx.input.places, stop.placeId));
    for (let i = 0; i + 1 < placed.length; i++) {
      const a = placed[i]!;
      const b = placed[i + 1]!;
      if (a.carriedToNext || a.placeId === b.placeId) continue;
      const from = coordOf(ctx.input.places, a.placeId)!;
      const to = coordOf(ctx.input.places, b.placeId)!;
      if (haversineMeters(from, to) < ROUTE_MIN_CROW_M) continue;
      pairs.push({ date, fromPlaceId: a.placeId!, toPlaceId: b.placeId!, from, to });
    }
  }
  return pairs;
}

/** **Every leg key the recap may read**, so an adapter fetches exactly these and nothing else —
 *  every mode for each pair, because which mode a leg is depends on the walk the cache holds. */
export function tripRecapLegKeys(input: Omit<TripRecapInput, 'legs'>): string[] {
  const keys = new Set<string>();
  for (const pair of groundPairs(contextOf(input))) {
    for (const mode of TRAVEL_MODES) keys.add(routeLegKey(pair.from, pair.to, mode));
  }
  return [...keys];
}

function variantText(variants: TextVariants | undefined): string | undefined {
  return variants
    ? resolveTextVariant(variants, SUMMARY_LANG_PREFERENCE)?.value.trim() || undefined
    : undefined;
}

function countBy<K>(values: Iterable<K>): Map<K, number> {
  const counts = new Map<K, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** Highest count first; a tie keeps first-seen order (a `Map` iterates in insertion order and
 *  `sort` is stable). */
const byCount = <K>(counts: Map<K, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1]);

export function tripRecap(input: TripRecapInput): TripRecap {
  const ctx = contextOf(input);
  const placeById = new Map(input.places.map((place) => [place.id, place]));
  const enrichmentOf = (placeId: string): DeliveredEnrichmentFields | undefined =>
    input.enrichments[placeId];

  // ── Unresolved: how many unsettled rows could still move each kind of figure ──
  const unresolvedPlaced = ctx.unresolved.filter((event) => stopPlaceOf(ctx, event)).length;
  const unresolvedMapped = ctx.unresolved.filter((event) =>
    coordOf(input.places, stopPlaceOf(ctx, event)),
  ).length;

  // ── Days, nights ──
  const days = tripDates(input.trip.startDate, input.trip.endDate).length;

  // ── Places visited and beds ──
  const visited: string[] = [];
  const beds = new Set<string>();
  const categoryOf = new Map<string, EventCategory>();
  const placesByDate = new Map<string, Set<string>>();
  for (const event of ctx.happened) {
    const placeId = stopPlaceOf(ctx, event);
    const place = placeId ? placeById.get(placeId) : undefined;
    if (isLodging(ctx, event, place)) {
      beds.add(placeId ?? event.bookingId ?? event.id);
      continue;
    }
    if (!placeId) continue;
    if (!categoryOf.has(placeId)) {
      visited.push(placeId);
      categoryOf.set(placeId, place?.category ?? event.category ?? EVENT_CATEGORY.OTHER);
    }
    const onDay = placesByDate.get(event.date) ?? new Set<string>();
    onDay.add(placeId);
    placesByDate.set(event.date, onDay);
  }
  const unresolvedOpts = { unresolved: unresolvedPlaced };
  const placesFigure = visited.length
    ? present(visited.length, unresolvedOpts)
    : unresolvedPlaced
      ? present(0, unresolvedOpts)
      : RECAP_ABSENT;
  const placesByCategory = visited.length
    ? present(
        byCount(countBy(visited.map((id) => categoryOf.get(id)!))).map(([category, count]) => ({
          category,
          count,
        })),
        unresolvedOpts,
      )
    : RECAP_ABSENT;

  // ── Kinds and regions, from enrichment ──
  const kindCounts = countBy(
    visited.flatMap((id) => {
      const kind = variantText(enrichmentOf(id)?.kind);
      return kind ? [kind] : [];
    }),
  );
  const regions: string[] = [];
  const regionsByDate = new Map<string, string[]>();
  for (const event of ctx.happened) {
    const booking = event.bookingId ? ctx.bookingById.get(event.bookingId) : undefined;
    const ends =
      booking && carriesRoute(booking.type)
        ? [booking.fromPlaceId, booking.toPlaceId]
        : [stopPlaceOf(ctx, event)];
    for (const id of ends) {
      if (!id) continue;
      const fields = enrichmentOf(id);
      const region = variantText(fields?.region) ?? variantText(fields?.servedCity);
      if (!region) continue;
      if (!regions.includes(region)) regions.push(region);
      const onDay = regionsByDate.get(event.date) ?? [];
      onDay.push(region);
      regionsByDate.set(event.date, onDay);
    }
  }
  // A day with one known region is that region; with several, only a clear majority names it.
  const route = dedupeConsecutive(
    [...regionsByDate.values()].map(
      (values) => dominantValue(values) ?? (new Set(values).size === 1 ? values[0] : undefined),
    ),
  );

  // ── Ground and foot, per leg ──
  const tripMode = derivedTravelMode(input.bookings);
  let ground: number | null = null;
  let foot: number | null = null;
  let groundEstimate = false;
  let footEstimate = false;
  const footByDate = new Map<string, { meters: number; estimate: boolean }>();
  for (const pair of groundPairs(ctx)) {
    const mode = legTravelMode(input.overrides, pair.fromPlaceId, pair.toPlaceId, () =>
      defaultLegTravelMode(
        pair.from,
        pair.to,
        tripMode,
        input.legs.get(routeLegKey(pair.from, pair.to, TRAVEL_MODE.WALKING))?.durationSeconds,
      ),
    );
    const cached =
      mode === TRANSIT_LEG_MODE ? undefined : input.legs.get(routeLegKey(pair.from, pair.to, mode));
    const meters = cached?.distanceMeters ?? haversineMeters(pair.from, pair.to);
    const estimate = cached === undefined;
    ground = (ground ?? 0) + meters;
    groundEstimate ||= estimate;
    if (mode === TRAVEL_MODE.WALKING) {
      foot = (foot ?? 0) + meters;
      footEstimate ||= estimate;
      const day = footByDate.get(pair.date) ?? { meters: 0, estimate: false };
      footByDate.set(pair.date, {
        meters: day.meters + meters,
        estimate: day.estimate || estimate,
      });
    }
  }

  // ── Carried: flights in the air, everything else in motion on the ground ──
  let air: number | null = null;
  let airMinutes: number | null = null;
  let longestFlight: { bookingId: string; meters: number } | undefined;
  const carried = new Map<string, { booking: Booking; startMs?: number; endMs?: number }>();
  for (const event of ctx.happened) {
    const booking = event.bookingId ? ctx.bookingById.get(event.bookingId) : undefined;
    if (!booking) continue;
    const held = carried.get(booking.id) ?? { booking };
    const start = event.startsAt ? Date.parse(event.startsAt) : undefined;
    const end = event.endsAt ? Date.parse(event.endsAt) : undefined;
    if (start !== undefined) held.startMs = Math.min(held.startMs ?? start, start);
    if (end !== undefined) held.endMs = Math.max(held.endMs ?? end, end);
    carried.set(booking.id, held);
  }
  for (const { booking, startMs, endMs } of carried.values()) {
    const meters = carriedBookingMeters(booking, input.places);
    if (booking.type === BOOKING_TYPE.FLIGHT) {
      if (meters !== null) {
        air = (air ?? 0) + meters;
        if (!longestFlight || meters > longestFlight.meters)
          longestFlight = { bookingId: booking.id, meters };
      }
      if (startMs !== undefined && endMs !== undefined && endMs > startMs)
        airMinutes = (airMinutes ?? 0) + (endMs - startMs) / MS_PER_MINUTE;
    } else if (meters !== null) {
      // A great circle is the path a plane flies, not a train (ADR-0212), so on the ground it is
      // a stand-in and reads as one.
      ground = (ground ?? 0) + meters;
      groundEstimate = true;
    }
  }

  // ── Zones: absent unless some happened transport knew both of its zones ──
  const crossings = tripZoneCrossings(ctx.happened, [...input.bookings], [...input.places]);
  const zoneKnown = [...carried.values()].some(
    ({ booking }) =>
      carriesRoute(booking.type) &&
      placeById.get(booking.fromPlaceId ?? '')?.timezone &&
      placeById.get(booking.toPlaceId ?? '')?.timezone,
  );

  let zoneShift = 0;
  const home = crossings[0]?.fromZone;
  for (const crossing of crossings) {
    const at = new Date(crossing.at);
    const shift = zoneOffsetMinutes(at, crossing.toZone) - zoneOffsetMinutes(at, home!);
    if (Math.abs(shift) > Math.abs(zoneShift)) zoneShift = shift;
  }

  // ── Superlatives ──
  let busiestDay: { date: string; places: number } | undefined;
  for (const [date, set] of placesByDate) {
    if (set.size >= 2 && (!busiestDay || set.size > busiestDay.places))
      busiestDay = { date, places: set.size };
  }
  let longestWalkDay: { date: string; meters: number; estimate: boolean } | undefined;
  for (const [date, day] of footByDate) {
    if (!longestWalkDay || day.meters > longestWalkDay.meters) longestWalkDay = { date, ...day };
  }
  let longestStop: { eventId: string; minutes: number } | undefined;
  for (const event of ctx.happened) {
    const placeId = stopPlaceOf(ctx, event);
    if (!placeId || !event.startsAt || !event.endsAt) continue;
    if (isLodging(ctx, event, placeById.get(placeId))) continue;
    const minutes = (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / MS_PER_MINUTE;
    if (minutes > 0 && (!longestStop || minutes > longestStop.minutes))
      longestStop = { eventId: event.id, minutes };
  }

  // ── The cover ──
  const photoPlaces = new Map<string, DayPhotoPlace>(
    input.places.map((place) => [
      place.id,
      {
        id: place.id,
        nickname: place.nickname,
        icon: place.icon,
        userRatingsTotal: place.userRatingsTotal,
      },
    ]),
  );
  const cover = dayPhoto(
    ctx.happened.map((event) => ({
      placeId: stopPlaceOf(ctx, event),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      bookingId: event.bookingId,
      kind: event.kind,
      title: event.title,
    })),
    photoPlaces,
    input.enrichments,
    (place) => input.placeLabel?.(place.id),
  );

  const mapped = { unresolved: unresolvedMapped };
  return {
    figures: {
      days: present(days),
      nights: present(Math.max(0, days - 1)),
      beds: beds.size ? present(beds.size) : RECAP_ABSENT,
      places: placesFigure,
      placesByCategory,
      kinds: kindCounts.size
        ? present(
            byCount(kindCounts).map(([label, count]) => ({ label, count })),
            unresolvedOpts,
          )
        : RECAP_ABSENT,
      regions: regions.length ? present(regions, unresolvedOpts) : RECAP_ABSENT,
      route: route.length >= 2 ? present(route, unresolvedOpts) : RECAP_ABSENT,
      groundMeters:
        ground === null ? RECAP_ABSENT : present(ground, { estimate: groundEstimate, ...mapped }),
      footMeters:
        foot === null ? RECAP_ABSENT : present(foot, { estimate: footEstimate, ...mapped }),
      airMeters: air === null ? RECAP_ABSENT : present(air),
      airMinutes: airMinutes === null ? RECAP_ABSENT : present(airMinutes),
      zonesCrossed: zoneKnown ? present(crossings.length) : RECAP_ABSENT,
      zoneShiftMinutes: zoneKnown ? present(zoneShift) : RECAP_ABSENT,
    },
    superlatives: {
      busiestDay: busiestDay ? present(busiestDay) : RECAP_ABSENT,
      longestWalkDay: longestWalkDay
        ? present(
            { date: longestWalkDay.date, meters: longestWalkDay.meters },
            { estimate: longestWalkDay.estimate },
          )
        : RECAP_ABSENT,
      longestFlight: longestFlight ? present(longestFlight) : RECAP_ABSENT,
      longestStop: longestStop ? present(longestStop) : RECAP_ABSENT,
    },
    stragglers: ctx.unresolved.map((event) => event.id),
    nextTime: {
      skipped: [...input.events]
        .sort(scheduleOrder)
        .filter((event) => isSoft(event) && event.status === EVENT_STATUS.SKIPPED)
        .map((event) => event.id),
      ideas: input.maybes.filter((maybe) => !maybe.consumed).map((maybe) => maybe.id),
    },
    cover,
  };
}
