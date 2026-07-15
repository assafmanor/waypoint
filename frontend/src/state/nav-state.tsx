// In-app navigation model (ADR-0035). React-router stays the single owner of
// history: the in-trip tab lives in the URL (`?tab=`) and routes are real
// entries, so the platform's own back peels them. Transient overlays
// (sheets/dialogs/pickers) register into an in-memory stack that `goBack()`
// consults first, so the return gesture (ui/EdgeSwipeBack) closes the topmost
// sheet before touching structural history. There is exactly one back action.
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
import { ICONS, type TabId } from '../constants';
import { getNow } from '../lib/useClock';
import { useToast } from '../ui/Toast';
import { t } from '../i18n/he';

/** In-trip tab is a real, reload-surviving history entry (ADR-0035 §3). */
export const TAB_PARAM = 'tab';
/** The anchor tab: back from any other tab returns here, then exits to /trips. */
export const HOME_TAB: TabId = 'home';
/** Where leaving a trip lands (ADR-0033 all-trips home). */
const EXIT_TRIP_TO = '/trips';
/** How long the "swipe again to leave the trip" confirmation stays armed. */
export const EXIT_CONFIRM_MS = 3000;

/** A resolved navigation move, kept pure/serialisable so the decision logic is
 *  unit-testable without a router or DOM (see nav-state.test.ts). */
export type NavStep =
  | { kind: 'push'; to: string }
  | { kind: 'replace'; to: string }
  | { kind: 'back' }
  | { kind: 'exit-trip' } // in-trip Home base → out to /trips (gated by a confirm)
  | { kind: 'none' };

/** Home-anchor tab model (ADR-0035 §3): Home→tab pushes, tab→tab replaces (no
 *  accumulating trail), tab→Home steps back to the base (or replaces to it when
 *  there is no in-app entry behind — a cold deep link). */
export function tabStep(current: TabId, next: TabId, canGoBack: boolean): NavStep {
  if (next === current) return { kind: 'none' };
  if (next === HOME_TAB) return canGoBack ? { kind: 'back' } : { kind: 'replace', to: '/' };
  if (current === HOME_TAB) return { kind: 'push', to: `/?${TAB_PARAM}=${next}` };
  return { kind: 'replace', to: `/?${TAB_PARAM}=${next}` };
}

/** The structural half of `goBack()` (ADR-0035 §2), after any open overlay has
 *  already been closed. Precedence: non-Home tab → Home; Home base → leave the
 *  trip; shell route → parent; roots → no-op (never fall off-app). Leaving the
 *  trip is surfaced as its own step so the caller can gate it behind a confirm. */
export function structuralBackStep(ctx: {
  insideTrip: boolean;
  tab: string | null;
  pathname: string;
  canGoBack: boolean;
}): NavStep {
  if (ctx.insideTrip) {
    if (ctx.tab && ctx.tab !== HOME_TAB) {
      return ctx.canGoBack ? { kind: 'back' } : { kind: 'replace', to: '/' };
    }
    return { kind: 'exit-trip' }; // Home base → out to all-trips (root guard).
  }
  // Roots (all-trips / zero-state / sign-in) have nothing behind them in-app.
  if (ctx.pathname === '/' || ctx.pathname === '/trips' || ctx.pathname === '/login') {
    return { kind: 'none' };
  }
  return ctx.canGoBack ? { kind: 'back' } : { kind: 'push', to: '/' };
}

/** What a single back resolved to — lets the return gesture pick its animation
 *  (a screen slide-off for real navigation, a spring-back for the rest). */
export type BackKind = 'overlay' | 'exit-confirm' | 'exit' | 'structural' | 'none';

/** How the platform system-back (Android hardware/edge back, desktop button)
 *  should be handled (ADR-0035 §5, Android refinement). The custom edge gesture
 *  is pre-empted by the OS on Android, so we intercept the back *traversal*
 *  itself via the Navigation API and route it through the same intent:
 *  - `close-overlay` — a sheet/dialog is open → cancel the back, close it;
 *  - `arm-exit` — at the in-trip Home base, first back → cancel, arm + toast;
 *  - `do-exit` — at Home, second back within the window → cancel, go to /trips;
 *  - `allow` — nothing to intercept; let react-router's back peel tab/route. */
export type SystemBackDecision = 'close-overlay' | 'arm-exit' | 'do-exit' | 'allow';

export function systemBackDecision(ctx: {
  hasOverlay: boolean;
  insideTrip: boolean;
  atHome: boolean;
  armed: boolean;
}): SystemBackDecision {
  if (ctx.hasOverlay) return 'close-overlay';
  if (ctx.insideTrip && ctx.atHome) return ctx.armed ? 'do-exit' : 'arm-exit';
  return 'allow';
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
  closeTopOverlay: () => boolean;
  hasOverlay: () => boolean;
  setInsideTrip: (v: boolean) => void;
  insideTripRef: React.MutableRefObject<boolean>;
  exitPendingRef: React.MutableRefObject<number>;
}

const NavContext = createContext<NavContextValue | null>(null);

/** react-router keeps a monotonic `idx` in history.state; `idx > 0` means there
 *  is app-internal history to step back into (vs. the very first entry, where a
 *  raw back would leave the app). */
function historyIdx(): number {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' ? idx : 0;
}

function runStep(navigate: NavigateFunction, step: NavStep): void {
  switch (step.kind) {
    case 'push':
      navigate(step.to);
      break;
    case 'replace':
      navigate(step.to, { replace: true });
      break;
    case 'back':
      navigate(-1);
      break;
    case 'exit-trip':
      navigate(EXIT_TRIP_TO);
      break;
    case 'none':
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

  // Route the platform system-back (Android hardware/edge back, desktop button)
  // through the same intent as the edge gesture (ADR-0035 §5, Android). The
  // Navigation API lets us cancel a back *traversal* before react-router sees it;
  // when we don't cancel, the traversal proceeds and react-router's own back
  // peels the tab/route. No history guards — the interception is at the source.
  useEffect(() => {
    const navApi = getNavigation();
    if (!navApi) return; // Safari/iOS: no system back; the edge gesture covers it.
    const onNavigate = (evt: Event) => {
      const e = evt as NavigateEventLike;
      if (e.navigationType !== 'traverse' || !e.cancelable) return;
      const destIdx = e.destination?.index;
      const curIdx = navApi.currentEntry?.index;
      if (typeof destIdx !== 'number' || typeof curIdx !== 'number' || destIdx >= curIdx) return;
      const atHome =
        insideTripRef.current &&
        window.location.pathname === '/' &&
        !new URLSearchParams(window.location.search).has(TAB_PARAM);
      const decision = systemBackDecision({
        hasOverlay: stackRef.current.length > 0,
        insideTrip: insideTripRef.current,
        atHome,
        armed: getNow() - exitPendingRef.current < EXIT_CONFIRM_MS,
      });
      switch (decision) {
        case 'close-overlay':
          e.preventDefault();
          stackRef.current.pop()?.close();
          break;
        case 'arm-exit':
          e.preventDefault();
          exitPendingRef.current = getNow();
          showToast(ICONS.navigate, t.shell.leaveTripHint);
          break;
        case 'do-exit':
          e.preventDefault();
          exitPendingRef.current = 0;
          navigate(EXIT_TRIP_TO); // deterministic — never traverse off-app.
          break;
        case 'allow':
          break; // let react-router's back peel the tab/route.
      }
    };
    navApi.addEventListener('navigate', onNavigate);
    return () => navApi.removeEventListener('navigate', onNavigate);
  }, [navigate, showToast]);

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
      closeTopOverlay: () => {
        const top = stackRef.current.pop();
        if (!top) return false;
        top.close();
        return true;
      },
      hasOverlay: () => stackRef.current.length > 0,
      setInsideTrip: (v) => {
        insideTripRef.current = v;
      },
      insideTripRef,
      exitPendingRef,
    }),
    [],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within <NavProvider>');
  return ctx;
}

/** Register the calling component as the topmost overlay while it is mounted, so
 *  `goBack()`/the return gesture closes it first. Used by the `Sheet` and confirm
 *  primitives — every sheet/dialog inherits back-to-close with no call-site work. */
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

/** Marks that the in-trip shell is mounted, so `goBack()` applies the in-trip
 *  precedence (tab → Home → /trips) rather than the shell-route rules. */
export function useMarkInsideTrip() {
  const { setInsideTrip } = useNav();
  useEffect(() => {
    setInsideTrip(true);
    return () => setInsideTrip(false);
  }, [setInsideTrip]);
}

/** The in-trip tab, Home-anchored (ADR-0035 §3): Home→tab pushes one entry,
 *  tab→tab replaces (the stack never accumulates a tab trail), tab→Home steps
 *  back to the base. */
export function useTripTab(): { tab: TabId; goToTab: (t: TabId) => void } {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tab = (params.get(TAB_PARAM) as TabId | null) ?? HOME_TAB;
  const goToTab = useCallback(
    (next: TabId) => runStep(navigate, tabStep(tab, next, historyIdx() > 0)),
    [tab, navigate],
  );
  return { tab, goToTab };
}

/** The return controls (ADR-0035 §2). `classify()` reports what a back *would*
 *  do — so the gesture can play the right animation before content swaps — and
 *  `run()` performs it. Split apart precisely so a structural slide-off can
 *  finish before `navigate` changes the screen underneath it. */
export function useReturnControls() {
  const nav = useNav();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const showToast = useToast();

  const classify = useCallback((): { kind: BackKind; step: NavStep } => {
    if (nav.hasOverlay()) return { kind: 'overlay', step: { kind: 'none' } };
    const step = structuralBackStep({
      insideTrip: nav.insideTripRef.current,
      tab: params.get(TAB_PARAM),
      pathname: location.pathname,
      canGoBack: historyIdx() > 0,
    });
    if (step.kind === 'exit-trip') {
      // Leaving a trip is confirmed: the first back arms it, a second within the
      // window actually exits (ADR-0035 §1 refinement).
      const armed = getNow() - nav.exitPendingRef.current < EXIT_CONFIRM_MS;
      return { kind: armed ? 'exit' : 'exit-confirm', step };
    }
    if (step.kind === 'none') return { kind: 'none', step };
    return { kind: 'structural', step };
  }, [nav, location.pathname, params]);

  const run = useCallback(
    ({ kind, step }: { kind: BackKind; step: NavStep }) => {
      switch (kind) {
        case 'overlay':
          nav.closeTopOverlay();
          break;
        case 'exit-confirm':
          nav.exitPendingRef.current = getNow();
          showToast(ICONS.navigate, t.shell.leaveTripHint);
          break;
        case 'exit':
          nav.exitPendingRef.current = 0;
          runStep(navigate, step); // exit-trip → /trips
          break;
        case 'structural':
          runStep(navigate, step);
          break;
        case 'none':
          break;
      }
    },
    [nav, navigate, showToast],
  );

  return { classify, run };
}

/** Convenience single-shot back for non-animated callers (a header button, a
 *  key handler). Returns what it did. The gesture uses classify/run directly. */
export function useAppBack(): () => BackKind {
  const { classify, run } = useReturnControls();
  return useCallback(() => {
    const c = classify();
    run(c);
    return c.kind;
  }, [classify, run]);
}
