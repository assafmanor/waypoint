// Gap detection for the Plan-mode builder: the empty stretch between two
// consecutive events on a day, surfaced as a "fill this gap" chip.
import type { TripEvent } from '@waypoint/shared';
import { DAY_WINDOW } from '../constants';
import { isoToTimeInput, zonedIso } from './time';

/** Below this, the gap is just breathing room — no chip. */
export const GAP_MIN_MINUTES = 60;

/** Default length of an event dropped into a gap. A big (e.g. 9h) gap shouldn't
 *  prefill a 9h event — start a normal block at the gap's start; the user can
 *  extend it. Capped at the gap itself so a small gap fills exactly. */
export const GAP_FILL_MINUTES = 60;

/** Prefill for a new/scheduled event dropped into the gap: the gap's own slot. */
export type GapDefaults = { date: string; start: string; end: string };

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
export function gapBetween(
  a: TripEvent,
  b: TripEvent,
  tz: string,
): { minutes: number; fill: GapDefaults } | null {
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

/** A GAP_FILL_MINUTES block starting where the day's last event ends (the open
 *  tail gapBetween can't see), or at DAY_WINDOW.START_HOUR on an empty day.
 *  Max end, not last-by-start: a long block can outlast a later-starting one. */
export function nextSlot(dayEvents: TripEvent[], date: string, tz: string): GapDefaults {
  const ends = dayEvents
    .map((e) => e.endsAt ?? e.startsAt)
    .filter((v): v is string => Boolean(v))
    .map((v) => Date.parse(v));
  const startMs = ends.length
    ? Math.max(...ends)
    : Date.parse(zonedIso(date, `${String(DAY_WINDOW.START_HOUR).padStart(2, '0')}:00`, tz));
  const endMs = startMs + GAP_FILL_MINUTES * 60000;
  return {
    date,
    start: isoToTimeInput(new Date(startMs).toISOString(), tz),
    end: isoToTimeInput(new Date(endMs).toISOString(), tz),
  };
}
