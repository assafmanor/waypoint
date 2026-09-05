// @vitest-environment jsdom
// The tests are about what the row CLAIMS, because that is the whole reason it exists:
// a check-in used to state a position it could not defend, and this row's job is to say
// the same fact without the claim.
//
// It is a `.transition-row` since ADR-0219 §4 — the committed point's grammar, missing one
// fact — so the selectors here are that row's. Nothing it says changed.
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { UnplacedCommitment } from './UnplacedCommitment';
import { t } from '../../i18n/he';

afterEach(cleanup);

const TZ = 'Asia/Tokyo';
const ev = (over: Partial<TripEvent>): TripEvent => ({
  id: 'e1',
  tripId: 't',
  date: '2026-07-07',
  title: 'מלון ניס',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 1,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...over,
});
const noop = () => {};
const FLOOR = Date.parse('2026-07-07T15:00:00+09:00');

const renderRow = (props: Partial<Parameters<typeof UnplacedCommitment>[0]> = {}) =>
  render(
    <UnplacedCommitment
      row={{ event: ev({ bookingId: 'b1' }), labelKey: 'checkIn', edge: 'start', atMs: FLOOR }}
      tz={TZ}
      bookings={[{ id: 'b1' } as Booking]}
      onDone={noop}
      onSkip={noop}
      onUndo={noop}
      {...props}
    />,
  );

describe('UnplacedCommitment', () => {
  it('says the floor as a floor — "from", never a bare clock', () => {
    const { container } = renderRow();
    expect(container.querySelector('.tr-clock')!.textContent).toContain(t.day.fromTime('15:00'));
    // The word for the edge is still there; what is gone is the claim that 15:00 is when
    // this happens.
    expect(container.querySelector('.tr-label')!.textContent).toContain(
      t.glance.transition.checkIn,
    );
    // A floor wears the floor's open-ended box, the same shape it would one row down — the
    // grammar this row joined is the point of joining it (ADR-0210 §2).
    expect(container.querySelector('.tr-clock')!.getAttribute('data-bound')).toBe('not-before');
  });

  it('says so plainly when there is no clock at all', () => {
    const { container } = renderRow({
      row: { event: ev({ id: 'e2', title: 'איסוף כרטיסים' }) },
    });
    const clock = container.querySelector('.tr-clock')!;
    expect(clock.textContent).toBe(t.day.noTime);
    // No bound to draw, so no box: `ללא שעה` is not a clock at all.
    expect(clock.getAttribute('data-bound')).toBe('exact');
  });

  it('is the committed point’s row, at the top of the day’s list', () => {
    const { container } = renderRow();
    expect(container.querySelector('.transition-row')).toBeTruthy();
    expect(container.querySelector('.tr-badge')).toBeTruthy();
    expect(container.querySelector('.tr-title')!.textContent).toBe('מלון ניס');
  });

  it('carries the settle pair, so the remaining count can clear', () => {
    // ADR-0164 counts a check-in in `נותרו היום` until it is settled, and ADR-0171 §6
    // keeps it counted after its floor passes — so a host with no way to answer would
    // leave that number stuck all evening. This is that answer.
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const { container } = renderRow({ onDone, onSkip });
    fireEvent.click(container.querySelector('.wp-settle-btn.done')!);
    fireEvent.click(container.querySelector('.wp-settle-btn.skip')!);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows what was answered, with the undo — the same vocabulary as every other host', () => {
    const onUndo = vi.fn();
    const { container } = renderRow({
      row: {
        event: ev({ status: EVENT_STATUS.DONE, bookingId: 'b1' }),
        labelKey: 'checkIn',
        edge: 'start',
        atMs: FLOOR,
      },
      onUndo,
    });
    expect(container.querySelector('.wp-settle-tag.ok')).not.toBeNull();
    fireEvent.click(container.querySelector('.wp-settle-btn.undo')!);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("drops the whole control when no handlers are given — Plan mode's posture", () => {
    // ADR-0171 §10e. Plan settles through a sheet off the row menu and never inline, and
    // `נותרו היום` is a Trip-mode number — so in Plan this row is the same STATEMENT with
    // nothing to act on. The two modes must agree that 15:00 is a floor and are allowed to
    // differ in what you can do about it (ADR-0159 §1).
    const { container } = renderRow({ onDone: undefined, onSkip: undefined, onUndo: undefined });
    expect(container.querySelector('.wp-settle')).toBeNull();
    // …and it still says the same thing, which is the half that must not differ.
    expect(container.querySelector('.tr-clock')!.textContent).toContain(t.day.fromTime('15:00'));
  });

  it('opens the booking behind it, and refuses when there is none', () => {
    const onOpen = vi.fn();
    const { container } = renderRow({ onOpen });
    fireEvent.click(container.querySelector('.tr-face')!);
    expect(onOpen).toHaveBeenCalledWith({ id: 'b1' });

    cleanup();
    const bare = renderRow({ row: { event: ev({ id: 'e3', bookingId: undefined }) }, onOpen });
    expect(bare.container.querySelector('.tr-face')).toHaveProperty('disabled', true);
  });
});
