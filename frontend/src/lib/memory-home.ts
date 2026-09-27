// **What the memory Home says about a finished trip** (ADR-0240 §4), as values ready to print.
//
// The numbers are `tripRecap`'s (ADR-0239 §9) and nothing here recounts them. What this decides
// is only which figures earn a tile and how each one reads: an estimate carries `~`, a figure
// the trip has no source for is not a tile at all, and one that rows still unmarked could move
// says how many on its second line.
import {
  EVENT_CATEGORY,
  iconForCategory,
  recapHappened,
  tripDates,
  type RecapFigure,
  type TripRecap,
} from '@waypoint/shared';
import { DISTANCE_STEP, MEMORY_DAY_GLYPHS, MEMORY_FIGURES_MAX } from '../constants';
import { t } from '../i18n/he';
import { dayListEvents } from './day-entries';
import { dayShot } from './day-photo';
import { dayHeadTitle, type DayFactsInput } from './day-title';
import { dayOfMonth, formatDayMonth, weekdayLetter } from './time';

export interface MemoryFigure {
  key: 'places' | 'air' | 'shift' | 'ground' | 'foot';
  value: string;
  label: string;
  /** Unmarked rows that could still move this figure; absent at zero. */
  unresolved?: number;
}

const ESTIMATE_MARK = '~';
const MINUTES_PER_HOUR = 60;

/** Kilometres as a tile prints them: one decimal below the whole-km threshold, grouped whole
 *  kilometres above it — the same steps `formatDistance` uses, without its unit, which the
 *  tile's label carries. */
export function recapKm(meters: number): string {
  const km = meters / DISTANCE_STEP.KM_FROM_M;
  return km < DISTANCE_STEP.WHOLE_KM_FROM
    ? String(Math.round(km * 10) / 10)
    : Math.round(km).toLocaleString('en-US');
}

/** `+6`, `-7`, `+5.5`: signed, because which way the clock moved is the fact. */
export function recapHours(minutes: number): string {
  const hours = Math.round((Math.abs(minutes) / MINUTES_PER_HOUR) * 2) / 2;
  return `${minutes < 0 ? '-' : '+'}${hours}`;
}

function tile(
  key: MemoryFigure['key'],
  figure: RecapFigure,
  label: string,
  format: (value: number) => string,
  { admitsOpen = false } = {},
): MemoryFigure | undefined {
  if (figure.state === 'absent') return undefined;
  return {
    key,
    value: `${figure.estimate ? ESTIMATE_MARK : ''}${format(figure.value)}`,
    label,
    ...(admitsOpen && figure.unresolved ? { unresolved: figure.unresolved } : {}),
  };
}

/**
 * **The tiles, in the order they are worth reading**, at most `MEMORY_FIGURES_MAX`.
 *
 * Places first, because a trip is where you went. Then the air, the clock, and the ground.
 * A zero is left out rather than printed: `0 שעות הפרש` is true of a trip that never left its
 * zone, and it is not a memory of anything.
 */
export function memoryFigures(recap: TripRecap): MemoryFigure[] {
  const { figures } = recap;
  const nonZero = (figure: RecapFigure): RecapFigure =>
    figure.state === 'present' && figure.value === 0 ? { state: 'absent' } : figure;
  const fig = t.planHome.past.fig;
  return [
    // **Only the places tile repeats the unmarked count**, as drawn: rendered on every figure it
    // read `2 לא סומנו` three times over a footer already saying it, and a distance already
    // admits it is soft with its `~`.
    tile('places', figures.places, fig.places, String, { admitsOpen: true }),
    tile('air', nonZero(figures.airMeters), fig.air, recapKm),
    tile('shift', nonZero(figures.zoneShiftMinutes), fig.shift, recapHours),
    tile('ground', nonZero(figures.groundMeters), fig.ground, recapKm),
    tile('foot', nonZero(figures.footMeters), fig.foot, recapKm),
  ]
    .filter((figure): figure is MemoryFigure => figure !== undefined)
    .slice(0, MEMORY_FIGURES_MAX);
}

/** One frame on the contact sheet, composed. */
export interface ContactSheetDay {
  date: string;
  /** Weekday and date, `ו׳ 25.09`. */
  when: string;
  /** The day's numeral, stamped where a picture would be. */
  numeral: string;
  name: string;
  glyphs: readonly string[];
  shot?: { url: string; of: string; credit: string };
}

/**
 * **The days worth a frame** (ADR-0240 §4): only days where something happened, each named,
 * pictured and marked from what happened on it — never from the plan — so a day whose every
 * row was skipped is not a memory, and a picture is never of a place nobody went.
 *
 * The rest are counted, not drawn: `quiet` is what the sheet's foot says, and the Days tab
 * still opens every day.
 */
export function memoryDays(
  input: Omit<DayFactsInput, 'date' | 'dayEvents'> & {
    trip: DayFactsInput['trip'] & { endDate: string };
  },
): { days: ContactSheetDay[]; quiet: number } {
  const { trip, bookings, places, placeLabels, enrichments } = input;
  const all = tripDates(trip.startDate, trip.endDate);
  const days: ContactSheetDay[] = [];
  for (const date of all) {
    const happened = dayListEvents(input.events, date, trip).filter(recapHappened);
    if (happened.length === 0) continue;
    const glyphs = [
      ...new Set(
        happened.map(
          (event) => event.icon ?? iconForCategory(event.category ?? EVENT_CATEGORY.OTHER),
        ),
      ),
    ].slice(0, MEMORY_DAY_GLYPHS);
    const shot = dayShot(happened, bookings, places, placeLabels, enrichments);
    days.push({
      date,
      when: `${weekdayLetter(date)} ${formatDayMonth(date)}`,
      numeral: dayOfMonth(date),
      name: dayHeadTitle({ ...input, date, dayEvents: happened }),
      glyphs,
      ...(shot ? { shot: { url: shot.url, of: shot.of, credit: shot.credit } } : {}),
    });
  }
  return { days, quiet: all.length - days.length };
}
