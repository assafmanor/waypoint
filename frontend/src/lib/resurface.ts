// What `/trips` says about the trips that are over (ADR-0240 §7, the epic's Phase 6B).
import { anniversaryYears, tripDates, type Trip } from '@waypoint/shared';
import type { TripMemory } from './trip-recap';

export interface Lifetime {
  trips: number;
  /** Distinct calendar days, so two trips that overlap do not count a day twice. */
  days: number;
  /** Absent, not zero, when no finished trip names its country (ADR-0239 §9's rule). */
  countries?: number;
}

/** **The lifetime line**, over finished trips only. */
export function tripsLifetime(finished: readonly Trip[]): Lifetime {
  const days = new Set<string>();
  const countries = new Set<string>();
  for (const trip of finished) {
    for (const date of tripDates(trip.startDate, trip.endDate)) days.add(date);
    if (trip.destinationCountryCode) countries.add(trip.destinationCountryCode.toUpperCase());
  }
  return {
    trips: finished.length,
    days: days.size,
    ...(countries.size > 0 && { countries: countries.size }),
  };
}

export interface Anniversary {
  trip: Trip;
  years: number;
  memory: TripMemory & { place: string };
}

/**
 * **The finished trips whose first day this is** (ADR-0240 §7, the in-app half of ADR-0239 §8),
 * in the order given. A trip with no place that happened has no card, and neither does one this
 * device never opened, since its rows are not here to name one.
 */
export function tripAnniversaries(
  finished: readonly Trip[],
  memories: ReadonlyMap<string, TripMemory>,
  today: string,
): Anniversary[] {
  return finished.flatMap((trip) => {
    const years = anniversaryYears(trip.startDate, today);
    const memory = memories.get(trip.id);
    return years && memory?.place
      ? [{ trip, years, memory: { ...memory, place: memory.place } }]
      : [];
  });
}
