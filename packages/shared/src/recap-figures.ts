// **Which of `tripRecap`'s figures a finished trip prints, and how each value reads** (ADR-0240
// §4, moved here in ADR-0241's 6A.0). The memory Home, the coming-home beat, the group-chat card
// and the trip book all print from this, so a figure is one string wherever it appears.
//
// Values only: the label is copy, and each consumer looks its own up by `key`.
import { isTransportEvent } from './icons';
import { BOOKING_TYPE, DISTANCE_STEP, EVENT_CATEGORY } from './constants';
import type { Booking, TripEvent } from './entities';
import { recapHappened, type RecapFigure, type TripRecap } from './trip-recap';

/** **How many figures print** (ADR-0240 §4): three sit in a row, four go 2×2, five go 3 + 2. A
 *  sixth would be a second screen of numbers above the days. */
export const MEMORY_FIGURES_MAX = 5;

/** What an estimated value leads with. */
export const RECAP_ESTIMATE_MARK = '~';

const MINUTES_PER_HOUR = 60;

export type MemoryFigureKey = 'places' | 'air' | 'shift' | 'ground';

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
 *
 * **There is no walking figure** (ADR-0239 §9, 2026-10-05). The legs between stops miss every
 * hike and every walk around a site, so on a trip that hiked daily it printed `~1.7`.
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
  ]
    .filter((figure): figure is MemoryFigureValue => figure !== undefined)
    .slice(0, MEMORY_FIGURES_MAX);
}

/**
 * **Which rows `ראשונים וטובים` names** (ADR-0240 §4, moved here for the trip book in 6A.2), so
 * the Home and the book pick the same ones. The first and last thing the trip did, the longest
 * stop and the fullest day. The two superlatives are `tripRecap`'s own; first and last are the
 * earliest and latest stop that happened. A stop is a place the trip was AT: not a leg (its ends
 * are airports) and not a bed. A row that would repeat another's subject is dropped.
 */
export type MemoryBestPick =
  | { key: 'first' | 'last'; event: TripEvent }
  | { key: 'longestStop'; event: TripEvent; minutes: number }
  | { key: 'busiestDay'; date: string; places: number };

export function memoryBestPicks(input: {
  recap: TripRecap;
  events: readonly TripEvent[];
  bookings: readonly Booking[];
}): MemoryBestPick[] {
  const { recap, events, bookings } = input;
  const bookingOf = (event: TripEvent) =>
    event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const stops = events
    .filter((event) => recapHappened(event) && event.startsAt)
    .filter((event) => {
      const booking = bookingOf(event);
      if (isTransportEvent(event, booking)) return false;
      return booking
        ? booking.type !== BOOKING_TYPE.HOTEL
        : event.category !== EVENT_CATEGORY.LODGING;
    })
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));

  const picks: MemoryBestPick[] = [];
  const seen = new Set<string>();
  const first = stops[0];
  const last = stops.at(-1);
  if (first) {
    picks.push({ key: 'first', event: first });
    seen.add(first.id);
  }
  const { longestStop, busiestDay } = recap.superlatives;
  if (longestStop.state === 'present' && !seen.has(longestStop.value.eventId)) {
    const event = events.find((e) => e.id === longestStop.value.eventId);
    if (event) {
      picks.push({ key: 'longestStop', event, minutes: longestStop.value.minutes });
      seen.add(event.id);
    }
  }
  if (busiestDay.state === 'present') {
    picks.push({ key: 'busiestDay', date: busiestDay.value.date, places: busiestDay.value.places });
  }
  if (last && !seen.has(last.id)) picks.push({ key: 'last', event: last });
  return picks;
}
