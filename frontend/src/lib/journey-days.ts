// **A journey has ONE calendar date, and every moment after it is a clock plus a day**
// (ADR-0203 §2). This module is that derivation, and nothing else.
//
// The rule is ADR-0037's, one level up: on a single day an end that cannot follow its start
// is the day rolling over. What ADR-0203 adds is that a whole journey works that way — its
// first departure carries the only absolute date, and each later moment resolves to the
// NEAREST FORWARD instant after the moment before it.
//
// **It runs on instants, not wall clocks, and that is the whole reason this is a module
// rather than a comparison inline.** Tel Aviv 21:00 → Honolulu 09:00 lands twelve hours
// earlier by the clock and is still the same calendar day, because the flight also crossed
// nineteen hours westward. A wall-clock comparison gets that case wrong by a full day, and
// gets the eastbound one right by luck — so the two are indistinguishable in review and
// differ in production. Each moment therefore resolves through its OWN endpoint's zone, the
// same pair `WhenField`'s span already builds with `zonedIso(day, time, tz)`.
//
// Two consequences worth knowing before reading callers:
//
//  - **Every offset counts from the JOURNEY's date**, never from the node above it. Chaining
//    `למחרת` off each predecessor makes the words relative to each other and the journey
//    unreadable — the point of one anchor is that everything states its distance from it.
//
//  - **It retires a refusal.** `legBeforeArrival` ("the departure is before the previous
//    arrival") exists because two absolute dates let you enter one. With one date and a
//    forward-only resolution that is not an error to refuse, it is tomorrow — and the leg's
//    own duration says what it costs. Prevented rather than refused, which is ADR-0150 §8's
//    rule and the one `TimeField`'s `minTime` already follows.
import { addDays, zonedIso } from '@waypoint/shared';
import { MAX_JOURNEY_DAY_SPAN } from '../constants';

/** One moment being resolved: the wall clock a human typed, and the zone it belongs to. */
export interface JourneyMoment {
  /** `HH:MM`, as typed. */
  time: string;
  /** The IANA zone this clock is read in — the endpoint's own (ADR-0107). */
  timeZone: string;
  /** What a human said the offset is instead, when they overrode it. The one case the
   *  derivation cannot see is a single leg longer than 24 hours: a sleeper train, a ferry.
   *  Undefined → derived. */
  dayOffset?: number;
}

/** A resolved moment: how many days after the journey's date it lands, and the instant. */
export interface ResolvedMoment {
  /** Days after the journey's own date. 0 for its first departure, by construction. */
  dayOffset: number;
  /** Epoch ms, resolved through this moment's own zone. */
  at: number;
}

/** The instant a wall clock lands on, `dayOffset` days after `date`, read in `timeZone`. */
const instantOf = (date: string, offset: number, m: JourneyMoment): number =>
  Date.parse(zonedIso(addDays(date, offset), m.time, m.timeZone));

/**
 * **Resolve a journey's moments in order, from its one date.**
 *
 * `date` is the journey's calendar date (`YYYY-MM-DD`) — its first departure's, and the only
 * absolute one it has. Moments are in journey order: a departure, then each arrival, and a
 * stop's own departure after its arrival.
 *
 * Each moment takes the smallest offset, **at or after the previous moment's**, that puts it
 * strictly after that moment. An explicit `dayOffset` raises where that search STARTS and is
 * never corrected downward — but it cannot make a journey run backwards, because a journey
 * that does is not a state to represent (the posture `endFloor` already takes in
 * `WhenField`, which simply does not offer an end before its own start).
 *
 * A moment with no clock yet resolves to offset 0 and stops the chain advancing, so a
 * half-filled journey never invents offsets for the moments below the one being typed.
 */
export function resolveJourneyDays(date: string, moments: JourneyMoment[]): ResolvedMoment[] {
  const out: ResolvedMoment[] = [];
  let previous: ResolvedMoment | null = null;
  for (const moment of moments) {
    if (!date || !moment.time) {
      out.push({ dayOffset: 0, at: Number.NaN });
      continue;
    }
    // **An override is a FLOOR, not an answer** — and the difference is a bug this module's
    // own spec caught. Taking `Math.max(override, previousOffset)` and stopping there still
    // lets a journey run backwards: an arrival overridden to the same day as its departure
    // but at an earlier clock resolves to an instant BEFORE it. So the override only moves
    // where the forward search starts; the search itself is what guarantees monotonicity,
    // and it runs whether or not a human said anything.
    const floor = Math.max(moment.dayOffset ?? 0, previous?.dayOffset ?? 0);
    let offset = floor;
    if (previous) {
      // The nearest forward instant, bounded: past a couple of days the answer is a mistyped
      // clock rather than a longer leg, and a genuinely longer one is what the override says.
      for (let d = floor; d <= floor + MAX_JOURNEY_DAY_SPAN; d++) {
        offset = d;
        if (instantOf(date, d, moment) > previous.at) break;
      }
    }
    const resolved = { dayOffset: offset, at: instantOf(date, offset, moment) };
    out.push(resolved);
    previous = resolved;
  }
  return out;
}

/** Elapsed minutes between two resolved moments, or null when either is unresolved. A
 *  LEG's length: measured on instants, so a zone-crossing one reads correctly rather than
 *  by luck. Never negative — the resolution above cannot produce a backwards pair. */
export function elapsedMinutes(from: ResolvedMoment, to: ResolvedMoment): number | null {
  if (!Number.isFinite(from.at) || !Number.isFinite(to.at)) return null;
  return Math.round((to.at - from.at) / 60_000);
}
