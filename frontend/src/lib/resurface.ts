// What `/trips` says about the trips that are over (ADR-0240 §7, the epic's Phase 6B).
import { tripDates, type Trip } from '@waypoint/shared';

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
