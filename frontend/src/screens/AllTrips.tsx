// All-trips home (ADR-0033): the home base for your trips — a navigation
// list, not a dashboard (no departure board; nothing is "live" here since a
// live trip opens directly). Landing when authenticated with trips but none
// live; also reached from inside a live trip via the header switcher pill.
//
// The list is SECTIONED by date-derived status (עכשיו / בקרוב / הסתיים) so the
// hierarchy reads at a glance, and the live trip gets a prominent indigo hero
// (chrome-base color only — no board glow/pulse/now-next, so board scarcity
// still holds; ADR-0028/0033). A live trip present is also what drives the
// header back button. Design reference: mockups/all-trips-v2.html.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Trip } from '@waypoint/shared';
import { useAuth } from '../state/auth-state';
import { useActiveTripId } from '../state/active-trip-id';
import { useIsOffline } from '../lib/outbox';
import { fetchTrips } from '../lib/api';
import { tripChip, type TripChip } from '../lib/active-trip';
import { daysUntilStart } from '../lib/mode';
import { useClock } from '../lib/useClock';
import { AVATAR_INITIAL_LENGTH, DEFAULT_TRIP_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

const NBSP = ' ';

const dateFmt = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const dateRange = (trip: Trip) =>
  `${dateFmt.format(new Date(`${trip.startDate}T00:00:00Z`))}–${dateFmt.format(new Date(`${trip.endDate}T00:00:00Z`))}`;

// `destination` is free text; hide it when the trip name already carries it
// (e.g. name "לפה ולשם ׳26" + destination "לפה ולשם") to keep the meta lean.
const metaDestination = (trip: Trip): string | null => {
  const dest = trip.destination.trim();
  if (!dest || trip.name.includes(dest)) return null;
  return dest;
};

// Meta line: spaced middots, dates & member count in mono `dir="ltr"` so the
// numeric runs render correctly in the RTL flow (design-language: mono = dates).
function TripMeta({ trip }: { trip: Trip }) {
  const dest = metaDestination(trip);
  return (
    <span className="m">
      {dest && (
        <>
          {dest}
          <span className="sep" aria-hidden="true" />
        </>
      )}
      <span className="num" dir="ltr">
        {dateRange(trip)}
      </span>
      {trip.memberCount !== undefined && (
        <>
          <span className="sep" aria-hidden="true" />
          <span className="ppl" dir="ltr">
            {trip.memberCount}
          </span>
          {NBSP}
          {ICONS.members}
        </>
      )}
    </span>
  );
}

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

  const buckets: Record<TripChip, Trip[]> = { now: [], soon: [], past: [] };
  for (const trip of trips) buckets[tripChip(trip, now)].push(trip);
  buckets.now.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  buckets.soon.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  buckets.past.sort((a, b) => (a.endDate > b.endDate ? -1 : 1));

  const pick = (trip: Trip) => {
    setTripId(trip.id);
    navigate('/');
  };

  const hero = (trip: Trip) => (
    <button key={trip.id} className="trip-hero" onClick={() => pick(trip)}>
      <span className="flag">{trip.icon ?? DEFAULT_TRIP_ICON}</span>
      <span className="main">
        <span className="t">{trip.name}</span>
        <TripMeta trip={trip} />
      </span>
      <span className="go" aria-hidden="true">
        →
      </span>
    </button>
  );

  const row = (trip: Trip, chip: 'soon' | 'past') => (
    <button
      key={trip.id}
      className={'trip-card' + (chip === 'past' ? ' is-past' : '')}
      onClick={() => pick(trip)}
    >
      <span className="flag">{trip.icon ?? DEFAULT_TRIP_ICON}</span>
      <span className="main">
        <span className="t">{trip.name}</span>
        <TripMeta trip={trip} />
      </span>
      <span className={'chip ' + chip}>
        {chip === 'soon'
          ? t.shell.allTrips.chipSoon(daysUntilStart(trip, now) ?? 0)
          : t.shell.allTrips.chipPast}
      </span>
    </button>
  );

  return (
    <div className="app">
      <header className="zero-head">
        <div className="zero-head-row">
          <div className="head-left">
            {buckets.now.length > 0 && (
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
        {buckets.now.length > 0 && (
          <>
            <div className="sec">{t.shell.allTrips.sectionNow}</div>
            {buckets.now.map(hero)}
          </>
        )}
        {buckets.soon.length > 0 && (
          <>
            <div className="sec">{t.shell.allTrips.sectionSoon}</div>
            {buckets.soon.map((trip) => row(trip, 'soon'))}
          </>
        )}
        {buckets.past.length > 0 && (
          <>
            <div className="sec">{t.shell.allTrips.sectionPast}</div>
            {buckets.past.map((trip) => row(trip, 'past'))}
          </>
        )}

        <div className="spacer" />

        <button className="create-btn" disabled={offline} onClick={() => navigate('/new')}>
          {ICONS.add} {t.shell.allTrips.create}
        </button>
        {offline && <p className="offline-note">{t.shell.allTrips.offlineNote}</p>}
      </main>
    </div>
  );
}
