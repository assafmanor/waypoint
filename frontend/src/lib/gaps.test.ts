import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import {
  GAP_MIN_MINUTES,
  earnsChip,
  freeAfterLast,
  freeBeforeFirst,
  freeBetween,
  freeWholeDay,
  gapAfterLast,
  gapBeforeFirst,
  gapBetween,
  nextSlot,
} from './gaps';

const TZ = 'Asia/Tokyo';
const NOW = '2026-07-01T00:00:00Z';
// Times are +09:00 wall-clock on the day; endsAt optional (start-only events).
const ev = (id: string, start: string, end?: string): TripEvent => ({
  id,
  tripId: 't1',
  date: '2026-07-07',
  title: id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  startsAt: `2026-07-07T${start}:00+09:00`,
  endsAt: end ? `2026-07-07T${end}:00+09:00` : undefined,
  sortOrder: 1,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

describe('gapBetween', () => {
  it('surfaces a gap between start-only events (the screenshot bug)', () => {
    // 11:12 → 19:10 with no end time on the first event: still a gap.
    const gap = gapBetween(ev('lunch', '11:12'), ev('dinner', '19:10'), TZ);
    expect(gap).not.toBeNull();
    expect(gap!.minutes).toBe(478);
    // Prefill is a 1h block at the gap start, not the whole 8h gap.
    expect(gap!.fill).toEqual({ date: '2026-07-07', start: '11:12', end: '12:12' });
  });

  it('measures from the end time when the earlier event has one, capping the fill', () => {
    const gap = gapBetween(ev('a', '10:00', '12:00'), ev('b', '14:30'), TZ);
    expect(gap!.minutes).toBe(150);
    expect(gap!.fill.start).toBe('12:00');
    expect(gap!.fill.end).toBe('13:00'); // 1h block, not the 2.5h gap
  });

  it('fills exactly a gap shorter than the default block', () => {
    // 60-min gap (= threshold): fill the whole thing, not start+60 overshoot.
    const gap = gapBetween(ev('a', '10:00'), ev('b', '11:00'), TZ);
    expect(gap!.fill.end).toBe('11:00');
  });

  it('returns null below the threshold', () => {
    expect(gapBetween(ev('a', '10:00', '11:30'), ev('b', '12:00'), TZ)).toBeNull(); // 30 min
  });

  it('returns null when the next event has no start time', () => {
    const untimed = { ...ev('b', '00:00'), startsAt: undefined };
    expect(gapBetween(ev('a', '10:00'), untimed, TZ)).toBeNull();
  });
});

const DATE = '2026-07-07';
const untimed = (id: string): TripEvent => ({ ...ev(id, '00:00'), startsAt: undefined });

// The day's edges: free time with an event on ONE side only, which gapBetween
// structurally cannot see (session-123).
describe('gapBeforeFirst', () => {
  it('runs from the day window to the first event, hugging it', () => {
    // 07:00 → 10:00 free; the prefill is the hour BEFORE the tour, not the hour
    // after breakfast — "before this" is the whole gesture.
    const gap = gapBeforeFirst([ev('tour', '10:00'), ev('dinner', '19:00')], DATE, TZ);
    expect(gap!.minutes).toBe(180);
    expect(gap!.fill).toEqual({ date: DATE, start: '09:00', end: '10:00' });
  });

  it('fills exactly a gap shorter than the default block', () => {
    const gap = gapBeforeFirst([ev('a', '08:00')], DATE, TZ);
    expect(gap!.minutes).toBe(60);
    expect(gap!.fill).toEqual({ date: DATE, start: '07:00', end: '08:00' });
  });

  it('returns null when the day starts too early to leave room', () => {
    expect(gapBeforeFirst([ev('early', '07:30')], DATE, TZ)).toBeNull(); // 30 min
    expect(gapBeforeFirst([ev('sharp', '07:00')], DATE, TZ)).toBeNull(); // none at all
  });

  it('measures from midnight when the first event beats the day window', () => {
    // A 05:30 flight: the small hours in front of it are exactly when "add the taxi
    // before this" gets asked, so the window is a floor, not a wall.
    const gap = gapBeforeFirst([ev('flight', '05:30')], DATE, TZ);
    expect(gap!.minutes).toBe(330);
    expect(gap!.fill).toEqual({ date: DATE, start: '04:30', end: '05:30' });
  });

  it('reads the earliest start, not the first row', () => {
    const gap = gapBeforeFirst([ev('late', '18:00'), ev('early', '09:00')], DATE, TZ);
    expect(gap!.fill.end).toBe('09:00');
  });

  it('returns null with nothing timed to hang off', () => {
    expect(gapBeforeFirst([], DATE, TZ)).toBeNull();
    expect(gapBeforeFirst([untimed('idea')], DATE, TZ)).toBeNull();
  });
});

describe('gapAfterLast', () => {
  it('runs from the last event to the end of the day, hugging it', () => {
    const gap = gapAfterLast([ev('a', '09:00'), ev('b', '19:00', '20:00')], DATE, TZ);
    expect(gap!.minutes).toBe(239); // 20:00 → 23:59
    // The same slot the foot-of-the-day add button offers.
    expect(gap!.fill).toEqual(nextSlot([ev('a', '09:00'), ev('b', '19:00', '20:00')], DATE, TZ));
    expect(gap!.fill).toEqual({ date: DATE, start: '20:00', end: '21:00' });
  });

  it('uses the latest end, not the last-by-start row', () => {
    const gap = gapAfterLast(
      [ev('long', '10:00', '16:00'), ev('short', '12:00', '13:00')],
      DATE,
      TZ,
    );
    expect(gap!.fill.start).toBe('16:00');
  });

  it('returns null when the day is already full to the small hours', () => {
    expect(gapAfterLast([ev('late', '22:00', '23:15')], DATE, TZ)).toBeNull(); // 44 min
  });

  it('returns null when the last event runs past midnight (ADR-0037 overnight)', () => {
    const club = { ...ev('club', '23:00'), endsAt: '2026-07-08T02:00:00+09:00' };
    expect(gapAfterLast([club], DATE, TZ)).toBeNull();
  });

  it('returns null with nothing timed to hang off', () => {
    expect(gapAfterLast([], DATE, TZ)).toBeNull();
    expect(gapAfterLast([untimed('idea')], DATE, TZ)).toBeNull();
  });
});

describe('nextSlot', () => {
  it('defaults an empty day to a 07:00 block (DAY_WINDOW.START_HOUR)', () => {
    expect(nextSlot([], '2026-07-07', TZ)).toEqual({
      date: '2026-07-07',
      start: '07:00',
      end: '08:00',
    });
  });

  it('starts a 1h block right after the last event ends', () => {
    const slot = nextSlot([ev('a', '10:00', '12:00'), ev('b', '13:00', '14:30')], '2026-07-07', TZ);
    expect(slot).toEqual({ date: '2026-07-07', start: '14:30', end: '15:30' });
  });

  it('uses the latest end, not the last-by-start row (overlapping blocks)', () => {
    // A long block ends after a later-starting short one — free time begins at
    // the max end (16:00), not the tail row's end (13:00).
    const slot = nextSlot(
      [ev('long', '10:00', '16:00'), ev('short', '12:00', '13:00')],
      '2026-07-07',
      TZ,
    );
    expect(slot.start).toBe('16:00');
    expect(slot.end).toBe('17:00');
  });

  it('treats a start-only last event as its start instant', () => {
    const slot = nextSlot([ev('a', '09:00', '10:00'), ev('b', '18:30')], '2026-07-07', TZ);
    expect(slot.start).toBe('18:30');
    expect(slot.end).toBe('19:30');
  });

  it('clamps the end to 23:59 when the last event ends late (no midnight spill)', () => {
    // Last event ends 23:15 → a naive +1h end (00:15) would cross midnight and
    // read as a 23h duration in the same-day-only picker (ADR-0036).
    const slot = nextSlot([ev('late', '22:00', '23:15')], '2026-07-07', TZ);
    expect(slot.start).toBe('23:15');
    expect(slot.end).toBe('23:59');
  });

  it('drops the end when the start leaves no room before midnight (start-only)', () => {
    const slot = nextSlot([ev('latest', '23:00', '23:59')], '2026-07-07', TZ);
    expect(slot.start).toBe('23:59');
    expect(slot.end).toBe('');
  });

  it('clamps to 23:59 when the last event runs past midnight (ADR-0037 overnight)', () => {
    // Club 23:00 → 02:00 next morning: the day is full, so the prefill stays on
    // this day (23:59 start-only) rather than reading the 02:00 end as a slot.
    const club = { ...ev('club', '23:00'), endsAt: '2026-07-08T02:00:00+09:00' };
    const slot = nextSlot([club], '2026-07-07', TZ);
    expect(slot.start).toBe('23:59');
    expect(slot.end).toBe('');
  });
});

// ══ ADR-0161 §2: the same derivation below the chip threshold is a SEAM, and it is what
// makes a position exist between EVERY pair of rows. `gapBetween` is `freeBetween` plus
// `earnsChip`, so these tests are about the pair rather than about a second function.
describe('freeBetween (unfloored: the seam half of a position)', () => {
  it('answers zero for two rows that touch, where gapBetween answers nothing', () => {
    const a = ev('a', '09:00', '10:00');
    const b = ev('b', '10:00', '11:00');
    const free = freeBetween(a, b, TZ)!;
    expect(free.minutes).toBe(0);
    expect(earnsChip(free)).toBe(false);
    // The position before ADR-0161: inexpressible.
    expect(gapBetween(a, b, TZ)).toBeNull();
  });

  it('answers below the threshold, where gapBetween still answers nothing', () => {
    const free = freeBetween(ev('a', '09:00', '10:00'), ev('b', '10:30'), TZ)!;
    expect(free.minutes).toBe(GAP_MIN_MINUTES / 2);
    expect(earnsChip(free)).toBe(false);
    expect(gapBetween(ev('a', '09:00', '10:00'), ev('b', '10:30'), TZ)).toBeNull();
  });

  it('offers a droppable slot at the position even with no free time in it', () => {
    // The whole point: a seam is a DROP TARGET, so it must carry a real slot.
    const free = freeBetween(ev('a', '09:00', '10:00'), ev('b', '10:00'), TZ)!;
    expect(free.fill.date).toBe(DATE);
    expect(free.fill.start).toBe('10:00');
    expect(free.fill.end).toBe('11:00'); // the default block, uncapped by a gap
  });

  it('agrees with gapBetween above the threshold — one derivation, one answer', () => {
    const a = ev('a', '09:00', '10:00');
    const b = ev('b', '13:00');
    expect(freeBetween(a, b, TZ)).toEqual(gapBetween(a, b, TZ));
  });

  it('still needs two clock times to describe a position at all', () => {
    expect(freeBetween(untimed('a'), ev('b', '10:00'), TZ)).toBeNull();
    expect(freeBetween(ev('a', '09:00'), untimed('b'), TZ)).toBeNull();
  });
});

describe('the day edges, unfloored', () => {
  it('reports a sub-threshold head as its real minutes rather than as nothing', () => {
    // The window opens at DAY_WINDOW.START_HOUR (07:00), so a first event at 07:30
    // leaves 30 minutes in front of it: a position, but not a chip's worth.
    const day = [ev('first', '07:30', '10:30')];
    const free = freeBeforeFirst(day, DATE, TZ)!;
    expect(free.minutes).toBe(30);
    expect(earnsChip(free)).toBe(false);
    expect(gapBeforeFirst(day, DATE, TZ)).toBeNull();
    expect(free.fill.end).toBe('07:30'); // still hugs the first event
  });

  it('reports a full day as a zero-minute tail, so the seam after the last row exists', () => {
    const day = [ev('late', '22:00', '23:59')];
    const free = freeAfterLast(day, DATE, TZ)!;
    expect(free.minutes).toBe(0);
    expect(earnsChip(free)).toBe(false);
    expect(gapAfterLast(day, DATE, TZ)).toBeNull();
  });

  // The e2e fixture's own day (first event at 07:00, the window's opening) is exactly this,
  // which is how it was found: the head seam existed and offered nowhere to land.
  it('offers a real block at a head with no room, rather than a zero-length slot', () => {
    const day = [ev('dawn', '07:00', '08:00')];
    const free = freeBeforeFirst(day, DATE, TZ)!;
    expect(free.minutes).toBe(0);
    expect(earnsChip(free)).toBe(false);
    expect(free.fill.start).toBe('07:00');
    expect(free.fill.end).toBe('08:00'); // a default block, not start === end
  });

  it('has no edge position at all on an untimed-only day', () => {
    expect(freeBeforeFirst([untimed('a')], DATE, TZ)).toBeNull();
    expect(freeAfterLast([untimed('a')], DATE, TZ)).toBeNull();
  });
});

// ADR-0161 §2, extended: three kinds of day can hang a position off nothing timed, and all
// three used to accept a drop nowhere at all.
describe('freeWholeDay (the day itself as a position)', () => {
  it('reads as a chip, not a seam — an empty day has all its time free', () => {
    const free = freeWholeDay(DATE, TZ);
    expect(earnsChip(free)).toBe(true);
  });

  it('offers the day’s own opening, the same slot the foot-of-day add button does', () => {
    expect(freeWholeDay(DATE, TZ).fill).toEqual(nextSlot([], DATE, TZ));
  });

  // The three days it exists for. Each renders rows (or an empty state) and each answers
  // null at BOTH edges, which is what left them with nowhere to drop.
  it('covers the days whose edges answer nothing', () => {
    for (const day of [[], [untimed('a')], [untimed('a'), untimed('b')]]) {
      expect(freeBeforeFirst(day, DATE, TZ)).toBeNull();
      expect(freeAfterLast(day, DATE, TZ)).toBeNull();
    }
    // …and the whole-day position always answers.
    expect(freeWholeDay(DATE, TZ).fill.start).toBe('07:00');
  });
});
