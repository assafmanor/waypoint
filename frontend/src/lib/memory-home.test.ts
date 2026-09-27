import { describe, expect, it } from 'vitest';
import { RECAP_ABSENT, type RecapFigure, type TripRecap } from '@waypoint/shared';
import { MEMORY_FIGURES_MAX } from '../constants';
import { t } from '../i18n/he';
import { memoryFigures, recapHours, recapKm } from './memory-home';

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
