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
  type TravelWindow,
  type TripEvent,
} from '@waypoint/shared';
import { MS_PER_SECOND, SECONDS_PER_MINUTE } from '../constants';
import { gapBetween, type Gap } from './gaps';
import { LEAVE_PHASE, heroLeaveBy } from './hero-travel';
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
} as const;
export type DayJourneyArm = (typeof DAY_JOURNEY_ARM)[keyof typeof DAY_JOURNEY_ARM];

export interface DayJourney {
  arm: DayJourneyArm;
  /** What the leg costs, in seconds, on the mode that was asked about. */
  travelSeconds: number;
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
 * gate, over the ceiling, still warming, provider down, a leg somebody declared תחב״צ (§AA4), or
 * two stops that are one place. Every one of them leaves ADR-0159's free-time strip standing
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
}): DayJourney | null {
  const { departAfterMs, arriveByMs, travelSeconds, nowMs, onWay, claimDenied } = input;
  // **A journey the ladder cannot state is not a journey** (2026-08-26). `ROUTE_MIN_CROW_M` is
  // ⁦10m⁩, so a ⁦20m⁩ hop is routed, answers ⁦24⁩ seconds, and drew a whole block reading `~0 דק׳` over
  // `אין זמן לדרך` — a warning about the time it takes to walk out of a door. The floor is the
  // display's own: below half a minute ADR-0114's minutes rung rounds to nothing, and a block
  // whose head cannot name a length has nothing to say.
  if (travelSeconds === null || !Number.isFinite(travelSeconds)) return null;
  if (Math.round(travelSeconds / SECONDS_PER_MINUTE) < 1) return null;
  if (!Number.isFinite(arriveByMs)) return null;
  const leave = heroLeaveBy({ arriveByMs, travelSeconds, nowMs });
  if (!leave) return null;
  const measurableFrom = departAfterMs !== undefined && Number.isFinite(departAfterMs);
  // **THE FIT MEASURES TO THE LAST MOMENT THAT STILL WORKS, WHICH ON A WINDOW IS ITS CLOSE.**
  // The third face of §AI1's mistake, and the one only a spec found: `freeAfterTravel` was being
  // handed the window's OPENING as the deadline, so a leg that could not reach the door the
  // instant it opened read as `OVERRUNS` — `אין זמן לדרך` about a check-in you had three more
  // hours to make. A floor with no close keeps the opening, which is all the app knows about it.
  const fitBy =
    input.flexibleArrival === true && input.windowClosesMs !== undefined
      ? input.windowClosesMs
      : arriveByMs;
  const free = measurableFrom ? freeAfterTravel(departAfterMs!, fitBy, travelSeconds) : null;
  // **THE ONE RULE BOTH OF §AI's DEFECTS COLLAPSE INTO.** The app states a departure only when it
  // has a deadline to count back from AND that departure is one you could actually make. A leg
  // into a floor fails the first; a leave-by behind its own origin fails the second — and the
  // second is reachable only since §AH2 widened the tolerance, because the 2-minute shortfall that
  // used to read `OVERRUNS` (and printed no leave-by at all) now reads as fitting.
  const statesLeaveBy =
    input.flexibleArrival !== true && (!measurableFrom || leave.leaveByMs >= departAfterMs!);
  // When you can go, plus the leg. Never counted back from a bound the app invented.
  const arriveAt = measurableFrom ? departAfterMs! + travelSeconds * MS_PER_SECOND : null;
  const measurement = {
    travelSeconds,
    distanceMeters: input.distanceMeters ?? null,
    free,
    remainingSeconds: null,
    overrunSeconds: null,
    arriveAtMs: statesLeaveBy ? null : arriveAt,
    arrivesAfterClose:
      !statesLeaveBy &&
      arriveAt !== null &&
      input.windowClosesMs !== undefined &&
      arriveAt > input.windowClosesMs,
  };
  // The row below has started: whatever the leave-by says, the departure is not the question any
  // more. Checked FIRST, so a finished day is quiet however late its legs ran.
  if (nowMs >= arriveByMs) {
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
      leaveByMs: statesLeaveBy ? leave.leaveByMs : null,
      remainingSeconds: input.remainingSeconds ?? null,
    };
  }
  // A claim nobody may make reads as the ordinary ahead arm minus its advice: the leave-by is
  // derived from a stop the group said they did not go to, so it is not offered and the mark it
  // would have licensed is not made.
  if (claimDenied) {
    return { ...measurement, arm: DAY_JOURNEY_ARM.AHEAD, leaveByMs: null };
  }
  // A departure the app may not state cannot have passed, so the late mark goes with it.
  if (!statesLeaveBy) {
    return { ...measurement, arm: DAY_JOURNEY_ARM.AHEAD, leaveByMs: null };
  }
  return {
    ...measurement,
    arm: leave.phase === LEAVE_PHASE.PASSED ? DAY_JOURNEY_ARM.PASSED : DAY_JOURNEY_ARM.AHEAD,
    leaveByMs: leave.leaveByMs,
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
