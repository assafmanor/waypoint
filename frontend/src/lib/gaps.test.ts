import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { gapBetween } from './gaps';

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
