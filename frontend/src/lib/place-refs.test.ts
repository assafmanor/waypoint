import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { PLACE_REF_KIND, placeRefs } from './place-refs';

const DAY = '2026-07-20';
const NEXT_DAY = '2026-07-21';

const event = (partial: Partial<TripEvent> & Pick<TripEvent, 'id'>): TripEvent => ({
  tripId: 't',
  date: DAY,
  title: `${partial.id} plan`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const booking = (partial: Partial<Booking> & Pick<Booking, 'id' | 'type'>): Booking => ({
  tripId: 't',
  title: partial.id,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const maybe = (partial: Partial<MaybeItem> & Pick<MaybeItem, 'id'>): MaybeItem =>
  ({ tripId: 't', title: partial.id, consumed: false, ...partial }) as MaybeItem;

const source = (input: {
  events?: TripEvent[];
  bookings?: Booking[];
  maybeItems?: MaybeItem[];
}) => ({
  events: input.events ?? [],
  bookings: input.bookings ?? [],
  maybeItems: input.maybeItems ?? [],
});

describe('placeRefs — the way in to the entity (ADR-0121 §8)', () => {
  it('an unlinked event is an event entry, at its own moment', () => {
    const refs = placeRefs(
      'museum',
      source({
        events: [event({ id: 'e', placeId: 'museum', startsAt: `${DAY}T09:00:00Z` })],
      }),
      { onDate: DAY },
    );
    expect(refs).toEqual([
      {
        kind: PLACE_REF_KIND.event,
        key: 'e:start',
        eventId: 'e',
        bookingId: undefined,
        date: DAY,
        edge: 'start',
        at: Date.parse(`${DAY}T09:00:00Z`),
      },
    ]);
  });

  // A booking is what a traveller wants when there is one: the confirmation code,
  // the notes and the documents are there, not on the event that schedules it.
  it('a booking-linked event is a BOOKING entry, carrying both ids', () => {
    const refs = placeRefs(
      'hotel',
      source({
        events: [event({ id: 'e', bookingId: 'bk', startsAt: `${DAY}T15:00:00Z` })],
        bookings: [booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'hotel' })],
      }),
      { onDate: DAY },
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe(PLACE_REF_KIND.booking);
    expect(refs[0].bookingId).toBe('bk');
    expect(refs[0].eventId).toBe('e');
  });

  // Union semantics (ADR-0109 §4) made several references to one place normal; this
  // is the first surface that lets you act on each of them.
  it('a station that is one leg’s origin and another’s destination gets TWO entries', () => {
    const refs = placeRefs(
      'station',
      source({
        events: [
          event({ id: 'out', bookingId: 'bk1', startsAt: `${DAY}T08:00:00Z` }),
          event({ id: 'back', bookingId: 'bk2', startsAt: `${DAY}T19:00:00Z` }),
        ],
        bookings: [
          booking({
            id: 'bk1',
            type: BOOKING_TYPE.TRAIN,
            fromPlaceId: 'station',
            toPlaceId: 'kyoto',
          }),
          booking({
            id: 'bk2',
            type: BOOKING_TYPE.TRAIN,
            fromPlaceId: 'kyoto',
            toPlaceId: 'station',
          }),
        ],
      }),
      { onDate: DAY },
    );
    expect(refs.map((r) => r.key)).toEqual(['out:start', 'back:end']);
    expect(refs.map((r) => r.edge)).toEqual(['start', 'end']);
  });

  it('the moment’s owner leads, and anything clockless trails', () => {
    const refs = placeRefs(
      'plaza',
      source({
        events: [
          event({ id: 'evening', placeId: 'plaza', startsAt: `${DAY}T20:00:00Z` }),
          event({ id: 'untimed', placeId: 'plaza' }),
          event({ id: 'morning', placeId: 'plaza', startsAt: `${DAY}T09:00:00Z` }),
        ],
      }),
      { onDate: DAY },
    );
    expect(refs.map((r) => r.eventId)).toEqual(['morning', 'evening', 'untimed']);
  });

  it('a transport pair contributes the endpoint that matches, at its own edge', () => {
    const src = source({
      events: [
        event({
          id: 'f',
          bookingId: 'bk',
          startsAt: `${DAY}T07:15:00Z`,
          endsAt: `${DAY}T11:00:00Z`,
        }),
      ],
      bookings: [
        booking({ id: 'bk', type: BOOKING_TYPE.FLIGHT, fromPlaceId: 'origin', toPlaceId: 'dest' }),
      ],
    });
    expect(placeRefs('origin', src, { onDate: DAY })[0]).toMatchObject({
      edge: 'start',
      at: Date.parse(`${DAY}T07:15:00Z`),
    });
    // The destination's moment is the ARRIVAL, not the departure.
    expect(placeRefs('dest', src, { onDate: DAY })[0]).toMatchObject({
      edge: 'end',
      at: Date.parse(`${DAY}T11:00:00Z`),
    });
  });

  it('a multi-day stay reads check-in on its first day and check-out on its last', () => {
    const src = source({
      events: [
        event({
          id: 'h',
          placeId: 'hotel',
          date: '2026-07-19',
          endDate: '2026-07-22',
          startsAt: '2026-07-19T06:00:00Z',
          endsAt: '2026-07-22T02:00:00Z',
        }),
      ],
    });
    expect(placeRefs('hotel', src, { onDate: '2026-07-19' })[0].edge).toBe('start');
    expect(placeRefs('hotel', src, { onDate: '2026-07-22' })[0].edge).toBe('end');
    // A strictly-middle night is neither an arrival nor a departure.
    expect(placeRefs('hotel', src, { onDate: DAY })[0].edge).toBeUndefined();
  });

  it('an unconsumed idea is an idea entry; a consumed one has left the shelf', () => {
    const src = source({
      maybeItems: [
        maybe({ id: 'm1', placeId: 'cafe', targetDate: DAY }),
        maybe({ id: 'm2', placeId: 'cafe', consumed: true }),
      ],
    });
    const refs = placeRefs('cafe', src, { onDate: DAY });
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ kind: PLACE_REF_KIND.idea, maybeId: 'm1', date: DAY });
  });

  it('an unlinked booking is a booking entry with no date — it carries no time', () => {
    const refs = placeRefs(
      'spa',
      source({ bookings: [booking({ id: 'bk', type: BOOKING_TYPE.ACTIVITY, placeId: 'spa' })] }),
      { onDate: DAY },
    );
    expect(refs).toEqual([
      {
        kind: PLACE_REF_KIND.booking,
        key: 'bk:bk:start',
        bookingId: 'bk',
        edge: 'start',
      },
    ]);
  });

  describe('day scope', () => {
    const src = source({
      events: [
        event({ id: 'today', placeId: 'plaza', startsAt: `${DAY}T09:00:00Z` }),
        event({ id: 'tomorrow', placeId: 'plaza', date: NEXT_DAY }),
      ],
      bookings: [booking({ id: 'bk', type: BOOKING_TYPE.ACTIVITY, placeId: 'plaza' })],
      maybeItems: [maybe({ id: 'someday', placeId: 'plaza' })],
    });

    it('keeps what touches the day, plus everything with no date at all', () => {
      // A dateless reference belongs to no day, so no day excludes it — the same
      // reading the list's `ללא יום` block applies.
      const keys = placeRefs('plaza', src, { onDate: DAY }).map((r) => r.key);
      expect(keys).toEqual(['today:start', 'bk:bk:start', 'mb:someday']);
    });

    it('all-days keeps every reference', () => {
      const keys = placeRefs('plaza', src).map((r) => r.key);
      expect(keys).toEqual(['today:start', 'tomorrow:start', 'bk:bk:start', 'mb:someday']);
    });

    it('an idea pencilled for another day is out of a day scope', () => {
      const elsewhere = source({
        maybeItems: [maybe({ id: 'm', placeId: 'cafe', targetDate: NEXT_DAY })],
      });
      expect(placeRefs('cafe', elsewhere, { onDate: DAY })).toEqual([]);
      expect(placeRefs('cafe', elsewhere)).toHaveLength(1);
    });
  });

  it('is empty for a place nothing references', () => {
    expect(placeRefs('nowhere', source({ events: [event({ id: 'e', placeId: 'x' })] }))).toEqual(
      [],
    );
  });
});
