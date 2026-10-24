// In-app navigation model (ADR-0090, superseding ADR-0035's mechanism; its
// behavior is unchanged). The app's current navigation state — inside a trip? on
// which tab? is an overlay open? which route? — fully determines what "back"
// does, so back is a PURE function of that state (`resolveBack`) executed as an
// explicit navigation. We never call `history.back()` / `navigate(-1)` for
// structural back and never interrogate the browser history stack (its contents
// are unknowable and get polluted by OAuth round-trips, PWA cold launches, and
// react-router idx desyncs — the whole class of bug ADR-0035 kept re-patching).
//
// Every "back" trigger — the platform system-back (Navigation API interceptor
// below), the nav-bar Home tab, a shell back button — resolves the SAME
// `resolveBack` and runs the SAME executor. Adding a trigger never re-encodes
// the precedence; changing the behavior is a one-function edit (`resolveBack`).
// Overlays register into an in-memory stack that `resolveBack` consults first.
// (A custom edge-swipe gesture trigger existed here too, ADR-0035 §5; retired
// by ADR-0099 — Android/desktop system-back and explicit back buttons/taps
// cover it, and the app no longer offers a custom gesture surface at all.)
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useSearchParams, type NavigateFunction } from 'react-router-dom';
import { CONTROL_ICON, type TabId } from '../constants';
import type { Mode } from '../lib/mode';
import { getNow } from '../lib/useClock';
import { useToast } from '../ui/Toast';
import { t } from '../i18n/he';

/** In-trip tab is a reload-surviving, deep-linkable URL param. Written with
 *  `replace` (never `push`) — history depth is not what resolves back, current
 *  state is (ADR-0090), so in-trip history stays flat. */
export const TAB_PARAM = 'tab';

/** Where `/settings` was entered from (ADR-0133 §2). It is the first shell route with
 *  more than one legitimate parent — from inside a trip back must land in the trip,
 *  from the all-trips home it must land there — and a single static parent would eject
 *  a member from their trip to edit their own name.
 *
 *  A CLOSED ENUM, never a path. An arbitrary `?return=<path>` would be an
 *  open-redirect shape and could strand back on a surface that no longer exists. In
 *  the URL rather than in memory, so it survives a reload exactly as `?tab=`/`?day=`
 *  do and back stays a pure function of nav state. */
export const SETTINGS_FROM_PARAM = 'from';
export const SETTINGS_FROM = { HOME: 'home', TRIPS: 'trips' } as const;
export type SettingsFrom = (typeof SETTINGS_FROM)[keyof typeof SETTINGS_FROM];

export const SETTINGS_PATH = '/settings';
export const SETTINGS_PICTURE_PATH = '/settings/picture';

/** The link to open your own settings, carrying its return target. */
export function settingsPath(from: SettingsFrom): string {
  return `${SETTINGS_PATH}?${SETTINGS_FROM_PARAM}=${from}`;
}
/** The selected day — the SINGLE source of truth for it (ADR-0035 §4, retained by
 *  ADR-0090); `activeDate` derives from this, there is no second copy in React
 *  state. Deep-linkable + reload-surviving via `?day=YYYY-MM-DD`. Home carries no
 *  `?day=`, so it always derives to today. Written with `replace`. */
export const DAY_PARAM = 'day';
/** Open the Index's bookings screen with one booking's DETAIL on top (ADR-0050's quick
 *  access). Named here beside the other params now that it has more than one reader. */
export const BOOKING_PARAM = 'booking';
/** …and the same for the other three hosts a note can point at (ADR-0153 §8's way-in
 *  amendment). Four params rather than one `?open=type:id`, because `?booking=` shipped with
 *  ADR-0050 and reads as what it is in a URL — what is shared is the DECISION of where each
 *  kind lives (`lib/note-host-target.ts`), not the spelling of the query string. A place
 *  needs none: the Map has a focus channel of its own. */
export const DOCUMENT_PARAM = 'doc';
export const EVENT_PARAM = 'event';
export const IDEA_PARAM = 'idea';
/** …and the fifth, which arrived with notifications (ADR-0197 §6): `?task=<id>` opens the
 *  tasks screen with that task's sheet on top. A task had no param because nothing outside
 *  the app had ever needed to name one — every way in was a tap on the row itself. */
export const TASK_PARAM = 'task';
/**
 * **`?trip=<id>` — the only param that says WHICH TRIP, and the only one a notification
 * cannot do without** (ADR-0197 §6).
 *
 * Every param above opens something *inside* the active trip. None of them could change
 * which trip that is, because it comes from `localStorage` alone (`state/active-trip-id`) —
 * which was invisible while every way in was a tap from inside the app, and is a
 * wrong-answer bug the moment a notification arrives from outside it. Consumed by
 * `ActiveTripIdProvider`, which sits ABOVE the router, so it reads `window.location`
 * directly rather than through `useSearchParams`.
 */
export const TRIP_PARAM = 'trip';
/**
 * **`?event=`'s other half: what the surface stamps on the row it names** (2026-08-20).
 *
 * The param says which card to open; landing on it means FINDING it, and both day surfaces
 * now answer to the same attribute — Trip's `EventCard` and Plan's builder row (whose own
 * `data-bld-id` this replaces, so the drag's `closest()` and the arrival ask one question).
 * Two surfaces reading one selector is the point: a place's reference sends you to a day
 * without knowing which mode will draw it.
 */
export const EVENT_ROW_ATTR = 'data-event';
export const eventRowSelector = (id: string): string => `[${EVENT_ROW_ATTR}="${id}"]`;

/**
 * **A one-shot id in the URL, taken and spent** (2026-08-20).
 *
 * Three surfaces run this discipline — the Index for `?booking=`/`?doc=`, both day surfaces
 * for `?event=`/`?idea=` — and the third copy is what makes it a function: read it, act on
 * it, and delete it, so a back or a reload does not re-open what you have since closed.
 *
 * It returns the value **on the render it arrives**, before its own effect has spent it, which
 * two callers need for different reasons: an effect keyed on it acts once (and once more with
 * `null`, which every caller already guards), and a decision taken AT MOUNT — the Day view's
 * "land on now", which must stand down when the arrival names a card — can see it at all.
 *
 * **`active: false` makes it wholly inert** — no value returned and, the half that matters,
 * the param NOT SPENT. Its one caller is the day peek (ADR-0200 §7), which renders a real day
 * surface for the day you are swiping toward: two mounted surfaces both reading `?event=`
 * means the preview consumes the arrival and the day you actually land on never sees it. That
 * was counted before it was written rather than found afterwards — every arrival effect on
 * both day screens keys off this hook, so one option covers all of them.
 */
export function useArrivalParam(name: string, { active = true } = {}): string | null {
  const [params, setParams] = useSearchParams();
  const value = active ? params.get(name) : null;
  useEffect(() => {
    if (value === null) return;
    const next = new URLSearchParams(params);
    next.delete(name);
    setParams(next, { replace: true });
  }, [name, value, params, setParams]);
  return value;
}
/** Which of the Index's sub-screens to open on arrival. `docs` is ADR-0050's; `bookings`
 *  joins it for the errand return below, and needs no id — the point is only to MOUNT the
 *  screen, not to open anything on top of it. */
export const FOCUS_PARAM = 'focus';
export const INDEX_FOCUS = { DOCS: 'docs', BOOKINGS: 'bookings', TASKS: 'tasks' } as const;

/** The same param pointed at the HOME tab (ADR-0190 §3). An automatic task's tap fires the
 *  one verb that resolves its check, and two of the five — book a flight, book a bed — open
 *  a seeded `BookingSheet` that lives on Plan Home. Tapping one from the tasks screen
 *  therefore has to leave, and it leaves the way this app already deep-links: the same
 *  `focus` key, a different destination tab.
 *
 *  The other three need nothing here, because Home is not where they live: an empty day is
 *  the day tab, a passport is the Index's own documents screen, and an invite is trip
 *  settings. "Navigate to where the thing is" is the rule; for three of five that is not
 *  Home at all. */
export const HOME_FOCUS = { ADD_FLIGHT: 'add-flight', ADD_LODGING: 'add-lodging' } as const;
export type HomeFocus = (typeof HOME_FOCUS)[keyof typeof HOME_FOCUS];

/** **Where a booking errand has to come back to** (session 172). The Index's bookings
 *  screen is view state inside `Index.tsx`, not a route (ADR-0098), so returning to the
 *  Index tab's URL renders the LANDING — and the host that would re-open the form is not
 *  mounted to hear the answer at all. That is the whole bug, and it is the same for a saved
 *  booking and an unsaved one: nothing is wrong with the errand's return channel, the
 *  listener simply is not there.
 *
 *  So the return asks the Index to mount that screen. It carries **no booking id** on
 *  purpose — the pending result is what says which booking and what was typed, and it is
 *  taken the moment the host mounts. An id here would be a second, weaker copy of that.
 *
 *  Applied only when the destination IS the Index tab: everywhere else the host stays
 *  mounted and the param would be litter nothing clears. */
export function withBookingFormReturn(path: string): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  if (params.get(TAB_PARAM) !== 'index') return path;
  params.set(FOCUS_PARAM, INDEX_FOCUS.BOOKINGS);
  return `${base}?${params.toString()}`;
}

/** The anchor tab: back from any other tab returns here, then exits to /trips. */
export const HOME_TAB: TabId = 'home';
/** Named beside `HOME_TAB` rather than written as a bare `'days'` at a new call site — the
 *  tasks screen's empty-day verb navigates here (ADR-0190 §3), and a typo'd tab id is a
 *  silent no-op rather than a compile error. */
export const DAYS_TAB: TabId = 'days';
/** Named beside the other two — the Trip Home task band deep-links here (ADR-0188 §6). */
export const INDEX_TAB: TabId = 'index';
/** Where leaving a trip lands (ADR-0033 all-trips home). */
const EXIT_TRIP_TO = '/trips';
/** Top-level entry surfaces where a structural back has nowhere in-app to go, so
 *  it is a no-op rather than falling off to /login or out of the app (ADR-0035
 *  §2.5 root guard, retained). Mirrors the root routes in `App.tsx` `AppRoutes`:
 *  the catch-all `/` (RootSurface / in-trip shell / zero-state), `/trips`
 *  (all-trips), and `/login`. Single-sourced so adding a new top-level surface is
 *  ONE obvious edit — shell routes (`/new`, `/join/:token`, `/trip/:id/settings`)
 *  are NOT roots; they back out to their parent, so they must stay off this list. */
const ROOT_PATHS: readonly string[] = ['/', '/trips', '/login'];
/** How long the "swipe again to leave the trip" confirmation stays armed. */
export const EXIT_CONFIRM_MS = 3000;

/** Idle-resume threshold (ADR-0060): a warm resume resets the view to Home +
 *  today only after the app was hidden at least this long (~30 min).
 *  Deliberately distinct from trip-state's 30-*second* data-resync — "reset the
 *  view to what-now" (minutes) vs "refresh the data" (seconds). */
export const RESET_TO_HOME_AFTER_HIDDEN_MS = 30 * 60 * 1000;

/** A snapshot of the navigation state — everything `resolveBack` needs. Built the
 *  same way by every trigger (from refs + the live URL + the overlay stack), so
 *  the tap, the gesture, and the system-back interceptor can never diverge. */
export interface NavSnapshot {
  /** Is any overlay (sheet/dialog/picker) currently open? */
  hasOverlay: boolean;
  /** Is the in-trip shell mounted? (Disambiguates `/` = trip Home from `/` =
   *  zero-state.) */
  insideTrip: boolean;
  /** The `?tab=` value; `null` or `home` means the Home base. */
  tab: string | null;
  /** The current pathname (for the shell-route parent + root guard). */
  pathname: string;
  /** The current query string — `/settings` resolves its parent from `?from=`
   *  (ADR-0133 §2), which is why the parent is a function of the whole location
   *  rather than the path alone. */
  search: string;
  /** Is the leave-trip confirm currently armed (a first back happened recently)? */
  armed: boolean;
}

/** What a single back resolves to. Each kind maps to exactly one effect in the
 *  executor; every one is an EXPLICIT navigation (or a no-nav side effect) — none
 *  is a blind history traversal. `to-home`/`to` navigate with `replace`. */
export type BackAction =
  | { kind: 'close-overlay' } // an overlay is open → close the topmost
  | { kind: 'to-home' } // non-Home tab in a trip → Home (explicit `/`)
  | { kind: 'arm-exit' } // Home base, first back → arm + toast
  | { kind: 'exit-trip' } // Home base, second back within window → /trips
  | { kind: 'to'; path: string } // a shell route → its explicit parent
  | { kind: 'none' }; // a root / nothing to peel → no-op

/** The one back-decision function (ADR-0090). A pure function of the current
 *  navigation state — no history stack, no history index, no "is Home provably
 *  behind" guessing. This IS the layer-peeling policy (ADR-0035 §2, unchanged):
 *  editing back behavior means editing the ordered rules here and nothing else.
 *
 *  1. an open overlay          → close the topmost;
 *  2. a non-Home tab in a trip → Home (explicit, so it can never strand);
 *  3. the Home base in a trip  → leave the trip (gated by a two-tap confirm);
 *  4. a shell route            → its parent (explicit, cold-launch safe);
 *  5. a root surface           → no-op (never falls off-app). */
export function resolveBack(s: NavSnapshot): BackAction {
  if (s.hasOverlay) return { kind: 'close-overlay' };
  if (s.insideTrip) {
    if (s.tab && s.tab !== HOME_TAB) return { kind: 'to-home' };
    return s.armed ? { kind: 'exit-trip' } : { kind: 'arm-exit' };
  }
  if (ROOT_PATHS.includes(s.pathname)) return { kind: 'none' };
  return { kind: 'to', path: parentRoute(s.pathname, s.search) };
}

/** The explicit parent a shell route backs out to (ADR-0090 §4 — deterministic,
 *  so a cold deep link onto the route backs out correctly with no history behind
 *  it). Trip-settings (`/trip/:id/settings`) is opened from inside the trip, so
 *  its parent is the trip Home (`/`, which RootSurface resolves to the active
 *  trip); create/join back out to the all-trips home. */
function parentRoute(pathname: string, search = ''): string {
  // The picture page is a child of the settings page, and it hands the return
  // target back up so one more back still lands where you came from.
  if (pathname === SETTINGS_PICTURE_PATH) return `${SETTINGS_PATH}${search}`;
  if (pathname === SETTINGS_PATH) {
    const from = new URLSearchParams(search).get(SETTINGS_FROM_PARAM);
    // Anything unrecognised — a hand-typed link, a stale bookmark, a missing param
    // — falls to the all-trips home, the safe parent for a deep link nobody
    // navigated to.
    return from === SETTINGS_FROM.HOME ? '/' : EXIT_TRIP_TO;
  }
  if (pathname.startsWith('/trip/')) return '/';
  return EXIT_TRIP_TO;
}

/** Whether a back action moves to a new screen (a slide-off animation) vs. stays
 *  put (a spring-back). The gesture uses it to pick its animation before content
 *  swaps. `close-overlay`/`arm-exit`/`none` keep the current screen. */
export function backSlides(action: BackAction): boolean {
  return action.kind === 'to-home' || action.kind === 'to' || action.kind === 'exit-trip';
}

/** Which way the shell's route transition travels (ADR-0140).
 *
 *  Forward and back must NOT look the same, or the motion carries no information and
 *  becomes decoration you learn to ignore. Direction is therefore a real fact that
 *  has to come from somewhere — and per ADR-0090 that somewhere is never history:
 *  nothing may read `history.length` or traverse to find out where it is.
 *
 *  So it rides the navigation itself, in the router's own `location.state`. A back
 *  that moves to another screen (`backSlides`) stamps it; every ordinary
 *  `navigate(...)` in the app stamps nothing and therefore reads as forward, which
 *  is the correct default and needs no call-site changes. Carrying it on the entry
 *  rather than in a ref is also what makes it survive a re-render and Strict Mode's
 *  double-invoke, both of which would drop a consume-once flag.
 *
 *  `HANDOFF` is not a direction but a MANNER of arrival, and it rides the same key on
 *  purpose: a second channel saying the same kind of thing about the same navigation is
 *  the duplication rule 8 exists to prevent. It marks an arrival that brings its own
 *  shared element (the trip handoff, ADR-0140 §7), which the shell must answer by not
 *  translating — a screen sliding under a flying glyph is two answers to one question,
 *  and an ancestor mid-transform also makes the landing target unmeasurable. */
export const NAV_DIR = { FORWARD: 'forward', BACK: 'back', HANDOFF: 'handoff' } as const;
export type NavDir = (typeof NAV_DIR)[keyof typeof NAV_DIR];

/** Read the direction off a `location.state`, defaulting to forward. Tolerates the
 *  state being absent, null, or some other shape entirely — anything can push an
 *  entry, so this may not assume our own key is there. */
export function navDirectionFrom(state: unknown): NavDir {
  const dir = (state as { navDir?: unknown } | null)?.navDir;
  if (dir === NAV_DIR.BACK) return NAV_DIR.BACK;
  if (dir === NAV_DIR.HANDOFF) return NAV_DIR.HANDOFF;
  return NAV_DIR.FORWARD;
}

/** The correction applied when the platform delivered a structural system-back
 *  NON-cancelable, so the interceptor could not `preventDefault` it. Under the
 *  activation gate a consecutive system-back (no interaction between presses) grants
 *  no consumable user activation, so the traverse is not cancelable (WHATWG
 *  nav-history spec) — the OS then rides onto the same-URL guard entry (trip Home).
 *  For a trip *exit* that strands the user back on Home instead of All Trips: the
 *  reported "press again to leave, second back loops to trip home" bug. Every other
 *  action already lands correctly on that same-URL entry (an arm keeps Home, a
 *  to-home keeps Home, a root `none` is a legitimate native exit), so only an exit
 *  needs correcting — redirect to /trips once the uncatchable traversal commits. */
export type BackCorrection = { kind: 'redirect-exit' } | { kind: 'none' };
export function correctionForUncancelableBack(action: BackAction): BackCorrection {
  return action.kind === 'exit-trip' ? { kind: 'redirect-exit' } : { kind: 'none' };
}

/** Which tab a URL's params address. Home carries no `?tab=`, so an absent one IS
 *  `home` rather than "unknown" — every in-trip screen lives under exactly one tab. */
export function tabOfParams(params: URLSearchParams): TabId {
  return (params.get(TAB_PARAM) as TabId | null) ?? HOME_TAB;
}

/** Where a tab tap navigates (ADR-0090). Always `replace` — history depth doesn't
 *  resolve back, `resolveBack` does, so in-trip history stays flat. Home → the
 *  clean `/` (no params, so `activeDate` derives to today); any other tab → its
 *  `?tab=` URL, carrying `day` when it is given one. A no-op when already on the
 *  target is the caller's guard.
 *
 *  **The day is a parameter because a lateral move must not lose it** (field report
 *  #39). `activeDate` derives from `?day=` alone (ADR-0035 §4), so a target without
 *  the param resolves the day back to today: entering the Map by tapping a day kept
 *  the day, entering it from the tab bar silently forgot it. The three way-ins in
 *  `map-scope-state` were each appending `&day=` to this function's output by hand —
 *  the one-off that this parameter collapses rather than being copied a fourth time
 *  (rule 8). `dayCarriedFrom` decides WHICH day; `?day=` remains its only copy.
 *
 *  Home takes no day whatever it is handed: it is today-anchored in both modes, and
 *  the clean `/` is what makes that structural rather than an effect (ADR-0035 §4). */
export function tabTarget(next: TabId, day?: string | null): string {
  if (next === HOME_TAB) return '/';
  return `/?${TAB_PARAM}=${next}${day ? `&${DAY_PARAM}=${day}` : ''}`;
}

/** The day a lateral move carries forward — the "remembered day" of field report #39,
 *  which is the `?day=` param itself and never a second copy of it in React state
 *  (ADR-0035 §4; `trip-state` records what that second copy used to do). So this is a
 *  pure read of the URL you are leaving, and the whole of the remembering.
 *
 *  It rides to the Index too, which is what lets Day → Index → Day come back to the
 *  day you left: the Index does not date-filter anything and its strip singles out no
 *  pill (`tabShowsSelectedDay`), so the param is remembered there without being shown.
 *
 *  Nothing rides out of Home: Home derives to today in both modes, so a stray `?day=`
 *  on a Home URL is already ignored there and must not come back to life by leaving. */
export function dayCarriedFrom(params: URLSearchParams): string | null {
  return tabOfParams(params) === HOME_TAB ? null : params.get(DAY_PARAM);
}

/** Tabs that are day-scoped surfaces (ADR-0110 §4): tapping a strip day focuses
 *  that day IN PLACE instead of routing to the Day view. The Day view was the
 *  only such surface; the Map joins it (its content is "this day's places"). */
export const DAY_SCOPED_TABS = new Set<TabId>(['days', 'map']);

/** Whether the header's day strip singles out a selected pill on this tab (field
 *  report #39). The two day-scoped surfaces show one day's content, and Home is
 *  today-anchored (ADR-0035 §4) — on all three, a selected day is a fact about what
 *  you are looking at. The **Index is trip-wide**: its cards, counts and readiness
 *  are the whole trip, so no pill there is "the selected one" — the remembered day
 *  stays in the URL (`dayCarriedFrom`) without being displayed, and is shown again
 *  the moment you return to a day surface.
 *
 *  The pills stay TAPPABLE on the Index: a tap from a non-day-scoped tab routes to
 *  the Day view (`daySelectTarget`), which is how you pick a day from there. */
export function tabShowsSelectedDay(tab: TabId): boolean {
  return DAY_SCOPED_TABS.has(tab) || tab === HOME_TAB;
}

/** Where a day-selection lands (ADR-0035 §4, single-source day; retained). The
 *  selected day lives in exactly ONE place — the `?day=` URL param — and
 *  `activeDate` derives from it (state/trip-state), so there is no second copy to
 *  reset or keep in sync. `date === today` omits `?day=` so the URL stays clean
 *  and Home derives to today. Always `replace` (a lateral view change, never a new
 *  history entry): back from a day goes to Home via `resolveBack`, not by walking
 *  the days you tapped.
 *
 *  Tab-aware (ADR-0110 §4): from a day-scoped tab (Day view or Map) it PRESERVES
 *  that tab so the day focuses in place; from anywhere else it routes to the Day
 *  view (`days`), the canonical day surface — the strip's real, already-shipped
 *  rule, now literally true for two surfaces instead of coincidentally one. */
export function daySelectTarget(
  date: string,
  today: string,
  currentTab: TabId = 'days',
): { to: string; replace: boolean } {
  const dayQuery = date === today ? '' : `&${DAY_PARAM}=${date}`;
  const tab = DAY_SCOPED_TABS.has(currentTab) ? currentTab : 'days';
  return { to: `/?${TAB_PARAM}=${tab}${dayQuery}`, replace: true };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve the `?day=` param to a selected day (J7 / review Q5). A missing,
 *  malformed, or out-of-range value falls back to `fallback` (today, clamped to
 *  the trip range) so a stale or hostile deep link lands gracefully on today
 *  instead of an empty/undefined day. Range is a lexical compare, valid for ISO
 *  date strings (matches `lib/time.clampDate`). */
export function resolveActiveDate(
  param: string | null,
  startDate: string,
  endDate: string,
  fallback: string,
): string {
  if (!param || !ISO_DATE.test(param)) return fallback;
  if (param < startDate || param > endDate) return fallback;
  return param;
}

/** Whether a warm resume should reset navigation to Home + today (ADR-0060):
 *  only after a real idle stretch (≥ RESET_TO_HOME_AFTER_HIDDEN_MS) and only in
 *  Trip mode; a brief app-switch resumes in place, and Plan mode is never
 *  today-anchored. */
export function shouldResetToHomeOnResume(awayMs: number, mode: Mode): boolean {
  return awayMs >= RESET_TO_HOME_AFTER_HIDDEN_MS && mode === 'trip';
}

// Minimal shape of the Navigation API we use (lib.dom lacks it in this TS
// version). Present on Chromium (Android/desktop); absent on Safari/iOS, which
// has no system back to intercept and (since ADR-0099 retired the custom edge
// gesture) no in-app gesture back either — iOS navigates via explicit taps
// only (tabs, back buttons, backdrop-to-close).
interface NavigateEventLike extends Event {
  navigationType: string;
  cancelable: boolean;
  destination?: { index: number };
}
interface NavigationLike extends EventTarget {
  currentEntry?: { index: number } | null;
}
function getNavigation(): NavigationLike | undefined {
  return (window as unknown as { navigation?: NavigationLike }).navigation;
}

/** What a back layer's handler reports after handling a back: whether its owner
 *  remains an active back layer afterwards. `true` — the layer handled the back
 *  but stays (a repeatable layer, e.g. resetting a filter without leaving the
 *  screen), so it is NOT removed and peels the next back too. `false` — the layer
 *  is now done (a closed overlay/subview), so it leaves the stack. The executor
 *  peels off this result instead of unconditionally popping (ADR-0103) — the fix
 *  for a handler that consumes a back yet keeps its owner mounted. */
export type BackResult = { remainsActive: boolean };

type OverlayEntry = { id: number; handle: () => BackResult };

interface NavContextValue {
  registerOverlay: (handle: () => BackResult) => number;
  unregisterOverlay: (id: number) => void;
  closeAllOverlays: () => void;
  hasOverlay: () => boolean;
  setInsideTrip: (v: boolean) => void;
  insideTripRef: React.MutableRefObject<boolean>;
  /** Read the current back action from live state (for the gesture's animation
   *  choice, and as the first half of a single-shot back). Pure — no side effect. */
  classifyBack: () => BackAction;
  /** Execute a back action. The one place every effect lives. */
  runBack: (action: BackAction) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

/** **Every structural back is an explicit navigation — never a traversal.**
 *
 *  That is ADR-0090's rule, and session 177 made it load-bearing in a second way: the app
 *  leaves history entries behind it that are harmless ONLY because nothing walks into them.
 *  A place errand strands a `?tab=map` entry on every round trip, so the first back that
 *  traversed instead of navigating would drop the user on a screen they never asked for.
 *  A lint rule bans the traversal calls themselves (`BACK_TRAVERSAL_SELECTORS`); this switch
 *  is the other half — exhaustive over `BackAction`, so a new kind cannot slip through as a
 *  silent no-op and get "fixed" later by reaching for `history.back()`. */
function runStructural(navigate: NavigateFunction, action: BackAction): void {
  // Every navigation here is a back that MOVES (`backSlides` is exactly this set), so
  // each one stamps the direction for the shell's route transition (ADR-0140). The
  // stamp lives on the navigation rather than in a flag the shell polls, so it cannot
  // arrive a frame late or be consumed by the wrong render.
  const back = { state: { navDir: NAV_DIR.BACK } };
  switch (action.kind) {
    case 'to-home':
      navigate('/', { replace: true, ...back });
      break;
    case 'to':
      navigate(action.path, { replace: true, ...back });
      break;
    // The one deliberate push: leaving a trip is not a lateral move, so it earns an entry
    // (the asymmetry session 170's audit flagged as #4 and left standing).
    case 'exit-trip':
      navigate(EXIT_TRIP_TO, back);
      break;
    // Resolved by `runBack` without any navigation at all — peeling a layer, arming the
    // leave confirm, or a root where back is a no-op.
    case 'close-overlay':
    case 'arm-exit':
    case 'none':
      break;
    default: {
      const _exhaustive: never = action;
      break;
    }
  }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<OverlayEntry[]>([]);
  const seqRef = useRef(0);
  const insideTripRef = useRef(false);
  const exitPendingRef = useRef(0);
  // History-backed overlays (ADR-0103): each active overlay layer owns one same-URL
  // history "marker" entry ahead of the base screen. A system-back then RIDES the
  // traversal off a marker to close the top layer instead of cancelling the back —
  // because a user-initiated backward traverse is only cancelable while a consumable
  // user activation exists (WHATWG nav-history spec), so peeling several stacked
  // overlays with several back presses exhausts it and the OS force-exits the app
  // (verified on staging: back 4 came back `cancelable=false` at a fixed index).
  // `markerDepthRef` counts markers pushed. Marker management is PUSH-ONLY (never a
  // programmatic history.back) so it's robust to double-invoked effects (Strict
  // Mode) and needs no async reconciliation: an overlay closed off-back leaves a
  // "spent" marker a later back harmlessly consumes.
  //
  // **AND THE COUNT IS PER-URL** (session 175, reproduced in a browser). A marker is
  // only ridable from the entry it was pushed at — riding one pushed at a DIFFERENT
  // URL does not close a layer, it navigates you off the screen. So the depth is
  // scoped to the URL it was counted at: when the app navigates, every marker behind
  // is spent as far as the new screen is concerned, and the layers that register here
  // need markers of their own. Without this the count leaked across navigations —
  // two Index overlays closing as an errand navigated to the Map left depth 2, so the
  // Map's own two layers were "already markered" and got none, and one back rode
  // straight off the tab onto a stale `?tab=index` entry. That is the owner's _"it
  // sometimes exits to the main screen"_, and ADR-0103's accepted tradeoff (at most
  // one NO-OP back) never included leaving the screen.
  const markerDepthRef = useRef(0);
  const markerUrlRef = useRef<string | null>(null);
  const currentUrl = () => window.location.pathname + window.location.search;
  const navigate = useNavigate();
  const showToast = useToast();

  // Build the current snapshot from refs + the live URL + the overlay stack.
  // Usable outside React render (the system-back listener runs in a DOM event),
  // so it reads `window.location` rather than router hooks.
  const snapshot = useCallback(
    (): NavSnapshot => ({
      hasOverlay: stackRef.current.length > 0,
      insideTrip: insideTripRef.current,
      tab: new URLSearchParams(window.location.search).get(TAB_PARAM),
      pathname: window.location.pathname,
      search: window.location.search,
      armed: getNow() - exitPendingRef.current < EXIT_CONFIRM_MS,
    }),
    [],
  );

  const classifyBack = useCallback(() => resolveBack(snapshot()), [snapshot]);

  const runBack = useCallback(
    (action: BackAction) => {
      switch (action.kind) {
        case 'close-overlay': {
          // Peel the topmost layer NON-destructively: run its handler, and only
          // drop it from the stack if it reports it's no longer active. A
          // repeatable layer (e.g. an Index filter reset) stays mounted AND
          // registered, so the next back still peels there instead of leaking
          // past the still-visible screen into a structural step (ADR-0103).
          // Removal is by identity — the owner's own unmount cleanup then no-ops.
          const stack = stackRef.current;
          const top = stack[stack.length - 1];
          if (top && !top.handle().remainsActive) {
            const i = stack.indexOf(top);
            if (i >= 0) stack.splice(i, 1);
          }
          break;
        }
        case 'arm-exit':
          exitPendingRef.current = getNow();
          showToast(CONTROL_ICON.navigate, t.shell.leaveTripHint);
          break;
        case 'exit-trip':
          exitPendingRef.current = 0;
          runStructural(navigate, action);
          break;
        case 'to-home':
        case 'to':
          runStructural(navigate, action);
          break;
        case 'none':
          break;
      }
    },
    [navigate, showToast],
  );

  // Marker helpers (ADR-0103) — keep the marker-entry count in step with the overlay layer
  // count. `pushMarker` adds one same-URL entry (a router push, like the guard, so
  // React Router stays the sole history writer); `backOffMarker` removes a stray one
  // (an overlay closed off-back) by traversing off it ourselves, suppressed so the
  // interceptor doesn't treat it as a user back. Gated on the Navigation API — with
  // no system-back to ride (iOS/Safari), overlays keep the plain in-memory model.
  const pushMarker = useCallback(() => {
    markerDepthRef.current += 1;
    markerUrlRef.current = currentUrl();
    navigate(currentUrl());
  }, [navigate]);

  /** Markers counted at another URL are behind us now, so none of them is ridable from
   *  here — the count starts again for this screen. */
  const forgetMarkersFromElsewhere = useCallback(() => {
    if (markerUrlRef.current === currentUrl()) return;
    markerDepthRef.current = 0;
    markerUrlRef.current = currentUrl();
  }, []);

  const reconcileMarkers = useCallback(() => {
    if (!getNavigation()) return;
    forgetMarkersFromElsewhere();
    // Push-only: give any un-markered layer its marker. We never programmatically
    // pop — an overlay closed off-back (X / backdrop / Escape / arrow / unmount)
    // leaves a "spent" marker that a later back harmlessly consumes. Tradeoff:
    // at most one no-op back after an off-back close, in exchange for dropping the
    // fragile async history.back() reconciliation (which races Strict Mode's
    // double-mount and any rapid re-render).
    while (markerDepthRef.current < stackRef.current.length) pushMarker();
  }, [pushMarker, forgetMarkersFromElsewhere]);

  // **AND MARKERS FOLLOW THE URL, not just the layer stack** (owner, session 177: _"back
  // (goes back to event form) → back (closes app instead of closing the modal)"_).
  //
  // Reconciling only on register/unregister assumed a layer's URL never moves under it. Every
  // errand return breaks that: the form re-opens and THEN the destination rewrites its own URL
  // with `replace` — the Index stripping `?focus=bookings` once it has acted, `cancelErrand`
  // navigating to `returnTo`. The layer stays registered across it, so nothing reconciled, and
  // its marker was left describing a URL the app had already left. `ridable` then reads false
  // with a layer plainly open.
  //
  // A cancelable press hides this completely — the fallback cancels and peels — which is why
  // it survived a browser harness where every traversal is cancelable. The device does not
  // grant that: consecutive presses arrive UNCANCELABLE (the activation gate this whole
  // scheme exists for), and then there is nothing to ride and nothing to cancel, so the
  // traversal commits and takes the screen with it. From the trip's first form that is the
  // app closing.
  //
  // Re-running the same reconcile on every location change fixes it at the source: the
  // per-URL depth resets and each still-open layer gets a marker HERE. It cannot loop —
  // `pushMarker` navigates to the same URL, so the next pass finds depth already matching
  // the stack and pushes nothing.
  const location = useLocation();
  useEffect(() => {
    reconcileMarkers();
  }, [location.key, reconcileMarkers]);

  // Route the platform system-back (Android hardware/edge back, desktop button)
  // through the SAME resolveBack as every other trigger (ADR-0090). Two paths:
  //   • An OVERLAY is open → close the topmost layer by RIDING the traversal off its
  //     marker entry (never preventDefault) — cancelling consecutive backs needs a
  //     user activation the platform won't grant, so we let the traversal commit
  //     (same URL, nothing visible moves) and close the layer in response.
  //   • No overlay → STRUCTURAL back: keep the ADR-0090 interception (preventDefault
  //     + the explicit resolveBack action). Needs a cancelable traverse; the guard
  //     fuel makes in-trip ones cancelable. A non-cancelable structural back (true
  //     root / exhausted) is let through so the OS can leave.
  // Our own `push`/`replace` navigations aren't `traverse`, so they don't re-enter.
  useEffect(() => {
    const navApi = getNavigation();
    if (!navApi) return; // Safari/iOS: no system back to intercept.
    const onNavigate = (evt: Event) => {
      const e = evt as NavigateEventLike;
      if (e.navigationType !== 'traverse') return;
      const destIdx = e.destination?.index;
      const curIdx = navApi.currentEntry?.index;
      // Let a forward traverse (redo) pass.
      if (typeof destIdx === 'number' && typeof curIdx === 'number' && destIdx > curIdx) return;

      // Overlay open → close the topmost layer, running its OWN handler so a system
      // back and the layer's visible control (✕ / ביטול / the back arrow) do the same
      // thing (owner, session 175). Riding a marker is how we avoid needing to cancel;
      // it is not a different outcome.
      if (stackRef.current.length > 0) {
        // Only a marker pushed AT THIS URL is ridable — see `markerUrlRef`. Riding
        // anything else navigates off the screen instead of peeling a layer.
        const ridable = markerUrlRef.current === currentUrl() && markerDepthRef.current > 0;
        const peel = () => {
          const stack = stackRef.current;
          const top = stack[stack.length - 1];
          const res = top?.handle();
          if (res?.remainsActive) {
            // A repeatable layer (an Index filter reset, ADR-0103) stays mounted —
            // re-push its marker once this traversal commits so the next back peels
            // it again.
            queueMicrotask(() => reconcileMarkers());
          } else if (top) {
            // A dismissible layer is done → drop it NOW so the marker count stays in
            // step (its own unmount/unregister then no-ops), rather than waiting for
            // the async unmount and risking a spurious re-push in between.
            const i = stack.indexOf(top);
            if (i >= 0) stack.splice(i, 1);
          }
        };
        if (ridable) {
          markerDepthRef.current = Math.max(0, markerDepthRef.current - 1);
          peel();
          return; // no preventDefault — the marker is popped, the layer is handled.
        }
        // No marker here to ride. Cancel the traversal instead and peel anyway, which
        // is ADR-0090's original interception — correct whenever the platform grants a
        // cancelable traverse, and strictly better than riding an entry that belongs to
        // another screen. With per-URL markers this is a safety net rather than the
        // usual path: a registered layer normally has its own marker by now.
        if (e.cancelable) {
          e.preventDefault();
          peel();
          return;
        }
        // Uncancelable AND unmarkered: nothing can stop the traverse, so let it commit
        // and re-marker whatever layers survive it rather than leaving the count lying
        // about what is on screen.
        queueMicrotask(() => reconcileMarkers());
        return;
      }

      // Structural back.
      const action = classifyBack();
      if (!e.cancelable) {
        // The activation gate withheld a cancelable traverse, so we can't stop this
        // back — the OS rides onto the same-URL guard entry (trip Home). For a trip
        // exit that lands on Home, not All Trips (the reported "second back loops to
        // trip home"). Let the traverse commit, then redirect to /trips in a
        // microtask (mirroring the overlay ride) so the exit still reaches its
        // resolved destination (ADR-0103 device-validation follow-up). Our navigate
        // is a push, not a traverse, so it doesn't re-enter this handler.
        if (correctionForUncancelableBack(action).kind === 'redirect-exit') {
          exitPendingRef.current = 0;
          queueMicrotask(() => navigate(EXIT_TRIP_TO));
        }
        return;
      }
      if (action.kind === 'none') return; // nothing to peel → let the OS proceed.
      e.preventDefault();
      runBack(action);
    };
    navApi.addEventListener('navigate', onNavigate);
    return () => navApi.removeEventListener('navigate', onNavigate);
  }, [classifyBack, runBack, reconcileMarkers, navigate]);

  const value = useMemo<NavContextValue>(
    () => ({
      registerOverlay: (handle) => {
        const id = ++seqRef.current;
        stackRef.current.push({ id, handle });
        reconcileMarkers(); // give the new overlay its history marker.
        return id;
      },
      unregisterOverlay: (id) => {
        const i = stackRef.current.findIndex((o) => o.id === id);
        if (i >= 0) stackRef.current.splice(i, 1);
        // an overlay closed off-back (X / backdrop / Escape / in-app arrow /
        // unmount) leaves a stray marker — reconcile pops it. A back-close already
        // popped its marker via the traversal, so this is then a no-op.
        reconcileMarkers();
      },
      // Drain the whole stack (ADR-0060 idle-resume): snapshot then clear before
      // handling, so each handler's unregister can't splice the array mid-loop.
      // The result is ignored — the idle-resume reset navigates to Home right
      // after, unmounting every layer regardless of what it reports.
      closeAllOverlays: () => {
        const all = stackRef.current.splice(0);
        for (const o of all) o.handle();
        reconcileMarkers(); // drop every marker to match the emptied stack.
      },
      hasOverlay: () => stackRef.current.length > 0,
      setInsideTrip: (v) => {
        insideTripRef.current = v;
      },
      insideTripRef,
      classifyBack,
      runBack,
    }),
    [classifyBack, runBack, reconcileMarkers],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within <NavProvider>');
  return ctx;
}

/** Register the calling component as the topmost back LAYER while it is mounted.
 *  On a back trigger the handler runs and reports whether the layer remains
 *  active: `{ remainsActive: true }` handles the back but stays registered (a
 *  repeatable layer — e.g. resetting a filter without leaving the screen), so the
 *  next back peels here again; `{ remainsActive: false }` hands off (the owner
 *  closes/unmounts). The stack peels non-destructively off this result (ADR-0103).
 *  Latest-ref so a re-created handler is honored without re-registering (no
 *  duplicate stack entry across renders / Strict Mode).
 *
 *  `active` is for a layer whose OWNER outlives it — a state a mounted screen
 *  enters and leaves, rather than a component that appears and unmounts. The Map's
 *  open query field is the first (ADR-0132 §5): the screen is always mounted, so it
 *  cannot express "there is something to peel" by existing. Registering
 *  unconditionally would make `hasOverlay` permanently true and back would never
 *  leave the tab, so the flag gates the registration rather than the handler. */
export function useBackLayer(handle: () => BackResult, active = true) {
  const { registerOverlay, unregisterOverlay } = useNav();
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    if (!active) return;
    const id = registerOverlay(() => handleRef.current());
    return () => unregisterOverlay(id);
  }, [active, registerOverlay, unregisterOverlay]);
}

/** A dismissible overlay: one back closes it (its owner then unmounts). A thin
 *  shim over `useBackLayer` for the common "always closes" case — used by the
 *  `Modal` primitive, so every sheet/dialog inherits back-to-close with no
 *  call-site work. Reach for `useBackLayer` directly when a back should sometimes
 *  be consumed without leaving the screen (ADR-0103).
 *
 *  It also makes **Escape a back trigger** (ADR-0103 §2's deferred "Escape
 *  unification", built 2026-08-01) — see `useEscapeAsBack`. */
export function useOverlay(onClose: () => void) {
  useBackLayer(() => {
    onClose();
    return { remainsActive: false };
  });
  useEscapeAsBack();
}

/** **Escape is a back trigger, and back has one owner** (ADR-0103 §2).
 *
 *  It used to be a second, independent close path: `useDialogFocus` called the
 *  Modal's own `onClose` directly. That is indistinguishable from back for a plain
 *  overlay — which is why ADR-0103's session-176 amendment recorded `Modal` as
 *  already honouring the rule — and wrong the moment a **second layer sits above
 *  the Modal's own**. Then system back peeled the top layer while Escape reached
 *  past it and dismissed the whole sheet: the builder row's `הזז` step, Plan mode's
 *  resolve sheet, and — the case that loses typing — a `TimePicker`/`IconPicker`
 *  panel open inside a form, where Escape closed the FORM.
 *
 *  Running the resolver instead makes the handler's position irrelevant: whoever
 *  catches the key, the stack decides what peels. That is also what fixes nested
 *  overlays, where every open Modal had added its own listener to `document` and
 *  `stopPropagation` does not stop siblings on the same target — so two sheets
 *  closed on one press. `stopImmediatePropagation` leaves exactly one owner.
 *
 *  **Scope is deliberately unchanged**, which resolves ADR-0103's open "Escape
 *  scope" question in favour of its own chosen default (overlays + search, not
 *  filters or subviews) — and needs no layer typing to do it, because the split
 *  already exists: this hook lives in `useOverlay`, while filters and subviews
 *  register through `useBackLayer` directly and Escape leaves them alone. */
function useEscapeAsBack() {
  const back = useAppBack();
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture + immediate-stop: one press, one peel, no matter how many
      // overlays are stacked or which of them owns the listener that fired.
      e.stopImmediatePropagation();
      e.preventDefault();
      backRef.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

/** Close every open overlay at once. Used by the idle-resume reset (ADR-0060) so
 *  a long-idle reopen lands on a clean Home, not Home under a stale sheet. */
export function useCloseAllOverlays(): () => void {
  return useNav().closeAllOverlays;
}

/** Is any overlay layer open right now? Returns the QUESTION, not the answer —
 *  the stack is a ref, so this deliberately does not re-render its caller. Asked
 *  by the automatic build swap (ADR-0185) at the moment it is about to reload:
 *  an open sheet is half-filled work, and this is the one registry that knows. */
export function useHasOverlay(): () => boolean {
  return useNav().hasOverlay;
}

/** Marks that the in-trip shell is mounted, so `resolveBack` applies the in-trip
 *  precedence (tab → Home → /trips) rather than the shell-route rules. */
export function useMarkInsideTrip() {
  const { setInsideTrip } = useNav();
  useEffect(() => {
    setInsideTrip(true);
    return () => setInsideTrip(false);
  }, [setInsideTrip]);
}

// True for the lifetime of THIS document; a real page load re-evaluates the module
// and resets it, a client-side route change does not. Lets the guard tell a fresh
// document load (cold launch / reload / WebView eviction / OAuth return) apart from
// in-app navigation — see `needsBackGuard`.
let freshDocumentLoad = true;

/** Android/Chromium system-back guard (ADR-0090). The OS back is a history
 *  *traversal*: to intercept it we need a **same-document** entry behind the current
 *  one to traverse into — only a same-document traverse is cancelable. Two ways to
 *  end up without one, both of which let the OS back leave the app uncatchably
 *  (a non-cancelable traverse the interceptor's `!cancelable` check bails on):
 *   1. a cold launch straight into the live trip (`resolveLanding`) sits at the
 *      very bottom of the stack (index 0) with nothing behind — the classic
 *      installed-PWA case; and
 *   2. a **fresh document load landing above older entries** — a reload, a WebView
 *      eviction/restore (e.g. after the camera), or an OAuth full-page round-trip.
 *      Those older entries belong to a PRIOR document, so traversing into them is
 *      non-cancelable even though the index is > 0. This is the "sometimes back
 *      closes the app" bug: verified on staging as `cancelable=false` on a mid-stack
 *      `idx 3->2` back, which the old index-0-only guard never covered.
 *  In both cases push one duplicate same-URL "guard" entry so the OS back traverses
 *  into an in-app, cancelable entry the interceptor handles — it `preventDefault()`s
 *  before the URL changes, so the guard is never consumed (every in-trip back is
 *  cancelled, so the index never drops onto it). This is the *fuel* the OS back
 *  needs; the back *decision* stays a pure function of state (`resolveBack`), never
 *  reading history. No-op without the Navigation API (iOS/Safari has no OS back to
 *  guard — and, since ADR-0099 retired the custom edge gesture, no in-app gesture
 *  back either; iOS navigates via explicit taps only). */
export function useTripBackGuard() {
  const navigate = useNavigate();
  const armedRef = useRef(false);
  useEffect(() => {
    if (armedRef.current) return;
    const navApi = getNavigation();
    if (!navApi) return; // iOS/Safari: no system back to guard against.
    if (!needsBackGuard(navApi.currentEntry?.index, freshDocumentLoad)) return;
    freshDocumentLoad = false; // this document now has its own fuel entry.
    armedRef.current = true;
    navigate(window.location.pathname + window.location.search); // push a same-URL guard.
  }, [navigate]);
}

/** Whether the trip shell needs a guard history entry pushed behind it. True when
 *  there is no same-document, interceptable entry behind the current one:
 *   - the very bottom of the whole stack (index 0 — a cold launch), or
 *   - a fresh document load (`freshLoad`), whose current entry is always the floor
 *     of THIS document: everything behind it belongs to a prior document (reload /
 *     eviction / OAuth), so a back into it is a non-cancelable cross-document
 *     traverse the interceptor can't stop. A fresh load therefore needs fuel even
 *     at index > 0 — the case the earlier index-0-only guard missed.
 *  A same-document client-side navigation (`freshLoad` false) at index > 0 already
 *  has cancelable fuel behind it and needs none. Pure so the guard trigger is
 *  unit-tested without a Navigation API. */
export function needsBackGuard(
  currentIndex: number | null | undefined,
  freshLoad: boolean,
): boolean {
  return freshLoad || (currentIndex ?? 0) === 0;
}

/** The in-trip tab (ADR-0090). Every move is an explicit `replace` to the tab's
 *  URL; back is resolved from state, not from history depth, so there is no
 *  push/anchor bookkeeping to keep in sync.
 *
 *  **The day you are on rides along** (field report #39): the tab bar's move used to
 *  navigate to a bare `?tab=`, which is the one place the remembered day was being
 *  dropped — see `tabTarget`/`dayCarriedFrom`, which now decide that for every
 *  caller instead of each one appending the param itself. */
export function useTripTab(): { tab: TabId; goToTab: (t: TabId) => void } {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tab = tabOfParams(params);
  const goToTab = useCallback(
    (next: TabId) => {
      if (next === tab) return;
      navigate(tabTarget(next, dayCarriedFrom(params)), { replace: true });
    },
    [tab, params, navigate],
  );
  return { tab, goToTab };
}

/** The return controls (ADR-0090). `classify()` reports what a back *would* do —
 *  so the gesture can play the right animation before content swaps — and `run()`
 *  performs it. Split apart precisely so a structural slide-off can finish before
 *  `navigate` changes the screen underneath it. Thin wrappers over the provider's
 *  single `classifyBack`/`runBack`, shared with the system-back interceptor. */
export function useReturnControls() {
  const { classifyBack, runBack } = useNav();
  return { classify: classifyBack, run: runBack };
}

/** Convenience single-shot back for non-animated callers (a header/back button, a
 *  key handler). Returns the action it ran. The gesture uses classify/run
 *  directly so it can animate between the two halves. */
export function useAppBack(): () => BackAction {
  const { classifyBack, runBack } = useNav();
  return useCallback(() => {
    const action = classifyBack();
    runBack(action);
    return action;
  }, [classifyBack, runBack]);
}
