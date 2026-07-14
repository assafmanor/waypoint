import { useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { Trip } from '@waypoint/shared';
import { TripProvider, useTrip } from './state/trip-state';
import { ModeProvider, useMode } from './state/mode-state';
import { AuthProvider, useAuth } from './state/auth-state';
import { ActiveTripIdProvider, useActiveTripId } from './state/active-trip-id';
import { useIsOffline, useOutboxCount } from './lib/outbox';
import { fetchTrips } from './lib/api';
import { resolveActiveTrip, tripChip } from './lib/active-trip';
import { consumeIntent, saveIntent } from './lib/intent';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { Sheet } from './ui/Sheet';
import { Home } from './screens/Home';
import { DayView } from './screens/DayView';
import { Login } from './screens/Login';
import { ZeroState } from './screens/ZeroState';
import { AllTrips } from './screens/AllTrips';
import { ShellStub } from './screens/ShellStub';
import { CreateTrip } from './screens/CreateTrip';
import { JoinTrip } from './screens/JoinTrip';
import { DevTimeTravel } from './dev/DevTimeTravel';
import { useClock } from './lib/useClock';
import {
  AVATAR_INITIAL_LENGTH,
  DOT_SEPARATOR,
  ICONS,
  MEMBER_AVATAR_CAP,
  MS_PER_DAY,
  TABS,
  type TabId,
} from './constants';
import { daysUntilStart, type Mode } from './lib/mode';
import { addDays, monthLabelFor } from './lib/time';
import { t } from './i18n/he';
import './App.css';
import './screens.css';

// Map & Index are designed later (T-002); Home/Day-by-day's Plan-mode content
// is T-018's — all fall back here, with a mode-emphasis subtitle (T-019).
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
// reset control needed. The "switches on <date>" hint only means something
// pre-trip: it's suppressed once the trip has started, whether that's the
// real derived mode or an override (peeking at Trip mode pre-trip, or
// tweaking the plan mid-trip, both hide it too). The prominent
// countdown-to-departure lives on Home's Plan-mode prep dashboard (T-055),
// not here — this is just a small, secondary reminder.
function ModeToggle() {
  const { trip } = useTrip();
  const now = useClock();
  const { mode, setOverride } = useMode();
  const isPreTrip = mode === 'plan' && daysUntilStart(trip, now) !== null;
  const startLabel = isPreTrip
    ? new Intl.DateTimeFormat('he-IL', {
        day: 'numeric',
        month: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${trip.startDate}T00:00:00Z`))
    : null;
  return (
    <div className="modebar">
      <div className="toggle">
        <button className={mode === 'plan' ? 'on' : ''} onClick={() => setOverride('plan')}>
          {ICONS.edit} {t.mode.plan}
        </button>
        <button className={mode === 'trip' ? 'on' : ''} onClick={() => setOverride('trip')}>
          {ICONS.navigate} {t.mode.trip}
        </button>
        {startLabel && <span className="auto">{t.mode.autoHint(startLabel)}</span>}
      </div>
    </div>
  );
}

function Header({
  tripCount,
  onSelectDay,
  onOpenSwitcher,
  onOpenAccount,
  onOpenSettings,
}: {
  tripCount: number;
  onSelectDay: (date: string) => void;
  onOpenSwitcher: () => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}) {
  const { trip, users, activeDate, usingCachedSnapshot } = useTrip();
  const { me } = useAuth();
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
  return (
    <header className="header">
      <ModeToggle />
      <div className="trip-row">
        <div>
          {tripCount > 1 ? (
            <button
              className="trip-name-btn"
              onClick={onOpenSwitcher}
              aria-label={t.shell.switcher.title}
            >
              <span className="trip-name">{trip.name}</span>
              <span className="chev">▾</span>
            </button>
          ) : (
            <span className="trip-name">{trip.name}</span>
          )}
          <div className="trip-sub">
            {trip.destination}
            <span className="dot">{DOT_SEPARATOR}</span>
            {t.header.dayOf(dayNumber, total)}
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
            <button
              className={
                'day-pill' + (d.date === activeDate ? ' on' : d.date < activeDate ? ' past' : '')
              }
              onClick={() => onSelectDay(d.date)}
            >
              {d.letter}
              <span className="n" dir="ltr">
                {d.dayOfMonth}
              </span>
            </button>
          </div>
        ))}
      </div>
    </header>
  );
}

// Tabs re-emphasize by mode (ADR-0016), not duplicate screens: Home/Day-by-day
// only have their Trip-mode content built so far, so Plan mode (and Map/Index,
// which are unbuilt either way — T-002) fall back to Placeholder.
function Screen({ tab }: { tab: TabId }) {
  const { mode } = useMode();
  if (tab === 'home' && mode === 'trip') return <Home />;
  if (tab === 'days' && mode === 'trip') return <DayView />;
  return <Placeholder tab={tab} mode={mode} />;
}

// data-mode on the shell root lets CSS follow the mode identity rule
// (design-language mode identity: plan mode never uses amber) without every
// component reading mode state. Needs its own component because App renders
// ModeProvider itself and so can't call useMode.
function Shell({ tripCount }: { tripCount: number }) {
  const [tab, setTab] = useState<TabId>('home');
  const [accountOpen, setAccountOpen] = useState(false);
  const { mode } = useMode();
  const { trip, setActiveDate } = useTrip();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const onSelectDay = (date: string) => {
    setActiveDate(date);
    setTab('days');
  };
  return (
    <div className="app" data-mode={mode}>
      <Header
        tripCount={tripCount}
        onSelectDay={onSelectDay}
        onOpenSwitcher={() => navigate('/trips')}
        onOpenAccount={() => setAccountOpen(true)}
        onOpenSettings={() => navigate(`/trip/${trip.id}/settings`)}
      />
      <main className="body" key={tab}>
        <Screen tab={tab} />
      </main>
      <nav className="nav">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            className={tabDef.id === tab ? 'on' : ''}
            onClick={() => setTab(tabDef.id)}
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

function RootSurface() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTrips().then(
      (list) => {
        if (!cancelled) setTrips(list);
      },
      () => {
        if (!cancelled) setTrips([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const { tripId: storedTripId } = useActiveTripId();
  const now = useClock();

  if (trips === null) return <BootScreen text={t.shell.booting} />;
  if (trips.length === 0) return <ZeroStateWithAccount />;

  // A manual pick (tapping a trip on /trips) is honored regardless of whether
  // it's live — only the *auto-derived* landing defers to /trips when nothing
  // is in progress (ADR-0033).
  const validStoredId = storedTripId && trips.some((tr) => tr.id === storedTripId);
  if (!validStoredId) {
    const resolved = resolveActiveTrip(trips, now)!;
    if (tripChip(resolved, now) !== 'now') return <Navigate to="/trips" replace />;
  }
  const tripId = validStoredId ? storedTripId : resolveActiveTrip(trips, now)!.id;

  return (
    <TripProvider tripId={tripId}>
      <ModeProvider>
        <Shell tripCount={trips.length} />
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
  return location.pathname === '/login' ? <BootScreen text={t.shell.booting} /> : <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthGate />}>
        <Route path="login" element={<Login />} />
        <Route path="trips" element={<AllTripsWithAccount />} />
        <Route path="new" element={<CreateTrip />} />
        <Route path="join/:token" element={<JoinTrip />} />
        <Route path="trip/:id/settings" element={<ShellStub title={t.shell.stub.settings} />} />
        <Route path="*" element={<RootSurface />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ActiveTripIdProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppRoutes />
            {import.meta.env.DEV && <DevTimeTravel />}
          </ConfirmProvider>
        </ToastProvider>
      </ActiveTripIdProvider>
    </AuthProvider>
  );
}
