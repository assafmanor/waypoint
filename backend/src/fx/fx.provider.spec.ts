import { describe, expect, it, vi } from 'vitest';
import { ExchangeRateApiProvider } from './fx.provider';

/** A trimmed real Open Access response — the field names are the contract. */
const RESPONSE = {
  result: 'success',
  base_code: 'USD',
  time_last_update_unix: 1786320151,
  time_next_update_unix: 1786406551,
  rates: { USD: 1, ILS: 3.7, JPY: 152.1 },
};

const provider = (json: unknown) =>
  new ExchangeRateApiProvider({ fetchJson: vi.fn().mockResolvedValue(json) } as never);

describe('ExchangeRateApiProvider', () => {
  it('reads BOTH timestamps from the source, never from our clock', async () => {
    // The distinction ADR-0180 §4 turns on: `publishedAt` is what the "as of"
    // renders, and `nextUpdateAt` is what makes the refresh affordance exact
    // instead of a guess about which days are business days.
    const fx = await provider(RESPONSE).fetch();
    expect(fx.publishedAt).toBe(new Date(1786320151 * 1000).toISOString());
    expect(fx.nextUpdateAt).toBe(new Date(1786406551 * 1000).toISOString());
  });

  it('carries the attribution the terms require, as data', async () => {
    const fx = await provider(RESPONSE).fetch();
    expect(fx.provider).toBe('Rates By Exchange Rate API');
    expect(fx.providerUrl).toBe('https://www.exchangerate-api.com');
  });

  it('keeps the base priceable against itself', async () => {
    const fx = await provider({ ...RESPONSE, rates: { ILS: 3.7 } }).fetch();
    expect(fx.rates.USD).toBe(1);
  });

  // One bad entry must not cost a set of 160 good ones — and the wire schema
  // requires positive numbers under well-formed keys, so filtering here is what
  // keeps a third party's oddity from rejecting the whole document.
  it('drops malformed entries instead of failing the set', async () => {
    const fx = await provider({
      ...RESPONSE,
      rates: { ILS: 3.7, ils: 1, TOOLONG: 2, BAD: 0, NEG: -1, NAN: Number.NaN },
    }).fetch();
    expect(Object.keys(fx.rates).sort()).toEqual(['ILS', 'USD']);
  });

  it('refuses a response that is not a success', async () => {
    await expect(provider({ ...RESPONSE, result: 'error' }).fetch()).rejects.toThrow();
  });

  it('refuses a response missing the timestamps it is chosen for', async () => {
    const { time_next_update_unix: _omitted, ...withoutNext } = RESPONSE;
    await expect(provider(withoutNext).fetch()).rejects.toThrow();
  });
});
