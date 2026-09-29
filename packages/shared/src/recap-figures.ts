// **Which of `tripRecap`'s figures a finished trip prints, and how each value reads** (ADR-0240
// §4, moved here in ADR-0241's 6A.0). The memory Home, the coming-home beat, the group-chat card
// and the trip book all print from this, so a figure is one string wherever it appears.
//
// Values only: the label is copy, and each consumer looks its own up by `key`.
import { DISTANCE_STEP } from './constants';
import type { RecapFigure, TripRecap } from './trip-recap';

/** **How many figures print** (ADR-0240 §4): three sit in a row, four go 2×2, five go 3 + 2. A
 *  sixth would be a second screen of numbers above the days. */
export const MEMORY_FIGURES_MAX = 5;

/** What an estimated value leads with. */
export const RECAP_ESTIMATE_MARK = '~';

const MINUTES_PER_HOUR = 60;

export type MemoryFigureKey = 'places' | 'air' | 'shift' | 'ground' | 'foot';

export interface MemoryFigureValue {
  key: MemoryFigureKey;
  value: string;
  /** Unmarked rows that could still move this figure; absent at zero. */
  unresolved?: number;
}

/** Kilometres as a figure prints them: one decimal below the whole-km threshold, grouped whole
 *  kilometres above it — the same steps as the near-me distance, without its unit, which the
 *  figure's label carries. */
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

function figureValue(
  key: MemoryFigureKey,
  figure: RecapFigure,
  format: (value: number) => string,
  { admitsOpen = false } = {},
): MemoryFigureValue | undefined {
  if (figure.state === 'absent') return undefined;
  return {
    key,
    value: `${figure.estimate ? RECAP_ESTIMATE_MARK : ''}${format(figure.value)}`,
    ...(admitsOpen && figure.unresolved ? { unresolved: figure.unresolved } : {}),
  };
}

/**
 * **The figures, in the order they are worth reading**, at most `MEMORY_FIGURES_MAX`.
 *
 * Places first, because a trip is where you went. Then the air, the clock, and the ground.
 * A zero is left out rather than printed: `0 שעות הפרש` is true of a trip that never left its
 * zone, and it is not a memory of anything.
 */
export function memoryFigureValues(recap: TripRecap): MemoryFigureValue[] {
  const { figures } = recap;
  const nonZero = (figure: RecapFigure): RecapFigure =>
    figure.state === 'present' && figure.value === 0 ? { state: 'absent' } : figure;
  return [
    // **Only places repeats the unmarked count**, as drawn: rendered on every figure it read
    // `2 לא סומנו` three times over a footer already saying it, and a distance already admits it
    // is soft with its `~`.
    figureValue('places', figures.places, String, { admitsOpen: true }),
    figureValue('air', nonZero(figures.airMeters), recapKm),
    figureValue('shift', nonZero(figures.zoneShiftMinutes), recapHours),
    figureValue('ground', nonZero(figures.groundMeters), recapKm),
    figureValue('foot', nonZero(figures.footMeters), recapKm),
  ]
    .filter((figure): figure is MemoryFigureValue => figure !== undefined)
    .slice(0, MEMORY_FIGURES_MAX);
}
