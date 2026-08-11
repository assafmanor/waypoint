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
  isPlaceLeft,
  matchesPlaceFilter,
  PLACE_BLOCK,
  PLACE_CATEGORY_ALL,
  placeBlock,
  placeDay,
  placeMetaDay,
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

// ── AN OVERNIGHT FLIGHT'S TWO ENDS ARE TWO PLACES (2026-08-06) ────────────────────────
// Reported from the device: at 15:11 the map listed `נמל התעופה בן גוריון · נחיתה 02:00`
// under `מה שלפנינו`, and `נמל התעופה של פרנקפורט · נחיתה 02:00` under `מה שמאחורינו` —
// one flight, drawn as two landings, one of them at the airport it took off from.
describe('a route endpoint owns its own end of the span, not all of it', () => {
  const flight = booking({
    id: 'fl',
    type: BOOKING_TYPE.FLIGHT,
    fromPlaceId: 'fra',
    toPlaceId: 'tlv',
  });
  // Departs Frankfurt 21:00 local on the 5th, lands Tel Aviv 02:00 local on the 6th.
  const overnight = event({
    id: 'e-fl',
    bookingId: 'fl',
    kind: EVENT_KIND.HARD,
    date: '2026-08-05',
    endDate: '2026-08-06',
    startsAt: '2026-08-05T19:00:00Z',
    endsAt: '2026-08-05T23:00:00Z',
  });
  const index = () => buildPlaceUsageIndex([overnight], [flight], [], [place('fra'), place('tlv')]);

  it('puts the ORIGIN on the departure day only, at the departure', () => {
    const days = index().get('fra')!.days;
    expect(days.map((d) => d.date)).toEqual(['2026-08-05']);
    expect(days[0].edge).toBe('start');
    expect(days[0].at).toBe(Date.parse('2026-08-05T19:00:00Z'));
  });

  it('puts the DESTINATION on the arrival day only, at the arrival', () => {
    const days = index().get('tlv')!.days;
    expect(days.map((d) => d.date)).toEqual(['2026-08-06']);
    expect(days[0].edge).toBe('end');
    expect(days[0].at).toBe(Date.parse('2026-08-05T23:00:00Z'));
  });

  // THE INVARIANT THE BUG BROKE, stated as one line: no place is at both ends of a journey
  // it is only one end of.
  it("never gives one endpoint the other end's day", () => {
    const idx = index();
    expect(idx.get('fra')!.days.some((d) => d.date === '2026-08-06')).toBe(false);
    expect(idx.get('tlv')!.days.some((d) => d.date === '2026-08-05')).toBe(false);
  });

  // A STAY IS NOT A ROUTE, and this is the case the fix must not touch: one place across
  // every night, edges at check-in and check-out.
  it('leaves a multi-day STAY on every night it touches', () => {
    const stay = booking({ id: 'h', type: BOOKING_TYPE.HOTEL, placeId: 'hotel' });
    const nights = event({
      id: 'e-h',
      bookingId: 'h',
      date: '2026-08-04',
      endDate: '2026-08-07',
      startsAt: '2026-08-04T12:00:00Z',
      endsAt: '2026-08-07T09:00:00Z',
    });
    const days = buildPlaceUsageIndex([nights], [stay], [], [place('hotel')]).get('hotel')!.days;
    expect(days.map((d) => d.date)).toEqual([
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
    expect([days[0].edge, days[3].edge]).toEqual(['start', 'end']);
  });

  // …and a route whose two ends are the SAME place is two calls, each keeping its own end —
  // which is a car hire collected on one day and returned on another, not a special case.
  it('keeps BOTH days for a hire collected and returned at one place', () => {
    const hire = booking({
      id: 'car',
      type: BOOKING_TYPE.CAR,
      fromPlaceId: 'tlv',
      toPlaceId: 'tlv',
    });
    const span = event({
      id: 'e-car',
      bookingId: 'car',
      date: '2026-08-01',
      endDate: '2026-08-06',
      startsAt: '2026-08-01T12:00:00Z',
      endsAt: '2026-08-06T15:00:00Z',
    });
    const days = buildPlaceUsageIndex([span], [hire], [], [place('tlv')]).get('tlv')!.days;
    expect(days.map((d) => d.date)).toEqual(['2026-08-01', '2026-08-06']);
    expect(days.map((d) => d.edge)).toEqual(['start', 'end']);
  });
});

// ── WHAT A HUMAN HAS CLOSED CANNOT HOLD A PLACE AHEAD (ADR-0117 §2, 2026-08-06) ───────
// `isDayUsagePast` honoured "a human outranks the clock" only when EVERY reference on the
// day was settled, so one tick on one reference kept the whole place ahead of you.
describe('a settled reference holds nothing open', () => {
  const NOW = Date.parse('2026-08-06T12:11:00Z');
  const dayOf = (status: TripEvent['status']) => {
    const hire = booking({
      id: 'car',
      type: BOOKING_TYPE.CAR,
      fromPlaceId: 'tlv',
      toPlaceId: 'tlv',
    });
    const flight = booking({
      id: 'fl',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'fra',
      toPlaceId: 'tlv',
    });
    const events = [
      event({
        id: 'e-fl',
        bookingId: 'fl',
        kind: EVENT_KIND.HARD,
        date: '2026-08-05',
        endDate: '2026-08-06',
        startsAt: '2026-08-05T19:00:00Z',
        endsAt: '2026-08-05T23:00:00Z',
      }),
      event({
        id: 'e-car',
        bookingId: 'car',
        date: '2026-08-06',
        startsAt: '2026-08-06T15:00:00Z',
        endsAt: '2026-08-06T15:00:00Z',
        status,
      }),
    ];
    const idx = buildPlaceUsageIndex(events, [flight, hire], [], [place('fra'), place('tlv')]);
    return idx.get('tlv')!.days.find((d) => d.date === '2026-08-06')!;
  };

  // The reported state: a 02:00 landing and an 18:00 car return already marked `היינו`.
  it('is behind you once the only thing still ahead has been ticked off', () => {
    expect(isDayUsagePast(dayOf(EVENT_STATUS.DONE), NOW, '2026-08-06')).toBe(true);
  });

  it('and a skip closes it exactly as a visit does', () => {
    expect(isDayUsagePast(dayOf(EVENT_STATUS.SKIPPED), NOW, '2026-08-06')).toBe(true);
  });

  // The control, and it is what stops the fix from being "everything is behind you": an
  // UNSETTLED thing later today still holds the place ahead.
  it('but an unanswered one still does hold it ahead', () => {
    expect(isDayUsagePast(dayOf(EVENT_STATUS.PLANNED), NOW, '2026-08-06')).toBe(false);
  });
});

// ── WHICH REFERENCE THE ROW NAMES (owner, 2026-08-06) ─────────────────────────────────
// The day's `at`/`edge` point at its EARLIEST reference and `until` decides the block from its
// LATEST. Each is right for its own question and they misread together: an airport whose landing
// was at 02:00 and whose car is due back at 18:00 is genuinely still ahead of you at 15:11, and
// the row said so while its clock named the landing. _"I want the timings to display only the
// ones relevant for the day"_.
describe('the row names the reference that is relevant', () => {
  const TODAY = '2026-08-06';
  const NOW = Date.parse('2026-08-06T12:11:00Z'); // 15:11 local
  /** A landing at 02:00 and one more thing at 18:00, whose status the case picks. */
  const airport = (laterStatus: TripEvent['status']) =>
    buildPlaceUsageIndex(
      [
        event({
          id: 'e-fl',
          bookingId: 'fl',
          kind: EVENT_KIND.HARD,
          date: '2026-08-05',
          endDate: TODAY,
          startsAt: '2026-08-05T19:00:00Z',
          endsAt: '2026-08-05T23:00:00Z',
        }),
        event({
          id: 'e-later',
          placeId: 'tlv',
          date: TODAY,
          startsAt: '2026-08-06T15:00:00Z',
          endsAt: '2026-08-06T15:00:00Z',
          status: laterStatus,
        }),
      ],
      [booking({ id: 'fl', type: BOOKING_TYPE.FLIGHT, fromPlaceId: 'fra', toPlaceId: 'tlv' })],
      [],
      [place('tlv'), place('fra')],
    ).get('tlv')!;

  // THE REPORTED CONTRADICTION, both halves in one assertion: still ahead, and now able to say
  // WHY it is ahead instead of naming the landing it is ahead of.
  it('names what is still to come, not the passed thing it is ahead of', () => {
    const usage = airport(EVENT_STATUS.PLANNED);
    const ctx = { nowMs: NOW, today: TODAY };
    expect(placeBlock(usage, ctx)).toBe('ahead');
    expect(placeMetaDay(usage, ctx)!.eventId).toBe('e-later');
  });

  // Once everything has passed, the last thing that happened is what the place is about — not
  // the first. A behind-you airport reads the car return, not the small-hours landing.
  it('names the LAST thing once they have all passed', () => {
    const usage = airport(EVENT_STATUS.PLANNED);
    const ctx = { nowMs: Date.parse('2026-08-06T20:00:00Z'), today: TODAY };
    expect(placeBlock(usage, ctx)).toBe('behind');
    expect(placeMetaDay(usage, ctx)!.eventId).toBe('e-later');
  });

  // A settled reference is never "next" — the same rule `until` follows, so the block and the
  // name cannot disagree about whether a tick counts.
  it('a settled reference is not what you are heading for', () => {
    const usage = airport(EVENT_STATUS.DONE);
    const ctx = { nowMs: NOW, today: TODAY };
    expect(placeBlock(usage, ctx)).toBe('behind');
  });

  // The single-reference case must not move, which is the overwhelming majority of rows.
  it('leaves a place with one reference exactly as it was', () => {
    const usage = buildPlaceUsageIndex(
      [event({ id: 'solo', placeId: 'cafe', date: TODAY, startsAt: '2026-08-06T15:00:00Z' })],
      [],
      [],
      [place('cafe')],
    ).get('cafe')!;
    const day = placeMetaDay(usage, { nowMs: NOW, today: TODAY })!;
    expect(day.eventId).toBe('solo');
    expect(day.at).toBe(Date.parse('2026-08-06T15:00:00Z'));
  });

  // With NO clock the derivation must still answer — `placeMetaDay` is called without one on
  // the surfaces that have no now to read (and this file's purity rule depends on it).
  it("falls back to the day's first moment with no clock to reason with", () => {
    const usage = airport(EVENT_STATUS.PLANNED);
    expect(placeMetaDay(usage, { today: TODAY })!.eventId).toBe('e-fl');
  });
});

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

  // ── THE PLACE'S OWN WORD BEATS THE REFERENCES' (ADR-0165) ──────────────────────
  // The pin's hue, the badge's glyph and the type facet all read this one resolution, so what
  // is pinned is the PRECEDENCE and not one surface's value. A human calling a place `food`
  // while a hard sightseeing event is scheduled there is the case the whole column exists for:
  // before it, that tap had nowhere to land and nothing to change.
  it('a place’s own category wins the pin, over even a hard event’s', () => {
    const idx = buildPlaceUsageIndex(
      [event({ id: 'e', placeId: 'pl', category: 'sightseeing', kind: EVENT_KIND.HARD })],
      [],
      [],
      [place('pl', { category: 'food' })],
    );
    const u = idx.get('pl')!;
    expect(u.pin).toEqual({ category: 'food', commitment: 'hard' });
    // …and the commitment is still the references' to say: it is about the plan, not the place.
    expect([...u.categories].sort()).toEqual(['food', 'sightseeing']);
  });

  // A union, never a replacement — or saying what a place is would take it out of the chip its
  // schedule earned, which is the one thing a filter must not do quietly.
  it('a place’s own category joins the facet union rather than replacing it', () => {
    const idx = buildPlaceUsageIndex(
      [],
      [],
      [maybe({ id: 'm', placeId: 'pl' })],
      [place('pl', { category: 'lodging' })],
    );
    const u = idx.get('pl')!;
    expect(u.categories).toEqual(['lodging']);
    expect(u.pin).toEqual({ category: 'lodging', commitment: 'idea' });
    expect(
      matchesPlaceFilter(u, { category: 'lodging', maybesOnly: false }),
      'a place a human categorised must answer to that chip',
    ).toBe(true);
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

  it('an unnumbered stop sinks even though it carries a clock (ADR-0182 §3, 2026-08-11)', () => {
    // The owner's case: _"a hotel check in/out … should be at the end of the list"_. A
    // check-in has a time and it is a FLOOR — "from 15:00" is any hour after — so it was
    // sorting at 15:00, between the 14:00 and 16:00 stops, while carrying no number. The
    // rank asks `knowsMoment` now, the same question the numbering asks.
    const stay = event({
      id: 'stay',
      placeId: 'hotel',
      category: 'lodging',
      date: DAY,
      endDate: '2026-07-08',
      startsAt: at('15:00'),
      endsAt: '2026-07-08T11:00:00Z',
    });
    const idx = buildPlaceUsageIndex(
      [
        stay,
        event({ id: 'e1', placeId: 'museum', date: DAY, startsAt: at('14:00') }),
        event({ id: 'e2', placeId: 'dinner', date: DAY, startsAt: at('16:00') }),
      ],
      [],
      [],
      [place('hotel'), place('museum'), place('dinner')],
    );
    const eventById = (id: string) =>
      [
        stay,
        event({ id: 'e1', date: DAY, startsAt: at('14:00') }),
        event({ id: 'e2', date: DAY, startsAt: at('16:00') }),
      ].find((e) => e.id === id);
    expect(
      [...idx.values()]
        .sort((a, b) => comparePlacesBySchedule(a, b, { nameOf, onDate: DAY, eventById }))
        .map((u) => u.placeId),
    ).toEqual(['museum', 'dinner', 'hotel']);
    // …and with no way to resolve events the order is exactly what it always was, which is
    // what keeps every surface that cannot answer the question unchanged.
    expect(
      [...idx.values()]
        .sort((a, b) => comparePlacesBySchedule(a, b, { nameOf, onDate: DAY }))
        .map((u) => u.placeId),
    ).toEqual(['museum', 'hotel', 'dinner']);
  });

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

    // All-days scope used to read a place off `days[0]`, so ANY past day classified
    // it — a place is not behind you because it *has* a past. Both cases below were
    // simultaneously kept by `מה נשאר` (which asks about ALL a place's days) and
    // filed under `מה שמאחורינו`: two answers to one question on one screen.
    describe('all-days scope reads a place by the day it is LIVE on', () => {
      it('a place visited on a passed day and booked again later is ahead of you', () => {
        const idx = buildPlaceUsageIndex(
          [
            event({
              id: 'e1',
              placeId: 'cafe',
              date: '2026-07-05',
              startsAt: '2026-07-05T10:00:00Z',
              status: EVENT_STATUS.DONE,
            }),
            event({
              id: 'e2',
              placeId: 'cafe',
              date: '2026-07-09',
              startsAt: '2026-07-09T10:00:00Z',
            }),
            event({ id: 'e3', placeId: 'this-morning', date: DAY, startsAt: at('09:00') }),
          ],
          [],
          [],
          [place('cafe'), place('this-morning')],
        );
        const ctx = { nowMs: NOW, today: DAY };
        const cafe = idx.get('cafe')!;
        expect(placeBlock(cafe, ctx)).toBe(PLACE_BLOCK.ahead);
        // `מה נשאר` already answered this way — now the block agrees with it.
        expect(isPlaceLeft(cafe, ctx)).toBe(true);
        // …and it is read as its Thursday, not its Sunday.
        expect(placeDay(cafe, ctx)?.date).toBe('2026-07-09');
        expect(order(idx, undefined, NOW, DAY)).toEqual(['cafe', 'this-morning']);
      });

      it('the stay you sleep in tonight is not behind you from its second night on', () => {
        const idx = buildPlaceUsageIndex(
          [
            event({
              id: 'stay',
              placeId: 'hotel',
              date: '2026-07-05',
              endDate: '2026-07-10',
              startsAt: '2026-07-05T15:00:00Z',
              endsAt: '2026-07-10T10:00:00Z',
              category: 'lodging',
            }),
          ],
          [],
          [],
          [place('hotel')],
        );
        const hotel = idx.get('hotel')!;
        expect(placeBlock(hotel, { nowMs: NOW, today: DAY })).toBe(PLACE_BLOCK.ahead);
        // Today's night, so the row reads as the ambient backdrop it is (ADR-0054) —
        // not as a check-in two days ago.
        expect(placeDay(hotel, { nowMs: NOW, today: DAY })?.date).toBe(DAY);
      });

      it('behind you means EVERY day is, and it is read by its most recent one', () => {
        const idx = buildPlaceUsageIndex(
          [
            event({
              id: 'e1',
              placeId: 'twice',
              date: '2026-07-03',
              startsAt: '2026-07-03T10:00:00Z',
            }),
            event({
              id: 'e2',
              placeId: 'twice',
              date: '2026-07-05',
              startsAt: '2026-07-05T10:00:00Z',
            }),
          ],
          [],
          [],
          [place('twice')],
        );
        const twice = idx.get('twice')!;
        const ctx = { nowMs: NOW, today: DAY };
        expect(placeBlock(twice, ctx)).toBe(PLACE_BLOCK.behind);
        // Newest-first is what the behind block wants, so the day that sinks it is
        // the LAST one — "the stop you just left".
        expect(placeDay(twice, ctx)?.date).toBe('2026-07-05');
      });

      it('day-scoped is unchanged: the scoped day, or nothing (a ghost)', () => {
        const idx = buildPlaceUsageIndex(
          [
            event({
              id: 'e1',
              placeId: 'cafe',
              date: '2026-07-09',
              startsAt: '2026-07-09T10:00:00Z',
            }),
          ],
          [],
          [],
          [place('cafe')],
        );
        const cafe = idx.get('cafe')!;
        expect(placeDay(cafe, { onDate: '2026-07-09', nowMs: NOW, today: DAY })?.date).toBe(
          '2026-07-09',
        );
        expect(placeDay(cafe, { onDate: DAY, nowMs: NOW, today: DAY })).toBeUndefined();
      });

      it('with no clock it is still `days[0]` — which is what keeps a pin’s number stable', () => {
        const idx = buildPlaceUsageIndex(
          [
            event({
              id: 'e1',
              placeId: 'cafe',
              date: '2026-07-05',
              startsAt: '2026-07-05T10:00:00Z',
              status: EVENT_STATUS.DONE,
            }),
            event({
              id: 'e2',
              placeId: 'cafe',
              date: '2026-07-09',
              startsAt: '2026-07-09T10:00:00Z',
            }),
          ],
          [],
          [],
          [place('cafe')],
        );
        expect(placeDay(idx.get('cafe')!)?.date).toBe('2026-07-05');
      });
    });

    // The row's fade now reads this block rather than a human's `skipped` (#21), so
    // the predicate has to tell "the clock passed it" from "you are sleeping there
    // tonight" — the distinction ADR-0109's 2026-07-27 amendment rests on. Asserted in
    // BOTH scopes: they resolve a stay's day differently (the middle night day-scoped,
    // the live day all-days), so one of them passing says nothing about the other.
    it('a stay’s middle night is not behind you, in either scope', () => {
      const idx = buildPlaceUsageIndex(
        [
          event({
            id: 'stay',
            placeId: 'hotel',
            date: '2026-07-05',
            endDate: '2026-07-10',
            startsAt: '2026-07-05T15:00:00Z',
            endsAt: '2026-07-10T10:00:00Z',
            category: 'lodging',
          }),
          event({ id: 'e', placeId: 'morning', date: DAY, startsAt: at('09:00') }),
        ],
        [],
        [],
        [place('hotel'), place('morning')],
      );
      const hotel = idx.get('hotel')!;
      const morning = idx.get('morning')!;
      for (const onDate of [undefined, DAY]) {
        const ctx = { onDate, nowMs: NOW, today: DAY };
        expect(placeBlock(hotel, ctx)).toBe(PLACE_BLOCK.ahead);
        // …while a stop the clock HAS passed is behind you in both, which is the
        // asymmetry the canvas already drew and the list did not.
        expect(placeBlock(morning, ctx)).toBe(PLACE_BLOCK.behind);
      }
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

  // `מה נשאר` = somewhere you can still go (ADR-0124, correcting ADR-0121 §9's
  // settled-only rule). One sentence: it hides exactly what the list files under
  // `מה שמאחורינו`.
  describe('isPlaceLeft — what "what’s left" keeps', () => {
    const DAY = '2026-07-07';
    // Noon, so the day has both a past and a future in it.
    const NOON = Date.parse(at('12:00'));
    const ctx = (onDate?: string) => ({ onDate, nowMs: NOON, today: DAY });

    it('a stop still ahead of you today is left; one the clock has passed is not', () => {
      const ahead = usageFor([event({ id: 'e1', placeId: 'p', startsAt: at('20:00') })]);
      const passed = usageFor([event({ id: 'e1', placeId: 'p', startsAt: at('09:00') })]);
      expect(isPlaceLeft(ahead, ctx(DAY))).toBe(true);
      // THE CORRECTION. Nobody tapped anything on this one, so the settled-only rule
      // called it "left" for the rest of the trip — which is what made the filter
      // useless: settling is a manual tap most stops never get (ADR-0027 §1).
      expect(isPlaceLeft(passed, ctx(DAY))).toBe(false);
    });

    // The other half of the same rule, and the reason it is a `behind` question rather
    // than a clock question: a human closing something outranks the clock, so this is
    // hidden AT NOON, not at 20:00.
    it('a stop AHEAD of you that a human settled is not left either', () => {
      const doneTonight = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('20:00'), status: EVENT_STATUS.DONE }),
      ]);
      const skippedTonight = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('20:00'), status: EVENT_STATUS.SKIPPED }),
      ]);
      expect(isPlaceLeft(doneTonight, ctx(DAY))).toBe(false);
      expect(isPlaceLeft(skippedTonight, ctx(DAY))).toBe(false);
    });

    it('and on a future DAY, settled is settled — the clock never gets a say', () => {
      const doneThursday = usageFor([
        event({
          id: 'e1',
          placeId: 'p',
          date: '2026-07-09',
          startsAt: '2026-07-09T09:00:00Z',
          status: EVENT_STATUS.DONE,
        }),
      ]);
      expect(isPlaceLeft(doneThursday, ctx())).toBe(false);
      expect(isPlaceLeft(doneThursday, ctx('2026-07-09'))).toBe(false);
    });

    it('a place with no day at all is always left — that is ללא יום, not behind', () => {
      const idea = buildPlaceUsageIndex(
        [],
        [],
        [maybe({ id: 'm', placeId: 'p' })],
        [place('p')],
      ).get('p')!;
      expect(isPlaceLeft(idea, ctx())).toBe(true);
      expect(isPlaceLeft(idea, ctx(DAY))).toBe(true);
    });

    it('across the trip every day must be behind you, not just one', () => {
      const u = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('09:00'), status: EVENT_STATUS.DONE }),
        event({ id: 'e2', placeId: 'p', date: '2026-07-09', startsAt: '2026-07-09T09:00:00Z' }),
      ]);
      expect(isPlaceLeft(u, ctx())).toBe(true);
      // …but that first day, standing in it, is done with.
      expect(isPlaceLeft(u, ctx(DAY))).toBe(false);
    });

    // What applies the toggle to the map's ghost tier: a ghost has no day in the scope
    // being asked about, so a bare day filter would read it as still-to-come and leave
    // Tuesday's cafe on the canvas.
    it('a place with nothing on the scoped day falls back to all its days', () => {
      const visited = usageFor([
        event({ id: 'e1', placeId: 'p', date: '2026-07-05', startsAt: '2026-07-05T09:00:00Z' }),
      ]);
      const coming = usageFor([
        event({ id: 'e1', placeId: 'p', date: '2026-07-09', startsAt: '2026-07-09T09:00:00Z' }),
      ]);
      expect(isPlaceLeft(visited, ctx(DAY))).toBe(false);
      expect(isPlaceLeft(coming, ctx(DAY))).toBe(true);
    });

    // The property that makes the tab explainable in one sentence, and the reason this
    // reads `placeBlock` rather than restating it.
    it('it hides exactly the `behind` block, and nothing else', () => {
      const u = usageFor([
        event({ id: 'e1', placeId: 'p', startsAt: at('09:00') }),
        event({ id: 'e2', placeId: 'p', date: '2026-07-09', startsAt: '2026-07-09T09:00:00Z' }),
      ]);
      for (const onDate of [undefined, DAY, '2026-07-09']) {
        expect(isPlaceLeft(u, ctx(onDate))).toBe(placeBlock(u, ctx(onDate)) !== PLACE_BLOCK.behind);
      }
    });

    it('the filter drops a passed place only when the toggle is on', () => {
      const passed = usageFor([event({ id: 'e1', placeId: 'p', startsAt: at('09:00') })]);
      const filter: PlaceFilter = {
        category: PLACE_CATEGORY_ALL,
        maybesOnly: false,
        ...ctx(DAY),
      };
      expect(matchesPlaceFilter(passed, filter)).toBe(true);
      expect(matchesPlaceFilter(passed, { ...filter, leftOnly: true })).toBe(false);
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
