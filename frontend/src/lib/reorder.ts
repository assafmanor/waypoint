// Plan-mode builder reorder (drag + ▲/▼). Model: the day's SOFT events hold a
// set of time slots; reordering permutes which soft event occupies which slot,
// so the list stays time-ordered. HARD events are pinned anchors — never moved
// (ADR-0011: a hard commitment is never auto-moved) and never in the result.
import type { TripEvent, UpdateEventInput } from '@waypoint/shared';
import { EVENT_KIND } from '@waypoint/shared';

/** Pure array move: the element at `from` ends up at index `to`. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

const slotOf = (e: TripEvent): UpdateEventInput => ({
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  sortOrder: e.sortOrder,
});

const sameSlot = (e: TripEvent, s: UpdateEventInput) =>
  e.startsAt === s.startsAt && e.endsAt === s.endsAt && e.sortOrder === s.sortOrder;

/**
 * Move soft event `movedId` to occupy soft event `targetId`'s slot, reassigning
 * the soft events' time slots to the new order. Returns one patch per soft event
 * whose slot actually changed (empty if the move is a no-op or either id isn't a
 * soft event on the day). `dayEvents` must be in render order (sorted byStart).
 */
export function planReorder(
  dayEvents: TripEvent[],
  movedId: string,
  targetId: string,
): { id: string; patch: UpdateEventInput }[] {
  const soft = dayEvents.filter((e) => e.kind === EVENT_KIND.SOFT);
  const ids = soft.map((e) => e.id);
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [];

  // Slots stay in their ascending order; only which event holds each changes.
  const slots = soft.map(slotOf);
  const newIds = arrayMove(ids, from, to);
  const byId = new Map(soft.map((e) => [e.id, e]));

  const patches: { id: string; patch: UpdateEventInput }[] = [];
  newIds.forEach((id, k) => {
    const event = byId.get(id)!;
    if (!sameSlot(event, slots[k])) patches.push({ id, patch: slots[k] });
  });
  return patches;
}
