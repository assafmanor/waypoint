import { describe, expect, it } from 'vitest';
import { EVENT_STATUS, type Booking, type BookingEventSeed } from '@waypoint/shared';
import { bookingLinkedEventChange } from './outbox-effects';

const booking = (over: Partial<Booking> = {}): Booking =>
  ({
    id: 'bk-1',
    tripId: 't1',
    type: 'restaurant',
    title: 'מסעדה יקרה',
    source: 'manual',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    updatedBy: 'u1',
    ...over,
  }) as Booking;
const seed = (over: Partial<BookingEventSeed> = {}): BookingEventSeed & { id: string } => ({
  id: 'ev-1',
  date: '2026-07-05',
  startsAt: '2026-07-05T11:00:00Z',
  ...over,
});
const ctx = { actorUserId: 'u1', nowIso: '2026-07-02T00:00:00Z' };

describe('bookingLinkedEventChange (offline linked-event sync, ADR-0093)', () => {
  it('targets the seed id as an event change', () => {
    const c = bookingLinkedEventChange(booking(), seed(), ctx, 'create');
    expect(c.entityType).toBe('event');
    expect(c.entityId).toBe('ev-1');
    expect(c.action).toBe('create');
  });

  it('create carries the full event (with a status), matching the server derivation', () => {
    const c = bookingLinkedEventChange(booking(), seed(), ctx, 'create');
    const after = c.after as Record<string, unknown>;
    expect(after.title).toBe('מסעדה יקרה'); // from the booking
    expect(after.bookingId).toBe('bk-1');
    expect(after.category).toBe('food'); // default from restaurant
    expect(after.status).toBe(EVENT_STATUS.PLANNED);
    expect(after.startsAt).toBe('2026-07-05T11:00:00Z');
  });

  it('update carries schedule fields only — no status/sortOrder — so a merge preserves them', () => {
    const c = bookingLinkedEventChange(booking(), seed(), ctx, 'update');
    const after = c.after as Record<string, unknown>;
    expect(after.title).toBe('מסעדה יקרה');
    expect(after.startsAt).toBe('2026-07-05T11:00:00Z');
    expect('status' in after).toBe(false);
    expect('sortOrder' in after).toBe(false);
  });
});
