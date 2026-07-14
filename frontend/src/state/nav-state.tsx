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
import type { TabId } from '../constants';

/** In-trip tab is a real, reload-surviving history entry (ADR-0035 §3). */
export const TAB_PARAM = 'tab';
/** The anchor tab: back from any other tab returns here, then exits to /trips. */
export const HOME_TAB: TabId = 'home';

/** A resolved navigation move, kept pure/serialisable so the decision logic is
 *  unit-testable without a router or DOM (see nav-state.test.ts). */
export type NavStep =
  | { kind: 'push'; to: string }
  | { kind: 'replace'; to: string }
  | { kind: 'back' }
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
 *  already been closed. Precedence: non-Home tab → Home; Home base → /trips;
 *  shell route → parent; roots → no-op (never fall off-app). */
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
    return { kind: 'push', to: '/trips' }; // Home base → all-trips (root guard).
  }
  // Roots (all-trips / zero-state / sign-in) have nothing behind them in-app.
  if (ctx.pathname === '/' || ctx.pathname === '/trips' || ctx.pathname === '/login') {
    return { kind: 'none' };
  }
  return ctx.canGoBack ? { kind: 'back' } : { kind: 'push', to: '/' };
}

type OverlayEntry = { id: number; close: () => void };

interface NavContextValue {
  registerOverlay: (close: () => void) => number;
  unregisterOverlay: (id: number) => void;
  closeTopOverlay: () => boolean;
  hasOverlay: () => boolean;
  setInsideTrip: (v: boolean) => void;
  insideTripRef: React.MutableRefObject<boolean>;
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
    case 'none':
      break;
  }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<OverlayEntry[]>([]);
  const seqRef = useRef(0);
  const insideTripRef = useRef(false);

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

/** The single guarded back action (ADR-0035 §2). Precedence: open overlay →
 *  non-Home tab → Home base (→ /trips) → shell parent → no-op at the roots. */
export function useAppBack(): () => void {
  const nav = useNav();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  return useCallback(() => {
    if (nav.closeTopOverlay()) return; // an open sheet/dialog closes first.
    runStep(
      navigate,
      structuralBackStep({
        insideTrip: nav.insideTripRef.current,
        tab: params.get(TAB_PARAM),
        pathname: location.pathname,
        canGoBack: historyIdx() > 0,
      }),
    );
  }, [nav, navigate, location.pathname, params]);
}
