// Pure navigation-decision tests for the in-app back model (ADR-0090, keeping
// ADR-0035's behavior; the custom edge-gesture trigger it also covered was
// retired by ADR-0099). The hooks that wrap these (useTripTab / useAppBack /
// the system-back interceptor) are React+router+DOM bound; the decision
// itself is one pure function of the current nav state, and that — plus the
// small pure targets around it — is what's worth pinning down.
import { describe, expect, it } from 'vitest';
import {
  RESET_TO_HOME_AFTER_HIDDEN_MS,
  backSlides,
  correctionForUncancelableBack,
  daySelectTarget,
  needsBackGuard,
  resolveActiveDate,
  resolveBack,
  shouldResetToHomeOnResume,
  tabTarget,
  type BackAction,
  type NavSnapshot,
} from './nav-state';

describe('resolveBack — the one layer-peeling decision (ADR-0090, behavior of ADR-0035 §2)', () => {
  const base: NavSnapshot = {
    hasOverlay: false,
    insideTrip: false,
    tab: null,
    pathname: '/',
    armed: false,
  };

  it('closes the topmost overlay first, from anywhere', () => {
    expect(resolveBack({ ...base, hasOverlay: true })).toEqual({ kind: 'close-overlay' });
    // even at the in-trip Home base, an open overlay wins.
    expect(resolveBack({ ...base, hasOverlay: true, insideTrip: true, tab: 'home' })).toEqual({
      kind: 'close-overlay',
    });
  });

  it('sends a non-Home tab to Home explicitly (never a blind history traversal)', () => {
    for (const tab of ['days', 'index', 'map']) {
      expect(resolveBack({ ...base, insideTrip: true, tab })).toEqual({ kind: 'to-home' });
    }
  });

  it('arms the leave-trip confirm on the first back at the Home base (tab null or "home")', () => {
    expect(resolveBack({ ...base, insideTrip: true, tab: null })).toEqual({ kind: 'arm-exit' });
    expect(resolveBack({ ...base, insideTrip: true, tab: 'home' })).toEqual({ kind: 'arm-exit' });
  });

  it('leaves the trip on the second back within the confirm window', () => {
    expect(resolveBack({ ...base, insideTrip: true, tab: 'home', armed: true })).toEqual({
      kind: 'exit-trip',
    });
  });

  it('an open overlay closes before the exit confirm even when armed', () => {
    expect(
      resolveBack({ ...base, hasOverlay: true, insideTrip: true, tab: 'home', armed: true }),
    ).toEqual({ kind: 'close-overlay' });
  });

  it('backs a shell route out to its explicit parent (cold-launch safe, no history needed)', () => {
    // create / join → the all-trips home
    expect(resolveBack({ ...base, pathname: '/new' })).toEqual({ kind: 'to', path: '/trips' });
    expect(resolveBack({ ...base, pathname: '/join/abc123' })).toEqual({
      kind: 'to',
      path: '/trips',
    });
    // trip-settings is opened from inside the trip → back into the trip (`/`)
    expect(resolveBack({ ...base, pathname: '/trip/t1/settings' })).toEqual({
      kind: 'to',
      path: '/',
    });
  });

  it('is a no-op at the roots (all-trips / zero-state / sign-in) — never falls off-app', () => {
    for (const pathname of ['/trips', '/', '/login']) {
      expect(resolveBack({ ...base, pathname })).toEqual({ kind: 'none' });
    }
  });

  it('insideTrip disambiguates `/` = trip Home base from `/` = zero-state', () => {
    expect(resolveBack({ ...base, pathname: '/', insideTrip: true })).toEqual({ kind: 'arm-exit' });
    expect(resolveBack({ ...base, pathname: '/', insideTrip: false })).toEqual({ kind: 'none' });
  });
});

describe('correctionForUncancelableBack — riding an uncatchable structural back (ADR-0103)', () => {
  it('redirects a trip exit to /trips: the OS rode onto the same-URL guard (Home), so correct it', () => {
    // The reported bug: under the activation gate the second (armed) back arrives
    // non-cancelable, the OS traverses onto the trip-Home guard entry, and without a
    // correction the user loops back to Home instead of leaving to All Trips.
    expect(correctionForUncancelableBack({ kind: 'exit-trip' })).toEqual({ kind: 'redirect-exit' });
  });

  it('leaves every other action uncorrected — the ride already lands on the right screen', () => {
    const others: BackAction[] = [
      { kind: 'arm-exit' }, // first back rides onto Home and stays on Home — correct
      { kind: 'to-home' }, // rides onto the same-URL Home entry — correct
      { kind: 'to', path: '/trips' },
      { kind: 'close-overlay' },
      { kind: 'none' }, // a root back is a legitimate native exit — never redirect
    ];
    for (const action of others) {
      expect(correctionForUncancelableBack(action)).toEqual({ kind: 'none' });
    }
  });
});

describe('backSlides — which actions move to a new screen (gesture animation)', () => {
  it('slides for structural navigation', () => {
    expect(backSlides({ kind: 'to-home' })).toBe(true);
    expect(backSlides({ kind: 'to', path: '/trips' })).toBe(true);
    expect(backSlides({ kind: 'exit-trip' })).toBe(true);
  });

  it('springs back (no slide) for overlay-dismiss / arm-confirm / no-op', () => {
    expect(backSlides({ kind: 'close-overlay' })).toBe(false);
    expect(backSlides({ kind: 'arm-exit' })).toBe(false);
    expect(backSlides({ kind: 'none' })).toBe(false);
  });
});

describe('tabTarget — where a tab tap navigates (always replace, flat history)', () => {
  it('routes Home to the clean `/` so it derives to today', () => {
    expect(tabTarget('home')).toBe('/');
  });

  it('routes any other tab to its `?tab=` URL', () => {
    expect(tabTarget('days')).toBe('/?tab=days');
    expect(tabTarget('index')).toBe('/?tab=index');
    expect(tabTarget('map')).toBe('/?tab=map');
  });
});

describe('needsBackGuard — Android OS-back needs a same-document entry to traverse into (ADR-0090)', () => {
  it('guards at the very bottom of the history stack (cold launch into the trip)', () => {
    expect(needsBackGuard(0, false)).toBe(true);
    // a missing/undefined index reads as the bottom → guard, to be safe
    expect(needsBackGuard(undefined, false)).toBe(true);
    expect(needsBackGuard(null, false)).toBe(true);
  });

  it('does not guard on a same-document navigation with an entry already behind us', () => {
    // index > 0 reached by client-side nav (not a fresh load) has cancelable fuel.
    expect(needsBackGuard(1, false)).toBe(false);
    expect(needsBackGuard(5, false)).toBe(false);
  });

  it('guards on a fresh document load even at index > 0 (reload / eviction / OAuth return)', () => {
    // The current entry is the floor of a NEW document; everything behind it is a
    // prior document, so a back into it is a non-cancelable cross-document traverse
    // — the "sometimes back closes the app" case the index-0-only guard missed.
    expect(needsBackGuard(3, true)).toBe(true);
    expect(needsBackGuard(1, true)).toBe(true);
    expect(needsBackGuard(0, true)).toBe(true);
  });
});

describe('daySelectTarget — single-source day selection (ADR-0035 §4, retained)', () => {
  const TODAY = '2026-07-08';

  it('always lands on the days tab, carrying a non-today day in ?day=', () => {
    expect(daySelectTarget('2026-07-10', TODAY)).toEqual({
      to: '/?tab=days&day=2026-07-10',
      replace: true,
    });
  });

  it('omits ?day= when the day is today, so the URL stays clean (Home derives to today)', () => {
    expect(daySelectTarget(TODAY, TODAY)).toEqual({ to: '/?tab=days', replace: true });
  });

  it('always replaces — back from a day resolves to Home from state, not by walking days', () => {
    expect(daySelectTarget('2026-07-10', TODAY).replace).toBe(true);
    expect(daySelectTarget(TODAY, TODAY).replace).toBe(true);
  });

  // Tab-aware (ADR-0110 §4): a day-scoped tab focuses the day in place.
  it('preserves a day-scoped tab (Map) so the day focuses in place, not on the Day view', () => {
    expect(daySelectTarget('2026-07-10', TODAY, 'map')).toEqual({
      to: '/?tab=map&day=2026-07-10',
      replace: true,
    });
    expect(daySelectTarget(TODAY, TODAY, 'map')).toEqual({ to: '/?tab=map', replace: true });
  });

  it('preserves the Day view tab, and routes any non-day-scoped tab to the Day view', () => {
    expect(daySelectTarget('2026-07-10', TODAY, 'days').to).toBe('/?tab=days&day=2026-07-10');
    expect(daySelectTarget('2026-07-10', TODAY, 'home').to).toBe('/?tab=days&day=2026-07-10');
    expect(daySelectTarget('2026-07-10', TODAY, 'index').to).toBe('/?tab=days&day=2026-07-10');
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
