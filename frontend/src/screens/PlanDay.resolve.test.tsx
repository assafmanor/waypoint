// @vitest-environment jsdom
//
// The Plan builder's `הזז` overlap-resolve sheet (ADR-0041) — two steps: which soft
// event moves, then where it goes. It had no unit coverage at all until ADR-0155 moved
// it onto `useFormSteps`, which is exactly when it needed some: the migration took its
// step state down out of `PlanDay` and put its back layer in the primitive, so what is
// pinned here is that the surface behaves the same afterwards — plus the one thing that
// deliberately changed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { ResolveSheet } from './PlanDay';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';
import type { DaySlotOption } from '../ui/domain/DaySlotPicker';
import type { GapDefaults } from '../lib/gaps';

const NOW = '2026-07-01T00:00:00Z';
const TZ = 'Asia/Tokyo';
const ev = (id: string, kind: TripEvent['kind'], from: string, to: string): TripEvent => ({
  id,
  tripId: 't1',
  date: '2026-07-07',
  title: id,
  kind,
  status: EVENT_STATUS.PLANNED,
  startsAt: `2026-07-07T${from}:00+09:00`,
  endsAt: `2026-07-07T${to}:00+09:00`,
  sortOrder: 0,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const SOFT_A = ev('רך א', EVENT_KIND.SOFT, '10:00', '11:00');
const SOFT_B = ev('רך ב', EVENT_KIND.SOFT, '10:30', '11:30');
const HARD = ev('קשיח', EVENT_KIND.HARD, '10:15', '11:15');

const clusterOf = (...events: TripEvent[]) =>
  ({
    kind: 'cluster' as const,
    startMs: Date.parse(events[0].startsAt!),
    endMs: Date.parse(events[events.length - 1].endsAt!),
    items: events.map((event) => ({ event, children: [] })),
  }) satisfies Parameters<typeof ResolveSheet>[0]['cluster'];

/** Step two is the shared `DaySlotPicker` since ADR-0161 §4, so its options come from the
 *  HOST — the sheet knows a cluster, not a day. One position is enough to test the wiring;
 *  what the day's positions actually are is `lib/day-positions.ts`'s subject. */
const AFTER_THE_REST: DaySlotOption = {
  key: 'after',
  label: 'אחרי רך ב',
  time: '11:30',
  fill: { date: '2026-07-07', start: '11:30', end: '12:30' },
};

function open(
  events: TripEvent[],
  opts: {
    onPick?: (mover: TripEvent, fill: GapDefaults) => void;
    onOther?: () => void;
    onClose?: () => void;
  } = {},
) {
  return render(
    wrapNav(
      <ResolveSheet
        cluster={clusterOf(...events)}
        tz={TZ}
        optionsFor={() => [AFTER_THE_REST]}
        onPick={opts.onPick ?? vi.fn()}
        onOther={opts.onOther ?? vi.fn()}
        onClose={opts.onClose ?? vi.fn()}
      />,
    ),
  );
}

const pick = (title: string) => fireEvent.click(screen.getByText(title));
const onStepTwo = () => !!screen.queryByText(t.planDay.slotExactTime);

describe('ResolveSheet — step one asks which event moves', () => {
  afterEach(() => cleanup());

  it('offers the soft members and shows the hard ones as anchors', () => {
    open([SOFT_A, HARD, SOFT_B]);
    expect(screen.getByText(t.planDay.resolveChoose)).toBeTruthy();
    // A hard member is a disabled anchor, not a choice — it is a commitment (ADR-0011).
    const anchors = [...document.querySelectorAll('.resolve-mover.anchor')];
    expect(anchors.length).toBe(1);
    expect(anchors[0].textContent).toContain('קשיח');
    expect(document.querySelectorAll('.resolve-mover:not(.anchor)').length).toBe(2);
  });

  it('advances to the slots once one is chosen', () => {
    open([SOFT_A, SOFT_B]);
    expect(onStepTwo()).toBe(false);
    pick('רך א');
    expect(onStepTwo()).toBe(true);
    expect(screen.getByText(t.planDay.slotExactTime)).toBeTruthy();
  });
});

describe('ResolveSheet — step two moves it', () => {
  afterEach(() => cleanup());

  // It used to hand back a MINUTE OFFSET, computed here from the cluster's own bounds, and
  // the two options were built by hand (ADR-0161 §4's one-off pair). Now it hands back the
  // position's SLOT — the same thing a drop on that position hands back, through the same
  // write, which is the whole point of the picker being shared.
  it('hands back the chosen event and the position’s slot', () => {
    const onPick = vi.fn();
    open([SOFT_A, SOFT_B], { onPick });
    pick('רך א');
    fireEvent.click(screen.getByText(AFTER_THE_REST.label as string));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'רך א' }),
      AFTER_THE_REST.fill,
    );
  });

  it('hands the exact time-setter the same event', () => {
    const onOther = vi.fn();
    open([SOFT_A, SOFT_B], { onOther });
    pick('רך ב');
    fireEvent.click(screen.getByText(t.planDay.slotExactTime));
    expect(onOther).toHaveBeenCalledWith(expect.objectContaining({ id: 'רך ב' }));
  });
});

describe('ResolveSheet — the step back (ADR-0155, ADR-0103)', () => {
  afterEach(() => cleanup());

  it('returns to the chooser on the visible חזרה', () => {
    open([SOFT_A, SOFT_B]);
    pick('רך א');
    fireEvent.click(screen.getByText(t.planDay.resolveBack));
    expect(onStepTwo()).toBe(false);
    expect(screen.getByText(t.planDay.resolveChoose)).toBeTruthy();
  });

  it('peels the step on Escape, and only then the sheet', () => {
    const onClose = vi.fn();
    open([SOFT_A, SOFT_B], { onClose });
    pick('רך א');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onStepTwo()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // **The one deliberate behaviour change** (ADR-0155's build log). Both the button and
  // the layer used to be gated on `softMovers.length > 1`, so with a single soft mover
  // you could reach step two and neither could bring you back — the sheet was the only
  // way out. The primitive has one gate, `index > 0`, and unifying them fixed it: a step
  // you can be ON is a step you can leave.
  it('can leave step two even when there was only one event to choose', () => {
    const onClose = vi.fn();
    open([SOFT_A, HARD], { onClose });
    pick('רך א');
    expect(onStepTwo()).toBe(true);

    expect(screen.getByText(t.planDay.resolveBack)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onStepTwo()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});
