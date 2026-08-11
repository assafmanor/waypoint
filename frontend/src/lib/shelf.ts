// The shelf's grouping (ADR-0116 §2/§3). One derivation, because both hosts render
// the same shelf: Trip mode's DayView and Plan mode's PlanDay. Before this each
// screen inlined `maybeItems.filter((m) => !m.consumed)` and Trip mode alone knew
// about the day's skipped events — which is how ADR-0027's "the shelf renders
// unplaced ideas AND skipped soft events, uniformly" stayed half-built.
//
// Pure: no clock, no zone, no state. The day it groups against is passed in.
import {
  EVENT_KIND,
  EVENT_STATUS,
  SUGGESTION_PLACEMENT,
  SUGGESTION_REASON,
  SUGGESTION_REF,
  suggestFor,
  type Booking,
  type MaybeItem,
  type Place,
  type Suggestion,
  type SuggestionReason,
  type SuggestionStop,
  type TripEvent,
} from '@waypoint/shared';
import { eventPlaceId } from './places';
import { formatDistance } from './distance';
import { relativeDayLabel, zonedIso } from './time';
import type { GapDefaults } from './gaps';
import { t } from '../i18n/he';

export interface ShelfGroups {
  /** Pencilled in for the focused day (`targetDate === date`). */
  forDay: MaybeItem[];
  /** Everything else, dateless first, then ideas aimed at another day — each of
   *  which states which day at the call site (ADR-0085's relative phrasing). */
  pool: MaybeItem[];
  /** The focused day's skipped soft events, parked here and restorable in place
   *  (ADR-0027 §2). They belong to the day, so they render beside `forDay`. */
  skipped: TripEvent[];
}

export function shelfGroups(
  maybeItems: MaybeItem[],
  events: TripEvent[],
  date: string,
): ShelfGroups {
  const parked = maybeItems.filter((m) => !m.consumed);
  const forDay = parked.filter((m) => m.targetDate === date);
  const others = parked.filter((m) => m.targetDate !== date);
  return {
    forDay,
    // Dateless ideas lead: they're the ones still asking to be placed anywhere.
    pool: [...others.filter((m) => !m.targetDate), ...others.filter((m) => !!m.targetDate)],
    skipped: events.filter(
      (e) => e.date === date && e.kind === EVENT_KIND.SOFT && e.status === EVENT_STATUS.SKIPPED,
    ),
  };
}

/** Everywhere a day actually stops: its planned events that resolve to a place with
 *  coordinates. Skipped events are excluded — they are not happening, so measuring
 *  proximity to one would rank ideas against a plan that was abandoned. */
export function dayStops(
  events: TripEvent[],
  bookings: Booking[],
  places: Place[],
  date: string,
): SuggestionStop[] {
  return locatedStops(events, bookings, places, date).map((s) => s.stop);
}

/** The day's located events, paired with the stop each one is. */
function locatedStops(
  events: TripEvent[],
  bookings: Booking[],
  places: Place[],
  date: string,
): { event: TripEvent; stop: SuggestionStop }[] {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const located: { event: TripEvent; stop: SuggestionStop }[] = [];
  for (const event of events) {
    if (event.date !== date || event.status === EVENT_STATUS.SKIPPED) continue;
    const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
    const place = placeById.get(eventPlaceId(event, booking) ?? '');
    if (place?.lat == null || place.lng == null) continue;
    located.push({ event, stop: { name: place.name, at: { lat: place.lat, lng: place.lng } } });
  }
  return located;
}

/**
 * The stops on either side of a slot — what the gap sheet ranks against instead of
 * the whole day (ADR-0151 §3: a narrower `near` is a different CONTEXT, not a
 * second strategy). An idea that fits a 14:00 hole between two Shinjuku stops is
 * not the one nearest to breakfast across town.
 *
 * `fromMs`/`toMs` are the slot's own instants; the caller owns the zone, so this
 * stays clock- and zone-free like the rest of this file. A gap at the day's edge
 * has one neighbour, and a day with no located events has none — in which case the
 * strategy falls back to recency, which is honest about what it knows.
 */
export function slotStops(
  events: TripEvent[],
  bookings: Booking[],
  places: Place[],
  date: string,
  slot: { fromMs: number; toMs: number },
): SuggestionStop[] {
  const located = locatedStops(events, bookings, places, date);
  const endOf = (e: TripEvent) => Date.parse(e.endsAt ?? e.startsAt ?? '');
  const startOf = (e: TripEvent) => Date.parse(e.startsAt ?? '');
  const closest = (
    candidates: { event: TripEvent; stop: SuggestionStop }[],
    distance: (e: TripEvent) => number,
  ) =>
    candidates.reduce<{ event: TripEvent; stop: SuggestionStop } | null>(
      (best, c) => (!best || distance(c.event) < distance(best.event) ? c : best),
      null,
    );

  const before = closest(
    located.filter((c) => endOf(c.event) <= slot.fromMs),
    (e) => slot.fromMs - endOf(e),
  );
  const after = closest(
    located.filter((c) => startOf(c.event) >= slot.toMs),
    (e) => startOf(e) - slot.toMs,
  );
  return [before, after].flatMap((c) => (c ? [c.stop] : []));
}

/** An idea and why it sits where it does. `reason` is the strategy's, rendered by
 *  the call site (ADR-0151 §8 — the shared contract carries the fact, not the
 *  Hebrew). */
export interface RankedIdea {
  item: MaybeItem;
  reason: SuggestionReason;
}

/** Every day of the trip and where it stops — the input `fits-a-day` needs to answer "which
 *  day does this belong to" (ADR-0151's 2026-08-04 amendment). `dayStops` per date, the same
 *  derivation the focused day uses, so the two strategies cannot disagree about where a day
 *  goes. Days with nothing located contribute nothing and are dropped by the strategy. */
export function tripDayStops(
  dates: string[],
  events: TripEvent[],
  bookings: Booking[],
  places: Place[],
): { date: string; stops: SuggestionStop[] }[] {
  return dates.map((date) => ({ date, stops: dayStops(events, bookings, places, date) }));
}

/**
 * The pool, ranked (ADR-0116 session-202 §3). `shelfGroups` above is untouched:
 * this reorders what it already grouped and attaches each idea's reason. It goes
 * through `suggestFor`, never through a strategy — the shelf does not know
 * `near-the-day` exists, which is what makes the second strategy a registration
 * (ADR-0151 §2).
 *
 * `stops` is the anchor to rank against: the day's own stops for the shelf, the
 * events either side of a slot for the gap sheet. Same strategy, narrower context.
 *
 * `days` is what lets `fits-a-day` speak (the 2026-08-04 amendment) — the shelf passes it and
 * every other caller passes nothing, which is exactly how that strategy stays out of the gap
 * sheet's answer.
 */
export function rankIdeas(
  ideas: MaybeItem[],
  places: Place[],
  date: string,
  stops: SuggestionStop[],
  limit?: number,
  days?: { date: string; stops: SuggestionStop[] }[],
): RankedIdea[] {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const byId = new Map(ideas.map((m) => [m.id, m]));
  const at = (m: MaybeItem) => {
    const place = placeById.get(m.placeId ?? '');
    return place?.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : undefined;
  };
  const suggestions = suggestFor(
    {
      date,
      dayStops: stops,
      ideas: ideas.map((item) => ({ item, at: at(item) })),
      days,
      limit,
    },
    SUGGESTION_PLACEMENT.LOCAL,
  );
  const itemOf = (s: Suggestion) =>
    s.ref.kind === SUGGESTION_REF.MAYBE_ITEM ? byId.get(s.ref.id) : undefined;
  return suggestions.flatMap((s) => {
    const item = itemOf(s);
    return item ? [{ item, reason: s.reason }] : [];
  });
}

/**
 * **The pool strip as it renders** — ranked, pinned, capped, and the tail counted
 * (ADR-0116's 2026-08-11 amendment, field report #40). One derivation, because both
 * shelves draw the same strip and this was twelve identical lines in each of them.
 *
 * **The pin is the amendment.** The cap keeps the strip's width independent of how many
 * ideas the trip has accumulated (`SHELF_POOL_CAP`), and the ranking answers "which of
 * these is useful on this day" — but an idea you have just this second created is not
 * asking that question. It is asking whether it landed. With the shelf healthy and
 * fourteen undated ideas on the trip, a Map add 7km from the day's stops moved the tail
 * count from `עוד 8` to `עוד 9` and nothing else, which to the person who made it is
 * indistinguishable from the add having failed. So recency stops being `near-the-day`'s
 * tiebreak here and becomes a floor: the idea this device made last leads the strip
 * whatever it scored, and the fifth-ranked idea moves into the tail behind it.
 *
 * The cap is NOT raised to buy the slot, deliberately — the whole point of a constant
 * width is that it does not track N, and one pinned tile costs one ranked tile once,
 * not one per idea the trip accumulates.
 *
 * Nothing here expires the pin. It ends when the idea leaves the pool (scheduled,
 * removed, aimed at this day) or when the next add replaces it — which is every way
 * "I have seen that it landed" actually ends. A pin whose idea is gone simply matches
 * nothing, so no caller has to clear one.
 */
export function poolStrip(
  pool: MaybeItem[],
  context: {
    places: Place[];
    date: string;
    stops: SuggestionStop[];
    /** Every day's stops, so `fits-a-day` can speak — the shelf is its only caller. */
    days: { date: string; stops: SuggestionStop[] }[];
  },
  options: { justAdded: string | undefined; limit: number },
): { strip: RankedIdea[]; tail: number } {
  // Ranked WHOLE, then cut: the pin has to be able to reach in from beyond the cap, and
  // `suggestFor` slices at the end anyway, so the unlimited call costs nothing.
  const ranked = rankIdeas(
    pool,
    context.places,
    context.date,
    context.stops,
    undefined,
    context.days,
  );
  const pinned = options.justAdded
    ? ranked.find((r) => r.item.id === options.justAdded)
    : undefined;
  const ordered = pinned ? [pinned, ...ranked.filter((r) => r !== pinned)] : ranked;
  const strip = ordered.slice(0, options.limit);
  return { strip, tail: pool.length - strip.length };
}

/**
 * **The shelf, ranked against one slot** — the whole input `SlotFillSheet` needs, in one
 * call (ADR-0161 §6).
 *
 * This was four nested calls inline at the gap-fill call site, and `החלף` needs the same
 * four in the same order: the shelf's two groups joined, the slot's own instants derived
 * from its wall clock, `slotStops` for the neighbours, `rankIdeas` for the order. Two
 * copies of that would be two chances to rank a replacement differently from a gap fill,
 * on the one sheet whose entire promise is that they are the same question.
 *
 * `zonedIso` is the only reason this is not in the pure part of the file: the slot is a
 * wall clock and the stops are instants, so someone has to name the zone.
 *
 * **A slot with no clock ranks against the whole day**, and that is a real case rather than
 * defensive padding: `zonedIso(date, '', tz)` builds an Invalid Date and `toISOString()`
 * throws on it, which took the day view blank when `החלף` was offered on an untimed row
 * (reported 2026-08-04). The caller-side rule is that an untimed row has no slot to replace
 * and so is not offered the verb; this is the derivation refusing to invent an instant it was
 * not given. Ranking against no stops is what `slotStops` itself falls back to on a day with
 * nothing located — recency, which is honest about what it knows.
 */
export function shelfForSlot(
  shelf: { forDay: MaybeItem[]; pool: MaybeItem[] },
  slot: GapDefaults,
  tz: string,
  context: { events: TripEvent[]; bookings: Booking[]; places: Place[] },
): RankedIdea[] {
  const { events, bookings, places } = context;
  const ideas = [...shelf.forDay, ...shelf.pool];
  if (!slot.start) return rankIdeas(ideas, places, slot.date, []);
  return rankIdeas(
    ideas,
    places,
    slot.date,
    // Ranked against THIS slot's own neighbours, not the whole day — the sheet's only
    // question is which idea fits here (ADR-0151 §3).
    slotStops(events, bookings, places, slot.date, {
      fromMs: Date.parse(zonedIso(slot.date, slot.start, tz)),
      // A slot with no end (a late tail, ADR-0036) is an instant, and its "after" neighbour
      // is then everything following it — which is the honest reading.
      toMs: Date.parse(zonedIso(slot.date, slot.end || slot.start, tz)),
    }),
  );
}

/** The reason as a full sentence, for the slot sheet's full-width row. The contract
 *  carries the fact and the frontend spells it (ADR-0151 §8, and `packages/shared`
 *  holds no UI copy). `today` is the date the relative phrasing is read against —
 *  the day being viewed, so "מחר" means the day after the one on screen. */
export function reasonText(reason: SuggestionReason, today: string): string {
  switch (reason.code) {
    case SUGGESTION_REASON.NEAR_STOP:
      return t.day.why.nearStop(formatDistance(reason.meters), reason.stopName);
    case SUGGESTION_REASON.AIMED_AT_DAY:
      return t.day.why.aimedAtDay(relativeDayLabel(reason.targetDate, today));
    case SUGGESTION_REASON.RECENTLY_ADDED:
      return t.day.why.recentlyAdded;
    // The whole sentence, stop name included — this is the sheet, which has the room the
    // tile does not (ADR-0151's amendment, measured).
    case SUGGESTION_REASON.FITS_DAY:
      return t.day.why.fitsDayFull(
        relativeDayLabel(reason.date, today),
        formatDistance(reason.meters),
        reason.stopName,
      );
  }
}

/**
 * The same reason on a 140px tile: the FACT ALONE, no sentence around it.
 *
 * Measured, not preferred. The tile's one line is what its height was bought with,
 * and `0.2 ק״מ ממסעדת מון` wraps to two at that width — 76px becomes 84px and the
 * tile stops being 0.88× a collapsed event row. The gap sheet names the stop
 * because its row is full-width; the tile cannot afford to and does not need to,
 * since every card on the strip is measured against the same day.
 *
 * Recency gets no line: on a strip it is chrome, not a fact worth the height.
 */
export function tileReasonText(reason: SuggestionReason, today: string): string | undefined {
  switch (reason.code) {
    case SUGGESTION_REASON.NEAR_STOP:
      return formatDistance(reason.meters);
    case SUGGESTION_REASON.AIMED_AT_DAY:
      return relativeDayLabel(reason.targetDate, today);
    case SUGGESTION_REASON.RECENTLY_ADDED:
      return undefined;
    // The day and the distance, and NOT the stop name — which wraps this line and costs the
    // tile 8px (ADR-0151's amendment, measured). `reasonText` above says the whole sentence,
    // in the sheet, which has room for it.
    case SUGGESTION_REASON.FITS_DAY:
      return t.day.why.fitsDay(relativeDayLabel(reason.date, today), formatDistance(reason.meters));
  }
}

/** **The day a `fits-a-day` proposal named**, or null when this idea carries no proposal — so a
 *  host offers the "agree" verb exactly where there is something to agree with (ADR-0151's
 *  2026-08-04 amendment). One predicate, because both shelves ask it. */
export function proposedDay(reason?: SuggestionReason): string | null {
  return reason?.code === SUGGESTION_REASON.FITS_DAY ? reason.date : null;
}

/** The tile line for the day's OWN group, which states a distance or nothing: the
 *  day an idea is aimed at would only repeat the day you are looking at
 *  (ADR-0116 §2), and recency is not worth a line on a group of two. */
export function stopReasonText(reason?: SuggestionReason): string | undefined {
  return reason?.code === SUGGESTION_REASON.NEAR_STOP ? formatDistance(reason.meters) : undefined;
}
