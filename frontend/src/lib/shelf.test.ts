import { describe, expect, it } from 'vitest';
import {
  SUGGESTION_REASON,
  EVENT_KIND,
  iconForCategory,
  EVENT_SOURCE,
  EVENT_STATUS,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import {
  dayStops,
  ideaCategory,
  ideaGlyph,
  poolStrip,
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
import { DEFAULT_MAYBE_ICON, SHELF_POOL_CAP } from '../constants';

const DAY = '2026-07-20';
// `reasonText`/`tileReasonText` name a day through `dayLabel` now: a window containing the
// anchor keeps the trip LIVE, which is the relative phrasing these cases assert.
const naming = (day: string) => ({
  trip: { startDate: '2026-07-01', endDate: '2026-07-31' },
  today: day,
  anchor: day,
});

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
      const line = withoutBidiControls(tileReasonText(reason, naming(DAY_1))!);
      expect(line).toContain('300');
      expect(line).not.toContain('מוזיאון אדו');
    });

    it('the sheet says all three', () => {
      const line = withoutBidiControls(reasonText(reason, naming(DAY_1)));
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
    const { ideas, dropped } = shelfForSlot(shelf, slot, 'UTC', ctx);
    expect(ideas.map((r) => r.item.id).sort()).toEqual(['m-day', 'm-pool']);
    // Nothing measured, so nothing refused — every caller before ADR-0216 (§D4).
    expect(dropped).toBe(0);
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
        .ideas.map((r) => r.item.id)
        .sort(),
    ).toEqual(['m-day', 'm-pool']);
  });

  it('still answers when the slot has a start but no end', () => {
    expect(() =>
      shelfForSlot(shelf, { date: DAY, start: '12:00', end: '' }, 'UTC', ctx),
    ).not.toThrow();
  });
});

// ── AN IDEA YOU CANNOT REACH IS NOT OFFERED (ADR-0216) ────────────────────────────────────
//
// Owner, off the shipped sheet: _"Maybe unfeasible suggestions should be dropped entirely (too
// far, not enough time)."_ The screenshot offered a glacier lagoon ⁦182 ק״מ⁩ away for a one-hour
// hole, because proximity past `FAR_M` scores zero for everything and the order fell back to
// recency — nothing was wrong with the ranking, and nothing had ever asked whether you could go.
describe('shelfForSlot — the slot refuses what it cannot hold', () => {
  /** Both of the slot's neighbours at the SAME point, so a detour is a clean there-and-back and
   *  the round trip is exactly twice the one leg. That is what makes §2's argument testable. */
  const places = [
    located('p-stop', 'העצירה', 0),
    located('p-near', 'קרוב', 20_000),
    located('p-far', 'רחוק', 60_000),
    located('p-both-legs', 'שני הצדדים', 56_000),
    place('p-lite', 'מקום בלי נקודה'),
  ];
  const events = [
    at('before', '09:00', 'p-stop', { endsAt: `${DAY}T10:00:00.000Z` }),
    at('after', '15:00', 'p-stop'),
  ];
  const ctx = { events, bookings: [], places };
  const slot = { date: DAY, start: '12:00', end: '13:00' };
  const shelfOf = (...ids: string[]) => ({
    forDay: [],
    pool: ids.map((id) => withPlaceAt(id, id.replace('m-', 'p-'))),
  });
  // `createdAt` is not decoration: past `FAR_M` every idea scores zero, so the ranking's tiebreak
  // is the only thing ordering these — which is the report's own root cause, asserted here by the
  // fixture needing it at all.
  const withPlaceAt = (id: string, placeId: string): MaybeItem =>
    ({
      id,
      tripId: 't',
      title: id,
      consumed: false,
      placeId,
      createdAt: '2026-07-01',
    }) as MaybeItem;
  /** ⁦65⁩ free minutes, the reported hole once §AY corrects it: ⁦15⁩ owed to being there and ⁦50⁩ to
   *  driving, which at ⁦130 km/h⁩ is ⁦108 ק״מ⁩ of crow round trip. */
  const FREE = 65;

  it('offers what fits and drops what does not', () => {
    const { ideas, dropped } = shelfForSlot(shelfOf('m-near', 'm-far'), slot, 'UTC', ctx, FREE);
    expect(ideas.map((r) => r.item.id)).toEqual(['m-near']);
    expect(dropped).toBe(1);
  });

  // **The round trip, not the distance** (§2) — and this is the case the ADR names: the ⁦56 ק״מ⁩
  // idea is comfortable one way (⁦26⁩ minutes of the ⁦50⁩ available) and impossible there and back.
  // Measuring the one leg the reason line already prints would keep it.
  it('counts both legs, which is how a comfortable errand becomes an impossible one', () => {
    const { ideas, dropped } = shelfForSlot(shelfOf('m-both-legs'), slot, 'UTC', ctx, FREE);
    expect(ideas).toEqual([]);
    expect(dropped).toBe(1);
  });

  // **And there has to be time to BE there** (§2, `FREE_TIME_MIN_MINUTES`). ⁦5 ק״מ⁩ each way is
  // under five minutes of driving inside a ⁦19⁩-minute window — reachable, and not a visit.
  it('drops an idea it could reach and not stay at', () => {
    const closer = [...places, located('p-close', 'ממש קרוב', 5_000)];
    const { ideas, dropped } = shelfForSlot(
      shelfOf('m-close'),
      slot,
      'UTC',
      { ...ctx, places: closer },
      19,
    );
    expect(ideas).toEqual([]);
    expect(dropped).toBe(1);
  });

  // §D4 read from the other end: **nothing is dropped on an absence.** Three ways to have none.
  it('keeps an idea whose place has no coordinates', () => {
    const { ideas, dropped } = shelfForSlot(shelfOf('m-lite'), slot, 'UTC', ctx, FREE);
    expect(ideas.map((r) => r.item.id)).toEqual(['m-lite']);
    expect(dropped).toBe(0);
  });

  it('keeps everything when the slot has no located neighbour to leave from', () => {
    const unlocated = { ...ctx, events: [at('before', '09:00'), at('after', '15:00')] };
    const { ideas, dropped } = shelfForSlot(
      shelfOf('m-near', 'm-far'),
      slot,
      'UTC',
      unlocated,
      FREE,
    );
    expect(ideas.map((r) => r.item.id).sort()).toEqual(['m-far', 'm-near']);
    expect(dropped).toBe(0);
  });

  it('keeps everything when nothing said what is free', () => {
    const { ideas, dropped } = shelfForSlot(shelfOf('m-near', 'm-far'), slot, 'UTC', ctx);
    expect(ideas.map((r) => r.item.id).sort()).toEqual(['m-far', 'm-near']);
    expect(dropped).toBe(0);
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

  // **Field report #40's second cause** (ADR-0116's 2026-08-11 amendment). Reproduced on a
  // real stack before it was written down: fourteen undated ideas, a Map add 7km from the
  // day's stops, and the only thing that moved was the tail count.
  describe('poolStrip — the pin the cap made necessary', () => {
    const ctx = { places, date: DAY, stops, days: [] };
    // Five ideas nearer the day than the sixth, which is the shape that buries a new one.
    const near = ['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => withPlace(id, 'p-near'));
    const strip = (pool: MaybeItem[], justAdded?: string) =>
      poolStrip(pool, ctx, { justAdded, limit: SHELF_POOL_CAP });

    it('holds the idea you just added at the head, past a full cap of better-ranked ones', () => {
      const pool = [...near, withPlace('justAdded', 'p-far')];
      expect(strip(pool).strip.map((r) => r.item.id)).not.toContain('justAdded');
      expect(strip(pool, 'justAdded').strip.map((r) => r.item.id)[0]).toBe('justAdded');
    });

    it('spends a ranked slot on the pin rather than widening the strip', () => {
      const pool = [...near, withPlace('justAdded', 'p-far')];
      const pinned = strip(pool, 'justAdded');
      expect(pinned.strip).toHaveLength(SHELF_POOL_CAP);
      expect(pinned.tail).toBe(pool.length - SHELF_POOL_CAP);
      // The fifth-ranked idea is what moved into the tail — not the first.
      expect(pinned.strip.map((r) => r.item.id)).not.toContain('n5');
      expect(pinned.strip.map((r) => r.item.id)).toContain('n1');
    });

    it('carries the pinned idea’s own reason, so its tile still says why', () => {
      const pool = [...near, withPlace('justAdded', 'p-near')];
      expect(strip(pool, 'justAdded').strip[0].reason.code).toBeTruthy();
    });

    it('does not reorder an idea that already ranked into view', () => {
      const pool = [...near];
      expect(strip(pool, 'n3').strip.map((r) => r.item.id)[0]).toBe('n3');
      expect(strip(pool, 'n3').strip).toHaveLength(SHELF_POOL_CAP);
    });

    // Every way the pin is meant to end: the idea leaves the pool (scheduled, removed,
    // aimed at this day) and the id simply stops matching. No caller clears one.
    it('is a no-op once the pinned idea has left the pool', () => {
      const pool = [...near];
      expect(strip(pool, 'gone').strip.map((r) => r.item.id)).toEqual(
        strip(pool).strip.map((r) => r.item.id),
      );
    });

    it('leaves the cap and the tail exactly where they were with no pin', () => {
      const big = Array.from({ length: 40 }, (_, i) => withPlace(`m${i}`));
      const { strip: shown, tail } = strip(big);
      expect(shown).toHaveLength(SHELF_POOL_CAP);
      expect(tail).toBe(35);
    });
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
    expect(withoutBidiControls(reasonText(r.reason, naming(DAY)))).toBe('300 מ׳ ממסעדת מון');
  });

  it('names the day an idea is aimed at', () => {
    const r = only({
      id: 'a',
      tripId: 't',
      title: 'a',
      consumed: false,
      targetDate: '2026-07-21',
    } as MaybeItem);
    expect(reasonText(r.reason, naming(DAY))).toBe('מכוון למחר');
  });

  it('says recency when there is nothing else true to say', () => {
    const r = only({ id: 'a', tripId: 't', title: 'a', consumed: false } as MaybeItem);
    expect(reasonText(r.reason, naming(DAY))).toBe('נוסף לאחרונה');
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
      expect(withoutBidiControls(tileReasonText(r.reason, naming(DAY))!)).toBe('300 מ׳');
    });

    it('states the day alone, which is what the shipped pool card already said', () => {
      const r = only({
        id: 'a',
        tripId: 't',
        title: 'a',
        consumed: false,
        targetDate: '2026-07-21',
      } as MaybeItem);
      expect(tileReasonText(r.reason, naming(DAY))).toBe('מחר');
    });

    it('spends no line on recency — on a strip that is chrome, not a fact', () => {
      const r = only({ id: 'a', tripId: 't', title: 'a', consumed: false } as MaybeItem);
      expect(tileReasonText(r.reason, naming(DAY))).toBeUndefined();
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

// ─────────────────────────────────────────────────────────────────────────────
// **What an idea READS as** (owner, 2026-08-20: _"maybe items added from the map don't
// inherit the place category and icon"_). The map is where ideas come from — every place
// added outside an errand becomes one — and the category is picked on the PLACE, so the
// idea it created carried nothing and showed the shelf's own `💡`.

describe('ideaCategory / ideaGlyph', () => {
  const bare = (over: Partial<MaybeItem>): MaybeItem =>
    ({ id: 'm', tripId: 't', title: 'רעיון', consumed: false, ...over }) as MaybeItem;
  const categorised = { ...place('p-food', 'רמן נאגי'), category: 'food' } as Place;
  const picked = { ...categorised, icon: '🍜' } as Place;

  it('falls back to the place, and to the shelf default when nothing knows anything', () => {
    const places = [categorised];
    expect(ideaCategory(bare({ placeId: 'p-food' }), places)).toBe('food');
    expect(ideaGlyph(bare({ placeId: 'p-food' }), places)).toBe(iconForCategory('food'));
    expect(ideaCategory(bare({}), places)).toBeUndefined();
    expect(ideaGlyph(bare({}), places)).toBe(DEFAULT_MAYBE_ICON);
  });

  it("a placeholder glyph does not shadow the place's category", () => {
    // The whole icon half of the report: `verbs.addMaybe` stores `💡` when no glyph was
    // PICKED, and reading the column alone let that default outrank a category that says
    // what the thing is — the `chosenIcon` rule, one entity over.
    const item = bare({ placeId: 'p-food', icon: DEFAULT_MAYBE_ICON });
    expect(ideaGlyph(item, [categorised])).toBe(iconForCategory('food'));
  });

  it('prefers a pick at the nearest scope: the idea, then the place, then the category', () => {
    expect(ideaGlyph(bare({ placeId: 'p-food', icon: '🍣' }), [picked])).toBe('🍣');
    expect(ideaGlyph(bare({ placeId: 'p-food' }), [picked])).toBe('🍜');
    expect(ideaGlyph(bare({ placeId: 'p-food' }), [categorised])).toBe(iconForCategory('food'));
  });

  it("the idea's own category wins, and a missing place changes nothing", () => {
    expect(ideaCategory(bare({ placeId: 'p-food', category: 'sightseeing' }), [categorised])).toBe(
      'sightseeing',
    );
    expect(ideaCategory(bare({ placeId: 'p-gone' }), [categorised])).toBeUndefined();
    expect(ideaGlyph(bare({ placeId: 'p-gone' }), [categorised])).toBe(DEFAULT_MAYBE_ICON);
  });
});
