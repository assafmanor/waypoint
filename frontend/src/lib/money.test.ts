import { describe, expect, it } from 'vitest';
import {
  currencyExponent,
  currencyName,
  currencySymbol,
  formatMoney,
  formatRate,
  fromMinor,
  rateBase,
  toMinor,
} from './money';

describe('currencyExponent', () => {
  // The three cases the old `ponytail:` comment collapsed into two. If a future
  // engine disagrees with any of these, the bug is upstream and this is where
  // it surfaces — which is the point of asking the runtime rather than tabling it.
  it.each([
    ['JPY', 0],
    ['ISK', 0],
    ['ILS', 2],
    ['USD', 2],
    ['KWD', 3],
    ['BHD', 3],
  ])('reads %s as %i places from the runtime', (currency, places) => {
    expect(currencyExponent(currency)).toBe(places);
  });
});

describe('formatMoney', () => {
  it('treats the amount as MINOR units, per currency', () => {
    // The whole regression this module exists to prevent: one number, three
    // currencies, three different magnitudes.
    expect(formatMoney(1000, 'JPY')).toContain('1,000');
    expect(formatMoney(1000, 'ILS')).toContain('10.00');
    expect(formatMoney(1000, 'KWD')).toContain('1.000');
  });

  it('does not round a subunit away', () => {
    // The shipped bug: `maximumFractionDigits: 0` printed ₪24 for 2431.
    expect(formatMoney(2431, 'ILS')).toContain('24.31');
  });

  // A currency-less trip (ADR-0032's /new never collects one) must not reach
  // formatMoney with `undefined` — Intl.NumberFormat throws for that, and with
  // no ErrorBoundary in the app that blanks the whole screen (the bug this test
  // guards against). Callers must check trip.currency before calling.
  it('throws for a missing currency — callers must guard first', () => {
    expect(() => formatMoney(1200, undefined as unknown as string)).toThrow();
  });
});

describe('toMinor / fromMinor', () => {
  it('round-trips through the currency’s own exponent', () => {
    expect(toMinor(24.31, 'ILS')).toBe(2431);
    expect(toMinor(1000, 'JPY')).toBe(1000);
    expect(toMinor(1.5, 'KWD')).toBe(1500);
    expect(fromMinor(2431, 'ILS')).toBe(24.31);
    expect(fromMinor(1000, 'JPY')).toBe(1000);
  });

  it('is exact for every representable two-decimal amount', () => {
    // Not a spot check: a bare `Math.round(major * 100)` already passes this,
    // which is the point — the guard in `toMinor` is not there to fix ordinary
    // amounts, and a test that implied otherwise would misdescribe it.
    for (let cents = 0; cents < 20_000; cents++) {
      expect(toMinor(cents / 100, 'ILS')).toBe(cents);
    }
  });

  it('rounds OVER-precise input half-up, instead of arbitrarily', () => {
    // The real defect a bare Math.round has. Both of these are one tick above a
    // half-agora, and unguarded they disagree: 1.005 → 100 but 1.015 → 102,
    // decided by binary representation rather than by the typed number.
    expect(toMinor(1.005, 'USD')).toBe(101);
    expect(toMinor(1.015, 'USD')).toBe(102);
    expect(toMinor(8.165, 'USD')).toBe(817);
  });
});

describe('formatRate', () => {
  it('keeps significant digits a currency’s exponent would have eaten', () => {
    // ILS has 2 fraction digits; this rate needs 4. Hence a second function.
    expect(formatRate(0.024314)).toBe('0.0243');
  });
});

describe('rateBase', () => {
  it('picks the smallest power of ten whose converted value clears 1', () => {
    expect(rateBase(0.02431)).toBe(100); // ¥100 = ₪2.43
    expect(rateBase(0.0824)).toBe(100); // ₪100 = 8.24 KWD-ish
    expect(rateBase(0.00727)).toBe(1000); // kr1,000 = $7.27
    expect(rateBase(3.7)).toBe(1); // already ≥ 1 per unit
  });

  it('is bounded, so a collapsed currency cannot run off the card', () => {
    expect(rateBase(1e-12)).toBe(100_000);
    expect(rateBase(0)).toBe(1);
  });
});

describe('currencySymbol', () => {
  it('gives the narrow symbol where one exists', () => {
    expect(currencySymbol('JPY')).toBe('¥');
    expect(currencySymbol('ILS')).toBe('₪');
    expect(currencySymbol('USD')).toBe('$');
  });

  // `Intl` returns the CODE for a currency with no distinct symbol — and in an
  // RTL locale wraps it in invisible bidi marks, which made `symbol === code`
  // false everywhere and rendered "ALL ALL" on one picker row. Stripping them
  // is what lets a caller detect the no-symbol case at all.
  it('returns the bare code, comparably, when there is no symbol', () => {
    expect(currencySymbol('ALL')).toBe('ALL');
    expect(currencySymbol('ANG')).toBe('ANG');
  });

  it('never throws on an unknown code', () => {
    expect(currencySymbol('ZZZ')).toBe('ZZZ');
  });
});

describe('currencyName', () => {
  it('names the currency in the app locale, not in English', () => {
    expect(currencyName('JPY')).not.toBe('JPY');
    expect(currencyName('JPY')).toMatch(/[֐-׿]/);
  });

  it('never throws on an unknown code', () => {
    expect(currencyName('ZZZ')).toBe('ZZZ');
  });
});
