import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import type { Trip } from '@waypoint/shared';
import { TripProvider, useTrip } from './state/trip-state';
import { ModeProvider, useMode } from './state/mode-state';
import { AuthProvider, useAuth } from './state/auth-state';
import { ActiveTripIdProvider, useActiveTripId } from './state/active-trip-id';
import {
  NavProvider,
  shouldResetToHomeOnResume,
  useCloseAllOverlays,
  useMarkInsideTrip,
  useTripBackGuard,
  useTripTab,
} from './state/nav-state';
import {
  flushAllOutbox,
  isOffline,
  useIsOffline,
  useOutboxCount,
  usePendingChangeCount,
  useSyncFailures,
} from './lib/outbox';
import { loadTripList } from './lib/cache';
import { resolveLanding } from './lib/active-trip';
import { consumeIntent, hasIntent, saveIntent } from './lib/intent';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { AppShell } from './ui/layout';
import { Sheet } from './ui/Sheet';
import { SyncReviewSheet } from './ui/SyncReviewSheet';
import { Icon } from './ui/Icon';
import { NavArrow } from './ui/NavArrow';
import { DayStrip } from './ui/domain/DayStrip';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { ZeroState } from './screens/ZeroState';
// Code-split the non-first-paint surfaces (F-07): the boot path (auth, RootSurface,
// Trip-mode Home) stays eager; the Plan surfaces, the Index (which pulls in the
// document viewer + zoom math), and the full-page shell routes load on demand so
// they stay out of the initial bundle — the exact win for weak connectivity abroad.
const PlanHome = lazy(() => import('./screens/PlanHome').then((m) => ({ default: m.PlanHome })));
const PlanDay = lazy(() => import('./screens/PlanDay').then((m) => ({ default: m.PlanDay })));
const DayView = lazy(() => import('./screens/DayView').then((m) => ({ default: m.DayView })));
const Index = lazy(() => import('./screens/Index').then((m) => ({ default: m.Index })));
const AllTrips = lazy(() => import('./screens/AllTrips').then((m) => ({ default: m.AllTrips })));
const CreateTrip = lazy(() =>
  import('./screens/CreateTrip').then((m) => ({ default: m.CreateTrip })),
);
const JoinTrip = lazy(() => import('./screens/JoinTrip').then((m) => ({ default: m.JoinTrip })));
const TripSettings = lazy(() =>
  import('./screens/TripSettings').then((m) => ({ default: m.TripSettings })),
);
import { DevTimeTravel } from './dev/DevTimeTravel';
import { getNow, useClock } from './lib/useClock';
import { useShrinkToFit } from './lib/useShrinkToFit';
import {
  AVATAR_INITIAL_LENGTH,
  DEFAULT_TRIP_ICON,
  DOT_SEPARATOR,
  ICONS,
  MEMBER_AVATAR_CAP,
  MS_PER_DAY,
  OUTBOX_RETRY_MS,
  TABS,
  type TabId,
} from './constants';
import { daysUntilStart, type Mode } from './lib/mode';
import { addDays, monthLabelFor, todayInTz } from './lib/time';
import { t } from './i18n/he';
import './App.css';
import './screens.css';

// Small tail added past the transition's own duration before disarming the
// mode-switch class, so we never clear it a frame early (which would snap the
// chrome to its final colors mid-animation).
const SWITCH_TAIL_MS = 80;

// Read a CSS duration token (e.g. `--t-cinematic`) off :root as milliseconds, so
// the switch's disarm timer follows tokens.css instead of duplicating its values.
// Falls back to --t-base, then a literal, if the token is missing/unparseable.
function readDurationMs(token: string): number {
  if (typeof window === 'undefined') return 400;
  const root = document.documentElement;
  const read = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  const raw = read(token) || read('--t-base');
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 400;
  return raw.endsWith('ms') ? n : n * 1000; // tokens are ms, but tolerate `s`
}

// Map is designed later (T-002); it falls back here with a mode-emphasis
// subtitle (T-019). Home/Day-by-day/Index are built for both modes.
function Placeholder({ tab, mode }: { tab: TabId; mode: Mode }) {
  return (
    <div className="placeholder">
      <h1>{t.tabs[tab]}</h1>
      <p className="placeholder-emphasis">{t.modeEmphasis[tab][mode]}</p>
      <p>{t.placeholder.comingSoon}</p>
    </div>
  );
}

function BootScreen({ text }: { text: string }) {
  return (
    <div className="boot-screen">
      <h1>{text}</h1>
    </div>
  );
}

// Segmented Plan/Trip toggle (design-language.md's Plan-mode components,
// from mockups/plan-mode-v1.html) — two explicit states, not an auto/manual
// cycle: tapping a side just picks it. The override is session-only
// (state/mode-state.tsx) — always auto-derived by default, tapping a side
// just peeks at the other for now; a fresh load is always back to auto, no
// reset control needed.
//
// ADR-0040: Trip mode is a live-window-only state, so the toggle only exists
// while the trip is live. Before it starts and after it ends Plan is the only
// reachable mode — there's nothing to switch, and the departure board stays
// scarce (ADR-0033). The countdown-to-departure lives on Plan Home's prep
// dashboard (T-055), not here.
function ModeToggle() {
  const { mode, phase, setOverride } = useMode();
  if (phase !== 'live') return null;
  return (
    <div className="modebar">
      <div className="toggle">
        <button className={mode === 'plan' ? 'on' : ''} onClick={() => setOverride('plan')}>
          {ICONS.edit} {t.mode.plan}
        </button>
        <button className={mode === 'trip' ? 'on' : ''} onClick={() => setOverride('trip')}>
          {ICONS.navigate} {t.mode.trip}
        </button>
      </div>
    </div>
  );
}

function Header({
  onSelectDay,
  onOpenSwitcher,
  onOpenAccount,
  onOpenSettings,
}: {
  onSelectDay: (date: string) => void;
  onOpenSwitcher: () => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}) {
  const { trip, users, activeDate, usingCachedSnapshot, events } = useTrip();
  const { me } = useAuth();
  const { mode } = useMode();
  const now = useClock();
  // Plan mode surfaces empty days on the strip (dashed + red number), the
  // day-selector cue from mockups/plan-mode-v1.html — a gap to go fill. DayStrip
  // reads this per-day as `hasEvents`.
  const datesWithEvents = new Set(events.map((e) => e.date));
  const { targetRef: tripNameRef, containerRef: tripNameWrapRef } = useShrinkToFit<
    HTMLSpanElement,
    HTMLDivElement
  >(trip.name);
  // The account avatar (ringed, opens the account sheet) already shows "me" —
  // the member cluster is everyone else, capped with a "+N" overflow bubble
  // (app-shell.md §6, PR #57).
  const others = users.filter((u) => u.id !== me?.user.id);
  const visibleMembers = others.slice(0, MEMBER_AVATAR_CAP);
  const overflowMembers = others.slice(MEMBER_AVATAR_CAP);
  // `navigator.onLine` (T-013) misses cases like a hard reload where the boot
  // fetch itself fails but the browser's online flag never flips (some
  // environments' 'offline' event is unreliable) — usingCachedSnapshot (T-058)
  // is a direct signal from that fetch actually failing, so OR the two.
  const offline = useIsOffline() || usingCachedSnapshot;
  // Pending change *groups*, so one user action (a booking + the places backing
  // its route) reads as one change, not three (ADR-0092). The flush loop below
  // keeps the true op total via useOutboxCount.
  const pendingCount = usePendingChangeCount();
  const syncFailures = useSyncFailures();
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const total =
    Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / MS_PER_DAY) + 1;
  const dayNumber =
    Math.round((Date.parse(activeDate) - Date.parse(trip.startDate)) / MS_PER_DAY) + 1;
  const weekdayLetter = new Intl.DateTimeFormat('he-IL', {
    weekday: 'narrow',
    timeZone: trip.timezone,
  });
  let prevDate: string | undefined;
  const days = Array.from({ length: total }, (_, i) => {
    const date = addDays(trip.startDate, i);
    const monthLabel = monthLabelFor(date, prevDate);
    prevDate = date;
    return {
      date,
      dayOfMonth: date.slice(8),
      letter: weekdayLetter.format(new Date(`${date}T00:00:00Z`)),
      monthLabel: monthLabel ?? undefined,
      hasEvents: datesWithEvents.has(date),
    };
  });
  // Trip mode anchors amber to TODAY (the live day), not to the selection
  // (ADR-0043 / ADR-0028): selecting a past day is a neutral highlight, a future
  // day violet (plan-ahead), and today keeps its amber dot wherever you browse —
  // so "where's now?" is always answerable from the chrome. Plan mode has no
  // "now", so it keeps its own violet-selection + empty-day grammar unchanged.
  // The pill-state logic itself now lives in the DayStrip domain component.
  const today = todayInTz(trip.timezone, now);
  // Day-scope context ribbon (ADR-0029/0043): only in Trip mode, only off today.
  const dayScope =
    mode === 'trip' && activeDate !== today ? (activeDate < today ? 'past' : 'future') : null;
  return (
    <header className="header mode-chrome" data-mode={mode}>
      <ModeToggle />
      <div className="trip-row">
        <div className="trip-name-wrap" ref={tripNameWrapRef}>
          <button
            className="trip-name-btn"
            onClick={onOpenSwitcher}
            aria-label={t.shell.switcher.title}
          >
            <span className="trip-icon" aria-hidden="true">
              {trip.icon ?? DEFAULT_TRIP_ICON}
            </span>
            <span ref={tripNameRef} className="trip-name">
              {trip.name}
            </span>
            <span className="chev">
              <Icon name="caret" dir="down" />
            </span>
          </button>
          <div className="trip-sub">
            {trip.destination}
            <span className="dot">{DOT_SEPARATOR}</span>
            {(() => {
              // Plan mode leads with the countdown to departure; once the trip
              // has started (real or an override peeking at Plan) fall back to
              // "day X of Y" — daysUntilStart is null then anyway.
              const daysToGo = mode === 'plan' ? daysUntilStart(trip, now) : null;
              return daysToGo === null
                ? t.header.dayOf(dayNumber, total)
                : t.header.leavingIn(daysToGo);
            })()}
          </div>
        </div>
        <div className="header-actions">
          <div className="avatars" title={others.map((u) => u.displayName).join(DOT_SEPARATOR)}>
            {overflowMembers.length > 0 && <div className="av more">+{overflowMembers.length}</div>}
            {visibleMembers.map((u) => (
              <div
                key={u.id}
                className="av"
                style={{ background: u.avatarColor }}
                title={u.displayName}
              >
                {u.displayName.slice(0, AVATAR_INITIAL_LENGTH)}
              </div>
            ))}
          </div>
          {me && (
            <button
              className="av account-btn"
              style={{ background: me.user.avatarColor }}
              onClick={onOpenAccount}
              aria-label={t.shell.account.title}
              title={me.user.displayName}
            >
              {me.user.displayName.slice(0, AVATAR_INITIAL_LENGTH)}
            </button>
          )}
          <button className="gear-btn" onClick={onOpenSettings} aria-label={t.shell.stub.settings}>
            <Icon name="settings" />
          </button>
        </div>
      </div>
      {/* Connectivity / sync status is a polite live region so a screen reader
          announces going offline, queued writes, and failed syncs (F-10). */}
      <div role="status" aria-live="polite">
        {offline && (
          <div className="offline-badge">
            {ICONS.offline} {t.header.offlineNow}
          </div>
        )}
        {pendingCount > 0 && (
          <div className="offline-badge">
            {ICONS.sync} {t.header.pendingSync(pendingCount)}
          </div>
        )}
        {/* Persistent failed-summary → review/retry sheet (U-04, ADR-0080). Unlike
            the old badge it never clears on a timer or tap-to-dismiss: it opens the
            dead-letter sheet where each rejected write is retried or discarded, so a
            rejected write can't silently vanish at the next resync. */}
        {syncFailures.length > 0 && (
          <button
            type="button"
            className="offline-badge sync-failed-summary"
            onClick={() => setSyncReviewOpen(true)}
          >
            {ICONS.warn} {t.sync.summary(syncFailures.length)}
          </button>
        )}
      </div>
      {syncReviewOpen && <SyncReviewSheet onClose={() => setSyncReviewOpen(false)} />}
      <DayStrip
        days={days}
        selected={activeDate}
        today={today}
        mode={mode}
        onSelect={onSelectDay}
      />
      {dayScope && (
        <button
          className={'day-context ' + dayScope}
          onClick={() => onSelectDay(today)}
          aria-label={t.header.backToToday}
        >
          <span className="dc-label">
            {dayScope === 'past' ? t.header.pastDay : t.header.futureDay}
          </span>
          <span className="dc-back">
            {t.header.backToToday} <NavArrow variant="back" />
          </span>
        </button>
      )}
    </header>
  );
}

// Tabs re-emphasize by mode (ADR-0016), not duplicate screens. Home and
// Day-by-day are built for both modes now (Trip = departure board / follow +
// adjust; Plan = prep dashboard / itinerary builder); Index is mode-agnostic
// (ADR-0049). Map is unbuilt (T-002), so it falls back to Placeholder.
function Screen({ tab, onNavigate }: { tab: TabId; onNavigate: (tab: TabId) => void }) {
  const { mode } = useMode();
  if (tab === 'home')
    return mode === 'trip' ? (
      <Home onNavigate={onNavigate} />
    ) : (
      <PlanHome onNavigate={onNavigate} />
    );
  if (tab === 'days') return mode === 'trip' ? <DayView /> : <PlanDay />;
  // Index content is mode-agnostic (ADR-0049 — mode tints chrome only).
  if (tab === 'index') return <Index />;
  return <Placeholder tab={tab} mode={mode} />;
}

// data-mode on the shell root lets CSS follow the mode identity rule
// (design-language mode identity: plan mode never uses amber) without every
// component reading mode state. Needs its own component because App renders
// ModeProvider itself and so can't call useMode.
function Shell() {
  // Tab lives in the URL (?tab=), Home-anchored, so back peels it (ADR-0035).
  const { tab, goToTab } = useTripTab();
  const [accountOpen, setAccountOpen] = useState(false);
  useMarkInsideTrip();
  // Give Android's OS back an in-app entry to traverse into (ADR-0090) so a cold
  // launch straight into the trip can't let a system-back slip out of the app.
  useTripBackGuard();
  const { mode } = useMode();
  const { trip, setActiveDate, tripDeleted } = useTrip();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const closeAllOverlays = useCloseAllOverlays();
  // A remote admin deleting the trip while we're inside it (ADR-0039): leave to
  // the all-trips list rather than sitting on a trip that no longer exists.
  useEffect(() => {
    if (tripDeleted) navigate('/trips', { replace: true });
  }, [tripDeleted, navigate]);
  // Selecting a day shows it in the day view. `setActiveDate` is the single
  // choke point (state/trip-state): it writes the one source of truth (`?day=`)
  // and lands on the `days` tab in one navigation, so Home — reached without a
  // `?day=` — always derives to today with no reset effect (ADR-0035 §4).
  const onSelectDay = setActiveDate;

  // Reopen-after-idle (ADR-0060): when the app returns to the foreground after a
  // long idle stretch (≥ RESET_TO_HOME_AFTER_HIDDEN_MS) in Trip mode, reset to a
  // clean Home — close any open sheet and go to the Home base. Home carries no
  // `?day=`, so landing there is already today (no separate day-snap needed).
  // Distinct from trip-state's ~30s data-resync (that refreshes data; this resets
  // the view); both listen independently. Refs keep the listener bound once.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = getNow();
        return;
      }
      const awayMs = hiddenAt === 0 ? 0 : getNow() - hiddenAt;
      hiddenAt = 0;
      if (!shouldResetToHomeOnResume(awayMs, modeRef.current)) return;
      closeAllOverlays();
      navigate('/', { replace: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [navigate, closeAllOverlays]);
  // Mode-switch transition (design-language: Motion). data-switching arms the
  // chrome transition, direction-scoped: Plan→Trip (going live) is the cinematic
  // beat, Trip→Plan (stand-down) the quieter return. It MUST land in the same
  // commit as the new data-mode — arming it a paint later (e.g. from a useEffect)
  // lets the browser repaint the new colors before the transition exists, so the
  // animation is intermittently skipped. So derive it during render (set-state-in-
  // render) rather than post-paint. Not armed on first mount; reduced-motion still
  // flips instantly (the CSS is inert under it).
  const [prevMode, setPrevMode] = useState(mode);
  const [switching, setSwitching] = useState<'to-trip' | 'to-plan' | null>(null);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setSwitching(mode === 'trip' ? 'to-trip' : 'to-plan');
  }
  // Disarm once the animation has settled. The duration is read from the CSS
  // token (not hardcoded) so JS and CSS can't drift — changing --t-cinematic in
  // tokens.css can't leave this clearing the class mid-animation (which would
  // snap the chrome). Keyed on `switching` so a new switch (or a quick
  // back-and-forth) restarts the timer instead of stacking.
  useEffect(() => {
    if (!switching) return;
    const token = switching === 'to-trip' ? '--t-cinematic' : '--t-deliberate';
    const id = setTimeout(() => setSwitching(null), readDurationMs(token) + SWITCH_TAIL_MS);
    return () => clearTimeout(id);
  }, [switching]);
  // The frame composes AppShell (ui/layout): header + scrollable body + bottom
  // nav under one persistent chrome, so a body-only state (skeleton/error) can
  // render without unmounting header or nav (U-10). Mode/switching pass through
  // to `data-mode`/`data-switching`, so every existing `.app[...]` CSS selector
  // still applies; `bodyKey={tab}` keeps the per-tab remount + fade.
  return (
    <AppShell
      mode={mode}
      switching={switching ?? undefined}
      bodyKey={tab}
      header={
        <Header
          onSelectDay={onSelectDay}
          onOpenSwitcher={() => navigate('/trips')}
          onOpenAccount={() => setAccountOpen(true)}
          onOpenSettings={() => navigate(`/trip/${trip.id}/settings`)}
        />
      }
      nav={
        <nav className="nav">
          {TABS.map((tabDef) => (
            <button
              key={tabDef.id}
              className={tabDef.id === tab ? 'on' : ''}
              onClick={() => goToTab(tabDef.id)}
              aria-current={tabDef.id === tab}
            >
              <span className="ic">{tabDef.icon}</span>
              {t.tabs[tabDef.id]}
            </button>
          ))}
        </nav>
      }
      overlay={
        accountOpen && <AccountSheet onClose={() => setAccountOpen(false)} onSignOut={logout} />
      }
    >
      <Suspense fallback={<BootScreen text={t.shell.booting} />}>
        <Screen tab={tab} onNavigate={goToTab} />
      </Suspense>
    </AppShell>
  );
}

// Identity + sign-out, kept minimal (app-shell.md §6, PR #57) — a grip handle
// and a centered avatar/name/email, no title bar. Google is stated once here,
// quietly (no logo) — it's the auth mechanism, not a badge shown per-avatar.
function AccountSheet({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const { me } = useAuth();
  return (
    <Sheet ariaLabel={t.shell.account.title} onClose={onClose}>
      <div className="acct-grip" />
      {me && (
        <div className="acct-av" style={{ background: me.user.avatarColor }}>
          {me.user.displayName.slice(0, AVATAR_INITIAL_LENGTH)}
        </div>
      )}
      <div className="acct-name">{me?.user.displayName}</div>
      <div className="acct-mail" dir="ltr">
        {me?.user.email}
      </div>
      <div className="acct-provider">{t.shell.account.provider}</div>
      <button
        className="acct-signout"
        onClick={() => {
          onSignOut();
          onClose();
        }}
      >
        {t.shell.account.signOut}
      </button>
    </Sheet>
  );
}

// With zero trips there's no Shell/Header, so ZeroState's own avatar is the
// only other place sign-out is reachable.
function ZeroStateWithAccount() {
  const [showAccount, setShowAccount] = useState(false);
  const { logout } = useAuth();
  return (
    <>
      <ZeroState onOpenAccount={() => setShowAccount(true)} />
      {showAccount && <AccountSheet onClose={() => setShowAccount(false)} onSignOut={logout} />}
    </>
  );
}

// Same reasoning as ZeroStateWithAccount: /trips is a full-page route outside
// Shell, so it needs its own account-sheet plumbing.
function AllTripsWithAccount() {
  const [showAccount, setShowAccount] = useState(false);
  const { logout } = useAuth();
  return (
    <>
      <AllTrips onOpenAccount={() => setShowAccount(true)} />
      {showAccount && <AccountSheet onClose={() => setShowAccount(false)} onSignOut={logout} />}
    </>
  );
}

// Settings is a full-page route outside the mode Shell (ADR-0039: mode-neutral),
// but it still needs the trip context for its trip/roster state + settings verbs.
function TripSettingsRoute() {
  const { id } = useParams();
  if (!id) return <Navigate to="/" replace />;
  return (
    <TripProvider tripId={id}>
      <TripSettings />
    </TripProvider>
  );
}

function RootSurface() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Offline-aware (sync-and-offline.md "Read"): falls back to the cached trip
    // list when the fetch fails, so a cold reopen with no network resolves the
    // active trip instead of collapsing to ZeroState.
    loadTripList().then(({ trips: list }) => {
      if (!cancelled) setTrips(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const { tripId: storedTripId, pickedThisSession } = useActiveTripId();
  const now = useClock();

  if (trips === null) return <BootScreen text={t.shell.booting} />;
  if (trips.length === 0) return <ZeroStateWithAccount />;

  const landing = resolveLanding(trips, storedTripId, pickedThisSession, now);
  if ('redirect' in landing) return <Navigate to={landing.redirect} replace />;

  return (
    <TripProvider tripId={landing.tripId}>
      <ModeProvider>
        <Shell />
      </ModeProvider>
    </TripProvider>
  );
}

// Layout route (ADR-0024): one shared guard via <Outlet/> instead of
// per-route wrapping. Intent is resumed here, not right after login, since
// OAuth's redirect always lands on "/", never the saved deep link.
//
// /join/:token is exempt from the anon-redirect (T-042, app-shell.md §4):
// its preview is a public endpoint and must render before any auth check —
// the screen's own "Continue with Google" CTA is what saves the intent and
// starts sign-in, not this eager gate.
export function AuthGate() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isJoinRoute = location.pathname.startsWith('/join/');
  // Whether a saved deep-link intent is still waiting to be resolved. Kept in
  // React state (not a bare hasIntent() read at render time) so that *consuming*
  // an intent always triggers a re-render that lifts this gate — even when the
  // intent equals the current path and the effect therefore neither navigates
  // nor changes any other state (the logout-from-"/" → login-back-to-"/" case).
  // A non-reactive sessionStorage read here left the app frozen on the boot
  // screen after logout+login until the tab was closed.
  const [intentPending, setIntentPending] = useState(hasIntent);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'anon') {
      if (location.pathname !== '/login' && !isJoinRoute) {
        saveIntent(location.pathname);
        setIntentPending(true);
        navigate('/login', { replace: true });
      }
      return;
    }
    const intent = consumeIntent();
    if (intent && intent !== location.pathname) {
      navigate(intent, { replace: true });
    } else if (location.pathname === '/login') {
      navigate('/', { replace: true });
    }
    setIntentPending(false);
  }, [status, location.pathname, navigate, isJoinRoute]);

  if (status === 'loading') return <BootScreen text={t.shell.booting} />;
  if (status === 'anon') {
    return location.pathname === '/login' || isJoinRoute ? (
      <Outlet />
    ) : (
      <BootScreen text={t.shell.booting} />
    );
  }
  // A pending deep-link intent (e.g. mid-join after OAuth's redirect to "/")
  // must not let RootSurface mount even for one render — its fetchTrips()
  // would see zero memberships (the join hasn't run yet) and flash ZeroState
  // before the effect above navigates to the real intent path.
  if (location.pathname === '/login' || intentPending) return <BootScreen text={t.shell.booting} />;
  return <Outlet />;
}

function AppRoutes() {
  // Suspense boundary for the lazily-loaded route screens (F-07). The fallback is
  // the same boot screen the gate already uses, so a chunk fetch reads as booting.
  return (
    <Suspense fallback={<BootScreen text={t.shell.booting} />}>
      <Routes>
        <Route element={<AuthGate />}>
          <Route path="login" element={<Login />} />
          <Route path="trips" element={<AllTripsWithAccount />} />
          <Route path="new" element={<CreateTrip />} />
          <Route path="join/:token" element={<JoinTrip />} />
          <Route path="trip/:id/settings" element={<TripSettingsRoute />} />
          <Route path="*" element={<RootSurface />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

// Device-wide outbox flush (ADR-0042): a write queued offline must sync the
// moment connectivity returns — even from the all-trips list or zero-state,
// where no trip's realtime effect is mounted to flush its queue. Flushes every
// trip's queue on `online`, on window `focus`, and once on mount (to drain a
// queue left over from a prior offline session). Only while authed — a flush
// needs the session. The mounted trip still runs its own reconnect (flush +
// catch-up + resubscribe); flushOutbox coalesces so the two never double-POST.
function OutboxAutoFlush() {
  const { status } = useAuth();
  const pending = useOutboxCount();
  useEffect(() => {
    if (status !== 'authed') return;
    const flush = () => void flushAllOutbox();
    if (!isOffline()) flush();
    // `focus` covers the case `online` misses: a write queued on a transient
    // network blip while navigator.onLine never flipped fires no `online` event,
    // so nothing would otherwise re-drive the flush.
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
    };
  }, [status]);

  // Safety net: while anything is queued, retry on a gentle interval until it
  // drains, so the "N changes waiting" summary can never wedge on forever when no
  // connectivity transition arrives to trigger a flush. Gated on pending > 0 so
  // it's inert on the happy path.
  useEffect(() => {
    if (status !== 'authed' || pending === 0) return;
    const id = window.setInterval(() => {
      if (!isOffline()) void flushAllOutbox();
    }, OUTBOX_RETRY_MS);
    return () => window.clearInterval(id);
  }, [status, pending]);

  return null;
}

export function App() {
  return (
    <AuthProvider>
      <ActiveTripIdProvider>
        <ToastProvider>
          <NavProvider>
            <ConfirmProvider>
              <OutboxAutoFlush />
              <AppRoutes />
              {import.meta.env.DEV && <DevTimeTravel />}
            </ConfirmProvider>
          </NavProvider>
        </ToastProvider>
      </ActiveTripIdProvider>
    </AuthProvider>
  );
}
