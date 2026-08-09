import { describe, expect, it } from 'vitest';
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
