// Plan/Trip mode derivation (ADR-0016) — derived from trip dates + now, never
// stored on the Trip (docs/architecture/data-model.md). The manual override
// (state/mode-state.tsx) is session-only, in-memory UI state, not persisted —
// the app always comes back to auto-derived on a fresh load.
import type { Trip, ZoneEvidence } from '@waypoint/shared';
import { DEVICE_TIMEZONE, MS_PER_DAY } from '../constants';
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
 *  `evidence` is optional only for a trip whose itinerary is not loaded — the pre-snapshot
 *  skeleton's first mode — where the primary zone is all there is to read. A screen with no trip
 *  loaded at all counts from the device instead (`daysUntilStartOnDevice`). */
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
  return calendarDaysBetween(today, trip.startDate);
}

/** **Whole calendar days to `startDate` from the DEVICE's today** — for the screens with no
 *  trip loaded, the all-trips list and the join ticket, where the person is wherever the phone
 *  is and there is no itinerary to read (ADR-0107, 2026-09-09 amendment). The trip's primary
 *  zone is the far side's clock: at 00:34 at home the list said `מחרתיים` for a trip that started
 *  tomorrow (owner, 2026-09-10). Zero on the date itself and negative after it. */
export function daysUntilStartOnDevice(startDate: string, now: Date): number {
  return calendarDaysBetween(todayInTz(DEVICE_TIMEZONE, now), startDate);
}

/** Plain calendar days (no time-of-day) — UTC-midnight arithmetic diffs two `YYYY-MM-DD`
 *  days correctly without a timezone re-interpreting either. */
function calendarDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}
