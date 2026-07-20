// In-app navigation model (ADR-0090, superseding ADR-0035's mechanism; its
// behavior is unchanged). The app's current navigation state — inside a trip? on
// which tab? is an overlay open? which route? — fully determines what "back"
// does, so back is a PURE function of that state (`resolveBack`) executed as an
// explicit navigation. We never call `history.back()` / `navigate(-1)` for
// structural back and never interrogate the browser history stack (its contents
// are unknowable and get polluted by OAuth round-trips, PWA cold launches, and
// react-router idx desyncs — the whole class of bug ADR-0035 kept re-patching).
//
// Every "back" trigger — the edge gesture (ui/EdgeSwipeBack), the platform
// system-back (Navigation API interceptor below), the nav-bar Home tab, a shell
// back button — resolves the SAME `resolveBack` and runs the SAME executor.
// Adding a trigger never re-encodes the precedence; changing the behavior is a
// one-function edit (`resolveBack`). Overlays register into an in-memory stack
// that `resolveBack` consults first.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams, type NavigateFunction } from 'react-router-dom';
import { ICONS, type TabId } from '../constants';
import type { Mode } from '../lib/mode';
import { getNow } from '../lib/useClock';
import { useToast } from '../ui/Toast';
import { t } from '../i18n/he';

/** In-trip tab is a reload-surviving, deep-linkable URL param. Written with
 *  `replace` (never `push`) — history depth is not what resolves back, current
 *  state is (ADR-0090), so in-trip history stays flat. */
export const TAB_PARAM = 'tab';
/** The selected day — the SINGLE source of truth for it (ADR-0035 §4, retained by
 *  ADR-0090); `activeDate` derives from this, there is no second copy in React
 *  state. Deep-linkable + reload-surviving via `?day=YYYY-MM-DD`. Home carries no
 *  `?day=`, so it always derives to today. Written with `replace`. */
export const DAY_PARAM = 'day';
/** The anchor tab: back from any other tab returns here, then exits to /trips. */
export const HOME_TAB: TabId = 'home';
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
  return { kind: 'to', path: parentRoute(s.pathname) };
}

/** The explicit parent a shell route backs out to (ADR-0090 §4 — deterministic,
 *  so a cold deep link onto the route backs out correctly with no history behind
 *  it). Trip-settings (`/trip/:id/settings`) is opened from inside the trip, so
 *  its parent is the trip Home (`/`, which RootSurface resolves to the active
 *  trip); create/join back out to the all-trips home. */
function parentRoute(pathname: string): string {
  if (pathname.startsWith('/trip/')) return '/';
  return EXIT_TRIP_TO;
}

/** Whether a back action moves to a new screen (a slide-off animation) vs. stays
 *  put (a spring-back). The gesture uses it to pick its animation before content
 *  swaps. `close-overlay`/`arm-exit`/`none` keep the current screen. */
export function backSlides(action: BackAction): boolean {
  return action.kind === 'to-home' || action.kind === 'to' || action.kind === 'exit-trip';
}

/** Where a tab tap navigates (ADR-0090). Always `replace` — history depth doesn't
 *  resolve back, `resolveBack` does, so in-trip history stays flat. Home → the
 *  clean `/` (no params, so `activeDate` derives to today); any other tab → its
 *  `?tab=` URL. A no-op when already on the target is the caller's guard. */
export function tabTarget(next: TabId): string {
  return next === HOME_TAB ? '/' : `/?${TAB_PARAM}=${next}`;
}

/** Where a day-selection lands (ADR-0035 §4, single-source day; retained). The
 *  selected day lives in exactly ONE place — the `?day=` URL param — and
 *  `activeDate` derives from it (state/trip-state), so there is no second copy to
 *  reset or keep in sync. Selecting a day always shows it in the day/event view
 *  (the `days` tab); `date === today` omits `?day=` so the URL stays clean and
 *  Home derives to today. Always `replace` (a lateral view change, never a new
 *  history entry): back from a day goes to Home via `resolveBack`, not by walking
 *  the days you tapped. */
export function daySelectTarget(date: string, today: string): { to: string; replace: boolean } {
  const dayQuery = date === today ? '' : `&${DAY_PARAM}=${date}`;
  return { to: `/?${TAB_PARAM}=days${dayQuery}`, replace: true };
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
// version). Present on Chromium (Android/desktop); absent on Safari/iOS — where
// there's no system back to intercept anyway, so the edge gesture covers it.
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

type OverlayEntry = { id: number; close: () => void };

interface NavContextValue {
  registerOverlay: (close: () => void) => number;
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

function runStructural(navigate: NavigateFunction, action: BackAction): void {
  switch (action.kind) {
    case 'to-home':
      navigate('/', { replace: true });
      break;
    case 'to':
      navigate(action.path, { replace: true });
      break;
    case 'exit-trip':
      navigate(EXIT_TRIP_TO);
      break;
    default:
      break;
  }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<OverlayEntry[]>([]);
  const seqRef = useRef(0);
  const insideTripRef = useRef(false);
  const exitPendingRef = useRef(0);
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
      armed: getNow() - exitPendingRef.current < EXIT_CONFIRM_MS,
    }),
    [],
  );

  const classifyBack = useCallback(() => resolveBack(snapshot()), [snapshot]);

  const runBack = useCallback(
    (action: BackAction) => {
      switch (action.kind) {
        case 'close-overlay':
          stackRef.current.pop()?.close();
          break;
        case 'arm-exit':
          exitPendingRef.current = getNow();
          showToast(ICONS.navigate, t.shell.leaveTripHint);
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

  // Route the platform system-back (Android hardware/edge back, desktop button)
  // through the SAME resolveBack as the gesture (ADR-0090). On Android the OS
  // owns the screen edges, so it pre-empts the custom swipe; the Navigation API
  // lets us cancel the back *traversal* and run our own decision instead. Every
  // cancelable backward traverse inside a trip is preventDefault'd and replaced
  // with the explicit action, so react-router's own back never peels a structural
  // step (its target — what the browser stack holds — is exactly the unreliable
  // thing we refuse to depend on). The traverse is only cancelable when there's an
  // in-app entry behind us; `useTripBackGuard` guarantees one so the OS back can't
  // slip out of the app uncatchably. Our own programmatic navigations are
  // `push`/`replace`, not `traverse`, so they don't re-enter this handler.
  useEffect(() => {
    const navApi = getNavigation();
    if (!navApi) return; // Safari/iOS: no system back; the edge gesture covers it.
    const onNavigate = (evt: Event) => {
      const e = evt as NavigateEventLike;
      if (e.navigationType !== 'traverse' || !e.cancelable) return;
      const destIdx = e.destination?.index;
      const curIdx = navApi.currentEntry?.index;
      // Let a forward traverse (redo) pass; handle backward and app-leaving ones
      // (an indeterminate destination index when the Home base sits at index 0 on
      // a cold launch / OAuth round-trip) so the root guard keeps us in-app.
      if (typeof destIdx === 'number' && typeof curIdx === 'number' && destIdx > curIdx) return;
      const action = classifyBack();
      if (action.kind === 'none') return; // nothing to peel → let the OS proceed.
      e.preventDefault();
      runBack(action);
    };
    navApi.addEventListener('navigate', onNavigate);
    return () => navApi.removeEventListener('navigate', onNavigate);
  }, [classifyBack, runBack]);

  const value = useMemo<NavContextValue>(
    () => ({
      registerOverlay: (close) => {
        const id = ++seqRef.current;
        stackRef.current.push({ id, close });
        return id;
      },
      unregisterOverlay: (id) => {
        const i = stackRef.current.findIndex((o) => o.id === id);
        if (i >= 0) stackRef.current.splice(i, 1);
      },
      // Drain the whole stack (ADR-0060 idle-resume): snapshot then clear before
      // closing, so each close()'s unregister can't splice the array mid-loop.
      closeAllOverlays: () => {
        const all = stackRef.current.splice(0);
        for (const o of all) o.close();
      },
      hasOverlay: () => stackRef.current.length > 0,
      setInsideTrip: (v) => {
        insideTripRef.current = v;
      },
      insideTripRef,
      classifyBack,
      runBack,
    }),
    [classifyBack, runBack],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within <NavProvider>');
  return ctx;
}

/** Register the calling component as the topmost overlay while it is mounted, so
 *  `goBack()`/the return gesture closes it first. Used by the `Modal` primitive —
 *  every sheet/dialog inherits back-to-close with no call-site work. */
export function useOverlay(onClose: () => void) {
  const { registerOverlay, unregisterOverlay } = useNav();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const id = registerOverlay(() => closeRef.current());
    return () => unregisterOverlay(id);
  }, [registerOverlay, unregisterOverlay]);
}

/** Whether an overlay is currently open — the return gesture uses it to let a
 *  pull start anywhere (not just the trailing edge) when there's a sheet to
 *  dismiss over. Returns a live getter, stable across renders. */
export function useHasOverlay(): () => boolean {
  return useNav().hasOverlay;
}

/** Close every open overlay at once. Used by the idle-resume reset (ADR-0060) so
 *  a long-idle reopen lands on a clean Home, not Home under a stale sheet. */
export function useCloseAllOverlays(): () => void {
  return useNav().closeAllOverlays;
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

/** Android/Chromium system-back guard (ADR-0090). The OS back is a history
 *  *traversal*: it needs an in-app entry behind the current one to traverse into.
 *  When the trip shell mounts at the very bottom of the history stack — a cold
 *  launch straight into the live trip (`resolveLanding`), the common installed-PWA
 *  case — there is nothing behind, so the OS back traverses *out of the app*, and
 *  an app-leaving traversal is **non-cancelable**: the interceptor can't stop it
 *  and the app just exits (the reported "swipe exits the app" bug). Push one
 *  duplicate "guard" entry so the OS back always traverses into an in-app,
 *  cancelable entry the interceptor handles — it `preventDefault()`s before the URL
 *  changes, so the guard is never seen and never consumed (every in-trip back is
 *  cancelled, so the index never drops onto it). This is the *fuel* the OS back
 *  needs; the back *decision* stays a pure function of state (`resolveBack`), never
 *  reading history. No-op without the Navigation API (iOS/Safari have no OS back;
 *  the edge gesture calls `resolveBack` directly) or when an entry already sits
 *  behind us (entered from /trips, an OAuth round-trip, etc.). */
export function useTripBackGuard() {
  const navigate = useNavigate();
  const armedRef = useRef(false);
  useEffect(() => {
    if (armedRef.current) return;
    const navApi = getNavigation();
    if (!navApi) return; // iOS/Safari: no system back to guard against.
    if (!needsBackGuard(navApi.currentEntry?.index)) return; // already have fuel behind us.
    armedRef.current = true;
    navigate(window.location.pathname + window.location.search); // push a same-URL guard.
  }, [navigate]);
}

/** Whether the trip shell needs a guard history entry pushed behind it: true only
 *  at the very bottom of the stack (index 0), where the OS back has nothing in-app
 *  to traverse into. Any entry behind us (index > 0) is already cancelable fuel.
 *  Pure so the guard trigger is unit-tested without a Navigation API. */
export function needsBackGuard(currentIndex: number | null | undefined): boolean {
  return (currentIndex ?? 0) === 0;
}

/** The in-trip tab (ADR-0090). Every move is an explicit `replace` to the tab's
 *  URL; back is resolved from state, not from history depth, so there is no
 *  push/anchor bookkeeping to keep in sync. */
export function useTripTab(): { tab: TabId; goToTab: (t: TabId) => void } {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tab = (params.get(TAB_PARAM) as TabId | null) ?? HOME_TAB;
  const goToTab = useCallback(
    (next: TabId) => {
      if (next === tab) return;
      navigate(tabTarget(next), { replace: true });
    },
    [tab, navigate],
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
