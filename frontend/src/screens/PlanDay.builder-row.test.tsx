// @vitest-environment jsdom
//
// The Plan builder row's two controls for "when is this" — **the row's own time** (ADR-0161
// §7) and the `⋯` sheet it took `הזז` out of.
//
// This file used to pin the `הזז` STEP (ADR-0138 §8): that the retired `הקדם`/`אחר` pair was
// gone, that the step listed the day's soft rows and handed `verbs.reorder` the one you
// picked, and that the step was a back layer. All three are obsolete, and the middle one is
// why — the step's model was "pick a peer, permute the slots", which is the defect ADR-0161
// §1 exists to undo. So the subject moved rather than the assertions changing:
//
//   1. the row's TIME is a button, and an untimed row's empty time slot is one too — the one
//      place that held nothing at all before;
//   2. the `⋯` sheet is a plain list again, with no `הזז` and no step, so it is the same
//      shape wherever the row sits (which is what the retired pair got wrong);
//   3. a read-only archive row offers neither.
//
// The picker the button OPENS is `ui/domain/DaySlotPicker` with `lib/day-positions.ts`'s
// options; both are tested where they live. This is about the row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { BuilderRow } from './PlanDay';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';

const NOW = '2026-07-01T00:00:00Z';
const ev = (
  id: string,
  kind: TripEvent['kind'],
  hhmm: string | null,
  order: number,
): TripEvent => ({
  id,
  tripId: 't1',
  date: '2026-07-07',
  title: id,
  kind,
  status: EVENT_STATUS.PLANNED,
  startsAt: hhmm ? `2026-07-07T${hhmm}:00+09:00` : undefined,
  endsAt: hhmm ? `2026-07-07T${hhmm}:59+09:00` : undefined,
  sortOrder: order,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const A = ev('A', EVENT_KIND.SOFT, '10:00', 1);
const D = ev('D', EVENT_KIND.SOFT, '17:00', 4);
const UNTIMED = ev('U', EVENT_KIND.SOFT, null, 9);
const HARD = ev('H', EVENT_KIND.HARD, '13:00', 2);
const TZ = 'Asia/Tokyo';

function row(
  event: TripEvent,
  opts: { onPickTime?: () => void; onPark?: () => void; readOnly?: boolean } = {},
) {
  return render(
    wrapNav(
      <BuilderRow
        event={event}
        tz={TZ}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onPark={opts.onPark}
        readOnly={opts.readOnly}
        onPickTime={opts.readOnly ? undefined : (opts.onPickTime ?? vi.fn())}
      />,
    ),
  );
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: t.planDay.rowActions }));
const timeButton = (event: TripEvent) =>
  screen.queryByRole('button', { name: t.planDay.slotMoveTitle(event.title) });

describe('the row’s time is the way to change it (ADR-0161 §7)', () => {
  afterEach(() => cleanup());

  it('renders the time as a button and opens the picker with it', () => {
    const onPickTime = vi.fn();
    row(A, { onPickTime });
    const button = timeButton(A);
    expect(button).toBeTruthy();
    fireEvent.click(button!);
    expect(onPickTime).toHaveBeenCalledTimes(1);
  });

  it('still shows the time itself — the control IS the answer, not a label beside it', () => {
    row(A);
    expect(timeButton(A)!.textContent).toContain('10:00');
  });

  // A hard event's time is a commitment, so the WRITE is guarded (`applyGuardedUpdate`) —
  // but the control is offered, because ADR-0011 forbids moving one unasked, not editing one.
  it('is offered on a hard row too', () => {
    row(HARD);
    expect(timeButton(HARD)).toBeTruthy();
  });

  // The one case where §7 adds a control rather than promoting one: with no time there is
  // nothing in that slot at all, so the only way in was the whole edit form.
  it('offers ＋ שעה on an untimed row, in the same slot', () => {
    const onPickTime = vi.fn();
    row(UNTIMED, { onPickTime });
    const add = screen.getByRole('button', { name: new RegExp(t.planDay.slotAddTime) });
    fireEvent.click(add);
    expect(onPickTime).toHaveBeenCalledTimes(1);
  });

  it('offers neither on a read-only archive row', () => {
    row(A, { readOnly: true });
    expect(timeButton(A)).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(t.planDay.slotAddTime) })).toBeNull();
  });
});

describe('the ⋯ sheet, after הזז left it (amends ADR-0138 §8)', () => {
  afterEach(() => cleanup());

  // Literals, deliberately: `t.planDay.move` is gone from `he.ts` with the step, so there is
  // no key left to assert against — and a test that referenced one would have kept it alive.
  it('no longer offers הזז, nor the הקדם/אחר pair it had replaced', () => {
    row(A);
    openMenu();
    for (const gone of ['הזז', 'הקדם', 'אחר']) expect(screen.queryByText(gone)).toBeNull();
  });

  /** The verb labels inside the sheet's own action list, in order. Scoped to
   *  `.wp-row-actions` rather than every button on screen: the row's time is a button too
   *  now, and its accessible name carries the row's TITLE — so a page-wide sweep reports a
   *  different list per row and says nothing about the menu. */
  const menuLabels = () =>
    [...document.querySelectorAll('.wp-row-actions button')]
      .map((b) => b.textContent?.trim())
      .filter((label): label is string => Boolean(label));

  it('is a fixed list: edit, shelf, delete — with delete last', () => {
    row(A, { onPark: vi.fn() });
    openMenu();
    expect(menuLabels()).toEqual([t.actions.edit, t.actions.toShelf, t.actions.delete]);
  });

  // The retired pair dropped one item at the top of the list and the other at the bottom, so
  // `מחק` sat at a different index depending on which row you opened — moving a destructive
  // verb under the thumb. Nothing in this menu depends on position now, so it is asserted at
  // two rows that used to differ.
  it('is the same shape wherever the row sits', () => {
    const labelsAt = (event: TripEvent) => {
      cleanup();
      row(event, { onPark: vi.fn() });
      openMenu();
      return menuLabels();
    };
    expect(labelsAt(A)).toEqual(labelsAt(D));
  });

  // A hard event cannot be parked (ADR-0011), so its menu is shorter — the one legitimate
  // way this list varies, and it varies by the ROW's nature rather than by its position.
  it('drops the shelf verb on a row that cannot be parked', () => {
    row(HARD);
    openMenu();
    expect(screen.queryByRole('button', { name: t.actions.toShelf })).toBeNull();
  });
});
