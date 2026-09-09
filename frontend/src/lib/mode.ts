// Plan/Trip mode derivation (ADR-0016) — derived from trip dates + now, never
// stored on the Trip (docs/architecture/data-model.md). The manual override
// (state/mode-state.tsx) is session-only, in-memory UI state, not persisted —
// the app always comes back to auto-derived on a fresh load.
import type { Trip, ZoneEvidence } from '@waypoint/shared';
import { MS_PER_DAY } from '../constants';
import { liveToday } from './places';
import { todayInTz } from './time';

export type Mode = 'plan' | 'trip';

/** Where the trip sits relative to trip-local "today": before it starts (`pre`),
 *  within [startDate, endDate] (`live`), or after it ends (`past`). Trip mode is
 *  a live-window-only state (ADR-0040) — pre and past are always Plan. */
export type TripPhase = 'pre' | 'live' | 'past';

type TripWindow = Pick<Trip, 'startDate' | 'endDate' | 'timezone'>;

/** **The calendar day the trip's clock is on** — the one `liveToday` answers for every other
 *  surface (ADR-0107 §4, mode-free): home before the outbound flight, the far side after it.
 *  Reading it off `trip.timezone` instead put the destination's midnight on the countdown, so at
 *  00:58 at home on the 9th the hero still said the trip was three days out (owner, 2026-09-09).
 *  `evidence` is optional only for a trip whose itinerary is not loaded — the all-trips list and
 *  the pre-snapshot skeleton — where the primary zone is all there is to read. */
export function tripToday(trip: TripWindow, now: Date, evidence?: ZoneEvidence): string {
  return evidence ? liveToday(now.getTime(), evidence) : todayInTz(trip.timezone, now);
}

export function tripPhase(trip: TripWindow, now: Date, evidence?: ZoneEvidence): TripPhase {
  const today = tripToday(trip, now, evidence);
  if (today < trip.startDate) return 'pre';
  if (today > trip.endDate) return 'past';
  return 'live';
}

/** Trip mode runs the trip's local calendar days [startDate, endDate] inclusive; Plan mode otherwise. */
export function deriveMode(trip: TripWindow, now: Date, evidence?: ZoneEvidence): Mode {
  return tripPhase(trip, now, evidence) === 'live' ? 'trip' : 'plan';
}

/** Calendar days remaining before startDate, counted from {@link tripToday} — null once
 *  the trip has started (or ended), since a countdown to departure stops being
 *  meaningful then, whether or not the mode is currently overridden. */
export function daysUntilStart(
  trip: TripWindow,
  now: Date,
  evidence?: ZoneEvidence,
): number | null {
  const today = tripToday(trip, now, evidence);
  if (today >= trip.startDate) return null;
  // Plain calendar days (no time-of-day) — UTC-midnight arithmetic diffs the
  // calendar day correctly without a timezone re-interpreting it.
  const days = Date.parse(`${trip.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(days / MS_PER_DAY);
}
