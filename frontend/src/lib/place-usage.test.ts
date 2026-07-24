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
  countPlacesByCategory,
  matchesPlaceFilter,
  PLACE_CATEGORY_ALL,
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

describe('buildPlaceUsageIndex', () => {
  it('a single-day event → one edge day, its category, scheduled, soft pin', () => {
    const idx = buildPlaceUsageIndex(
      [event({ id: 'e', placeId: 'pl', category: 'food', date: '2026-07-07' })],
      [],
      [],
      [place('pl')],
    );
    const u = idx.get('pl')!;
    expect(u.days).toEqual([{ date: '2026-07-07', prominence: 'edge' }]);
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
    expect(idx.get('pl')?.days).toEqual([
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

  it('counts every category (0 for unused), one per referencing place', () => {
    const counts = countPlacesByCategory(all);
    expect(counts.food).toBe(2);
    expect(counts.sightseeing).toBe(1);
    expect(counts.lodging).toBe(0);
  });
});
