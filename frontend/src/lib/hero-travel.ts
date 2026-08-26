// **The hero's journey** (ADR-0206 §V1.2 / §Z1) — the one leg the board and the lifted hero
// answer the app's third question with: _what do I need in the next 30 minutes._
//
// Pure and clock-injected, like `hero-booking.ts` beside it: instants and seconds in, a phase
// and a signed minute count out. No formatting, no zone, no `Date.now()`. What the leg SAYS is
// `i18n/he.ts`'s and `HeroLift`'s; the arithmetic that decides whether leaving is the live
// question is here, once, because the collapsed board and the horizon must not be able to
// disagree about it (ADR-0018: derived, and derived once).
//
// **The estimate itself is not this file's** — `useDayTravel` holds it (ADR-0205 §7) and
// `leaveBy` computes the instant (`@waypoint/shared`'s `travel-time.ts`, so the sweep that will
// one day fire a "leave now" reminder reads it the same way this does).
import { leaveBy, type TripEvent } from '@waypoint/shared';

const MS_PER_MIN = 60_000;

/**
 * **When leaving becomes the live question** (ADR-0206 §Z5 §M1, confirmed as §AA1) — measured on
 * **time-to-leave**, never on time-to-event.
 *
 * Which end it is measured from is the whole of the number's meaning: on time-to-event the
 * length of the walk would move the swap, so a 70-minute leg would swap 70 minutes before a
 * departure that is not yet close. Three grounds hold 30 in place: it is the number root
 * `CLAUDE.md` already states in prose (_"what do I need in the next 30 minutes"_), anything ≥60
 * forces the tile into `H:MM` under a unit that means minutes, and at 45 the board spends more of
 * a long walk counting to the departure than to the event.
 *
 * Beside the derivation that reads it rather than in `constants.ts`, exactly as
 * `WINDOW_CLOSING_MIN` is — nothing outside this file and its spec asks the question.
 */
export const LEAVE_BY_SWAP_MINUTES = 30;

/** Which of §Z1's three rows is true. A discriminant rather than two booleans: the three states
 *  are exclusive and a caller branching on `live && !passed` is one negation away from drawing
 *  both, which is the contradiction §Z1 exists to prevent. */
export const LEAVE_PHASE = {
  /** Leaving is not yet the live question — the board counts to the event, as it always has. */
  AHEAD: 'ahead',
  /** Time-to-leave is inside {@link LEAVE_BY_SWAP_MINUTES}. */
  LIVE: 'live',
  /** The leave-by has passed. **Not "you are late"** — see {@link heroLeaveBy}. */
  PASSED: 'passed',
} as const;
export type LeavePhase = (typeof LEAVE_PHASE)[keyof typeof LEAVE_PHASE];

export interface HeroLeaveBy {
  /** What the journey costs, in seconds, on the mode that was asked about. */
  travelSeconds: number;
  /** The instant behind `צאו ב־18:37` — allowed to be in the past, which is the whole of
   *  `PASSED` (`leaveBy`'s own docblock refuses to clamp it for this reason). */
  leaveByMs: number;
  /** Whole minutes to the leave-by, **signed**: negative once it has passed. The tile and the
   *  line both render `Math.abs` of it under different words, and the sign is what the
   *  collision rule below compares — a passed leave-by is nearer than any shutting window. */
  minutesToLeave: number;
  phase: LeavePhase;
}

/**
 * **The leave-by, and whether it is the live question.**
 *
 * `null` when there is no estimate, and that is the ordinary answer (ADR-0206 §D4): offline,
 * refused by the gate, over the ceiling, still warming, provider down. Every one of them leaves
 * the board counting to the event exactly as it does today and the horizon drawing nothing —
 * absence, never a pessimistic guess, and no layout shift.
 *
 * **A leg declared תחב״צ (§AA4) cannot reach this function with a duration, by construction.**
 * The declaration is a stored mode with no provider: it is not a member of `travelModeSchema`,
 * so `estimateFor` cannot be asked for it, so `travelSeconds` is `null` and the swap does not
 * fire. M8 stores the declaration; nothing here needs to know about it, and nothing here may
 * grow a fourth mode.
 *
 * **What `PASSED` may claim, and it is less than it looks.** From the clock alone the only
 * supportable statement is that the leave-by has gone by — `זמן היציאה עבר`, never
 * `אתם באיחור` (§Z5 §M4). A settle mark is a record written when convenient, not a sensor, and
 * ADR-0006 keeps own-device position off this surface until it has an ADR of its own. The
 * person answers with `בדרך` (`lib/on-way.ts`), which is the one thing on this screen that
 * knows what a sensor would, because a human said it.
 */
export function heroLeaveBy(input: {
  /** When you have to be there — the next point's own instant. */
  arriveByMs: number;
  /** The estimate for the leg into it, or `null` (§D4). */
  travelSeconds: number | null;
  nowMs: number;
  swapMinutes?: number;
}): HeroLeaveBy | null {
  const { arriveByMs, travelSeconds, nowMs, swapMinutes = LEAVE_BY_SWAP_MINUTES } = input;
  if (travelSeconds === null || !Number.isFinite(travelSeconds) || !Number.isFinite(arriveByMs)) {
    return null;
  }
  const leaveByMs = leaveBy(arriveByMs, travelSeconds);
  const minutesToLeave = Math.round((leaveByMs - nowMs) / MS_PER_MIN);
  const phase =
    minutesToLeave < 0
      ? LEAVE_PHASE.PASSED
      : minutesToLeave <= swapMinutes
        ? LEAVE_PHASE.LIVE
        : LEAVE_PHASE.AHEAD;
  return { travelSeconds, leaveByMs, minutesToLeave, phase };
}

/**
 * **Where the horizon's journey starts.**
 *
 * The leg is between two **scheduled stops**, which is what makes it a fact about the plan
 * rather than a claim about a person: during an event the schedule itself says you are at that
 * event's place, and in a gap it says the last thing that started is where you were left. That
 * is the same leg `DayJoinRow` measures its hole with (§V1.1), so the day row's leave-by and the
 * board's cannot differ.
 *
 * It deliberately does **not** walk further back when the answer has no coordinates: the stop
 * before it is somewhere you have already left, and offering it would invent a position. No
 * coordinates is §D4's absence, like every other missing estimate.
 *
 * `nowEvent` first, because that is the point the hero leads with — and mid-span its own place
 * already resolves to where you are **going** (`heroHorizon`'s `midSpanEventId`), so a flight in
 * the air measures the leg out of the airport it lands at rather than the one it left.
 */
export function travelOrigin(input: {
  /** The primary in-progress event, when there is one. */
  nowEvent?: TripEvent;
  /** The day's events, as the day holds them. */
  events: readonly TripEvent[];
  nowMs: number;
  /** The destination — never its own origin, which is what a day whose only stop is one stay's
   *  two ends would otherwise ask for. */
  excludeEventId?: string;
}): TripEvent | undefined {
  const { nowEvent, events, nowMs, excludeEventId } = input;
  if (nowEvent) return nowEvent;
  let latest: TripEvent | undefined;
  for (const event of events) {
    if (!event.startsAt || event.id === excludeEventId) continue;
    const startedAt = Date.parse(event.startsAt);
    if (!Number.isFinite(startedAt) || startedAt > nowMs) continue;
    if (!latest || startedAt > Date.parse(latest.startsAt!)) latest = event;
  }
  return latest;
}
