import { describe, expect, it } from 'vitest';
import {
  createEventSchema,
  createNoteSchema,
  createTripSchema,
  moveEventSchema,
  updateNoteSchema,
} from './schemas';
import { NOTE_HOST_KEYS } from './entities';

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

// The two rules a note owes (ADR-0152 §1/§2, ADR-0153 §5), enforced here so the client's
// refusal and the server's 400 are the same verdict rather than two implementations.
describe('note input validation', () => {
  const hosted = { body: 'הכניסה מאחור', eventId: 'evt-1234abcd' };

  it('refuses a note with neither body nor url — the editor’s one refusal', () => {
    expect(createNoteSchema.safeParse({ title: 'מזומן בלבד' }).success).toBe(false);
  });

  it('refuses one whose body and url are only whitespace', () => {
    expect(createNoteSchema.safeParse({ body: '   ', url: '  ' }).success).toBe(false);
  });

  it('marks the refusal on `body`, which is the field the editor leads with', () => {
    const result = createNoteSchema.safeParse({ title: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['body']);
  });

  it('accepts a body-only note, a url-only note, and both', () => {
    expect(createNoteSchema.safeParse({ body: 'מזומן בלבד' }).success).toBe(true);
    expect(createNoteSchema.safeParse({ url: 'instagram.com/p/x8kdQ2mLp' }).success).toBe(true);
    expect(createNoteSchema.safeParse({ body: 'כאן', url: 'example.com/x' }).success).toBe(true);
  });

  it('accepts a general note (no host) and a note on any one host', () => {
    expect(createNoteSchema.safeParse({ body: 'מי הברז ראויים לשתייה' }).success).toBe(true);
    for (const key of NOTE_HOST_KEYS) {
      expect(createNoteSchema.safeParse({ body: 'x', [key]: 'host-1234abcd' }).success).toBe(true);
    }
  });

  it('refuses two hosts at once — the union is closed and exclusive', () => {
    expect(createNoteSchema.safeParse({ ...hosted, bookingId: 'bkg-1234abcd' }).success).toBe(
      false,
    );
  });

  // A hosted note is written with no category at all: it is RESOLVED from the host at
  // render (§5's amendment), never copied at write time, so the schema must not require it.
  it('accepts a hosted note carrying no category', () => {
    const result = createNoteSchema.safeParse(hosted);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBeUndefined();
  });

  it('lets an update clear the title while keeping the note valid', () => {
    expect(updateNoteSchema.safeParse({ title: null, body: 'עדיין יש גוף' }).success).toBe(true);
  });

  it('refuses an update that would empty the note', () => {
    expect(updateNoteSchema.safeParse({ body: null, url: null }).success).toBe(false);
  });
});
