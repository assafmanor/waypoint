import { describe, expect, it } from 'vitest';
import { RECAP_ABSENT, type RecapFigure, type TripRecap } from '@waypoint/shared';
import { MEMORY_FIGURES_MAX } from '../constants';
import { t } from '../i18n/he';
import type { Booking, MaybeItem, Note, Place, TripEvent, ZoneEvidence } from '@waypoint/shared';
import { buildNoteHosts } from './notes';
import {
  memoryBests,
  memoryDays,
  memoryFigures,
  memoryJournal,
  memoryNextTime,
  memoryStragglers,
  recapHours,
  recapKm,
} from './memory-home';

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

describe('memoryStragglers: the rows the sheet walks (ADR-0240 §4)', () => {
  const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
  const ev = (id: string, startsAt?: string): TripEvent => ({
    id,
    date: '2026-05-02',
    title: id,
    kind: 'soft',
    status: 'planned',
    ...(startsAt ? { startsAt } : {}),
    sortOrder: 0,
    source: 'manual',
    ...stamp,
  });
  const evidence = {
    primaryZone: 'UTC',
    crossings: [],
    events: [],
    places: [],
  } as unknown as ZoneEvidence;

  it("asks in the recap's order, each row with its day and, when it has one, its clock", () => {
    const rows = memoryStragglers({
      recap: { ...recap({}), stragglers: ['timed', 'untimed', 'gone'] },
      events: [ev('untimed'), ev('timed', '2026-05-02T21:30:00.000Z')],
      evidence,
    });
    // A straggler the events no longer carry is not asked about.
    expect(rows.map((row) => row.event.id)).toEqual(['timed', 'untimed']);
    expect(rows[0]!.subject).toContain('02.05');
    expect(rows[0]!.subject).toContain('21:30');
    expect(rows[1]!.subject).not.toContain(':');
  });
});

describe('memoryNextTime: skipped rows, then ideas never used (ADR-0240 §4)', () => {
  const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
  const skippedRow: TripEvent = {
    id: 'bar',
    date: '2026-05-02',
    title: 'Cocktail bar',
    kind: 'soft',
    status: 'skipped',
    placeId: 'p-bar',
    sortOrder: 0,
    source: 'manual',
    ...stamp,
  };
  const idea = (id: string, extra: Partial<MaybeItem> = {}): MaybeItem => ({
    id,
    title: id,
    createdBy: 'u1',
    consumed: false,
    ...stamp,
    ...extra,
  });

  it("keeps the recap's order and says which day each row can open", () => {
    const rows = memoryNextTime({
      recap: { ...recap({}), nextTime: { skipped: ['bar'], ideas: ['someday', 'friday', 'gone'] } },
      events: [skippedRow],
      bookings: [],
      maybes: [idea('friday', { targetDate: '2026-05-03', placeId: 'p-f' }), idea('someday')],
    });
    expect(rows.map((row) => [row.id, row.skipped, row.date])).toEqual([
      ['bar', true, '2026-05-02'],
      ['someday', false, undefined],
      ['friday', false, '2026-05-03'],
    ]);
    expect(rows[0]!.placeId).toBe('p-bar');
    expect(rows[0]!.when).toContain('02.05');
    expect(rows[1]!.when).toBeUndefined();
    expect(rows[2]!.placeId).toBe('p-f');
  });
});

describe('memoryJournal: the notes in day order (ADR-0240 §4)', () => {
  const stamp = { tripId: 't1', updatedAt: '', updatedBy: 'u1', createdBy: 'u1' };
  const stop = { id: 'e1', title: 'Golden Gai', date: '2026-05-03' };
  const note = (id: string, createdAt: string, extra: Partial<Note> = {}): Note => ({
    id,
    source: 'member',
    createdAt,
    ...stamp,
    ...extra,
  });
  const evidence = {
    primaryZone: 'Asia/Tokyo',
    crossings: [],
    events: [],
    bookings: [],
    places: [],
  } as unknown as ZoneEvidence;
  const hosts = buildNoteHosts({
    events: [stop],
    bookings: [],
    places: [],
    maybeItems: [],
    documents: [],
  });

  it('files a note under the day it is about, else the day it was written, in written order', () => {
    const journal = memoryJournal({
      trip: { startDate: '2026-05-01', endDate: '2026-05-03' },
      notes: [
        // Written on the 1st about the 3rd's stop: it belongs to the 3rd.
        note('about', '2026-05-01T01:00:00Z', { eventId: 'e1' }),
        // 23:30 UTC on the 1st is the 2nd in Tokyo, where the trip was.
        note('late', '2026-05-01T23:30:00Z'),
        note('later', '2026-05-03T05:00:00Z'),
        // A packing list from before the trip is counted, not filed.
        note('packing', '2026-04-01T10:00:00Z'),
      ],
      hosts,
      evidence,
      days: [{ date: '2026-05-03', when: '', numeral: '03', name: 'Shinjuku', glyphs: [] }],
    });
    expect(journal.days.map((day) => [day.date, day.notes.map((n) => n.id)])).toEqual([
      ['2026-05-02', ['late']],
      ['2026-05-03', ['about', 'later']],
    ]);
    expect(journal.days[1]!.heading).toContain('Shinjuku');
    expect(journal.days[0]!.heading).toContain('02.05');
    expect(journal.outside).toBe(1);
  });
});
