import { describe, expect, it } from 'vitest';
import { createEventSchema, createTripSchema, moveEventSchema } from './schemas';

// B-05: `date`/`startsAt`/`timezone` were bare `z.string()`, so "banana" passed
// validation and blew up later as a Prisma 500 / Intl RangeError. These reject
// malformed temporal input at the edge (a 400, not a 500).
describe('temporal field validation (B-05)', () => {
  const baseEvent = { title: 'Dinner', kind: 'soft' as const };

  it('rejects a malformed event date', () => {
    expect(createEventSchema.safeParse({ ...baseEvent, date: 'banana' }).success).toBe(false);
  });

  it('rejects an impossible calendar date', () => {
    expect(createEventSchema.safeParse({ ...baseEvent, date: '2026-02-30' }).success).toBe(false);
  });

  it('accepts a well-formed date and a Z datetime', () => {
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        date: '2026-07-19',
        startsAt: '2026-07-19T10:00:00Z',
        endsAt: '2026-07-19T12:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('accepts numeric-offset datetimes (e.g. +09:00)', () => {
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        date: '2026-07-19',
        startsAt: '2026-07-19T10:00:00+09:00',
        endsAt: '2026-07-19T12:00:00+09:00',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-datetime startsAt', () => {
    expect(
      createEventSchema.safeParse({ ...baseEvent, date: '2026-07-19', startsAt: 'noon' }).success,
    ).toBe(false);
  });

  it('rejects a malformed startsAt on move', () => {
    expect(moveEventSchema.safeParse({ startsAt: 'later' }).success).toBe(false);
  });

  const baseTrip = {
    name: 'Trip',
    destination: 'Tokyo',
    startDate: '2026-07-19',
    endDate: '2026-07-25',
  };

  it('rejects an invalid IANA timezone', () => {
    expect(createTripSchema.safeParse({ ...baseTrip, timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('accepts a real IANA timezone and defaults to UTC when omitted', () => {
    expect(createTripSchema.safeParse({ ...baseTrip, timezone: 'Asia/Tokyo' }).success).toBe(true);
    const parsed = createTripSchema.parse(baseTrip);
    expect(parsed.timezone).toBe('UTC');
  });
});
