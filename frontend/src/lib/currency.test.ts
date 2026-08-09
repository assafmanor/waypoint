// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currencyAfterDestinationEdit, currencyForNewTrip } from './currency';

// The whole point of this module is that the two rules DIFFER, so every case is
// asserted against both — a test per function would let them converge unnoticed,
// which is the drift the module exists to prevent.
describe('currencyForNewTrip vs currencyAfterDestinationEdit', () => {
  it('agree when the country resolves', () => {
    expect(currencyForNewTrip('JP')).toBe('JPY');
    expect(currencyAfterDestinationEdit('JP', 'ILS')).toBe('JPY');
  });

  it('a resolved pick overwrites an existing currency on edit', () => {
    // Safe because it sets FORM state, visible above the save button — and
    // because the "I keep this trip in shekels" case now has its own field.
    expect(currencyAfterDestinationEdit('FR', 'JPY')).toBe('EUR');
  });

  it('diverge on a country the table does not carry', () => {
    expect(currencyForNewTrip('ZZ')).toBeUndefined();
    expect(currencyAfterDestinationEdit('ZZ', 'JPY')).toBe('JPY');
  });

  it('diverge on a "use as typed" destination, which carries no country at all', () => {
    expect(currencyForNewTrip(undefined)).toBeUndefined();
    expect(currencyAfterDestinationEdit(undefined, 'JPY')).toBe('JPY');
  });

  it('leaves an unset currency unset on edit, rather than inventing one', () => {
    expect(currencyAfterDestinationEdit(undefined, undefined)).toBeUndefined();
    expect(currencyAfterDestinationEdit('ZZ', '')).toBe('');
  });
});

// `DEVICE_REGION` reads `navigator.language` at module load, so each case needs a
// fresh module graph. jsdom for `navigator`, which the node environment has not.
describe('currencyForDeviceRegion — the seed, not the store', () => {
  const withLanguage = async (language: string) => {
    vi.resetModules();
    vi.stubGlobal('navigator', { language });
    const { currencyForDeviceRegion } = await import('./currency');
    return currencyForDeviceRegion();
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('answers ILS for a phone set to Hebrew — the bug the whole audience hit', async () => {
    // `he` is a BARE language: `new Intl.Locale('he').region` is `undefined`, so
    // reading `.region` alone left every current user with no home currency at
    // all. `maximize()` is CLDR's likely-subtags, which is exactly the question.
    await expect(withLanguage('he')).resolves.toBe('ILS');
  });

  it('keeps a region the locale actually names, rather than guessing over it', async () => {
    // An Israeli phone in English stays USD: this asks where the DEVICE is, not
    // what language it speaks, and `maximize()` must only ever fill a blank.
    await expect(withLanguage('en-US')).resolves.toBe('USD');
    await expect(withLanguage('he-IL')).resolves.toBe('ILS');
  });

  it('maximizes other bare languages too, not just Hebrew', async () => {
    await expect(withLanguage('ja')).resolves.toBe('JPY');
    await expect(withLanguage('is')).resolves.toBe('ISK');
  });

  it('answers undefined rather than throwing on a locale it cannot parse', async () => {
    // The caller then has no default and asks — a designed state, not an error.
    await expect(withLanguage('not a locale')).resolves.toBeUndefined();
  });
});
