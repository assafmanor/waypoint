// @vitest-environment jsdom
//
// The Plan builder row's ⋯ sheet — specifically the `הזז` step that replaced the
// `הקדם`/`אחר` pair (ADR-0138 §8). Three things are worth pinning here and none of
// them are reachable from `lib/reorder.ts`'s own tests, which cover the slot
// arithmetic but know nothing about the surface that calls it:
//
//   1. the pair is GONE, and the one item that replaced them does not come and go
//      with the row's position (which is what moved `מחק` under the thumb);
//   2. the step lists the day's soft rows and hands `verbs.reorder` the one you
//      pick — the whole point of the redesign is that you SEE where it lands;
//   3. the step is a back layer, so system back peels it to the menu instead of
//      dismissing the sheet (frontend/CLAUDE.md's "a step INSIDE an overlay").
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { BuilderRow } from './PlanDay';
import { wrapNav } from '../test/nav-harness';
import { useAppBack } from '../state/nav-state';
import { t } from '../i18n/he';

const NOW = '2026-07-01T00:00:00Z';
const ev = (id: string, kind: TripEvent['kind'], hhmm: string, order: number): TripEvent => ({
  id,
  tripId: 't1',
  date: '2026-07-07',
  title: id,
  kind,
  status: EVENT_STATUS.PLANNED,
  startsAt: `2026-07-07T${hhmm}:00+09:00`,
  endsAt: `2026-07-07T${hhmm}:59+09:00`,
  sortOrder: order,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const A = ev('A', EVENT_KIND.SOFT, '10:00', 1);
const C = ev('C', EVENT_KIND.SOFT, '14:00', 3);
const D = ev('D', EVENT_KIND.SOFT, '17:00', 4);
const SOFT = [A, C, D];
const TZ = 'Asia/Tokyo';

function row(
  event: TripEvent,
  opts: { onMoveTo?: (id: string) => void; peers?: TripEvent[] } = {},
) {
  return render(
    wrapNav(
      <BuilderRow
        event={event}
        tz={TZ}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        reorder={{ peers: opts.peers ?? SOFT, onMoveTo: opts.onMoveTo ?? vi.fn() }}
      />,
    ),
  );
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: t.planDay.rowActions }));

/** The app's own back, as a clickable — `useAppBack` is what the platform's back
 *  gesture and every in-app back control both run (ADR-0090/0103). */
function BackButton() {
  const back = useAppBack();
  return <button data-testid="back" onClick={() => back()} />;
}

describe('BuilderRow ⋯ sheet — the הזז step (ADR-0138 §8)', () => {
  afterEach(() => cleanup());

  it('offers one הזז item and neither of the retired הקדם/אחר', () => {
    row(A);
    openMenu();
    expect(screen.getByRole('button', { name: t.planDay.move })).toBeTruthy();
    expect(screen.queryByText('הקדם')).toBeNull();
    expect(screen.queryByText('אחר')).toBeNull();
  });

  it('keeps the menu the same shape at BOTH ends of the soft list', () => {
    // The old pair dropped one item at the top and the other at the bottom, so
    // `מחק` sat at a different position depending on which row you opened. The
    // replacement is position-independent — that is the fix, so it is asserted at
    // the two positions where the old menu differed.
    const labelsAt = (event: TripEvent) => {
      cleanup();
      row(event);
      openMenu();
      return [...document.querySelectorAll('.wp-row-action')].map((b) => b.textContent);
    };
    expect(labelsAt(A)).toEqual(labelsAt(D));
  });

  it('lists the day’s soft rows and reorders onto the one picked', () => {
    const onMoveTo = vi.fn();
    row(A, { onMoveTo });
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: t.planDay.move }));

    const slots = [...document.querySelectorAll('.bld-move-slot')];
    expect(slots.length).toBe(SOFT.length);
    // The row you came from is shown but not a target — a gap in the list would
    // be harder to read than a marked row.
    const self = document.querySelector('.bld-move-slot.is-self') as HTMLButtonElement;
    expect(self.textContent).toContain(t.planDay.moveHere);
    expect(self.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /D/ }));
    expect(onMoveTo).toHaveBeenCalledWith('D');
  });

  it('peels the step back to the menu on back, leaving the sheet open', () => {
    // Driven through `useAppBack` — the app's own back, which is what the layer
    // stack answers. The step registers ABOVE the Modal's own close layer (child
    // effects run first), so one back peels the step and the sheet survives.
    render(
      wrapNav(
        <>
          <BackButton />
          <BuilderRow
            event={A}
            tz={TZ}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            reorder={{ peers: SOFT, onMoveTo: vi.fn() }}
          />
        </>,
      ),
    );
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: t.planDay.move }));
    expect(document.querySelector('.bld-move')).toBeTruthy();

    fireEvent.click(screen.getByTestId('back'));
    expect(document.querySelector('.bld-move')).toBeNull();
    expect(screen.getByRole('button', { name: t.actions.edit })).toBeTruthy();

    // And the NEXT back leaves the sheet — the step did not swallow the layer.
    fireEvent.click(screen.getByTestId('back'));
    expect(screen.queryByRole('button', { name: t.actions.edit })).toBeNull();
  });

  it('omits הזז when there is nothing to reorder against', () => {
    row(A, { peers: [A] });
    openMenu();
    expect(screen.queryByRole('button', { name: t.planDay.move })).toBeNull();
  });
});
