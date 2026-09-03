// **WHERE "NOW" LANDS INSIDE A SHARED DAY** (ADR-0213's eleventh amendment §5).
//
// The app's own answer to this is `lib/now-line.ts`'s `nowLinePlacement`, and it cannot be
// reused: it reads instants (`atMs`, `endsAt`) off `DayEntry`, and the public projection
// deliberately ships pre-formatted `HH:MM` labels so two renderers cannot format one instant
// two ways. What this keeps from it is the SHAPE — a marker between rows, and after them all
// once every one is behind. What it changes is which end of a row decides the boundary; the
// comparison below carries that argument, and the real day that forced it.
//
// **Which is cheaper than it sounds, because the labels and "now" come out of the same
// function.** `shareTimeLabel` built every `startLabel` in the projection
// (`sharing-projection.service.ts` calls it for both ends of every event), so the caller
// hands us the clock through that same formatter and the comparison stays inside the one
// derivation the pre-formatting rule exists to protect. Two zero-padded `HH:MM` strings also
// order lexicographically exactly as they order chronologically — but they are converted to
// minutes here anyway, for the reason immediately below.
//
// **The share's day starts at dawn, and this has to agree with the grouping.**
// `sharePreviousNight` files a 00:30 landing on the night of the day BEFORE, so a card's
// `night` section can hold a label like `00:30` that is chronologically last, not first.
// Ordering those labels as raw clock times would put the marker above an event that happens
// nineteen hours later. `dawnOrder` adds a day to anything before 05:00 — the same statement
// `shareDaypart` already makes by treating `night` as its fallthrough.
import { SHARE_DAYPART, SHARE_DAYPART_START_HOUR, type SharedDay } from '@waypoint/shared';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from '../constants';
import { nowInside, type NowSpan } from './now-inside';

/** One event of the day, named the way this page can find it again. */
export interface ShareNowEventRef {
  daypart: SharedDay['sections'][number]['daypart'];
  index: number;
}

/** Where the marker sits: which daypart section, and before which of its events. */
export interface ShareNowLinePlacement {
  daypart: SharedDay['sections'][number]['daypart'];
  /** Index within that section's events. `events.length` means after all of them. */
  index: number;
  /**
   * **The row the moment is INSIDE, when one holds it** (ADR-0217), and how far through it
   * is. When this is set the marker is nailed to that row and `daypart`/`index` are not
   * drawn — they stay populated because a boundary is still where the marker would go if
   * nothing held the moment, and one of this file's own tests reads it.
   */
  inside: (ShareNowEventRef & { thruFrac: number }) | null;
}

/**
 * A `HH:MM` label as minutes from the share's own day start, so a pre-dawn hour sorts last
 * rather than first. Non-finite input (a label this build does not understand) sorts last as
 * well — a marker at the end of a day is wrong by less than one at the start of it.
 */
function dawnOrder(label: string): number {
  const [hours, minutes] = label.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.POSITIVE_INFINITY;
  const raw = hours * MINUTES_PER_HOUR + minutes;
  return hours < SHARE_DAYPART_START_HOUR[SHARE_DAYPART.MORNING] ? raw + MINUTES_PER_DAY : raw;
}

/**
 * **Where the now-line goes in this day**, or `null` for the days it must not be drawn on.
 *
 * `null` in three cases, and each is a refusal rather than a gap:
 *
 *  - **The day crosses a time zone.** `nowLabel` is the wall clock in the trip's PRIMARY
 *    zone, but a travel day's labels are resolved per event in their own display zone
 *    (ADR-0107), so the comparison is against two different clocks and would be wrong by the
 *    shift. A day carrying `zoneShiftMinutes` is exactly that day — and it is also the day a
 *    now-line adds least, since what a reader wants there is the flight, which the journey
 *    block already frames.
 *  - **Nothing on the day is timed.** At Summary no event carries a label at all, and a day
 *    of only `flexible` entries has no order for a marker to sit in.
 *  - **No section is left to hold it**, which is the same case stated from the other end.
 *
 * `flexible` is skipped throughout: it is the day's unplaced remainder, deliberately rendered
 * last, so it is not part of the day's chronology and a marker inside it would claim it was.
 */
/**
 * **WHICH ROW HOLDS THE MOMENT, THROUGH THE APP'S OWN RULE** (ADR-0217 §2).
 *
 * `lib/now-inside.ts` is deliberately unit-agnostic — the day surfaces hand it epoch
 * milliseconds and this hands it `dawnOrder`'s minutes — so "innermost" is one rule for
 * three surfaces rather than a second copy that can drift. What this file supplies is the
 * SPANS, and the only interesting thing about them is which events have one:
 *
 * **An event needs BOTH ends.** `startLabel` alone is a point (a landing, a check-in, a
 * call), and ADR-0217 §4 already says a point cannot hold a moment — it is ahead of us or
 * behind us, never around us. Here that falls out of the data instead of being a rule: no
 * end, no span. And midnight needs no special case, because `dawnOrder` adds a day to a
 * pre-dawn label at both ends alike, so a 22:00–01:30 event measures 210 minutes long.
 */
function heldBy(
  timed: SharedDay['sections'],
  nowOrder: number,
): (ShareNowEventRef & { thruFrac: number }) | null {
  const spans: NowSpan[] = [];
  for (const [section, index] of timed.flatMap((s) => s.events.map((_, i) => [s, i] as const))) {
    const event = section.events[index];
    if (!event.startLabel || !event.endLabel) continue;
    spans.push({
      key: `${section.daypart}#${index}`,
      start: dawnOrder(event.startLabel),
      end: dawnOrder(event.endLabel),
    });
  }
  const held = nowInside(spans, nowOrder);
  if (!held) return null;
  const [daypart, index] = held.key.split('#');
  return {
    daypart: daypart as ShareNowEventRef['daypart'],
    index: Number(index),
    thruFrac: held.thruFrac,
  };
}

export function shareNowLine(day: SharedDay, nowLabel: string): ShareNowLinePlacement | null {
  const timed = day.sections.filter((section) => section.daypart !== SHARE_DAYPART.FLEXIBLE);
  if (timed.length === 0) return null;
  if (
    day.sections.some((section) =>
      section.events.some((event) => event.zoneShiftMinutes !== undefined),
    )
  ) {
    return null;
  }

  const nowOrder = dawnOrder(nowLabel);
  const inside = heldBy(timed, nowOrder);
  let sawATime = false;
  for (const section of timed) {
    for (const [index, event] of section.events.entries()) {
      const label = event.startLabel ?? event.endLabel;
      if (!label) continue;
      sawATime = true;
      // **The boundary is what has BEGUN**, so the marker goes above the first row that has
      // not started yet — and since ADR-0217 that is a statement about BOUNDARIES only.
      //
      // This used to be a deviation from `nowLinePlacement`, which compared an entry's END
      // and therefore put the line above a row that was currently running, and the comment
      // here closed with "unify it with the app's when `nowLinePlacement` grows its `inside`
      // shape". It has. Neither side of that choice was right: start-based put a line BELOW
      // two rows that were still running (a 10:00–16:00 tour and a 14:00–15:00 shrine at
      // 14:30, drawn in `the-shared-reader-gets-the-playhead-v1.html` §1), and end-based
      // dragged the boundary to the top of any day whose first row is an all-day container.
      // A row that holds the moment is now answered by `inside` below, so this walk only has
      // to answer where the marker goes when NOTHING holds it — where both rules agree.
      if (dawnOrder(label) > nowOrder) return { daypart: section.daypart, index, inside };
    }
  }
  if (!sawATime) return null;

  // Every timed row is behind us — the marker goes after the last of them.
  const last = timed[timed.length - 1];
  return { daypart: last.daypart, index: last.events.length, inside };
}
