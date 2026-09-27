// **What the memory Home says about a finished trip** (ADR-0240 §4), as values ready to print.
//
// The numbers are `tripRecap`'s (ADR-0239 §9) and nothing here recounts them. What this decides
// is only which figures earn a tile and how each one reads: an estimate carries `~`, a figure
// the trip has no source for is not a tile at all, and one that rows still unmarked could move
// says how many on its second line.
import type { RecapFigure, TripRecap } from '@waypoint/shared';
import { DISTANCE_STEP, MEMORY_FIGURES_MAX } from '../constants';
import { t } from '../i18n/he';

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
