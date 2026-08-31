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

/** Where the marker sits: which daypart section, and before which of its events. */
export interface ShareNowLinePlacement {
  daypart: SharedDay['sections'][number]['daypart'];
  /** Index within that section's events. `events.length` means after all of them. */
  index: number;
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
  let sawATime = false;
  for (const section of timed) {
    for (const [index, event] of section.events.entries()) {
      const label = event.startLabel ?? event.endLabel;
      if (!label) continue;
      sawATime = true;
      // **The boundary is what has BEGUN**, so the marker goes above the first row that has
      // not started yet.
      //
      // This is where it deviates from `nowLinePlacement`, which compares an entry's END and
      // therefore puts the line ABOVE a row that is currently running. The two agree on
      // everything that does not contain `now`; they differ only inside a row, which is
      // exactly the case `now-line.ts` says an honest marker would render *inside* rather
      // than beside. Since neither can, each picks a side — and on THIS page the end-based
      // side is unusable: a shared day's first row is routinely an all-day container (a
      // guided tour, a pass, a booked activity), which is running for the whole afternoon and
      // drags the boundary to the top of the day, where a line at 14:30 sits above a 10:00
      // row and tells a reader following along that nothing has happened yet. Found by
      // opening the real page against the seeded Tokyo day, whose first row is 10:00–16:00.
      //
      // "Above the line has begun, below it has not" is a sentence that stays true either
      // way; unify it with the app's when `nowLinePlacement` grows its `inside` shape.
      if (dawnOrder(label) > nowOrder) return { daypart: section.daypart, index };
    }
  }
  if (!sawATime) return null;

  // Every timed row is behind us — the marker goes after the last of them.
  const last = timed[timed.length - 1];
  return { daypart: last.daypart, index: last.events.length };
}
