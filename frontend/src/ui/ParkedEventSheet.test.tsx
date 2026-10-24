// @vitest-environment jsdom
// **A parked card opens its sheet** (ADR-0231 §2, F2): `שחזור ליום` first, the read second, and
// the subject line says what state the card is in (F1).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EVENT_KIND, EVENT_STATUS, type Booking, type TripEvent } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { ParkedEventSheet } from './ParkedEventSheet';
import { t } from '../i18n/he';

const TZ = 'Asia/Tokyo';
const DATE = '2026-09-16';
const base: TripEvent = {
  id: 'ramen',
  tripId: 't1',
  date: DATE,
  title: 'Ichiran Ramen',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.SKIPPED,
  startsAt: `${DATE}T19:30:00+09:00`,
  endsAt: `${DATE}T21:00:00+09:00`,
  bookingId: 'b1',
  sortOrder: 1,
  source: 'manual',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  updatedBy: 'u1',
};
const booking = { id: 'b1' } as unknown as Booking;

describe('ParkedEventSheet', () => {
  afterEach(() => cleanup());

  it('a parked booking: לא מתקיים in the subject, שחזור ליום first, להזמנה second', () => {
    const onRestore = vi.fn();
    const onOpen = vi.fn();
    render(
      wrapNav(
        <ParkedEventSheet
          event={base}
          bookings={[booking]}
          tz={TZ}
          onRestore={onRestore}
          onOpen={onOpen}
          onClose={() => {}}
        />,
      ),
    );
    expect(document.querySelector('.wp-row-subject')!.textContent).toContain(t.day.notHappeningTag);
    expect(document.querySelector('.wp-row-subject')!.textContent).toContain('19:30');
    const actions = [...document.querySelectorAll('.wp-row-action')].map((b) => b.textContent);
    expect(actions).toEqual([t.day.parked.restore, t.hero.toBooking]);
    fireEvent.click(screen.getByRole('button', { name: t.day.parked.restore }));
    expect(onRestore).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.hero.toBooking }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('a skipped stop: דילגתם, and its read is פרטים', () => {
    render(
      wrapNav(
        <ParkedEventSheet
          event={{ ...base, kind: EVENT_KIND.SOFT, bookingId: undefined }}
          bookings={[]}
          tz={TZ}
          onRestore={() => {}}
          onOpen={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(document.querySelector('.wp-row-subject')!.textContent).toContain(t.day.skippedTag);
    const actions = [...document.querySelectorAll('.wp-row-action')].map((b) => b.textContent);
    expect(actions).toEqual([t.day.parked.restore, t.day.read.details]);
  });
});
