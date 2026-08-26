import { describe, it, expect } from 'vitest';
import { approxDuration, clockShiftSentence, formatDuration, hoursPhrase } from './duration';
import { withoutBidiControls } from './bidi';

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

  // `NaN <= 0` is false, so an unparseable date used to walk every rung and fall out of
  // the last one as `לפני NaN שנים`. Nothing to measure is nothing to measure.
  it('returns null for a non-finite length, and never phrases NaN', () => {
    expect(formatDuration(Number.NaN)).toBeNull();
    expect(formatDuration(Date.parse('not a date'))).toBeNull();
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatDuration(Number.NaN, 'hours')).toBeNull();
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

// Session 215, and the owner's own idea: the lifted hero says the clock jump in words
// where the collapsed board keeps the `🕐 +1 ש׳` pill. The pill is correct and never says
// which way to turn the hands.
describe('clockShiftSentence — the zone crossing in words', () => {
  it('reads forward for a gain and backward for a loss', () => {
    expect(clockShiftSentence(60)).toBe('מזיזים את השעון שעה קדימה');
    expect(clockShiftSentence(-60)).toBe('מזיזים את השעון שעה אחורה');
  });

  // The direction is the SIGN's, never the caller's, because getting it backwards is worse
  // than the pill it replaces — and the numbers are the shared ladder's dual forms.
  it('takes its number words from the ladder, including the duals', () => {
    expect(clockShiftSentence(120)).toBe('מזיזים את השעון שעתיים קדימה');
    expect(clockShiftSentence(-180)).toBe('מזיזים את השעון 3 שעות אחורה');
  });

  // India is +5:30 and Nepal +5:45: a fractional zone has no hour word, so it falls back to
  // the ladder's own H:MM rung rather than growing a `וחצי` nothing else in the app says.
  it('falls back to the ladder for a fractional zone rather than inventing a word', () => {
    expect(clockShiftSentence(150)).toBe('מזיזים את השעון 2:30 שע׳ קדימה');
    expect(clockShiftSentence(-45)).toBe('מזיזים את השעון 45 דק׳ אחורה');
  });

  it('is null when there is no shift — every single-zone trip', () => {
    expect(clockShiftSentence(0)).toBeNull();
  });
});

describe('approxDuration — a travel time, hedged (ADR-0206 §D5 over §D3)', () => {
  // The `~` belongs INSIDE the isolate, with the digits: it is bidi-neutral, so beside a numeral
  // in an RTL flow it lands on the far side of the number and `~40` renders `40~`. ADR-0206 §Z5
  // found it by rendering the first routes mockup and it reached the second one anyway, so the
  // assertion is on the control characters rather than on the eye (ADR-0118's own rule).
  it('isolates the number together with its tilde, never the unit', () => {
    expect(approxDuration(23)).toBe('⁦~23⁩ דק׳');
    expect(withoutBidiControls(approxDuration(23)!)).toBe('~23 דק׳');
    expect(approxDuration(23)!.indexOf('~')).toBeLessThan(approxDuration(23)!.indexOf('2'));
  });

  // §D3: one ladder, read a second way. 4,355 s is not `72 דק׳`.
  it("rounds onto ADR-0114's ladder rather than reporting minutes forever", () => {
    expect(withoutBidiControls(approxDuration(4355 / 60)!)).toBe('~1:13 שע׳');
    expect(withoutBidiControls(approxDuration(1268 / 60)!)).toBe('~21 דק׳');
    expect(withoutBidiControls(approxDuration(135)!)).toBe('~2:15 שע׳');
  });

  // A tilde in front of a Hebrew word means nothing and is a second bidi trap, so the word
  // rungs take the Hebrew prefix instead.
  it('hedges the word rungs with כ, and carries no isolate there', () => {
    expect(approxDuration(60)).toBe('כשעה');
    expect(approxDuration(120)).toBe('כשעתיים');
    expect(approxDuration(180)).toBe('כ3 שעות');
  });

  // Two stops that are one place (`ROUTE_MIN_CROW_M`) is §D4's absence, not a `0 דק׳`.
  it('answers null for nothing to measure', () => {
    expect(approxDuration(0)).toBeNull();
    expect(approxDuration(-5)).toBeNull();
    expect(approxDuration(Number.NaN)).toBeNull();
  });
});
