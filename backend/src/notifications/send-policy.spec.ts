import { describe, expect, it } from 'vitest';
import type { ZoneCrossing } from '@waypoint/shared';
import {
  capWindowStart,
  DAILY_CAP,
  dailySource,
  fireKeyFor,
  hourInZone,
  hourStartInZone,
  isQuietHour,
  isStale,
  QUIET_HOURS_END,
  QUIET_HOURS_START,
  QUIET_VERDICT,
  quietVerdict,
  remainingToday,
} from './send-policy';

/** An instant at a given UTC wall clock, so a test can say "03:00 UTC" and mean it. */
const utc = (iso: string) => Date.parse(iso);

describe('hourInZone', () => {
  it('reads the wall clock in the named zone, not in UTC', () => {
    // 21:00 UTC is midnight in Tel Aviv (+03) and 06:00 the next day in Tokyo (+09).
    const at = utc('2026-08-21T21:00:00Z');
    expect(hourInZone(at, 'UTC')).toBe(21);
    expect(hourInZone(at, 'Asia/Jerusalem')).toBe(0);
    expect(hourInZone(at, 'Asia/Tokyo')).toBe(6);
  });

  it('folds midnight to 0 rather than reporting 24', () => {
    // Some ICU versions format midnight as `24` under hour12:false; the modulo is what makes
    // `isQuietHour` correct at exactly midnight instead of silently never matching.
    expect(hourInZone(utc('2026-08-21T00:00:00Z'), 'UTC')).toBe(0);
  });

  it('follows a DST shift rather than a fixed offset', () => {
    // New York is -04 in August and -05 in January. An offset constant would get one wrong.
    expect(hourInZone(utc('2026-08-21T12:00:00Z'), 'America/New_York')).toBe(8);
    expect(hourInZone(utc('2026-01-21T12:00:00Z'), 'America/New_York')).toBe(7);
  });
});

describe('hourStartInZone', () => {
  it('returns the top of the LOCAL hour, whatever minute the tick fell on', () => {
    const eight = utc('2026-08-21T05:00:00Z'); // 08:00 in Tel Aviv
    for (const offset of [0, 1, 29, 59]) {
      expect(hourStartInZone(eight + offset * 60_000, 'Asia/Jerusalem')).toBe(eight);
    }
  });

  it('drops seconds and milliseconds too, so a tick’s jitter cannot split the bucket', () => {
    const eight = utc('2026-08-21T05:00:00Z');
    expect(hourStartInZone(eight + 37_412, 'Asia/Jerusalem')).toBe(eight);
  });

  it('is exact in a zone whose offset is NOT a whole hour', () => {
    // Kathmandu is +05:45. Flooring the instant to a UTC hour would land 45 minutes early,
    // which is the whole reason this reads the local minute instead.
    const at = utc('2026-08-21T02:20:00Z'); // 08:05 in Kathmandu
    expect(hourInZone(at, 'Asia/Kathmandu')).toBe(8);
    expect(hourStartInZone(at, 'Asia/Kathmandu')).toBe(utc('2026-08-21T02:15:00Z'));
  });

  it('agrees with hourInZone on the instant it returns', () => {
    // The property that matters: bucketing must not move the send into a different hour.
    const at = utc('2026-08-21T16:59:59Z');
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/New_York', 'Asia/Kathmandu']) {
      expect(hourInZone(hourStartInZone(at, zone), zone)).toBe(hourInZone(at, zone));
    }
  });
});

describe('isQuietHour', () => {
  // The window wraps midnight, which is the whole reason this is not a range check.
  it.each([
    ['22:00, the first quiet hour', '2026-08-21T22:00:00Z', true],
    ['23:30', '2026-08-21T23:30:00Z', true],
    ['midnight', '2026-08-21T00:00:00Z', true],
    ['03:00, the notification that kills the feature', '2026-08-21T03:00:00Z', true],
    ['06:59', '2026-08-21T06:59:00Z', true],
    ['07:00, the first waking hour', '2026-08-21T07:00:00Z', false],
    ['noon', '2026-08-21T12:00:00Z', false],
    ['21:59', '2026-08-21T21:59:00Z', false],
  ])('%s → %s', (_label, iso, quiet) => {
    expect(isQuietHour(utc(iso), 'UTC')).toBe(quiet);
  });

  it('is quiet according to the RECIPIENT, not the server', () => {
    // 14:00 UTC is the middle of the afternoon here and 23:00 in Tokyo.
    const at = utc('2026-08-21T14:00:00Z');
    expect(isQuietHour(at, 'UTC')).toBe(false);
    expect(isQuietHour(at, 'Asia/Tokyo')).toBe(true);
  });

  it('agrees with the named boundaries', () => {
    expect(QUIET_HOURS_START).toBe(22);
    expect(QUIET_HOURS_END).toBe(7);
  });
});

describe('quietVerdict', () => {
  const base = { crossings: [] as ZoneCrossing[], primaryZone: 'Asia/Jerusalem' };

  it('sends in the afternoon', () => {
    // 09:00 UTC = 12:00 in Tel Aviv.
    expect(quietVerdict({ ...base, nowMs: utc('2026-08-21T09:00:00Z'), timeCritical: false })).toBe(
      QUIET_VERDICT.SEND,
    );
  });

  it('DEFERS an ordinary send inside the window', () => {
    // 00:00 UTC = 03:00 in Tel Aviv. This is the 03:00 notification, and it must not go.
    expect(quietVerdict({ ...base, nowMs: utc('2026-08-21T00:00:00Z'), timeCritical: false })).toBe(
      QUIET_VERDICT.DEFER,
    );
  });

  it('lets a timeCritical send through the window — the 05:30 flight case', () => {
    // Without this, a 04:00 "your flight is in 90 minutes" never arrives and the whole
    // feature is decorative.
    expect(quietVerdict({ ...base, nowMs: utc('2026-08-21T01:00:00Z'), timeCritical: true })).toBe(
      QUIET_VERDICT.SEND,
    );
  });

  it('reads the zone from the itinerary segment, so a crossing moves the window', () => {
    // A traveller who has flown to Tokyo: 14:00 UTC is 23:00 there and quiet, even though
    // the trip's primary zone would have said otherwise.
    const crossings: ZoneCrossing[] = [
      { at: utc('2026-08-01T00:00:00Z'), fromZone: 'Asia/Jerusalem', toZone: 'Asia/Tokyo' },
    ];
    const nowMs = utc('2026-08-21T14:00:00Z');
    expect(
      quietVerdict({ crossings, primaryZone: 'Asia/Jerusalem', nowMs, timeCritical: false }),
    ).toBe(QUIET_VERDICT.DEFER);
    expect(
      quietVerdict({ crossings: [], primaryZone: 'Asia/Jerusalem', nowMs, timeCritical: false }),
    ).toBe(QUIET_VERDICT.SEND);
  });

  it('reads HOME before the first crossing, not the destination', () => {
    // The pre-trip case (ADR-0197 §5): a deadline set weeks out is judged against the zone
    // the person is standing in, which is the departure origin.
    const crossings: ZoneCrossing[] = [
      { at: utc('2026-09-01T00:00:00Z'), fromZone: 'Asia/Jerusalem', toZone: 'Asia/Tokyo' },
    ];
    // 20:00 UTC = 23:00 Jerusalem (quiet) but 05:00 next day in Tokyo (also quiet) — pick an
    // instant where the two disagree instead: 12:00 UTC = 15:00 Jerusalem, 21:00 Tokyo.
    const nowMs = utc('2026-08-21T12:00:00Z');
    expect(quietVerdict({ crossings, primaryZone: 'Asia/Tokyo', nowMs, timeCritical: false })).toBe(
      QUIET_VERDICT.SEND,
    );
  });
});

describe('the daily caps (ADR-0198 §5)', () => {
  it('rations what the app says more tightly than what a person asked for', () => {
    // The rule in one assertion: a task deadline somebody typed gets more room than a nudge
    // the app decided to send.
    expect(DAILY_CAP.task).toBeGreaterThan(DAILY_CAP.nudge);
  });

  it.each([
    ['task.due', 'task'],
    ['task.assigned', 'task'],
    ['task.digest', 'digest'],
    ['readiness.nudge', 'nudge'],
    ['group.imminent', 'nudge'],
    ['event.hard.soon', 'nudge'],
  ])('classifies %s as %s', (kind, source) => {
    expect(dailySource(kind)).toBe(source);
  });

  it('gives an unclassified kind the TIGHTEST budget, never an exemption', () => {
    // The failure direction must be "too quiet", never "unbounded" — a kind nobody
    // classified should not be able to out-send one somebody thought about.
    expect(DAILY_CAP[dailySource('something.new')]).toBe(Math.min(...Object.values(DAILY_CAP)));
  });

  it('counts down and never goes negative', () => {
    expect(remainingToday('task', 0)).toBe(DAILY_CAP.task);
    expect(remainingToday('task', DAILY_CAP.task - 1)).toBe(1);
    expect(remainingToday('task', DAILY_CAP.task)).toBe(0);
    expect(remainingToday('task', DAILY_CAP.task + 99)).toBe(0);
  });

  it('counts from a rolling 24 hours, not from the recipient’s local midnight', () => {
    // A cap is a rate limit on OUR behaviour; re-basing it per traveller would hand somebody
    // crossing the date line two budgets.
    const nowMs = utc('2026-08-21T12:00:00Z');
    expect(nowMs - capWindowStart(nowMs).getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('fireKeyFor', () => {
  it('buckets to the minute, matching the tick interval', () => {
    const a = fireKeyFor(utc('2026-08-21T18:00:00Z'));
    const b = fireKeyFor(utc('2026-08-21T18:00:59Z'));
    expect(a).toBe(b);
    expect(a).toBe('2026-08-21T18:00');
  });

  // The property the whole dedup design rests on (ADR-0197 §3).
  it('gives a MOVED deadline a new key, so it re-arms', () => {
    expect(fireKeyFor(utc('2026-08-21T18:00:00Z'))).not.toBe(
      fireKeyFor(utc('2026-08-21T20:00:00Z')),
    );
  });

  it('gives the same instant the same key however it was reached, so nothing re-sends', () => {
    // An edited title does not move the aimed-at instant, so the key is unchanged.
    expect(fireKeyFor(utc('2026-08-21T18:00:00Z'))).toBe(fireKeyFor(utc('2026-08-21T18:00:30Z')));
  });

  it('is UTC, so the key does not change as the traveller does', () => {
    // A key is an identity, not something anybody reads. Resolving it per zone would make
    // one send dedupe differently either side of a border.
    expect(fireKeyFor(utc('2026-08-21T18:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('isStale', () => {
  const HOUR = 60 * 60 * 1000;

  it('sends a candidate inside its window', () => {
    expect(isStale({ nowMs: 1_000 + HOUR, aimedAtMs: 1_000, staleAfterMs: 3 * HOUR })).toBe(false);
  });

  it('DROPS one past it — a redeploy must not fire eleven notifications at once', () => {
    expect(isStale({ nowMs: 1_000 + 4 * HOUR, aimedAtMs: 1_000, staleAfterMs: 3 * HOUR })).toBe(
      true,
    );
  });

  it('is not stale exactly at the boundary', () => {
    expect(isStale({ nowMs: 1_000 + 3 * HOUR, aimedAtMs: 1_000, staleAfterMs: 3 * HOUR })).toBe(
      false,
    );
  });

  it('is never stale for a candidate aimed at the future', () => {
    expect(isStale({ nowMs: 1_000, aimedAtMs: 1_000 + HOUR, staleAfterMs: 0 })).toBe(false);
  });
});
