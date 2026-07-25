// The Map tab (Phase 3, ADR-0109/0110) — the list-first pinned-place surface,
// re-emphasized by mode: Trip defaults to today's places, Plan to all. It reuses
// the Index filter grammar (ChoiceGrid pills + SearchOverlay + the mode-tinted
// --idx-accent) and reads the one shared derivation (lib/place-usage.ts) for both
// the chip counts and each row's category badge/commitment. No rendered map yet
// (that's Phase 6): rows deep-link out to Google Maps (ADR-0106 "deep-link, don't
// rebuild nav") — the row tap views the place, the trailing נווט gives directions.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { iconForCategory, matchesAnyTerm, type EventCategory, type Place } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { useMapScope } from '../state/map-scope-state';
import { useIsOffline } from '../lib/outbox';
import {
  buildPlaceUsageIndex,
  comparePlacesBySchedule,
  countPlacesByCategory,
  isDayUsagePast,
  matchesPlaceFilter,
  placeDay,
  PLACE_CATEGORY_ALL,
  type PlaceCategoryFilter,
  type PlaceUsage,
} from '../lib/place-usage';
import {
  eventZones,
  liveToday,
  liveZoneContext,
  mapsDirectionsUrl,
  mapsPlaceUrl,
  nextDestination,
} from '../lib/places';
import { formatTime, relativeDayLabel } from '../lib/time';
import { eventEdgeTransition } from '../lib/transitions';
import { shortTitleText } from '../lib/route-title';
import { useClock } from '../lib/useClock';
import { formatDistance, haversineMeters } from '../lib/distance';
import { useGeolocation } from '../lib/useGeolocation';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import { CATEGORY_PIN_HUE, DOT_SEPARATOR, ICONS } from '../constants';
import { ChoiceGrid, type Choice } from '../ui/primitives/ChoiceGrid';
import { PlacePickerSheet } from '../ui/primitives/PlacePicker';
import { SearchOverlay } from '../ui/primitives/SearchOverlay';
import { EmptyState, StatusBanner } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { t } from '../i18n/he';
import './map.css';

const openMaps = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export function MapView() {
  const {
    trip,
    events,
    bookings,
    maybeItems,
    places,
    activeDate,
    zoneEvidence,
    usingCachedSnapshot,
  } = useTrip();
  const { mode } = useMode();
  const offline = useIsOffline() || usingCachedSnapshot;
  const nowMs = useClock().getTime();

  const [category, setCategory] = useState<PlaceCategoryFilter>(PLACE_CATEGORY_ALL);
  const [maybesOnly, setMaybesOnly] = useState(false);
  // "All days" is map-local scope (ADR-0110 §4), not the global day param, and it
  // lives in a lifted context so the header DayStrip can drop its selection while
  // it's on. Trip defaults to today, Plan to all; it re-defaults on a mode switch,
  // and a strip day-tap (which changes activeDate) narrows back out of it.
  const { allDays, setAllDays } = useMapScope();
  useEffect(() => setAllDays(mode === 'plan'), [mode, setAllDays]);
  const prevDate = useRef(activeDate);
  useEffect(() => {
    if (activeDate !== prevDate.current) {
      prevDate.current = activeDate;
      setAllDays(false);
    }
  }, [activeDate, setAllDays]);

  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  // A coordless Place-lite the user chose to enrich from the map (＋ מיקום).
  const [enrichTarget, setEnrichTarget] = useState<Place | null>(null);

  // ── "Near me now" (Phase 4a, ADR-0109 §6-7) ───────────────────────────────
  // Strictly additive: the tab has already rendered everything above without any
  // location, and nothing below turns a refusal into a dead end. `nearMe` is the
  // user's intent; `nearActive` is whether we can actually honour it right now.
  const geo = useGeolocation();
  const [nearMe, setNearMe] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const nearActive = nearMe && !offline && geo.status === 'granted' && !!geo.coords;
  // Offline you cannot re-locate, so a distance would be a stale claim: the chip
  // goes away and the rows that were showing numbers say so instead.
  const staleDistances = nearMe && offline;
  const locationRefused = geo.status === 'denied' || geo.status === 'unavailable';
  const showNotice = nearMe && !offline && locationRefused && !noticeDismissed;

  const askForLocation = () => {
    setPromptOpen(false);
    setNearMe(true);
    setNoticeDismissed(false);
    geo.request();
  };
  const toggleNearMe = () => {
    if (nearMe) {
      setNearMe(false);
      return;
    }
    // A fix we already hold needs no second prompt; otherwise state the reason
    // first (ADR-0109 §6 — never a cold permission dialog).
    if (geo.status === 'granted' && geo.coords) {
      setNearMe(true);
      return;
    }
    if (geo.blocked) {
      setNearMe(true);
      setNoticeDismissed(false);
      return;
    }
    setPromptOpen(true);
  };

  const distances = useMemo(() => {
    const here = geo.coords;
    const byPlace = new Map<string, number>();
    if (!here) return byPlace;
    for (const place of places) {
      if (place.lat == null || place.lng == null) continue;
      byPlace.set(place.id, haversineMeters(here, { lat: place.lat, lng: place.lng }));
    }
    return byPlace;
  }, [geo.coords, places]);

  const usageIndex = useMemo(
    () => buildPlaceUsageIndex(events, bookings, maybeItems, places),
    [events, bookings, maybeItems, places],
  );
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const allUsages = useMemo(() => [...usageIndex.values()], [usageIndex]);

  // Day scope: all places (all-days) or only those anchored to the active day.
  const dayScoped = useMemo(
    () =>
      allDays ? allUsages : allUsages.filter((u) => u.days.some((d) => d.date === activeDate)),
    [allUsages, allDays, activeDate],
  );

  const categoryCounts = useMemo(() => countPlacesByCategory(dayScoped), [dayScoped]);
  const maybesInScope = dayScoped.filter((u) => u.isMaybe).length;
  const hasMaybes = allUsages.some((u) => u.isMaybe);
  // Fall back to "all" if the picked type emptied out for the current day scope
  // (matches the Index), without mutating the stored selection.
  const activeCategory =
    category !== PLACE_CATEGORY_ALL && (categoryCounts[category as EventCategory] ?? 0) === 0
      ? PLACE_CATEGORY_ALL
      : category;

  const typeOptions: Choice<PlaceCategoryFilter>[] = [
    { value: PLACE_CATEGORY_ALL, icon: '', label: t.map.filter.all, count: dayScoped.length },
    ...EVENT_CATEGORY_OPTIONS.filter((o) => categoryCounts[o.value] > 0).map((o) => ({
      value: o.value,
      icon: o.icon,
      label: o.label,
      count: categoryCounts[o.value],
    })),
  ];

  // The default order is the order the trip HAPPENS in (ADR-0109 §1 amendment) —
  // within a day, the day view's own start-then-sortOrder vocabulary, so the two
  // surfaces can't disagree. Day-scoped, it ranks by that day's moments; all-days,
  // by each place's earliest day.
  //
  // Trip mode also sinks what's behind you (session-107 amendment): the live question
  // is what's ahead, so a place you've already been must not outrank the stop you're
  // heading to. Plan mode passes no clock — it drafts the sequence, where "past" says
  // nothing about a trip not yet taken.
  const scopedDate = allDays ? undefined : activeDate;
  const orderCtx = {
    nameOf: (u: PlaceUsage) => placeById.get(u.placeId)?.name ?? '',
    onDate: scopedDate,
    nowMs: mode === 'trip' ? nowMs : undefined,
  };
  const bySchedule = (a: PlaceUsage, b: PlaceUsage) => comparePlacesBySchedule(a, b, orderCtx);
  // Which rows the sink applies to — the list labels that block rather than
  // reordering silently as the clock passes each stop.
  const isBehind = (u: PlaceUsage) => {
    if (orderCtx.nowMs == null) return false;
    const day = placeDay(u, scopedDate);
    return day ? isDayUsagePast(day, orderCtx.nowMs) : false;
  };

  // Near-me order: measured places nearest-first, and a coordless Place-lite sinks
  // to the end with no distance — it can't be measured until the picker enriches it
  // (ADR-0109 §7). Ties and unmeasured rows fall back to the schedule order, so the
  // list is never arbitrary.
  const byDistance = (a: PlaceUsage, b: PlaceUsage) => {
    const da = distances.get(a.placeId);
    const db = distances.get(b.placeId);
    if (da == null && db == null) return bySchedule(a, b);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db || bySchedule(a, b);
  };
  const listOrder = nearActive ? byDistance : bySchedule;

  const visible = dayScoped
    .filter((u) => matchesPlaceFilter(u, { category: activeCategory, maybesOnly }))
    .sort(listOrder);

  // Search spans every place in the trip (name + address), ignoring day scope and
  // filters — the same "search is global" rule as the Index.
  const searchResults = useMemo(() => {
    if (!query.trim()) return allUsages.slice().sort(listOrder);
    return allUsages
      .filter((u) => {
        const p = placeById.get(u.placeId);
        return p && matchesAnyTerm(query, [p.name, p.address]);
      })
      .sort(listOrder);
  }, [query, allUsages, placeById, nearActive, distances]);

  // navigate-to-next (ADR-0106 §6) on the list: not a re-sort or a second control,
  // just the one time-anchor cue the map's colour budget allows (ADR-0109 §6 — the
  // list form of the rendered map's single amber ring), naming when you leave. The
  // row's existing נווט is then the navigate-to-next action. Only in Trip mode: a
  // live "next" says nothing while you're planning.
  // The row now states its own time (below), so the cue only has to say WHICH row.
  const nextStopId = useMemo(() => {
    if (mode !== 'trip') return undefined;
    return nextDestination(events, bookings, places, nowMs)?.place.id;
  }, [mode, events, bookings, places, nowMs]);

  // ── The row's meta line: `<time> · <what happens here>` (ADR-0109 §1) ──────
  // It replaces the address, which said nothing about why the place is on the list
  // (the shipped row read "Dimitras, Nicosia, Lefkosia 2058" — true and useless).
  // The time renders in the EVENT's own zone (ADR-0107), and each end of a booking
  // gets its own: a departure in its origin, an arrival in its destination.
  const zoneCtx = useMemo(() => liveZoneContext(nowMs, zoneEvidence), [nowMs, zoneEvidence]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const dayMeta = (usage: PlaceUsage): { day?: string; time?: string; what?: string } => {
    const usageDay = placeDay(usage, scopedDate);
    // A strictly-middle stay night has no moment and nothing happens there — saying
    // the hotel's own name back on the hotel's row would be pure repetition.
    if (!usageDay || usageDay.prominence === 'ambient') return {};
    // Which day only matters when the list spans several: day-scoped, the strip and
    // the scope hint already name it, so `היום ·` on every row would be pure noise.
    const day = allDays
      ? relativeDayLabel(usageDay.date, liveToday(nowMs, zoneEvidence))
      : undefined;
    const event = usageDay.eventId ? eventById.get(usageDay.eventId) : undefined;
    if (!event) return { day };
    const zones = eventZones(event, zoneCtx);
    const zone = usageDay.edge === 'end' ? zones.endZone : zones.startZone;
    return {
      day,
      time: usageDay.at == null ? undefined : formatTime(new Date(usageDay.at), zone),
      // A bracketed booking says which end this is, in the app's existing per-mode
      // transition wording (take-off/landing for a flight, departure/arrival for
      // surface transport, check-in/out for a stay) — never a bare transition word,
      // because the row's own name and time supply the context §1 asks for. Anything
      // else says what it is, via its title in display form.
      what: eventEdgeTransition(event, usageDay.edge) ?? shortTitleText(event.title),
    };
  };

  // A measured place shows its distance; offline it says so rather than asserting a
  // number it can no longer refresh. A coordless row gets neither (ADR-0109 §7).
  const distanceLabel = (usage: PlaceUsage): string | undefined => {
    if (usage.coordless) return undefined;
    if (staleDistances) return t.map.near.unavailable;
    if (!nearActive) return undefined;
    const meters = distances.get(usage.placeId);
    return meters == null ? undefined : formatDistance(meters);
  };

  const renderRow = (usage: PlaceUsage) => {
    const place = placeById.get(usage.placeId);
    if (!place) return null;
    const prominence = allDays
      ? undefined
      : usage.days.find((d) => d.date === activeDate)?.prominence;
    const { day, time, what } = dayMeta(usage);
    return (
      <PlaceRow
        key={usage.placeId}
        usage={usage}
        place={place}
        ambient={prominence === 'ambient'}
        isNextStop={nextStopId === usage.placeId}
        day={day}
        time={time}
        what={what}
        distance={distanceLabel(usage)}
        distanceStale={staleDistances}
        onEnrich={() => setEnrichTarget(place)}
      />
    );
  };

  // The list and its group headers. One shared renderer so the search overlay's list
  // gets the same treatment. Near-me labels the whole list; schedule order labels the
  // sunk block where it starts, so "why is this down here" is answered on screen.
  const renderList = (usages: PlaceUsage[]) => {
    const firstBehind = nearActive ? -1 : usages.findIndex(isBehind);
    return (
      <>
        {nearActive && usages.some((u) => !u.coordless) && (
          <div className="map-grouphead">{t.map.near.groupHeader}</div>
        )}
        <div className="map-list">
          {usages.map((usage, i) => (
            <Fragment key={usage.placeId}>
              {i === firstBehind && <div className="map-grouphead">{t.map.behindHeader}</div>}
              {renderRow(usage)}
            </Fragment>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="map-screen" data-mode={mode} data-offline={offline || undefined}>
      {offline && <StatusBanner tone="offline">{t.header.offlineNow}</StatusBanner>}

      <div className="map-filter-row">
        <ChoiceGrid
          options={typeOptions}
          value={activeCategory}
          onChange={setCategory}
          layout="pills"
          ariaLabel={t.map.filter.categoryLabel}
        />
        {hasMaybes && (
          <button
            type="button"
            className={'map-maybes' + (maybesOnly ? ' on' : '')}
            aria-pressed={maybesOnly}
            onClick={() => setMaybesOnly((v) => !v)}
          >
            {t.map.filter.maybes}
            <span className="cnt" aria-hidden="true">
              {maybesInScope}
            </span>
          </button>
        )}
        <button
          type="button"
          className="map-search-btn"
          aria-label={t.map.search.button}
          onClick={() => setSearchMode(true)}
        >
          <Icon name="search" />
        </button>
      </div>

      <div className="map-sortstrip">
        <button
          type="button"
          className={'map-scopechip' + (allDays ? ' on' : '')}
          aria-pressed={allDays}
          onClick={() => setAllDays(!allDays)}
        >
          🗓️ {t.map.allDays}
        </button>
        {/* Offline the chip is gone, not disabled: you cannot re-locate, so there is
            nothing to offer (ADR-0109 §7). */}
        {!offline && (
          <button
            type="button"
            className={
              'map-nearchip' +
              (nearActive ? ' on' : '') +
              (nearMe && locationRefused ? ' refused' : '')
            }
            aria-pressed={nearActive}
            onClick={toggleNearMe}
          >
            {ICONS.nearMe} {geo.status === 'locating' ? t.map.near.locating : t.map.near.chip}
          </button>
        )}
        <span className="map-scopehint">{allDays ? t.map.scopeAll : t.map.scopeDay}</span>
      </div>

      {/* The reason-first pre-prompt (ADR-0109 §6): stated before the OS dialog, and
          it says the location stays on the device (ADR-0006). An inline card, not an
          overlay — it explains rather than interrupts, and the list stays usable. */}
      {promptOpen && (
        <div className="map-geoprompt" role="group" aria-label={t.map.near.prompt.title}>
          <div className="gt">📍 {t.map.near.prompt.title}</div>
          <div className="gm">{t.map.near.prompt.body}</div>
          <div className="gbtns">
            <button type="button" className="map-gbtn primary" onClick={askForLocation}>
              {t.map.near.prompt.allow}
            </button>
            <button type="button" className="map-gbtn" onClick={() => setPromptOpen(false)}>
              {t.map.near.prompt.notNow}
            </button>
          </div>
        </div>
      )}

      {/* Refused or unavailable: say what the list is sorted by instead, and offer a
          retry only when asking again can actually re-prompt. */}
      {showNotice && (
        <StatusBanner tone="neutral" onDismiss={() => setNoticeDismissed(true)}>
          {geo.status === 'denied' ? t.map.near.deniedBanner : t.map.near.unavailableBanner}
          {geo.blocked ? (
            <span className="map-geohint">{t.map.near.blockedHint}</span>
          ) : (
            <button type="button" className="map-georetry" onClick={askForLocation}>
              {t.map.near.retry}
            </button>
          )}
        </StatusBanner>
      )}

      {allUsages.length === 0 ? (
        <EmptyState icon="🗺️" title={t.map.empty.title} body={t.map.empty.body} />
      ) : visible.length === 0 ? (
        <EmptyState icon={ICONS.search} title={t.map.filter.noResultsTitle} />
      ) : (
        renderList(visible)
      )}

      {searchMode && (
        <SearchOverlay
          title={t.map.search.modeTitle}
          contextLabel={trip.name}
          mode={mode}
          query={query}
          onQueryChange={setQuery}
          placeholder={t.map.search.placeholder}
          clearLabel={t.map.search.clear}
          backAria={t.map.search.backAria}
          onClose={() => {
            setSearchMode(false);
            setQuery('');
          }}
        >
          <div className="map-screen" data-mode={mode} data-offline={offline || undefined}>
            {searchResults.length > 0 ? (
              renderList(searchResults)
            ) : (
              <EmptyState icon={ICONS.search} title={t.map.search.noResultsTitle} />
            )}
          </div>
        </SearchOverlay>
      )}

      {/* Enrich a coordless Place-lite from the map (＋ מיקום): the shared picker
          sheet, opened on the row's place, updates that row in place on a pick. */}
      {enrichTarget && (
        <PlacePickerSheet
          current={enrichTarget}
          onPick={() => setEnrichTarget(null)}
          onClose={() => setEnrichTarget(null)}
        />
      )}
    </div>
  );
}

// One pinned-place row (ADR-0109 §1 anatomy). The whole row taps to VIEW the
// place on Google Maps (viewing = the row tap); the trailing נווט gives
// directions. A coordless Place-lite offers "＋ מיקום" to enrich it in place.
// Commitment (hard) shows a 🔒; a pure shelf idea shows "על המדף".
function PlaceRow({
  usage,
  place,
  ambient,
  isNextStop,
  day,
  time,
  what,
  distance,
  distanceStale,
  onEnrich,
}: {
  usage: PlaceUsage;
  place: Place;
  ambient: boolean;
  /** The single navigate-to-next row (ADR-0106 §6): amber ring + tag. */
  isNextStop?: boolean;
  /** Which day, relative (מחר / אתמול / עוד 3 ימים) — only when the list spans
   *  several, since a day-scoped list already names its day (ADR-0085). */
  day?: string;
  /** When this place is due that day, already in that event's own zone (ADR-0107). */
  time?: string;
  /** What happens here — a transition word for a booking end, else the title. */
  what?: string;
  /** Near-me: how far away, or the offline "can't measure" label. */
  distance?: string;
  /** The distance shown is the offline placeholder, not a measurement. */
  distanceStale?: boolean;
  /** Open the picker to give a coordless Place-lite real coordinates. */
  onEnrich: () => void;
}) {
  const hue = usage.pin.category ? CATEGORY_PIN_HUE[usage.pin.category] : 'leisure';
  const glyph = usage.pin.category ? iconForCategory(usage.pin.category) : '📍';
  const isHard = usage.pin.commitment === 'hard';
  const isPureIdea = usage.isMaybe && !usage.isScheduled;
  const dirUrl = mapsDirectionsUrl(place);
  const viewUrl = mapsPlaceUrl(place);
  // What the meta line says, in priority order (ADR-0109 §1): what happens here,
  // else the address, else the category. The address is the fallback rather than the
  // headline — on a scheduled row it says nothing about why the place is on the list.
  const meta =
    what ??
    place.address ??
    (usage.pin.category ? t.iconPicker.categories[usage.pin.category] : undefined);

  const rowClass = [
    'place',
    isPureIdea && 'soft',
    ambient && 'ambient',
    usage.coordless && 'nocoord',
    isNextStop && 'nextstop',
  ]
    .filter(Boolean)
    .join(' ');

  const view = viewUrl ? () => openMaps(viewUrl) : undefined;

  return (
    <div
      className={rowClass}
      role={view ? 'button' : undefined}
      tabIndex={view ? 0 : undefined}
      onClick={view}
      onKeyDown={
        view
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                view();
              }
            }
          : undefined
      }
    >
      <span
        className={`map-badge cat-${hue}` + (usage.coordless ? ' nocoord' : '')}
        aria-hidden="true"
      >
        {glyph}
      </span>
      <span className="map-main">
        <span className="map-t">
          <span className="map-name">{place.name}</span>
          {isHard && (
            <span className="map-lock" aria-hidden="true">
              🔒
            </span>
          )}
        </span>
        <span className="map-m">
          {/* When leads the meta line — amber, it IS the row's time anchor — and the
              next-stop tag no longer repeats it, only says which row is next. Day and
              time share one tag (the Index's `scheduleLabel` composition), so a
              multi-day list gains width but not another chip. The clock stays an
              LTR island inside the Hebrew day word, never the whole tag. */}
          {(day || time) && (
            <span className="map-tag time">
              {day}
              {day && time && ` ${DOT_SEPARATOR} `}
              {time && <span dir="ltr">{time}</span>}
            </span>
          )}
          {isNextStop && <span className="map-tag next">{t.map.nextStop}</span>}
          {meta && <span className="map-tag">{meta}</span>}
          {isPureIdea && <span className="map-tag mbadge">{t.map.shelfTag}</span>}
          {place.rating != null && (
            <span className="map-tag rate" dir="ltr">
              ★ {place.rating.toFixed(1)}
            </span>
          )}
        </span>
      </span>
      <span className="map-right">
        {distance && (
          // A measurement is a number-led island (like the ★ rating); the offline
          // placeholder is ordinary Hebrew prose and must not be forced LTR.
          <span
            className={'map-dist' + (distanceStale ? ' stale' : '')}
            dir={distanceStale ? undefined : 'ltr'}
          >
            {distance}
          </span>
        )}
        {dirUrl ? (
          <a
            className="map-navbtn"
            href={dirUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {ICONS.navigate} {t.actions.navigate}
          </a>
        ) : (
          <button
            type="button"
            className="map-addbtn"
            onClick={(e) => {
              e.stopPropagation();
              onEnrich();
            }}
          >
            <span aria-hidden="true">＋</span> {t.map.addLocation}
          </button>
        )}
      </span>
    </div>
  );
}
