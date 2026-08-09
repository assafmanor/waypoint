import { describe, expect, it } from 'vitest';
import { canPrice, crossRate, fxRatesSchema, type FxRates } from './fx';

const FX: FxRates = {
  base: 'USD',
  rates: { USD: 1, ILS: 3.7, JPY: 152, EUR: 0.92 },
  publishedAt: '2026-08-09T00:02:31.000Z',
  nextUpdateAt: '2026-08-10T00:02:31.000Z',
  provider: 'Exchange Rate API',
  providerUrl: 'https://www.exchangerate-api.com',
};

describe('crossRate', () => {
  it('crosses a pair through the base', () => {
    // ¥1 in shekels: 3.7 / 152.
    expect(crossRate(FX, 'JPY', 'ILS')).toBeCloseTo(3.7 / 152, 10);
    expect(crossRate(FX, 'ILS', 'JPY')).toBeCloseTo(152 / 3.7, 10);
  });

  it('handles the base on either side without a special case', () => {
    expect(crossRate(FX, 'USD', 'ILS')).toBe(3.7);
    expect(crossRate(FX, 'ILS', 'USD')).toBeCloseTo(1 / 3.7, 10);
  });

  it('is exactly 1 for a pair with itself, including one not in the set', () => {
    expect(crossRate(FX, 'ILS', 'ILS')).toBe(1);
    expect(crossRate(FX, 'KPW', 'KPW')).toBe(1);
  });

  it('round-trips', () => {
    const there = crossRate(FX, 'JPY', 'EUR')!;
    const back = crossRate(FX, 'EUR', 'JPY')!;
    expect(there * back).toBeCloseTo(1, 10);
  });

  // The chosen provider cannot price KPW, and the picker offers every code the
  // runtime knows — so this is a state a surface renders, not an error it hits.
  it('returns undefined when either side is unpriceable', () => {
    expect(crossRate(FX, 'KPW', 'ILS')).toBeUndefined();
    expect(crossRate(FX, 'ILS', 'KPW')).toBeUndefined();
  });

  // A zero or missing rate must not produce Infinity at a render site.
  it('treats a zero rate as unpriceable rather than dividing by it', () => {
    const broken: FxRates = { ...FX, rates: { ...FX.rates, XXX: 0 } };
    expect(crossRate(broken, 'XXX', 'ILS')).toBeUndefined();
    expect(crossRate(broken, 'ILS', 'XXX')).toBeUndefined();
  });
});

describe('canPrice', () => {
  it('answers for the card, including when there is no rate set at all', () => {
    expect(canPrice(FX, 'JPY', 'ILS')).toBe(true);
    expect(canPrice(FX, 'KPW', 'ILS')).toBe(false);
    expect(canPrice(null, 'JPY', 'ILS')).toBe(false);
    expect(canPrice(undefined, 'JPY', 'ILS')).toBe(false);
  });
});

describe('fxRatesSchema', () => {
  it('accepts a well-formed set', () => {
    expect(fxRatesSchema.safeParse(FX).success).toBe(true);
  });

  it('rejects a non-positive rate, which would divide badly downstream', () => {
    expect(fxRatesSchema.safeParse({ ...FX, rates: { USD: 0 } }).success).toBe(false);
    expect(fxRatesSchema.safeParse({ ...FX, rates: { USD: -1 } }).success).toBe(false);
  });

  it('rejects a malformed currency key', () => {
    expect(fxRatesSchema.safeParse({ ...FX, rates: { usd: 1 } }).success).toBe(false);
  });
});
