import { afterEach, describe, expect, it } from 'vitest';
import { getSimulatedNow, setSimulatedNow } from './useClock';

afterEach(() => setSimulatedNow(null));

describe('simulated now override', () => {
  it('starts unset, using the real clock', () => {
    expect(getSimulatedNow()).toBeNull();
  });

  it('holds whatever instant it is set to until cleared', () => {
    const travelTo = new Date('2026-07-10T09:00:00Z').getTime();
    setSimulatedNow(travelTo);
    expect(getSimulatedNow()).toBe(travelTo);

    setSimulatedNow(null);
    expect(getSimulatedNow()).toBeNull();
  });
});
