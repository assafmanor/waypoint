import { describe, expect, it } from 'vitest';
import {
  resolveShelfDrop,
  SHELF_DRAG,
  SHELF_DROP,
  SHELF_DROP_ACTION,
  type ShelfDropTarget,
} from './shelf-drop';

const DAY = '2026-07-25';
const FILL = { date: DAY, start: '14:00', end: '15:00' };
const nothing: ShelfDropTarget = { overShelf: null, overDay: false };

describe('resolveShelfDrop (ADR-0116 session-117)', () => {
  describe('an idea', () => {
    it('dropped on a gap is scheduled into that slot', () => {
      const action = resolveShelfDrop(SHELF_DRAG.IDEA, { ...nothing, fill: FILL }, DAY);
      expect(action).toEqual({ kind: SHELF_DROP_ACTION.SCHEDULE, fill: FILL });
    });

    // The empty day knows WHICH day but has no slot to offer, so the time is the
    // user's to pick rather than one the drop invents.
    it('dropped on the empty day opens the time chooser', () => {
      const action = resolveShelfDrop(SHELF_DRAG.IDEA, { ...nothing, overDay: true }, DAY);
      expect(action).toEqual({ kind: SHELF_DROP_ACTION.CHOOSE_TIME });
    });

    it("dropped on the day's shelf group is pencilled in for that day", () => {
      const action = resolveShelfDrop(
        SHELF_DRAG.IDEA,
        { ...nothing, overShelf: SHELF_DROP.DAY },
        DAY,
      );
      expect(action).toEqual({ kind: SHELF_DROP_ACTION.AIM_DAY, day: DAY });
    });

    it('dropped back on the pool is cleared to someday', () => {
      const action = resolveShelfDrop(
        SHELF_DRAG.IDEA,
        { ...nothing, overShelf: SHELF_DROP.POOL },
        DAY,
      );
      expect(action).toEqual({ kind: SHELF_DROP_ACTION.AIM_DAY, day: null });
    });

    it('dropped on nothing does nothing', () => {
      expect(resolveShelfDrop(SHELF_DRAG.IDEA, nothing, DAY)).toEqual({
        kind: SHELF_DROP_ACTION.NONE,
      });
    });
  });

  describe('a skipped event', () => {
    // Not a plain restore: it already owns a time, and putting it back at that old
    // time when you dropped it somewhere else would contradict the gesture.
    it('dropped on a gap is restored INTO that slot', () => {
      const action = resolveShelfDrop(SHELF_DRAG.SKIPPED, { ...nothing, fill: FILL }, DAY);
      expect(action).toEqual({ kind: SHELF_DROP_ACTION.RESTORE_INTO, fill: FILL });
    });

    // …but on an empty day there is nothing to choose between, and unlike an idea it
    // has a time of its own to go back to.
    it('dropped on the empty day is restored at its own time', () => {
      const action = resolveShelfDrop(SHELF_DRAG.SKIPPED, { ...nothing, overDay: true }, DAY);
      expect(action).toEqual({ kind: SHELF_DROP_ACTION.RESTORE });
    });

    // An event has no `targetDate` to re-aim, and turning one into an idea is `park`
    // — a different verb, with its own affordance in the row menu.
    it('is not accepted by a shelf group', () => {
      for (const overShelf of [SHELF_DROP.DAY, SHELF_DROP.POOL] as const) {
        expect(resolveShelfDrop(SHELF_DRAG.SKIPPED, { ...nothing, overShelf }, DAY)).toEqual({
          kind: SHELF_DROP_ACTION.NONE,
        });
      }
    });
  });

  // Precedence, so a pointer over a gap chip that happens to sit inside a lit-up
  // group resolves to the specific target rather than the ambient one.
  it('prefers a gap over the empty day and over a shelf group', () => {
    const action = resolveShelfDrop(
      SHELF_DRAG.IDEA,
      { fill: FILL, overDay: true, overShelf: SHELF_DROP.POOL },
      DAY,
    );
    expect(action).toEqual({ kind: SHELF_DROP_ACTION.SCHEDULE, fill: FILL });
  });
});
