import { describe, expect, it } from 'vitest';
import { RECAP_ABSENT, type RecapFigure, type TripRecap } from '@waypoint/shared';
import { MEMORY_FIGURES_MAX } from '../constants';
import { t } from '../i18n/he';
import type { Booking, Place, TripEvent, ZoneEvidence } from '@waypoint/shared';
import { memoryBests, memoryDays, memoryFigures, recapHours, recapKm } from './memory-home';

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
      footMeters: RECAP_ABSENT,
      airMeters: RECAP_ABSENT,
      airMinutes: RECAP_ABSENT,
      zonesCrossed: RECAP_ABSENT,
      zoneShiftMinutes: RECAP_ABSENT,
      ...figures,
    },
    superlatives: {
      busiestDay: RECAP_ABSENT,
      longestWalkDay: RECAP_ABSENT,
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

describe('memoryFigures: which tiles, in what order (ADR-0240 §4)', () => {
  it("the seed's three: places with its unmarked rows, the flight, the clock", () => {
    const figures = memoryFigures(
      recap({
        places: present(4, { unresolved: 6 }),
        airMeters: present(9_203_024),
        zoneShiftMinutes: present(360),
      }),
    );
    expect(figures).toEqual([
      { key: 'places', value: '4', label: t.planHome.past.fig.places, unresolved: 6 },
      { key: 'air', value: '9,203', label: t.planHome.past.fig.air },
      { key: 'shift', value: '+6', label: t.planHome.past.fig.shift },
    ]);
  });

  it('an estimate carries ~, and only places repeats the unmarked count', () => {
    const [ground] = memoryFigures(
      recap({ groundMeters: present(21_300, { estimate: true, unresolved: 2 }) }),
    );
    expect(ground).toEqual({ key: 'ground', value: '~21', label: t.planHome.past.fig.ground });
  });

  it('an absent figure and a zero are no tile at all', () => {
    const figures = memoryFigures(
      recap({ places: present(3), zoneShiftMinutes: present(0), airMeters: RECAP_ABSENT }),
    );
    expect(figures.map((figure) => figure.key)).toEqual(['places']);
  });

  it('a zero with rows still unmarked keeps its tile, since it can still move', () => {
    const figures = memoryFigures(recap({ places: present(0, { unresolved: 2 }) }));
    expect(figures).toEqual([
      { key: 'places', value: '0', label: t.planHome.past.fig.places, unresolved: 2 },
    ]);
  });

  it(`never more than ${MEMORY_FIGURES_MAX}`, () => {
    const figures = memoryFigures(
      recap({
        places: present(12),
        airMeters: present(9_000_000),
        zoneShiftMinutes: present(360),
        groundMeters: present(80_000),
        footMeters: present(30_000),
      }),
    );
    expect(figures).toHaveLength(MEMORY_FIGURES_MAX);
  });
});

describe('memoryDays: the contact sheet (ADR-0240 §4)', () => {
  const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
  const places: Place[] = [{ id: 'p1', name: 'Senso-ji', lat: 35.7, lng: 139.8, ...stamp }];
  const ev = (id: string, date: string, extra: Partial<TripEvent> = {}): TripEvent => ({
    id,
    date,
    title: id,
    kind: 'soft',
    status: 'done',
    sortOrder: 0,
    source: 'manual',
    ...stamp,
    ...extra,
  });
  const base = {
    trip: { destination: 'טוקיו', startDate: '2026-05-01', endDate: '2026-05-04' },
    bookings: [],
    places,
    placeLabels: {},
    enrichments: {},
  };

  it('frames only days where something happened, and counts the rest', () => {
    const { days, quiet } = memoryDays({
      ...base,
      events: [
        ev('a', '2026-05-02', { placeId: 'p1', icon: '⛩️' }),
        ev('b', '2026-05-03', { status: 'skipped', icon: '🍸' }),
        ev('c', '2026-05-04', { status: 'planned' }),
      ],
    });
    expect(days.map((day) => day.date)).toEqual(['2026-05-02']);
    expect(quiet).toBe(3);
    expect(days[0]).toMatchObject({ numeral: '02', glyphs: ['⛩️'] });
    expect(days[0]!.when).toContain('02.05');
  });

  it('marks a day with what happened on it, at most four distinct glyphs', () => {
    const icons = ['🗺️', '🐟', '🐟', '⛩️', '🍶', '🌳'];
    const { days } = memoryDays({
      ...base,
      events: icons.map((icon, i) => ev(`e${i}`, '2026-05-02', { icon, sortOrder: i })),
    });
    expect(days[0]!.glyphs).toEqual(['🗺️', '🐟', '⛩️', '🍶']);
  });

  it('counts a hard row nobody skipped as having happened', () => {
    const { days } = memoryDays({
      ...base,
      events: [
        ev('flight', '2026-05-01', { kind: 'hard', status: 'planned', category: 'transport' }),
      ],
    });
    expect(days.map((day) => day.date)).toEqual(['2026-05-01']);
  });
});

describe('memoryBests: firsts and bests (ADR-0240 §4)', () => {
  const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
  const ev = (id: string, time: string, extra: Partial<TripEvent> = {}): TripEvent => ({
    id,
    date: '2026-05-02',
    title: id,
    kind: 'soft',
    status: 'done',
    startsAt: `2026-05-02T${time}:00.000Z`,
    sortOrder: 0,
    source: 'manual',
    placeId: `p-${id}`,
    ...stamp,
    ...extra,
  });
  const evidence = {
    primaryZone: 'UTC',
    crossings: [],
    events: [],
    places: [],
  } as unknown as ZoneEvidence;
  const days = [
    { date: '2026-05-02', when: 'ש׳ 02.05', numeral: '02', name: 'Asakusa', glyphs: [] },
  ];
  const run = (
    events: TripEvent[],
    figures: Partial<TripRecap['superlatives']> = {},
    bookings: Booking[] = [],
  ) => {
    const base = recap({});
    return memoryBests({
      recap: { ...base, superlatives: { ...base.superlatives, ...figures } },
      events,
      bookings,
      days,
      evidence,
    });
  };

  it('names the first and last thing that happened, with its clock and its place', () => {
    const rows = run([
      ev('late', '20:00'),
      ev('early', '09:00'),
      ev('skipped', '07:00', { status: 'skipped' }),
    ]);
    expect(rows.map((row) => [row.key, row.title])).toEqual([
      ['first', 'early'],
      ['last', 'late'],
    ]);
    expect(rows[0]!.clock).toContain('09:00');
    expect(rows[0]!.placeId).toBe('p-early');
  });

  it('leaves out legs and beds, which are not places the trip was at', () => {
    const rows = run([
      ev('flight', '06:00', {
        kind: 'hard',
        status: 'planned',
        category: 'transport',
        placeId: undefined,
      }),
      ev('hotel', '07:00', { kind: 'hard', status: 'planned', category: 'lodging' }),
      ev('museum', '10:00'),
    ]);
    expect(rows.map((row) => row.title)).toEqual(['museum']);
  });

  it('drops a superlative that repeats a row already named', () => {
    const rows = run([ev('tour', '09:00'), ev('bar', '21:00')], {
      longestStop: { state: 'present', value: { eventId: 'tour', minutes: 360 } },
    });
    expect(rows.map((row) => row.key)).toEqual(['first', 'last']);
  });

  it('a day row carries no place, so no pin', () => {
    const rows = run([ev('a', '09:00')], {
      busiestDay: { state: 'present', value: { date: '2026-05-02', places: 5 } },
    });
    const day = rows.find((row) => row.key === 'busiestDay')!;
    expect(day.placeId).toBeUndefined();
    expect(day.title).toContain('Asakusa');
    expect(day.detail).toBe(t.planHome.past.bests.places(5));
  });

  it('the fullest day that was also the walked-furthest day is one row, not two', () => {
    const rows = run([ev('a', '09:00')], {
      busiestDay: { state: 'present', value: { date: '2026-05-02', places: 5 } },
      longestWalkDay: {
        state: 'present',
        value: { date: '2026-05-02', meters: 600 },
        estimate: true,
      },
    });
    expect(rows.filter((row) => row.date === '2026-05-02' && !row.placeId)).toHaveLength(1);
    expect(rows.find((row) => row.key === 'busiestDay')!.detail).toContain('0.6');
    expect(rows.some((row) => row.key === 'walkDay')).toBe(false);
  });
});
