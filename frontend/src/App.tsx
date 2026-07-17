import { useEffect, useState } from 'react';
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
import { HOME_TAB, NavProvider, useMarkInsideTrip, useTripTab } from './state/nav-state';
import { EdgeSwipeBack } from './ui/EdgeSwipeBack';
import { flushAllOutbox, isOffline, useIsOffline, useOutboxCount } from './lib/outbox';
import { loadTripList } from './lib/cache';
import { resolveLanding } from './lib/active-trip';
import { consumeIntent, hasIntent, saveIntent } from './lib/intent';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { Sheet } from './ui/Sheet';
import { Icon } from './ui/Icon';
import { NavArrow } from './ui/NavArrow';
import { Home } from './screens/Home';
import { PlanHome } from './screens/PlanHome';
import { PlanDay } from './screens/PlanDay';
import { DayView } from './screens/DayView';
import { Index } from './screens/Index';
import { Login } from './screens/Login';
import { ZeroState } from './screens/ZeroState';
import { AllTrips } from './screens/AllTrips';
import { CreateTrip } from './screens/CreateTrip';
import { JoinTrip } from './screens/JoinTrip';
import { TripSettings } from './screens/TripSettings';
import { DevTimeTravel } from './dev/DevTimeTravel';
import { useClock } from './lib/useClock';
import { useShrinkToFit } from './lib/useShrinkToFit';
import {
  AVATAR_INITIAL_LENGTH,
  DEFAULT_TRIP_ICON,
  DOT_SEPARATOR,
  ICONS,
  MEMBER_AVATAR_CAP,
  MS_PER_DAY,
  TABS,
  type TabId,
} from './constants';
import { daysUntilStart, type Mode } from './lib/mode';
import { addDays, formatDaysUntil, monthLabelFor, todayInTz } from './lib/time';
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
  // day-selector cue from mockups/plan-mode-v1.html — a gap to go fill.
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
  const pendingCount = useOutboxCount();
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
      monthLabel,
    };
  });
  // Trip mode anchors amber to TODAY (the live day), not to the selection
  // (ADR-0043 / ADR-0028): selecting a past day is a neutral highlight, a future
  // day violet (plan-ahead), and today keeps its amber dot wherever you browse —
  // so "where's now?" is always answerable from the chrome. Plan mode has no
  // "now", so it keeps its own violet-selection + empty-day grammar unchanged.
  const today = todayInTz(trip.timezone, now);
  const pillClass = (date: string) => {
    const c = ['day-pill'];
    const selected = date === activeDate;
    if (mode === 'trip') {
      if (selected) c.push(date === today ? 'on' : date < today ? 'sel-history' : 'sel-future');
      else if (date === today) c.push('today-anchor');
      else c.push(date < today ? 'past' : 'future');
    } else {
      if (selected) c.push('on');
      else if (date < activeDate) c.push('past');
      if (!datesWithEvents.has(date)) c.push('empty');
    }
    return c.join(' ');
  };
  // Day-scope context ribbon (ADR-0029/0043): only in Trip mode, only off today.
  const dayScope =
    mode === 'trip' && activeDate !== today ? (activeDate < today ? 'past' : 'future') : null;
  return (
    <header className="header">
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
                : t.header.leavingIn(formatDaysUntil(daysToGo));
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
            ⚙
          </button>
        </div>
      </div>
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
      <div className="day-strip">
        {days.map((d) => (
          <div key={d.date} className="day-pill-wrap">
            {d.monthLabel && <span className="month-label">{d.monthLabel}</span>}
            <button className={pillClass(d.date)} onClick={() => onSelectDay(d.date)}>
              {d.letter}
              <span className="n" dir="ltr">
                {d.dayOfMonth}
              </span>
            </button>
          </div>
        ))}
      </div>
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
  const { mode } = useMode();
  const { trip, setActiveDate, tripDeleted } = useTrip();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const now = useClock();
  // A remote admin deleting the trip while we're inside it (ADR-0039): leave to
  // the all-trips list rather than sitting on a trip that no longer exists.
  useEffect(() => {
    if (tripDeleted) navigate('/trips', { replace: true });
  }, [tripDeleted, navigate]);
  const onSelectDay = (date: string) => {
    setActiveDate(date);
    goToTab('days');
  };
  // Tapping Home in Trip mode is "back to now": the board is a live/today
  // surface (ADR-0043 anchors amber to today), so snap the day-strip selection
  // back to today rather than leaving a previously-browsed day highlighted while
  // the board shows now. Plan mode has no "now" — its day selection is preserved.
  const onSelectTab = (next: TabId) => {
    if (next === HOME_TAB && mode === 'trip') setActiveDate(todayInTz(trip.timezone, now));
    goToTab(next);
  };
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
  return (
    <div className="app" data-mode={mode} data-switching={switching ?? undefined}>
      <Header
        onSelectDay={onSelectDay}
        onOpenSwitcher={() => navigate('/trips')}
        onOpenAccount={() => setAccountOpen(true)}
        onOpenSettings={() => navigate(`/trip/${trip.id}/settings`)}
      />
      <main className="body" key={tab}>
        <Screen tab={tab} onNavigate={goToTab} />
      </main>
      <nav className="nav">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            className={tabDef.id === tab ? 'on' : ''}
            onClick={() => onSelectTab(tabDef.id)}
            aria-current={tabDef.id === tab}
          >
            <span className="ic">{tabDef.icon}</span>
            {t.tabs[tabDef.id]}
          </button>
        ))}
      </nav>
      {accountOpen && <AccountSheet onClose={() => setAccountOpen(false)} onSignOut={logout} />}
    </div>
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
function AuthGate() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isJoinRoute = location.pathname.startsWith('/join/');

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'anon') {
      if (location.pathname !== '/login' && !isJoinRoute) {
        saveIntent(location.pathname);
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
  if (location.pathname === '/login' || hasIntent()) return <BootScreen text={t.shell.booting} />;
  return <Outlet />;
}

function AppRoutes() {
  return (
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
  );
}

// Device-wide outbox flush (ADR-0042): a write queued offline must sync the
// moment connectivity returns — even from the all-trips list or zero-state,
// where no trip's realtime effect is mounted to flush its queue. Flushes every
// trip's queue on `online` and once on mount (to drain a queue left over from a
// prior offline session). Only while authed — a flush needs the session. The
// mounted trip still runs its own reconnect (flush + catch-up + resubscribe);
// flushOutbox coalesces so the two never double-POST.
function OutboxAutoFlush() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'authed') return;
    const flush = () => void flushAllOutbox();
    if (!isOffline()) flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [status]);
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
              {/* #app-shift is the parallax target the return gesture nudges
                  (ADR-0035 §5); EdgeSwipeBack sits outside it so it isn't moved. */}
              <div id="app-shift">
                <AppRoutes />
              </div>
              <EdgeSwipeBack />
              {import.meta.env.DEV && <DevTimeTravel />}
            </ConfirmProvider>
          </NavProvider>
        </ToastProvider>
      </ActiveTripIdProvider>
    </AuthProvider>
  );
}
