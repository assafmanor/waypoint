// **The lifted hero's horizon** (ADR-0160 §3), and the one question that decides
// whether it lifts at all (§9). Pure: events + bookings + places + notes in, a
// plain object out. No clock read, no zone resolution, no formatting — the caller
// owns all three, exactly as it already does for `Board`.
//
// THE SHAPE IS THE POINT. The collapsed board shows two POINTS (now, next). The
// lifted hero shows a HORIZON with depth on each point, and only three things
// count as depth, because everything else is already on the collapsed board:
// where it is, what the group wrote about it, and whether it happened.
//
// Phase 2 of the build plan: this file ships with no UI reading it. That is
// deliberate — the predicate below is the one piece of this feature that can
// silently answer "nothing to lift" on a board with plenty, so it gets tested
// on its own before anything renders it.
import { ENTITY_TYPE, EVENT_STATUS, type Booking, type Note, type Place } from '@waypoint/shared';
import type { TripEvent } from '@waypoint/shared';
import { eventPlaceId, placeName } from './places';
import { notesForHost } from './notes';

/** What a human said about this event, when they have said anything (ADR-0117 §1's
 *  third state is "nobody has answered", and it is the commonest). */
export type HeroSettled = typeof EVENT_STATUS.DONE | typeof EVENT_STATUS.SKIPPED;

/** One point on the horizon, carrying the depth the collapsed board cannot.
 *
 *  `placeId` and `bookingId` are here as well as `place` because the hero's value
 *  is partly the WAY THROUGH: the pin needs the id, the booking needs the id, and
 *  resolving them again at the render site is how two surfaces start disagreeing
 *  about which booking an event belongs to. */
export interface HeroPoint {
  event: TripEvent;
  /** Resolved display name, through the booking-authority rule (`eventPlaceId`). */
  place?: string;
  /** The way to the pin (ADR-0121's amendment §4 affordance, finally placed). */
  placeId?: string;
  /** The way through to the booking. */
  bookingId?: string;
  /** This stop's notes, newest first. Empty is the common case. */
  notes: Note[];
  /** Absent → nobody has answered yet. */
  settled?: HeroSettled;
}

/**
 * `אחר כך` — the third point, which a two-slot board cannot carry in any form.
 *
 * **This type is ADR-0160 §12's condition, encoded rather than remembered.** It is
 * one line: a title and an instant, and deliberately **no id** — so nothing can be
 * resolved from it, and no place, note, settle state or hand-off can be attached
 * without changing this interface. That edit is the moment to reread §12, whose
 * answer is that a hero growing a third slot has started competing with the Day
 * tab, and the Day tab wins.
 *
 * The title is the event's own, **not** its route: `אחר כך` is one quiet line, and
 * a route is `RouteLabel`'s flex layout rather than a string — an arrow glued
 * between two names is exactly the bidi hazard ADR-0118 is about.
 */
export interface HeroThen {
  title: string;
  startsAt: string;
}

export interface HeroHorizon {
  /** Everything in progress, primary-first — `nowAll`'s order, kept. One entry is
   *  the `now` variant; several with no primary is `group-split` (ADR-0041 §6).
   *  The caller slices; the shape does not care which variant it is feeding. */
  now: HeroPoint[];
  next?: HeroPoint;
  then?: HeroThen;
}

export interface HeroHorizonInput {
  /** The day's events, ordered as the day view orders them — used only to find the
   *  point AFTER next, so it must be the same list `deriveNow` was given. */
  events: TripEvent[];
  /** From `deriveNow` — never re-derived here, so the board and the hero cannot
   *  disagree about what is happening (ADR-0018: derived, and derived once). */
  nowAll: TripEvent[];
  nextAll: TripEvent[];
  bookings: Booking[];
  places: Place[];
  notes: Note[];
}

/** An event's notes, and the one judgement call in this file.
 *
 *  A note's host is an event OR a booking (ADR-0152), and on the booked path a note
 *  lands on the **booking** — the event is materialized server-side from a seed
 *  (ADR-0093) and has no client id to hang it on (ADR-0152's phase 5b). So a
 *  hotel's *"ask for a high room"* is hosted by the booking, and asking only for
 *  `eventId` finds nothing on exactly the events most likely to carry a note.
 *
 *  The hero therefore reads BOTH. **This diverges from `EventCard`'s mark**, which
 *  counts `eventId` alone (`DayView.tsx`) — a row would show no mark while the
 *  lifted hero shows the note. That is a real inconsistency and it is the hero's
 *  side that is right, because §3's promise is "the note about this stop", not
 *  "the note about this row". Flagged rather than silently fixed on both: changing
 *  the mark changes what every day row looks like, which is not this phase's call.
 */
function notesForEvent(event: TripEvent, notes: Note[]): Note[] {
  const own = notesForHost(notes, ENTITY_TYPE.EVENT, event.id);
  if (!event.bookingId) return own;
  // Both lists are already newest-first; concatenating keeps each host's order and
  // puts the event's own first, which is the more specific of the two.
  return [...own, ...notesForHost(notes, ENTITY_TYPE.BOOKING, event.bookingId)];
}

function toPoint(event: TripEvent, input: HeroHorizonInput): HeroPoint {
  const booking = event.bookingId
    ? input.bookings.find((b) => b.id === event.bookingId)
    : undefined;
  const placeId = eventPlaceId(event, booking);
  return {
    event,
    placeId,
    place: placeName(input.places, placeId),
    bookingId: booking?.id,
    notes: notesForEvent(event, input.notes),
    settled: event.status === EVENT_STATUS.PLANNED ? undefined : (event.status as HeroSettled),
  };
}

/** The first event starting strictly after the `next` cluster — `אחר כך`.
 *
 *  Keyed off `nextAll`'s start rather than the clock, so the third point is
 *  genuinely the one after the second and not merely "soon": several events can
 *  share the next start (ADR-0041's cluster), and all of them are `next`. */
function thenAfter(input: HeroHorizonInput): HeroThen | undefined {
  const nextStart = input.nextAll[0]?.startsAt;
  if (!nextStart) return undefined;
  const after = input.events
    .filter((e) => e.startsAt && Date.parse(e.startsAt) > Date.parse(nextStart))
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))[0];
  return after?.startsAt ? { title: after.title, startsAt: after.startsAt } : undefined;
}

export function heroHorizon(input: HeroHorizonInput): HeroHorizon {
  return {
    now: input.nowAll.map((e) => toPoint(e, input)),
    next: input.nextAll[0] ? toPoint(input.nextAll[0], input) : undefined,
    then: thenAfter(input),
  };
}

/**
 * **Is there anything to lift?** (ADR-0160 §9.) Derived, never a `variant` check —
 * the hero lifts when the expanded state carries something the collapsed one
 * cannot, and a tap that would open nothing gets the rebuff instead.
 *
 * Two things this encodes that are easy to get wrong, and one of them looks like a
 * contradiction in the ADR until you write it down:
 *
 * **§9 and §10 do not conflict.** §9 says the trigger is derived; §10 says `free`
 * does not lift. Both hold without a variant test, because "nothing is happening"
 * is itself derivable: with no `now` point there is no current thing to add depth
 * to, and the answer to "what could we do instead" is `GlanceCard`, two inches
 * further down Home. So an empty `now` is the whole of `free`'s case.
 *
 * **The settle verbs deliberately do not count.** Every event is settleable rather
 * than only the passed ones (ADR-0139 §2 — that is what keeps undo reachable), so
 * counting them would make this function `true` for every board with a now event,
 * and the rebuff would only ever fire on `free`. §9 is explicit that a valid `now`
 * board with no note, place, code or sibling has the same nothing to open. The
 * reason is the brief's own test: a lift that reveals two buttons and no new
 * information is animation for its own sake, and those two buttons are already on
 * `EventCard` one tab away.
 */
export function canLift(horizon: HeroHorizon): boolean {
  if (horizon.now.length === 0) return false;
  const hasDepth = (p: HeroPoint) => !!p.place || p.notes.length > 0 || !!p.bookingId;
  return (
    horizon.now.length > 1 ||
    horizon.now.some(hasDepth) ||
    (horizon.next ? hasDepth(horizon.next) : false) ||
    !!horizon.then
  );
}
