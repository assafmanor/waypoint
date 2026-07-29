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
import { useBackLayer } from '../state/nav-state';
import { useIsOffline } from '../lib/outbox';
import { loadTripList } from '../lib/cache';
import { tripChip, type TripChip } from '../lib/active-trip';
import { daysUntilStart } from '../lib/mode';
import { formatTripDates } from '../lib/time';
import { useClock } from '../lib/useClock';
import { DEFAULT_TRIP_ICON, GLYPH } from '../constants';
import { NavArrow } from '../ui/NavArrow';
import { t } from '../i18n/he';
import { Avatar } from '../ui/primitives/Avatar';
import { Icon } from '../ui/Icon';

const NBSP = ' ';

// `destination` is free text; hide it when the trip name already carries it
// (e.g. name "לפה ולשם ׳26" + destination "לפה ולשם") to keep the meta lean.
const metaDestination = (trip: Trip): string | null => {
  const dest = trip.destination.trim();
  if (!dest || trip.name.includes(dest)) return null;
  return dest;
};

// Meta line: spaced middots, dates & member count in mono `dir="auto"` so the
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
      <span className="num" dir="auto">
        {formatTripDates(trip.startDate, trip.endDate)}
      </span>
      {trip.memberCount !== undefined && (
        <>
          <span className="sep" aria-hidden="true" />
          <span className="ppl" dir="auto">
            {trip.memberCount}
          </span>
          {NBSP}
          {GLYPH.members}
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
    // Falls back to the cached list offline so the all-trips view (and the back
    // route into a live trip) keeps working with no network.
    loadTripList().then(({ trips: list }) => {
      if (!cancelled) setTrips(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // **THE BACK ARROW AND THE SYSTEM BACK ARE ONE FUNCTION** (owner, session 175). This
  // screen is a declared root (`ROOT_PATHS`), so a structural back here is a no-op and the
  // OS leaves the app — correct when there is nowhere in-app to go, and wrong the moment
  // the header renders its arrow back into a live trip. Cold-launched at `/trips` (a PWA
  // shortcut, a reload) there is no history entry to fall back on either, so the divergence
  // is real and not just cosmetic: the button returned to the trip and the gesture quit.
  //
  // A back LAYER rather than a rule in `resolveBack`, because "is there a live trip" is
  // data this screen has already loaded and nav state deliberately does not carry
  // (ADR-0090 keeps the snapshot to navigation facts). Gated on exactly what renders the
  // arrow, and bound to the same handler, so the two cannot drift apart again.
  const hasLiveTrip = (trips ?? []).some((trip) => tripChip(trip, now) === 'now');
  const backToLiveTrip = () => navigate('/');
  useBackLayer(() => {
    backToLiveTrip();
    return { remainsActive: false };
  }, hasLiveTrip);

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
      <span className="go">
        <NavArrow variant="forward" />
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
              <button className="back" onClick={backToLiveTrip} aria-label={t.shell.allTrips.back}>
                <NavArrow variant="back" />
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
            <Avatar
              person={me.user}
              size="inherit"
              className="av account-btn"
              onClick={onOpenAccount}
              label={t.shell.account.title}
            />
          )}
        </div>
        {offline && (
          <div className="offline-badge">
            <Icon name="offline" /> {t.header.offlineNow}
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
          <Icon name="plus" /> {t.shell.allTrips.create}
        </button>
        {offline && <p className="offline-note">{t.shell.allTrips.offlineNote}</p>}
      </main>
    </div>
  );
}
