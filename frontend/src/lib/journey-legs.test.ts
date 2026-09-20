// **The adapter that keeps the save path whole** (ADR-0203 §1/§3). What is worth pinning is
// the round trip: a view read out of legs and written back must not move anything the user
// did not touch, because everything downstream of the schedule — the seed, the zone patches,
// the note host, the refusal names — reads those legs.
import { describe, expect, it } from 'vitest';
import type { LegTimes } from './booking-draft';
import {
  journeyViewOf,
  withJourneyDate,
  withMomentDayOffset,
  withMomentTime,
  withResolvedDays,
} from './journey-legs';

/** TLV → AMS → KEF, landing after midnight: the shape every interesting case needs. */
const TWO_LEGS: LegTimes[] = [
  { start: '2026-08-12T15:30', end: '2026-08-12T19:40' },
  { start: '2026-08-13T00:10', end: '2026-08-13T02:20' },
];

describe('journeyViewOf — one date, and every offset measured from it', () => {
  it('reads the journey date off the first departure', () => {
    expect(journeyViewOf(TWO_LEGS).date).toBe('2026-08-12');
  });

  it('lays the moments out in rail order: depart, arrive, depart, arrive', () => {
    expect(journeyViewOf(TWO_LEGS).moments).toEqual([
      { time: '15:30', dayOffset: 0 },
      { time: '19:40', dayOffset: 0 },
      { time: '00:10', dayOffset: 1 },
      { time: '02:20', dayOffset: 1 },
    ]);
  });

  it('measures every offset from the DATE, not from the moment before it', () => {
    // Both of the last two are `למחרת`, not one of them `+2`. This is §2's rule surviving
    // the round trip through leg storage.
    const offsets = journeyViewOf(TWO_LEGS).moments.map((m) => m.dayOffset);
    expect(offsets).toEqual([0, 0, 1, 1]);
  });

  it('invents no day for a half-filled journey', () => {
    const view = journeyViewOf([{ start: '', end: '' }]);
    expect(view.date).toBe('');
    expect(view.moments.every((m) => m.dayOffset === 0)).toBe(true);
  });

  it('reads a single-leg journey as two moments', () => {
    const view = journeyViewOf([{ start: '2026-08-12T15:30', end: '2026-08-12T20:40' }]);
    expect(view.moments).toHaveLength(2);
  });
});

describe('withJourneyDate — the date is the anchor, so everything moves with it', () => {
  it('carries every moment forward, keeping each offset', () => {
    const moved = withJourneyDate(TWO_LEGS, '2026-08-20');
    expect(moved).toEqual([
      { start: '2026-08-20T15:30', end: '2026-08-20T19:40' },
      { start: '2026-08-21T00:10', end: '2026-08-21T02:20' },
    ]);
    // The whole point: the shape of the journey is unchanged.
    expect(journeyViewOf(moved).moments.map((m) => m.dayOffset)).toEqual([0, 0, 1, 1]);
  });

  it('sets the first departure’s day when the journey had none, inventing nothing else', () => {
    const seeded = withJourneyDate([{ start: '', end: '' }], '2026-08-12');
    expect(seeded).toEqual([{ start: '2026-08-12', end: '' }]);
  });

  it('keeps a clock already typed on the first departure', () => {
    expect(withJourneyDate([{ start: 'T15:30', end: '' }], '2026-08-12')[0].start).toBe(
      '2026-08-12T15:30',
    );
  });
});

describe('withMomentTime — a clock writes to one leg endpoint and nothing else', () => {
  it('writes an arrival to the previous leg’s end', () => {
    const next = withMomentTime(TWO_LEGS, 1, 'arrive', '20:05');
    expect(next[0]).toEqual({ start: '2026-08-12T15:30', end: '2026-08-12T20:05' });
    expect(next[1]).toEqual(TWO_LEGS[1]);
  });

  it('writes an interior departure to the NEXT leg’s start', () => {
    const next = withMomentTime(TWO_LEGS, 1, 'depart', '23:55');
    expect(next[1]).toEqual({ start: '2026-08-12T23:55', end: '2026-08-13T02:20' });
    expect(next[0]).toEqual(TWO_LEGS[0]);
  });

  it('writes node 0’s departure to the first leg’s start', () => {
    expect(withMomentTime(TWO_LEGS, 0, 'depart', '16:00')[0].start).toBe('2026-08-12T16:00');
  });

  it('writes the clock on the journey’s date and decides no day of its own', () => {
    // The day is `withResolvedDays`' answer, over the whole journey — a clock written here
    // is deliberately the journey's date until that runs, and 01:00 after a 00:10 departure
    // is `למחרת` only because the resolution says so, never because this wrote it.
    expect(withMomentTime(TWO_LEGS, 2, 'arrive', '01:00')[1].end).toBe('2026-08-12T01:00');
    expect(
      withResolvedDays(withMomentTime(TWO_LEGS, 2, 'arrive', '01:00'), () => 'UTC')[1].end,
    ).toBe('2026-08-13T01:00');
  });

  it('holds a clock dateless until the journey has a date', () => {
    const empty: LegTimes[] = [{ start: '', end: '' }];
    expect(withMomentTime(empty, 1, 'arrive', '20:40')[0].end).toBe('');
  });

  it('ignores a node index the journey does not have', () => {
    expect(withMomentTime(TWO_LEGS, 9, 'arrive', '20:05')).toEqual(TWO_LEGS);
  });
});

describe('withMomentDayOffset — the override moves a day and keeps the clock', () => {
  it('moves one moment’s day without touching its time or its neighbours', () => {
    const next = withMomentDayOffset(TWO_LEGS, 1, 'arrive', 1);
    expect(next[0].end).toBe('2026-08-13T19:40');
    expect(next[1]).toEqual(TWO_LEGS[1]);
  });

  it('does nothing to a moment that has no clock to move', () => {
    const half: LegTimes[] = [{ start: '2026-08-12T15:30', end: '' }];
    expect(withMomentDayOffset(half, 1, 'arrive', 1)).toEqual(half);
  });

  it('does nothing before the journey has a date to offset from', () => {
    const empty: LegTimes[] = [{ start: '', end: '' }];
    expect(withMomentDayOffset(empty, 1, 'arrive', 1)).toEqual(empty);
  });
});

describe('withResolvedDays — the WHOLE journey is re-derived, not the moment being typed', () => {
  const TLV = 'Asia/Jerusalem';
  const NRT = 'Asia/Tokyo';
  const AMS = 'Europe/Amsterdam';
  const KEF = 'Atlantic/Reykjavik';
  /** A leg endpoint reads in its own POINT's zone (ADR-0107), which is the rule the form's
   *  `legZones` follows: leg `i` departs node `i` and arrives at node `i + 1`. */
  const zones =
    (...nodes: string[]) =>
    (leg: number, edge: 'start' | 'end') =>
      edge === 'start' ? nodes[leg] : nodes[leg + 1];

  it('carries the arrival forward when the departure moves past it', () => {
    // 09:00 in Tel Aviv → 18:00 in Tokyo is a forward, same-day flight…
    const sameDay: LegTimes[] = [{ start: '2026-07-19T09:00', end: '2026-07-19T18:00' }];
    expect(withResolvedDays(sameDay, zones(TLV, NRT))).toEqual(sameDay);
    // …and 23:00 is a clock 18:00 in Tokyo cannot follow on that day, so the arrival is
    // tomorrow. This is the bug the module exists for: the rail drew `למחרת` off exactly
    // this resolution while the leg was still stored as same-day.
    const moved: LegTimes[] = [{ start: '2026-07-19T23:00', end: '2026-07-19T18:00' }];
    expect(withResolvedDays(moved, zones(TLV, NRT))[0].end).toBe('2026-07-20T18:00');
  });

  it('runs on instants, so a westward crossing keeps its calendar day', () => {
    // Tel Aviv 21:00 → Honolulu 09:00 lands EARLIER by the clock and is still the same day.
    const legs: LegTimes[] = [{ start: '2026-07-19T21:00', end: '2026-07-19T09:00' }];
    expect(withResolvedDays(legs, zones(TLV, 'Pacific/Honolulu'))[0].end).toBe('2026-07-19T09:00');
  });

  it('takes every later moment with it, counting each offset from the journey’s date', () => {
    // TLV → AMS → KEF, all typed on one day, then the first departure moves to the evening.
    const legs: LegTimes[] = [
      { start: '2026-08-12T22:00', end: '2026-08-12T19:40' },
      { start: '2026-08-12T21:10', end: '2026-08-12T23:20' },
    ];
    expect(withResolvedDays(legs, zones(TLV, AMS, KEF))).toEqual([
      { start: '2026-08-12T22:00', end: '2026-08-13T19:40' },
      { start: '2026-08-13T21:10', end: '2026-08-13T23:20' },
    ]);
  });

  it('keeps a day a human overrode upward, and drops one the clocks contradict', () => {
    // `+2 ימים` on a leg that could be `למחרת` survives — the stored day is a FLOOR.
    const overridden: LegTimes[] = [{ start: '2026-08-12T22:00', end: '2026-08-14T02:20' }];
    expect(withResolvedDays(overridden, zones(TLV, TLV))).toEqual(overridden);
    // A day that would run the journey backwards does not.
    const backwards: LegTimes[] = [{ start: '2026-08-12T22:00', end: '2026-08-12T02:20' }];
    expect(withResolvedDays(backwards, zones(TLV, TLV))[0].end).toBe('2026-08-13T02:20');
  });

  it('invents no day for a moment with no clock, or a journey with no date', () => {
    const half: LegTimes[] = [{ start: '2026-08-12T22:00', end: '' }];
    expect(withResolvedDays(half, zones(TLV, NRT))).toEqual(half);
    const dateless: LegTimes[] = [{ start: '', end: '' }];
    expect(withResolvedDays(dateless, zones(TLV, NRT))).toEqual(dateless);
  });
});
