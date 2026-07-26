import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import {
  buildPlaceUsageIndex,
  comparePlacesBySchedule,
  countPlacesByCategory,
  isDayUsagePast,
  isOnShelf,
  isPlaceSettled,
  matchesPlaceFilter,
  PLACE_BLOCK,
  PLACE_CATEGORY_ALL,
  placeBlock,
  type PlaceFilter,
  type PlaceUsage,
} from './place-usage';

const place = (id: string, coords?: Partial<Place>): Place => ({
  id,
  tripId: 't',
  name: id,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  lat: 1,
  lng: 2,
  ...coords,
});

const booking = (partial: Partial<Booking> & Pick<Booking, 'id' | 'type'>): Booking => ({
  tripId: 't',
  title: 'x',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const event = (partial: Partial<TripEvent>): TripEvent => ({
  id: 'ev',
  tripId: 't',
  date: '2026-07-07',
  title: 'אירוע',
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 1,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const maybe = (partial: Partial<MaybeItem> & Pick<MaybeItem, 'id'>): MaybeItem =>
  ({ tripId: 't', title: 'idea', consumed: false, ...partial }) as MaybeItem;

/** The day/prominence mapping alone — the schedule fields have their own tests, and
 *  projecting keeps these assertions from breaking every time `DayUsage` grows. */
const dayShape = (usage: PlaceUsage) =>
  usage.days.map(({ date, prominence }) => ({ date, prominence }));

describe('buildPlaceUsageIndex', () => {
  it('a single-day event → one edge day, its category, scheduled, soft pin', () => {
    const idx = buildPlaceUsageIndex(
      [event({ id: 'e', placeId: 'pl', category: 'food', date: '2026-07-07' })],
      [],
      [],
      [place('pl')],
    );
    const u = idx.get('pl')!;
    expect(dayShape(u)).toEqual([{ date: '2026-07-07', prominence: 'edge' }]);
    expect(u.categories).toEqual(['food']);
    expect(u.isScheduled).toBe(true);
    expect(u.isMaybe).toBe(false);
    expect(u.pin).toEqual({ category: 'food', commitment: 'soft' });
    expect(u.coordless).toBe(false);
  });

  it('a transport event contributes BOTH endpoints, category transport', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-from',
      toPlaceId: 'pl-to',
    });
    const idx = buildPlaceUsageIndex(
      [event({ id: 'e', bookingId: 'bk', kind: EVENT_KIND.HARD })],
      [bk],
      [],
      [place('pl-from'), place('pl-to')],
    );
    expect(idx.get('pl-from')?.categories).toEqual(['transport']);
    expect(idx.get('pl-to')?.categories).toEqual(['transport']);
    expect(idx.get('pl-to')?.pin.commitment).toBe('hard');
  });

  it('an ambient multi-day stay → edge on arrival/departure, ambient in the middle', () => {
    const idx = buildPlaceUsageIndex(
      [
        event({
          id: 'h',
          placeId: 'pl',
          category: 'lodging',
          date: '2026-07-07',
          endDate: '2026-07-10',
        }),
      ],
      [],
      [],
      [place('pl')],
    );
    expect(dayShape(idx.get('pl')!)).toEqual([
      { date: '2026-07-07', prominence: 'edge' },
      { date: '2026-07-08', prominence: 'ambient' },
      { date: '2026-07-09', prominence: 'ambient' },
      { date: '2026-07-10', prominence: 'edge' },
    ]);
  });

  it('an unlinked booking contributes its place with no day facet, not scheduled', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'pl' });
    const idx = buildPlaceUsageIndex([], [bk], [], [place('pl')]);
    const u = idx.get('pl')!;
    expect(u.days).toEqual([]);
    expect(u.categories).toEqual(['lodging']);
    expect(u.isScheduled).toBe(false);
  });

  it('an unconsumed maybe → isMaybe + idea; a consumed one is excluded', () => {
    const idx = buildPlaceUsageIndex(
      [],
      [],
      [
        maybe({ id: 'm1', placeId: 'pl-open', category: 'food' }),
        maybe({ id: 'm2', placeId: 'pl-used', consumed: true }),
      ],
      [place('pl-open'), place('pl-used')],
    );
    expect(idx.get('pl-open')?.isMaybe).toBe(true);
    expect(idx.get('pl-open')?.pin.commitment).toBe('idea');
    expect(idx.has('pl-used')).toBe(false);
  });

  it('union + colour-by-most-committed: a hard event + a maybe → both facets, hard pin', () => {
    const idx = buildPlaceUsageIndex(
      [event({ id: 'e', placeId: 'pl', category: 'food', kind: EVENT_KIND.HARD })],
      [],
      [maybe({ id: 'm', placeId: 'pl', category: 'sightseeing' })],
      [place('pl')],
    );
    const u = idx.get('pl')!;
    expect([...u.categories].sort()).toEqual(['food', 'sightseeing']);
    expect(u.isMaybe).toBe(true);
    expect(u.isScheduled).toBe(true);
    expect(u.pin).toEqual({ category: 'food', commitment: 'hard' }); // hard event wins
  });

  it('an idea pencilled in for a day gets that day — with no clock (ADR-0116 §1)', () => {
    const idx = buildPlaceUsageIndex(
      [],
      [],
      [
        maybe({ id: 'm1', placeId: 'pl-today', category: 'food', targetDate: '2026-07-07' }),
        maybe({ id: 'm2', placeId: 'pl-someday', category: 'food' }),
      ],
      [place('pl-today'), place('pl-someday')],
    );
    const pencilled = idx.get('pl-today')!;
    expect(dayShape(pencilled)).toEqual([{ date: '2026-07-07', prominence: 'edge' }]);
    // Named, not scheduled: no moment, no end, no event to say what happens there.
    expect(pencilled.days[0]?.at).toBeUndefined();
    expect(pencilled.days[0]?.until).toBeUndefined();
    expect(pencilled.days[0]?.eventId).toBeUndefined();
    // "Someday" is still dayless, so it stays an all-days-only row.
    expect(idx.get('pl-someday')?.days).toEqual([]);
  });

  it('a pencilled day never takes over a day an event already owns', () => {
    const withEvent = (startsAt?: string) =>
      buildPlaceUsageIndex(
        [event({ id: 'e', placeId: 'pl', date: '2026-07-07', startsAt })],
        [],
        [maybe({ id: 'm', placeId: 'pl', targetDate: '2026-07-07' })],
        [place('pl')],
      ).get('pl')!.days[0]!;
    expect(withEvent('2026-07-07T09:00:00Z')).toMatchObject({
      at: Date.parse('2026-07-07T09:00:00Z'),
      eventId: 'e',
    });
    // Neither reference has a clock, so the event still wins the pointer — otherwise
    // the row would lose its "what happens here" line to a pencil mark.
    expect(withEvent()).toMatchObject({ eventId: 'e' });
  });

  it('a skipped SOFT event is parked on the shelf; a skipped hard one is not', () => {
    const idx = buildPlaceUsageIndex(
      [
        event({ id: 'e1', placeId: 'pl-skipped', status: EVENT_STATUS.SKIPPED }),
        event({
          id: 'e2',
          placeId: 'pl-hard',
          kind: EVENT_KIND.HARD,
          status: EVENT_STATUS.SKIPPED,
        }),
        event({ id: 'e3', placeId: 'pl-planned' }),
      ],
      [],
      [],
      [place('pl-skipped'), place('pl-hard'), place('pl-planned')],
    );
    expect(idx.get('pl-skipped')?.isParked).toBe(true);
    expect(isOnShelf(idx.get('pl-skipped')!)).toBe(true);
    expect(idx.get('pl-hard')?.isParked).toBe(false);
    expect(idx.get('pl-planned')?.isParked).toBe(false);
    // …and it is not an idea: the event still owns its date and slot.
    expect(idx.get('pl-skipped')?.isMaybe).toBe(false);
  });

  it('flags a coordless Place-lite (listed-only, not pinnable)', () => {
    const idx = buildPlaceUsageIndex(
      [event({ id: 'e', placeId: 'pl' })],
      [],
      [],
      [place('pl', { lat: undefined, lng: undefined })],
    );
    expect(idx.get('pl')?.coordless).toBe(true);
  });
});

describe('matchesPlaceFilter / countPlacesByCategory', () => {
  const idx = buildPlaceUsageIndex(
    [
      event({ id: 'e1', placeId: 'pl-food', category: 'food' }),
      event({ id: 'e2', placeId: 'pl-see', category: 'sightseeing' }),
    ],
    [],
    [maybe({ id: 'm', placeId: 'pl-idea', category: 'food' })],
    [place('pl-food'), place('pl-see'), place('pl-idea')],
  );
  const all = [...idx.values()];

  it('"all" passes everything; a type narrows to that category union', () => {
    expect(
      all.filter((u) => matchesPlaceFilter(u, { category: PLACE_CATEGORY_ALL, maybesOnly: false })),
    ).toHaveLength(3);
    expect(
      all.filter((u) => matchesPlaceFilter(u, { category: 'food', maybesOnly: false })),
    ).toHaveLength(2);
  });

  it('the maybes toggle narrows to shelf ideas, and composes with the type chip', () => {
    expect(
      all.filter((u) => matchesPlaceFilter(u, { category: PLACE_CATEGORY_ALL, maybesOnly: true })),
    ).toHaveLength(1);
    expect(
      all.filter((u) => matchesPlaceFilter(u, { category: 'sightseeing', maybesOnly: true })),
    ).toHaveLength(0);
  });

  it('the maybes toggle also finds a skipped soft event — the other half of the shelf', () => {
    const shelf = [
      ...buildPlaceUsageIndex(
        [
          event({
            id: 'e1',
            placeId: 'pl-skipped',
            category: 'food',
            status: EVENT_STATUS.SKIPPED,
          }),
          event({ id: 'e2', placeId: 'pl-planned', category: 'food' }),
        ],
        [],
        [],
        [place('pl-skipped'), place('pl-planned')],
      ).values(),
    ].filter((u) => matchesPlaceFilter(u, { category: 'food', maybesOnly: true }));
    expect(shelf.map((u) => u.placeId)).toEqual(['pl-skipped']);
  });

  it('counts every category (0 for unused), one per referencing place', () => {
    const counts = countPlacesByCategory(all);
    expect(counts.food).toBe(2);
    expect(counts.sightseeing).toBe(1);
    expect(counts.lodging).toBe(0);
  });
});

describe('comparePlacesBySchedule (the list reads in trip order)', () => {
  const DAY = '2026-07-07';
  const at = (hhmm: string) => `${DAY}T${hhmm}:00Z`;
  const nameOf = (u: PlaceUsage) => u.placeId;

  /** Order the given places as the list would. `nowMs` opts into the ahead/behind
   *  split; without it the order is pure sequence. `today` additionally lets a whole
   *  passed day count as behind you, which is what catches untimed rows. */
  const order = (idx: Map<string, PlaceUsage>, onDate?: string, nowMs?: number, today?: string) =>
    [...idx.values()]
      .sort((a, b) => comparePlacesBySchedule(a, b, { nameOf, onDate, nowMs, today }))
      .map((u) => u.placeId);

  it('orders a day by the clock, not the alphabet', () => {
    // Named so alphabetical order would be the exact reverse of the schedule.
    const idx = buildPlaceUsageIndex(
      [
        event({ id: 'e1', placeId: 'zoo', date: DAY, startsAt: at('09:00') }),
        event({ id: 'e2', placeId: 'market', date: DAY, startsAt: at('13:00') }),
        event({ id: 'e3', placeId: 'bar', date: DAY, startsAt: at('20:00') }),
      ],
      [],
      [],
      [place('zoo'), place('market'), place('bar')],
    );
    expect(order(idx, DAY)).toEqual(['zoo', 'market', 'bar']);
  });

  it('breaks a same-instant tie on sortOrder, the day view’s own fallback', () => {
    const idx = buildPlaceUsageIndex(
      [
        event({ id: 'e1', placeId: 'second', date: DAY, startsAt: at('09:00'), sortOrder: 5 }),
        event({ id: 'e2', placeId: 'first', date: DAY, startsAt: at('09:00'), sortOrder: 1 }),
      ],
      [],
      [],
      [place('second'), place('first')],
    );
    expect(order(idx, DAY)).toEqual(['first', 'second']);
  });

  it('an untimed event sinks below the clocked ones, as the day view renders it', () => {
    const idx = buildPlaceUsageIndex(
      [
        event({ id: 'e1', placeId: 'aaa-untimed', date: DAY }),
        event({ id: 'e2', placeId: 'zzz-timed', date: DAY, startsAt: at('20:00') }),
      ],
      [],
      [],
      [place('aaa-untimed'), place('zzz-timed')],
    );
    expect(order(idx, DAY)).toEqual(['zzz-timed', 'aaa-untimed']);
  });

  it('a mid-stay ambient base sits below the day’s schedule (backdrop, ADR-0054)', () => {
    const MIDDLE = '2026-07-08';
    const idx = buildPlaceUsageIndex(
      [
        // Checked in on the 7th, out on the 10th → the 8th is a middle night, and
        // its check-in instant is EARLIER than the day's own events.
        event({
          id: 'h',
          placeId: 'hotel',
          date: DAY,
          endDate: '2026-07-10',
          startsAt: at('15:00'),
          endsAt: '2026-07-10T11:00:00Z',
        }),
        event({ id: 'e', placeId: 'lunch', date: MIDDLE, startsAt: `${MIDDLE}T12:00:00Z` }),
      ],
      [],
      [],
      [place('hotel'), place('lunch')],
    );
    expect(order(idx, MIDDLE)).toEqual(['lunch', 'hotel']);
    // On the arrival day the hotel is an edge with a real check-in, so it leads —
    // and a place not anchored to the scoped day sinks below it (the screen filters
    // those out before sorting; the comparator only has to be total).
    expect(order(idx, DAY)).toEqual(['hotel', 'lunch']);
  });

  it('a transport event lists its endpoints in travel order, never tied', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'zzz-origin', // alphabetically last, but you leave from here
      toPlaceId: 'aaa-arrival',
    });
    const idx = buildPlaceUsageIndex(
      [
        event({
          id: 'f',
          bookingId: 'bk',
          date: DAY,
          startsAt: at('07:15'),
          endsAt: at('11:00'),
        }),
      ],
      [bk],
      [],
      [place('zzz-origin'), place('aaa-arrival')],
    );
    expect(order(idx, DAY)).toEqual(['zzz-origin', 'aaa-arrival']);
  });

  it('a place with no day at all sinks last, below everything scheduled', () => {
    const idx = buildPlaceUsageIndex(
      [event({ id: 'e', placeId: 'zzz-scheduled', date: DAY, startsAt: at('09:00') })],
      [booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'aaa-unlinked' })],
      [maybe({ id: 'm', placeId: 'mmm-idea' })],
      [place('zzz-scheduled'), place('aaa-unlinked'), place('mmm-idea')],
    );
    // All-days scope: the dateless pair goes last, alphabetical among themselves.
    expect(order(idx)).toEqual(['zzz-scheduled', 'aaa-unlinked', 'mmm-idea']);
  });

  describe('ahead of you leads, behind you follows newest-first', () => {
    const NOW = Date.parse(at('14:11'));

    /** The reported day: two stops already visited, the next one at 17:00. */
    const reportedDay = () =>
      buildPlaceUsageIndex(
        [
          event({
            id: 'e1',
            placeId: 'lunch',
            date: DAY,
            startsAt: at('12:00'),
            endsAt: at('13:00'),
          }),
          event({
            id: 'e2',
            placeId: 'morning',
            date: DAY,
            startsAt: at('09:00'),
            endsAt: at('10:00'),
          }),
          event({ id: 'e3', placeId: 'ice-cave', date: DAY, startsAt: at('17:00') }),
        ],
        [],
        [],
        [place('lunch'), place('morning'), place('ice-cave')],
      );

    it('puts the next stop first and the visited ones below it', () => {
      const idx = reportedDay();
      // No clock → pure sequence, the whole day chronological…
      expect(order(idx, DAY)).toEqual(['morning', 'lunch', 'ice-cave']);
      // …with a clock, what's ahead leads and what's done follows NEWEST first.
      expect(order(idx, DAY, NOW)).toEqual(['ice-cave', 'lunch', 'morning']);
    });

    it('the sunk block reads newest-first — the stop you just left is on top', () => {
      expect(order(reportedDay(), DAY, NOW).slice(1)).toEqual(['lunch', 'morning']);
    });

    it('an event in progress is NOT behind you — it leads', () => {
      const idx = buildPlaceUsageIndex(
        [
          event({
            id: 'e1',
            placeId: 'ongoing',
            date: DAY,
            startsAt: at('13:00'),
            endsAt: at('18:00'),
          }),
          event({ id: 'e2', placeId: 'later', date: DAY, startsAt: at('20:00') }),
        ],
        [],
        [],
        [place('ongoing'), place('later')],
      );
      expect(order(idx, DAY, NOW)).toEqual(['ongoing', 'later']);
    });

    it('a stay mid-stay is not behind you, but is once check-out passes', () => {
      const stay = (checkout: string) =>
        buildPlaceUsageIndex(
          [
            event({
              id: 'h',
              placeId: 'hotel',
              date: DAY,
              endDate: DAY,
              startsAt: at('09:00'),
              endsAt: checkout,
            }),
            event({ id: 'e', placeId: 'dinner', date: DAY, startsAt: at('20:00') }),
          ],
          [],
          [],
          [place('hotel'), place('dinner')],
        );
      // Check-out still ahead → the stay keeps its chronological lead.
      expect(order(stay(at('18:00')), DAY, NOW)).toEqual(['hotel', 'dinner']);
      // Check-out passed → it sinks below the evening that is still ahead.
      expect(order(stay(at('11:00')), DAY, NOW)).toEqual(['dinner', 'hotel']);
    });

    it('an untimed event outranks a visited one — nothing says it is done', () => {
      const idx = buildPlaceUsageIndex(
        [
          event({
            id: 'e1',
            placeId: 'visited',
            date: DAY,
            startsAt: at('09:00'),
            endsAt: at('10:00'),
          }),
          event({ id: 'e2', placeId: 'sometime', date: DAY }),
        ],
        [],
        [],
        [place('visited'), place('sometime')],
      );
      expect(order(idx, DAY, NOW)).toEqual(['sometime', 'visited']);
    });

    it('a wholly-past day is one block, so it reads newest-first throughout', () => {
      const idx = reportedDay();
      const tomorrow = Date.parse('2026-07-08T09:00:00Z');
      expect(order(idx, DAY, tomorrow)).toEqual(['ice-cave', 'lunch', 'morning']);
    });

    it('ahead beats behind ACROSS days — the date no longer sorts first', () => {
      // The bug this fixes: ordering by date first put last week above tonight.
      const idx = buildPlaceUsageIndex(
        [
          event({
            id: 'e1',
            placeId: 'last-week',
            date: '2026-07-02',
            startsAt: '2026-07-02T09:00:00Z',
          }),
          event({
            id: 'e2',
            placeId: 'yesterday',
            date: '2026-07-06',
            startsAt: '2026-07-06T09:00:00Z',
          }),
          event({ id: 'e3', placeId: 'tonight', date: DAY, startsAt: at('20:00') }),
          event({
            id: 'e4',
            placeId: 'next-week',
            date: '2026-07-14',
            startsAt: '2026-07-14T09:00:00Z',
          }),
        ],
        [],
        [],
        [place('last-week'), place('yesterday'), place('tonight'), place('next-week')],
      );
      // Ahead ascending (tonight, then next week); behind descending (yesterday,
      // then last week) — all-days scope, so no `onDate`.
      expect(order(idx, undefined, NOW, DAY)).toEqual([
        'tonight',
        'next-week',
        'yesterday',
        'last-week',
      ]);
    });

    it('an undated place is NOT behind you — it sits between the two blocks', () => {
      // The reported bug: a "someday" idea sorted below everything, so the list's
      // behind-you header swept it up and it read as a place already in the past.
      const idx = buildPlaceUsageIndex(
        [
          event({ id: 'e1', placeId: 'this-morning', date: DAY, startsAt: at('09:00') }),
          event({ id: 'e2', placeId: 'tonight', date: DAY, startsAt: at('20:00') }),
        ],
        [],
        [maybe({ id: 'm', placeId: 'someday' })],
        [place('this-morning'), place('tonight'), place('someday')],
      );
      expect(order(idx, undefined, NOW, DAY)).toEqual(['tonight', 'someday', 'this-morning']);
      const ctx = { nowMs: NOW, today: DAY };
      expect(placeBlock(idx.get('someday')!, ctx)).toBe(PLACE_BLOCK.dayless);
      expect(placeBlock(idx.get('tonight')!, ctx)).toBe(PLACE_BLOCK.ahead);
      expect(placeBlock(idx.get('this-morning')!, ctx)).toBe(PLACE_BLOCK.behind);
      // With no clock nothing is behind you, so the undated row is simply last.
      expect(order(idx, undefined, undefined, DAY)).toEqual(['this-morning', 'tonight', 'someday']);
    });

    it('an untimed event on a passed day sinks with it, despite having no clock', () => {
      const idx = buildPlaceUsageIndex(
        [
          event({ id: 'e1', placeId: 'untimed-past', date: '2026-07-05' }),
          event({ id: 'e2', placeId: 'tonight', date: DAY, startsAt: at('20:00') }),
        ],
        [],
        [],
        [place('untimed-past'), place('tonight')],
      );
      // Without `today` the clockless row can't be judged, so it leads on date…
      expect(order(idx, undefined, NOW)).toEqual(['untimed-past', 'tonight']);
      // …with it, the whole finished day is behind you.
      expect(order(idx, undefined, NOW, DAY)).toEqual(['tonight', 'untimed-past']);
    });
  });

  it('across days it reads in trip order, earliest day first', () => {
    const idx = buildPlaceUsageIndex(
      [
        event({ id: 'e1', placeId: 'later', date: '2026-07-09', startsAt: '2026-07-09T08:00:00Z' }),
        event({ id: 'e2', placeId: 'earlier', date: DAY, startsAt: at('20:00') }),
      ],
      [],
      [],
      [place('later'), place('earlier')],
    );
    expect(order(idx)).toEqual(['earlier', 'later']);
  });
});

// ADR-0117 — the derivation now reads what a human said happened, so the Map can
// stop deducing a visit from the clock alone.
describe('outcome + settled (ADR-0117)', () => {
  const at = (hhmm: string) => `2026-07-07T${hhmm}:00Z`;
  const usageFor = (events: TripEvent[]) =>
    buildPlaceUsageIndex(events, [], [], [place('p')]).get('p')!;

  it('a done event marks the day היינו and settled', () => {
    const u = usageFor([
      event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.DONE }),
    ]);
    expect(u.days[0]?.outcome).toBe('done');
    expect(u.days[0]?.settled).toBe(true);
  });

  it('a skipped event marks the day דילגנו — not a visit', () => {
    const u = usageFor([
      event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.SKIPPED }),
    ]);
    expect(u.days[0]?.outcome).toBe('skipped');
  });

  it('a planned event has no outcome and is not settled', () => {
    const u = usageFor([event({ id: 'e1', placeId: 'p', startsAt: at('09:00') })]);
    expect(u.days[0]?.outcome).toBeUndefined();
    expect(u.days[0]?.settled).toBeFalsy();
  });

  it('a visit wins over a skip on the same day', () => {
    const u = usageFor([
      event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.SKIPPED }),
      event({ id: 'e2', placeId: 'p', startsAt: at('11:00'), status: EVENT_STATUS.DONE }),
    ]);
    expect(u.days[0]?.outcome).toBe('done');
    expect(u.days[0]?.settled).toBe(true);
  });

  it('one still-planned reference leaves the day unsettled, outcome or not', () => {
    const u = usageFor([
      event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.DONE }),
      event({ id: 'e2', placeId: 'p', startsAt: at('20:00') }),
    ]);
    expect(u.days[0]?.outcome).toBe('done');
    expect(u.days[0]?.settled).toBe(false);
  });

  // `מה נשאר` (ADR-0121 §9): ONE toggle over the field above, not three chips.
  describe('isPlaceSettled — what "what\u2019s left" hides', () => {
    it('a settled day is settled; an unsettled one is not', () => {
      const done = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.DONE }),
      ]);
      const planned = usageFor([event({ id: 'e1', placeId: 'p', startsAt: at('09:00') })]);
      expect(isPlaceSettled(done, '2026-07-07')).toBe(true);
      expect(isPlaceSettled(planned, '2026-07-07')).toBe(false);
    });

    it('it hides a SKIP as well as a visit — both are handled', () => {
      const skipped = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.SKIPPED }),
      ]);
      expect(isPlaceSettled(skipped, '2026-07-07')).toBe(true);
    });

    // A place with no day at all is never settled: an unconsumed idea and an
    // unscheduled booking are precisely what is left.
    it('a place with no day is never settled', () => {
      const idea = buildPlaceUsageIndex(
        [],
        [],
        [maybe({ id: 'm', placeId: 'p' })],
        [place('p')],
      ).get('p')!;
      expect(isPlaceSettled(idea)).toBe(false);
      expect(isPlaceSettled(idea, '2026-07-07')).toBe(false);
    });

    // Across the trip it takes ALL its days, not any: a caf\u00e9 visited on Tuesday
    // and pencilled again for Thursday is not handled.
    it('across the trip every day must be settled', () => {
      const u = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.DONE }),
        event({ id: 'e2', placeId: 'p', date: '2026-07-09', startsAt: '2026-07-09T09:00:00Z' }),
      ]);
      expect(isPlaceSettled(u)).toBe(false);
      // …but that first day, on its own, is done with.
      expect(isPlaceSettled(u, '2026-07-07')).toBe(true);
    });

    // What makes the toggle apply to the map's ghost tier: a ghost has no day in the
    // scope being asked about, so a bare day filter would read it as unsettled and
    // leave Tuesday's visited caf\u00e9 on the canvas (ADR-0121 §9).
    it('a place with nothing on the scoped day falls back to all its days', () => {
      const u = usageFor([
        event({
          id: 'e1',
          placeId: 'p',
          date: '2026-07-09',
          startsAt: '2026-07-09T09:00:00Z',
          status: EVENT_STATUS.DONE,
        }),
      ]);
      expect(isPlaceSettled(u, '2026-07-07')).toBe(true);
    });

    it('the filter drops a settled place only when the toggle is on', () => {
      const done = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.DONE }),
      ]);
      const filter: PlaceFilter = {
        category: PLACE_CATEGORY_ALL,
        maybesOnly: false,
        onDate: '2026-07-07',
      };
      expect(matchesPlaceFilter(done, filter)).toBe(true);
      expect(matchesPlaceFilter(done, { ...filter, unsettledOnly: true })).toBe(false);
    });
  });

  describe('isDayUsagePast: a human outranks the clock', () => {
    const dawn = Date.parse('2026-07-07T00:00:00Z');

    it('a settled day is behind you even before its time', () => {
      const u = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('20:00'), status: EVENT_STATUS.DONE }),
      ]);
      expect(isDayUsagePast(u.days[0]!, dawn, '2026-07-07')).toBe(true);
    });

    it('an unsettled day before its time is still ahead of you', () => {
      const u = usageFor([event({ id: 'e1', placeId: 'p', startsAt: at('20:00') })]);
      expect(isDayUsagePast(u.days[0]!, dawn, '2026-07-07')).toBe(false);
    });

    it('an unsettled day whose time has passed is behind you, as before', () => {
      const u = usageFor([event({ id: 'e1', placeId: 'p', startsAt: at('09:00') })]);
      expect(isDayUsagePast(u.days[0]!, Date.parse(at('10:00')), '2026-07-07')).toBe(true);
    });
  });
});
