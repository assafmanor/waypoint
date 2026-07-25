// What a shelf drag's release MEANS (ADR-0116 §5, session-117 amendment).
//
// Pure and separate from the screen for one reason: these are data writes — one of
// them restores an event and moves it in the same patch — and the drag that produces
// them cannot be driven in jsdom (no compositor, no `elementFromPoint`). Deciding
// here keeps the table testable without a browser, and leaves the screen's `onDrop` a
// dispatcher with no branching of its own.
import type { GapDefaults } from './gaps';

/** Which kind of card was dragged. */
export const SHELF_DRAG = { IDEA: 'idea', SKIPPED: 'skipped' } as const;
export type ShelfDragKind = (typeof SHELF_DRAG)[keyof typeof SHELF_DRAG];

/** The shelf's two group drop zones (ADR-0116 §2): the day's, and the pool's. */
export const SHELF_DROP = { DAY: 'day', POOL: 'pool' } as const;
export type ShelfDrop = (typeof SHELF_DROP)[keyof typeof SHELF_DROP];

/** Where the finger let go. */
export interface ShelfDropTarget {
  /** A gap chip's slot, when the pointer was over one. */
  fill?: GapDefaults;
  /** A shelf group, when the pointer was over one. */
  overShelf: ShelfDrop | null;
  /** The empty day's drop zone, which exists only mid-drag and offers no slot. */
  overDay: boolean;
  /** A day pill on the header strip: name a day without scheduling a time. */
  overDate?: string | null;
}

export const SHELF_DROP_ACTION = {
  /** Un-skip an existing event AND move it into the gap's slot — one write. */
  RESTORE_INTO: 'restoreInto',
  /** Un-skip an existing event, at the time it already has. */
  RESTORE: 'restore',
  /** Re-aim an idea's target day (a pencil mark, not a schedule). */
  AIM_DAY: 'aimDay',
  /** Open the schedule form, prefilled with `fill` when the target had a slot to
   *  offer. Every drop that CREATES an event goes through here (session-120). */
  CHOOSE_TIME: 'chooseTime',
  /** Released over nothing that accepts this card. */
  NONE: 'none',
} as const;

export type ShelfDropAction =
  | { kind: typeof SHELF_DROP_ACTION.RESTORE_INTO; fill: GapDefaults }
  | { kind: typeof SHELF_DROP_ACTION.RESTORE }
  | { kind: typeof SHELF_DROP_ACTION.AIM_DAY; day: string | null }
  | { kind: typeof SHELF_DROP_ACTION.CHOOSE_TIME; fill?: GapDefaults }
  | { kind: typeof SHELF_DROP_ACTION.NONE };

/**
 * The decision table, in precedence order: a gap chip is the most specific target,
 * then the empty day, then a shelf group.
 *
 * The dividing line is CREATE vs MOVE (session-120). An idea becoming an event is a
 * create — nothing existed before, and its time, length and kind are all still open —
 * so every such drop opens the schedule form, prefilled with whatever slot the target
 * offered. Anything that already exists just moves, silently: it has a duration and a
 * title already, and a form there would only be a speed bump.
 *
 * Two asymmetries between the kinds, both deliberate:
 *
 * - **A gap means "restore INTO here" for a skipped event**, not a plain restore.
 *   Putting it back at its old time when you dropped it somewhere else would
 *   contradict the gesture, and it's one patch either way.
 * - **A shelf group is not a target for a skipped event.** An event has no
 *   `targetDate` to re-aim, and converting one into an idea is `park` — a different
 *   verb with its own affordance in the row menu, not something a stray drop should
 *   trigger.
 */
export function resolveShelfDrop(
  kind: ShelfDragKind,
  target: ShelfDropTarget,
  activeDate: string,
): ShelfDropAction {
  const skipped = kind === SHELF_DRAG.SKIPPED;
  // A day pill names a day and nothing else, which is exactly a pencil mark — so for an
  // idea it is the same outcome as its own shelf group, reachable without scrolling
  // the shelf into view (session-119). A SKIPPED event is deliberately not accepted:
  // it belongs to the day it was skipped on, and moving it elsewhere is a reschedule,
  // not a pencil mark. Most specific target, so it wins.
  if (target.overDate && !skipped) {
    return { kind: SHELF_DROP_ACTION.AIM_DAY, day: target.overDate };
  }
  if (target.fill) {
    const { fill } = target;
    return skipped
      ? { kind: SHELF_DROP_ACTION.RESTORE_INTO, fill }
      : { kind: SHELF_DROP_ACTION.CHOOSE_TIME, fill };
  }
  // The empty day knows WHICH day but has no slot to offer, so the form opens with the
  // day's own next opening instead. A skipped event needs none of that: it already owns
  // a time, and on an empty day there is nothing to choose between.
  if (target.overDay) {
    return skipped ? { kind: SHELF_DROP_ACTION.RESTORE } : { kind: SHELF_DROP_ACTION.CHOOSE_TIME };
  }
  if (target.overShelf && !skipped) {
    return {
      kind: SHELF_DROP_ACTION.AIM_DAY,
      day: target.overShelf === SHELF_DROP.DAY ? activeDate : null,
    };
  }
  return { kind: SHELF_DROP_ACTION.NONE };
}

/** Where a dragged builder ROW let go. The two directions are deliberately
 *  symmetric: a card can come off the shelf onto the day, and a row can go the other
 *  way (ADR-0116 session-118). */
export interface RowDropTarget {
  /** Another soft row, by id — the reorder target this drag always had. */
  overRowId: string | null;
  /** A shelf group, which means park it: off the day, onto the shelf. */
  overShelf: ShelfDrop | null;
  /** A day pill on the header strip, which means move it to that day. */
  overDate: string | null;
  /** A gap chip's slot — free time, on this day or on the one the drag walked to
   *  (session-123). The same target a shelf card has always had. */
  fill?: GapDefaults;
  /** The empty day's drop zone: it names a day but has no slot to offer. */
  overDay?: boolean;
}

export const ROW_DROP_ACTION = {
  /** Reassign the day's soft slots so the dragged row takes this one's place. */
  REORDER: 'reorder',
  /** Off the day and onto the shelf as an idea, keeping `day` as its pencil mark. */
  PARK: 'park',
  /** Onto another day, keeping the event's own clock time. */
  MOVE_TO_DAY: 'moveToDay',
  /** Into free time — the gap's day and start, the event's own length. */
  MOVE_INTO: 'moveInto',
  NONE: 'none',
} as const;

export type RowDropAction =
  | { kind: typeof ROW_DROP_ACTION.REORDER; targetId: string }
  | { kind: typeof ROW_DROP_ACTION.PARK; day: string | null }
  | { kind: typeof ROW_DROP_ACTION.MOVE_TO_DAY; day: string }
  | { kind: typeof ROW_DROP_ACTION.MOVE_INTO; fill: GapDefaults }
  | { kind: typeof ROW_DROP_ACTION.NONE };

/**
 * A row is dropped on a gap, on another row, on the shelf, on the empty day, or on a
 * day pill.
 *
 * Precedence is its sibling table's, target for target: the day pill first (it names a
 * day outright), then a gap, then the empty day, then the shelf (which sits below the
 * list, so being over it is the deliberate act), then a row. Nothing in the DOM can put
 * two of them under one pointer; the order is written down so the two tables cannot
 * answer the same pointer differently.
 *
 * **A row takes every target a shelf card takes** (session-123). Carrying an event to
 * another day used to mean releasing on its pill and nothing else — so the only thing
 * the day itself accepted was the shelf, and an event carried there came back as an
 * idea. Now free time on any day accepts the row as what it already is: an event, with
 * its own title and length, moved.
 *
 * A shelf GROUP decides the idea's day rather than whether it parks at all: the day's
 * group keeps it pencilled in for the day it came off (which is what `park` does by
 * default), the pool clears it to "someday".
 *
 * Dropping a row on itself, or on the day it is already on, is nothing.
 */
export function resolveRowDrop(
  dragged: { id: string; date: string },
  target: RowDropTarget,
  activeDate: string,
): RowDropAction {
  // Compared against the EVENT's day, not the day on screen: resting on a pill has
  // already switched the view to it, so comparing with `activeDate` would read the
  // deliberate release that follows as a no-op and undo the whole gesture.
  if (target.overDate) {
    return target.overDate === dragged.date
      ? { kind: ROW_DROP_ACTION.NONE }
      : { kind: ROW_DROP_ACTION.MOVE_TO_DAY, day: target.overDate };
  }
  // Free time, on this day or on the one the drag walked to. Unlike a pill this is
  // never a no-op: the gap says a time as well as a day, and the row is not in it.
  if (target.fill) return { kind: ROW_DROP_ACTION.MOVE_INTO, fill: target.fill };
  // A day with nothing on it has no gap chip to offer, so the empty state is the
  // target instead (the same one an idea gets) — and it can only ever be another
  // day, since the day the row came off has at least that row on it.
  if (target.overDay) {
    return activeDate === dragged.date
      ? { kind: ROW_DROP_ACTION.NONE }
      : { kind: ROW_DROP_ACTION.MOVE_TO_DAY, day: activeDate };
  }
  if (target.overShelf) {
    return {
      kind: ROW_DROP_ACTION.PARK,
      day: target.overShelf === SHELF_DROP.DAY ? activeDate : null,
    };
  }
  if (target.overRowId && target.overRowId !== dragged.id) {
    return { kind: ROW_DROP_ACTION.REORDER, targetId: target.overRowId };
  }
  return { kind: ROW_DROP_ACTION.NONE };
}
