import { describe, expect, it } from 'vitest';
import { CHANGE_ACTION, ENTITY_TYPE, type Note } from '@waypoint/shared';
import { dropNotesForHostChange, isHostedBy, noteWhen } from './notes';
import { t } from '../i18n/he';

const note = (id: string, host: Partial<Note> = {}): Note => ({
  id,
  tripId: 't1',
  body: `note ${id}`,
  source: 'member',
  createdBy: 'u1',
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  updatedBy: 'u1',
  ...host,
});

const del = (entityType: (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE], entityId: string) => ({
  entityType,
  entityId,
  action: CHANGE_ACTION.DELETE,
});

// The rule that stands in for a cascade nobody hears about: Postgres removes a deleted
// host's notes WITHOUT writing Change rows (ADR-0152 §2), so this is the only thing that
// tells a peer their notes are gone before the next full snapshot.
describe('dropNotesForHostChange (the host cascade’s sync half)', () => {
  const notes = [
    note('n1', { eventId: 'e1' }),
    note('n2', { eventId: 'e1' }),
    note('n3', { eventId: 'e2' }),
    note('n4', { bookingId: 'b1' }),
    note('n5'), // general
  ];

  it('drops every note the deleted host was hosting, and nothing else', () => {
    const next = dropNotesForHostChange(notes, del(ENTITY_TYPE.EVENT, 'e1'));
    expect(next.map((n) => n.id)).toEqual(['n3', 'n4', 'n5']);
  });

  it('matches on the host TYPE too — a booking id equal to an event id drops nothing', () => {
    const next = dropNotesForHostChange(notes, del(ENTITY_TYPE.BOOKING, 'e1'));
    expect(next).toBe(notes);
  });

  it('never touches a general note', () => {
    const next = dropNotesForHostChange(notes, del(ENTITY_TYPE.EVENT, 'e2'));
    expect(next.some((n) => n.id === 'n5')).toBe(true);
  });

  it('ignores a host UPDATE — only a delete cascades', () => {
    const next = dropNotesForHostChange(notes, {
      entityType: ENTITY_TYPE.EVENT,
      entityId: 'e1',
      action: CHANGE_ACTION.UPDATE,
    });
    expect(next).toBe(notes);
  });

  it('ignores a delete of an entity type that cannot host a note', () => {
    expect(dropNotesForHostChange(notes, del(ENTITY_TYPE.TRIP, 't1'))).toBe(notes);
    expect(dropNotesForHostChange(notes, del(ENTITY_TYPE.MEMBERSHIP, 'm1'))).toBe(notes);
  });

  // Identity matters: this runs on EVERY change, and a fresh array each time would
  // re-render every note surface on every unrelated write.
  it('returns the same array reference when nothing is dropped', () => {
    expect(dropNotesForHostChange(notes, del(ENTITY_TYPE.EVENT, 'nobody'))).toBe(notes);
  });

  it('covers all five host types', () => {
    const hosted = [
      note('a', { eventId: 'x' }),
      note('b', { bookingId: 'x' }),
      note('c', { placeId: 'x' }),
      note('d', { maybeItemId: 'x' }),
      note('e', { documentId: 'x' }),
    ];
    const types = [
      ENTITY_TYPE.EVENT,
      ENTITY_TYPE.BOOKING,
      ENTITY_TYPE.PLACE,
      ENTITY_TYPE.MAYBE_ITEM,
      ENTITY_TYPE.DOCUMENT,
    ];
    for (const type of types) {
      expect(dropNotesForHostChange(hosted, del(type, 'x'))).toHaveLength(4);
    }
  });
});

describe('isHostedBy', () => {
  it('is false for a general note against any host', () => {
    expect(isHostedBy(note('n'), ENTITY_TYPE.EVENT, 'e1')).toBe(false);
  });

  it('is false for an entity type that cannot host', () => {
    expect(isHostedBy(note('n', { eventId: 'e1' }), ENTITY_TYPE.TRIP, 'e1')).toBe(false);
  });
});

// The owner's report: a note briefly read `לפני NaN שנים`. `NaN <= 0` is false, so an
// unparseable date walked every rung of the elapsed ladder and fell out of the last one.
// A row can be in that state for one reason only — this device queued it and the server
// has not stamped it yet — so "now" is the truth for it, not a placeholder.
describe('noteWhen (never a non-finite duration)', () => {
  const NOW = Date.parse('2026-08-07T12:00:00Z');

  it('phrases an elapsed length off the shared ladder', () => {
    expect(noteWhen('2026-08-04T12:00:00Z', NOW)).toBe(t.changeFeed.relTime.agoPrefix('3 ימים'));
  });

  it('reads "now" for a timestamp that will not parse', () => {
    for (const createdAt of ['', 'not a date', undefined as unknown as string])
      expect(noteWhen(createdAt, NOW)).toBe(t.changeFeed.relTime.now);
  });

  it('reads "now" for a note stamped a moment ago, or ahead of this clock', () => {
    expect(noteWhen('2026-08-07T11:59:59Z', NOW)).toBe(t.changeFeed.relTime.now);
    expect(noteWhen('2026-08-07T12:05:00Z', NOW)).toBe(t.changeFeed.relTime.now);
  });
});
