import { useState } from 'react';
import { TripProvider, useTrip } from './state/trip-state';
import { ModeProvider, useMode } from './state/mode-state';
import { useIsOffline, useOutboxCount } from './lib/outbox';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { Home } from './screens/Home';
import { DayView } from './screens/DayView';
import { DevTimeTravel } from './dev/DevTimeTravel';
import { useClock } from './lib/useClock';
import { TRIP } from './fixtures';
import {
  AVATAR_INITIAL_LENGTH,
  DOT_SEPARATOR,
  ICONS,
  MS_PER_DAY,
  TABS,
  type TabId,
} from './constants';
import { daysUntilStart, type Mode } from './lib/mode';
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

function Header() {
  const { trip, users, activeDate, usingCachedSnapshot } = useTrip();
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
  const days = Array.from({ length: total }, (_, i) => {
    const date = new Date(Date.parse(trip.startDate) + i * MS_PER_DAY);
    return { n: i + 1, letter: weekdayLetter.format(date) };
  });
  return (
    <header className="header">
      <ModeToggle />
      <div className="trip-row">
        <div>
          <div className="trip-name">{trip.name}</div>
          <div className="trip-sub">
            {trip.destination}
            <span className="dot">{DOT_SEPARATOR}</span>
            {t.header.dayOf(dayNumber, total)}
          </div>
        </div>
        <div className="avatars">
          {users.map((u) => (
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
      </div>
      <div className="gnote">
        <span className="g" />
        {t.header.googleNote}
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
          <div
            key={d.n}
            className={'day-pill' + (d.n === dayNumber ? ' on' : d.n < dayNumber ? ' past' : '')}
          >
            {d.letter}
            <span className="n" dir="ltr">
              {String(d.n).padStart(2, '0')}
            </span>
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

export function App() {
  const [tab, setTab] = useState<TabId>('home');
  return (
    <TripProvider tripId={TRIP.id}>
      <ModeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <div className="app">
              <Header />
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
            </div>
            {import.meta.env.DEV && <DevTimeTravel />}
          </ConfirmProvider>
        </ToastProvider>
      </ModeProvider>
    </TripProvider>
  );
}
