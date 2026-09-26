import { describe, expect, it } from 'vitest';
import type { Booking, MaybeItem, Place, TripEvent } from './entities';
import type { DeliveredImageValue, TripEnrichments } from './enrichment';
import { haversineMeters } from './geo';
import { routeLegKey } from './routing';
import {
  RECAP_ABSENT,
  recapHappened,
  tripRecap,
  tripRecapLegKeys,
  type RecapFigure,
  type TripRecapInput,
} from './trip-recap';

const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
const DAY1 = '2026-05-01';
const DAY2 = '2026-05-02';

const place = (id: string, lat: number, lng: number, extra: Partial<Place> = {}): Place => ({
  id,
  name: id,
  lat,
  lng,
  ...stamp,
  ...extra,
});

let order = 0;
const ev = (id: string, extra: Partial<TripEvent> = {}): TripEvent => ({
  id,
  date: DAY1,
  title: id,
  kind: 'soft',
  status: 'done',
  sortOrder: order++,
  source: 'manual',
  ...stamp,
  ...extra,
});
const at = (date: string, time: string) => `${date}T${time}:00.000Z`;

const booking = (id: string, extra: Partial<Booking>): Booking => ({
  id,
  type: 'other',
  title: id,
  source: 'manual',
  ...stamp,
  ...extra,
});

// Three stops in Tokyo a few hundred metres to a few km apart, an airport pair, and a hotel.
const A = place('a', 35.7148, 139.7967); // Senso-ji
const B = place('b', 35.6654, 139.7707); // Tsukiji
const C = place('c', 35.6938, 139.7034); // Shinjuku
const TLV = place('tlv', 32.0055, 34.8854, { timezone: 'Asia/Jerusalem' });
const NRT = place('nrt', 35.772, 140.3929, { timezone: 'Asia/Tokyo' });
const HOTEL = place('h', 35.6946, 139.7016, { category: 'lodging' });
const PLACES = [A, B, C, TLV, NRT, HOTEL];

function input(over: Partial<TripRecapInput> = {}): TripRecapInput {
  return {
    trip: { startDate: DAY1, endDate: '2026-05-03' },
    events: [],
    bookings: [],
    places: PLACES,
    maybes: [],
    enrichments: {},
    overrides: [],
    legs: new Map(),
    ...over,
  };
}

const value = <T>(figure: RecapFigure<T>) =>
  figure.state === 'present' ? figure.value : undefined;

describe('recapHappened: what a figure counts (ADR-0239 §9)', () => {
  it.each([
    ['soft done', 'soft', 'done', true],
    ['soft planned (unresolved)', 'soft', 'planned', false],
    ['soft skipped', 'soft', 'skipped', false],
    ['hard planned (hard rows are not settled)', 'hard', 'planned', true],
    ['hard skipped', 'hard', 'skipped', false],
  ] as const)('%s', (_, kind, status, expected) => {
    expect(recapHappened({ kind, status })).toBe(expected);
  });
});

describe('tripRecap figures', () => {
  it('days and nights come from the trip dates, always present', () => {
    const { figures } = tripRecap(input());
    expect(figures.days).toEqual({ state: 'present', value: 3 });
    expect(figures.nights).toEqual({ state: 'present', value: 2 });
  });

  it.each([
    ['absent with no rows at all', [], RECAP_ABSENT],
    [
      'counts distinct places marked done, lodging excluded',
      [
        ev('1', { placeId: 'a' }),
        ev('2', { placeId: 'b' }),
        ev('3', { placeId: 'a', date: DAY2 }),
        ev('4', { placeId: 'h', category: 'lodging' }),
      ],
      { state: 'present', value: 2 },
    ],
    [
      'says how many rows are still unresolved',
      [ev('1', { placeId: 'a' }), ev('2', { placeId: 'b', status: 'planned' })],
      { state: 'present', value: 1, unresolved: 1 },
    ],
    [
      'is zero, not absent, when every place row is unresolved',
      [ev('1', { placeId: 'a', status: 'planned' })],
      { state: 'present', value: 0, unresolved: 1 },
    ],
    ['never counts a skipped row', [ev('1', { placeId: 'a', status: 'skipped' })], RECAP_ABSENT],
  ] as const)('places: %s', (_, events, expected) => {
    expect(tripRecap(input({ events: [...events] })).figures.places).toEqual(expected);
  });

  it('places by category: most first, the place category ahead of the row', () => {
    const events = [
      ev('1', { placeId: 'a', category: 'sightseeing' }),
      ev('2', { placeId: 'b', category: 'food' }),
      ev('3', { placeId: 'c', category: 'food' }),
    ];
    expect(value(tripRecap(input({ events })).figures.placesByCategory)).toEqual([
      { category: 'food', count: 2 },
      { category: 'sightseeing', count: 1 },
    ]);
    expect(tripRecap(input()).figures.placesByCategory).toEqual(RECAP_ABSENT);
  });

  it('beds: distinct lodging, booked or not; absent without any', () => {
    const hotel = booking('bk-h', { type: 'hotel', placeId: 'h' });
    const events = [
      ev('in', { kind: 'hard', status: 'planned', bookingId: 'bk-h' }),
      ev('out', { kind: 'hard', status: 'planned', bookingId: 'bk-h', date: DAY2 }),
    ];
    expect(tripRecap(input({ events, bookings: [hotel] })).figures.beds).toEqual({
      state: 'present',
      value: 1,
    });
    expect(tripRecap(input({ events: [ev('1', { placeId: 'a' })] })).figures.beds).toEqual(
      RECAP_ABSENT,
    );
  });

  const variants = (text: string) => ({
    he: {
      value: text,
      lang: 'he' as const,
      source: 'wikidata' as const,
      license: 'CC0',
      fetchedAt: '',
      confidence: 1,
    },
  });

  it('kinds: from enrichment, most frequent first; absent where nothing is known', () => {
    const enrichments = {
      a: { kind: variants('מקדש') },
      b: { kind: variants('שוק') },
      c: { kind: variants('מקדש') },
    } as unknown as TripEnrichments;
    const events = [
      ev('1', { placeId: 'a' }),
      ev('2', { placeId: 'b' }),
      ev('3', { placeId: 'c' }),
    ];
    expect(value(tripRecap(input({ events, enrichments })).figures.kinds)).toEqual([
      { label: 'מקדש', count: 2 },
      { label: 'שוק', count: 1 },
    ]);
    expect(tripRecap(input({ events })).figures.kinds).toEqual(RECAP_ABSENT);
  });

  it('regions: in visit order, an airport contributing its served city', () => {
    const enrichments = {
      nrt: { servedCity: variants('טוקיו') },
      a: { region: variants('טאיטו') },
      c: { region: variants('שינג׳וקו') },
    } as unknown as TripEnrichments;
    const flight = booking('bk-f', { type: 'flight', fromPlaceId: 'tlv', toPlaceId: 'nrt' });
    const events = [
      ev('f', { kind: 'hard', status: 'planned', bookingId: 'bk-f', startsAt: at(DAY1, '01:00') }),
      ev('1', { placeId: 'a', startsAt: at(DAY1, '05:00') }),
      ev('2', { placeId: 'c', startsAt: at(DAY1, '08:00') }),
    ];
    expect(
      value(tripRecap(input({ events, bookings: [flight], enrichments })).figures.regions),
    ).toEqual(['טוקיו', 'טאיטו', 'שינג׳וקו']);
    expect(tripRecap(input({ events })).figures.regions).toEqual(RECAP_ABSENT);
  });

  describe('ground and foot distance', () => {
    const walkDay = [
      ev('1', { placeId: 'c', startsAt: at(DAY1, '01:00') }),
      ev('2', { placeId: 'h', startsAt: at(DAY1, '02:00'), category: 'lodging' }),
    ];

    it('is absent with fewer than two placed stops', () => {
      const recap = tripRecap(input({ events: [ev('1', { placeId: 'a' })] }));
      expect(recap.figures.groundMeters).toEqual(RECAP_ABSENT);
      expect(recap.figures.footMeters).toEqual(RECAP_ABSENT);
    });

    it('reads the cached leg exactly, with no estimate', () => {
      const key = routeLegKey(C, HOTEL, 'walking');
      const legs = new Map([[key, { distanceMeters: 240, durationSeconds: 180 }]]);
      const { figures } = tripRecap(input({ events: walkDay, legs }));
      expect(figures.footMeters).toEqual({ state: 'present', value: 240 });
      expect(figures.groundMeters).toEqual({ state: 'present', value: 240 });
    });

    it('falls back to the great circle and marks it an estimate', () => {
      const { figures } = tripRecap(input({ events: walkDay }));
      expect(figures.footMeters).toEqual({
        state: 'present',
        value: haversineMeters(C, HOTEL),
        estimate: true,
      });
    });

    it('a long leg defaults to driving: ground, not foot', () => {
      const events = [
        ev('1', { placeId: 'a', startsAt: at(DAY1, '01:00') }),
        ev('2', { placeId: 'c', startsAt: at(DAY1, '03:00') }),
      ];
      const { figures } = tripRecap(input({ events }));
      expect(value(figures.groundMeters)).toBeCloseTo(haversineMeters(A, C));
      expect(figures.footMeters).toEqual(RECAP_ABSENT);
    });

    it('a per-leg override outranks the default', () => {
      const events = [
        ev('1', { placeId: 'a', startsAt: at(DAY1, '01:00') }),
        ev('2', { placeId: 'c', startsAt: at(DAY1, '03:00') }),
      ];
      const overrides = [{ fromPlaceId: 'a', toPlaceId: 'c', mode: 'walking' as const }];
      expect(value(tripRecap(input({ events, overrides })).figures.footMeters)).toBeCloseTo(
        haversineMeters(A, C),
      );
    });

    it('carries the unresolved count of mapped rows', () => {
      const events = [...walkDay, ev('3', { placeId: 'b', status: 'planned', date: DAY2 })];
      expect(tripRecap(input({ events })).figures.footMeters).toMatchObject({ unresolved: 1 });
    });

    it('does not walk the two ends of a flight, or a skipped stop between two done ones', () => {
      const flight = booking('bk-f', { type: 'flight', fromPlaceId: 'tlv', toPlaceId: 'nrt' });
      const events = [
        ev('f', {
          kind: 'hard',
          status: 'planned',
          bookingId: 'bk-f',
          startsAt: at(DAY1, '00:00'),
        }),
        ev('s', { placeId: 'a', status: 'skipped', startsAt: at(DAY1, '01:00') }),
      ];
      expect(tripRecap(input({ events, bookings: [flight] })).figures.groundMeters).toEqual(
        RECAP_ABSENT,
      );
    });

    it('names every mode of every pair it will read, and nothing else', () => {
      const keys = tripRecapLegKeys(input({ events: walkDay }));
      expect(keys.sort()).toEqual(
        (['walking', 'driving', 'cycling'] as const).map((m) => routeLegKey(C, HOTEL, m)).sort(),
      );
    });
  });

  describe('air', () => {
    const flight = booking('bk-f', { type: 'flight', fromPlaceId: 'tlv', toPlaceId: 'nrt' });
    const rows = [
      ev('dep', {
        kind: 'hard',
        status: 'planned',
        bookingId: 'bk-f',
        startsAt: at(DAY1, '03:20'),
        endsAt: at(DAY1, '14:50'),
      }),
    ];

    it('air distance is the great circle, once per booking, and exact (ADR-0212)', () => {
      const twice = [...rows, ev('land', { kind: 'hard', status: 'planned', bookingId: 'bk-f' })];
      const { figures, superlatives } = tripRecap(input({ events: twice, bookings: [flight] }));
      expect(figures.airMeters).toEqual({ state: 'present', value: haversineMeters(TLV, NRT) });
      expect(value(superlatives.longestFlight)?.bookingId).toBe('bk-f');
    });

    it('hours in the air, in minutes; absent without a flight', () => {
      expect(tripRecap(input({ events: rows, bookings: [flight] })).figures.airMinutes).toEqual({
        state: 'present',
        value: 690,
      });
      expect(tripRecap(input()).figures.airMinutes).toEqual(RECAP_ABSENT);
      expect(tripRecap(input()).figures.airMeters).toEqual(RECAP_ABSENT);
    });

    it('a skipped flight is not flown', () => {
      const skipped = [{ ...rows[0]!, status: 'skipped' as const }];
      expect(tripRecap(input({ events: skipped, bookings: [flight] })).figures.airMeters).toEqual(
        RECAP_ABSENT,
      );
    });

    it('a train goes to ground distance as an estimate, never to air', () => {
      const train = booking('bk-t', { type: 'train', fromPlaceId: 'a', toPlaceId: 'nrt' });
      const events = [ev('t', { kind: 'hard', status: 'planned', bookingId: 'bk-t' })];
      const { figures } = tripRecap(input({ events, bookings: [train] }));
      expect(figures.airMeters).toEqual(RECAP_ABSENT);
      expect(figures.groundMeters).toMatchObject({ state: 'present', estimate: true });
    });

    it('zones crossed: counted where both ends are known, absent where not', () => {
      expect(tripRecap(input({ events: rows, bookings: [flight] })).figures.zonesCrossed).toEqual({
        state: 'present',
        value: 1,
      });
      const blind = booking('bk-f', { type: 'flight', fromPlaceId: 'a', toPlaceId: 'c' });
      expect(tripRecap(input({ events: rows, bookings: [blind] })).figures.zonesCrossed).toEqual(
        RECAP_ABSENT,
      );
    });
  });
});

describe('tripRecap superlatives', () => {
  it('busiest day needs two places; longest stop skips lodging', () => {
    const events = [
      ev('1', { placeId: 'a', startsAt: at(DAY1, '01:00'), endsAt: at(DAY1, '03:00') }),
      ev('2', { placeId: 'b', startsAt: at(DAY1, '04:00'), endsAt: at(DAY1, '04:30') }),
      ev('3', { placeId: 'c', date: DAY2 }),
      ev('4', {
        placeId: 'h',
        category: 'lodging',
        startsAt: at(DAY1, '10:00'),
        endsAt: at(DAY2, '10:00'),
      }),
    ];
    const { superlatives } = tripRecap(input({ events }));
    expect(value(superlatives.busiestDay)).toEqual({ date: DAY1, places: 2 });
    expect(value(superlatives.longestStop)).toEqual({ eventId: '1', minutes: 120 });
    expect(superlatives.longestWalkDay).toEqual(RECAP_ABSENT);
    expect(
      tripRecap(input({ events: [ev('x', { placeId: 'a' })] })).superlatives.busiestDay,
    ).toEqual(RECAP_ABSENT);
  });
});

describe('tripRecap lists', () => {
  it('stragglers are unresolved soft rows in schedule order; hard rows never straggle', () => {
    const events = [
      ev('late', { status: 'planned', date: DAY2 }),
      ev('early', { status: 'planned', startsAt: at(DAY1, '09:00') }),
      ev('hard', { kind: 'hard', status: 'planned' }),
    ];
    expect(tripRecap(input({ events })).stragglers).toEqual(['early', 'late']);
  });

  it('next time: skipped soft rows, then ideas never used', () => {
    const maybes: Pick<MaybeItem, 'id' | 'consumed'>[] = [
      { id: 'm1', consumed: false },
      { id: 'm2', consumed: true },
    ];
    const events = [ev('s', { status: 'skipped' }), ev('d')];
    expect(tripRecap(input({ events, maybes })).nextTime).toEqual({
      skipped: ['s'],
      ideas: ['m1'],
    });
  });
});

describe('tripRecap cover', () => {
  const image = (url: string): DeliveredImageValue =>
    ({
      url,
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      sizeBytes: 1,
      source: 'wikimedia_commons',
      license: 'CC BY-SA 4.0',
      confidence: 1,
      fetchedAt: '',
    }) as DeliveredImageValue;

  it("is dayPhoto's best rank across every day that happened", () => {
    const events = [
      ev('1', { placeId: 'a', startsAt: at(DAY1, '01:00'), endsAt: at(DAY1, '01:30') }),
      ev('2', { placeId: 'b', date: DAY2, startsAt: at(DAY2, '01:00'), endsAt: at(DAY2, '05:00') }),
      ev('3', {
        placeId: 'c',
        status: 'skipped',
        startsAt: at(DAY1, '02:00'),
        endsAt: at(DAY1, '12:00'),
      }),
    ];
    const enrichments = {
      a: { image: image('/a') },
      b: { image: image('/b') },
      c: { image: image('/c') },
    };
    const recap = tripRecap(input({ events, enrichments, placeLabel: (id) => `label-${id}` }));
    expect(recap.cover).toMatchObject({ url: '/b', of: 'label-b' });
  });

  it('falls to the next-ranked shot when the best one has lapsed, and to none after that', () => {
    const events = [
      ev('1', { placeId: 'a', startsAt: at(DAY1, '01:00'), endsAt: at(DAY1, '01:30') }),
      ev('2', { placeId: 'b', startsAt: at(DAY1, '02:00'), endsAt: at(DAY1, '05:00') }),
    ];
    expect(
      tripRecap(input({ events, enrichments: { a: { image: image('/a') } } })).cover?.url,
    ).toBe('/a');
    expect(tripRecap(input({ events })).cover).toBeUndefined();
  });
});
