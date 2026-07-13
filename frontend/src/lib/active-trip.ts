// Active-trip resolution (ADR-0021): current in-progress → nearest upcoming →
// most recent past. Never stored server-side — recomputed on load; the manual
// override lives in state/active-trip-id.tsx (localStorage), same class as
// the mode override (lib/mode.ts).
import type { Trip } from '@waypoint/shared';
import { todayInTz } from './time';

export function resolveActiveTrip(trips: Trip[], now: Date): Trip | null {
  if (trips.length === 0) return null;

  const inProgress = trips.filter((t) => {
    const today = todayInTz(t.timezone, now);
    return today >= t.startDate && today <= t.endDate;
  });
  if (inProgress.length > 0) {
    // ponytail: overlapping in-progress trips are an explicitly deferred case
    // (ADR-0021) — pick the one that started first, deterministic and good
    // enough until "which trip is primary now" gets a real resolution.
    return [...inProgress].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  }

  const upcoming = trips.filter((t) => todayInTz(t.timezone, now) < t.startDate);
  if (upcoming.length > 0) {
    return [...upcoming].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  }

  const past = trips.filter((t) => todayInTz(t.timezone, now) > t.endDate);
  return [...past].sort((a, b) => (a.endDate > b.endDate ? -1 : 1))[0];
}
