// **The run-up to departure, as tiers** (ADR-0221 §1–§3).
//
// The prep hero's energy is a function of the distance to departure: far out it is the
// shipped card; inside the last week the numeral grows and a runway of seven lamps lights
// one per day behind you; the day before, the headline is a departure-board clock counting
// to the first timed thing on day 1. Pure derivations, so both hosts of the hero — Plan
// Home and the first-morning morph on Trip Home — read one answer.
import type { TripEvent } from '@waypoint/shared';
import { zoneOffsetMinutes } from '@waypoint/shared';
import { MINUTES_PER_HOUR, MS_PER_MINUTE } from '../constants';

export const PREP_TIER = {
  /** More than a week out: the shipped hero, unchanged. */
  FAR: 'far',
  /** The last week: a bigger numeral and the runway lamps. */
  WEEK: 'week',
  /** `מחרתיים`: the word takes the headline. */
  EVE2: 'eve2',
  /** `מחר` (and `היום`, for the first-morning face): the clock is the headline. */
  EVE: 'eve',
} as const;
export type PrepTier = (typeof PREP_TIER)[keyof typeof PREP_TIER];

/** Seven lamps: the last week, one per day. */
export const RUNWAY_DAYS = 7;

export function prepTier(days: number): PrepTier {
  if (days > RUNWAY_DAYS) return PREP_TIER.FAR;
  if (days > 2) return PREP_TIER.WEEK;
  if (days === 2) return PREP_TIER.EVE2;
  return PREP_TIER.EVE;
}

/** The runway, lamp by lamp: `true` is a day already behind you. Seven lamps whatever the
 *  count, so the strip never changes width from one morning to the next. */
export function runwayLamps(days: number): boolean[] {
  const lit = Math.max(0, Math.min(RUNWAY_DAYS, RUNWAY_DAYS - days));
  return Array.from({ length: RUNWAY_DAYS }, (_, i) => i < lit);
}

/** **The first timed thing on a date** — the same fact `trip.tomorrow` pushes at 19:00 the
 *  evening before (`backend/…/trip-tomorrow.kind.ts`), so the hero and the push name one
 *  thing. `undefined` when nothing on that day carries a time, which is common enough to be
 *  the normal case rather than an edge one. */
export function firstTimedOn(events: TripEvent[], date: string): TripEvent | undefined {
  let first: TripEvent | undefined;
  for (const e of events) {
    if (e.date !== date || !e.startsAt) continue;
    if (!first || Date.parse(e.startsAt) < Date.parse(first.startsAt!)) first = e;
  }
  return first;
}

/** **What the eve's clock counts to** (ADR-0221 §3): the first timed thing on day 1 when
 *  there is one, else the trip-local midnight that starts day 1 — the instant the mode
 *  flips. The departure is the commitment and the fact the push already names; midnight is
 *  the boundary nobody feels, so it is only the fallback. */
export function eveTargetMs(
  events: TripEvent[],
  startDate: string,
  primaryZone: string,
): { atMs: number; event?: TripEvent } {
  const first = firstTimedOn(events, startDate);
  if (first) return { atMs: Date.parse(first.startsAt!), event: first };
  const utcMidnight = Date.parse(`${startDate}T00:00:00Z`);
  const offset = zoneOffsetMinutes(new Date(utcMidnight), primaryZone);
  return { atMs: utcMidnight - offset * MS_PER_MINUTE };
}

export interface FlapClock {
  /** `HH`, two digits minimum; the eve's clock can read past 24. */
  hours: string;
  minutes: string;
  seconds: string;
}

/** `HH:MM:SS` remaining to `targetMs`, floored at zero — a clock that has been reached
 *  reads `00:00:00` and never counts negative. */
export function flapClock(nowMs: number, targetMs: number): FlapClock {
  const totalSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const hours = Math.floor(totalSeconds / (MINUTES_PER_HOUR * 60));
  const minutes = Math.floor((totalSeconds % (MINUTES_PER_HOUR * 60)) / 60);
  const seconds = totalSeconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return { hours: two(hours), minutes: two(minutes), seconds: two(seconds) };
}
