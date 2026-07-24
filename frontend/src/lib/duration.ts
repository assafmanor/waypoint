// The one elapsed-duration ladder (ADR-0114). Every "how long is this" read-out
// — a booking's משך on the Index row and detail view, the WhenField span
// read-out, the TimePicker's start+duration chip — formats through here, so the
// unit a length rounds to is decided in ONE place, by ELAPSED time, never by how
// many calendar dates a span happens to touch. A 23:00→00:00 booking is an hour,
// not "יומיים".
//
// Two per-category overrides layer on top (ADR-0084), handled by the callers, not
// here: `nights` (lodging) counts calendar nights, and `hours` (transport) stays
// in hours even past a day — a 30h journey reads "30 שעות", never "יום".
import { type DurationUnit } from '@waypoint/shared';
import {
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
} from '../constants';
import { dayPhrase, monthPhrase, weekPhrase, yearPhrase } from './hebrew';
import { t } from '../i18n/he';

/** Hours+minutes as a phrase ("5:45 שע׳" / "שעתיים" / "45 דק׳"), reusing the
 *  event picker's duration wording so it never drifts between surfaces. Reads in
 *  minutes below an hour and in hours above it, with no day step-up — this is the
 *  `hours` unit's read-out, and it's also the ladder's own sub-day rung. */
export function hoursPhrase(minutes: number): string {
  const h = Math.floor(minutes / MINUTES_PER_HOUR);
  const m = minutes % MINUTES_PER_HOUR;
  if (h && m) return t.eventForm.durHoursMinutes(h, m);
  if (h)
    return h === 1
      ? t.eventForm.durHour
      : h === 2
        ? t.eventForm.durTwoHours
        : t.eventForm.durHours(h);
  return t.eventForm.durMinutes(m);
}

/** An elapsed length (in whole minutes) phrased in the largest ladder rung it
 *  fills, the count rounded to nearest: minutes < an hour, hours (H:MM) < a day,
 *  then days / weeks / months / years. `unit === 'hours'` pins it to the hours
 *  rung regardless of length (transport, ADR-0084). Returns null when there's
 *  nothing to measure (zero/negative elapsed). */
export function formatDuration(minutes: number, unit: DurationUnit = 'auto'): string | null {
  if (minutes <= 0) return null;
  if (unit === 'hours' || minutes < MINUTES_PER_DAY) return hoursPhrase(minutes);

  const days = minutes / MINUTES_PER_DAY;
  if (days < DAYS_PER_WEEK) return dayPhrase(Math.round(days));
  if (days < DAYS_PER_MONTH) return weekPhrase(Math.round(days / DAYS_PER_WEEK));
  if (days < DAYS_PER_YEAR) return monthPhrase(Math.round(days / DAYS_PER_MONTH));
  return yearPhrase(Math.round(days / DAYS_PER_YEAR));
}
