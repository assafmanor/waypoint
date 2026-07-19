// Pure navigation-decision tests for the in-app back model (ADR-0035). The
// hooks that wrap these (useTripTab / useAppBack) are React+router bound; the
// decisions themselves are pure and are what's worth pinning down.
import { describe, expect, it } from 'vitest';
import {
  RESET_TO_HOME_AFTER_HIDDEN_MS,
  resolveActiveDate,
  shouldResetDayToToday,
  shouldResetToHomeOnResume,
  structuralBackStep,
  systemBackDecision,
  tabStep,
} from './nav-state';

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

  it('steps back to the base when Home is provably the entry behind', () => {
    expect(tabStep('index', 'home', true)).toEqual({ kind: 'back' });
  });

  it('routes to Home explicitly when Home is NOT behind — a cold deep link onto a tab, or foreign history (OAuth round-trip / external launch / idx desync) — so the tap never strands on a blind back', () => {
    expect(tabStep('index', 'home', false)).toEqual({ kind: 'replace', to: '/' });
    expect(tabStep('map', 'home', false)).toEqual({ kind: 'replace', to: '/' });
  });
});

describe('structuralBackStep — goBack precedence (ADR-0035 §2)', () => {
  it('non-Home tab steps back to Home when Home is provably the entry behind', () => {
    expect(
      structuralBackStep({
        insideTrip: true,
        tab: 'days',
        pathname: '/',
        canGoBack: true,
        homeBehind: true,
      }),
    ).toEqual({ kind: 'back' });
  });

  it('non-Home tab routes to Home explicitly when Home is NOT behind — a cold deep link onto a tab, or foreign history (OAuth round-trip / external launch / idx desync) — even though in-app history exists, so the gesture never strands on a blind back', () => {
    expect(
      structuralBackStep({
        insideTrip: true,
        tab: 'map',
        pathname: '/',
        canGoBack: true,
        homeBehind: false,
      }),
    ).toEqual({ kind: 'replace', to: '/' });
  });

  it('Home base in a trip resolves to the trip-exit step (gated by a confirm)', () => {
    expect(
      structuralBackStep({
        insideTrip: true,
        tab: null,
        pathname: '/',
        canGoBack: true,
        homeBehind: false,
      }),
    ).toEqual({ kind: 'exit-trip' });
    // tab=home is equivalent to the base.
    expect(
      structuralBackStep({
        insideTrip: true,
        tab: 'home',
        pathname: '/',
        canGoBack: true,
        homeBehind: false,
      }),
    ).toEqual({ kind: 'exit-trip' });
  });

  it('a shell route steps back to its parent', () => {
    expect(
      structuralBackStep({
        insideTrip: false,
        tab: null,
        pathname: '/new',
        canGoBack: true,
        homeBehind: false,
      }),
    ).toEqual({ kind: 'back' });
  });

  it('a cold-loaded shell route falls into the app rather than off it', () => {
    expect(
      structuralBackStep({
        insideTrip: false,
        tab: null,
        pathname: '/new',
        canGoBack: false,
        homeBehind: false,
      }),
    ).toEqual({ kind: 'push', to: '/' });
  });

  it('is a no-op at the roots (all-trips / zero-state / sign-in) — never falls off-app', () => {
    for (const pathname of ['/trips', '/', '/login']) {
      expect(
        structuralBackStep({
          insideTrip: false,
          tab: null,
          pathname,
          canGoBack: true,
          homeBehind: false,
        }),
      ).toEqual({ kind: 'none' });
    }
  });
});

describe('systemBackDecision — Android system-back routing (ADR-0035 §5)', () => {
  const base = {
    hasOverlay: false,
    insideTrip: false,
    atHome: false,
    homeBehind: true,
    armed: false,
  };

  it('closes an open overlay first, regardless of where you are', () => {
    expect(systemBackDecision({ ...base, hasOverlay: true })).toBe('close-overlay');
    expect(systemBackDecision({ ...base, hasOverlay: true, insideTrip: true, atHome: true })).toBe(
      'close-overlay',
    );
  });

  it('arms the leave-trip confirm on the first back at the in-trip Home base', () => {
    expect(systemBackDecision({ ...base, insideTrip: true, atHome: true, armed: false })).toBe(
      'arm-exit',
    );
  });

  it('leaves the trip on a second back within the confirm window', () => {
    // At the Home base the exit confirm takes precedence over homeBehind, so the
    // OS back never traverses off-app even when Home sits at history index 0.
    expect(
      systemBackDecision({
        ...base,
        insideTrip: true,
        atHome: true,
        homeBehind: false,
        armed: true,
      }),
    ).toBe('do-exit');
  });

  it('lets a non-Home tab back through natively when Home is provably behind', () => {
    expect(systemBackDecision({ ...base, insideTrip: true, atHome: false, homeBehind: true })).toBe(
      'allow',
    );
  });

  it('goes Home explicitly from a non-Home tab when Home is NOT behind (foreign / cold-launch history) — the Android twin of the gesture guard', () => {
    expect(
      systemBackDecision({ ...base, insideTrip: true, atHome: false, homeBehind: false }),
    ).toBe('go-home');
  });

  it('lets a back through to react-router when outside a trip', () => {
    expect(systemBackDecision({ ...base, insideTrip: false, homeBehind: false })).toBe('allow');
  });
});

describe('shouldResetDayToToday — every route to Home lands on today (ADR-0035, 2026-07-18)', () => {
  it('resets the day when a structural back lands on Home in Trip mode', () => {
    expect(shouldResetDayToToday('home', 'trip')).toBe(true);
  });

  it('preserves the selected day in Plan mode (not today-anchored)', () => {
    expect(shouldResetDayToToday('home', 'plan')).toBe(false);
  });

  it('does not reset while on a non-Home tab', () => {
    expect(shouldResetDayToToday('days', 'trip')).toBe(false);
    expect(shouldResetDayToToday('index', 'trip')).toBe(false);
  });
});

describe('resolveActiveDate — day-in-URL round-trip (J7 / review Q5)', () => {
  const START = '2026-07-05';
  const END = '2026-07-14';
  const TODAY = '2026-07-08';

  it('round-trips a valid in-range ?day= param', () => {
    expect(resolveActiveDate('2026-07-10', START, END, TODAY)).toBe('2026-07-10');
    // the range endpoints are inclusive
    expect(resolveActiveDate(START, START, END, TODAY)).toBe(START);
    expect(resolveActiveDate(END, START, END, TODAY)).toBe(END);
  });

  it('falls back to today when the param is missing', () => {
    expect(resolveActiveDate(null, START, END, TODAY)).toBe(TODAY);
    expect(resolveActiveDate('', START, END, TODAY)).toBe(TODAY);
  });

  it('falls back to today for a malformed param', () => {
    expect(resolveActiveDate('not-a-date', START, END, TODAY)).toBe(TODAY);
    expect(resolveActiveDate('2026-7-9', START, END, TODAY)).toBe(TODAY);
    expect(resolveActiveDate('2026-07-10T00:00', START, END, TODAY)).toBe(TODAY);
  });

  it('falls back to today when the param is out of the trip range', () => {
    expect(resolveActiveDate('2026-07-04', START, END, TODAY)).toBe(TODAY); // before start
    expect(resolveActiveDate('2026-07-15', START, END, TODAY)).toBe(TODAY); // after end
  });
});

describe('shouldResetToHomeOnResume — reopen-after-idle reset (ADR-0060)', () => {
  it('resets only when hidden at least the idle threshold in Trip mode', () => {
    expect(shouldResetToHomeOnResume(RESET_TO_HOME_AFTER_HIDDEN_MS, 'trip')).toBe(true);
    expect(shouldResetToHomeOnResume(RESET_TO_HOME_AFTER_HIDDEN_MS + 1, 'trip')).toBe(true);
  });

  it('resumes in place for a brief app-switch below the threshold', () => {
    expect(shouldResetToHomeOnResume(RESET_TO_HOME_AFTER_HIDDEN_MS - 1, 'trip')).toBe(false);
    expect(shouldResetToHomeOnResume(0, 'trip')).toBe(false);
  });

  it('never resets in Plan mode, however long the idle', () => {
    expect(shouldResetToHomeOnResume(RESET_TO_HOME_AFTER_HIDDEN_MS, 'plan')).toBe(false);
    expect(shouldResetToHomeOnResume(RESET_TO_HOME_AFTER_HIDDEN_MS * 10, 'plan')).toBe(false);
  });

  it('is distinct from (and longer than) the 30s data-resync threshold', () => {
    const RESYNC_AFTER_HIDDEN_MS = 30_000;
    expect(RESET_TO_HOME_AFTER_HIDDEN_MS).toBeGreaterThan(RESYNC_AFTER_HIDDEN_MS);
  });
});
