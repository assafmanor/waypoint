// What a travel time SAYS (ADR-0206). The other half — where a route comes from — is
// `routing.ts` (ADR-0205).
//
// These three derivations are the whole product logic of the epic, and they live here for the
// reason ADR-0205 §7 gives: Plan mode and Trip mode must not be able to disagree about whether a
// day fits, and the sweep that will one day fire a "leave now" reminder (ADR-0206 §V2) has to
// read a leave-by the same way the row printing it does. `task-time.ts` next door is the same
// shape for the same reason.
//
// Clock-injected throughout: milliseconds in, milliseconds out, no `Date.now()` and no zone. The
// caller owns now, the display zone and the words — this file owns the arithmetic.

/**
 * **Whether a journey fits the slot it has**, as a discriminant rather than a boolean, because
 * "we do not know" is a third answer and a boolean would have to lie about it. Local to this file
 * rather than promoted to `constants.ts`, on that file's own rule: no server surface asks whether
 * a day fits, so there is no second layer to keep in step yet — `task-time.ts`'s `TASK_BAND` is
 * the same call.
 */
export const TRAVEL_FIT = {
  FITS: 'fits',
  OVERRUNS: 'overruns',
  UNKNOWN: 'unknown',
} as const;
export type TravelFit = (typeof TRAVEL_FIT)[keyof typeof TRAVEL_FIT];

/**
 * **The buffer a leave-by keeps** (ADR-0206 §D5).
 *
 * An OSM pedestrian estimate is an estimate, so a leave-by is a **suggestion**, not a promise —
 * and a suggestion that assumes you walk at the router's pace, with no time to find the door, is
 * the false precision §D5 refuses. Five minutes is a placeholder with a shape: it is the smallest
 * amount that is visibly not zero.
 *
 * **M3 owns the real number**, together with the threshold at which the collapsed board swaps its
 * countdown (§Z1) — the two interact, because a buffer that is large enough makes the swap fire
 * early, and both are numbers to measure on a real day rather than pick here.
 */
export const TRAVEL_BUFFER_SECONDS = 5 * 60;

const MS = 1000;

/**
 * **When to leave** (ADR-0206 §V1.2) — the instant behind `צאו ב־18:37`.
 *
 * Milliseconds, not a formatted time and not an ISO string: rounding it onto ADR-0114's duration
 * ladder and rendering it in the right zone are the frontend's, and this package supplies values
 * rather than words.
 *
 * **It is deliberately allowed to be in the past.** A leave-by already gone is the single most
 * actionable thing this data can say (§V1.4) and the caller compares it against its own `now` to
 * find that out; clamping it here would delete the fact.
 */
export function leaveBy(
  arriveByMs: number,
  travelSeconds: number,
  bufferSeconds: number = TRAVEL_BUFFER_SECONDS,
): number {
  return arriveByMs - (travelSeconds + bufferSeconds) * MS;
}

/** What is true of the slot between two stops once the journey in it is counted. */
export interface TravelWindow {
  /** The whole slot, `departAfterMs`..`arriveByMs`. **Not clamped at zero** — two stops that
   *  already overlap are a real state of the data, and a negative slot is how `overrunSeconds`
   *  gets to report it instead of it disappearing. */
  availableSeconds: number;
  /** What the journey costs, or `null` when there is no estimate (ADR-0206 §D4). */
  travelSeconds: number | null;
  /** What is actually free, clamped at zero — the number behind `פנוי · 2:00 שע׳`. */
  freeSeconds: number;
  /** By how much the journey does not fit. Zero whenever it does, so a surface can branch on
   *  this alone without re-deriving the comparison. */
  overrunSeconds: number;
  fit: TravelFit;
}

/**
 * **Gap minus travel** (ADR-0206 §V1.1) — the correction this epic leads with, and the only line
 * on §V1 that is a bug fix rather than a feature. `DayJoinRow` renders `פנוי · 2:40 שע׳` today and
 * has since ADR-0159 shipped; if forty of those minutes are the walk to the next stop, the app is
 * telling you about time you do not have, on the one surface built to be a statement.
 *
 * **With no estimate the answer is exactly today's read** — the whole gap, free, and
 * `TRAVEL_FIT.UNKNOWN`. Never a pessimistic guess: ADR-0206 §D4 says the user must not be able to
 * tell "we have not computed this" from "this is not computable", and inventing a walk we did not
 * measure would fail that in the direction that costs someone their afternoon.
 */
export function freeAfterTravel(
  departAfterMs: number,
  arriveByMs: number,
  travelSeconds: number | null,
): TravelWindow {
  const availableSeconds = (arriveByMs - departAfterMs) / MS;
  if (travelSeconds === null) {
    return {
      availableSeconds,
      travelSeconds: null,
      freeSeconds: Math.max(0, availableSeconds),
      overrunSeconds: 0,
      fit: TRAVEL_FIT.UNKNOWN,
    };
  }
  const remaining = availableSeconds - travelSeconds;
  return {
    availableSeconds,
    travelSeconds,
    freeSeconds: Math.max(0, remaining),
    overrunSeconds: Math.max(0, -remaining),
    fit: remaining < 0 ? TRAVEL_FIT.OVERRUNS : TRAVEL_FIT.FITS,
  };
}

/** One stop of an ordered day, as instants the caller has already resolved. Deliberately not a
 *  `TripEvent`: which zone a time means, and which of a multi-day span's ends is today's, are
 *  questions this package leaves to the caller that owns them (`packages/shared/CLAUDE.md`). */
export interface DaySequenceStop {
  /** When the stop begins — the deadline a journey into it has to beat. */
  startsAtMs?: number;
  /** When it ends — the earliest a journey out of it may leave. Falls back to `startsAtMs`, so a
   *  stop with no duration is a point in the day rather than an unanswerable one. */
  endsAtMs?: number;
}

/** One leg's verdict inside a day. */
export interface DaySequenceLeg extends TravelWindow {
  fromIndex: number;
  toIndex: number;
}

/** What a whole day answers. */
export interface DaySequenceVerdict {
  legs: DaySequenceLeg[];
  /** **False only on evidence.** A day nobody can verdict — no times, no estimates — fits, because
   *  Plan mode saying "this does not work" about a day it cannot measure is worse than saying
   *  nothing (ADR-0206's Consequences: it should be felt as help, not as refusal). */
  fits: boolean;
  /** Every leg's overrun added up: how much the day is over, in one number. */
  overrunSeconds: number;
}

/**
 * **Does this day fit?** (ADR-0206 §V1.7.) Plan mode's whole job is building a day that works and
 * it currently builds days that cannot be walked; this is the read that lets it say so.
 *
 * `travelSeconds[i]` is the journey from `stops[i]` to `stops[i + 1]` — one shorter than `stops`,
 * and a `null` entry is a leg with no estimate. Built on `freeAfterTravel` rather than beside it,
 * so the day's verdict and the gap slot's own line can never disagree about one leg.
 *
 * **It is a read and it moves nothing.** ADR-0011 is untouched here: a travel time never moves a
 * hard event, and in v1 it never moves anything at all. Ripple learning about travel is §V2's,
 * and it waits until these reads are trusted.
 */
export function daySequenceFits(
  stops: readonly DaySequenceStop[],
  travelSeconds: readonly (number | null)[],
): DaySequenceVerdict {
  const legs: DaySequenceLeg[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const departAfterMs = stops[i]!.endsAtMs ?? stops[i]!.startsAtMs;
    const arriveByMs = stops[i + 1]!.startsAtMs;
    const travel = travelSeconds[i] ?? null;
    // Without both ends there is no window to measure the journey against, and a leg we cannot
    // measure is UNKNOWN — never "does not fit". `NaN` is not a verdict.
    const window: TravelWindow =
      departAfterMs === undefined || arriveByMs === undefined
        ? {
            availableSeconds: 0,
            travelSeconds: travel,
            freeSeconds: 0,
            overrunSeconds: 0,
            fit: TRAVEL_FIT.UNKNOWN,
          }
        : freeAfterTravel(departAfterMs, arriveByMs, travel);
    legs.push({ fromIndex: i, toIndex: i + 1, ...window });
  }
  const overrunSeconds = legs.reduce((total, leg) => total + leg.overrunSeconds, 0);
  return { legs, fits: !legs.some((leg) => leg.fit === TRAVEL_FIT.OVERRUNS), overrunSeconds };
}
