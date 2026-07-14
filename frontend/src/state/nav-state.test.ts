// Pure navigation-decision tests for the in-app back model (ADR-0035). The
// hooks that wrap these (useTripTab / useAppBack) are React+router bound; the
// decisions themselves are pure and are what's worth pinning down.
import { describe, expect, it } from 'vitest';
import { structuralBackStep, tabStep } from './nav-state';

describe('tabStep — Home-anchor tab model (ADR-0035 §3)', () => {
  it('is a no-op when already on the target tab', () => {
    expect(tabStep('days', 'days', true)).toEqual({ kind: 'none' });
  });

  it('pushes when leaving Home for another tab (so back returns to Home)', () => {
    expect(tabStep('home', 'days', false)).toEqual({ kind: 'push', to: '/?tab=days' });
  });

  it('replaces when switching between non-Home tabs (no accumulating trail)', () => {
    expect(tabStep('days', 'index', true)).toEqual({ kind: 'replace', to: '/?tab=index' });
  });

  it('steps back to the base when returning to Home', () => {
    expect(tabStep('index', 'home', true)).toEqual({ kind: 'back' });
  });

  it('replaces to Home when there is no in-app entry behind (cold deep link)', () => {
    expect(tabStep('index', 'home', false)).toEqual({ kind: 'replace', to: '/' });
  });
});

describe('structuralBackStep — goBack precedence (ADR-0035 §2)', () => {
  it('non-Home tab in a trip steps back to Home', () => {
    expect(
      structuralBackStep({ insideTrip: true, tab: 'days', pathname: '/', canGoBack: true }),
    ).toEqual({ kind: 'back' });
  });

  it('non-Home tab with no in-app history replaces to Home rather than exiting', () => {
    expect(
      structuralBackStep({ insideTrip: true, tab: 'map', pathname: '/', canGoBack: false }),
    ).toEqual({ kind: 'replace', to: '/' });
  });

  it('Home base in a trip resolves to the trip-exit step (gated by a confirm)', () => {
    expect(
      structuralBackStep({ insideTrip: true, tab: null, pathname: '/', canGoBack: true }),
    ).toEqual({ kind: 'exit-trip' });
    // tab=home is equivalent to the base.
    expect(
      structuralBackStep({ insideTrip: true, tab: 'home', pathname: '/', canGoBack: true }),
    ).toEqual({ kind: 'exit-trip' });
  });

  it('a shell route steps back to its parent', () => {
    expect(
      structuralBackStep({ insideTrip: false, tab: null, pathname: '/new', canGoBack: true }),
    ).toEqual({ kind: 'back' });
  });

  it('a cold-loaded shell route falls into the app rather than off it', () => {
    expect(
      structuralBackStep({ insideTrip: false, tab: null, pathname: '/new', canGoBack: false }),
    ).toEqual({ kind: 'push', to: '/' });
  });

  it('is a no-op at the roots (all-trips / zero-state / sign-in) — never falls off-app', () => {
    for (const pathname of ['/trips', '/', '/login']) {
      expect(
        structuralBackStep({ insideTrip: false, tab: null, pathname, canGoBack: true }),
      ).toEqual({ kind: 'none' });
    }
  });
});
