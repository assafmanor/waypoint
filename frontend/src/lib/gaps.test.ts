import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { gapBetween, nextSlot } from './gaps';

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
});
