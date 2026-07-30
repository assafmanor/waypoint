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
import { NAV_DIR, useBackLayer } from '../state/nav-state';
import { beginTripHandoff } from '../lib/trip-handoff';
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
import { ZeroState } from './ZeroState';

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
  // Stamped BACK for the same reason `runStructural` stamps it (ADR-0140 §3): this is a
  // back that moves, so it must recede rather than advance. It navigates here rather than
  // through the resolver — "is there a live trip" is data only this screen has — which is
  // exactly how it was left reading as a forward push.
  const backToLiveTrip = () => navigate('/', { state: { navDir: NAV_DIR.BACK } });
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

  // Picking a trip carries its glyph into the shell's switcher pill (ADR-0140 §7). The
  // handoff and the ordinary forward slide are ALTERNATIVES, never both: the shared
  // element is already the answer to "where did this come from", and a translating shell
  // would offset the rect the glyph is aiming at. So when it can't fly — reduced motion,
  // a tile with no measurable box — the plain route transition plays instead.
  const pick = (trip: Trip, card: HTMLElement) => {
    setTripId(trip.id);
    const flying = beginTripHandoff(card.querySelector('.flag'), trip.id);
    navigate('/', flying ? { state: { navDir: NAV_DIR.HANDOFF } } : undefined);
  };

  const hero = (trip: Trip) => (
    <button key={trip.id} className="trip-hero" onClick={(e) => pick(trip, e.currentTarget)}>
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
      onClick={(e) => pick(trip, e.currentTarget)}
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

  // No trips at all → the ZERO STATE, which is the app's designed answer to exactly this
  // (ADR-0024 §2: the dormant departure board plus the create/join pair). `/trips` used to
  // render its own chrome around nothing — a header, a CTA and a grey void between them —
  // because every bucket was empty so every section was skipped.
  //
  // Reusing that screen rather than giving this one an `EmptyState`: a second no-trips
  // surface is the duplication ADRs 0078/0079/0094/0095 exist to undo, and the board being
  // UNPOWERED is the thing trip birth later switches on (ADR-0142). Two of them would mean
  // half the users never see the "before" of that pair.
  //
  // `trips === null` is still loading and must not read as empty.
  if (trips?.length === 0) return <ZeroState onOpenAccount={onOpenAccount} />;

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
