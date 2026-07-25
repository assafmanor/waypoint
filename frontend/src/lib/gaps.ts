// Gap detection for the Plan-mode builder: an empty stretch of a day, surfaced as
// a "fill this gap" chip — between two consecutive events, and (session-123) at the
// day's two edges, before the first event and after the last.
import type { TripEvent } from '@waypoint/shared';
import { DAY_WINDOW } from '../constants';
import { isoToTimeInput, zonedIso } from './time';

const LAST_MINUTE_OF_DAY = 23 * 60 + 59; // 23:59 — the prefill slot stays same-day
const pad = (n: number) => String(n).padStart(2, '0');
const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Minutes since the day's own local midnight. An overnight end (02:00 the next
 *  morning, ADR-0037) reads as ≥ 1440 rather than as an early-morning slot. */
const minutesInto = (iso: string, dayStartMs: number) =>
  Math.round((Date.parse(iso) - dayStartMs) / 60000);
const localMidnight = (date: string, tz: string) => Date.parse(zonedIso(date, '00:00', tz));
const startsOf = (dayEvents: TripEvent[]) =>
  dayEvents.map((e) => e.startsAt).filter((v): v is string => Boolean(v));
const endsOf = (dayEvents: TripEvent[]) =>
  dayEvents.map((e) => e.endsAt ?? e.startsAt).filter((v): v is string => Boolean(v));

/** Below this, the gap is just breathing room — no chip. */
export const GAP_MIN_MINUTES = 60;

/** Default length of an event dropped into a gap. A big (e.g. 9h) gap shouldn't
 *  prefill a 9h event — start a normal block at the gap's start; the user can
 *  extend it. Capped at the gap itself so a small gap fills exactly. */
export const GAP_FILL_MINUTES = 60;

/** Prefill for a new/scheduled event dropped into the gap: the gap's own slot. */
export type GapDefaults = { date: string; start: string; end: string };

/** Free time, and the slot a drop into it lands on. */
export type Gap = { minutes: number; fill: GapDefaults };

/**
 * Minutes of dead time between event `a` and the next event `b`, plus the gap's
 * wall-clock endpoints for prefilling. Null unless the gap clears the threshold.
 *
 * Measures from `a`'s end to `b`'s start — but most builder events are created
 * start-only (the form's end time is optional), so an event with no `endsAt`
 * is treated as its start instant rather than disqualifying the gap. Otherwise
 * a day of start-only events would never surface a single gap (the bug the
 * screenshot caught).
 */
export function gapBetween(a: TripEvent, b: TripEvent, tz: string): Gap | null {
  const aEnd = a.endsAt ?? a.startsAt;
  if (!aEnd || !b.startsAt) return null;
  const startMs = Date.parse(aEnd);
  const nextMs = Date.parse(b.startsAt);
  const minutes = Math.round((nextMs - startMs) / 60000);
  if (minutes < GAP_MIN_MINUTES) return null;
  // Prefill a default-length block at the gap's start, never the whole gap.
  const fillEndMs = Math.min(startMs + GAP_FILL_MINUTES * 60000, nextMs);
  return {
    minutes,
    fill: {
      date: a.date,
      start: isoToTimeInput(aEnd, tz),
      end: isoToTimeInput(new Date(fillEndMs).toISOString(), tz),
    },
  };
}

/**
 * The day's two EDGE gaps — the free time `gapBetween` structurally cannot see,
 * because each has an event on one side only (session-123).
 *
 * Both hug the event they are named for: "before the first" prefills the block
 * ENDING at the first event's start, "after the last" the block STARTING at the
 * last one's end. The day's window is a floor/ceiling on how far out they reach,
 * never the thing they aim at — dropping something "before the 10:00 tour" and
 * getting a 07:00 slot would answer a question nobody asked.
 *
 * Null whenever the edge has no room: no timed event to hang off (an untimed-only
 * day), less than GAP_MIN_MINUTES of space, or a last event that already runs past
 * midnight (ADR-0037) and so leaves no same-day tail at all (ADR-0036).
 */
export function gapBeforeFirst(dayEvents: TripEvent[], date: string, tz: string): Gap | null {
  const starts = startsOf(dayEvents);
  if (starts.length === 0) return null;
  const dayStartMs = localMidnight(date, tz);
  const firstMin = Math.min(...starts.map((v) => minutesInto(v, dayStartMs)));
  // An event before the day's window — a 05:30 flight — still has the small hours
  // in front of it, and that is exactly when "add something before it" is asked.
  const floorMin = firstMin >= DAY_WINDOW.START_HOUR * 60 ? DAY_WINDOW.START_HOUR * 60 : 0;
  const minutes = firstMin - floorMin;
  if (minutes < GAP_MIN_MINUTES) return null;
  return {
    minutes,
    fill: {
      date,
      start: toHHMM(Math.max(floorMin, firstMin - GAP_FILL_MINUTES)),
      end: toHHMM(firstMin),
    },
  };
}

export function gapAfterLast(dayEvents: TripEvent[], date: string, tz: string): Gap | null {
  const ends = endsOf(dayEvents);
  if (ends.length === 0) return null;
  const dayStartMs = localMidnight(date, tz);
  const lastMin = Math.max(...ends.map((v) => minutesInto(v, dayStartMs)));
  const minutes = LAST_MINUTE_OF_DAY - lastMin;
  if (minutes < GAP_MIN_MINUTES) return null;
  // The slot itself is the day's next opening — the same one the foot-of-the-day
  // add button offers, so the chip and the button cannot drift apart.
  return { minutes, fill: nextSlot(dayEvents, date, tz) };
}

/** A GAP_FILL_MINUTES block starting where the day's last event ends (the open
 *  tail gapBetween can't see), or at DAY_WINDOW.START_HOUR on an empty day.
 *  Max end, not last-by-start: a long block can outlast a later-starting one.
 *  Kept within the same day (ADR-0036): the end clamps to 23:59, and drops
 *  entirely when the start leaves no room, so a late last event yields a
 *  start-only prefill instead of a block spilling past midnight. */
export function nextSlot(dayEvents: TripEvent[], date: string, tz: string): GapDefaults {
  const dayStartMs = localMidnight(date, tz);
  const ends = endsOf(dayEvents).map((v) => minutesInto(v, dayStartMs));
  const startMin = Math.min(
    ends.length ? Math.max(...ends) : DAY_WINDOW.START_HOUR * 60,
    LAST_MINUTE_OF_DAY,
  );
  const endMin = Math.min(startMin + GAP_FILL_MINUTES, LAST_MINUTE_OF_DAY);
  return {
    date,
    start: toHHMM(startMin),
    end: endMin > startMin ? toHHMM(endMin) : '',
  };
}
