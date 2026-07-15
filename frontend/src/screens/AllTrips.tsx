// All-trips home (ADR-0033): the home base for your trips — a navigation
// list, not a dashboard (no departure board; nothing is "live" here since a
// live trip opens directly). Landing when authenticated with trips but none
// live; also reached from inside a live trip via the header switcher pill —
// that live trip is what drives the "from-trip" back button + "current" mark
// below, no separate navigation-origin flag needed. Design reference:
// mockups/all-trips-v1.html.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Trip } from '@waypoint/shared';
import { useAuth } from '../state/auth-state';
import { useActiveTripId } from '../state/active-trip-id';
import { useIsOffline } from '../lib/outbox';
import { fetchTrips } from '../lib/api';
import { tripChip } from '../lib/active-trip';
import { daysUntilStart } from '../lib/mode';
import { useClock } from '../lib/useClock';
import { AVATAR_INITIAL_LENGTH, DEFAULT_TRIP_ICON, DOT_SEPARATOR, ICONS } from '../constants';
import { t } from '../i18n/he';

const dateFmt = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const dateRange = (trip: Trip) =>
  `${dateFmt.format(new Date(`${trip.startDate}T00:00:00Z`))}–${dateFmt.format(new Date(`${trip.endDate}T00:00:00Z`))}`;

export function AllTrips({ onOpenAccount }: { onOpenAccount: () => void }) {
  const navigate = useNavigate();
  const { me } = useAuth();
  const { setTripId } = useActiveTripId();
  const offline = useIsOffline();
  const now = useClock();
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

  if (trips === null) return null;

  const liveTrip = trips.find((trip) => tripChip(trip, now) === 'now');
  const pick = (trip: Trip) => {
    setTripId(trip.id);
    navigate('/');
  };

  return (
    <div className="app">
      <header className="zero-head">
        <div className="zero-head-row">
          <div className="head-left">
            {liveTrip && (
              <button
                className="back"
                onClick={() => navigate('/')}
                aria-label={t.shell.allTrips.back}
              >
                →
              </button>
            )}
            {me && (
              <div>
                <div className="zero-hello">{t.shell.allTrips.title}</div>
                <div className="zero-hello-sub">
                  <span className="g-dot" />
                  {t.shell.zeroState.connected(me.user.email)}
                </div>
              </div>
            )}
          </div>
          {me && (
            <button
              className="av account-btn"
              style={{ background: me.user.avatarColor }}
              onClick={onOpenAccount}
              title={me.user.displayName}
            >
              {me.user.displayName.slice(0, AVATAR_INITIAL_LENGTH)}
            </button>
          )}
        </div>
        {offline && (
          <div className="offline-badge">
            {ICONS.offline} {t.header.offlineNow}
          </div>
        )}
      </header>

      <main className="trips-body">
        <div className="sec">{t.shell.allTrips.tripsCount(trips.length)}</div>

        {trips.map((trip) => {
          const chip = tripChip(trip, now);
          const isCurrent = trip === liveTrip;
          const chipLabel =
            chip === 'now'
              ? t.shell.allTrips.chipNow
              : chip === 'soon'
                ? t.shell.allTrips.chipSoon(daysUntilStart(trip, now) ?? 0)
                : t.shell.allTrips.chipPast;
          return (
            <button
              key={trip.id}
              className={'trip-card' + (isCurrent ? ' current' : '')}
              onClick={() => pick(trip)}
            >
              <span className="flag">{trip.icon ?? DEFAULT_TRIP_ICON}</span>
              <span className="main">
                <span className="t">
                  {trip.name}
                  {isCurrent && <span className="cur">{t.shell.allTrips.current}</span>}
                </span>
                <span className="m">
                  {trip.destination}
                  <span className="dot">{DOT_SEPARATOR}</span>
                  <span dir="ltr">{dateRange(trip)}</span>
                  {trip.memberCount !== undefined && (
                    <>
                      <span className="dot">{DOT_SEPARATOR}</span>
                      {trip.memberCount} {ICONS.members}
                    </>
                  )}
                </span>
              </span>
              <span className={'chip ' + chip}>{chipLabel}</span>
            </button>
          );
        })}

        <div className="spacer" />

        <button className="create-btn" disabled={offline} onClick={() => navigate('/new')}>
          {ICONS.add} {t.shell.allTrips.create}
        </button>
        {offline && <p className="offline-note">{t.shell.allTrips.offlineNote}</p>}
      </main>
    </div>
  );
}
