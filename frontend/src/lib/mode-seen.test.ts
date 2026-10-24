// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cameHome, markCameHome, markModeSeen, modeSeen, shouldGoLive } from './mode-seen';

afterEach(() => localStorage.clear());

describe('mode-seen', () => {
  it('is never-seen until marked, per trip', () => {
    expect(modeSeen('t1')).toBeNull();
    markModeSeen('t1', 'plan');
    expect(modeSeen('t1')).toBe('plan');
    expect(modeSeen('t2')).toBeNull();
  });

  it('reads an unknown stored value as never seen', () => {
    localStorage.setItem('waypoint:mode-seen:t1', 'garbage');
    expect(modeSeen('t1')).toBeNull();
  });
});

describe('shouldGoLive', () => {
  // The first open of a live trip on this install — including someone joining mid-trip,
  // whose first open of a live trip is still a first.
  it('is true on the first open of a live trip, whatever was or was not seen before', () => {
    expect(shouldGoLive('t1', 'trip')).toBe(true);
    markModeSeen('t1', 'plan');
    expect(shouldGoLive('t1', 'trip')).toBe(true);
  });

  it('is false once the trip has been seen live, and never in plan mode', () => {
    markModeSeen('t1', 'trip');
    expect(shouldGoLive('t1', 'trip')).toBe(false);
    expect(shouldGoLive('t2', 'plan')).toBe(false);
  });

  // Next year's trip, or a Plan peek and back: seen in plan again re-arms the first morning.
  it('re-arms when the trip is seen in plan again', () => {
    markModeSeen('t1', 'trip');
    markModeSeen('t1', 'plan');
    expect(shouldGoLive('t1', 'trip')).toBe(true);
  });
});

// ADR-0241 §3: its own key, so the provider's `mode-seen` write on every mount cannot spend it.
describe('came-home', () => {
  it('is unseen until the Home marks it, per trip, and mode-seen does not mark it', () => {
    markModeSeen('t1', 'plan');
    expect(cameHome('t1')).toBe(false);
    markCameHome('t1');
    expect(cameHome('t1')).toBe(true);
    expect(cameHome('t2')).toBe(false);
  });
});
