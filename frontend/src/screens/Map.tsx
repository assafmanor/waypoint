// The Map tab (Phase 3, ADR-0109/0110) — the list-first pinned-place surface,
// re-emphasized by mode: Trip defaults to today's places, Plan to all. It reuses
// the Index filter grammar (ChoiceGrid pills + SearchOverlay + the mode-tinted
// --idx-accent) and reads the one shared derivation (lib/place-usage.ts) for both
// the chip counts and each row's category badge/commitment. No rendered map yet
// (that's Phase 6): rows deep-link out to Google Maps (ADR-0106 "deep-link, don't
// rebuild nav") — the row tap views the place, the trailing נווט gives directions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { iconForCategory, matchesAnyTerm, type EventCategory, type Place } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { useMapScope } from '../state/map-scope-state';
import { useIsOffline } from '../lib/outbox';
import {
  buildPlaceUsageIndex,
  countPlacesByCategory,
  matchesPlaceFilter,
  PLACE_CATEGORY_ALL,
  type PlaceCategoryFilter,
  type PlaceUsage,
} from '../lib/place-usage';
import { mapsDirectionsUrl, mapsPlaceUrl } from '../lib/places';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import { CATEGORY_PIN_HUE, ICONS } from '../constants';
import { ChoiceGrid, type Choice } from '../ui/primitives/ChoiceGrid';
import { PlacePickerSheet } from '../ui/primitives/PlacePicker';
import { SearchOverlay } from '../ui/primitives/SearchOverlay';
import { EmptyState, StatusBanner } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { t } from '../i18n/he';
import './map.css';

const openMaps = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export function MapView() {
  const { trip, events, bookings, maybeItems, places, activeDate, usingCachedSnapshot } = useTrip();
  const { mode } = useMode();
  const offline = useIsOffline() || usingCachedSnapshot;

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

  const byName = (a: PlaceUsage, b: PlaceUsage) =>
    (a.days[0]?.date ?? '').localeCompare(b.days[0]?.date ?? '') ||
    (placeById.get(a.placeId)?.name ?? '').localeCompare(placeById.get(b.placeId)?.name ?? '');

  const visible = dayScoped
    .filter((u) => matchesPlaceFilter(u, { category: activeCategory, maybesOnly }))
    .sort(byName);

  // Search spans every place in the trip (name + address), ignoring day scope and
  // filters — the same "search is global" rule as the Index.
  const searchResults = useMemo(() => {
    if (!query.trim()) return allUsages.slice().sort(byName);
    return allUsages
      .filter((u) => {
        const p = placeById.get(u.placeId);
        return p && matchesAnyTerm(query, [p.name, p.address]);
      })
      .sort(byName);
  }, [query, allUsages, placeById]);

  const renderRow = (usage: PlaceUsage) => {
    const place = placeById.get(usage.placeId);
    if (!place) return null;
    const prominence = allDays
      ? undefined
      : usage.days.find((d) => d.date === activeDate)?.prominence;
    return (
      <PlaceRow
        key={usage.placeId}
        usage={usage}
        place={place}
        ambient={prominence === 'ambient'}
        onEnrich={() => setEnrichTarget(place)}
      />
    );
  };

  return (
    <div className="map-screen" data-mode={mode}>
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
        <span className="map-scopehint">{allDays ? t.map.scopeAll : t.map.scopeDay}</span>
      </div>

      {allUsages.length === 0 ? (
        <EmptyState icon="🗺️" title={t.map.empty.title} body={t.map.empty.body} />
      ) : visible.length === 0 ? (
        <EmptyState icon={ICONS.search} title={t.map.filter.noResultsTitle} />
      ) : (
        <div className="map-list">{visible.map(renderRow)}</div>
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
          <div className="map-screen" data-mode={mode}>
            {searchResults.length > 0 ? (
              <div className="map-list">{searchResults.map(renderRow)}</div>
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
  onEnrich,
}: {
  usage: PlaceUsage;
  place: Place;
  ambient: boolean;
  /** Open the picker to give a coordless Place-lite real coordinates. */
  onEnrich: () => void;
}) {
  const hue = usage.pin.category ? CATEGORY_PIN_HUE[usage.pin.category] : 'leisure';
  const glyph = usage.pin.category ? iconForCategory(usage.pin.category) : '📍';
  const isHard = usage.pin.commitment === 'hard';
  const isPureIdea = usage.isMaybe && !usage.isScheduled;
  const dirUrl = mapsDirectionsUrl(place);
  const viewUrl = mapsPlaceUrl(place);
  const meta =
    place.address ?? (usage.pin.category ? t.iconPicker.categories[usage.pin.category] : undefined);

  const rowClass = [
    'place',
    isPureIdea && 'soft',
    ambient && 'ambient',
    usage.coordless && 'nocoord',
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
