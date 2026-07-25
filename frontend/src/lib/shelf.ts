// The shelf's grouping (ADR-0116 §2/§3). One derivation, because both hosts render
// the same shelf: Trip mode's DayView and Plan mode's PlanDay. Before this each
// screen inlined `maybeItems.filter((m) => !m.consumed)` and Trip mode alone knew
// about the day's skipped events — which is how ADR-0027's "the shelf renders
// unplaced ideas AND skipped soft events, uniformly" stayed half-built.
//
// Pure: no clock, no zone, no state. The day it groups against is passed in.
import { EVENT_KIND, EVENT_STATUS, type MaybeItem, type TripEvent } from '@waypoint/shared';

export interface ShelfGroups {
  /** Pencilled in for the focused day (`targetDate === date`). */
  forDay: MaybeItem[];
  /** Everything else, dateless first, then ideas aimed at another day — each of
   *  which states which day at the call site (ADR-0085's relative phrasing). */
  pool: MaybeItem[];
  /** The focused day's skipped soft events, parked here and restorable in place
   *  (ADR-0027 §2). They belong to the day, so they render beside `forDay`. */
  skipped: TripEvent[];
}

export function shelfGroups(
  maybeItems: MaybeItem[],
  events: TripEvent[],
  date: string,
): ShelfGroups {
  const parked = maybeItems.filter((m) => !m.consumed);
  const forDay = parked.filter((m) => m.targetDate === date);
  const others = parked.filter((m) => m.targetDate !== date);
  return {
    forDay,
    // Dateless ideas lead: they're the ones still asking to be placed anywhere.
    pool: [...others.filter((m) => !m.targetDate), ...others.filter((m) => !!m.targetDate)],
    skipped: events.filter(
      (e) => e.date === date && e.kind === EVENT_KIND.SOFT && e.status === EVENT_STATUS.SKIPPED,
    ),
  };
}
