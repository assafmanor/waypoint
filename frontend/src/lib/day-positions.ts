// **The day's positions, as a list you can choose from** (ADR-0161 §4).
//
// The drag reads positions one at a time, as the render walks the day's time tree and asks
// `lib/gaps.ts` what sits between two groups. A CHOOSER needs the same set up front, in
// order, each able to say what it is — "after the museum · 12:30" — so this derives them
// once from the day's timed events.
//
// It is not a second derivation of what free time IS: every position here comes from
// `freeBetween`/`freeBeforeFirst`/`freeAfterLast`/`freeWholeDay`, the same four the drag
// uses, so the two cannot disagree about a slot. What differs is only the walk — a flat
// list of timed events here, the render's group/cluster/transition tree there — and the
// flat one is right for a chooser: a cluster is two things at once, so "after it" is not a
// single answer, and the picker offers positions between top-level rows exactly as the
// chips do.
//
// Pure: no clock, no React, no copy. Labels are keys the caller renders (ADR-0009).
import type { TripEvent } from '@waypoint/shared';
import { byStart } from '../state/trip-state';
import {
  freeAfterLast,
  freeBeforeFirst,
  freeBetween,
  freeWholeDay,
  type Gap,
  type GapDefaults,
} from './gaps';

/** What a position is relative to, so the caller can name it. `AFTER` carries the row it
 *  follows; the two day-edge kinds carry nothing because the day itself is the reference. */
export const POSITION_AT = {
  /** Immediately after a row — "אחרי מוזיאון". The common case. */
  AFTER: 'after',
  /** Before the day's first row. */
  DAY_START: 'dayStart',
  /** After the day's last row. */
  DAY_END: 'dayEnd',
  /** The whole day, when nothing timed can hold a position (an empty day, a day of untimed
   *  rows, one with only booking transition points). */
  WHOLE_DAY: 'wholeDay',
} as const;
export type PositionAt = (typeof POSITION_AT)[keyof typeof POSITION_AT];

export interface DayPosition {
  /** Stable within a day: the slot's own start, which is what makes a position identical to
   *  the drag's `gapKey` for the same place in the day. */
  key: string;
  at: PositionAt;
  /** The row this position follows, when `at` is `AFTER`. */
  afterEvent?: TripEvent;
  /** The row this position precedes, when there is one — a chooser can say "before the
   *  flight", which is the more useful half when the next row is a hard anchor. */
  beforeEvent?: TripEvent;
  /** The free time here and the slot a drop into it lands on (`lib/gaps.ts`). `minutes` can
   *  be zero: two rows that touch still have a position between them. */
  free: Gap;
}

const keyOf = (fill: GapDefaults) => `${fill.date}T${fill.start}`;

/**
 * Two positions can name the **same instant**, and then they are one position: a first event
 * sitting on the day's opening with no duration makes "before it" and "after it" the same
 * slot, so the day's head collides with whatever follows it. A chooser showing 07:00 twice is
 * the visible half; the duplicate React key is the loud one.
 *
 * Keeps the roomier of the two, because the head's zero minutes would otherwise hide the free
 * time the other one is reporting — thirteen hours, in the case that found this.
 */
const oncePerSlot = (positions: DayPosition[]): DayPosition[] => {
  const best = new Map<string, DayPosition>();
  for (const position of positions) {
    const seen = best.get(position.key);
    if (!seen || position.free.minutes > seen.free.minutes) best.set(position.key, position);
  }
  return [...best.values()]; // Map keeps insertion order, so the day's order survives.
};

/**
 * Every position in a day, in day order.
 *
 * `exclude` is the event being moved: the positions **immediately** either side of it are
 * dropped, because "put this just above itself" and "…just below itself" are the two places
 * it already is. Same rule the drag applies to its seams, and for the same reason — except
 * that a chooser has no chip/seam distinction to make, so it drops both regardless of how
 * much free time is there. (The drag keeps a *chip* beside the held row because a chip is a
 * visible offer of free time; a list of words has no such thing to preserve.)
 *
 * Excluding the moved event also re-joins the day around it: with it gone from the walk, the
 * position "after the row above" and "before the row below" become ONE position rather than
 * two, which is what the list should offer.
 */
export function dayPositions(
  dayEvents: TripEvent[],
  date: string,
  tz: string,
  options: { exclude?: string } = {},
): DayPosition[] {
  const timed = dayEvents
    .filter((e) => e.startsAt && e.id !== options.exclude)
    .slice()
    .sort(byStart);
  if (timed.length === 0) {
    const free = freeWholeDay(date, tz);
    return [{ key: keyOf(free.fill), at: POSITION_AT.WHOLE_DAY, free }];
  }

  const out: DayPosition[] = [];
  const head = freeBeforeFirst(timed, date, tz);
  if (head) {
    out.push({
      key: keyOf(head.fill),
      at: POSITION_AT.DAY_START,
      beforeEvent: timed[0],
      free: head,
    });
  }
  for (let i = 0; i < timed.length - 1; i++) {
    const free = freeBetween(timed[i], timed[i + 1], tz);
    if (!free) continue;
    out.push({
      key: keyOf(free.fill),
      at: POSITION_AT.AFTER,
      afterEvent: timed[i],
      beforeEvent: timed[i + 1],
      free,
    });
  }
  const tail = freeAfterLast(timed, date, tz);
  if (tail) {
    out.push({
      key: keyOf(tail.fill),
      at: POSITION_AT.DAY_END,
      afterEvent: timed[timed.length - 1],
      free: tail,
    });
  }
  return oncePerSlot(out);
}

/**
 * **The first position with room for something of `minutes`** — the opening offer when a
 * surface has to prefill one rather than ask (ADR-0161 §4).
 *
 * Trip mode's quick-schedule is that surface: it is a Tier-1 one-tap verb (ADR-0025), so it
 * defaults rather than asking, and its default used to be `nextSlot` — the end of the day's
 * LAST event. So the app's opening offer for every idea was "after everything", including on
 * a day with a three-hour hole in the middle of it, which is the second half of the `שבץ`
 * report.
 *
 * Falls back to the last position, which is that same "after everything" — the honest answer
 * when nothing on the day has room for this.
 */
export function firstPositionFitting(
  positions: DayPosition[],
  minutes: number,
): DayPosition | null {
  return positions.find((p) => p.free.minutes >= minutes) ?? positions.at(-1) ?? null;
}
