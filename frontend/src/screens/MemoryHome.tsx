// **THE MEMORY HOME** — what the Home is once a trip has finished (ADR-0240 §4, epic Phase 4).
//
// It replaces `PlanHome`'s past branch, which was three counts and a button. Every number on it
// is `tripRecap`'s (ADR-0239 §9, through `useTripRecap`), so this page and every share print
// the same figure for the same trip. Built in the epic's order, one item per change: 4.1 is the
// frame — the cover and `במספרים`; 4.2 the days as a contact sheet; 4.3 firsts and bests; 4.4 the
// stragglers sheet the cover opens; 4.5 next time; 4.6 the notes as a journal; 4.7 the
// record by kind, and the search over it from the cover.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '../i18n/he';
import { DOT_SEPARATOR, type TabId } from '../constants';
import { autoIsolate } from '../lib/bidi';
import type { DayShot } from '../lib/day-photo';
import { dayPhrase } from '../lib/hebrew';
import { cameHome, markCameHome } from '../lib/mode-seen';
import { prefersReducedMotion } from '../lib/motion';
import { placeLabelOf } from '../lib/place-label';
import {
  memoryBests,
  memoryDays,
  memoryFigures,
  memoryJournal,
  memoryNextTime,
  memoryRecord,
  memoryStragglers,
} from '../lib/memory-home';
import { formatTripDates, tripDayNumber } from '../lib/time';
import { useTripRecap } from '../lib/trip-recap';
import { useShowPlaceOnMap } from '../state/map-scope-state';
import { usePlaceLabels } from '../state/place-labels';
import { useTrip } from '../state/trip-state';
import { useVerbs } from '../state/verbs';
import { ContactSheet } from '../ui/domain/ContactSheet';
import { ListRow } from '../ui/domain/ListRow';
import { ComingHome } from '../ui/domain/ComingHome';
import { MemoryCover } from '../ui/domain/MemoryCover';
import { StatTile } from '../ui/domain/StatTile';
import { StragglersSheet } from '../ui/domain/StragglersSheet';
import { MediaViewer } from '../ui/MediaViewer';
import { NoteJournal } from '../ui/NoteJournal';
import { RecordKinds, RecordSearch, type RecordRowActions } from './MemoryRecord';
import './memory-home.css';

/** How many straggler titles the cover's footer names; the sheet it opens walks the rest. */
const STRAGGLER_TITLES = 2;

export function MemoryHome({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const {
    trip,
    users,
    events,
    bookings,
    places,
    maybeItems,
    notes,
    noteHosts,
    enrichments,
    zoneEvidence,
    setActiveDate,
  } = useTrip();
  const showOnMap = useShowPlaceOnMap();
  const placeLabels = usePlaceLabels();
  const recap = useTripRecap();
  const verbs = useVerbs();
  const [fullShot, setFullShot] = useState<DayShot | null>(null);
  const [settling, setSettling] = useState(false);
  const [searching, setSearching] = useState(false);
  const closeSettling = useCallback(() => setSettling(false), []);
  // **Coming home** (ADR-0241 §3): the first time this install shows this finished trip's Home.
  // Remembered here and never in the provider, which runs on every tab (a deep link elsewhere
  // must not consume it). Under reduced motion it is withheld, not shortened, and remembered.
  const [comingHome, setComingHome] = useState(() => !cameHome(trip.id));
  const endComingHome = useCallback(() => {
    markCameHome(trip.id);
    setComingHome(false);
  }, [trip.id]);
  useEffect(() => {
    if (comingHome && prefersReducedMotion()) endComingHome();
  }, [comingHome, endComingHome]);

  const when = [
    formatTripDates(trip.startDate, trip.endDate, { style: 'prose' }),
    dayPhrase(tripDayNumber(trip.endDate, trip.startDate)),
    autoIsolate(trip.destination),
  ].join(` ${DOT_SEPARATOR} `);

  const sheet = useMemo(
    () => memoryDays({ trip, events, bookings, places, placeLabels, enrichments }),
    [trip, events, bookings, places, placeLabels, enrichments],
  );

  const bests = useMemo(
    () =>
      recap
        ? memoryBests({ recap, events, bookings, days: sheet.days, evidence: zoneEvidence })
        : [],
    [recap, events, bookings, sheet.days, zoneEvidence],
  );
  /** A place the map can find: coordinates, not just a name (ADR-0147's place-lite). */
  const mappable = (placeId: string | undefined) =>
    placeId && places.some((place) => place.id === placeId && place.lat != null)
      ? placeId
      : undefined;

  const stragglers = useMemo(
    () => (recap ? memoryStragglers({ recap, events, evidence: zoneEvidence }) : []),
    [recap, events, zoneEvidence],
  );
  const nextTime = useMemo(
    () => (recap ? memoryNextTime({ recap, events, bookings, maybes: maybeItems }) : []),
    [recap, events, bookings, maybeItems],
  );
  const journal = useMemo(
    () =>
      memoryJournal({ trip, notes, hosts: noteHosts, evidence: zoneEvidence, days: sheet.days }),
    [trip, notes, noteHosts, zoneEvidence, sheet.days],
  );
  const record = useMemo(
    () =>
      memoryRecord({
        events,
        bookings,
        evidence: zoneEvidence,
        placeName: (id) =>
          placeLabelOf(placeLabels, id, places.find((place) => place.id === id)?.name),
      }),
    [events, bookings, zoneEvidence, placeLabels, places],
  );
  const recordActions: RecordRowActions = {
    onOpenDay: setActiveDate,
    toMap: (row) => {
      const placeId = mappable(row.placeId);
      return placeId && showOnMap ? () => showOnMap(placeId) : undefined;
    },
  };
  const figures = recap ? memoryFigures(recap) : [];
  const cover = recap?.cover;
  const route = recap?.figures.route.state === 'present' ? recap.figures.route.value : undefined;

  return (
    <>
      {/* No beat when there is nothing to count; it waits for the recap rather than being spent. */}
      {comingHome && figures.length > 0 && !prefersReducedMotion() && (
        <ComingHome
          name={trip.name}
          when={when}
          people={users}
          figures={figures}
          onDone={endComingHome}
        />
      )}
      <MemoryCover
        shot={cover && { ...cover, onOpen: () => setFullShot(cover) }}
        name={trip.name}
        when={when}
        people={users}
        route={route}
        stragglers={
          recap && {
            count: recap.stragglers.length,
            titles: stragglers.slice(0, STRAGGLER_TITLES).map((row) => row.event.title),
          }
        }
        onSettle={stragglers.length > 0 ? () => setSettling(true) : undefined}
        onSearch={record.length > 0 ? () => setSearching(true) : undefined}
      />

      {figures.length > 0 && (
        <>
          <div className="sec-title">{t.planHome.past.figures}</div>
          <div className="mem-figs" data-n={figures.length}>
            {figures.map((figure) => (
              <StatTile
                key={figure.key}
                value={figure.value}
                label={
                  <>
                    {figure.label}
                    {!!figure.unresolved && (
                      <span className="mem-fig-open">
                        {t.planHome.past.unresolved(figure.unresolved)}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </div>
        </>
      )}

      {sheet.days.length > 0 && (
        <>
          <div className="sec-title">{t.planHome.past.days}</div>
          {/* `setActiveDate` routes to the Day view itself; a second navigation after it would
              replace its `?day=` and land on the Days tab's default instead. */}
          <ContactSheet days={sheet.days} onOpen={setActiveDate} />
          {sheet.quiet > 0 && (
            <p className="mem-foot">{t.planHome.past.quietDays(dayPhrase(sheet.quiet))}</p>
          )}
        </>
      )}

      {bests.length > 0 && (
        <>
          <div className="sec-title">{t.planHome.past.bests.title}</div>
          <div className="mem-bests">
            {bests.map((row) => {
              const placeId = mappable(row.placeId);
              return (
                <ListRow
                  key={row.key}
                  icon={row.icon}
                  title={autoIsolate(row.title)}
                  openLabel={row.title}
                  meta={
                    <>
                      {[row.label, row.when].filter(Boolean).join(` ${DOT_SEPARATOR} `)}
                      {row.clock && (
                        <>
                          {` ${DOT_SEPARATOR} `}
                          <span className="mem-clock">{row.clock}</span>
                        </>
                      )}
                      {row.detail && ` ${DOT_SEPARATOR} ${row.detail}`}
                    </>
                  }
                  onOpen={() => setActiveDate(row.date)}
                  onShowOnMap={placeId && showOnMap ? () => showOnMap(placeId) : undefined}
                />
              );
            })}
          </div>
        </>
      )}

      {record.length > 0 && (
        <>
          <div className="sec-title">{t.planHome.past.record.title}</div>
          <RecordKinds rows={record} {...recordActions} />
        </>
      )}

      {journal.days.length > 0 && (
        <>
          <div className="sec-title">{t.planHome.past.journal.title}</div>
          <NoteJournal days={journal.days} />
          {journal.outside > 0 && (
            <p className="mem-foot">{t.planHome.past.journal.outside(journal.outside)}</p>
          )}
        </>
      )}

      {nextTime.length > 0 && (
        <>
          <div className="sec-title">{t.planHome.past.nextTime.title}</div>
          <div className="mem-next">
            {nextTime.map((row) => {
              const placeId = mappable(row.placeId);
              const toMap = placeId && showOnMap ? () => showOnMap(placeId) : undefined;
              const { date } = row;
              // A row opens its day. An idea for "someday" has none, so it opens its place, and
              // one with neither is a quiet row: the badge's pin sits INSIDE the open button, so
              // a disabled button would take the pin with it.
              const open = date ? () => setActiveDate(date) : toMap;
              return (
                <ListRow
                  key={row.id}
                  icon={row.icon}
                  title={autoIsolate(row.title)}
                  openLabel={row.title}
                  meta={
                    <>
                      {row.skipped ? (
                        <span className="tag-skip">{t.event.skipped}</span>
                      ) : (
                        t.planHome.past.nextTime.idea
                      )}
                      {row.when && ` ${DOT_SEPARATOR} ${row.when}`}
                    </>
                  }
                  disabled={!open}
                  onOpen={() => open?.()}
                  onShowOnMap={toMap}
                />
              );
            })}
          </div>
        </>
      )}

      <button className="addbtn mem-all-days" onClick={() => onNavigate('days')}>
        {t.planHome.past.viewDays}
      </button>

      {searching && (
        <RecordSearch
          rows={record}
          tripName={trip.name}
          onClose={() => setSearching(false)}
          {...recordActions}
        />
      )}

      {settling && (
        <StragglersSheet
          rows={stragglers}
          onDone={(row) => verbs.done(row.event)}
          onSkip={(row) => verbs.skip(row.event)}
          onClose={closeSettling}
        />
      )}

      {fullShot && (
        <MediaViewer
          title={fullShot.of}
          mimeType={fullShot.image.mimeType}
          source={{ kind: 'url', url: fullShot.url }}
          caption={fullShot.credit}
          intrinsic={fullShot.image}
          onClose={() => setFullShot(null)}
        />
      )}
    </>
  );
}
