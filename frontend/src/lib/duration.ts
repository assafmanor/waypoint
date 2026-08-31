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
  MS_PER_MINUTE,
  SECONDS_PER_MINUTE,
} from '../constants';
import { ltrIsolate } from './bidi';
import { dayPhrase, monthPhrase, weekPhrase, yearPhrase } from './hebrew';
import { t } from '../i18n/he';

/**
 * **"How long ago", for anything with a timestamp** — `לפני 4 ד׳`, `לפני 3 ימים`,
 * `לפני שבועיים`, and `עכשיו` under a minute.
 *
 * Lifted out of `notes.ts`'s `noteWhen` when the public shared reader needed the same
 * sentence for its freshness line (ADR-0213's eleventh amendment §4): the two lines that
 * make it are the ladder plus the prefix, and neither is a note's business. `noteWhen` is
 * now its first caller rather than its owner.
 *
 * Under a minute is `עכשיו`, and so is a timestamp that will not parse — through
 * {@link formatDuration}'s own non-finite guard. For a note that is a row this device has
 * just written and not yet had stamped, so "now" is the truth rather than a fallback; for a
 * projection it is a body that failed the schema long before reaching here.
 */
export function agoLabel(iso: string, nowMs: number): string {
  const minutes = Math.floor((nowMs - Date.parse(iso)) / MS_PER_MINUTE);
  const elapsed = formatDuration(minutes);
  return elapsed ? t.changeFeed.relTime.agoPrefix(elapsed) : t.changeFeed.relTime.now;
}

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
  // **Nothing the ladder can say is nothing to say** (2026-08-26). A ⁦20m⁩ hop is ⁦24⁩ seconds, which
  // rounded onto ADR-0114's minutes rung is zero — and `~0 דק׳` is not a hedged duration, it is a
  // row about nothing. The guard above only caught a non-positive input, so anything under half a
  // minute walked straight through it and printed the zero.
  if (total <= 0) return null;
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

/**
 * **What is free, as a phrase that agrees with itself** (ADR-0206 §AH1) — `46 דק׳ פנויות`,
 * `שעתיים פנויות`, `שעה פנויה`.
 *
 * The ladder above is noun-led everywhere else (`פנוי · 2:40 שע׳`) precisely so nothing has to
 * agree with a number it does not expose. Here the natural word order puts the number first, and
 * the shipped dodge for that was `פנוי לפני 46 דק׳` — which the owner read as bad Hebrew and was
 * right to (2026-08-26). So the agreement is composed instead, and it is cheap: `hoursPhrase` has
 * exactly two singular rungs, an exact hour and one minute.
 *
 * `null` below a minute, which is the same answer `approxDuration` gives for the same reason —
 * `0 דק׳ פנויות` is a sentence about nothing. **Whether a small-but-real length is worth stating
 * is a different question and not this function's**: that is `statesFreeTime` (`lib/gaps.ts`),
 * asked by the caller, because it is a judgement about the day rather than about the words.
 */
export function freeTimePhrase(minutes: number): string | null {
  if (!Number.isFinite(minutes)) return null;
  const total = Math.round(minutes);
  if (total <= 0) return null;
  if (total === 1) return t.travel.freeTimeOneMinute;
  if (total === MINUTES_PER_HOUR) return t.travel.freeTimeOneHour;
  return t.travel.freeTime(hoursPhrase(total));
}

/**
 * **By how much a journey misses the hole it sits in** — `חסרות 18 דק׳ לדרך`.
 *
 * The number to act on, and the only one: how much has to move. Agreement is the exact hour's
 * alone, because `TRAVEL_FIT_TOLERANCE_SECONDS` means a reported shortfall never rounds below two
 * minutes — so there is no singular-minute rung to reach.
 */
export function shortfallPhrase(minutes: number): string | null {
  if (!Number.isFinite(minutes)) return null;
  const total = Math.round(minutes);
  if (total <= 0) return null;
  if (total === MINUTES_PER_HOUR) return t.travel.shortfallOneHour;
  return t.travel.shortfall(hoursPhrase(total));
}

/**
 * **How many of the day's journeys do not fit** — `שתי דרכים לא נכנסות` (ADR-0206 §V1.7 / §AN).
 *
 * Composed here, beside `shortfallPhrase` above, because it is the same fact one scope up and
 * the two must not drift into two vocabularies. `null` at zero, which is the ordinary day: the
 * caller has nothing to render and there is deliberately no positive phrase to reach for — a day
 * that fits says nothing at all, so `daySequenceFits`-style `true` can never become a `✓` on a
 * day nobody measured (§D4).
 *
 * The three rungs are Hebrew agreement, not a style: `דרך אחת לא נכנסת` / `שתי דרכים לא נכנסות` /
 * `3 דרכים לא נכנסות`. The count is a numeral run inside Hebrew prose from the third rung on, so
 * it takes `ltrIsolate` (ADR-0118) — the first two spell the number as a word and need none.
 */
export function infeasibleLegsPhrase(count: number): string | null {
  if (!Number.isFinite(count)) return null;
  const total = Math.round(count);
  if (total <= 0) return null;
  if (total === 1) return t.travel.dayInfeasibleOne;
  if (total === 2) return t.travel.dayInfeasibleTwo;
  return t.travel.dayInfeasible(ltrIsolate(String(total)));
}

/**
 * **By how much the day is over, added up** — `חסרות 35 דק׳`.
 *
 * `shortfallPhrase`'s sibling and its agreement rule is the same one: only the exact hour has a
 * singular rung, because `TRAVEL_FIT_TOLERANCE_SECONDS` keeps any reported shortfall above a
 * minute and a SUM of such shortfalls is larger still.
 */
export function dayShortfallPhrase(minutes: number): string | null {
  if (!Number.isFinite(minutes)) return null;
  const total = Math.round(minutes);
  if (total <= 0) return null;
  if (total === MINUTES_PER_HOUR) return t.travel.dayShortfallOneHour;
  return t.travel.dayShortfall(hoursPhrase(total));
}

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
