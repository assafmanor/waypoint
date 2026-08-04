import { describe, expect, it } from 'vitest';
import {
  SUGGESTION_REASON,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import {
  dayStops,
  rankIdeas,
  proposedDay,
  reasonText,
  shelfForSlot,
  tripDayStops,
  shelfGroups,
  slotStops,
  stopReasonText,
  tileReasonText,
} from './shelf';
import { withoutBidiControls } from './bidi';
import { SHELF_POOL_CAP } from '../constants';

const DAY = '2026-07-20';

const idea = (id: string, targetDate?: string, consumed = false): MaybeItem =>
  ({ id, tripId: 't', title: id, consumed, targetDate }) as MaybeItem;

const event = (partial: Partial<TripEvent> & Pick<TripEvent, 'id'>): TripEvent => ({
  tripId: 't',
  date: DAY,
  title: partial.id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('shelfGroups (ADR-0116 §2/§3)', () => {
  it('splits ideas pencilled in for the day from the rest of the pool', () => {
    const groups = shelfGroups(
      [idea('today', DAY), idea('someday'), idea('later', '2026-07-22')],
      [],
      DAY,
    );
    expect(ids(groups.forDay)).toEqual(['today']);
    expect(ids(groups.pool)).toEqual(['someday', 'later']);
  });

  it('dateless ideas lead the pool — they are the ones still asking to be placed', () => {
    const groups = shelfGroups([idea('later', '2026-07-22'), idea('someday')], [], DAY);
    expect(ids(groups.pool)).toEqual(['someday', 'later']);
  });

  it('a consumed idea is off the shelf entirely (ADR-0027: parked or placed)', () => {
    const groups = shelfGroups([idea('placed', DAY, true), idea('parked', DAY)], [], DAY);
    expect(ids(groups.forDay)).toEqual(['parked']);
    expect(ids(groups.pool)).toEqual([]);
  });

  it("carries the day's skipped soft events — the parking lot, in both modes", () => {
    const groups = shelfGroups(
      [],
      [
        event({ id: 'bailed', status: EVENT_STATUS.SKIPPED }),
        event({ id: 'still-on' }),
        event({ id: 'other-day', status: EVENT_STATUS.SKIPPED, date: '2026-07-21' }),
        event({ id: 'hard-skip', status: EVENT_STATUS.SKIPPED, kind: EVENT_KIND.HARD }),
      ],
      DAY,
    );
    // Only this day's SOFT skipped events park here.
    expect(ids(groups.skipped)).toEqual(['bailed']);
  });

  it('an all-dateless trip reads as one pool, so the shelf looks unchanged', () => {
    const groups = shelfGroups([idea('a'), idea('b')], [], DAY);
    expect(groups.forDay).toEqual([]);
    expect(groups.skipped).toEqual([]);
    expect(ids(groups.pool)).toEqual(['a', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The ranking (ADR-0116 session-202 §3/§4, ADR-0151). `shelfGroups` above is
// untouched by all of this — these functions only order what it grouped.

const place = (id: string, name: string, lat?: number, lng?: number): Place =>
  ({ id, tripId: 't', name, lat, lng, createdAt: '', updatedAt: '', updatedBy: 'u' }) as Place;

// A Tokyo lunch stop and points a known distance north of it.
const LUNCH = { lat: 35.6812, lng: 139.7671 };
const north = (m: number) => ({ lat: LUNCH.lat + m / 111_320, lng: LUNCH.lng });

const located = (id: string, name: string, m: number) =>
  place(id, name, north(m).lat, north(m).lng);

const at = (id: string, hhmm: string, placeId?: string, over: Partial<TripEvent> = {}) =>
  event({ id, placeId, startsAt: `${DAY}T${hhmm}:00.000Z`, ...over });

describe('dayStops', () => {
  const places = [located('p-lunch', 'מסעדת מון', 0), place('p-lite', 'מקום בלי נקודה')];

  it("carries the day's located stops, by name", () => {
    const stops = dayStops([at('e1', '12:00', 'p-lunch')], [], places, DAY);
    expect(stops).toEqual([{ name: 'מסעדת מון', at: LUNCH }]);
  });

  it('skips an event with no place, and a Place-lite with no coordinates', () => {
    const events = [at('e1', '12:00'), at('e2', '14:00', 'p-lite')];
    expect(dayStops(events, [], places, DAY)).toEqual([]);
  });

  // A skipped event is not happening, so ranking ideas against it would measure
  // proximity to a plan that was abandoned.
  it('excludes a skipped event', () => {
    const events = [at('e1', '12:00', 'p-lunch', { status: EVENT_STATUS.SKIPPED })];
    expect(dayStops(events, [], places, DAY)).toEqual([]);
  });

  it('ignores another day', () => {
    expect(
      dayStops([at('e1', '12:00', 'p-lunch', { date: '2026-07-21' })], [], places, DAY),
    ).toEqual([]);
  });
});

describe('slotStops — the gap sheet ranks against its own neighbours', () => {
  const places = [
    located('p-before', 'לפני', 0),
    located('p-after', 'אחרי', 500),
    located('p-far', 'רחוק בזמן', 900),
  ];
  // 09:00 · [gap 12:00–14:00] · 15:00, plus an early event that is NOT the neighbour.
  const events = [
    at('early', '07:00', 'p-far', { endsAt: `${DAY}T08:00:00.000Z` }),
    at('before', '09:00', 'p-before', { endsAt: `${DAY}T10:00:00.000Z` }),
    at('after', '15:00', 'p-after'),
  ];
  const slot = {
    fromMs: Date.parse(`${DAY}T12:00:00.000Z`),
    toMs: Date.parse(`${DAY}T14:00:00.000Z`),
  };

  it('takes the CLOSEST event on either side, not every event on the day', () => {
    expect(slotStops(events, [], places, DAY, slot).map((s) => s.name)).toEqual(['לפני', 'אחרי']);
  });

  it('a gap at the day’s edge has one neighbour', () => {
    const dayStart = {
      fromMs: Date.parse(`${DAY}T06:00:00.000Z`),
      toMs: Date.parse(`${DAY}T07:00:00.000Z`),
    };
    expect(slotStops(events, [], places, DAY, dayStart).map((s) => s.name)).toEqual(['רחוק בזמן']);
  });

  it('a day with no located events has none, and the strategy falls back honestly', () => {
    expect(slotStops(events, [], [], DAY, slot)).toEqual([]);
  });
});

// The whole input the slot sheet needs, in one call (ADR-0161 §6) — so a replacement and a gap
// fill cannot be ranked differently on the one sheet whose promise is that they are the same
// question.
// **ADR-0151's second strategy, from the frontend's side** (2026-08-04 amendment): the input it
// needs, the two densities its sentence has, and the predicate that decides whether a host
// offers the "agree" verb at all.
describe('fits-a-day, rendered', () => {
  const DAY_1 = '2026-07-20';
  const DAY_4 = '2026-07-23';
  const museum = located('p-museum', 'מוזיאון אדו', 0);
  const nearby = located('p-near', 'אודן', 300);
  const events = [at('museum', '10:00', 'p-museum', { date: DAY_4 })];

  it('gives every day its own stops, from the same derivation the focused day uses', () => {
    const days = tripDayStops([DAY_1, DAY_4], events, [], [museum, nearby]);
    expect(days).toEqual([
      { date: DAY_1, stops: [] },
      { date: DAY_4, stops: [{ name: 'מוזיאון אדו', at: expect.anything() }] },
    ]);
  });

  it('names the day a dateless idea belongs to, from the shelf', () => {
    const pool = [idea('oden')];
    const withPlace = [{ ...pool[0], placeId: 'p-near' } as MaybeItem];
    const ranked = rankIdeas(
      withPlace,
      [museum, nearby],
      DAY_1,
      [],
      undefined,
      tripDayStops([DAY_1, DAY_4], events, [], [museum, nearby]),
    );
    expect(ranked[0].reason).toMatchObject({
      code: SUGGESTION_REASON.FITS_DAY,
      date: DAY_4,
    });
  });

  // The split is a MEASUREMENT: the stop name wraps the tile's meta line and costs it 8px on a
  // 76px tile drawn to save them, so the tile says the day and the distance and the sheet says
  // the whole sentence.
  describe('two densities, and the stop name is the difference', () => {
    const reason = {
      code: SUGGESTION_REASON.FITS_DAY,
      date: DAY_4,
      meters: 300,
      stopName: 'מוזיאון אדו',
    } as const;

    it('the tile says the day and the distance, and NOT the stop', () => {
      const line = withoutBidiControls(tileReasonText(reason, DAY_1)!);
      expect(line).toContain('300');
      expect(line).not.toContain('מוזיאון אדו');
    });

    it('the sheet says all three', () => {
      const line = withoutBidiControls(reasonText(reason, DAY_1));
      expect(line).toContain('300');
      expect(line).toContain('מוזיאון אדו');
    });
  });

  // The verb exists only where there is a proposal to agree with.
  describe('proposedDay', () => {
    it('answers the day a proposal named', () => {
      expect(
        proposedDay({
          code: SUGGESTION_REASON.FITS_DAY,
          date: DAY_4,
          meters: 300,
          stopName: 'x',
        }),
      ).toBe(DAY_4);
    });

    it('answers null for every other reason, and for none at all', () => {
      expect(proposedDay({ code: SUGGESTION_REASON.RECENTLY_ADDED })).toBeNull();
      expect(proposedDay({ code: SUGGESTION_REASON.AIMED_AT_DAY, targetDate: DAY_4 })).toBeNull();
      expect(
        proposedDay({ code: SUGGESTION_REASON.NEAR_STOP, meters: 1, stopName: 'x' }),
      ).toBeNull();
      expect(proposedDay(undefined)).toBeNull();
    });
  });
});

describe('shelfForSlot', () => {
  const places = [located('p-before', 'לפני', 0), located('p-after', 'אחרי', 500)];
  const events = [
    at('before', '09:00', 'p-before', { endsAt: `${DAY}T10:00:00.000Z` }),
    at('after', '15:00', 'p-after'),
  ];
  const shelf = { forDay: [idea('m-day', DAY)], pool: [idea('m-pool')] };
  const ctx = { events, bookings: [], places };
  const slot = { date: DAY, start: '12:00', end: '14:00' };

  it('joins both shelf groups and ranks them against the slot’s own neighbours', () => {
    const ranked = shelfForSlot(shelf, slot, 'UTC', ctx);
    expect(ranked.map((r) => r.item.id).sort()).toEqual(['m-day', 'm-pool']);
  });

  // **The blank screen** (reported 2026-08-04): `החלף` was offered on an untimed row, so this
  // was handed a slot with no clock — `zonedIso(date, '', tz)` builds an Invalid Date and
  // `toISOString()` throws on it, which took the whole day view down. It ranks against the day
  // rather than inventing an instant it was not given.
  it('does not build an instant from a slot with no clock', () => {
    const clockless = { date: DAY, start: '', end: '' };
    expect(() => shelfForSlot(shelf, clockless, 'UTC', ctx)).not.toThrow();
    expect(
      shelfForSlot(shelf, clockless, 'UTC', ctx)
        .map((r) => r.item.id)
        .sort(),
    ).toEqual(['m-day', 'm-pool']);
  });

  it('still answers when the slot has a start but no end', () => {
    expect(() =>
      shelfForSlot(shelf, { date: DAY, start: '12:00', end: '' }, 'UTC', ctx),
    ).not.toThrow();
  });
});

describe('rankIdeas', () => {
  const places = [
    located('p-lunch', 'מסעדת מון', 0),
    located('p-near', 'קרוב', 200),
    located('p-far', 'רחוק', 4000),
  ];
  const stops = [{ name: 'מסעדת מון', at: LUNCH }];
  const withPlace = (id: string, placeId?: string, targetDate?: string): MaybeItem =>
    ({
      id,
      tripId: 't',
      title: id,
      consumed: false,
      placeId,
      targetDate,
      createdAt: `2026-07-0${id.length}`,
    }) as MaybeItem;

  it('brings the nearest idea to the front of a pool it was buried in', () => {
    const pool = [withPlace('faraway', 'p-far'), withPlace('close', 'p-near')];
    expect(rankIdeas(pool, places, DAY, stops).map((r) => r.item.id)).toEqual(['close', 'faraway']);
  });

  it('keeps ADR-0116 §2’s partition: a dateless idea still leads one aimed elsewhere', () => {
    const pool = [withPlace('aimed', 'p-near', '2026-07-24'), withPlace('open', 'p-far')];
    expect(rankIdeas(pool, places, DAY, stops).map((r) => r.item.id)).toEqual(['open', 'aimed']);
  });

  it('attaches a reason to every idea (ADR-0151 §8)', () => {
    const pool = [withPlace('a', 'p-near'), withPlace('b')];
    for (const r of rankIdeas(pool, places, DAY, stops)) expect(r.reason.code).toBeTruthy();
  });

  it('caps to `limit` when one is given — what the gap sheet and the strip spend', () => {
    const pool = ['a', 'b', 'c'].map((id) => withPlace(id));
    expect(rankIdeas(pool, places, DAY, stops, 2)).toHaveLength(2);
  });

  // The strip's whole point after §5: forty ideas and five ideas produce the same
  // number of cards, so swipes-to-last stops growing with N.
  it('holds the strip’s cap however large the pool gets, and reports the tail', () => {
    const big = Array.from({ length: 40 }, (_, i) => withPlace(`m${i}`));
    const small = Array.from({ length: 7 }, (_, i) => withPlace(`m${i}`));
    const shown = (pool: MaybeItem[]) => rankIdeas(pool, places, DAY, stops, SHELF_POOL_CAP).length;
    expect(shown(big)).toBe(SHELF_POOL_CAP);
    expect(shown(big)).toBe(shown(small));
    expect(big.length - shown(big)).toBe(35);
  });

  it('shows the whole pool, and no tail, below the cap', () => {
    const pool = ['a', 'b'].map((id) => withPlace(id));
    const ranked = rankIdeas(pool, places, DAY, stops, SHELF_POOL_CAP);
    expect(ranked).toHaveLength(2);
    expect(pool.length - ranked.length).toBe(0);
  });

  it('ranks with no stops at all, which is the offline / no-places day', () => {
    const pool = [withPlace('a', 'p-near'), withPlace('b', 'p-far')];
    expect(rankIdeas(pool, places, DAY, []).map((r) => r.item.id)).toHaveLength(2);
  });
});

describe('the reason, in Hebrew', () => {
  const places = [located('p-lunch', 'מסעדת מון', 0), located('p-near', 'קרוב', 300)];
  const stops = [{ name: 'מסעדת מון', at: LUNCH }];
  const only = (m: MaybeItem) => rankIdeas([m], places, DAY, stops)[0];

  it('names the distance and the stop', () => {
    const r = only({
      id: 'a',
      tripId: 't',
      title: 'a',
      consumed: false,
      placeId: 'p-near',
    } as MaybeItem);
    expect(withoutBidiControls(reasonText(r.reason, DAY))).toBe('300 מ׳ ממסעדת מון');
  });

  it('names the day an idea is aimed at', () => {
    const r = only({
      id: 'a',
      tripId: 't',
      title: 'a',
      consumed: false,
      targetDate: '2026-07-21',
    } as MaybeItem);
    expect(reasonText(r.reason, DAY)).toBe('מכוון למחר');
  });

  it('says recency when there is nothing else true to say', () => {
    const r = only({ id: 'a', tripId: 't', title: 'a', consumed: false } as MaybeItem);
    expect(reasonText(r.reason, DAY)).toBe('נוסף לאחרונה');
  });

  // The tile is 140px and its one line is what bought its height: the full sentence
  // wraps to two there, which costs exactly the 8px the tile was drawn to save. So
  // the strip states the fact alone and the full-width sheet row names the stop.
  describe('tileReasonText — the same reason at tile width', () => {
    it('states the distance alone, without the stop the sentence names', () => {
      const r = only({
        id: 'a',
        tripId: 't',
        title: 'a',
        consumed: false,
        placeId: 'p-near',
      } as MaybeItem);
      expect(withoutBidiControls(tileReasonText(r.reason, DAY)!)).toBe('300 מ׳');
    });

    it('states the day alone, which is what the shipped pool card already said', () => {
      const r = only({
        id: 'a',
        tripId: 't',
        title: 'a',
        consumed: false,
        targetDate: '2026-07-21',
      } as MaybeItem);
      expect(tileReasonText(r.reason, DAY)).toBe('מחר');
    });

    it('spends no line on recency — on a strip that is chrome, not a fact', () => {
      const r = only({ id: 'a', tripId: 't', title: 'a', consumed: false } as MaybeItem);
      expect(tileReasonText(r.reason, DAY)).toBeUndefined();
    });
  });

  // The day's OWN group states a distance or nothing — the day an idea is aimed at
  // would only repeat the day you are looking at (ADR-0116 §2).
  it('stopReasonText gives the distance, and nothing for the other reasons', () => {
    const near = only({
      id: 'a',
      tripId: 't',
      title: 'a',
      consumed: false,
      placeId: 'p-near',
    } as MaybeItem);
    expect(withoutBidiControls(stopReasonText(near.reason)!)).toBe('300 מ׳');
    const aimed = only({
      id: 'b',
      tripId: 't',
      title: 'b',
      consumed: false,
      targetDate: '2026-07-21',
    } as MaybeItem);
    expect(stopReasonText(aimed.reason)).toBeUndefined();
    expect(stopReasonText(undefined)).toBeUndefined();
  });
});
