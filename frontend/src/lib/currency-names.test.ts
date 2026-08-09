import { describe, expect, it } from 'vitest';
import { COUNTRY_CURRENCY } from '@waypoint/shared';
import { CURRENCY_NAMES } from './currency-names';
import { currencyName, currencySymbol, currencyWideSymbol } from './money';

// The snapshot's job is to be the floor under `Intl` — so what is asserted here
// is the shape of the floor, not the words on it (those are CLDR's and change
// with it). A generated file still earns a test: the generator can regress, and
// nothing else would notice until a name went blank on someone's phone.
describe('CURRENCY_NAMES — the floor under Intl', () => {
  it('carries no empty values anywhere', () => {
    // The first draft encoded "same as the code" as `''`, and 140 of the 162 rows
    // used it. Every one was correct only because one `||` in one reader held —
    // a convention a direct reader has no way to know about, whose failure is a
    // blank name on screen. Full values, always.
    for (const [code, row] of Object.entries(CURRENCY_NAMES)) {
      expect(row, `${code} is not a 4-tuple`).toHaveLength(4);
      for (const value of row) expect(value, `${code} has an empty slot`).toBeTruthy();
    }
  });

  it('covers every currency the app’s own destinations need', () => {
    // The runtime supplies breadth and this supplies the floor, so the floor has
    // to reach at least as far as the app can send someone.
    for (const currency of Object.values(COUNTRY_CURRENCY)) {
      expect(CURRENCY_NAMES[currency], `${currency} has no fallback`).toBeDefined();
    }
  });

  it('never lets a reader see an empty name or symbol, for any currency', () => {
    // Including codes with no row at all: the readers fall back to the code, and
    // a currency that renders as its own code is a designed state — blank is not.
    for (const code of Object.keys(CURRENCY_NAMES)) {
      expect(currencyName(code), `${code} he`).toBeTruthy();
      expect(currencyName(code, 'en'), `${code} en`).toBeTruthy();
      expect(currencySymbol(code), `${code} narrow`).toBeTruthy();
      expect(currencyWideSymbol(code), `${code} wide`).toBeTruthy();
    }
    expect(currencyName('ZZZ')).toBeTruthy();
    expect(currencySymbol('ZZZ')).toBeTruthy();
  });
});
