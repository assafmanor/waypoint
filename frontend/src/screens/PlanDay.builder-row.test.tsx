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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { useMemo, type ReactElement } from 'react';
import { BuilderRow } from './PlanDay';
import { wrapNav } from '../test/nav-harness';
import { useHoldToDrag } from '../lib/useHoldToDrag';
import { BEAT, playBeat } from '../lib/one-shot';
import { DRAG_HOLD_MS } from '../constants';
import { t } from '../i18n/he';
// jsdom implements neither PointerEvent nor pointer capture, and the hold's arbitration is
// entirely about `pointerType` and coordinates.
import '../test/pointer-events';

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
  opts: {
    onPickTime?: () => void;
    onPark?: () => void;
    readOnly?: boolean;
    onOpen?: () => void;
    photoUrl?: string;
  } = {},
) {
  return render(
    wrapNav(
      <BuilderRow
        event={event}
        tz={TZ}
        photoUrl={opts.photoUrl}
        onOpen={opts.onOpen ?? vi.fn()}
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

// **THE ROW'S TAP IS A READ** (ADR-0174 §4), and the archived case is the one that was
// broken rather than merely indirect: `.bld-main` was a `<div>` on `readOnly`, so a
// finished trip's events could not be opened at all — in the mode whose whole job is being
// browsable (ADR-0040).
describe('BuilderRow — the row opens a read', () => {
  it('opens the READ rather than the editor when the body is tapped', () => {
    const onOpen = vi.fn();
    const { container } = row(A, { onOpen });
    fireEvent.click(container.querySelector('.bld-main')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is a real button on a READ-ONLY archive, where it used to be an inert div', () => {
    const onOpen = vi.fn();
    const { container } = row(A, { readOnly: true, onOpen });
    const main = container.querySelector('.bld-main')!;
    expect(main.tagName).toBe('BUTTON');
    fireEvent.click(main);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // …and **the WHOLE card is that tap** (owner report, 2026-08-24): the button is one cell
  // of the row's grid, so the padding, the badge's column and the width beside the when line
  // used to answer nothing. What a real finger hits there is `.bld` itself — measured in
  // `e2e/plan-row-tap.spec.ts`, which is where the geometry half of this lives; these pin
  // the arbitration, which is the half that can be got wrong in jsdom.
  it('opens the read from the card itself, not only from the title', () => {
    const onOpen = vi.fn();
    const { container } = row(A, { onOpen });
    fireEvent.click(container.querySelector('.bld')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens it ONCE when the title inside the card is tapped', () => {
    const onOpen = vi.fn();
    const { container } = row(A, { onOpen });
    fireEvent.click(container.querySelector('.bld-ttl')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // A control on the card answers first, or the card would open on every press.
  it('leaves the read shut when a control on the card is tapped', () => {
    const onOpen = vi.fn();
    const onPickTime = vi.fn();
    // Scoped to this render's own container: the describe block above keeps its rows
    // mounted, so a page-wide query would find several of each control.
    const { container } = row(A, { onOpen, onPickTime });

    fireEvent.click(container.querySelector('button.bld-time')!);
    expect(onPickTime).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector('.bld-icon')!);

    expect(onOpen).not.toHaveBeenCalled();
  });

  // The row's own sheets are rendered INSIDE the row and portal out, and a React portal
  // bubbles to its react parent — so without the containment check, dismissing the ⋯ sheet
  // would open the read behind it.
  it('ignores what its own sheet sends it — a backdrop dismiss is not a tap on the card', () => {
    const onOpen = vi.fn();
    const { container } = row(A, { onOpen });
    fireEvent.click(container.querySelector('.bld-icon')!);

    fireEvent.click(document.querySelector('.modal-overlay')!);

    expect(onOpen).not.toHaveBeenCalled();
  });
});

// **ONE LOCK, BESIDE THE THING IT LOCKS** (ADR-0178 §4). Hard/soft used to be drawn three
// times on this row — a leading `.bld-anchor`, a `🔒 קשיח` chip inside `.bld-t`, and the
// border — and the chip was the only one of the three that cost the TITLE width, since it
// is a flex sibling of the title. The chip and the anchor are gone; the lock rides the when
// line, which is what ADR-0011's commitment is actually about.
describe('BuilderRow — the hard mark is drawn once, on the when line', () => {
  it('puts the lock inside the time control and drops the chip and the leading anchor', () => {
    const { container } = row(HARD, { onPickTime: vi.fn() });
    expect(container.querySelector('.bld-time .hard-lock')).toBeTruthy();
    expect(container.querySelector('.bld-anchor')).toBeNull();
    expect(container.querySelector('.tag-hard')).toBeNull();
    // Exactly one — being drawn three times is the defect this undoes.
    expect(container.querySelectorAll('.hard-lock')).toHaveLength(1);
  });

  it('marks an UNTIMED hard row with the chip, the one row with no when line to hang on', () => {
    // A read-only archive row with no time renders neither the range nor `＋ שעה`, so the
    // lock would have nowhere to go and the commitment would silently lose its mark.
    const untimed = ev('U', EVENT_KIND.HARD, null, 3);
    const { container } = row(untimed, { readOnly: true });
    expect(container.querySelector('.bld-time')).toBeNull();
    expect(container.querySelector('.tag-hard')).toBeTruthy();
  });

  it('leaves a soft row carrying no kind word at all — the dashed border says it', () => {
    const { container } = row(A, { onPickTime: vi.fn() });
    expect(container.querySelector('.bld')!.classList.contains('soft')).toBe(true);
    expect(container.querySelector('.tag-soft')).toBeNull();
    expect(container.querySelector('.hard-lock')).toBeNull();
  });
});

// ADR-0199 §1/§2. A hard row never drags — it is a pinned anchor (ADR-0011) — and until
// this it got no hold props at all, so the thing that answered a press-and-hold on a
// commitment was the platform's text-selection UI. These pin the wiring: the row takes the
// refusing hold, the beat lands ON the row, and the row still does not claim to be
// draggable.
describe('a hard row answers the hold it cannot obey (ADR-0199)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.setPointerCapture = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /** The screen's own wiring, reproduced: one refusing props object shared by every hard
   *  row, playing `BEAT.PINNED` on whichever element was held. */
  function Host({ event }: { event: TripEvent }) {
    const holdToDrag = useHoldToDrag();
    const refuseProps = useMemo(
      () => holdToDrag({ onRefuse: (el) => playBeat(el, BEAT.PINNED) }),
      [holdToDrag],
    );
    return (
      <BuilderRow
        event={event}
        tz={TZ}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onPickTime={vi.fn()}
        refuseProps={refuseProps}
      />
    );
  }

  /** Scoped to THIS render's container, never `document`: an earlier describe in this file
   *  leaves its own `.bld` behind, and a document-wide query silently answered with that
   *  row instead — a green-looking assertion about the wrong element. */
  let container: HTMLElement;
  const mount = (ui: ReactElement) => {
    container = render(wrapNav(ui)).container;
  };
  const rowEl = () => container.querySelector('.bld') as HTMLElement;
  const press = () =>
    fireEvent.pointerDown(rowEl(), {
      clientX: 50,
      clientY: 50,
      pointerType: 'touch',
      pointerId: 1,
    });
  const hold = () => {
    press();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
  };

  it('plays the pinned beat on the row itself', () => {
    mount(<Host event={HARD} />);
    expect(rowEl().classList.contains(BEAT.PINNED)).toBe(false);
    hold();
    expect(rowEl().classList.contains(BEAT.PINNED)).toBe(true);
  });

  it('says nothing before the hold completes — a tap is still a tap', () => {
    mount(<Host event={HARD} />);
    press();
    vi.advanceTimersByTime(DRAG_HOLD_MS - 50);
    expect(rowEl().classList.contains(BEAT.PINNED)).toBe(false);
  });

  // The beat must be replayable: pressing the same row again is the case a plain class
  // toggle gets wrong, and it is the whole reason `playBeat` forces a reflow.
  it('answers a second hold on the same row', () => {
    mount(<Host event={HARD} />);
    hold();
    fireEvent.pointerUp(rowEl());
    // Drain the beat's removal and the click swallow's expiry, so the row is back at rest
    // and the next hold timer is the only thing pending.
    vi.runAllTimers();
    expect(rowEl().classList.contains(BEAT.PINNED)).toBe(false);

    hold();
    expect(rowEl().classList.contains(BEAT.PINNED)).toBe(true);
  });

  // `.draggable` carries the grab cursor and, before ADR-0199 §4, the selection rule. A
  // refusing row must not wear it: it is answering the gesture, not offering it.
  it('does not claim to be draggable', () => {
    mount(<Host event={HARD} />);
    expect(rowEl().classList.contains('draggable')).toBe(false);
  });

  it('a row given neither props answers nothing at all', () => {
    container = row(HARD).container;
    press();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    expect(rowEl().classList.contains(BEAT.PINNED)).toBe(false);
  });
});

// **THE BUILDER ROW'S BADGE TAKES THE PHOTO TOO** (ADR-0219 §1). Plan and Trip render the
// same rows off the same derivation, so the two assertions here are `EventCard`'s own — a
// difference between them would be a difference about a fact (ADR-0159 §1).
describe('the badge photo (ADR-0219 §1)', () => {
  afterEach(() => cleanup());

  const photoImg = (c: HTMLElement) =>
    c.querySelector('.bld-bd .wp-placebadge-photo img') as HTMLImageElement | null;

  it('fills the badge with the photo it is given', () => {
    const { container } = row(A, { photoUrl: '/enrichment/images/enr_1' });
    expect(photoImg(container)?.getAttribute('src')).toBe('/enrichment/images/enr_1');
    expect(container.querySelector('.bld-bd')!.hasAttribute('data-photo')).toBe(true);
  });

  it('renders the glyph and no image without one — most rows, unchanged', () => {
    const { container } = row(A);
    expect(photoImg(container)).toBeNull();
    expect(container.querySelector('.bld-bd')!.hasAttribute('data-photo')).toBe(false);
  });
});
