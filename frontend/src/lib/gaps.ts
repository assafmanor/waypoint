// Gap detection for the Plan-mode builder: the empty stretch between two
// consecutive events on a day, surfaced as a "fill this gap" chip.
import type { TripEvent } from '@waypoint/shared';
import { isoToTimeInput } from './time';

/** Below this, the gap is just breathing room — no chip. */
export const GAP_MIN_MINUTES = 60;

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
  const minutes = Math.round((Date.parse(b.startsAt) - Date.parse(aEnd)) / 60000);
  if (minutes < GAP_MIN_MINUTES) return null;
  return {
    minutes,
    fill: { date: a.date, start: isoToTimeInput(aEnd, tz), end: isoToTimeInput(b.startsAt, tz) },
  };
}
