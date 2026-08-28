// @vitest-environment jsdom
//
// **WHERE THE DAY STARTS AND WHERE IT ENDS** (ADR-0209 §1). Four drafts of that ADR died trying to
// position the *moment* of checking out or in; this row exists because two other facts survive
// every counter-example the owner raised — you started the day at that stay, and/or you end it
// there — and because a stay was being named twice on one screen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { StayRow } from './StayRow';

const stay = (e: Partial<TripEvent> = {}): TripEvent => ({
  id: 'stay',
  tripId: 't1',
  title: 'מלון סנטרו',
  category: 'lodging',
  icon: '🏨',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  date: '2026-08-01',
  endDate: '2026-08-05',
  startsAt: '2026-08-01T13:00:00Z',
  endsAt: '2026-08-05T09:00:00Z',
  sortOrder: 0,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  updatedBy: 'u1',
  ...e,
});

const booking: Booking = {
  id: 'bk',
  tripId: 't1',
  type: 'hotel',
  title: 'מלון סנטרו',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  updatedBy: 'u1',
} as Booking;

describe('StayRow', () => {
  afterEach(() => cleanup());

  it('names the place and states the bound', () => {
    render(
      <StayRow
        edge="wake"
        stay={stay()}
        bound="לילה ⁦2⁩ מתוך ⁦4⁩"
        bookings={[]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('מלון סנטרו')).toBeTruthy();
    expect(screen.getByText('לילה ⁦2⁩ מתוך ⁦4⁩')).toBeTruthy();
  });

  // **THE ROW CARRIES NO CLOCK**, and that is what lets every leg stay an ordinary journey block
  // (ADR-0209 §3): with nothing here to contradict, the merge an earlier draft needed is gone.
  it('carries no clock of its own', () => {
    const { container } = render(
      <StayRow
        edge="wake"
        stay={stay()}
        bound="צ׳ק-אאוט · עד ⁦09:40⁩"
        bookings={[]}
        onOpen={vi.fn()}
      />,
    );
    expect(container.querySelector('.tr-time')).toBeNull();
    expect(container.querySelector('.tr-bound')).toBeTruthy();
  });

  // The bound is quiet on purpose: it is a constraint, not a commitment, so it does not spend the
  // clock's amber (rule 4 / ADR-0028). Asserted as a class rather than a colour — jsdom has no
  // cascade — with the paint measured in Chromium instead.
  it('keeps the bound out of the clock’s slot', () => {
    const { container } = render(
      <StayRow
        edge="wake"
        stay={stay()}
        bound="צ׳ק-אין · ⁦17:00–20:00⁩"
        bookings={[]}
        onOpen={vi.fn()}
      />,
    );
    expect(container.querySelector('.tr-main > .tr-bound')).toBeTruthy();
  });

  it('opens the booking it is backed by, and refuses when there is none', () => {
    const onOpen = vi.fn();
    render(
      <StayRow edge="wake" stay={stay({ bookingId: 'bk' })} bookings={[booking]} onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(booking);

    cleanup();
    render(<StayRow edge="wake" stay={stay()} bookings={[]} onOpen={onOpen} />);
    // `toBeDisabled` is jest-dom's and this suite does not load it, so the attribute is the
    // assertion — which is also what the DOM actually carries.
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });

  // **The settle pair had to move here with the edge row** (ADR-0184 §2 / ADR-0171 §6): a
  // `not-before` edge stays in `נותרו היום` until it is DONE, because 15:01 does not mean anybody
  // checked in. Dropping it would re-open the report §2 fixed.
  it('offers the settle pair when the host supplies it', () => {
    const onDone = vi.fn();
    render(
      <StayRow
        edge="wake"
        stay={stay()}
        bookings={[]}
        onOpen={vi.fn()}
        onDone={onDone}
        onSkip={vi.fn()}
        onUndo={vi.fn()}
      />,
    );
    // The settle pair renders its own buttons beside the face, so the face is not the only one.
    const settle = document.querySelector('.wp-settle button')!;
    fireEvent.click(settle);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('is a statement where the host supplies none — a past day is read-only', () => {
    const { container } = render(
      <StayRow edge="wake" stay={stay()} bookings={[]} onOpen={vi.fn()} />,
    );
    expect(container.querySelector('.wp-settle')).toBeNull();
  });

  // **THE BRACKET OPENS INTO THE DAY** (ADR-0210 §4) — down on the row you woke in, up on the
  // row you sleep in. Asserted on the CLASS rather than on a computed border, because jsdom
  // applies no stylesheet: what this can prove is that the row states which end it is, and the
  // direction is a pair of `border-block-*` rules in `screens.css` keyed on exactly this class.
  //
  // Asserting both arms in one test on purpose: the failure worth catching is not "the class is
  // missing" but "both ends draw the same bracket", which a single-arm assertion passes.
  it('says which end of the day it is, and the two ends differ', () => {
    const { container: wake } = render(
      <StayRow edge="wake" stay={stay()} bookings={[]} onOpen={vi.fn()} />,
    );
    const wakeRow = wake.querySelector('.stay-bookend')!;
    expect(wakeRow).toBeTruthy();
    expect(wakeRow.classList.contains('at-sleep')).toBe(false);

    cleanup();

    const { container: sleep } = render(
      <StayRow edge="sleep" stay={stay()} bookings={[]} onOpen={vi.fn()} />,
    );
    expect(sleep.querySelector('.stay-bookend.at-sleep')).toBeTruthy();
  });

  // **IT IS NO LONGER A COMMITMENT BOX** (ADR-0210 §4). The row still reuses `.transition-row`'s
  // geometry — the badge column, the title, the trailing slot — and `stay-bookend` is what takes
  // the amber tint, the amber border and the 3px amber spine back off. A regression here is
  // silent: the row would look exactly like the car pick-up above it again, which is the report
  // this ADR answers.
  it('keeps the transition row tree and drops its commitment paint', () => {
    const { container } = render(
      <StayRow
        edge="wake"
        stay={stay()}
        bound="צ׳ק-אאוט · עד ⁦11:00⁩"
        bookings={[]}
        onOpen={vi.fn()}
      />,
    );
    const row = container.querySelector('.transition-row')!;
    expect(row.classList.contains('stay-bookend')).toBe(true);
    expect(container.querySelector('.tr-badge')).toBeTruthy();
    expect(container.querySelector('.tr-title')).toBeTruthy();
  });
});
