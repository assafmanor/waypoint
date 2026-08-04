// **A move names a POSITION; an event owns its LENGTH** (ADR-0161 §1/§2).
//
// This file used to model the day as a fixed set of SLOTS that events permute
// through: it read `{startsAt, endsAt, sortOrder}` off each soft event, kept those
// triples in ascending order, and reassigned which event held each. So dropping a
// 1-hour visit onto a 2-hour one made it two hours long — a datum nobody touched,
// rewritten by a gesture that only claimed to reorder.
//
// The codebase already disagreed with itself about this inside one drag: dropping the
// same row on a GAP went through `PlanDay`'s `slotFor`, which keeps the length and says
// so. That branch was right, so it is now the only rule: every move writes a START and
// carries the duration with it.
//
// **Only `planSwap` lives here, and the absence of a `planInsert` is deliberate.**
// Inserting at a position is what a gap/seam drop already does — `slotFor` + the
// `MOVE_INTO` action — and a seam is a gap with no free time in it (`freeBetween`,
// `lib/gaps.ts`). A second implementation of "start here, keep your length" is exactly
// the parallel copy rule 8 exists to prevent.
//
// `sortOrder` is not touched by anything here: the list sorts by start, and `sortOrder`
// only breaks ties among UNTIMED rows, which no move in this file reorders.
import type { TripEvent, UpdateEventInput } from '@waypoint/shared';
import { EVENT_KIND } from '@waypoint/shared';

/** The event's own length in ms, or null when it has no end to measure. Absolute ms,
 *  so an event running past midnight keeps its length instead of needing the date
 *  arithmetic ADR-0037 already settled. */
const durationMs = (e: TripEvent): number | null =>
  e.startsAt && e.endsAt ? Date.parse(e.endsAt) - Date.parse(e.startsAt) : null;

/** This event, starting at `startsAt`, with its own length carried over. A start-only
 *  event stays start-only — it has no length to keep. */
const atStart = (e: TripEvent, startsAt: string): UpdateEventInput => {
  const ms = durationMs(e);
  return ms === null
    ? { startsAt }
    : { startsAt, endsAt: new Date(Date.parse(startsAt) + ms).toISOString() };
};

/**
 * Two soft events **trade positions**: each takes the other's start time and keeps its
 * own length. Returns one patch per event, or `[]` when the swap cannot mean anything.
 *
 * Refused, each for a reason rather than as validation ceremony:
 *
 * - **either id is not a soft event on the day** — a hard event is a pinned anchor
 *   (ADR-0011), never a drag source and never a swap target;
 * - **the same event twice** — nothing to trade;
 * - **either event is untimed** — it holds no position to give away. (An untimed row
 *   reaches a position through a seam drop, which hands it that slot's own block.)
 *
 * Note what this does NOT do: nothing else on the day moves. Two events of unequal
 * length that trade places can leave one of them overlapping a neighbour, and that is
 * the design (ADR-0161 §3) — the day renders it as ADR-0041's cluster, which already
 * carries a one-tap way out. Absorbing the excess into the following free time, or
 * shifting the tail, would both move rows the user never touched.
 */
export function planSwap(
  dayEvents: TripEvent[],
  aId: string,
  bId: string,
): { id: string; patch: UpdateEventInput }[] {
  if (aId === bId) return [];
  const soft = (id: string) =>
    dayEvents.find((e) => e.id === id && e.kind === EVENT_KIND.SOFT && e.startsAt);
  const a = soft(aId);
  const b = soft(bId);
  if (!a || !b) return [];
  return [
    { id: a.id, patch: atStart(a, b.startsAt!) },
    { id: b.id, patch: atStart(b, a.startsAt!) },
  ];
}
