// The per-Place usage index (ADR-0106 §4, ADR-0110 §2): one derivation over the
// snapshot that feeds BOTH the Map filter chips and the pin/badge colour, so
// filter-by-type and colour-by-type stay one vocabulary. It builds on the
// existing linked/unlinked authority in `lib/places.ts` (eventPlaceId) rather
// than re-deriving which place a reference points at.
//
// Union semantics + colour-by-most-committed (ADR-0109 §4): a place appears under
// every facet it matches; each reference carries a commitment weight
// (hard event > soft event > idea), and the most-committed reference wins the
// pin's category + its hard/soft grammar. Written in the same idiom as
// `lib/index-bookings.ts` (a per-category count + a `matches` predicate) over a
// different entity (Place) + enum (EventCategory) + a `maybes` facet — new
// map-specific logic, deliberately not a generalization of the booking helpers
// (ADR-0110 §2, CLAUDE.md rule 8).
import {
  categoryForBookingType,
  EVENT_KIND,
  eventCategorySchema,
  isAmbient,
  isMultiDay,
  type Booking,
  type EventCategory,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { eventPlaceId } from './places';
import { MS_PER_DAY } from '../constants';

/** Commitment weight for the colour-by-most-committed tiebreak (ADR-0109 §4). */
export type PinCommitment = 'hard' | 'soft' | 'idea';
const COMMITMENT_WEIGHT: Record<PinCommitment, number> = { hard: 3, soft: 2, idea: 1 };

/** A day a place is anchored to, with its prominence (ADR-0109 §5 / 0054/0064):
 *  `edge` = arrival/departure day (loud pin/row); `ambient` = a strictly-middle
 *  day of an ambient multi-day stay (a quiet "your base" row, no amber core). */
export interface DayUsage {
  date: string;
  prominence: 'edge' | 'ambient';
  /** The moment this place is due on this day, as an absolute instant — the
   *  earliest of its references' moments here. Absent when nothing anchored to
   *  this day carries a clock (an untimed event, or a strictly-middle stay night).
   *  Absolute, not wall-clock, so a zone-crossing day still orders by the sequence
   *  you actually live it (ADR-0107). */
  at?: number;
  /** The day's manual order, for the tie the clock can't break — the same
   *  `sortOrder` fallback `buildTimeTree` uses (ADR-0043). */
  sortOrder?: number;
}

export interface PlaceUsage {
  placeId: string;
  days: DayUsage[];
  /** Every referencing category (union), for the type facet + counts. */
  categories: EventCategory[];
  isMaybe: boolean; // referenced by an unconsumed MaybeItem
  isScheduled: boolean; // referenced by a scheduled event
  coordless: boolean; // lat/lng absent → not pinnable/measurable (listed-only)
  /** The most-committed reference: drives the pin/badge hue + hard/soft grammar.
   *  `category` is null when every reference is uncategorised (→ leisure hue at
   *  the call site, ADR-0110 §2). */
  pin: { category: EventCategory | null; commitment: PinCommitment };
}

const isTransport = (booking: Booking): boolean =>
  categoryForBookingType(booking.type) === 'transport';

/** Calendar dates spanned by an event, inclusive. Parsed/stepped in UTC so the
 *  whole-day step is DST-safe (calendar dates carry no zone).
 *
 *  `edge` is where the clock lives: a span's first day is due at its start and its
 *  last day at its end (a hotel's check-in and check-out — the same two moments the
 *  day view draws as transitions), while a strictly-middle night has no moment at
 *  all. `endsAt` overrides for a transport DESTINATION, whose moment is the arrival,
 *  not the departure — so a flight's two endpoints list in travel order. */
function spanDays(event: TripEvent, edge: 'start' | 'end' = 'start'): DayUsage[] {
  const startAt = event.startsAt ? Date.parse(event.startsAt) : undefined;
  const endAt = event.endsAt ? Date.parse(event.endsAt) : undefined;
  const { sortOrder } = event;
  if (!isMultiDay(event)) {
    const at = edge === 'end' ? (endAt ?? startAt) : startAt;
    return [{ date: event.date, prominence: 'edge', at, sortOrder }];
  }
  const dates: string[] = [];
  const endT = Date.parse(event.endDate!);
  for (let t = Date.parse(event.date); t <= endT; t += MS_PER_DAY) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  // An ambient stay (a hotel) reads edge on arrival/departure, ambient in the
  // strictly-middle nights; a non-ambient multi-day event stays loud throughout.
  const ambient = isAmbient(event);
  return dates.map((date, i) => {
    const isFirst = i === 0;
    const isLast = i === dates.length - 1;
    return {
      date,
      prominence: ambient && !isFirst && !isLast ? ('ambient' as const) : ('edge' as const),
      at: isFirst ? startAt : isLast ? endAt : undefined,
      sortOrder,
    };
  });
}

interface Accum {
  days: Map<string, DayUsage>;
  categories: Set<EventCategory>;
  isMaybe: boolean;
  isScheduled: boolean;
  best: { category: EventCategory | null; commitment: PinCommitment } | null;
}

/** Build the `placeId → PlaceUsage` index. Reference gathering runs through the
 *  existing resolver: a transport event contributes BOTH endpoints (origin +
 *  destination), every other linked/unlinked event its single place; an unlinked
 *  booking contributes its place with no day facet (a Booking carries no time);
 *  an unconsumed MaybeItem contributes `isMaybe` + its category. (ADR-0110 §2.) */
export function buildPlaceUsageIndex(
  events: TripEvent[],
  bookings: Booking[],
  maybeItems: MaybeItem[],
  places: Place[],
): Map<string, PlaceUsage> {
  const acc = new Map<string, Accum>();
  const ensure = (placeId: string): Accum => {
    let a = acc.get(placeId);
    if (!a) {
      a = {
        days: new Map(),
        categories: new Set(),
        isMaybe: false,
        isScheduled: false,
        best: null,
      };
      acc.set(placeId, a);
    }
    return a;
  };
  const addRef = (
    placeId: string | undefined | null,
    ref: {
      category: EventCategory | null;
      commitment: PinCommitment;
      days: DayUsage[];
      isEvent: boolean;
      isMaybe: boolean;
    },
  ) => {
    if (!placeId) return;
    const a = ensure(placeId);
    if (ref.category) a.categories.add(ref.category);
    if (ref.isEvent) a.isScheduled = true;
    if (ref.isMaybe) a.isMaybe = true;
    for (const d of ref.days) {
      const seen = a.days.get(d.date);
      if (!seen) {
        a.days.set(d.date, d);
        continue;
      }
      // Two references on one date merge to the loudest prominence and the
      // EARLIEST moment — the place is due when the first thing there is due.
      a.days.set(d.date, {
        date: d.date,
        prominence: seen.prominence === 'edge' || d.prominence === 'edge' ? 'edge' : 'ambient',
        at: seen.at == null ? d.at : d.at == null ? seen.at : Math.min(seen.at, d.at),
        sortOrder:
          seen.sortOrder == null
            ? d.sortOrder
            : d.sortOrder == null
              ? seen.sortOrder
              : Math.min(seen.sortOrder, d.sortOrder),
      });
    }
    if (!a.best || COMMITMENT_WEIGHT[ref.commitment] > COMMITMENT_WEIGHT[a.best.commitment]) {
      a.best = { category: ref.category, commitment: ref.commitment };
    }
  };

  for (const event of events) {
    const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
    const category = event.category ?? (booking ? categoryForBookingType(booking.type) : null);
    const commitment: PinCommitment = event.kind === EVENT_KIND.HARD ? 'hard' : 'soft';
    // Transport contributes both endpoints, each at its OWN moment — the origin
    // when you depart, the destination when you land — so the two ends of a flight
    // never tie and list in travel order. Everything else: its resolved place.
    const endpoints: { placeId?: string | null; edge: 'start' | 'end' }[] =
      booking && isTransport(booking)
        ? [
            { placeId: booking.fromPlaceId, edge: 'start' },
            { placeId: booking.toPlaceId, edge: 'end' },
          ]
        : [{ placeId: eventPlaceId(event, booking), edge: 'start' }];
    for (const { placeId, edge } of endpoints) {
      addRef(placeId, {
        category,
        commitment,
        days: spanDays(event, edge),
        isEvent: true,
        isMaybe: false,
      });
    }
  }

  // Unlinked bookings (no scheduled event) contribute their place under
  // all/type/maybes but never a day facet — a Booking carries no time.
  const linkedBookingIds = new Set(events.map((e) => e.bookingId).filter(Boolean));
  for (const booking of bookings) {
    if (linkedBookingIds.has(booking.id)) continue;
    const category = categoryForBookingType(booking.type);
    const placeIds = isTransport(booking)
      ? [booking.fromPlaceId, booking.toPlaceId]
      : [booking.placeId];
    for (const pid of placeIds) {
      addRef(pid, { category, commitment: 'soft', days: [], isEvent: false, isMaybe: false });
    }
  }

  for (const m of maybeItems) {
    if (m.consumed) continue;
    addRef(m.placeId, {
      category: m.category ?? null,
      commitment: 'idea',
      days: [],
      isEvent: false,
      isMaybe: true,
    });
  }

  const byId = new Map(places.map((p) => [p.id, p]));
  const out = new Map<string, PlaceUsage>();
  for (const [placeId, a] of acc) {
    const place = byId.get(placeId);
    out.set(placeId, {
      placeId,
      days: [...a.days.values()].sort((x, y) => x.date.localeCompare(y.date)),
      categories: [...a.categories],
      isMaybe: a.isMaybe,
      isScheduled: a.isScheduled,
      coordless: place?.lat == null || place?.lng == null,
      pin: a.best ?? { category: null, commitment: 'idea' },
    });
  }
  return out;
}

// ── Facet filtering (type single-select + maybes toggle, ADR-0110 §2) ────────

/** The Map type filter: every `EventCategory` plus "all" (mirrors the Index's
 *  `CATEGORY_ALL`). Kept beside the type it filters, not a bare string literal. */
export const PLACE_CATEGORY_ALL = 'all';
export type PlaceCategoryFilter = EventCategory | typeof PLACE_CATEGORY_ALL;

export interface PlaceFilter {
  category: PlaceCategoryFilter;
  /** The independent maybes toggle (ADR-0110 §2) — narrows to shelf ideas. */
  maybesOnly: boolean;
}

/** Filter match: the maybes toggle (if on) requires `isMaybe`; the type chip
 *  passes "all" or any place whose category union includes the picked one. */
export function matchesPlaceFilter(usage: PlaceUsage, filter: PlaceFilter): boolean {
  if (filter.maybesOnly && !usage.isMaybe) return false;
  return filter.category === PLACE_CATEGORY_ALL || usage.categories.includes(filter.category);
}

// ── List order (ADR-0109 §1 amendment) ───────────────────────────────────────

/**
 * The list's order: **the order the trip happens in**. Within a day this reuses the
 * day view's own vocabulary — start instant, then `sortOrder` (`buildTimeTree`), with
 * untimed events after the clocked ones exactly as `DayView` renders them — so the
 * map and the timeline can never disagree about the same day.
 *
 * Three things have no position in a day's schedule and sink, in this order:
 * an **untimed** event (a date but no clock), a strictly-middle **ambient** stay
 * night (backdrop, off the day schedule by ADR-0054), and a reference with **no day
 * at all** (an unlinked booking or a shelf idea — a Booking carries no time). Place
 * name is the final tiebreak, so the order is total and stable.
 *
 * `onDate` scopes the comparison to one day when the list is day-scoped; without it
 * each place is ranked by its earliest day (the all-days view).
 */
export function comparePlacesBySchedule(
  a: PlaceUsage,
  b: PlaceUsage,
  nameOf: (usage: PlaceUsage) => string,
  onDate?: string,
): number {
  const dayOf = (u: PlaceUsage) => (onDate ? u.days.find((d) => d.date === onDate) : u.days[0]);
  const da = dayOf(a);
  const db = dayOf(b);
  // A place with no day at all comes last, whatever else is true of it.
  if (!da || !db) {
    if (da === db) return nameOf(a).localeCompare(nameOf(b));
    return da ? -1 : 1;
  }
  if (da.date !== db.date) return da.date.localeCompare(db.date);

  // Within the day: clocked → untimed → ambient backdrop.
  const rank = (d: DayUsage) => (d.prominence === 'ambient' ? 2 : d.at == null ? 1 : 0);
  if (rank(da) !== rank(db)) return rank(da) - rank(db);
  if (da.at != null && db.at != null && da.at !== db.at) return da.at - db.at;
  const sa = da.sortOrder ?? 0;
  const sb = db.sortOrder ?? 0;
  if (sa !== sb) return sa - sb;
  return nameOf(a).localeCompare(nameOf(b));
}

/** Per-category place counts for the chip row (each chip carries its own count,
 *  ADR-0100 idiom). Every `EventCategory` starts at 0 so an empty type still
 *  renders a chip; a place counts once per category it references (union). */
export function countPlacesByCategory(usages: PlaceUsage[]): Record<EventCategory, number> {
  const counts = Object.fromEntries(eventCategorySchema.options.map((c) => [c, 0])) as Record<
    EventCategory,
    number
  >;
  for (const usage of usages) for (const category of usage.categories) counts[category]++;
  return counts;
}
