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

function open(
  events: TripEvent[],
  opts: { onMove?: () => void; onOther?: () => void; onClose?: () => void } = {},
) {
  return render(
    wrapNav(
      <ResolveSheet
        cluster={clusterOf(...events)}
        tz={TZ}
        onMove={opts.onMove ?? vi.fn()}
        onOther={opts.onOther ?? vi.fn()}
        onClose={opts.onClose ?? vi.fn()}
      />,
    ),
  );
}

const pick = (title: string) => fireEvent.click(screen.getByText(title));
const onStepTwo = () => !!screen.queryByText(t.planDay.resolveOther);

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
    expect(screen.getByText(t.planDay.resolveOther)).toBeTruthy();
  });
});

describe('ResolveSheet — step two moves it', () => {
  afterEach(() => cleanup());

  it('hands back the chosen event and a minute offset', () => {
    const onMove = vi.fn();
    open([SOFT_A, SOFT_B], { onMove });
    pick('רך א');
    // `אחרי` puts it after the rest of the cluster: B ends 11:30, A starts 10:00 → +90.
    fireEvent.click(screen.getByText(t.planDay.resolveAfter, { exact: false }));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'רך א' }), 90);
  });

  it('hands the exact time-setter the same event', () => {
    const onOther = vi.fn();
    open([SOFT_A, SOFT_B], { onOther });
    pick('רך ב');
    fireEvent.click(screen.getByText(t.planDay.resolveOther));
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
