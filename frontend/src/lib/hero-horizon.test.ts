import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Note,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { canLift, heroHorizon, type HeroHorizonInput } from './hero-horizon';

const ev = (id: string, e: Partial<TripEvent> = {}): TripEvent => ({
  id,
  tripId: 't1',
  title: `event ${id}`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  date: '2026-08-03',
  startsAt: '2026-08-03T12:00:00Z',
  endsAt: '2026-08-03T13:00:00Z',
  sortOrder: 0,
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  updatedBy: 'u1',
  ...e,
});

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

const place = (id: string, name: string): Place => ({
  id,
  tripId: 't1',
  name,
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  updatedBy: 'u1',
});

const booking = (id: string, b: Partial<Booking> = {}): Booking => ({
  id,
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  title: `booking ${id}`,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
  updatedBy: 'u1',
  ...b,
});

/** Everything empty, so each test adds only what it is about. */
const input = (over: Partial<HeroHorizonInput> = {}): HeroHorizonInput => ({
  events: [],
  nowAll: [],
  nextAll: [],
  bookings: [],
  places: [],
  notes: [],
  ...over,
});

describe('heroHorizon', () => {
  it('keeps nowAll’s order, so the primary stays the primary', () => {
    const a = ev('a');
    const b = ev('b');
    const h = heroHorizon(input({ nowAll: [a, b], events: [a, b] }));
    expect(h.now.map((p) => p.event.id)).toEqual(['a', 'b']);
  });

  it('resolves the place through the booking-authority rule, not the event’s own field', () => {
    // The event names one place, its booking another. `eventPlaceId` says the
    // booking wins for a linked event — the horizon must not re-decide that.
    const e = ev('e', { placeId: 'p-event', bookingId: 'b1' });
    const h = heroHorizon(
      input({
        nowAll: [e],
        events: [e],
        bookings: [booking('b1', { placeId: 'p-booking' })],
        places: [place('p-event', 'the event’s place'), place('p-booking', 'the booking’s place')],
      }),
    );
    expect(h.now[0].placeId).toBe('p-booking');
    expect(h.now[0].place).toBe('the booking’s place');
  });

  it('carries the ids the hand-offs need, not just the resolved name', () => {
    const e = ev('e', { bookingId: 'b1' });
    const h = heroHorizon(
      input({
        nowAll: [e],
        events: [e],
        bookings: [booking('b1', { placeId: 'p1' })],
        places: [place('p1', 'Via dei Tribunali')],
      }),
    );
    expect(h.now[0]).toMatchObject({ placeId: 'p1', bookingId: 'b1' });
  });

  it('a place that is not in the trip resolves to no name and no crash', () => {
    const e = ev('e', { placeId: 'gone' });
    const h = heroHorizon(input({ nowAll: [e], events: [e] }));
    expect(h.now[0].place).toBeUndefined();
    expect(h.now[0].placeId).toBe('gone');
  });

  // The judgement call documented in `notesForEvent`: a booked event's notes live
  // on the BOOKING (ADR-0152 phase 5b), so reading only `eventId` finds nothing on
  // exactly the events most likely to have one.
  it('reads a booked event’s notes from BOTH the event and its booking, event first', () => {
    const e = ev('e', { bookingId: 'b1' });
    const h = heroHorizon(
      input({
        nowAll: [e],
        events: [e],
        bookings: [booking('b1')],
        notes: [note('n-booking', { bookingId: 'b1' }), note('n-event', { eventId: 'e' })],
      }),
    );
    expect(h.now[0].notes.map((n) => n.id)).toEqual(['n-event', 'n-booking']);
  });

  it('an unlinked event reads only its own notes, and never another event’s', () => {
    const e = ev('e');
    const h = heroHorizon(
      input({
        nowAll: [e],
        events: [e],
        notes: [note('mine', { eventId: 'e' }), note('theirs', { eventId: 'other' }), note('gen')],
      }),
    );
    expect(h.now[0].notes.map((n) => n.id)).toEqual(['mine']);
  });

  it('a booking id equal to an event id does not leak notes across host types', () => {
    const e = ev('same');
    const h = heroHorizon(
      input({ nowAll: [e], events: [e], notes: [note('n', { bookingId: 'same' })] }),
    );
    expect(h.now[0].notes).toEqual([]);
  });

  it('reports a settled outcome, and leaves "nobody answered" undefined', () => {
    const planned = ev('p');
    const done = ev('d', { status: EVENT_STATUS.DONE });
    const skipped = ev('s', { status: EVENT_STATUS.SKIPPED });
    const h = heroHorizon(input({ nowAll: [planned, done, skipped], events: [] }));
    expect(h.now.map((p) => p.settled)).toEqual([
      undefined,
      EVENT_STATUS.DONE,
      EVENT_STATUS.SKIPPED,
    ]);
  });

  describe('אחר כך — the third point', () => {
    it('is the first event after the NEXT cluster, not merely the one after now', () => {
      // Two events share the next start (ADR-0041's cluster) — both are `next`, so
      // `then` is the one after both, never the cluster's own second member.
      const n1 = ev('n1', { startsAt: '2026-08-03T14:00:00Z' });
      const n2 = ev('n2', { startsAt: '2026-08-03T14:00:00Z' });
      const later = ev('later', { startsAt: '2026-08-03T19:30:00Z', title: 'ארוחת ערב' });
      const h = heroHorizon(input({ nextAll: [n1, n2], events: [n1, n2, later] }));
      expect(h.then).toEqual({ title: 'ארוחת ערב', startsAt: '2026-08-03T19:30:00Z' });
    });

    it('is absent when next is the last thing in the day', () => {
      const n = ev('n', { startsAt: '2026-08-03T14:00:00Z' });
      expect(heroHorizon(input({ nextAll: [n], events: [n] })).then).toBeUndefined();
    });

    it('is absent when there is no next at all', () => {
      expect(heroHorizon(input({ events: [ev('a')] })).then).toBeUndefined();
    });

    // ADR-0160 §12's condition, asserted rather than trusted to a comment: the type
    // carries no id, so nothing downstream can resolve a place or a note from it.
    it('carries a title and an instant and nothing else', () => {
      const n = ev('n', { startsAt: '2026-08-03T14:00:00Z' });
      const later = ev('later', { startsAt: '2026-08-03T19:30:00Z', placeId: 'p1' });
      const h = heroHorizon(
        input({ nextAll: [n], events: [n, later], places: [place('p1', 'X')] }),
      );
      expect(Object.keys(h.then!).sort()).toEqual(['startsAt', 'title']);
    });
  });
});

// The predicate is the one piece of this feature that can silently answer "nothing
// to lift" on a board with plenty, which is why it is tested exhaustively over the
// four things that count and the two that deliberately do not.
describe('canLift', () => {
  const withNow = (e: Partial<TripEvent>, rest: Partial<HeroHorizonInput> = {}) => {
    const event = ev('now', e);
    return heroHorizon(input({ nowAll: [event], events: [event], ...rest }));
  };

  // OWNER CORRECTION from real use (2026-08-03): the first version returned false on
  // an empty `now`, which made the board un-pressable through every GAP — most of a
  // real day. "Nothing is happening" is not "nothing to show".
  it('is TRUE in a gap, when the next thing has depth', () => {
    const n = ev('n', { startsAt: '2026-08-03T14:00:00Z', placeId: 'p1' });
    const h = heroHorizon(input({ nextAll: [n], events: [n], places: [place('p1', 'the hotel')] }));
    expect(h.now).toEqual([]);
    expect(canLift(h)).toBe(true);
  });

  it('is TRUE in a gap on the third point alone', () => {
    const n = ev('n', { startsAt: '2026-08-03T14:00:00Z' });
    const later = ev('later', { startsAt: '2026-08-03T19:30:00Z' });
    expect(canLift(heroHorizon(input({ nextAll: [n], events: [n, later] })))).toBe(true);
  });

  it('is false only when the whole horizon adds nothing', () => {
    // No now, no next, no then — end of day. Nothing to open, and nothing pretends
    // otherwise: the board is simply not pressable.
    expect(canLift(heroHorizon(input()))).toBe(false);
    // A gap whose next carries no place, no note and no booking, and nothing after
    // it: the collapsed board already shows that next's title and time.
    const n = ev('n', { startsAt: '2026-08-03T14:00:00Z' });
    expect(canLift(heroHorizon(input({ nextAll: [n], events: [n] })))).toBe(false);
  });

  it('is false for a valid now board whose horizon adds nothing (§9’s own example)', () => {
    // A real event, in progress: no note, no place, no booking, nothing concurrent,
    // nothing after. It has the same nothing to open as a free board.
    expect(canLift(withNow({}))).toBe(false);
  });

  it('is true for a place', () => {
    expect(canLift(withNow({ placeId: 'p1' }, { places: [place('p1', 'Via Toledo')] }))).toBe(true);
  });

  it('is true for a note', () => {
    expect(canLift(withNow({}, { notes: [note('n', { eventId: 'now' })] }))).toBe(true);
  });

  it('is true for a booking to reach', () => {
    expect(canLift(withNow({ bookingId: 'b1' }, { bookings: [booking('b1')] }))).toBe(true);
  });

  it('is true for a concurrent sibling, even with no depth anywhere', () => {
    const a = ev('a');
    const b = ev('b');
    expect(canLift(heroHorizon(input({ nowAll: [a, b], events: [a, b] })))).toBe(true);
  });

  it('is true for depth on NEXT alone, once something is happening now', () => {
    const now = ev('now');
    const n = ev('n', { startsAt: '2026-08-03T14:00:00Z', placeId: 'p1' });
    const h = heroHorizon(
      input({ nowAll: [now], nextAll: [n], events: [now, n], places: [place('p1', 'the hotel')] }),
    );
    expect(canLift(h)).toBe(true);
  });

  it('is true for a third point alone', () => {
    const now = ev('now');
    const n = ev('n', { startsAt: '2026-08-03T14:00:00Z' });
    const later = ev('later', { startsAt: '2026-08-03T19:30:00Z' });
    expect(
      canLift(heroHorizon(input({ nowAll: [now], nextAll: [n], events: [now, n, later] }))),
    ).toBe(true);
  });

  // The exclusion that keeps the rebuff reachable at all. Every event is settleable
  // (ADR-0139 §2), so if settle state counted, this would be true for every board
  // with a now event and the rebuff would only ever fire on `free`.
  it('does NOT count the settle verbs, in either the answered or unanswered state', () => {
    expect(canLift(withNow({ status: EVENT_STATUS.PLANNED }))).toBe(false);
    expect(canLift(withNow({ status: EVENT_STATUS.DONE }))).toBe(false);
    expect(canLift(withNow({ status: EVENT_STATUS.SKIPPED }))).toBe(false);
  });

  it('does NOT count a code or a countdown — the collapsed board already shows those', () => {
    // A hard event with a confirmation code on its own event record still adds
    // nothing: what would be new is the WAY THROUGH to a booking, and there is none.
    expect(canLift(withNow({ kind: EVENT_KIND.HARD }))).toBe(false);
  });
});
