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

/** Where a tab tap navigates (ADR-0090). Always `replace` — history depth doesn't
 *  resolve back, `resolveBack` does, so in-trip history stays flat. Home → the
 *  clean `/` (no params, so `activeDate` derives to today); any other tab → its
 *  `?tab=` URL. A no-op when already on the target is the caller's guard. */
export function tabTarget(next: TabId): string {
  return next === HOME_TAB ? '/' : `/?${TAB_PARAM}=${next}`;
}

/** Tabs that are day-scoped surfaces (ADR-0110 §4): tapping a strip day focuses
 *  that day IN PLACE instead of routing to the Day view. The Day view was the
 *  only such surface; the Map joins it (its content is "this day's places"). */
export const DAY_SCOPED_TABS = new Set<TabId>(['days', 'map']);

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
  const markerDepthRef = useRef(0);
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

  // Marker helpers (ADR-0103) — keep the marker-entry count in step with the overlay layer
  // count. `pushMarker` adds one same-URL entry (a router push, like the guard, so
  // React Router stays the sole history writer); `backOffMarker` removes a stray one
  // (an overlay closed off-back) by traversing off it ourselves, suppressed so the
  // interceptor doesn't treat it as a user back. Gated on the Navigation API — with
  // no system-back to ride (iOS/Safari), overlays keep the plain in-memory model.
  const pushMarker = useCallback(() => {
    markerDepthRef.current += 1;
    navigate(window.location.pathname + window.location.search);
  }, [navigate]);

  const reconcileMarkers = useCallback(() => {
    if (!getNavigation()) return;
    // Push-only: give any un-markered layer its marker. We never programmatically
    // pop — an overlay closed off-back (X / backdrop / Escape / arrow / unmount)
    // leaves a "spent" marker that a later back harmlessly consumes. Tradeoff:
    // at most one no-op back after an off-back close, in exchange for dropping the
    // fragile async history.back() reconciliation (which races Strict Mode's
    // double-mount and any rapid re-render).
    while (markerDepthRef.current < stackRef.current.length) pushMarker();
  }, [pushMarker]);

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

      // Overlay open → ride the traversal to close the topmost layer.
      if (stackRef.current.length > 0) {
        markerDepthRef.current = Math.max(0, markerDepthRef.current - 1);
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
        return; // no preventDefault — the marker is popped, the layer is handled.
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
 *  duplicate stack entry across renders / Strict Mode). */
export function useBackLayer(handle: () => BackResult) {
  const { registerOverlay, unregisterOverlay } = useNav();
  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    const id = registerOverlay(() => handleRef.current());
    return () => unregisterOverlay(id);
  }, [registerOverlay, unregisterOverlay]);
}

/** A dismissible overlay: one back closes it (its owner then unmounts). A thin
 *  shim over `useBackLayer` for the common "always closes" case — used by the
 *  `Modal` primitive, so every sheet/dialog inherits back-to-close with no
 *  call-site work. Reach for `useBackLayer` directly when a back should sometimes
 *  be consumed without leaving the screen (ADR-0103). */
export function useOverlay(onClose: () => void) {
  useBackLayer(() => {
    onClose();
    return { remainsActive: false };
  });
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
