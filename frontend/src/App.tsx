import { useState } from 'react';
import { TripProvider, useTrip } from './state/trip-state';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { Home } from './screens/Home';
import { DayView } from './screens/DayView';
import { DevTimeTravel } from './dev/DevTimeTravel';
import { TRIP } from './fixtures';
import { AVATAR_INITIAL_LENGTH, DOT_SEPARATOR, MS_PER_DAY, TABS, type TabId } from './constants';
import { t } from './i18n/he';
import './App.css';
import './screens.css';

// Map & Index are designed later (T-002); kept as placeholders so the nav is whole.
function Placeholder({ label }: { label: string }) {
  return (
    <div className="placeholder">
      <h1>{label}</h1>
      <p>{t.placeholder.comingSoon}</p>
    </div>
  );
}

function Header() {
  const { trip, users, activeDate } = useTrip();
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

function Screen({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'home':
      return <Home />;
    case 'days':
      return <DayView />;
    default:
      return <Placeholder label={t.tabs[tab]} />;
  }
}

export function App() {
  const [tab, setTab] = useState<TabId>('home');
  return (
    <TripProvider tripId={TRIP.id}>
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
    </TripProvider>
  );
}
