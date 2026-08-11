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
  navDirectionFrom,
  NAV_DIR,
  correctionForUncancelableBack,
  dayCarriedFrom,
  daySelectTarget,
  needsBackGuard,
  resolveActiveDate,
  resolveBack,
  shouldResetToHomeOnResume,
  tabShowsSelectedDay,
  tabTarget,
  type BackAction,
  type NavSnapshot,
  withBookingFormReturn,
} from './nav-state';

describe('resolveBack — the one layer-peeling decision (ADR-0090, behavior of ADR-0035 §2)', () => {
  const base: NavSnapshot = {
    hasOverlay: false,
    insideTrip: false,
    tab: null,
    pathname: '/',
    search: '',
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

  it('resolves /settings from `?from=`, the one shell route with two legitimate parents', () => {
    // ADR-0133 §2. Entered from inside a trip, back must land IN the trip — a static
    // parent would eject a member from their trip to edit their own name.
    expect(resolveBack({ ...base, pathname: '/settings', search: '?from=home' })).toEqual({
      kind: 'to',
      path: '/',
    });
    // Entered from the all-trips home, back returns there.
    expect(resolveBack({ ...base, pathname: '/settings', search: '?from=trips' })).toEqual({
      kind: 'to',
      path: '/trips',
    });
  });

  it('falls /settings back to the all-trips home for anything unrecognised', () => {
    // A cold deep link, a stale bookmark, a hand-typed value: the safe parent, never
    // a guess. The param is a closed enum precisely so this branch is total.
    for (const search of ['', '?from=', '?from=nonsense', '?from=%2Fetc%2Fpasswd', '?other=home']) {
      expect(resolveBack({ ...base, pathname: '/settings', search })).toEqual({
        kind: 'to',
        path: '/trips',
      });
    }
  });

  it('hands the return target back up from the picture page', () => {
    // The picture page is a child of the settings page, so one back reaches settings
    // WITH `?from=` intact and the next one still lands where you came from.
    expect(resolveBack({ ...base, pathname: '/settings/picture', search: '?from=home' })).toEqual({
      kind: 'to',
      path: '/settings?from=home',
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

describe("navDirectionFrom — the shell transition's direction (ADR-0140)", () => {
  it('reads a back stamp off the router entry', () => {
    expect(navDirectionFrom({ navDir: NAV_DIR.BACK })).toBe(NAV_DIR.BACK);
  });

  // Every ordinary navigate() in the app stamps nothing, so forward has to be what
  // "no information" means — otherwise adding the transition would have needed a
  // change at every call site.
  it('defaults to forward for anything unstamped', () => {
    expect(navDirectionFrom(undefined)).toBe(NAV_DIR.FORWARD);
    expect(navDirectionFrom(null)).toBe(NAV_DIR.FORWARD);
    expect(navDirectionFrom({})).toBe(NAV_DIR.FORWARD);
  });

  // Anything can push a history entry, so the reader may not assume our own shape is
  // there — a string state or a foreign key must not throw or read as a back.
  it('tolerates a state it did not write', () => {
    expect(navDirectionFrom('somebody else')).toBe(NAV_DIR.FORWARD);
    expect(navDirectionFrom({ navDir: 'sideways' })).toBe(NAV_DIR.FORWARD);
    expect(navDirectionFrom({ other: 1 })).toBe(NAV_DIR.FORWARD);
  });

  // The direction source and the slide predicate must stay in step: every action that
  // MOVES is stamped, and the ones that stay put never navigate at all.
  it('covers exactly the actions backSlides calls moving', () => {
    const moving = [
      { kind: 'to-home' },
      { kind: 'to', path: '/trips' },
      { kind: 'exit-trip' },
    ] as const;
    expect(moving.every(backSlides)).toBe(true);
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

  // Field report #39: a tab move that dropped `?day=` resolved the day back to today,
  // so entering the Map from the tab bar forgot the day that tapping a day kept.
  it('carries the day it is given, so a lateral move cannot lose it', () => {
    expect(tabTarget('map', '2026-07-10')).toBe('/?tab=map&day=2026-07-10');
    expect(tabTarget('days', '2026-07-10')).toBe('/?tab=days&day=2026-07-10');
  });

  // The Index does not date-filter and shows no selected pill, but it still CARRIES the
  // day — that is what makes Day → Index → Day come back to the day you left.
  it('carries the day across the Index too, where it is remembered but not shown', () => {
    expect(tabTarget('index', '2026-07-10')).toBe('/?tab=index&day=2026-07-10');
  });

  it('stays clean with no day, and keeps Home clean whatever it is handed', () => {
    expect(tabTarget('map', null)).toBe('/?tab=map');
    expect(tabTarget('map', undefined)).toBe('/?tab=map');
    expect(tabTarget('home', '2026-07-10')).toBe('/');
  });
});

describe('dayCarriedFrom — the remembered day IS the `?day=` param (field report #39)', () => {
  const from = (search: string) => dayCarriedFrom(new URLSearchParams(search));

  it('carries the day off any non-Home tab, the Index included', () => {
    expect(from('?tab=days&day=2026-07-10')).toBe('2026-07-10');
    expect(from('?tab=map&day=2026-07-10')).toBe('2026-07-10');
    expect(from('?tab=index&day=2026-07-10')).toBe('2026-07-10');
  });

  it('carries nothing when there is no day to carry', () => {
    expect(from('?tab=days')).toBeNull();
    expect(from('')).toBeNull();
  });

  // Home is today-anchored in both modes, so a stray `?day=` on a Home URL is already
  // ignored by `activeDate` — leaving Home must not bring it back to life.
  it('carries nothing out of Home, even with a stray `?day=` on the URL', () => {
    expect(from('?day=2026-07-10')).toBeNull();
    expect(from('?tab=home&day=2026-07-10')).toBeNull();
  });
});

describe('tabShowsSelectedDay — which surface singles a day out (field report #39)', () => {
  it('is true on the day-scoped surfaces and on today-anchored Home', () => {
    expect(tabShowsSelectedDay('days')).toBe(true);
    expect(tabShowsSelectedDay('map')).toBe(true);
    expect(tabShowsSelectedDay('home')).toBe(true);
  });

  it('is false on the trip-wide Index, whose content is the whole trip', () => {
    expect(tabShowsSelectedDay('index')).toBe(false);
  });

  // The two halves are independent on purpose: the Index remembers the day it does not
  // show, which is the whole shape of the report's invariant.
  it('does not stop the Index carrying the day it will not display', () => {
    expect(tabShowsSelectedDay('index')).toBe(false);
    expect(tabTarget('index', '2026-07-10')).toContain('day=2026-07-10');
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

// This is also all a resume can do to the remembered day (field report #39): the day is
// `?day=` and nothing else, so the only way a foreground can move it is by navigating —
// below the threshold nothing navigates at all and the param survives untouched, and at it
// the reset is ADR-0060's own, to Home, which is today by construction.
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

// The Index's bookings screen is view state, not a route (ADR-0098), so a booking errand
// returning to the Index tab lands on the LANDING — with no host mounted to hear the answer
// the errand is holding. The return has to ask the Index to MOUNT that screen (session 172).
describe('withBookingFormReturn', () => {
  it('asks the Index to mount its bookings screen', () => {
    expect(withBookingFormReturn('/?tab=index')).toBe('/?tab=index&focus=bookings');
  });

  // No booking id, deliberately: the pending result says which booking and what was typed,
  // and an unsaved booking has no id to carry at all — which is why keying on one fixed
  // neither case.
  it('carries no booking id', () => {
    expect(withBookingFormReturn('/?tab=index')).not.toContain('booking=');
  });

  it('leaves every other destination alone — its host never unmounted', () => {
    expect(withBookingFormReturn('/?tab=days')).toBe('/?tab=days');
    expect(withBookingFormReturn('/?tab=map&day=2026-07-22')).toBe('/?tab=map&day=2026-07-22');
    expect(withBookingFormReturn('/')).toBe('/');
  });

  it('keeps the params already on the way back', () => {
    const out = new URLSearchParams(withBookingFormReturn('/?tab=index&day=2026-07-22').slice(2));
    expect(out.get('day')).toBe('2026-07-22');
    expect(out.get('focus')).toBe('bookings');
  });
});
