import { describe, it, expect } from 'vitest';
import { formatDuration, hoursPhrase } from './duration';

const H = 60;
const D = 24 * H;

describe('hoursPhrase', () => {
  it('reads minutes below an hour, hours above — dual forms for 1 and 2', () => {
    expect(hoursPhrase(30)).toBe('30 דק׳');
    expect(hoursPhrase(60)).toBe('שעה');
    expect(hoursPhrase(120)).toBe('שעתיים');
    expect(hoursPhrase(345)).toBe('5:45 שע׳');
  });

  it('stays in hours past a day (never steps up to days)', () => {
    expect(hoursPhrase(30 * H)).toBe('30 שעות');
  });
});

describe('formatDuration — the elapsed ladder (ADR-0114)', () => {
  it('returns null when there is nothing to measure', () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-10)).toBeNull();
  });

  it('minutes rung, then hours rung', () => {
    expect(formatDuration(59)).toBe('59 דק׳');
    expect(formatDuration(60)).toBe('שעה');
    expect(formatDuration(D - 1)).toBe('23:59 שע׳');
  });

  it('days rung, rounded to nearest', () => {
    expect(formatDuration(D)).toBe('יום'); // 24h boundary
    expect(formatDuration(30 * H)).toBe('יום'); // 1.25d → 1
    expect(formatDuration(2 * D)).toBe('יומיים');
    expect(formatDuration(3 * D)).toBe('3 ימים');
  });

  it('weeks rung', () => {
    expect(formatDuration(7 * D)).toBe('שבוע');
    expect(formatDuration(14 * D)).toBe('שבועיים');
    expect(formatDuration(21 * D)).toBe('3 שבועות');
  });

  it('months rung', () => {
    expect(formatDuration(31 * D)).toBe('חודש');
    expect(formatDuration(61 * D)).toBe('חודשיים');
    expect(formatDuration(120 * D)).toBe('4 חודשים');
  });

  it('years rung', () => {
    expect(formatDuration(366 * D)).toBe('שנה');
    expect(formatDuration(730 * D)).toBe('שנתיים');
  });

  it("unit 'hours' pins to the hours rung regardless of length (transport, ADR-0084)", () => {
    expect(formatDuration(30 * H, 'hours')).toBe('30 שעות');
    expect(formatDuration(3 * D, 'hours')).toBe('72 שעות');
  });
});
