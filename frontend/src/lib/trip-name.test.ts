import { describe, expect, it } from 'vitest';
import { getNow } from './useClock';
import { suggestTripName } from './trip-name';

describe('suggestTripName', () => {
  it('combines destination + year from the start date', () => {
    expect(suggestTripName('יפן', '2026-07-25')).toBe('יפן ׳26');
  });

  it('is empty without a destination', () => {
    expect(suggestTripName('', '2026-07-25')).toBe('');
  });

  it('falls back to the current year without a start date yet', () => {
    const yy = String(new Date(getNow()).getFullYear()).slice(2);
    expect(suggestTripName('יפן', '')).toBe(`יפן ׳${yy}`);
  });
});
