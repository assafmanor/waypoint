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
 * **The swap threshold half of this note is answered; the buffer half is not** (2026-08-26). §Z1's
 * threshold is `LEAVE_BY_SWAP_MINUTES = 30`, measured by M3 and confirmed as §AA1, and it lives in
 * the frontend's `lib/hero-travel.ts` because no server surface asks it — the same call `TRAVEL_FIT`
 * above makes. **This number is still five minutes and still a placeholder**: M3's mockup exposed it
 * as a control (0/5/10/15) and handed it to the device pass, so it is a feel call on a real day
 * rather than a decision anyone has taken. The two do still interact — a large enough buffer makes
 * the swap fire early — which is why raising this one is a read of §AA1 and not a one-line change.
 */
export const TRAVEL_BUFFER_SECONDS = 5 * 60;

/**
 * **The shortfall a leg is allowed before the app calls it impossible** (ADR-0206 §AH2).
 *
 * Reported off the deploy: two stops ⁦20m⁩ apart with no gap between them read `אין זמן לדרך` — a
 * ⁦24⁩-second walk declared undoable, because the comparison below had no slack at all. It is
 * arithmetically true and it is not a fact about anybody's day: nobody schedules the time it takes
 * to leave a room, and a warning nobody can act on trains the reader to ignore the ones they can.
 *
 * **It is the buffer, and that is a derivation rather than a coincidence.** `TRAVEL_BUFFER_SECONDS`
 * is padding this app adds to EVERY leave-by because it does not trust an OSM estimate to the
 * minute — so it is the error bar the app has already admitted to. A shortfall inside that bar is
 * indistinguishable from zero given what we know, and declaring it a broken plan would be reading
 * one uncertainty two ways: generous when recommending a departure, strict when assigning blame.
 * Derived so the device pass retunes both at once (owner, 2026-08-26: _"only 2 minutes? is this
 * enough time to give?"_ — it was not, and picking a second number would have been a guess where
 * the app already had an answer).
 *
 * **Grace on the TIME and never on the distance.** The comparison is seconds against seconds: a
 * ⁦1.2km⁩ drive that takes a minute is inside it and a ⁦1.2km⁩ walk that takes twenty is not, which is
 * the whole point — distance is what a leg looks like, and time is what it costs you.
 *
 * **It decides WHETHER to speak and nothing about what is said** — past it, `overrunSeconds`
 * reports the whole shortfall, never the excess over the tolerance.
 *
 * The backlog's "proportional half" line still stands and this does not close it: estimate error
 * scales with the leg, so a flat bar is right for the ⁦24⁩-second case that prompted it and is not
 * the final shape for a 40-minute walk.
 */
export const TRAVEL_FIT_TOLERANCE_SECONDS = TRAVEL_BUFFER_SECONDS;

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
  /** By how much the journey does not fit — the WHOLE shortfall, past `TRAVEL_FIT_TOLERANCE_SECONDS`.
   *  Zero whenever it fits (a shortfall inside the tolerance included), so a surface can branch on
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
  // The tolerance gates the VERDICT only: past it the shortfall is reported whole, because a
  // 20-minute shortfall is 20 minutes of moving to do and never 18.
  const overruns = remaining < -TRAVEL_FIT_TOLERANCE_SECONDS;
  return {
    availableSeconds,
    travelSeconds,
    freeSeconds: Math.max(0, remaining),
    overrunSeconds: overruns ? -remaining : 0,
    fit: overruns ? TRAVEL_FIT.OVERRUNS : TRAVEL_FIT.FITS,
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

// ── WHETHER A DETOUR COULD HAPPEN AT ALL (ADR-0216) ───────────────────────────────────────
//
// Here rather than in the frontend for this file's own stated reason: the two day surfaces must
// not be able to disagree about whether something fits, and a slot's list is exactly that
// question asked of a place that is not on the day yet.

/**
 * **The speed past which a claim stops being about roads** (ADR-0216 §4).
 *
 * Above the highest motorway limit anywhere this app is used, applied to a crow line no road
 * follows — so it is not an estimate of how fast anybody drives. It is the ceiling that makes
 * {@link reachableWithin}'s refusals refusals about **physics**: no ground journey of that length
 * fits that window, whatever route exists.
 *
 * **Deliberately absurd, because the safe direction is generous.** The cases this exists to catch
 * are absurd by orders of magnitude — the reported ⁦182 ק״מ⁩ lagoon needs ⁦2:35⁩ of round trip against
 * ⁦65⁩ free minutes even at this speed — so a ceiling nobody can argue with drops all of them and
 * drops nothing else.
 */
export const MAX_GROUND_SPEED_KMH = 130;

const M_PER_KM = 1_000;
const SECONDS_PER_HOUR = 3_600;

/** The fastest a crow distance could conceivably be covered on the ground, in seconds. A LOWER
 *  BOUND on the journey and never an estimate of it — see {@link reachableWithin}. */
export const floorTravelSeconds = (meters: number): number =>
  (meters / (MAX_GROUND_SPEED_KMH * M_PER_KM)) * SECONDS_PER_HOUR;

/**
 * **Could you go there and be back in time, at all?** (ADR-0216.)
 *
 * `true` wherever the answer is yes **or unknown**, which is the whole contract: the bound behind
 * this is `crow / ceiling`, and crow-flies distance is a **lower bound** on road distance. A lower
 * bound can prove that something is impossible; it can never prove that something is possible. So
 * this may be used to DROP a candidate and for nothing else — never to rank one, never to print a
 * duration, never as a reason. That asymmetry is what keeps ADR-0206 §D4 intact: nothing the reader
 * sees claims a travel time nobody measured.
 *
 * `detourMeters` is the whole round trip — out to the place and back to the stop the slot has to
 * end at — because one leg is how a ⁦60 ק״מ⁩ errand looks like ⁦36⁩ minutes and costs ⁦72⁩.
 *
 * `staySeconds` is the time that has to be left once you are there. Zero is a legitimate caller
 * choice; the sheet passes `FREE_TIME_MIN_MINUTES`, on the argument that if ⁦15⁩ minutes is not
 * worth calling free time then arriving with less than ⁦15⁩ is not a visit.
 *
 * Unmeasurable is `true`, and that is §D4 read from the other end: **nothing may be dropped on an
 * absence.** A non-finite distance or window is a missing coordinate, not a long journey.
 */
export function reachableWithin(input: {
  freeSeconds: number;
  detourMeters: number;
  staySeconds?: number;
}): boolean {
  const { freeSeconds, detourMeters, staySeconds = 0 } = input;
  if (!Number.isFinite(freeSeconds) || !Number.isFinite(detourMeters)) return true;
  return floorTravelSeconds(detourMeters) + staySeconds <= freeSeconds;
}
