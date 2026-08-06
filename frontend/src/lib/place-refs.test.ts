import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  CHANGE_ACTION,
  ENTITY_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import {
  PLACE_REF_KIND,
  clearPlaceRefsForChange,
  deletedPlaceId,
  placeLinks,
  placeRefs,
  soleIdeaFor,
} from './place-refs';

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

  // **AN OVERNIGHT ROUTE'S TWO ENDS ARE TWO PLACES** (2026-08-06, found sweeping after the
  // usage index had the identical bug). Day-scoped, the edge was resolved from the DATE, so on
  // the arrival day the ORIGIN airport produced a `נחיתה` entry at the landing's clock — a way
  // in to a place you had already left, under the word for the place you arrived at. The rule
  // is `routeEndpointDay`, shared with `spanDays` so the two cannot drift apart again.
  describe('an overnight flight', () => {
    const overnight = source({
      bookings: [
        booking({ id: 'fl', type: BOOKING_TYPE.FLIGHT, fromPlaceId: 'fra', toPlaceId: 'tlv' }),
      ],
      events: [
        event({
          id: 'e-fl',
          bookingId: 'fl',
          date: '2026-08-05',
          endDate: '2026-08-06',
          startsAt: '2026-08-05T19:00:00Z',
          endsAt: '2026-08-05T23:00:00Z',
        }),
      ],
    });

    it('gives each endpoint its own end, all-days', () => {
      expect(placeRefs('fra', overnight).map((r) => [r.edge, r.date])).toEqual([
        ['start', '2026-08-05'],
      ]);
      expect(placeRefs('tlv', overnight).map((r) => [r.edge, r.date])).toEqual([
        ['end', '2026-08-06'],
      ]);
    });

    // THE DEFECT: day-scoped, both endpoints answered on both days.
    it("puts NEITHER endpoint on the other one's day", () => {
      expect(placeRefs('tlv', overnight, { onDate: '2026-08-05' })).toEqual([]);
      expect(placeRefs('fra', overnight, { onDate: '2026-08-06' })).toEqual([]);
    });

    it('and each still answers on its own', () => {
      expect(placeRefs('fra', overnight, { onDate: '2026-08-05' })[0].edge).toBe('start');
      expect(placeRefs('tlv', overnight, { onDate: '2026-08-06' })[0].edge).toBe('end');
    });
  });

  // A STAY IS NOT A ROUTE — one place across every night, which the endpoint rule must not
  // touch. This is the case that would break if the fix were applied to spans in general.
  it('a multi-day stay still answers on every night it touches', () => {
    const src = source({
      bookings: [booking({ id: 'h', type: BOOKING_TYPE.HOTEL, placeId: 'hotel' })],
      events: [
        event({
          id: 'e-h',
          bookingId: 'h',
          date: '2026-08-04',
          endDate: '2026-08-07',
          startsAt: '2026-08-04T12:00:00Z',
          endsAt: '2026-08-07T09:00:00Z',
        }),
      ],
    });
    expect(placeRefs('hotel', src, { onDate: '2026-08-04' })[0].edge).toBe('start');
    expect(placeRefs('hotel', src, { onDate: '2026-08-05' })[0].edge).toBeUndefined();
    expect(placeRefs('hotel', src, { onDate: '2026-08-07' })[0].edge).toBe('end');
  });

  // **ONE PLACE AS BOTH ENDPOINTS OF ONE BOOKING** (2026-08-06; owner's screenshot of Ben Gurion,
  // where the same car hire drew two identical rows). A car hire carries a route, so it contributes
  // two endpoints — and when both name the same place, what the reader gets depends entirely on
  // whether the edge is resolved from the ENDPOINT or from the DATE.
  describe('a booking collected and returned at the same place', () => {
    const hire = source({
      bookings: [
        booking({ id: 'bk', type: BOOKING_TYPE.CAR, fromPlaceId: 'tlv', toPlaceId: 'tlv' }),
      ],
      events: [
        event({
          id: 'ev',
          bookingId: 'bk',
          date: '2026-07-19',
          endDate: '2026-07-22',
          startsAt: '2026-07-19T15:00:00Z',
          endsAt: '2026-07-22T18:00:00Z',
        }),
      ],
    });

    // UN-SCOPED there is no day to resolve against, so the endpoints keep their own edges — two
    // real moments at one place. `edgeOnDate`'s `date == null` branch was written for exactly this
    // and was dead code, because the caller defaulted the date to the event's own.
    it('is two entries all-days: the collection and the return, each at its own moment', () => {
      const refs = placeRefs('tlv', hire);
      expect(refs.map((ref) => ref.edge)).toEqual(['start', 'end']);
      expect(refs.map((ref) => ref.date)).toEqual(['2026-07-19', '2026-07-22']);
      // Two DIFFERENT moments — the defect drew both at the start's clock.
      expect(new Set(refs.map((ref) => ref.at)).size).toBe(2);
      // And two React keys, which the endpoint-keyed version only appeared to give.
      expect(new Set(refs.map((ref) => ref.key)).size).toBe(2);
    });

    // DAY-SCOPED both endpoints resolve to the same edge, and rightly: the airport on the day the
    // car is collected IS the collection, whichever field named it. One moment, one row.
    it('is ONE entry on a day, not the same moment twice', () => {
      expect(placeRefs('tlv', hire, { onDate: '2026-07-19' })).toHaveLength(1);
      expect(placeRefs('tlv', hire, { onDate: '2026-07-22' })).toHaveLength(1);
      expect(placeRefs('tlv', hire, { onDate: '2026-07-19' })[0].edge).toBe('start');
      expect(placeRefs('tlv', hire, { onDate: '2026-07-22' })[0].edge).toBe('end');
    });
  });

  // The legitimate two-entries case, kept: a SAME-DAY round trip is two moments at one station,
  // and nothing about the dedup above may collapse it.
  it('a same-day round trip through one station stays two entries', () => {
    const src = source({
      bookings: [
        booking({ id: 'bk', type: BOOKING_TYPE.TRAIN, fromPlaceId: 'stn', toPlaceId: 'stn' }),
      ],
      events: [
        event({
          id: 'ev',
          bookingId: 'bk',
          startsAt: `${DAY}T06:00:00Z`,
          endsAt: `${DAY}T18:00:00Z`,
        }),
      ],
    });
    expect(placeRefs('stn', src, { onDate: DAY }).map((ref) => ref.edge)).toEqual(['start', 'end']);
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

// ADR-0135 §5. The two-idea case is the reproduction: it must fail if the consume is ever
// relaxed to "any idea", which is the simplification this rule invites.
describe('soleIdeaFor — what a scheduled place consumes (ADR-0135 §5)', () => {
  it('returns the single live idea on the place', () => {
    const only = maybe({ id: 'mb-1', placeId: 'pl-1' });
    expect(soleIdeaFor('pl-1', [only, maybe({ id: 'mb-2', placeId: 'pl-other' })])).toBe(only);
  });

  it('returns NOTHING with two ideas — two intentions, and scheduling one must not eat the other', () => {
    const two = [maybe({ id: 'mb-1', placeId: 'pl-1' }), maybe({ id: 'mb-2', placeId: 'pl-1' })];
    expect(soleIdeaFor('pl-1', two)).toBeNull();
  });

  it('is not day-scoped: an idea pencilled in for another day still counts as a second intention', () => {
    const two = [
      maybe({ id: 'mb-1', placeId: 'pl-1', targetDate: '2026-07-20' }),
      maybe({ id: 'mb-2', placeId: 'pl-1', targetDate: '2026-07-24' }),
    ];
    expect(soleIdeaFor('pl-1', two)).toBeNull();
  });

  it('ignores consumed ideas, so a place scheduled once can be scheduled again', () => {
    const live = maybe({ id: 'mb-2', placeId: 'pl-1' });
    expect(
      soleIdeaFor('pl-1', [maybe({ id: 'mb-1', placeId: 'pl-1', consumed: true }), live]),
    ).toBe(live);
  });

  it('returns nothing when the place has no idea at all', () => {
    expect(soleIdeaFor('pl-1', [])).toBeNull();
  });
});

// ── ADR-0157: what a delete touches, and what the client has to mirror ───────────────────
describe('placeLinks — every row that loses its location', () => {
  it('names the FK each row held, once per row', () => {
    const links = placeLinks(
      'st',
      source({
        events: [event({ id: 'e1', placeId: 'st' }), event({ id: 'e2', placeId: 'other' })],
        bookings: [booking({ id: 'bk', type: BOOKING_TYPE.TRAIN, fromPlaceId: 'st' })],
        maybeItems: [maybe({ id: 'mb', placeId: 'st' })],
      }),
    );
    expect(links).toEqual([
      { owner: 'event', id: 'e1', fields: ['placeId'] },
      { owner: 'booking', id: 'bk', fields: ['fromPlaceId'] },
      { owner: 'maybeItem', id: 'mb', fields: ['placeId'] },
    ]);
  });

  // A round trip out of and back into the same station: one row, two FKs. Reported as one
  // link with two fields, because the undo has to hand BOTH back and a link per field would
  // patch the booking twice.
  it('a booking that both starts and ends there reports both fields on one link', () => {
    const links = placeLinks(
      'st',
      source({
        bookings: [
          booking({ id: 'bk', type: BOOKING_TYPE.TRAIN, fromPlaceId: 'st', toPlaceId: 'st' }),
        ],
      }),
    );
    expect(links).toEqual([{ owner: 'booking', id: 'bk', fields: ['fromPlaceId', 'toPlaceId'] }]);
  });

  // `placeRefs` drops these — a consumed idea is not a way IN to anything. The FK is still
  // there, so Postgres still nulls it, and an undo that skipped it would restore the place
  // with one link quietly missing.
  it('includes a consumed idea, which the way-in derivation deliberately does not', () => {
    const consumed = source({ maybeItems: [maybe({ id: 'mb', placeId: 'st', consumed: true })] });
    expect(placeRefs('st', consumed)).toEqual([]);
    expect(placeLinks('st', consumed)).toEqual([
      { owner: 'maybeItem', id: 'mb', fields: ['placeId'] },
    ]);
  });

  it('a place nothing points at has no links', () => {
    expect(placeLinks('st', source({ events: [event({ id: 'e' })] }))).toEqual([]);
  });
});

describe('clearPlaceRefsForChange — the cascade Postgres performs silently', () => {
  const deleted = (entityId: string) => ({
    entityType: ENTITY_TYPE.PLACE,
    entityId,
    action: CHANGE_ACTION.DELETE,
  });

  it('clears the FK on a place delete, leaving the row itself in the list', () => {
    const rows = [event({ id: 'e1', placeId: 'st' }), event({ id: 'e2', placeId: 'other' })];
    const next = clearPlaceRefsForChange(rows, ENTITY_TYPE.EVENT, deleted('st'));
    expect(next.map((e) => e.placeId)).toEqual([undefined, 'other']);
    expect(next).toHaveLength(2);
  });

  it('clears every FK the row held, not only the first', () => {
    const rows = [
      booking({ id: 'bk', type: BOOKING_TYPE.TRAIN, fromPlaceId: 'st', toPlaceId: 'st' }),
    ];
    const [next] = clearPlaceRefsForChange(rows, ENTITY_TYPE.BOOKING, deleted('st'));
    expect(next.fromPlaceId).toBeUndefined();
    expect(next.toPlaceId).toBeUndefined();
  });

  // The reference discipline `dropNotesForHostChange` set: every change that is not a place
  // delete has to be free, because this runs on ALL of them and the Map re-renders on a clock.
  it('returns the same array for any change that clears nothing', () => {
    const rows = [event({ id: 'e', placeId: 'other' })];
    expect(clearPlaceRefsForChange(rows, ENTITY_TYPE.EVENT, deleted('st'))).toBe(rows);
    expect(
      clearPlaceRefsForChange(rows, ENTITY_TYPE.EVENT, {
        entityType: ENTITY_TYPE.PLACE,
        entityId: 'other',
        action: CHANGE_ACTION.UPDATE,
      }),
    ).toBe(rows);
    expect(
      clearPlaceRefsForChange(rows, ENTITY_TYPE.EVENT, {
        entityType: ENTITY_TYPE.EVENT,
        entityId: 'e',
        action: CHANGE_ACTION.DELETE,
      }),
    ).toBe(rows);
  });

  it('deletedPlaceId answers only for a place delete', () => {
    expect(deletedPlaceId(deleted('st'))).toBe('st');
    expect(
      deletedPlaceId({
        entityType: ENTITY_TYPE.EVENT,
        entityId: 'e',
        action: CHANGE_ACTION.DELETE,
      }),
    ).toBeNull();
  });
});
