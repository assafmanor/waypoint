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
}

export const SHELF_DROP_ACTION = {
  /** Create the event: an idea into a gap's slot. */
  SCHEDULE: 'schedule',
  /** Un-skip an existing event AND move it into the gap's slot — one write. */
  RESTORE_INTO: 'restoreInto',
  /** Un-skip an existing event, at the time it already has. */
  RESTORE: 'restore',
  /** Re-aim an idea's target day (a pencil mark, not a schedule). */
  AIM_DAY: 'aimDay',
  /** Open the schedule sheet: the target knows the day but not the time. */
  CHOOSE_TIME: 'chooseTime',
  /** Released over nothing that accepts this card. */
  NONE: 'none',
} as const;

export type ShelfDropAction =
  | { kind: typeof SHELF_DROP_ACTION.SCHEDULE; fill: GapDefaults }
  | { kind: typeof SHELF_DROP_ACTION.RESTORE_INTO; fill: GapDefaults }
  | { kind: typeof SHELF_DROP_ACTION.RESTORE }
  | { kind: typeof SHELF_DROP_ACTION.AIM_DAY; day: string | null }
  | { kind: typeof SHELF_DROP_ACTION.CHOOSE_TIME }
  | { kind: typeof SHELF_DROP_ACTION.NONE };

/**
 * The decision table, in precedence order: a gap chip is the most specific target,
 * then the empty day, then a shelf group.
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
 *
 * And on the empty day the kinds diverge for the same underlying reason: the target
 * offers no slot, so an idea (which has no time at all) needs one chosen, while a
 * skipped event already owns one and just goes back.
 */
export function resolveShelfDrop(
  kind: ShelfDragKind,
  target: ShelfDropTarget,
  activeDate: string,
): ShelfDropAction {
  const skipped = kind === SHELF_DRAG.SKIPPED;
  if (target.fill) {
    const { fill } = target;
    return skipped
      ? { kind: SHELF_DROP_ACTION.RESTORE_INTO, fill }
      : { kind: SHELF_DROP_ACTION.SCHEDULE, fill };
  }
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
