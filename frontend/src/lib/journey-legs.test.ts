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
    const next = withMomentTime(TWO_LEGS, 1, 'arrive', '20:05', 0);
    expect(next[0]).toEqual({ start: '2026-08-12T15:30', end: '2026-08-12T20:05' });
    expect(next[1]).toEqual(TWO_LEGS[1]);
  });

  it('writes an interior departure to the NEXT leg’s start', () => {
    const next = withMomentTime(TWO_LEGS, 1, 'depart', '23:55', 0);
    expect(next[1]).toEqual({ start: '2026-08-12T23:55', end: '2026-08-13T02:20' });
    expect(next[0]).toEqual(TWO_LEGS[0]);
  });

  it('writes node 0’s departure to the first leg’s start', () => {
    expect(withMomentTime(TWO_LEGS, 0, 'depart', '16:00', 0)[0].start).toBe('2026-08-12T16:00');
  });

  it('lands the day the CALLER resolved, so this module never decides one', () => {
    // §2's derivation owns the offset; the adapter only writes where it is told.
    expect(withMomentTime(TWO_LEGS, 2, 'arrive', '01:00', 1)[1].end).toBe('2026-08-13T01:00');
    expect(withMomentTime(TWO_LEGS, 2, 'arrive', '01:00', 2)[1].end).toBe('2026-08-14T01:00');
  });

  it('holds a clock dateless until the journey has a date', () => {
    const empty: LegTimes[] = [{ start: '', end: '' }];
    expect(withMomentTime(empty, 1, 'arrive', '20:40', 0)[0].end).toBe('');
  });

  it('ignores a node index the journey does not have', () => {
    expect(withMomentTime(TWO_LEGS, 9, 'arrive', '20:05', 0)).toEqual(TWO_LEGS);
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
