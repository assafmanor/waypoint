import { describe, expect, it } from 'vitest';
import { EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { dayProgress, deriveNow, formatTime, hardConflicts, minutesUntil, shiftIso } from './time';
import { DEMO_NOW, EVENTS, TRIP } from '../fixtures';

const tz = TRIP.timezone;
const startsOf = (id: string) => EVENTS.find((e) => e.id === id)!.startsAt!;

describe('deriveNow', () => {
  it('picks the in-progress soft block as now and the next planned event', () => {
    const { now, next } = deriveNow(EVENTS, DEMO_NOW);
    expect(now?.id).toBe('ev-shinjuku');
    expect(next?.id).toBe('ev-ichiran');
  });

  it('skips done/skipped events when choosing next', () => {
    const withoutIchiran = EVENTS.map((e) =>
      e.id === 'ev-ichiran' ? { ...e, status: EVENT_STATUS.SKIPPED } : e,
    );
    expect(deriveNow(withoutIchiran, DEMO_NOW).next?.id).toBe('ev-goldengai');
  });

  it('returns no now during a gap between events', () => {
    const gap = new Date('2026-07-07T21:15:00+09:00'); // after Ichiran ends, before Golden Gai
    const { now, next } = deriveNow(EVENTS, gap);
    expect(now).toBeUndefined();
    expect(next?.id).toBe('ev-goldengai');
  });
});

describe('countdown + progress at the demo instant (18:52 JST)', () => {
  it('counts 38 minutes to Ichiran at 19:30', () => {
    expect(minutesUntil(startsOf('ev-ichiran'), DEMO_NOW)).toBe(38);
  });

  it('is ~74% through the 07:00–23:00 window', () => {
    expect(Math.round(dayProgress(DEMO_NOW, tz) * 100)).toBe(74);
  });

  it('formats the clock in the trip timezone', () => {
    expect(formatTime(DEMO_NOW, tz)).toBe('18:52');
  });
});

describe('shiftIso', () => {
  it('shifts an instant by whole minutes', () => {
    expect(shiftIso('2026-07-07T19:30:00+09:00', 30)).toBe('2026-07-07T11:00:00.000Z');
  });
});

describe('hardConflicts', () => {
  const shinjuku = EVENTS.find((e) => e.id === 'ev-shinjuku')!;
  const ichiran = EVENTS.find((e) => e.id === 'ev-ichiran')!;

  it('is empty when a soft event only touches the following hard event (no overlap)', () => {
    expect(hardConflicts(shinjuku, EVENTS)).toEqual([]);
  });

  it("flags the hard event once the soft event's end runs past its start", () => {
    const delayed = { ...shinjuku, endsAt: shiftIso(shinjuku.endsAt!, 30) };
    expect(hardConflicts(delayed, EVENTS).map((e) => e.id)).toEqual(['ev-ichiran']);
  });

  it('ignores overlap between two soft events', () => {
    const a: TripEvent = {
      ...shinjuku,
      id: 'x-a',
      startsAt: '2026-07-07T10:00:00+09:00',
      endsAt: '2026-07-07T11:00:00+09:00',
    };
    const b: TripEvent = {
      ...shinjuku,
      id: 'x-b',
      startsAt: '2026-07-07T10:30:00+09:00',
      endsAt: '2026-07-07T11:30:00+09:00',
    };
    expect(hardConflicts(a, [a, b])).toEqual([]);
  });

  it('returns nothing for a hard event itself', () => {
    expect(hardConflicts(ichiran, EVENTS)).toEqual([]);
  });
});
