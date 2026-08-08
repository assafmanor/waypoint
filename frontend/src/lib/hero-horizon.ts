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
import {
  ENTITY_TYPE,
  EVENT_STATUS,
  type Booking,
  type DocumentAttachment,
  type DocumentSummary,
  type Note,
  type Place,
} from '@waypoint/shared';
import type { TripEvent } from '@waypoint/shared';
import { eventPlaceId, placeName } from './places';
import { notesForContext } from './notes';
import { attachmentsForContext, documentsForAttachments } from './attachments';
import { resolveHostContext, type HostContextIndex } from './host-context';

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
  /** **The files attached to this stop** (ADR-0174 §6), resolved through the SAME context the
   *  notes above are — which is the whole of why they are here and not derived at the render
   *  site. The hero reads a booked event's notes from its BOOKING as well as the event,
   *  because a booked event is materialized server-side and has no client id at save time
   *  (ADR-0160 §I / ADR-0172 §7); attachments have exactly that shape, so resolving them
   *  anywhere else is how the hero and the day row start disagreeing about what a point
   *  carries.
   *
   *  Already filtered by ADR-0173 §6's visibility rule and collapsed per document, because
   *  `documentsForAttachments` owns both — this adds a pointer and no permission. */
  documents: DocumentSummary[];
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
  /** The event whose SPAN you are currently inside, when there is one — a flight in the
   *  air, a train under way (`deriveHeroBooking`'s in-transit event, never re-derived
   *  here; ADR-0018).
   *
   *  It changes exactly one thing, and it is a correction rather than a feature
   *  (session 215): that point's place resolves to where it is **going**. The authority
   *  rule gives a transport booking its ORIGIN, which is right everywhere else and wrong
   *  in exactly this state — mid-flight the lifted hero was offering `במפה` and `ניווט`
   *  to the airport you took off from. */
  midSpanEventId?: string;
  /** From `deriveNow` — never re-derived here, so the board and the hero cannot
   *  disagree about what is happening (ADR-0018: derived, and derived once). */
  nowAll: TripEvent[];
  nextAll: TripEvent[];
  bookings: Booking[];
  places: Place[];
  notes: Note[];
  /** The trip's attachment links and the document list THIS READER can see — both, because
   *  the resolution is what enforces §6's visibility and nothing downstream re-checks it. */
  attachments: DocumentAttachment[];
  documents: DocumentSummary[];
  /** Trip-state's one context index (ADR-0172 §1). Passed rather than rebuilt here: the
   *  place half of it needs the WHOLE trip's references, and this input carries one day's. */
  hostContexts: HostContextIndex;
}

function toPoint(event: TripEvent, input: HeroHorizonInput): HeroPoint {
  const booking = event.bookingId
    ? input.bookings.find((b) => b.id === event.bookingId)
    : undefined;
  // Inside the span → the place that matters is the destination; everywhere else the
  // authority rule's own answer stands.
  const placeId = eventPlaceId(event, booking, event.id === input.midSpanEventId);
  // **ONE context, both content types.** Resolved once and read twice, deliberately: the
  // union that used to be this file's own judgement call is now the app's rule (ADR-0172 §7),
  // and two calls is how the note list and the document list would start answering about
  // different hosts on the one row where it matters — a booked event.
  const context = resolveHostContext(input.hostContexts, {
    kind: ENTITY_TYPE.EVENT,
    id: event.id,
  });
  return {
    event,
    placeId,
    place: placeName(input.places, placeId),
    bookingId: booking?.id,
    notes: notesForContext(input.notes, context),
    documents: documentsForAttachments(
      attachmentsForContext(input.attachments, context),
      input.documents,
    ).map((row) => row.document),
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
 * **Is there anything to lift?** Derived, never a `variant` check — the hero lifts
 * when the expanded state carries something the collapsed one cannot.
 *
 * **This no longer requires anything to be IN PROGRESS**, and that is an owner
 * correction from real use (2026-08-03): _"it does lift but only when there's an
 * event happening"_. The first version returned false on an empty `now`, reasoning
 * that with no current thing there was nothing to add depth to, and reading ADR-0160
 * §10's "`free` does not lift" as covering it. Both were wrong in the same way —
 * they conflated **nothing is happening now** with **nothing to show**:
 *
 * - A **gap** is most of a real day. The board sits there un-pressable while the
 *   horizon in fact holds `הבא בתור` with its place, its note and its booking reach,
 *   plus `אחר כך`. That is arguably the moment the lift is worth the most: free now,
 *   so what is next and where is it.
 * - §10's argument was about the **shelf** — `GlanceCard` answers "what could we do
 *   instead". It was never about "where is the next thing", which no other surface
 *   on Home answers.
 *
 * So the question is only ever "does the lifted state add anything", asked of the
 * whole horizon. **A `false` here is now a REBUFF rather than silence** (ADR-0160 §Q,
 * reversing §A): the case is rare, which is not the same as unremarkable, and a press that
 * produces nothing at all reads as a dead surface. The board answers with the beat Plan's
 * prep hero plays and stays exactly where it is — so this predicate decides which of two
 * answers a press gets, never whether a press is answered.
 *
 * **The settle verbs still deliberately do not count.** Every event is settleable
 * rather than only the passed ones (ADR-0139 §2 — that is what keeps undo
 * reachable), so counting them would make this true for every board with a now
 * event. The brief's own test is why: a lift that reveals two buttons and no new
 * information is animation for its own sake, and those buttons are on `EventCard`
 * one tab away.
 */
export function canLift(horizon: HeroHorizon): boolean {
  // An attached document is depth (ADR-0174 §6), and adding it here is not a formality: a
  // point whose ONLY depth is a boarding pass would otherwise answer "nothing to lift" and
  // take the rebuff — the board refusing to open onto the one thing it now has to show.
  const hasDepth = (p: HeroPoint) =>
    !!p.place || p.notes.length > 0 || p.documents.length > 0 || !!p.bookingId;
  return (
    horizon.now.length > 1 ||
    horizon.now.some(hasDepth) ||
    (horizon.next ? hasDepth(horizon.next) : false) ||
    !!horizon.then
  );
}
