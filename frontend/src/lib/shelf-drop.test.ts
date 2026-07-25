import { describe, expect, it } from 'vitest';
import {
  resolveRowDrop,
  resolveShelfDrop,
  ROW_DROP_ACTION,
  SHELF_DRAG,
  SHELF_DROP,
  SHELF_DROP_ACTION,
  type ShelfDropTarget,
} from './shelf-drop';

const DAY = '2026-07-25';
const FILL = { date: DAY, start: '14:00', end: '15:00' };
const nothing: ShelfDropTarget = { overShelf: null, overDay: false, overDate: null };

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

const nowhereRow = { overRowId: null, overShelf: null, overDate: null };
/** The dragged row, and the day it is on — which is what a day-pill drop compares to. */
const ROW = { id: 'ev-1', date: DAY };

describe('resolveRowDrop (ADR-0116 session-118)', () => {
  const nowhere = nowhereRow;

  it('dropped on another soft row, reorders', () => {
    const action = resolveRowDrop(ROW, { ...nowhere, overRowId: 'ev-2' }, DAY);
    expect(action).toEqual({ kind: ROW_DROP_ACTION.REORDER, targetId: 'ev-2' });
  });

  // The mirror of dragging a card onto a gap: the same two groups, the opposite
  // direction. Which group sets the idea's day, not whether it parks.
  it("dropped on the day's shelf group, parks it keeping that day", () => {
    const action = resolveRowDrop(ROW, { ...nowhere, overShelf: SHELF_DROP.DAY }, DAY);
    expect(action).toEqual({ kind: ROW_DROP_ACTION.PARK, day: DAY });
  });

  it('dropped on the pool, parks it as someday', () => {
    const action = resolveRowDrop(ROW, { ...nowhere, overShelf: SHELF_DROP.POOL }, DAY);
    expect(action).toEqual({ kind: ROW_DROP_ACTION.PARK, day: null });
  });

  // A grip nudged and released is not a request to do anything.
  it('dropped on itself does nothing', () => {
    expect(resolveRowDrop(ROW, { ...nowhere, overRowId: 'ev-1' }, DAY)).toEqual({
      kind: ROW_DROP_ACTION.NONE,
    });
  });

  it('dropped on nothing does nothing', () => {
    expect(resolveRowDrop(ROW, nowhere, DAY)).toEqual({ kind: ROW_DROP_ACTION.NONE });
  });

  // The shelf sits below the list, so being over it is the more deliberate act.
  it('prefers the shelf when a row is somehow under the pointer too', () => {
    const action = resolveRowDrop(
      ROW,
      { overRowId: 'ev-2', overShelf: SHELF_DROP.POOL, overDate: null },
      DAY,
    );
    expect(action).toEqual({ kind: ROW_DROP_ACTION.PARK, day: null });
  });
});

// The header's day strip (session-119): both drags can carry a thing to another day.
describe('a day pill as a drop target', () => {
  const OTHER = '2026-07-28';

  it('aims an idea at that day, the same outcome as its own shelf group', () => {
    const action = resolveShelfDrop(SHELF_DRAG.IDEA, { ...nothing, overDate: OTHER }, DAY);
    expect(action).toEqual({ kind: SHELF_DROP_ACTION.AIM_DAY, day: OTHER });
  });

  // It belongs to the day it was skipped on; moving it elsewhere is a reschedule, not
  // a pencil mark.
  it('does not accept a skipped event', () => {
    expect(resolveShelfDrop(SHELF_DRAG.SKIPPED, { ...nothing, overDate: OTHER }, DAY)).toEqual({
      kind: SHELF_DROP_ACTION.NONE,
    });
  });

  it('moves a row to that day', () => {
    const action = resolveRowDrop(ROW, { ...nowhereRow, overDate: OTHER }, DAY);
    expect(action).toEqual({ kind: ROW_DROP_ACTION.MOVE_TO_DAY, day: OTHER });
  });

  // Compared against the ROW's day, not the day on screen: the dwell has already
  // switched the view to the pill being aimed at, so comparing with the active day
  // would read the deliberate release that follows as a no-op.
  it("is a no-op only when it names the row's own day", () => {
    expect(resolveRowDrop(ROW, { ...nowhereRow, overDate: DAY }, DAY)).toEqual({
      kind: ROW_DROP_ACTION.NONE,
    });
    // The view has already sprung to OTHER; the row is still on DAY, so this moves it.
    expect(resolveRowDrop(ROW, { ...nowhereRow, overDate: OTHER }, OTHER)).toEqual({
      kind: ROW_DROP_ACTION.MOVE_TO_DAY,
      day: OTHER,
    });
  });

  // Most specific target of all: it names a day outright.
  it('wins over a gap, the shelf and a row', () => {
    expect(
      resolveShelfDrop(
        SHELF_DRAG.IDEA,
        { fill: FILL, overShelf: SHELF_DROP.POOL, overDay: true, overDate: OTHER },
        DAY,
      ),
    ).toEqual({ kind: SHELF_DROP_ACTION.AIM_DAY, day: OTHER });
    expect(
      resolveRowDrop(ROW, { overRowId: 'ev-2', overShelf: SHELF_DROP.DAY, overDate: OTHER }, DAY),
    ).toEqual({ kind: ROW_DROP_ACTION.MOVE_TO_DAY, day: OTHER });
  });
});
