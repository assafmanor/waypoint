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
  SECONDS_PER_MINUTE,
} from '../constants';
import { ltrIsolate } from './bidi';
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

/**
 * **A travel time, hedged** (ADR-0206 §D5 over §D3) — `~23 דק׳`, `~1:13 שע׳`, `כשעה`.
 *
 * The ladder is `hoursPhrase`'s, untouched: an estimate is a duration and this app has one
 * duration ladder (ADR-0114, read a second way). A route that answers 1,268 s is `~21 דק׳` and
 * one that answers 4,355 s is `~1:13 שע׳`, never `~72 דק׳`. What this adds is the `~`, because an
 * OSM pedestrian estimate is an estimate and §D5 refuses a number that claims otherwise.
 *
 * **The `~` goes INSIDE the isolate, with the digits.** It is bidi-neutral, so beside a numeral
 * in an RTL flow it resolves right and lands on the far side of the number: `~40` renders `40~`.
 * ADR-0206 §Z5 found it by rendering the first routes mockup and it reached the second one
 * anyway, which is why it is stated here rather than left to each caller.
 *
 * **The exact-hour rungs are words, so they take the Hebrew prefix instead.** `שעה` hedged is
 * `כשעה`; a tilde in front of a Hebrew word means nothing and is a second bidi trap. That is
 * also why the number-led rungs are rebuilt here rather than sliced out of the phrase — the head
 * is computed, so nothing depends on parsing `hoursPhrase`'s output back apart.
 *
 * `null` for nothing to measure, exactly as `formatDuration` answers it — a zero-second leg is
 * two stops that are one place (`ROUTE_MIN_CROW_M`), which is §D4's absence and not a `0 דק׳`.
 */
export function approxDuration(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  const h = Math.floor(total / MINUTES_PER_HOUR);
  const m = total % MINUTES_PER_HOUR;
  if (h && !m) return `${t.common.about}${hoursPhrase(total)}`;
  const head = h ? `${h}:${String(m).padStart(2, '0')}` : String(m);
  const phrase = hoursPhrase(total);
  return `${ltrIsolate(`~${head}`)}${phrase.slice(head.length)}`;
}

/** **The same hedge, from the unit a route answers in.** Every consumer in the routes epic holds
 *  SECONDS — `TravelEstimate.durationSeconds`, `remainingTravelSeconds`, `DayJourney` — and each
 *  of them was dividing by a bare `60` at its own call site, which is the literal
 *  `frontend/CLAUDE.md` asks to name once it has a second reader. The rounding stays
 *  `approxDuration`'s, so the hero's `~40 דק׳` and the day's are one number. */
export const approxTravelTime = (seconds: number): string | null =>
  approxDuration(seconds / SECONDS_PER_MINUTE);

/** **The clock jump, as a sentence** (session 215) — `מזיזים את השעון שעה קדימה`.
 *
 *  The lifted hero's form of `ZoneShiftPill`'s `🕐 +1 ש׳`, which stays on the collapsed
 *  board: same number, one elevation up, in words. Owner's ask, and the reason it is worth
 *  copy is that the pill never says which way to turn the hands.
 *
 *  Two things it deliberately does not do. It invents **no number word** — the length is
 *  `hoursPhrase`, so a fractional zone (India's `+2:30`) reads
 *  `מזיזים את השעון 2:30 שע׳ קדימה` rather than growing a `וחצי` this app has nowhere
 *  else. And it **derives the direction from the sign** rather than from anything the
 *  caller decides: getting `קדימה`/`אחורה` backwards is worse than the pill it replaces.
 *
 *  `null` for no shift at all, which is every single-zone trip — the same gate the pill
 *  already has, so nothing renders an empty sentence. */
export function clockShiftSentence(minutes: number): string | null {
  if (!minutes) return null;
  const direction = minutes > 0 ? t.board.clockForward : t.board.clockBack;
  return t.board.clockShift(hoursPhrase(Math.abs(minutes)), direction);
}

/** An elapsed length (in whole minutes) phrased in the largest ladder rung it
 *  fills, the count rounded to nearest: minutes < an hour, hours (H:MM) < a day,
 *  then days / weeks / months / years. `unit === 'hours'` pins it to the hours
 *  rung regardless of length (transport, ADR-0084). Returns null when there's
 *  nothing to measure (zero/negative elapsed).
 *
 *  **`NaN` is nothing to measure too, and the guard belongs here** rather than at each
 *  caller: `NaN <= 0` is false, so an unparseable date walked the whole ladder and fell out
 *  of its last rung as `לפני NaN שנים` on a note whose timestamp had not landed yet. Every
 *  rung's comparison is false for `NaN`, so any caller that can hold a date it did not
 *  write is one `Date.parse` away from the same sentence. */
export function formatDuration(minutes: number, unit: DurationUnit = 'auto'): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (unit === 'hours' || minutes < MINUTES_PER_DAY) return hoursPhrase(minutes);

  const days = minutes / MINUTES_PER_DAY;
  if (days < DAYS_PER_WEEK) return dayPhrase(Math.round(days));
  if (days < DAYS_PER_MONTH) return weekPhrase(Math.round(days / DAYS_PER_WEEK));
  if (days < DAYS_PER_YEAR) return monthPhrase(Math.round(days / DAYS_PER_MONTH));
  return yearPhrase(Math.round(days / DAYS_PER_YEAR));
}
