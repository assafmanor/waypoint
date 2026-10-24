// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearOnWay, isOnWay, markOnWay, resetOnWayForTests } from './on-way';
import { setSimulatedNow } from './useClock';

const NOW = Date.parse('2026-08-26T14:00:00Z');

describe('בדרך as state (ADR-0206 §Z5 §M4)', () => {
  beforeEach(() => {
    setSimulatedNow(NOW);
    resetOnWayForTests();
  });
  afterEach(() => {
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  it('is absent until somebody says it', () => {
    expect(isOnWay('trip', 'dinner')).toBe(false);
    markOnWay('trip', 'dinner');
    expect(isOnWay('trip', 'dinner')).toBe(true);
  });

  // The mark is about one leg, so it is keyed to the trip AND the event — not a screen-wide
  // "we are moving" that would withdraw the next event's mark too.
  it('is per trip and per event', () => {
    markOnWay('trip', 'dinner');
    expect(isOnWay('trip', 'museum')).toBe(false);
    expect(isOnWay('other-trip', 'dinner')).toBe(false);
  });

  it('is idempotent, so a double tap means nothing different', () => {
    markOnWay('trip', 'dinner');
    markOnWay('trip', 'dinner');
    expect(isOnWay('trip', 'dinner')).toBe(true);
  });

  it('survives a reload', () => {
    markOnWay('trip', 'dinner');
    expect(localStorage.getItem('wp_on_way')).toContain('trip:dinner');
  });

  // A mark is about the leg you are on. One left overnight would withdraw tomorrow's mark for
  // an event that happens to be next, which is the failure a TTL-less flag would ship. Seeded
  // into storage AFTER the reset, so the read is the one under test rather than the write.
  it('does not survive the night, and the read is what prunes it', () => {
    localStorage.setItem(
      'wp_on_way',
      JSON.stringify({ 'trip:stale': NOW - 25 * 3600_000, 'trip:fresh': NOW - 3600_000 }),
    );
    expect(isOnWay('trip', 'stale')).toBe(false);
    expect(isOnWay('trip', 'fresh')).toBe(true);
  });

  it('reads as absent when storage cannot be parsed, rather than throwing', () => {
    localStorage.setItem('wp_on_way', 'not json');
    expect(() => isOnWay('trip', 'dinner')).not.toThrow();
    expect(isOnWay('trip', 'dinner')).toBe(false);
  });

  // **ADR-0207 §7.** The first build only ever SET — reported by the owner, and out of family with
  // every other state-writing verb in the app, all of which pass an undo to the toast.
  it('can be taken back, and the reversal persists like the mark did', () => {
    markOnWay('trip', 'dinner');
    clearOnWay('trip', 'dinner');
    expect(isOnWay('trip', 'dinner')).toBe(false);
    expect(localStorage.getItem('wp_on_way')).not.toContain('trip:dinner');
  });

  it('clears only the leg it was asked about', () => {
    markOnWay('trip', 'dinner');
    markOnWay('trip', 'museum');
    clearOnWay('trip', 'dinner');
    expect(isOnWay('trip', 'dinner')).toBe(false);
    expect(isOnWay('trip', 'museum')).toBe(true);
  });

  it('clearing something unmarked is a no-op rather than a write', () => {
    expect(() => clearOnWay('trip', 'never-marked')).not.toThrow();
    expect(isOnWay('trip', 'never-marked')).toBe(false);
  });
});
