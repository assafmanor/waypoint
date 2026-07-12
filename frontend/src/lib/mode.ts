// Plan/Trip mode derivation (ADR-0016) — derived from trip dates + now, never
// stored on the Trip (docs/architecture/data-model.md). The manual override
// (state/mode-state.tsx) is session-only, in-memory UI state, not persisted —
// the app always comes back to auto-derived on a fresh load.
import type { Trip } from '@waypoint/shared';
import { MS_PER_DAY } from '../constants';
import { todayInTz } from './time';

export type Mode = 'plan' | 'trip';

/** Trip mode runs the trip's local calendar days [startDate, endDate] inclusive; Plan mode otherwise. */
export function deriveMode(
  trip: Pick<Trip, 'startDate' | 'endDate' | 'timezone'>,
  now: Date,
): Mode {
  const today = todayInTz(trip.timezone, now);
  return today >= trip.startDate && today <= trip.endDate ? 'trip' : 'plan';
}

/** Trip-local calendar days remaining before startDate — null once the trip
 *  has started (or ended), since a countdown to departure stops being
 *  meaningful then, whether or not the mode is currently overridden. */
export function daysUntilStart(
  trip: Pick<Trip, 'startDate' | 'endDate' | 'timezone'>,
  now: Date,
): number | null {
  const today = todayInTz(trip.timezone, now);
  if (today >= trip.startDate) return null;
  // Plain calendar days (no time-of-day) — UTC-midnight arithmetic diffs the
  // calendar day correctly without a timezone re-interpreting it.
  const days = Date.parse(`${trip.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(days / MS_PER_DAY);
}
