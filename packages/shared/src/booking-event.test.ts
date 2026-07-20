import { describe, expect, it } from 'vitest';
import { bookingEventFields } from './booking-event';

const booking = (over: Partial<{ id: string; title: string; type: string }> = {}) =>
  ({ id: 'bk-1', title: 'מסעדה יקרה', type: 'restaurant', ...over }) as {
    id: string;
    title: string;
    type: 'restaurant' | 'flight';
  };

describe('bookingEventFields (shared booking→event derivation)', () => {
  it('takes the title from the booking and ties bookingId', () => {
    const f = bookingEventFields(booking(), { date: '2026-07-05' });
    expect(f.title).toBe('מסעדה יקרה');
    expect(f.bookingId).toBe('bk-1');
  });

  it('defaults category to the booking type and kind to hard', () => {
    const f = bookingEventFields(booking(), { date: '2026-07-05' });
    expect(f.category).toBe('food'); // BOOKING_TYPE_TO_CATEGORY[restaurant]
    expect(f.kind).toBe('hard');
  });

  it('honors an explicit category/kind on the seed', () => {
    const f = bookingEventFields(booking({ type: 'flight' }), {
      date: '2026-07-05',
      category: 'transport',
      kind: 'soft',
    });
    expect(f.category).toBe('transport');
    expect(f.kind).toBe('soft');
  });

  it('passes the schedule through unchanged', () => {
    const f = bookingEventFields(booking(), {
      date: '2026-07-05',
      startsAt: '2026-07-05T11:00:00Z',
      endsAt: '2026-07-05T12:00:00Z',
      endDate: '2026-07-06',
      icon: '🍜',
    });
    expect(f).toMatchObject({
      date: '2026-07-05',
      startsAt: '2026-07-05T11:00:00Z',
      endsAt: '2026-07-05T12:00:00Z',
      endDate: '2026-07-06',
      icon: '🍜',
    });
  });
});
