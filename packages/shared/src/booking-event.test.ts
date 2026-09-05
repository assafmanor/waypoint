import { describe, expect, it } from 'vitest';
import { bookingEventFields, eventStopPlaceId } from './booking-event';

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

// **WHERE AN EVENT IS** — the other half of the rule the file above encodes. `bookingEventFields`
// carries no `placeId` because ADR-0048 says a linked event's place is its booking's; every day
// derivation that then read `event.placeId` was reading the column that decision CLEARS.
describe('eventStopPlaceId', () => {
  it('takes the event’s own place when no booking backs it', () => {
    expect(eventStopPlaceId({ placeId: 'p1' })).toBe('p1');
  });

  it('takes the BOOKING’s place when one does — the column on the event is cleared', () => {
    expect(eventStopPlaceId({ placeId: null }, { placeId: 'p-hotel' })).toBe('p-hotel');
  });

  // The booking is the authority, not a fallback: a stale `placeId` left on a row that was
  // later linked must not outvote the booking it now belongs to.
  it('lets the booking win over a stale place left on the event', () => {
    expect(eventStopPlaceId({ placeId: 'p-old' }, { placeId: 'p-new' })).toBe('p-new');
  });

  // A leg is AT two places rather than one, and a caller that wants them asks for them.
  it('answers with neither end of a leg', () => {
    expect(
      eventStopPlaceId({ placeId: null }, { fromPlaceId: 'a', toPlaceId: 'b' }),
    ).toBeUndefined();
    expect(eventStopPlaceId({ placeId: 'p1' }, { toPlaceId: 'b' })).toBeUndefined();
  });

  // Prisma says `null` where these shapes say `undefined`, and the seam is here so neither
  // caller writes `?? undefined` at every field (`packages/shared/CLAUDE.md`).
  it('normalises Prisma’s null to undefined at both levels', () => {
    expect(eventStopPlaceId({ placeId: null })).toBeUndefined();
    expect(eventStopPlaceId({ placeId: null }, { placeId: null })).toBeUndefined();
  });
});
