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
  EVENT_STATUS,
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
  /** When this place stops being current — the LATEST end among its references
   *  here, so a place stays live while anything there still is. Mirrors
   *  `eventPhase`'s boundary (`endsAt ?? startsAt`), which is why a 13:00-18:00
   *  event is not "behind you" at 14:00 and a stay is not behind you mid-stay. */
  until?: number;
  /** The day's manual order, for the tie the clock can't break — the same
   *  `sortOrder` fallback `buildTimeTree` uses (ADR-0043). */
  sortOrder?: number;
  /** The event whose moment this is — the one that owns `at` when several land on
   *  the same date. The screen resolves what to say about it (and which zone to say
   *  it in); this only points, so the derivation stays clock- and zone-free. */
  eventId?: string;
  /** Which end of that event this day sits at: a departure/check-in (`start`) or an
   *  arrival/check-out (`end`). Undefined mid-span, where neither happens. */
  edge?: 'start' | 'end';
  /** What a human said happened here, across ALL of this day's references
   *  (ADR-0117 §1): `done` if any of them is marked done — you were there — else
   *  `skipped` if any is skipped, else absent (nobody settled it). A stored fact,
   *  not a clock read, so the derivation stays clock-free. */
  outcome?: 'done' | 'skipped';
  /** Every reference here is settled (done or skipped), so the day is handled
   *  whatever the clock says (ADR-0117 §2). Distinct from `outcome`: a day with one
   *  done and one still-planned event has an outcome but is not settled. */
  settled?: boolean;
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
  const outcome =
    event.status === EVENT_STATUS.DONE
      ? ('done' as const)
      : event.status === EVENT_STATUS.SKIPPED
        ? ('skipped' as const)
        : undefined;
  const settled = outcome != null;
  const startAt = event.startsAt ? Date.parse(event.startsAt) : undefined;
  const endAt = event.endsAt ? Date.parse(event.endsAt) : undefined;
  const { sortOrder } = event;
  // The span's own end is what makes it current, on every day it touches: an event
  // running 13:00-18:00 is not behind you at 14:00, and a stay is not behind you
  // until its check-out — the same boundary `eventPhase` uses.
  const until = endAt ?? startAt;
  const eventId = event.id;
  if (!isMultiDay(event)) {
    const at = edge === 'end' ? (endAt ?? startAt) : startAt;
    return [
      {
        date: event.date,
        prominence: 'edge',
        at,
        until,
        sortOrder,
        eventId,
        edge,
        outcome,
        settled,
      },
    ];
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
      // A span's own ends are its two moments, whatever `edge` the caller asked for:
      // the first day departs/checks in, the last arrives/checks out, the middle
      // nights have neither.
      at: isFirst ? startAt : isLast ? endAt : undefined,
      until,
      sortOrder,
      eventId,
      edge: isFirst ? ('start' as const) : isLast ? ('end' as const) : undefined,
      outcome,
      settled,
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
      // EARLIEST moment — the place is due when the first thing there is due — and
      // the pointer follows whichever reference won that moment, so what the row
      // says about the day matches the time it shows.
      const earliest = seen.at == null ? d : d.at == null ? seen : d.at < seen.at ? d : seen;
      a.days.set(d.date, {
        date: d.date,
        prominence: seen.prominence === 'edge' || d.prominence === 'edge' ? 'edge' : 'ambient',
        at: earliest.at,
        eventId: earliest.eventId,
        edge: earliest.edge,
        // …but the LATEST end: the place is behind you only once everything there is.
        until:
          seen.until == null
            ? d.until
            : d.until == null
              ? seen.until
              : Math.max(seen.until, d.until),
        sortOrder:
          seen.sortOrder == null
            ? d.sortOrder
            : d.sortOrder == null
              ? seen.sortOrder
              : Math.min(seen.sortOrder, d.sortOrder),
        // A visit wins over a skip (you were there), and the day is settled only
        // once EVERY reference on it is (ADR-0117 §1/§2).
        outcome:
          seen.outcome === 'done' || d.outcome === 'done' ? 'done' : (seen.outcome ?? d.outcome),
        settled: (seen.settled ?? false) && (d.settled ?? false),
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
 * The list's order. With a clock (`nowMs`) it is two blocks, and the split comes
 * first — before the date:
 *
 * 1. **Ahead of you** — next and coming up, earliest first, whatever day it falls on.
 *    Within a day this reuses the day view's own vocabulary (start instant, then
 *    `sortOrder`, untimed after the clocked ones exactly as `DayView` renders them),
 *    so the map and the timeline can never disagree about a day. A strictly-middle
 *    **ambient** stay night trails both, being backdrop rather than schedule (ADR-0054).
 * 2. **Behind you** — newest first: the stop you just left is the one you might still
 *    want, and the trip's opening day is the least interesting row on screen. No
 *    within-day hierarchy applies here; everything in this block is equally done.
 *
 * A reference with **no day at all** (an unlinked booking or a shelf idea — a Booking
 * carries no time) has no position in either block and comes last. Place name is the
 * final tiebreak, so the order is total and stable.
 *
 * `onDate` scopes the comparison to one day when the list is day-scoped; without it
 * each place is ranked by its earliest day (the all-days view). Omitting `nowMs`
 * yields pure sequence, with no ahead/behind split at all.
 */
export interface PlaceOrderContext {
  /** Display name, for the final tiebreak that makes the order total. */
  nameOf: (usage: PlaceUsage) => string;
  /** Scope the comparison to one day; omit to rank each place by its earliest day. */
  onDate?: string;
  /**
   * The live clock. When given, the list splits **ahead of you / behind you** before
   * anything else (ADR-0109 session-110 amendment) — what's next and coming up leads,
   * whatever day it falls on, and what's done follows most-recent-first. Omit only to
   * get pure sequence with no clock at all.
   */
  nowMs?: number;
  /** Today's trip-local date (`YYYY-MM-DD`). Lets a whole day count as behind you, so
   *  an **untimed** event on a day that has passed sinks with the rest of it rather
   *  than floating at the top for want of a clock. */
  today?: string;
}

/** Whether a place's day is behind you: everything anchored there has ended.
 *  In progress counts as current — an event running now is maximally relevant. */
export function isDayUsagePast(day: DayUsage, nowMs: number, today?: string): boolean {
  // A human who settled the day outranks the clock (ADR-0117 §2): marking the
  // 20:00 dinner done at 11:00 means it is handled, not still ahead of you.
  if (day.settled) return true;
  // A whole calendar day that has passed takes everything on it, clocked or not —
  // otherwise an untimed event on a finished day reads as still to come.
  if (today && day.date !== today) return day.date < today;
  const ends = day.until ?? day.at;
  return ends != null && nowMs >= ends;
}

/** The `DayUsage` a place is ranked by in this context: the scoped day, else its
 *  earliest. `undefined` when the place has no day at all. */
export function placeDay(usage: PlaceUsage, onDate?: string): DayUsage | undefined {
  return onDate ? usage.days.find((d) => d.date === onDate) : usage.days[0];
}

export function comparePlacesBySchedule(
  a: PlaceUsage,
  b: PlaceUsage,
  ctx: PlaceOrderContext,
): number {
  const { nameOf, onDate, nowMs, today } = ctx;
  const da = placeDay(a, onDate);
  const db = placeDay(b, onDate);
  // A place with no day at all comes last, whatever else is true of it.
  if (!da || !db) {
    if (da === db) return nameOf(a).localeCompare(nameOf(b));
    return da ? -1 : 1;
  }

  // Ahead of you beats behind you BEFORE the date is even considered. Ordering by
  // date first was the bug: across several days it put last Tuesday above the stop
  // you're heading to this evening, because the sink only ever applied within a day.
  const behind = (d: DayUsage) => nowMs != null && isDayUsagePast(d, nowMs, today);
  if (behind(da) !== behind(db)) return behind(da) ? 1 : -1;

  // What's done reads newest-first: the thing you just left is the one you might
  // still want, and the trip's opening day is the least interesting row on screen.
  const dir = behind(da) ? -1 : 1;
  if (da.date !== db.date) return dir * da.date.localeCompare(db.date);
  // Within a day, ahead of you: clocked → untimed → ambient backdrop. The sunk block
  // has no such hierarchy — everything there is equally done — so it goes by clock.
  if (!behind(da)) {
    const rank = (d: DayUsage) => (d.prominence === 'ambient' ? 2 : d.at == null ? 1 : 0);
    if (rank(da) !== rank(db)) return rank(da) - rank(db);
  }
  // A row with no clock can't claim recency, so it trails the timed ones either way.
  if (da.at == null || db.at == null) {
    if (da.at !== db.at) return da.at == null ? 1 : -1;
  } else if (da.at !== db.at) {
    return dir * (da.at - db.at);
  }
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
