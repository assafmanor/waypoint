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

/**
 * The pool, ranked (ADR-0116 session-202 §3). `shelfGroups` above is untouched:
 * this reorders what it already grouped and attaches each idea's reason. It goes
 * through `suggestFor`, never through a strategy — the shelf does not know
 * `near-the-day` exists, which is what makes the second strategy a registration
 * (ADR-0151 §2).
 *
 * `stops` is the anchor to rank against: the day's own stops for the shelf, the
 * events either side of a slot for the gap sheet. Same strategy, narrower context.
 */
export function rankIdeas(
  ideas: MaybeItem[],
  places: Place[],
  date: string,
  stops: SuggestionStop[],
  limit?: number,
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
  }
}

/** The tile line for the day's OWN group, which states a distance or nothing: the
 *  day an idea is aimed at would only repeat the day you are looking at
 *  (ADR-0116 §2), and recency is not worth a line on a group of two. */
export function stopReasonText(reason?: SuggestionReason): string | undefined {
  return reason?.code === SUGGESTION_REASON.NEAR_STOP ? formatDistance(reason.meters) : undefined;
}
