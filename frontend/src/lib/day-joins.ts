// **What sits between two consecutive rows of the day** (ADR-0159).
//
// Two answers, and they are opposites. A **gap** is absence — free time, the same hole
// Plan mode already draws as a `שבץ` chip, read here through the same `gapBetween` and
// the same `GAP_MIN_MINUTES` so the two modes cannot disagree about what a hole IS; only
// about what you can do with it. A **connection** is presence: the two rows are legs of
// one journey (`connectionMinutes`, `@waypoint/shared`), you are inside a commitment for
// the whole of it, and nothing about it is free. It therefore ignores the gap floor — a
// 12-minute change of train is the join you most need to see and the one no free-time
// threshold would ever surface.
//
// Pure: no clock, no React. The day view hands it entries and gets back what to draw.
import {
  connectionMinutes,
  edgeMeaning,
  freeAfterTravel,
  isTightConnection,
  TRAVEL_FIT,
  windowBoundOf,
  type Booking,
  type BookingType,
  type BookingWhen,
  type TravelFit,
  type TravelWindow,
  type TripEvent,
} from '@waypoint/shared';
import { MS_PER_MINUTE, MS_PER_SECOND, SECONDS_PER_MINUTE } from '../constants';
import { gapBetween, type Gap } from './gaps';
import { heroLeaveBy } from './hero-travel';
import { isoToTimeInput, zonedIso } from './time';
import { routeEndpointDay } from './place-usage';
import type { DayEntry } from './day-entries';
import { groupEndEvent, groupStartEvent } from './day-entries';

export type DayJoin =
  | {
      kind: 'gap';
      minutes: number;
      /** **The free time here, and the slot a fill lands on** (ADR-0161 §9) — `gapBetween`'s
       *  own `Gap`, which the strip used to derive and throw away. Carried whole because Trip
       *  mode's gap is tappable now: the tap has to open the SAME slot Plan mode's chip offers
       *  (two derivations of "where does this drop land" is what §2 collapsed into one), and
       *  the ROOM is what caps a category's length there (§5). */
      free: Gap;
    }
  | {
      kind: 'connection';
      minutes: number;
      /** Where you wait. Absent when the endpoint has no place picked. */
      stopPlaceId?: string;
      /** Short by this transport mode's own measure (`isTightConnection`). */
      tight: boolean;
      /** Which mode, because the word differs: a train changes, a flight stops over. */
      type: BookingType;
    };

export interface JoinContext {
  bookings: readonly Booking[];
  /** When each booking happens — `bookingWhen(events)`, the one provider (ADR-0159). */
  when: BookingWhen;
  /** The day's base zone, for the gap arithmetic `gapBetween` already does. */
  tz: string;
}

const bookingOf = (event: TripEvent, bookings: readonly Booking[]) =>
  event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;

/**
 * The join between two consecutive events, or `null` when there is nothing to say.
 *
 * A connection is asked first and wins outright: two legs of one journey are never
 * "free time", however long the wait, and asking the gap rule first would label a
 * seven-hour layover as an empty afternoon.
 */
export function joinBetween(prev: TripEvent, next: TripEvent, ctx: JoinContext): DayJoin | null {
  const from = bookingOf(prev, ctx.bookings);
  const to = bookingOf(next, ctx.bookings);
  if (from && to) {
    const minutes = connectionMinutes(from, to, ctx.when);
    if (minutes != null) {
      return {
        kind: 'connection',
        minutes,
        stopPlaceId: from.toPlaceId ?? undefined,
        tight: isTightConnection(from.type, minutes),
        type: from.type,
      };
    }
  }
  const gap = gapBetween(prev, next, ctx.tz);
  return gap ? { kind: 'gap', minutes: gap.minutes, free: gap } : null;
}

/** One row of the day, with whatever sits above it. */
export interface DayBlockEntry {
  entry: DayEntry;
  /** Its index in the merged list — what the now-line is placed against. */
  index: number;
  /** The join between the previous row and this one; absent on the first. */
  join?: DayJoin;
  /** **The row above this one, whenever there is one** (ADR-0206 §V1.3) — the leg's first point,
   *  so a surface can ask what the journey across this hole costs without walking the list a
   *  second time and risking a different answer about which rows are adjacent. Recorded here
   *  rather than re-derived because `dayBlocks` is the one place that knows: `prevEnd` is what a
   *  flexible edge is transparent to (ADR-0171 §5), and a second walk would have to reproduce
   *  that rule to agree with the join beside it.
   *
   *  **Set independently of `join`, and that is the fix for a silence §Z5 §M2 forbade.** A hole
   *  under `GAP_MIN_MINUTES` — including a zero-length one, two rows that touch — produces no
   *  `gap` join at all, because `gapBetween` is floored. The JOURNEY in it is still real: _"a
   *  45-minute hole holding a 40-minute walk"_ is the case that ADR said must not stay silent, and
   *  gating the leg on the floored gap is exactly how it stayed silent. The floor decides whether
   *  free time is worth STATING; it has never had anything to say about travel. */
  from?: TripEvent;
}

/** A run of rows drawn as one thing. `journey: true` means every entry after the first
 *  is joined by a connection, so the whole run renders inside one container with the
 *  bands between its legs — which is the design's answer to "a mark that sits between
 *  two cards has nothing to hold onto" (ADR-0159 §3). */
export interface DayBlock {
  entries: DayBlockEntry[];
  journey: boolean;
}

/**
 * Group the day's entries into blocks, computing each join once.
 *
 * **Adjacency is the same rule Plan uses for its gap chips**: joins are measured between
 * consecutive EVENT entries, and a leaf group at that — a cluster is two things at once,
 * so "the gap after it" is not a single fact, and a transition point (ADR-0064 §B)
 * neither opens nor closes one.
 *
 * **What differs since ADR-0171 §5 is what a transition does to the row AFTER it.** It
 * still starts a new block, but a **flexible** edge no longer ends the measurement: free
 * time is time between commitments, and a check-out "by 11:00" consumes no particular
 * hour. Before this, any transition nulled `prevEnd`, so a check-in sitting between two
 * flight legs suppressed the join between them entirely — no gap AND no connection band
 * could be derived for that window at all, which is how a misplaced row was also hiding
 * a layover. **This rule now carries that fix on its own**: ADR-0184's 2026-08-13
 * amendment puts every edge back in the list, so the floor no longer leaves before this
 * runs and the transparency test here is the only thing keeping a check-in from splitting
 * two legs apart.
 */
export function dayBlocks(entries: readonly DayEntry[], ctx: JoinContext): DayBlock[] {
  const blocks: DayBlock[] = [];
  let prevEnd: TripEvent | null = null;

  entries.forEach((entry, index) => {
    const leaf = entry.kind === 'event' && entry.group.kind !== 'cluster';
    const start = leaf ? groupStartEvent(entry.group) : null;
    const join = prevEnd && start ? (joinBetween(prevEnd, start, ctx) ?? undefined) : undefined;
    const from = start ? (prevEnd ?? undefined) : undefined;
    const last = blocks[blocks.length - 1];
    // A connection continues the block above it; everything else starts a new one.
    if (join?.kind === 'connection' && last && last.entries.length > 0) {
      last.journey = true;
      last.entries.push({ entry, index, join, from });
    } else {
      blocks.push({ entries: [{ entry, index, join, from }], journey: false });
    }
    // **A flexible edge is TRANSPARENT to the measurement** (ADR-0171 §5). Free time is
    // time between commitments, and a check-out "by 11:00" does not consume a particular
    // hour — so it neither bounds a gap nor hides one. Everything else still ends the
    // run: an exact transition IS a moment, and a cluster is two things at once, so "the
    // gap after it" is not a single fact.
    if (entry.kind === 'event') prevEnd = groupEndEvent(entry.group);
    else if (edgeMeaning(entry.event, entry.edge) === 'exact') prevEnd = null;
  });

  return blocks;
}

/** A place where one leg hands over to the next, on a given day. Two dates can name the
 *  same stop — an overnight connection arrives on one and leaves on the next — and both
 *  are true of it, so both are listed. */
export interface ConnectionStop {
  placeId: string;
  date: string;
  minutes: number;
  tight: boolean;
  type: BookingType;
}

/** The key a surface looks a stop up by: a place is only a connection **on the day the
 *  connection happens**. Without the date, an airport you change planes at on the way
 *  out would still claim to be a layover on the day you fly home from it. */
export const connectionStopKey = (placeId: string, date: string) => `${placeId}|${date}`;

/**
 * **Every connection stop in the trip**, from the same rule the day list draws its bands
 * from (`connectionMinutes`) — so the Map's pin, the Map's row and the day's band cannot
 * disagree about whether a place is a stop or where you are simply landing (ADR-0141's
 * property, extended by ADR-0159).
 *
 * O(n²) over bookings and deliberately so: a trip has a handful, and the alternative is
 * an index keyed by place that would have to be kept in step with two mutable lists.
 */
export function connectionStops(
  bookings: readonly Booking[],
  events: readonly TripEvent[],
  when: BookingWhen,
): ConnectionStop[] {
  // **THE DAY THE LEG ENDS, not the day it began** (2026-08-06). `dateOf` read the event's own
  // `date`, which for an overnight inbound leg is the day you took OFF — so a layover you sit
  // through at 02:00 was filed under the previous day, when you were at the origin airport. The
  // two dates this function means to list are named in its own doc ("arrives on one and leaves
  // on the next"): the **arrival** of the leg that brings you in, and the **departure** of the
  // one that takes you out. `routeEndpointDay` is the same rule `spanDays` and `placeRefs` read,
  // so a third derivation of "which day does this end happen on" cannot drift from the other two.
  const dateOf = (booking: Booking, edge: 'start' | 'end') => {
    const event = events.find((e) => e.bookingId === booking.id);
    return event ? routeEndpointDay(event, edge)?.date : undefined;
  };
  const stops: ConnectionStop[] = [];
  for (const from of bookings) {
    for (const to of bookings) {
      const minutes = connectionMinutes(from, to, when);
      if (minutes == null || !from.toPlaceId) continue;
      const dates = [
        ...new Set([dateOf(from, 'end'), dateOf(to, 'start')].filter(Boolean) as string[]),
      ];
      for (const date of dates) {
        stops.push({
          placeId: from.toPlaceId,
          date,
          minutes,
          tight: isTightConnection(from.type, minutes),
          type: from.type,
        });
      }
    }
  }
  return stops;
}

// ── THE JOURNEY IN A HOLE (ADR-0206 §V1.1 / §V1.3 / §V1.4) ────────────────────────────────
//
// A gap is absence and a connection is presence — and a **journey** is the third thing that can
// be true of one slot (§D2's "one slot, three meanings"). It is not a fourth `DayJoin` kind: it
// ABSORBS the gap rather than sitting beside it (§Z5 §M2, measured at ⁦58px⁩ against ⁦87px⁩ for a
// strip plus a block), so the slot still holds one object, which is ADR-0159's own rule.
//
// Clock-injected like everything else here: instants and seconds in, a discriminant out. What it
// SAYS is `i18n/he.ts`'s and `JourneyBlock`'s.

/** **Which of the four things is true of this hole.** A discriminant rather than three booleans,
 *  for `LEAVE_PHASE`'s own reason: the states are exclusive, and a caller branching on
 *  `passed && !onWay` is one negation away from drawing two of them. */
export const DAY_JOURNEY_ARM = {
  /** The hole is behind you — the row below it has already started. A record, so it states the
   *  measurement and nothing else. */
  PAST: 'past',
  /** **The journey does not fit the hole at all** — `freeAfterTravel`'s third `fit`, which the
   *  shared derivation has answered since M2 and nothing rendered until it was reported. It says
   *  the shortfall rather than a leave-by, and it outranks every clock arm below: "this cannot be
   *  done" is a fact about the PLAN, it does not decay as the hour passes, and it is what you act
   *  on. Without it an infeasible leg reads `פנוי לפני 0 דק׳` — nought minutes of free time,
   *  where the truth is a journey nobody can make. */
  OVERRUNS: 'overruns',
  /** Ahead of the leave-by, or not yet claimable: the journey and when to go. */
  AHEAD: 'ahead',
  /** The leave-by has gone by and nothing has withdrawn that (§V1.4). `--miss`. */
  PASSED: 'passed',
  /** Somebody said `בדרך`, or a fix puts them along the leg (ADR-0207 §2). Teal. */
  ON_WAY: 'on-way',
  /** **Somebody declared this leg תחב״צ** (ADR-0206 §AA4). Its own arm rather than an absence,
   *  because the block still has to RENDER — §AA4 is explicit that the declaration "suppresses the
   *  duration and keeps the distance", and it is also the only thing carrying the mode control, so
   *  a hole that vanishes on declaration is a door that does not open again. Neutral tone: there is
   *  nothing wrong with this leg, we simply do not estimate it. */
  DECLARED: 'declared',
  /** **The number is on its way** (ADR-0206 §AU1). Its own arm rather than an absence, because the
   *  absence is what was reported: a stop added to the day had no journey row at all — no
   *  duration, no distance, and **no mode control**, since the block that carries it is the thing
   *  that did not render — until the app was left and reopened. §D4 says the reader must not be
   *  able to tell "not computed" from "not computable", and this is the state that rule never
   *  covered: it is neither, it is *being* computed, and it resolves into a visible event a few
   *  seconds later. §AT already made that argument once for the local cache read; this is the same
   *  argument for the network one.
   *
   *  Ranked BELOW `DECLARED` and `TOO_FAR`, which are both facts that will not change, and ABOVE
   *  the floor beneath them, which bails on exactly the missing estimate this arm exists to
   *  explain. Quiet by nature: it says the mode, the crow-flies distance and that the time is
   *  coming, and it claims nothing about the hole (§V1.1's rule — never a guess we did not
   *  measure). */
  WARMING: 'warming',
  /** **The mode somebody CHOSE cannot cover this leg** (ADR-0206 §AM10) — a walk over walking's
   *  ⁦15 km⁩ ceiling, a cycle over cycling's ⁦20 km⁩. Its own arm for `DECLARED`'s exact reason and
   *  then one more: the gate refuses it, so there is no estimate and the block vanished — taking
   *  the mode control with it, which made the override irreversible on the surface that set it
   *  (field report, 2026-08-27: _"I changed a drive to a walk and the route simply disappeared"_).
   *
   *  **Not neutral like `DECLARED`, and that is the difference between the two.** A declaration
   *  says "do not estimate this"; this says "what you asked for cannot be done", which is a fact
   *  about the PLAN in the same family as `OVERRUNS` — so it says the ceiling in words and takes
   *  the miss tone. It outranks the clock arms for the same reason `OVERRUNS` does. */
  TOO_FAR: 'too-far',
} as const;
export type DayJourneyArm = (typeof DAY_JOURNEY_ARM)[keyof typeof DAY_JOURNEY_ARM];

export interface DayJourney {
  arm: DayJourneyArm;
  /** What the leg costs, in seconds, on the mode that was asked about — and `null` on the three
   *  arms where there is no estimate to read: `DECLARED`, which is never asked (§AA4), `TOO_FAR`,
   *  which the gate refuses (§AM10), and `WARMING`, which has not been answered **yet** (§AU1).
   *  The first two are permanent and the third is not, which is the whole difference between them
   *  and why the third says so out loud. Every other arm has one: a leg with no estimate is no
   *  journey at all (§D4), which is what makes these three the only nulls. */
  travelSeconds: number | null;
  /** What the leg covers, in metres — the ROUTED distance, per mode, never crow-flies: a
   *  ⁦1.9km⁩ crow-flies leg is a ⁦2.4km⁩ walk, and this is the number you act on. `null` where the
   *  estimate carries none. */
  distanceMeters: number | null;
  /** The instant behind `יציאה 17:15`, or `null` on the `PAST` arm — see {@link dayJourney}. */
  leaveByMs: number | null;
  /** What is free once the journey is counted (§V1.1). `null` where the hole has no measurable
   *  window at all, which is the day's first leg out of an ambient stay. */
  free: TravelWindow | null;
  /** **By how much the journey misses**, in seconds, on the `OVERRUNS` arm — `null` elsewhere.
   *  The number to act on is the shortfall, not the zero that clamping leaves behind. */
  overrunSeconds: number | null;
  /**
   * **WHAT THE DAY PREDICTS YOU WILL ARRIVE AT** (ADR-0206 §AI) — `null` wherever the leave-by is
   * the statement, which is the ordinary case and most of the app.
   *
   * It exists because a departure is not always something the app may name. Two ways it is not:
   * the destination has no **deadline** to count back from (a check-in window's opening is a
   * floor, so counting back from it advises leaving in time to arrive the instant the door opens),
   * or the departure it computes lands **inside the row it leaves from**. Either way the honest
   * statement is when you will get there, given when you can go.
   */
  arriveAtMs: number | null;
  /** **True where that arrival lands after the destination's window has SHUT** — the one thing
   *  nobody can currently be warned about at plan time (`hero-booking.ts`'s own `missed` fires off
   *  the clock, once it is already too late).
   *
   *  It rides the `OVERRUNS` arm rather than a sixth one, and that falls out of the fit measuring
   *  to the close: missing the close and not fitting the window are the same fact. What it changes
   *  is the SENTENCE — "you will get there after it shuts" is what you act on, where the generic
   *  shortfall makes you work out why. */
  arrivesAfterClose: boolean;
  /** **What is LEFT of the journey**, on the `ON_WAY` arm (ADR-0207 §6) — scaled by the remaining
   *  crow fraction rather than re-routed, and `null` where that ratio is noise. The stale total is
   *  not more honest here but less: it reads as "44 minutes still to walk" two minutes from the
   *  door. `null` on every other arm, where the leg's own total is the question. */
  remainingSeconds: number | null;
}

/**
 * **What a hole says once there is a journey in it.**
 *
 * `null` when there is no estimate, and that is the ordinary answer (§D4): offline, refused by the
 * gate, over the ceiling, still warming, provider down, or two stops that are one place. **A leg
 * somebody declared תחב״צ is NOT one of them** — it has no estimate either, but it is a statement
 * rather than a gap, so it takes the `DECLARED` arm above and renders (§AA4). Every one of them leaves ADR-0159's free-time strip standing
 * exactly as it reads today — never a pessimistic guess, because the reader must not be able to
 * tell "not computed" from "not computable" and inventing a walk we did not measure fails that in
 * the direction that costs somebody their afternoon.
 *
 * **The leave-by is `heroLeaveBy`'s, not a second copy** (§AE7's argument applied one level up):
 * the board, the lifted hero and this row all describe one journey, so the buffer, the rounding
 * and the sign have to come from one function or the day will tell you to leave at a different
 * minute than the board does. What the day ignores is that function's `LIVE` arm — the ⁦30⁩-minute
 * swap is the countdown TILE's question and this row has no tile.
 *
 * **Four arms, and `PAST` is the one the ADR did not name.** Without it a day list read at 22:00
 * prints `זמן היציאה עבר` on every hole of the day, because every leave-by of a finished day has
 * gone by — which is true and useless. A hole whose next row has already started is a **record**:
 * it keeps the measurement and the corrected free time and drops the leave-by and the mark, since
 * both are advice about a departure nobody is about to make.
 *
 * **`departAfterMs` may be absent, and then there is no free-time half.** That is the day's first
 * leg, out of the stay you woke in (§AD): an ambient stay has no check-out instant on a middle
 * night, and reaching for the day window's dawn instead would claim you could have left at 07:00.
 * The journey and the leave-by are still facts; what is free before it is not one we have.
 */
export function dayJourney(input: {
  /** The earliest the journey may leave — the previous row's end. Absent for the day's first leg. */
  departAfterMs?: number;
  /** When you have to be there: the next row's own start. */
  arriveByMs: number;
  /** The estimate for the leg, or `null` (§D4). */
  travelSeconds: number | null;
  distanceMeters?: number | null;
  nowMs: number;
  /** **Somebody said `בדרך`, or a fix put them on the leg** (§Z5 §M4 / ADR-0207 §2). Withdraws
   *  the mark on both elevations at once, because both read the same module. */
  onWay?: boolean;
  /** What is left of the leg, where a fix says the traveller is on it (ADR-0207 §6). Computed by
   *  the caller from `remainingTravelSeconds`, because the fix is the SCREEN's — this file holds no
   *  position and issues no request (§1). */
  remainingSeconds?: number | null;
  /** **The destination has no deadline** (ADR-0206 §AI1) — its start edge is not `exact`, which
   *  `isExactEdge` answers and the caller asks, because this file holds instants and cannot see an
   *  event. A check-in's `17:00` is the hour the door OPENS; counting back from it invents a
   *  deadline nobody set, and then marks you late against it. Withholding the printed clock is not
   *  enough — the arm is what paints `--miss` and what the board reads for `באיחור` — so this
   *  withdraws the leave-by itself, which is ADR-0208's shape: the measurement stands, the advice
   *  is not given. */
  flexibleArrival?: boolean;
  /** Where that flexible arrival is a **closed** window, the instant it shuts
   *  (`windowBoundOf(event, 'start')`, ADR-0184). Absent on an open floor, which can be missed by
   *  nothing. */
  windowClosesMs?: number;
  /** **The plan's claim about where you are, when it has been denied** (ADR-0208 §2) — a skipped
   *  origin. It removes the CLAIM (the leave-by, the mark) and leaves the MEASUREMENT standing:
   *  the hole is still the hole and the walk is still in it, so §V1.1's correction is not a claim
   *  about the traveller and does not need standing up. See ADR-0206 §AF2 for why this surface
   *  gates the claim where the hero gates the request. */
  claimDenied?: boolean;
  /** **Somebody declared this leg תחב״צ** (ADR-0206 §AA4). Given, the estimate is not consulted at
   *  all: the leg keeps its distance and says it has no time, which is the whole declaration. */
  declared?: boolean;
  /** **The mode chosen for this leg is past that mode's ceiling** (ADR-0206 §AM10) —
   *  `DayTravelReads.refusedFor`. Like `declared` the estimate is not consulted, because the gate
   *  guarantees there will never be one; unlike `declared` it is a problem with the plan and says
   *  so. Ranked BELOW the declaration, since a declared leg is never asked about and so can never
   *  be refused. */
  tooFarForMode?: boolean;
  /** **The estimate for this leg is still being computed** (ADR-0206 §AU1) —
   *  `DayTravelReads.warmingFor`. Ranked last of the three no-estimate flags, because it is the
   *  only one of them that is temporary: a declared leg is never asked and a refused one is never
   *  coming, so either of those being true makes this one irrelevant rather than merely lower. */
  warming?: boolean;
}): DayJourney | null {
  const { departAfterMs, arriveByMs, travelSeconds, nowMs, onWay, claimDenied } = input;
  // **A declared leg is a journey with no duration, not an absent journey** (ADR-0206 §AA4). It
  // has to come BEFORE the floor below, because every one of those bails on exactly the missing
  // estimate the declaration guarantees — and a hole that renders nothing also renders no mode
  // control, so the declaration would be irreversible on the surface that made it.
  if (input.declared)
    return {
      arm: DAY_JOURNEY_ARM.DECLARED,
      travelSeconds: null,
      distanceMeters: input.distanceMeters ?? null,
      leaveByMs: null,
      // No estimate means the hole reads exactly as it read before any of this existed (§V1.1's
      // own rule): never a pessimistic guess about a journey nobody measured.
      free: null,
      overrunSeconds: null,
      arriveAtMs: null,
      arrivesAfterClose: false,
      remainingSeconds: null,
    };
  // **A REFUSED MODE IS AN ANSWER, NOT AN ABSENCE** (ADR-0206 §AM10). Same position and the same
  // argument as the declaration above — it has to come BEFORE the floor, because the floor bails
  // on exactly the missing estimate the gate guarantees, and a hole that renders nothing renders
  // no mode control, so the ⁦40 km⁩ walk somebody picked by mistake could not be picked back.
  // The distance is the caller's crow-flies fallback: there is no route to take a routed one from.
  if (input.tooFarForMode)
    return {
      arm: DAY_JOURNEY_ARM.TOO_FAR,
      travelSeconds: null,
      distanceMeters: input.distanceMeters ?? null,
      leaveByMs: null,
      // No estimate, so no correction to make — §V1.1's rule, exactly as the declaration takes it.
      free: null,
      overrunSeconds: null,
      arriveAtMs: null,
      arrivesAfterClose: false,
      remainingSeconds: null,
    };
  // **A NUMBER ON ITS WAY IS NOT AN ABSENT NUMBER** (ADR-0206 §AU1). Third of the three flags that
  // stand in for a missing estimate, and last for the reason its docblock gives — but still BEFORE
  // the floor below, which bails on exactly the `null` this arm exists to explain. That bail is
  // what deleted the row, and with it the mode control, on every leg the server had not answered
  // yet: the reader could not see that a route was coming, and could not pick a different mode to
  // get one sooner.
  if (input.warming)
    return {
      arm: DAY_JOURNEY_ARM.WARMING,
      travelSeconds: null,
      // **No distance either, and that is §AM10's rule rather than an omission.** It already drew
      // this exact line: a refused mode falls back to the crow "…not for a PENDING one, which is
      // the distinction that keeps §D4 intact: there we genuinely do not know yet, and a
      // crow-flies number that later becomes a routed one is a figure that changes under the
      // reader." The day's TOTAL reads these journeys (`dayTravelTotal`), so a crow number here
      // would also make the header climb as each leg lands. The mode and the word are the row.
      distanceMeters: null,
      leaveByMs: null,
      // **No correction to the hole, and that is §V1.1's own rule rather than a shortcut.** We do
      // not know the number yet, and subtracting a guess from the free time would be exactly the
      // pessimistic invention §D4 forbids — in the direction that costs somebody their afternoon.
      free: null,
      overrunSeconds: null,
      arriveAtMs: null,
      arrivesAfterClose: false,
      remainingSeconds: null,
    };
  // **A journey the ladder cannot state is not a journey** (2026-08-26). `ROUTE_MIN_CROW_M` is
  // ⁦10m⁩, so a ⁦20m⁩ hop is routed, answers ⁦24⁩ seconds, and drew a whole block reading `~0 דק׳` over
  // `אין זמן לדרך` — a warning about the time it takes to walk out of a door. The floor is the
  // display's own: below half a minute ADR-0114's minutes rung rounds to nothing, and a block
  // whose head cannot name a length has nothing to say.
  if (travelSeconds === null || !Number.isFinite(travelSeconds)) return null;
  if (Math.round(travelSeconds / SECONDS_PER_MINUTE) < 1) return null;
  if (!Number.isFinite(arriveByMs)) return null;
  const measurableFrom = departAfterMs !== undefined && Number.isFinite(departAfterMs);
  // **The clamp is `heroLeaveBy`'s now** (ADR-0206 §AJ3): it was implemented here and nowhere
  // else, so the board — reading the same function's unclamped answer — marked a traveller late
  // for a departure this surface was correctly printing as the origin's own end.
  const leave = heroLeaveBy({
    arriveByMs,
    travelSeconds,
    nowMs,
    ...(measurableFrom ? { departAfterMs: departAfterMs! } : {}),
  });
  if (!leave) return null;
  /**
   * **THE DEADLINE THIS LEG ACTUALLY HAS, and `undefined` where it has none** (ADR-0206 §AI1/§AJ1).
   *
   * An exact start IS the deadline. A **closed** window's is the moment it shuts — measuring to its
   * opening said `אין זמן לדרך` about a check-in you had three more hours to make. And an **open
   * floor has no deadline at all**: `מ-15:00` is the hour you may arrive AFTER, so nothing can be
   * late for it and nothing can fail to fit inside it.
   *
   * §AI1 fixed the first two and left this line reading `: arriveByMs`, written down at the time as
   * _"a floor with no close keeps the opening, which is all the app knows about it"_. The opening is
   * exactly the wrong half. Reported off that deploy, on the day BEFORE the one §AI1 was written
   * for: the last flight of day 1 lands at 23:20 into a hotel open from 15:00, so the fit measured a
   * 1:42 drive against a deadline **eight hours behind its own origin** and called the one leg of
   * the day nobody can be late for impossible.
   */
  const deadlineMs = input.flexibleArrival === true ? input.windowClosesMs : arriveByMs;
  // No deadline means no window to be free inside, so there is no free-time half and no fit — the
  // same structural absence the day's first leg out of a bed reports (§AF3), for the same reason.
  const free =
    measurableFrom && deadlineMs !== undefined
      ? freeAfterTravel(departAfterMs!, deadlineMs, travelSeconds)
      : null;
  /**
   * **WHETHER THE APP WILL ADVISE A DEPARTURE AT ALL** — an EXACT start is the only deadline it
   * will count back from (§AI1). A window's opening is not one, and its close is a deadline nobody
   * plans against: `יציאה 18:26` for a lagoon open from 15:00 is arithmetically true and useless.
   */
  const statesLeaveBy = input.flexibleArrival !== true;
  /**
   * **THE BUFFERED DEPARTURE, PULLED FORWARD WHERE IT LANDS INSIDE THE ROW IT LEAVES FROM**
   * (§AJ2 — §AI2's open question, answered).
   *
   * §AI2 was right that `יציאה 13:56` must not be printed when the stop you are in runs to 14:00 —
   * and wrong to then say nothing about going. The earliest departure that exists is the origin's
   * own end, so that is what the row offers, with the arrival beside it: `יציאה 14:00 · הגעה ~14:58`
   * on a hard 15:00 start. The owner reported the silence as an inconsistency (_"why does it
   * sometimes say יציאה and some other times הגעה"_), and they were reading two different situations
   * wearing one sentence: a destination with no deadline, and a leg with no slack.
   *
   * **What makes it printable is that the clamp is a departure you could make**, so the late mark it
   * licenses is defensible. `PASSED` is therefore measured against the CLAMPED instant, never the
   * buffered one — firing it off 13:56 is exactly the `באיחור`-for-nothing §AI2 removed, and the
   * owner's constraint (_"if you haven't left by the time that the app suggests the app doesn't show
   * you as being late"_) was about a **flexible** destination, which still states no departure.
   */
  const leaveByMs = statesLeaveBy ? leave.leaveByMs : null;
  /**
   * **THE ARRIVAL THE STATED DEPARTURE IMPLIES** (ADR-0206 §AR1) — leave when the row says to, and
   * this is when you are there. Never counted back from a bound the app invented.
   *
   * `leaveByMs` first, and that is the amendment: this line read `departAfterMs + travelSeconds`,
   * which answers a different question ("the earliest you could be there") and therefore could not
   * explain the departure sitting beside it. Where the app states no departure at all — a flexible
   * destination — the earliest you could be there IS the answer, and `departAfterMs` is still it.
   *
   * **AND EVERY ROW THAT HAS ONE NOW SAYS IT**, which is the other half of §AR1. `arriveAtMs` was
   * gated on `!statesLeaveBy || clamped` — said only where the app could not promise the buffer.
   * Reported off the deploy: _"the transit rows should also display the arrival time, so then we
   * immediately know WHY they tell us to take off at that time."_ A lone departure cannot answer
   * that. `יציאה 20:46` is an instruction with its reasoning withheld; `יציאה 20:46 · הגעה ~21:09`
   * above a table at 21:15 shows its whole working, §D5's buffer included.
   *
   * **§AJ2's distinction survives, and it is the half worth keeping**: `יציאה` still means "there
   * is a deadline to advise against" and `הגעה` ALONE still means "there is none". What the old
   * gate also happened to encode was whether the departure had been CLAMPED — never a fact the
   * reader was asked to recover from the shape, and legible from the two clocks themselves.
   *
   * The one arm that must still withhold it is `claimDenied`, below.
   */
  const goesAtMs = leaveByMs ?? (measurableFrom ? departAfterMs! : null);
  const arriveAt = goesAtMs === null ? null : goesAtMs + travelSeconds * MS_PER_SECOND;
  // The same rounding `heroLeaveBy` phases on, asked of the clamped instant — which is what
  // `leave.phase` is keyed to since §AJ3 moved the clamp there. Kept local only because this must
  // also be false wherever the app states no departure at all (`statesLeaveBy`).
  const departurePassed = leaveByMs !== null && Math.round((leaveByMs - nowMs) / MS_PER_MINUTE) < 0;
  const measurement = {
    travelSeconds,
    distanceMeters: input.distanceMeters ?? null,
    free,
    remainingSeconds: null,
    overrunSeconds: null,
    arriveAtMs: arriveAt,
    arrivesAfterClose:
      arriveAt !== null && input.windowClosesMs !== undefined && arriveAt > input.windowClosesMs,
  };
  // The row below has started: whatever the leave-by says, the departure is not the question any
  // more. Checked FIRST, so a finished day is quiet however late its legs ran.
  //
  // **Against the deadline, and against the ARRIVAL where there is none** (§AJ1). A floor's own
  // hour retires nothing: at 20:00 you are still in the air, and going quiet at 15:00 because the
  // hotel's desk opened then is a block that has stopped saying when you land — on the one leg of
  // the day you most want that from. Where the app has neither a deadline nor a prediction it falls
  // back to the raw bound, which is exactly what every leg did before this.
  if (nowMs >= (deadlineMs ?? arriveAt ?? arriveByMs)) {
    return { ...measurement, arm: DAY_JOURNEY_ARM.PAST, leaveByMs: null };
  }
  // **Checked before every clock arm, and that ordering is the decision.** An infeasible leg's
  // leave-by is behind the previous stop's own end, so `PASSED` fires on it almost at once and
  // would say `זמן היציאה עבר` for ever — advice about a departure that was never possible. The
  // shortfall does not decay, so it is what the row says until somebody moves something.
  if (free && free.fit === TRAVEL_FIT.OVERRUNS) {
    return {
      ...measurement,
      arm: DAY_JOURNEY_ARM.OVERRUNS,
      leaveByMs: null,
      overrunSeconds: free.overrunSeconds,
    };
  }
  if (onWay) {
    return {
      ...measurement,
      arm: DAY_JOURNEY_ARM.ON_WAY,
      leaveByMs,
      remainingSeconds: input.remainingSeconds ?? null,
    };
  }
  // A claim nobody may make reads as the ordinary ahead arm minus its advice: the leave-by is
  // derived from a stop the group said they did not go to, so it is not offered and the mark it
  // would have licensed is not made.
  if (claimDenied) {
    // **The arrival goes with it** (ADR-0208 §2, held through §AR1's widening). Every other arm
    // states one now, and this is the one that must not: the instant is derived from the end of a
    // stop the group said they did not go to, so `הגעה ~14:58` would be precisely the claim this
    // arm exists to withhold — offered in the confident voice of a prediction.
    return { ...measurement, arm: DAY_JOURNEY_ARM.AHEAD, leaveByMs: null, arriveAtMs: null };
  }
  // A departure the app may not state cannot have passed, so the late mark goes with it.
  if (leaveByMs === null) {
    return { ...measurement, arm: DAY_JOURNEY_ARM.AHEAD, leaveByMs: null };
  }
  return {
    ...measurement,
    arm: departurePassed ? DAY_JOURNEY_ARM.PASSED : DAY_JOURNEY_ARM.AHEAD,
    leaveByMs,
  };
}

/** **What a whole day answers about its journeys** (ADR-0206 §V1.7 / §AN). */
export interface DayFeasibility {
  /** **A three-way discriminant, and it stays one even though only `OVERRUNS` draws.** `FITS` and
   *  `UNKNOWN` are both silent — §D4 says a reader must not be able to tell "not computed" from
   *  "not computable" — so a boolean would render identically and be a lie in the second case. The
   *  moment this collapses, somebody puts a `✓` on a day nothing was measured on. */
  fit: TravelFit;
  /** How many of the day's legs the rows themselves call infeasible. Zero unless `OVERRUNS`. */
  legs: number;
  /** Their shortfalls added up — how much of the day has to move, in seconds. The one number no
   *  single leg's row can state. */
  overrunSeconds: number;
}

/**
 * **DOES THIS DAY FIT?** (ADR-0206 §V1.7.) Plan mode's whole job is building a day that works and
 * it has always been able to build days that cannot be walked; this is the read that lets it say
 * so — and Plan's alone, which ADR-0159 §1 permits as a difference in **posture**: a day-level
 * verdict in Trip mode is a verdict on a day you are already living.
 *
 * **It takes the JOURNEYS the rows render, not the day's stops — and that is the whole design
 * decision** (§AN). `daySequenceFits` (`@waypoint/shared`, M2) is the obvious source and is the
 * wrong one: it measures raw stop times, while every rule about whether a leg *can* be infeasible
 * has since accumulated in {@link dayJourney} and nowhere else — a flexible arrival has no
 * deadline to miss (§AI1/§AJ1), a declared leg has no estimate (§AA4), a leg out of a bed has no
 * departure window (§AF3), a sub-minute hop is not a journey, and a hole behind you is a record.
 * A verdict rebuilt from stops re-commits §AJ1's own bug one scope up: it calls a day impossible
 * over the single leg nobody can be late for. Reading the arms instead makes agreement structural
 * rather than careful — the day and its rows are describing the same objects.
 *
 * **It is a read and it moves nothing.** ADR-0011 is untouched: no event is implicated in "this
 * does not fit", nothing is guarded, nothing is offered a move. Ripple learning about travel is
 * §V2's and waits until these reads are trusted.
 */
export function dayFeasibility(journeys: readonly (DayJourney | null)[]): DayFeasibility {
  let legs = 0;
  let overrunSeconds = 0;
  let measured = false;
  for (const journey of journeys) {
    if (!journey) continue;
    if (journey.arm === DAY_JOURNEY_ARM.OVERRUNS) {
      legs += 1;
      overrunSeconds += journey.overrunSeconds ?? 0;
    }
    // **`FITS` needs a leg that was measured AGAINST A WINDOW**, which is what `free` being
    // present means. A journey with no window (a bed's leg, an open floor) has a duration and no
    // verdict, so counting it here would report a day as feasible on the strength of a leg that
    // was never asked the question.
    if (journey.free) measured = true;
  }
  if (legs) return { fit: TRAVEL_FIT.OVERRUNS, legs, overrunSeconds };
  return { fit: measured ? TRAVEL_FIT.FITS : TRAVEL_FIT.UNKNOWN, legs: 0, overrunSeconds: 0 };
}

/** **How far the day travels and how long of it could be timed** — see {@link dayTravelTotal}. */
export interface DayTravelTotal {
  /** Every leg's distance added up, declared legs included. `null` where no leg had one. */
  distanceMeters: number | null;
  /** Only the legs that could be TIMED, added up. `null` where none could — a day of declared
   *  legs travels a real distance for no duration this app may state. */
  travelSeconds: number | null;
  /** **The day travels further than this and we cannot say how much further** (ADR-0206 §AT2) —
   *  at least one hole has an end nobody placed, so it is missing from both halves above. The
   *  total is then a FLOOR, and the line says so rather than reading as the day's whole travel. */
  partial: boolean;
  /** **How far the day goes in the AIR, kept apart from how far it goes on the ground**
   *  (ADR-0212 §3), or `null` on a day that flies nowhere.
   *
   *  A separate field rather than more metres in `distanceMeters`, and the measurement is the
   *  argument rather than a preference: on the day this was drawn against, folding the two makes
   *  the total ⁦69 ק״מ⁩ → ⁦5,362 ק״מ⁩ — **78×** — and the number that answered "how far does this
   *  day go" stops answering it. The ground half is what you walk, drive and leave time for; the
   *  air half is what you are carried across. One line, two facts, neither swallowing the other.
   *
   *  It is also why this arrives as an ARGUMENT rather than being summed out of `journeys` below:
   *  a flight is not a hole between two rows, it is a row, so nothing in the journey list has
   *  ever known about it. */
  airMeters: number | null;
}

/**
 * **HOW FAR THE DAY GOES** (ADR-0206 §V1.9) — `3.2 ק״מ · ~48 דק׳`, the day-shape read a planner
 * wants, off the journeys the rows already drew.
 *
 * **A roll-up of the SAME objects the rows render**, for {@link dayFeasibility}'s reason one
 * paragraph up: a total rebuilt from the day's legs would count a hole that draws no block, and a
 * day whose header claims ⁦4.1km⁩ over three journeys the list shows two of is worse than no header.
 * So a leg with no estimate contributes nothing here exactly as it renders nothing there (§D4).
 *
 * **The two halves do not cover the same legs, and that asymmetry is the whole derivation.** A
 * declared תחב״צ leg keeps its distance and has no duration by nature (§AA4 / §AM6: _"a journey
 * with NO duration, not an absent journey"_) — so the kilometres count it and the minutes cannot.
 * Dropping it from both would understate a day somebody is genuinely crossing; inventing minutes
 * for it would print the walking number the declaration exists to suppress. What carries the
 * difference to the reader is §D5's `~` on the minutes, which already says this counts what could
 * be counted.
 *
 * `null` on either half where nothing contributed to it, never a zero: §D4's absence is silence,
 * and `0 ק״מ · ~0 דק׳` on a day nobody could measure is precisely the tell that rule forbids.
 *
 * **`unplacedLegs` is what the roll-up cannot see, and it is required for that reason** (ADR-0206
 * §AT2). Reading the journeys is what keeps the header and the list describing the same objects
 * (§AP2) — and its cost is that a hole the list shows no block for is invisible here too. That is
 * right for a leg still warming, which will gain its number; it is wrong for a hole with an end
 * nobody placed, which never will. A day of five hops where two run through an unplaced stop then
 * prints the three it could measure as if they were the day, and the reader has no way to tell.
 * So the count comes from `useDayTravelReads`, which is the layer that resolved the ends, and the
 * total says it is a floor. Required rather than optional for `useDayTravelReads`' own reason: a
 * surface that forgets to pass it silently claims completeness it has not got.
 */
export function dayTravelTotal(
  journeys: readonly (DayJourney | null)[],
  unplacedLegs: number,
  /** The day's carried legs, already in metres — `carriedLegMeters` per in-motion booking. Kept
   *  out of the ground sum for the reason `DayTravelTotal.airMeters` gives. */
  airMeters: number | null = null,
): DayTravelTotal {
  let distanceMeters: number | null = null;
  let travelSeconds: number | null = null;
  for (const journey of journeys) {
    if (!journey) continue;
    if (journey.distanceMeters !== null && Number.isFinite(journey.distanceMeters))
      distanceMeters = (distanceMeters ?? 0) + journey.distanceMeters;
    if (journey.travelSeconds !== null && Number.isFinite(journey.travelSeconds))
      travelSeconds = (travelSeconds ?? 0) + journey.travelSeconds;
  }
  return {
    distanceMeters,
    travelSeconds,
    partial: unplacedLegs > 0,
    airMeters: airMeters !== null && Number.isFinite(airMeters) ? airMeters : null,
  };
}

/**
 * **When a closed check-in window shuts**, or `undefined` for an open floor — which can be missed
 * by nothing (ADR-0184's `not-before`).
 *
 * Lives here rather than at each day surface because both of them need it to call
 * {@link dayJourney} and neither should own the rule: `startWindowEnd` is a full ISO instant, so
 * no zone is threaded, and an unparseable one is absent rather than `NaN` walking into a
 * comparison.
 */
export function windowClosesMs(event: TripEvent): number | undefined {
  const shuts = windowBoundOf(event, 'start');
  const ms = shuts ? Date.parse(shuts) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * **The slot a fill lands on, narrowed by the journey in it** (§V1.1 applied to the CONTROL rather
 * than to the statement).
 *
 * `Gap.fill` prefills a block at the hole's start, capped at the room — and the room it was capped
 * against is the whole hole. The journey sits at the **end** of it (you leave in time to arrive),
 * so the offer only overstates once what is free is shorter than the default block; there it hands
 * out a slot that eats the walk. One helper, both surfaces: Trip's tap on the journey block and
 * Plan's `שבץ` chip land on the same slot, which is ADR-0161 §9's whole point.
 *
 * Returns the gap unchanged where there is nothing to narrow, so a caller may apply it blindly.
 */
export function narrowGapForTravel(free: Gap, journey: DayJourney | null, tz: string): Gap {
  const freeSeconds = journey?.free?.freeSeconds;
  if (freeSeconds === undefined) return free;
  // **`minutes` is corrected whether or not the FILL needs capping**, and the two used to
  // disagree: the first draft spread `...free` and rewrote only `fill.end`, so a narrowed slot
  // still reported the whole hole's length — an object contradicting itself, which is what
  // handed the free-time strip a 2:40 hole to describe as free after a 40-minute walk. A caller
  // asks a Gap how long it is; it must not have to know which field was corrected.
  const narrowed = { ...free, minutes: Math.max(0, Math.round(freeSeconds / SECONDS_PER_MINUTE)) };
  const startMs = Date.parse(zonedIso(free.fill.date, free.fill.start, tz));
  const endMs = Date.parse(zonedIso(free.fill.date, free.fill.end, tz));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return narrowed;
  const cappedMs = startMs + Math.max(0, freeSeconds) * 1000;
  if (endMs <= cappedMs) return narrowed;
  return {
    ...narrowed,
    fill: { ...free.fill, end: isoToTimeInput(new Date(cappedMs).toISOString(), tz) },
  };
}
