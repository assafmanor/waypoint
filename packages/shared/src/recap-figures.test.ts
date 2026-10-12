import { describe, expect, it } from 'vitest';
import type { TripEvent } from './entities';
import {
  MEMORY_FIGURES_MAX,
  memoryBestPicks,
  memoryFigureValues,
  recapHours,
  recapKm,
} from './recap-figures';
import { RECAP_ABSENT, type RecapFigure, type TripRecap } from './trip-recap';

const present = (
  value: number,
  extra: { estimate?: true; unresolved?: number } = {},
): RecapFigure => ({
  state: 'present',
  value,
  ...extra,
});

function recap(figures: Partial<TripRecap['figures']>): TripRecap {
  return {
    figures: {
      days: present(10),
      nights: present(9),
      beds: RECAP_ABSENT,
      places: RECAP_ABSENT,
      placesByCategory: RECAP_ABSENT,
      kinds: RECAP_ABSENT,
      regions: RECAP_ABSENT,
      route: RECAP_ABSENT,
      groundMeters: RECAP_ABSENT,
      airMeters: RECAP_ABSENT,
      airMinutes: RECAP_ABSENT,
      zonesCrossed: RECAP_ABSENT,
      zoneShiftMinutes: RECAP_ABSENT,
      ...figures,
    },
    superlatives: {
      busiestDay: RECAP_ABSENT,
      longestFlight: RECAP_ABSENT,
      longestStop: RECAP_ABSENT,
    },
    stragglers: [],
    nextTime: { skipped: [], ideas: [] },
    cover: undefined,
  };
}

describe('recapKm / recapHours', () => {
  it.each([
    [600, '0.6'],
    [9_400, '9.4'],
    [21_300, '21'],
    [9_203_024, '9,203'],
  ])('%i m reads %s', (meters, expected) => {
    expect(recapKm(meters)).toBe(expected);
  });

  it.each([
    [360, '+6'],
    [-420, '-7'],
    [330, '+5.5'],
  ])('%i minutes reads %s', (minutes, expected) => {
    expect(recapHours(minutes)).toBe(expected);
  });
});

describe('memoryFigureValues: which tiles, in what order (ADR-0240 §4)', () => {
  it("the seed's three: places with its unmarked rows, the flight, the clock", () => {
    const figures = memoryFigureValues(
      recap({
        places: present(4, { unresolved: 6 }),
        airMeters: present(9_203_024),
        zoneShiftMinutes: present(360),
      }),
    );
    expect(figures).toEqual([
      { key: 'places', value: '4', unresolved: 6 },
      { key: 'air', value: '9,203' },
      { key: 'shift', value: '+6' },
    ]);
  });

  it('an estimate carries ~, and only places repeats the unmarked count', () => {
    const [ground] = memoryFigureValues(
      recap({ groundMeters: present(21_300, { estimate: true, unresolved: 2 }) }),
    );
    expect(ground).toEqual({ key: 'ground', value: '~21' });
  });

  it('an absent figure and a zero are no tile at all', () => {
    const figures = memoryFigureValues(
      recap({ places: present(3), zoneShiftMinutes: present(0), airMeters: RECAP_ABSENT }),
    );
    expect(figures.map((figure) => figure.key)).toEqual(['places']);
  });

  it('a zero with rows still unmarked keeps its tile, since it can still move', () => {
    const figures = memoryFigureValues(recap({ places: present(0, { unresolved: 2 }) }));
    expect(figures).toEqual([{ key: 'places', value: '0', unresolved: 2 }]);
  });

  it(`reads places, air, clock, ground, within ${MEMORY_FIGURES_MAX}`, () => {
    const figures = memoryFigureValues(
      recap({
        places: present(12),
        airMeters: present(9_000_000),
        zoneShiftMinutes: present(360),
        groundMeters: present(80_000),
      }),
    );
    expect(figures.map((figure) => figure.key)).toEqual(['places', 'air', 'shift', 'ground']);
    expect(figures.length).toBeLessThanOrEqual(MEMORY_FIGURES_MAX);
  });
});

describe('memoryBestPicks: which rows ראשונים וטובים names (ADR-0240 §4)', () => {
  const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
  const ev = (id: string, startsAt: string, extra: Partial<TripEvent> = {}): TripEvent => ({
    id,
    date: startsAt.slice(0, 10),
    title: id,
    kind: 'soft',
    status: 'done',
    sortOrder: 0,
    source: 'manual',
    startsAt,
    ...stamp,
    ...extra,
  });
  const events = [
    ev('bed', '2026-05-01T08:00:00Z', { category: 'lodging' }),
    ev('museum', '2026-05-01T10:00:00Z'),
    ev('skipped', '2026-05-01T09:00:00Z', { status: 'skipped' }),
    ev('market', '2026-05-02T11:00:00Z'),
  ];

  it('first and last are the earliest and latest stop that happened, never a bed', () => {
    const picks = memoryBestPicks({ recap: recap({}), events, bookings: [] });
    expect(picks.map((pick) => [pick.key, 'event' in pick ? pick.event.id : pick.date])).toEqual([
      ['first', 'museum'],
      ['last', 'market'],
    ]);
  });

  it('drops a superlative that repeats a row', () => {
    const base = recap({});
    const picks = memoryBestPicks({
      recap: {
        ...base,
        superlatives: {
          ...base.superlatives,
          longestStop: { state: 'present', value: { eventId: 'museum', minutes: 120 } },
          busiestDay: { state: 'present', value: { date: '2026-05-01', places: 2 } },
        },
      },
      events,
      bookings: [],
    });
    expect(picks.map((pick) => pick.key)).toEqual(['first', 'busiestDay', 'last']);
    expect(picks[1]).toEqual({ key: 'busiestDay', date: '2026-05-01', places: 2 });
  });
});
