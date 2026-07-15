import { describe, expect, it } from 'vitest';
import { EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import {
  addDays,
  clampDate,
  dayProgress,
  deriveNow,
  formatCountdown,
  formatDaysUntil,
  formatTime,
  hardConflicts,
  isoToTimeInput,
  minutesUntil,
  monthLabelFor,
  shiftIso,
  zonedIso,
  resolveEndIso,
  crossesMidnight,
} from './time';
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

describe('addDays', () => {
  it('steps a date string forward and backward', () => {
    expect(addDays('2026-07-13', 1)).toBe('2026-07-14');
    expect(addDays('2026-07-13', -1)).toBe('2026-07-12');
  });

  it('crosses month/year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('monthLabelFor', () => {
  // Mirrors App.tsx's Header day-strip build: each date fed with the previous
  // pill's date (undefined for the first).
  const labelIndices = (dates: string[]) =>
    dates.flatMap((date, i) => (monthLabelFor(date, dates[i - 1]) ? [i] : []));

  it('labels only the first pill for a single-month trip', () => {
    const dates = ['2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14'];
    expect(labelIndices(dates)).toEqual([0]);
  });

  it('labels the first pill and each month rollover for a multi-month trip', () => {
    // Jul 29 -> Aug 3: rollover lands on index 3 (Aug 1).
    const dates = ['2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
    expect(labelIndices(dates)).toEqual([0, 3]);
  });

  it('sources the abbreviation from Intl, not a hardcoded table', () => {
    expect(monthLabelFor('2026-08-01', '2026-07-31')).toBe(
      new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' }).format(
        new Date('2026-08-01T00:00:00Z'),
      ),
    );
  });
});

describe('clampDate', () => {
  it('passes dates already inside the range through unchanged', () => {
    expect(clampDate('2026-07-10', '2026-07-05', '2026-07-15')).toBe('2026-07-10');
  });

  it('clamps a date below the range up to the minimum', () => {
    expect(clampDate('2026-07-01', '2026-07-05', '2026-07-15')).toBe('2026-07-05');
  });

  it('clamps a date past the range down to the maximum — the activeDate rollover bug', () => {
    expect(clampDate('2026-07-20', '2026-07-05', '2026-07-15')).toBe('2026-07-15');
  });
});

describe('shiftIso', () => {
  it('shifts an instant by whole minutes', () => {
    expect(shiftIso('2026-07-07T19:30:00+09:00', 30)).toBe('2026-07-07T11:00:00.000Z');
  });
});

describe('zonedIso', () => {
  it('combines a date + time reading them as wall-clock in the given timezone', () => {
    expect(zonedIso('2026-07-07', '19:30', 'Asia/Tokyo')).toBe('2026-07-07T10:30:00.000Z');
  });

  it('is DST-aware (same wall time, different offset either side of a transition)', () => {
    // America/New_York: EST (UTC-5) before, EDT (UTC-4) after the 2026-03-08 spring-forward.
    expect(zonedIso('2026-03-01', '12:00', 'America/New_York')).toBe('2026-03-01T17:00:00.000Z');
    expect(zonedIso('2026-06-01', '12:00', 'America/New_York')).toBe('2026-06-01T16:00:00.000Z');
  });

  it('resolves both sides of a same-day spring-forward transition correctly', () => {
    // 2026-03-08: clocks jump 02:00 EST (-05:00) -> 03:00 EDT (-04:00) at 07:00 UTC.
    // A naive single-lookup (e.g. anchored at noon UTC) gets the 01:30 case wrong by an hour.
    expect(zonedIso('2026-03-08', '01:30', 'America/New_York')).toBe('2026-03-08T06:30:00.000Z');
    expect(zonedIso('2026-03-08', '04:30', 'America/New_York')).toBe('2026-03-08T08:30:00.000Z');
  });

  it('resolves both sides of a same-day fall-back transition correctly', () => {
    // 2026-11-01: clocks fall back 02:00 EDT (-04:00) -> 01:00 EST (-05:00) at 06:00 UTC.
    expect(zonedIso('2026-11-01', '00:30', 'America/New_York')).toBe('2026-11-01T04:30:00.000Z');
    expect(zonedIso('2026-11-01', '03:30', 'America/New_York')).toBe('2026-11-01T08:30:00.000Z');
  });

  it('handles half-hour and quarter-hour zone offsets', () => {
    expect(zonedIso('2026-07-07', '12:00', 'Asia/Kolkata')).toBe('2026-07-07T06:30:00.000Z'); // +05:30
    expect(zonedIso('2026-07-07', '12:00', 'Asia/Kathmandu')).toBe('2026-07-07T06:15:00.000Z'); // +05:45
  });

  it('resolves to a stable instant for a nonexistent (skipped) wall time without looping', () => {
    // 02:30 never occurs on 2026-03-08 (clocks jump 02:00 -> 03:00) — must not throw or hang.
    expect(() => zonedIso('2026-03-08', '02:30', 'America/New_York')).not.toThrow();
  });

  it('round-trips through isoToTimeInput for the trip timezone', () => {
    const iso = zonedIso('2026-07-07', '19:30', 'Asia/Tokyo');
    expect(isoToTimeInput(iso, 'Asia/Tokyo')).toBe('19:30');
  });
});

describe('resolveEndIso (overnight events, ADR-0037)', () => {
  it('keeps a later end on the same day', () => {
    expect(resolveEndIso('2026-07-07', '19:30', '21:00', 'Asia/Tokyo')).toBe(
      zonedIso('2026-07-07', '21:00', 'Asia/Tokyo'),
    );
  });

  it('rolls an earlier end onto the next calendar day', () => {
    // 23:00 → 02:00 is the next morning, a later instant, not a 21h backwards span.
    expect(resolveEndIso('2026-07-07', '23:00', '02:00', 'Asia/Tokyo')).toBe(
      zonedIso('2026-07-08', '02:00', 'Asia/Tokyo'),
    );
  });
});

describe('crossesMidnight', () => {
  it('is true only when start and end fall on different local days', () => {
    const start = zonedIso('2026-07-07', '23:00', 'Asia/Tokyo');
    expect(
      crossesMidnight(start, zonedIso('2026-07-08', '02:00', 'Asia/Tokyo'), 'Asia/Tokyo'),
    ).toBe(true);
    expect(
      crossesMidnight(start, zonedIso('2026-07-07', '23:45', 'Asia/Tokyo'), 'Asia/Tokyo'),
    ).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('uses minutes under an hour', () => {
    expect(formatCountdown(1)).toEqual({ value: '1', unit: 'דקה' });
    expect(formatCountdown(38)).toEqual({ value: '38', unit: 'דקות' });
  });

  it('uses H:MM hours from an hour up to a day', () => {
    expect(formatCountdown(60)).toEqual({ value: '1:00', unit: 'שעות' });
    expect(formatCountdown(135)).toEqual({ value: '2:15', unit: 'שעות' });
  });

  it('uses a Hebrew day count from a day up (dual form, no numeral for 1-2)', () => {
    expect(formatCountdown(24 * 60)).toEqual({ value: '', unit: 'יום' });
    expect(formatCountdown(2 * 24 * 60)).toEqual({ value: '', unit: 'יומיים' });
    expect(formatCountdown(5 * 24 * 60 + 30)).toEqual({ value: '5', unit: 'ימים' });
  });
});

describe('formatDaysUntil', () => {
  it('phrases exact day counts up to two months out', () => {
    expect(formatDaysUntil(1)).toBe('יום');
    expect(formatDaysUntil(2)).toBe('יומיים');
    expect(formatDaysUntil(45)).toBe('45 ימים');
    expect(formatDaysUntil(60)).toBe('60 ימים');
  });

  it('rounds to months past two months out (dual form included)', () => {
    expect(formatDaysUntil(61)).toBe('חודשיים');
    expect(formatDaysUntil(100)).toBe('3 חודשים');
    expect(formatDaysUntil(200)).toBe('7 חודשים');
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
