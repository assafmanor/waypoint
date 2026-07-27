// The Map tab (ADR-0109/0110 for the list, ADR-0121 for the rendered map) — the
// pinned-place surface, re-emphasized by mode: Trip defaults to today's places,
// Plan to all. It reuses the Index filter grammar (ChoiceGrid pills + SearchOverlay
// + the mode-tinted --idx-accent) and reads the one shared derivation
// (lib/place-usage.ts) for the chip counts, each row's badge, AND every pin.
//
// Phase 6 put a real Google map above the list without replacing it: a map pane
// over a three-height list sheet, one live map instance per tab visit, the same
// filtered set on both halves. Three constraints run through everything below:
//
//   • **One map instantiation per visit.** Dynamic Maps bills per
//     `new google.maps.Map()`, so nothing here may re-create one — not the
//     `רשימה / מפה` toggle (it resizes a live map), not a filter, not a sheet drag,
//     not the per-second clock tick, and none at all while the map is absent
//     (offline, or no build config). See ADR-0121 §4.
//   • **This screen re-renders every second** (`useClock`). So the pin models are
//     memoized on their own CONTENT, not on `nowMs`: a tick must reconcile to a
//     no-op marker diff.
//   • **A filter never renumbers a pin.** The number is the index in
//     `comparePlacesBySchedule`'s day sequence (`buildPinOrderIndex`), computed over
//     the whole scoped set before any chip applies — so gaps like `1, 3, 4` are
//     correct and say something is filtered out.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  iconForCategory,
  matchesAnyTerm,
  type Booking,
  type EventCategory,
  type Place,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { useMapScope } from '../state/map-scope-state';
import { useIsOffline } from '../lib/outbox';
import {
  buildPlaceUsageIndex,
  comparePlacesBySchedule,
  countPlacesByCategory,
  isOnShelf,
  isPlaceSettled,
  matchesPlaceCategory,
  matchesPlaceFilter,
  placeBlock,
  placeDay,
  PLACE_CATEGORY_ALL,
  type PlaceCategoryFilter,
  type PlaceUsage,
} from '../lib/place-usage';
import {
  currentDestination,
  eventZones,
  liveToday,
  liveZoneContext,
  mapsDayRouteUrl,
  mapsDirectionsUrl,
  nextDestination,
} from '../lib/places';
import { PLACE_REF_KIND, placeRefs } from '../lib/place-refs';
import {
  buildPinOrderIndex,
  isFramedByCamera,
  PIN_TIER,
  pinSizeCss,
  placePinTier,
  placePoint,
  type PinTier,
} from '../lib/map-pins';
import { countPointsInBounds, type MapBounds } from '../lib/map-camera';
import { mapPaneAvailable, mapsConfig } from '../lib/map-config';
import { stopHeightCss } from '../lib/snap-sheet';
import { countVisible, revealRows, visibleItems, type Revealed } from '../lib/filter-reveal';
import { daySelectTarget } from '../state/nav-state';
import { useNavigate } from 'react-router-dom';
import { formatTime, relativeDayLabel } from '../lib/time';
import { eventEdgeTransition } from '../lib/transitions';
import { shortTitleText } from '../lib/route-title';
import { useClock } from '../lib/useClock';
import { formatDistance, haversineMeters } from '../lib/distance';
import { useGeolocation } from '../lib/useGeolocation';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import {
  CATEGORY_PIN_HUE,
  DOT_SEPARATOR,
  ICONS,
  MAP_ATTRIBUTION_H,
  MAP_CONTROLS_H,
  MAP_PIN,
  MAP_SHEET_ORDER,
  MAP_SHEET_STOPS,
  MAP_SHEET_STRIP_H,
  MAP_SHEET_VIEW,
  type MapSheetView,
} from '../constants';
import { ChoiceGrid, type Choice } from '../ui/primitives/ChoiceGrid';
import { PlacePickerSheet } from '../ui/primitives/PlacePicker';
import { RevealList } from '../ui/primitives/RevealList';
import { SnapSheet } from '../ui/primitives/SnapSheet';
import { MapPane, type MapPin } from '../ui/domain/MapPane';
import { PlaceResearch } from './PlaceResearch';
import { SearchOverlay } from '../ui/primitives/SearchOverlay';
import { BookingDetail } from '../ui/BookingDetail';
import { BookingSheet } from '../ui/BookingSheet';
import { EmptyState, StatusBanner } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { t } from '../i18n/he';
import './map.css';

/** One entry in a selected row's "way in" (ADR-0121 §8), already worded and
 *  already pointed somewhere — the screen resolves both, so `lib/place-refs.ts`
 *  stays clock-, zone- and i18n-free. */
interface RefEntry {
  key: string;
  kind: string;
  label: string;
  onOpen: () => void;
}

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
  const navigate = useNavigate();

  const [category, setCategory] = useState<PlaceCategoryFilter>(PLACE_CATEGORY_ALL);
  const [maybesOnly, setMaybesOnly] = useState(false);
  // `מה נשאר` (ADR-0121 §9 / ADR-0117's deferred outcome filter): ONE toggle over
  // the `settled` field, not three chips — the list already answers "where have we
  // been", and a third multi-value facet would multiply ADR-0119's coupling surface.
  const [leftOnly, setLeftOnly] = useState(false);
  // "All days" is map-local scope (ADR-0110 §4), not the global day param, and it
  // lives in a lifted context so the header DayStrip can drop its selection while
  // it's on. BOTH modes now open on the day you're on — Plan's all-days pivot is
  // reversed (ADR-0109's 2026-07-27 amendment), so before the trip starts Plan opens
  // on day 1 with `כל הימים` one tap away. Still keyed on `mode`: a mode switch is a
  // context reset, so whatever scope you left Trip in, Plan opens day-scoped too.
  const { allDays, setAllDays, focusPlaceId, clearFocus, locationOffered, markLocationOffered } =
    useMapScope();
  useEffect(() => setAllDays(false), [mode, setAllDays]);
  // The other way out of all-days: arriving on a different day (a `daySelectTarget`
  // from another surface, a deep link). Choosing a day on the strip is the INTENT
  // path and clears the scope itself (`useSelectDay`), which is what makes tapping
  // the already-active day work — here, `activeDate` never changes.
  const prevDate = useRef(activeDate);
  useEffect(() => {
    if (activeDate !== prevDate.current) {
      prevDate.current = activeDate;
      setAllDays(false);
    }
  }, [activeDate, setAllDays]);

  // The facets open IN PLACE, covering the controls row, on one tap (ADR-0122 §2):
  // their results are the pins and the rows already on screen, so the change has to be
  // visible while you make it — which is what a full-screen overlay cannot do, and why
  // ADR-0100 §3's shape is right here even though ADR-0101 superseded it for search.
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  // Plan mode's search also researches Google (Phase 5, ADR-0115 §1/§6); Trip mode's
  // stays a pure filter — discovery on the ground is a different query and a
  // different SKU, and this is the one surface people use while walking around.
  const research = mode === 'plan';
  // A coordless Place-lite the user chose to enrich from the map (＋ מיקום).
  const [enrichTarget, setEnrichTarget] = useState<Place | null>(null);
  // A booking reached through a selected row's way-in (§8) — `BookingDetail` is a
  // Modal sheet, so back closes it (ADR-0053), and editing hands off to the same
  // merged `BookingSheet` the Index uses.
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);

  // ── The rendered map (Phase 6, ADR-0121) ──────────────────────────────────
  // Config is read ONCE: it is a build var, so it cannot change while mounted, and
  // re-reading it per render would invite a re-mounted (re-billed) pane.
  const config = useMemo(() => mapsConfig(), []);
  // Absent, never disabled (§2/§11). Offline the rendered map is the one part of
  // this tab that was never available, so there is no pane, no toggle, no map
  // instance and no billed load — the tab is the list it is today. A checkout with
  // no Google setup degrades exactly the same way.
  const hasMap = mapPaneAvailable({ offline }) && config != null;
  const [sheetView, setSheetView] = useState<MapSheetView>(MAP_SHEET_VIEW.half);
  // Row ↔ pin are ONE selection (§8). Not `.nextstop`, whose amber means "the stop
  // you are heading to" — selecting a row must not claim that.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A tapped ghost: its row is not in the sheet (the sheet is scoped), so the tap is
  // the only way to learn what it is — it surfaces that one row, named with its day.
  const [ghostId, setGhostId] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<MapBounds | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── "Near me now" (Phase 4a, ADR-0109 §6-7) ───────────────────────────────
  // Strictly additive: the tab has already rendered everything above without any
  // location, and nothing below turns a refusal into a dead end. `nearMe` is the
  // user's intent; `located` is whether we can actually honour it right now.
  const geo = useGeolocation();
  const [nearMe, setNearMe] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  // `located` is a FACT — we hold a usable fix, so distances and the me-dot follow.
  // `sortByDistance` is an INTENT, and only the chip states it. Splitting them is
  // the fix for a regression the session-134 on-open offer introduced: near-me used
  // to be reachable only by tapping the chip, where re-ordering the list was the
  // whole point of tapping, so one flag could honestly mean both. Once the tab
  // started asking for a fix by itself, that same flag silently re-sorted the day
  // out of schedule order the moment coordinates landed — an order changed by a
  // permission state rather than by anything anyone asked for (ADR-0109 amendment).
  const located = nearMe && !offline && geo.status === 'granted' && !!geo.coords;
  const [sortByDistance, setSortByDistance] = useState(false);
  const distanceOrder = sortByDistance && located;
  // Offline you cannot re-locate, so a distance would be a stale claim: the chip
  // goes away and the rows that were showing numbers say so instead.
  const staleDistances = nearMe && offline;
  const locationRefused = geo.status === 'denied' || geo.status === 'unavailable';
  const showNotice = nearMe && !offline && locationRefused && !noticeDismissed;

  // Opening the tab offers to locate you (ADR-0109 session-134, amending §6's "asked
  // only on a chip tap"): on a map, "what's near me now" is the question you came
  // with, so making the intent implicit is what the tab is for. What §6 was actually
  // protecting is kept — **a cold OS dialog never appears**:
  //   • standing permission → ask the device straight away, which shows NO dialog at
  //     all (the browser already has consent) and simply lights the me dot up;
  //   • a prompt would appear, or we cannot tell (Safari has no Permissions API) →
  //     our own reason-first card comes up, which states the on-device promise
  //     (ADR-0006) before anything touches the device;
  //   • already refused → nothing. A refusal is an answer, not an invitation.
  // Once per session (`locationOffered`), so "לא עכשיו" means not-this-session rather
  // than a card on every visit to the tab — the nag §6 exists to prevent.
  //
  // The card is canvas furniture now (ADR-0122 §6), which is why raising it can lower
  // the sheet: a question about a map you cannot see lowers the sheet enough to see it,
  // the identical rule and reason as a row tap at full (ADR-0121 §8).
  const openPrompt = useCallback(() => {
    setPromptOpen(true);
    setSheetView((view) => (view === MAP_SHEET_VIEW.full ? MAP_SHEET_VIEW.half : view));
  }, []);
  useEffect(() => {
    if (locationOffered || offline || nearMe) return;
    // `unknown` means the Permissions API query is still in flight — wait for it,
    // rather than showing a card we may not need. `unsupported` is the settled
    // "nothing better is coming" answer, handled below.
    if (geo.permission === 'unknown') return;
    if (geo.permission === 'denied') {
      markLocationOffered();
      return;
    }
    if (geo.permission === 'granted') {
      markLocationOffered();
      setNearMe(true);
      geo.request();
      return;
    }
    markLocationOffered();
    openPrompt();
  }, [
    locationOffered,
    offline,
    nearMe,
    geo.permission,
    markLocationOffered,
    geo.request,
    openPrompt,
  ]);

  const askForLocation = () => {
    setPromptOpen(false);
    setNearMe(true);
    setNoticeDismissed(false);
    geo.request();
  };
  // The chip's job is now exactly one thing: **order the list by distance**. Showing
  // distances and the me-dot no longer needs it — those follow from holding a fix,
  // which the tab may have obtained on open by itself. So this states the intent the
  // fix cannot: nearest-first instead of the day's own sequence.
  const toggleNearMe = () => {
    if (sortByDistance) {
      setSortByDistance(false);
      return;
    }
    setSortByDistance(true);
    // Already located: the order can change immediately, no second prompt (ADR-0109
    // §6 — "a fix we already hold needs no second prompt").
    if (geo.status === 'granted' && geo.coords) return;
    // Otherwise we still need one, and the intent stays armed so the order applies
    // the moment it lands. A refusal leaves it armed but inert, which the banner
    // explains rather than the list silently staying in schedule order.
    if (geo.blocked) {
      setNearMe(true);
      setNoticeDismissed(false);
      return;
    }
    openPrompt();
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
  // The predicate is named because the list no longer filters on it — it reveals
  // on it, like every other control (ADR-0120 session-130) — while the chip
  // counts below still read the scoped set.
  const inDayScope = (u: PlaceUsage) => allDays || u.days.some((d) => d.date === activeDate);
  const dayScoped = useMemo(() => allUsages.filter(inDayScope), [allUsages, allDays, activeDate]);
  const scopedDate = allDays ? undefined : activeDate;

  // ADR-0119's coupling rule, now on THREE axes: each facet's count is what the
  // OTHER facets leave visible, so no chip ever claims rows the list won't show.
  // Getting this wrong is not cosmetic — it is the exact defect ADR-0119 was
  // written to fix, and drawing the mockup reproduced it within minutes of adding
  // the third axis. Each line below reads "narrowed by everything but me".
  const shelfOk = (u: PlaceUsage) => !maybesOnly || isOnShelf(u);
  const leftOk = (u: PlaceUsage) => !leftOnly || !isPlaceSettled(u, scopedDate);
  const countScope = useMemo(
    () => dayScoped.filter((u) => shelfOk(u) && leftOk(u)),
    [dayScoped, maybesOnly, leftOnly, scopedDate],
  );
  const categoryCounts = useMemo(() => countPlacesByCategory(countScope), [countScope]);
  const hasMaybes = allUsages.some(isOnShelf);
  // The chip appears only when the trip has something settled — the same derived-
  // affordance rule the `אולי` chip follows (ADR-0050), which also makes it a no-op
  // on a trip that hasn't started without needing a mode gate.
  const hasSettled = allUsages.some((u) => u.days.some((d) => d.settled));
  // Fall back to "all" if the picked type emptied out for the current day scope
  // (matches the Index), without mutating the stored selection.
  const activeCategory =
    category !== PLACE_CATEGORY_ALL && (categoryCounts[category as EventCategory] ?? 0) === 0
      ? PLACE_CATEGORY_ALL
      : category;
  const typeOk = (u: PlaceUsage) => matchesPlaceCategory(u, activeCategory);
  const maybesInScope = dayScoped.filter((u) => typeOk(u) && leftOk(u) && isOnShelf(u)).length;
  // Its own count is the number of surviving LIST ROWS given the picked type and
  // `אולי` state — including a coordless row, which has no pin. That is why it and
  // the canvas's `באזור` readout are worded differently: two different questions.
  const leftInScope = dayScoped.filter(
    (u) => typeOk(u) && shelfOk(u) && !isPlaceSettled(u, scopedDate),
  ).length;

  const typeOptions: Choice<PlaceCategoryFilter>[] = [
    { value: PLACE_CATEGORY_ALL, icon: '', label: t.map.filter.all, count: countScope.length },
    ...EVENT_CATEGORY_OPTIONS.filter((o) => categoryCounts[o.value] > 0).map((o) => ({
      value: o.value,
      icon: o.icon,
      label: o.label,
      count: categoryCounts[o.value],
    })),
  ];

  // Two blocks, and the split comes first (ADR-0109 §1 + session-110 amendments):
  // what's next and coming up leads — whatever day it falls on — then what's behind
  // you, newest first. Within each, the day view's own start-then-sortOrder vocabulary,
  // so the two surfaces can't disagree about a day. In BOTH modes: a list that opens
  // on last Tuesday is wrong while you're planning too.
  const today = liveToday(nowMs, zoneEvidence);
  const nameOf = (u: PlaceUsage) => placeById.get(u.placeId)?.name ?? '';
  const orderCtx = { nameOf, onDate: scopedDate, nowMs, today };
  const bySchedule = (a: PlaceUsage, b: PlaceUsage) => comparePlacesBySchedule(a, b, orderCtx);
  // Which block each row is in — the list labels where each one starts rather than
  // reordering silently as the clock passes each stop. Read from the same derivation
  // that ORDERS them, so a header can't claim a row the comparator put elsewhere.
  const blockOf = (u: PlaceUsage) => placeBlock(u, orderCtx);

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
  const listOrder = distanceOrder ? byDistance : bySchedule;

  const placeFilter = {
    category: activeCategory,
    maybesOnly,
    unsettledOnly: leftOnly,
    onDate: scopedDate,
  };

  // Every control that changes this list is animated (ADR-0120 session-130), so
  // the row set is the whole trip and each control is a predicate over it: the
  // type chips, the `אולי` toggle, `מה נשאר`, AND the day scope (`כל הימים`, and
  // the strip's day itself) — a row leaving the scope collapses in place instead of
  // blinking out, and one arriving reveals with the same stagger. Re-orders
  // (near-me) are the other half, animated by `RevealList`'s move pass.
  const listRows = revealRows(
    [...allUsages].sort(listOrder),
    (u) => inDayScope(u) && matchesPlaceFilter(u, placeFilter),
  ).rows;
  const listCount = countVisible(listRows);

  // Search spans every place in the trip (name + address), ignoring day scope and
  // filters — the same "search is global" rule as the Index. It reveals through
  // the same primitive, so typing here animates exactly like the Index's search.
  const searchRows = useMemo(
    () =>
      revealRows([...allUsages].sort(listOrder), (u) => {
        if (!query.trim()) return true;
        const p = placeById.get(u.placeId);
        return !!p && matchesAnyTerm(query, [p.name, p.address]);
      }).rows,
    [query, allUsages, placeById, distanceOrder, distances],
  );
  const searchCount = countVisible(searchRows);

  // navigate-to-next (ADR-0106 §6): not a re-sort or a second control, just the one
  // time-anchor cue the map's colour budget allows (ADR-0109 §6) — an amber tag on
  // one row, and the SAME cue as an outline on one pin (ADR-0121 §6). Only in Trip
  // mode: a live "next" says nothing while you're planning.
  const nextStopId = useMemo(() => {
    if (mode !== 'trip') return undefined;
    return nextDestination(events, bookings, places, nowMs)?.place.id;
  }, [mode, events, bookings, places, nowMs]);

  // Where you ARE — the second time-anchor, and the one the tab was missing. Read
  // off `currentDestination`, which asks `deriveNow`: the board's own resolver, so
  // the two surfaces cannot call the same lunch `עכשיו` and `מה שלפנינו` at once.
  // Trip mode only, for the same reason `nextStopId` is: a live "now" says nothing
  // while you're planning. The two are mutually exclusive per place — `eventPhase`
  // is `now` or `upcoming`, never both — so no row and no pin ever carries both cues.
  const nowStopId = useMemo(() => {
    if (mode !== 'trip') return undefined;
    return currentDestination(events, bookings, places, nowMs)?.place.id;
  }, [mode, events, bookings, places, nowMs]);

  // ── The pins (ADR-0121 §6) ────────────────────────────────────────────────
  // The number is the index in the scoped day sequence, computed over the whole
  // scoped set with NO clock — so neither a filter, nor near-me, nor the ticking
  // clock can renumber a pin, and this memo is stable across a tick.
  const orderIndex = useMemo(
    () => buildPinOrderIndex(dayScoped, { nameOf, onDate: scopedDate }),
    [dayScoped, scopedDate, placeById],
  );

  const pinTier = (usage: PlaceUsage): PinTier =>
    placePinTier(usage, { onDate: scopedDate, nowMs, today });

  // Built every render (it is cheap), then memoized on its own CONTENT below: the
  // screen re-renders every second and a fresh array identity would re-diff every
  // marker once a second (§6's "markers survive the per-second re-render").
  const pinsNow: MapPin[] = [];
  if (hasMap) {
    for (const usage of allUsages) {
      const place = placeById.get(usage.placeId);
      const point = place && placePoint(place);
      // Only coord-bearing places pin. A coordless Place-lite stays a list row with
      // its ＋ מיקום action — which is also why the sheet always peeks.
      if (!place || !point) continue;
      // The filter applies to ghosts too, so the canvas answers the question that
      // was actually asked: `מה נשאר` must not leave Tuesday's visited café sitting
      // there (§9), and a type chip means the same thing on both halves.
      if (!matchesPlaceFilter(usage, placeFilter)) continue;
      const tier = pinTier(usage);
      pinsNow.push({
        placeId: usage.placeId,
        lat: point.lat,
        lng: point.lng,
        hue: usage.pin.category ? CATEGORY_PIN_HUE[usage.pin.category] : 'leisure',
        // A ghost has no fill for a glyph to sit on, so it carries none.
        glyph:
          tier === PIN_TIER.ghost
            ? ''
            : usage.pin.category
              ? iconForCategory(usage.pin.category)
              : '📍',
        tier,
        order: orderIndex.get(usage.placeId),
        nextStop: nextStopId === usage.placeId && tier !== PIN_TIER.ghost,
        nowStop: nowStopId === usage.placeId && tier !== PIN_TIER.ghost,
        selected: selectedId === usage.placeId,
        label: place.name,
      });
    }
  }
  const pinsKey = pinsNow
    .map((p) =>
      [
        p.placeId,
        p.lat,
        p.lng,
        p.hue,
        p.glyph,
        p.tier,
        p.order,
        p.nextStop,
        p.nowStop,
        p.selected,
      ].join('|'),
    )
    .join(';');
  // The content key IS the dependency: keying on `pinsNow` itself would hand the
  // pane a new array every second and break the no-op-diff-per-tick rule above.
  // Equal content means an interchangeable array, so returning the older one is
  // sound — the same trick `RevealList` uses to decide "the list changed".
  const pins = useMemo(() => pinsNow, [pinsKey]);

  // The camera answers CONTROLS, not content (§7): re-framing on every snapshot
  // change would move the map under someone who is reading it, and a manual pan
  // must win until the next scope change.
  const cameraSignal = [
    allDays ? 'all' : activeDate,
    activeCategory,
    maybesOnly,
    leftOnly,
    located,
    sortByDistance,
  ].join('|');

  // The day's stops in order — what the connector draws and what the free
  // whole-day deep-link carries (§10). Plan mode + day scope only: with the order
  // on the pins, the line's one remaining job is revealing the day's SHAPE, which
  // is a planning question; in Trip mode you are living the day and need "where is
  // next", so its canvas stays quieter.
  const dayShapeVisible = !allDays && mode === 'plan';
  const orderedStops = useMemo(
    () =>
      pins
        .filter((pin) => pin.order != null && pin.tier !== PIN_TIER.ghost)
        .sort((a, b) => a.order! - b.order!)
        .map(({ lat, lng }) => ({ lat, lng })),
    [pins],
  );
  const dayRouteUrl = dayShapeVisible ? mapsDayRouteUrl(orderedStops) : null;

  const areaCount = useMemo(
    () => (viewBounds ? countPointsInBounds(pins, viewBounds) : null),
    [pins, viewBounds],
  );

  // A map must be constructed with SOME camera; the first fit replaces it. It prefers
  // one of the DAY's own pins over a ghost, so even the frame before the fit lands
  // somewhere the day contains rather than on another week's city. Memoized for the
  // same reason every other prop below is: a fresh object each render would break
  // `MapPane`'s memo and undo the whole no-op-diff-per-tick arrangement.
  const defaultCentre = useMemo(() => {
    const anchor = pins.find(isFramedByCamera) ?? pins[0];
    return anchor ? { lat: anchor.lat, lng: anchor.lng } : undefined;
  }, [pins]);
  const me = located && geo.coords ? geo.coords : undefined;

  // ── Selection (ADR-0121 §8) ───────────────────────────────────────────────
  // The verb is SELECT; focusing is what selection does when the place has
  // coordinates. That distinction is load-bearing: a coordless row is still
  // REFERENCED, so it must still select — under "tap = focus" it would have had to
  // be untappable, stranding the row whose place data is weakest.
  // ONE RULE covers both directions: **a tap never takes away the surface it was made
  // on** (ADR-0122 §7, which revises the pin-tap raise session 136 shipped).
  const select = (placeId: string, opts: { fromRow?: boolean } = {}) => {
    setSelectedId(placeId);
    if (opts.fromRow) {
      // A row tap normalises the sheet to `half`: from `full` because the map it
      // focuses is invisible there (ADR-0121 §8), and from the map extreme because a
      // row you tapped in a list belongs in its list. A coordless row has no map to
      // reveal, so it shrinks nothing.
      const focusable = hasMap && placePoint(placeById.get(placeId) ?? {}) != null;
      if (focusable && sheetView !== MAP_SHEET_VIEW.half) setSheetView(MAP_SHEET_VIEW.half);
      return;
    }
    // From a pin: NOTHING MOVES. The pane's box does not change, so the camera does not
    // shift, no re-fit fires and the map keeps every pixel — which is the "do not
    // interrupt the interactive map" requirement, met more completely than the peek row
    // met it. At the map extreme the tapped place surfaces as a card ON THE CANVAS
    // (`placeCard` below); the raise is retired with the 116px viewport that was its
    // only justification. What survives is the scroll: where the list IS on screen, the
    // selected row is centred, since `nearest` would leave a row that is already barely
    // visible exactly where it was.
    if (sheetView === MAP_SHEET_VIEW.map) return;
    requestAnimationFrame(() => {
      sheetRef.current
        ?.querySelector(`[data-place="${placeId}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
  };

  // Tapping the canvas background clears the selection — the map idiom, and the place
  // card's own dismissal. Nothing registers with the back stack: it is not an overlay,
  // for the same reasons the sheet is not (ADR-0121 §5, ADR-0103). Stable identity,
  // like every other `MapPane` handler (§4).
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setGhostId(null);
  }, []);

  // A pin tap, behind a stable identity. `MapPane` is memoized, so a handler
  // re-created every render would break the memo and re-diff every marker once a
  // second — which is exactly what §4/§6 forbid. The latest-ref keeps the callback
  // stable while its body still sees this render's state.
  const onPinTap = useRef<(placeId: string) => void>(() => {});
  onPinTap.current = (placeId: string) => {
    const usage = usageIndex.get(placeId);
    // A ghost's row is not in the sheet, so the tap surfaces that one row instead.
    setGhostId(usage && pinTier(usage) === PIN_TIER.ghost ? placeId : null);
    select(placeId);
  };
  const selectPin = useCallback((placeId: string) => onPinTap.current(placeId), []);

  // `מפה` on an EventCard / BookingDetail routes here focused on a place (§8).
  // Consumed once, and it widens to all-days when the place is not in the day it
  // landed on — otherwise the action would point at something the scope hides.
  useEffect(() => {
    if (!focusPlaceId) return;
    const usage = usageIndex.get(focusPlaceId);
    if (usage && !usage.days.some((d) => d.date === activeDate)) setAllDays(true);
    setSelectedId(focusPlaceId);
    clearFocus();
  }, [focusPlaceId, usageIndex, activeDate, setAllDays, clearFocus]);

  // ── The row's meta line: `<time> · <what happens here>` (ADR-0109 §1) ──────
  // It replaces the address, which said nothing about why the place is on the list
  // (the shipped row read "Dimitras, Nicosia, Lefkosia 2058" — true and useless).
  // The time renders in the EVENT's own zone (ADR-0107), and each end of a booking
  // gets its own: a departure in its origin, an arrival in its destination.
  const zoneCtx = useMemo(() => liveZoneContext(nowMs, zoneEvidence), [nowMs, zoneEvidence]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const dayMeta = (
    usage: PlaceUsage,
    opts: { forceDay?: boolean } = {},
  ): { day?: string; time?: string; what?: string; pencilled?: boolean } => {
    const usageDay = placeDay(usage, opts.forceDay ? undefined : scopedDate);
    // A strictly-middle stay night has no moment and nothing happens there — saying
    // the hotel's own name back on the hotel's row would be pure repetition.
    if (!usageDay || usageDay.prominence === 'ambient') return {};
    // Which day only matters when the list spans several: day-scoped, the strip and
    // the scope hint already name it, so `היום ·` on every row would be pure noise.
    // A surfaced ghost row is the exception — naming its day is the whole point.
    const day = allDays || opts.forceDay ? relativeDayLabel(usageDay.date, today) : undefined;
    const event = usageDay.eventId ? eventById.get(usageDay.eventId) : undefined;
    // No event owns this day, so the day came from an idea's pencilled-in target
    // (ADR-0116 §1). It's named, not claimed: amber is time & commitment (ADR-0028)
    // and a pencil mark is neither, so the row states the day in a neutral tag.
    if (!event) return { day, pencilled: day != null };
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
    if (!located) return undefined;
    const meters = distances.get(usage.placeId);
    return meters == null ? undefined : formatDistance(meters);
  };

  // The way in to the entity (§8), revealed by SELECTION rather than sitting on
  // every row: the row is already badge · name · meta · distance · נווט, and only
  // one row is selected at a time. Each entry is labelled in the reference's own
  // words — a control that names its destination is worth more than a generic
  // "details", and that is what earns it a row.
  const refEntriesFor = (usage: PlaceUsage): RefEntry[] =>
    placeRefs(usage.placeId, { events, bookings, maybeItems }, { onDate: scopedDate }).flatMap(
      (ref): RefEntry[] => {
        const event = ref.eventId ? eventById.get(ref.eventId) : undefined;
        const booking = ref.bookingId ? bookings.find((b) => b.id === ref.bookingId) : undefined;
        const goToDay = (date: string) => {
          const target = daySelectTarget(date, today, 'days');
          navigate(target.to, { replace: target.replace });
        };
        if (ref.kind === PLACE_REF_KIND.idea) {
          // The shelf, which both day surfaces render (Trip's day view and Plan's
          // builder), so this needs no mode switch.
          return [
            {
              key: ref.key,
              kind: t.map.refs.idea,
              label: [t.map.shelfTag, ref.date ? relativeDayLabel(ref.date, today) : t.map.noDay]
                .filter(Boolean)
                .join(` ${DOT_SEPARATOR} `),
              onOpen: () => goToDay(ref.date ?? today),
            },
          ];
        }
        const title = event ? shortTitleText(event.title) : (booking?.title ?? '');
        const edgeWord = event && ref.edge ? eventEdgeTransition(event, ref.edge) : undefined;
        const label = [title, edgeWord].filter(Boolean).join(` ${DOT_SEPARATOR} `);
        // A booking-linked reference is TWO destinations, not one: the booking holds
        // the code, the notes and the documents; the event holds when it happens and
        // what surrounds it. Returning early on the booking made the event branch
        // unreachable for exactly the references most worth reaching — §8 promised
        // one entry per in-scope reference, and a linked pair is two ways in, not a
        // choice the screen gets to make. The booking leads: it is what a traveller
        // standing at the place wants first.
        const entries: RefEntry[] = [];
        if (booking) {
          entries.push({
            key: `${ref.key}:${PLACE_REF_KIND.booking}`,
            kind: t.map.refs.booking,
            label,
            onOpen: () => setDetailBooking(booking),
          });
        }
        if (event) {
          entries.push({
            key: `${ref.key}:${PLACE_REF_KIND.event}`,
            kind: t.map.refs.event,
            label,
            onOpen: () => goToDay(ref.date ?? event.date),
          });
        }
        return entries;
      },
    );

  const renderRow =
    (opts: { onSelect?: (placeId: string) => void; forceDay?: boolean }) => (usage: PlaceUsage) => {
      const place = placeById.get(usage.placeId);
      if (!place) return null;
      const prominence = allDays
        ? undefined
        : usage.days.find((d) => d.date === activeDate)?.prominence;
      const { day, time, what, pencilled } = dayMeta(usage, { forceDay: opts.forceDay });
      // What a human said happened here (ADR-0117 §1) — read off the same day the
      // meta line describes. A strictly-middle stay night reports nothing: nothing
      // happens there to have an outcome about.
      const usageDay = placeDay(usage, opts.forceDay ? undefined : scopedDate);
      const outcome = usageDay?.prominence === 'ambient' ? undefined : usageDay?.outcome;
      const selected = selectedId === usage.placeId;
      return (
        <PlaceRow
          key={usage.placeId}
          usage={usage}
          place={place}
          order={orderIndex.get(usage.placeId)}
          ambient={prominence === 'ambient'}
          outcome={outcome}
          isNextStop={nextStopId === usage.placeId}
          isNow={nowStopId === usage.placeId}
          day={day}
          time={time}
          what={what}
          pencilled={pencilled}
          distance={distanceLabel(usage)}
          distanceStale={staleDistances}
          selected={selected}
          onSelect={opts.onSelect && (() => opts.onSelect!(usage.placeId))}
          refs={selected ? refEntriesFor(usage) : undefined}
          onEnrich={() => setEnrichTarget(place)}
        />
      );
    };

  // The list and its group headers. One shared renderer so the search overlay's list
  // gets the same treatment. Near-me labels the whole list; in schedule order each
  // block is labelled where it starts, so "why is this down here" is answered on
  // screen — and no block sits under a header that means something else, which is
  // what made an undated idea read as "behind you" (ADR-0109 session-127).
  // Headers describe what's ON SCREEN, so they're derived from the visible rows
  // only and attach to the first visible row of each block — a filtered-out row
  // must never carry (or strand) a header while it collapses.
  const renderList = (rows: Revealed<PlaceUsage>[], onSelect: (placeId: string) => void) => {
    const shown = visibleItems(rows);
    // Near-me re-sorts by distance, so the schedule blocks don't describe the list.
    const blocks = distanceOrder ? [] : shown.map(blockOf);
    // A single-block list needs no header at all: labelling the only thing on screen
    // is the chrome ADR-0117 §3 refused for the ahead header.
    const labelled = new Set(blocks).size > 1;
    const headerFor = new Map<string, (typeof blocks)[number]>();
    if (labelled) {
      shown.forEach((usage, i) => {
        if (blocks[i] !== blocks[i - 1]) headerFor.set(usage.placeId, blocks[i]);
      });
    }
    return (
      <>
        {distanceOrder && shown.some((u) => !u.coordless) && (
          <div className="map-grouphead">{t.map.near.groupHeader}</div>
        )}
        <RevealList
          className="map-list"
          rows={rows}
          getKey={(usage) => usage.placeId}
          renderBefore={(usage) => {
            const block = headerFor.get(usage.placeId);
            return block && <div className="map-grouphead">{t.map.blockHeader[block]}</div>;
          }}
          renderRow={renderRow({ onSelect })}
        />
      </>
    );
  };

  // `קרוב עכשיו` re-orders the LIST and annotates its rows with distances — it is
  // neither a filter nor a scope, which is what session 138's `located`/`sortByDistance`
  // split said in code. So: scope belongs to the tab, filters belong to the split, sort
  // belongs to the list (ADR-0122 §2), and this chip lives in the sheet's own top row.
  // On the list-only path there is no sheet, so it rides in the flow row instead (§8).
  //
  // Offline it is UNMOUNTED, not faded: you cannot re-locate, so it cannot exist at all
  // (ADR-0109 §7 / ADR-0121 §11's "absent, not disabled"). At the map extreme it stays
  // mounted and CSS hides it — two different facts, two different mechanisms, and
  // neither borrows the other's (§5).
  const nearChip = !offline && (
    <button
      type="button"
      className={
        'map-nearchip' +
        (distanceOrder ? ' on' : '') +
        (nearMe && locationRefused ? ' refused' : '')
      }
      aria-pressed={distanceOrder}
      onClick={toggleNearMe}
    >
      {ICONS.nearMe} {geo.status === 'locating' ? t.map.near.locating : t.map.near.chip}
    </button>
  );

  // What the collapsed control says about itself: WHICH facets are on, and no number.
  // A filter that hides the fact that it is filtering is the defect ADR-0119 exists to
  // prevent; a count here would be a fourth number to keep coupled, and the open strip
  // already answers "how many" (ADR-0122 §2). The glyph carries the category (ADR-0038)
  // and the accessible name carries its word — an emoji is not a name.
  const activeTypeOption = typeOptions.find((o) => o.value === activeCategory);
  const facetSummary = (categoryPart?: string) =>
    [categoryPart, maybesOnly && t.map.filter.maybes, leftOnly && t.map.filter.left]
      .filter(Boolean)
      .join(` ${DOT_SEPARATOR} `);
  const facetGlyphs = facetSummary(
    activeCategory === PLACE_CATEGORY_ALL ? undefined : activeTypeOption?.icon,
  );
  const facetWords = facetSummary(
    activeCategory === PLACE_CATEGORY_ALL ? undefined : activeTypeOption?.label,
  );

  // ONE ROW, over the canvas (ADR-0122 §1) — the shipped `.map-filter-row` +
  // `.map-sortstrip` pair, decluttered to three controls at rest and lifted out of the
  // layout, so the split becomes the whole body and the map runs UNDERNEATH the chips.
  // Pins are kept out from under it by the camera (`mapFitPadding`'s top), never by
  // layout. The same component renders `position: static` above the list where there is
  // no split: one component, two positionings, never two components (§8).
  const controlsRow = (
    <div className={'map-controls' + (hasMap ? '' : ' in-flow')}>
      {facetsOpen ? (
        <>
          <div className="map-facetstrip">
            <ChoiceGrid
              options={typeOptions}
              value={activeCategory}
              onChange={setCategory}
              layout="pills"
              compact
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
            {/* The same idiom for the same shape of question — an independent toggle
                beside `אולי`, not a third multi-value facet (ADR-0121 §9). */}
            {hasSettled && (
              <button
                type="button"
                className={'map-maybes' + (leftOnly ? ' on' : '')}
                aria-pressed={leftOnly}
                onClick={() => setLeftOnly((v) => !v)}
              >
                {t.map.filter.left}
                <span className="cnt" aria-hidden="true">
                  {leftInScope}
                </span>
              </button>
            )}
          </div>
          {/* Pinned OUTSIDE the scroller, where the search button sits at rest: a close
              control you have to scroll to reach is not a close control. */}
          <button
            type="button"
            className="map-facets-close"
            aria-label={t.map.filter.close}
            onClick={() => setFacetsOpen(false)}
          >
            <Icon name="close" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={'map-scopechip' + (allDays ? ' on' : '')}
            aria-pressed={allDays}
            onClick={() => setAllDays(!allDays)}
          >
            🗓️ {t.map.allDays}
          </button>
          <button
            type="button"
            className={'map-facets' + (facetGlyphs ? ' on' : '')}
            aria-label={facetWords ? t.map.filter.activeAria(facetWords) : undefined}
            onClick={() => setFacetsOpen(true)}
          >
            {facetGlyphs || t.map.filter.open}
          </button>
          {/* The whole day as one free Google directions link — it ships with the
              connector that draws the same order, and costs nothing (§10). It is about
              the shape on the canvas, so it lives on the canvas. */}
          {dayRouteUrl && (
            <a
              className="map-dayroute"
              href={dayRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {ICONS.navigate} {t.map.dayRoute}
            </a>
          )}
          {/* The one place the sort chip cannot live in the sheet: there is no sheet. */}
          {!hasMap && nearChip}
          <button
            type="button"
            className="map-search-btn"
            aria-label={research ? t.map.search.planButton : t.map.search.button}
            onClick={() => setSearchMode(true)}
          >
            <Icon name="search" />
          </button>
        </>
      )}
    </div>
  );

  // The reason-first pre-prompt (ADR-0109 §6): stated before the OS dialog, and it
  // says the location stays on the device (ADR-0006). An inline card, not an
  // overlay — it explains rather than interrupts, and both halves stay usable. In the
  // split it is CANVAS FURNITURE (ADR-0122 §6): it asks a question about the map, and it
  // used to render in the LIST's scroll region, which at the map extreme is not on
  // screen at all.
  const geoPrompt = promptOpen && (
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
  );

  // Refused or unavailable: say what the list is sorted by instead, and offer a
  // retry only when asking again can actually re-prompt.
  const geoNotice = showNotice && (
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
  );

  // A tapped ghost, surfaced as the one row it is — reusing `.place` rather than
  // inventing an info window, and named with the day it belongs to (§6). The place card
  // below is this rule with the special case removed: **the row surfaces wherever the
  // sheet cannot show it**, and a ghost is simply the case where it is not in the list
  // either (ADR-0122 §7).
  const ghostUsage = ghostId ? usageIndex.get(ghostId) : undefined;
  const ghostRow =
    ghostUsage && !inDayScope(ghostUsage) ? (
      <div className="map-ghostrow">
        <div className="map-grouphead">{t.map.notThisDay}</div>
        {renderRow({ onSelect: (id) => select(id, { fromRow: true }), forceDay: true })(ghostUsage)}
      </div>
    ) : null;

  // THE TAPPED PLACE, HOSTED ON THE CANVAS (ADR-0122 §7) — the same `.place` row in a
  // second host, carrying its badge, name, meta, distance, `נווט` and the way-in block
  // selection reveals, so acting on a reference no longer needs the sheet to move at
  // all. One grammar, two hosts, exactly as the pin is the list badge in a second form
  // factor (ADR-0109 §3).
  //
  // It exists EXACTLY where the list cannot show the row, so it never doubles it: at the
  // map extreme the sheet shows no rows, so the card carries the selection; at `half`
  // and `full` the row is in the list and gets scrolled into view instead. Its body is
  // inert (no `onSelect`) — there is nowhere for a tap on it to go, and raising the
  // sheet from it would take away the map it is sitting on.
  const cardUsage =
    sheetView === MAP_SHEET_VIEW.map && selectedId ? usageIndex.get(selectedId) : undefined;
  const placeCard = cardUsage && (
    <div className="map-placecard">
      {renderRow({ forceDay: !inDayScope(cardUsage) })(cardUsage)}
    </div>
  );

  const listBody =
    allUsages.length === 0 ? (
      <EmptyState icon="🗺️" title={t.map.empty.title} body={t.map.empty.body} />
    ) : listCount === 0 ? (
      <EmptyState icon={ICONS.search} title={t.map.filter.noResultsTitle} />
    ) : (
      renderList(listRows, (id) => select(id, { fromRow: true }))
    );

  // Finding a place in search and tapping it should leave you looking at it, so the
  // overlay closes on the selection rather than sitting over the map it just moved.
  const selectFromSearch = (placeId: string) => {
    setSearchMode(false);
    setQuery('');
    select(placeId, { fromRow: true });
  };

  const overlays = (
    <>
      {searchMode && (
        <SearchOverlay
          title={research ? t.map.search.planModeTitle : t.map.search.modeTitle}
          contextLabel={trip.name}
          mode={mode}
          query={query}
          onQueryChange={setQuery}
          placeholder={research ? t.map.search.planPlaceholder : t.map.search.placeholder}
          clearLabel={t.map.search.clear}
          backAria={t.map.search.backAria}
          onClose={() => {
            setSearchMode(false);
            setQuery('');
          }}
        >
          <div className="map-screen" data-mode={mode} data-offline={offline || undefined}>
            {/* Plan mode: the same control also researches new places (ADR-0115 §1).
                The trip's own places stay above, under their own header, and never
                lose their filter to the paid half; an empty local result is simply
                absent here rather than a full empty state, because the research
                block below IS the answer to "it isn't in the trip". */}
            {research ? (
              <>
                {!query.trim() && <p className="map-res-hint">{t.map.search.hint}</p>}
                {searchCount > 0 && (
                  <>
                    <div className="map-grouphead">{t.map.research.tripGroup}</div>
                    {renderList(searchRows, selectFromSearch)}
                  </>
                )}
                <PlaceResearch query={query} usageIndex={usageIndex} offline={offline} />
              </>
            ) : searchCount > 0 ? (
              renderList(searchRows, selectFromSearch)
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

      {/* Reached through a selected row's way-in (§8). */}
      {detailBooking && (
        <BookingDetail
          booking={detailBooking}
          onClose={() => setDetailBooking(null)}
          onEdit={(booking) => {
            setDetailBooking(null);
            setEditBooking(booking);
          }}
        />
      )}
      {editBooking && <BookingSheet booking={editBooking} onClose={() => setEditBooking(null)} />}
    </>
  );

  // The map is absent (offline, or no build config): the tab is exactly the list it
  // has always been, in the ordinary scrolling body. Not a greyed watermarked frame
  // — that would be a third grammar for a fact this tab already states two ways
  // (ADR-0121 §11).
  if (!hasMap || !config) {
    return (
      <div className="map-screen" data-mode={mode} data-offline={offline || undefined}>
        {offline && <StatusBanner tone="offline">{t.header.offlineNow}</StatusBanner>}
        {controlsRow}
        {geoPrompt}
        {geoNotice}
        {listBody}
        {overlays}
      </div>
    );
  }

  return (
    <div
      className="map-screen is-split"
      data-mode={mode}
      data-view={sheetView}
      data-scope={allDays ? 'all' : 'day'}
      style={
        {
          // The pane is sized to the area the SNAPPED sheet leaves visible, so Google's
          // attribution stays visible and a drag costs no relayout (ADR-0121 §5).
          '--sheet-h': stopHeightCss(MAP_SHEET_STOPS[sheetView]),
          // Written from the TS constants, never measured: this screen re-renders every
          // second, so a layout read here is the anti-pattern `frontend/CLAUDE.md`
          // names. `--map-controls-h` is the same number `mapFitPadding`'s top is
          // derived from, so the row's layout and the band the camera keeps clear of
          // pins cannot drift apart (ADR-0122 §1).
          '--map-controls-h': `${MAP_CONTROLS_H}px`,
          '--snap-top-h': `${MAP_SHEET_STRIP_H}px`,
          '--map-attr-h': `${MAP_ATTRIBUTION_H}px`,
          // The pin's size, as the RULE rather than a number (ADR-0123): a `clamp()` the
          // browser resolves against the pane's own height (`container-type: size` in
          // `map-pane.css`), so the pins answer the canvas the sheet's stop leaves — and
          // they answer it in CSS, without a `MapPane` prop that changes on a gesture.
          // Same constants the camera's clearance is derived from, same reason as
          // `--map-controls-h` above.
          '--pin-base': pinSizeCss(),
          '--pin-tag-rise': MAP_PIN.TAG_RISE,
          '--pin-ghost-scale': MAP_PIN.GHOST_SCALE,
        } as CSSProperties
      }
    >
      {/* Everything below is a SIBLING inside the split — the controls row, the place
          card and the pre-prompt are absolutely positioned over the canvas, never
          wrappers around `<MapPane>`: wrapping it remounts it, and a remount is a billed
          map load (ADR-0121 §4). */}
      <div className="map-split">
        <MapPane
          config={config}
          pins={pins}
          me={me}
          connector={dayShapeVisible ? orderedStops : undefined}
          setSignal={cameraSignal}
          defaultCentre={defaultCentre}
          onSelectPin={selectPin}
          onCanvasTap={clearSelection}
          onViewChange={setViewBounds}
          areaCount={areaCount}
        />
        {placeCard}
        {geoPrompt}
        {controlsRow}
        {/* View state, not a back layer: it renders inline, the map behind it stays
            live, nothing dismisses it — so no `Modal`, no `useOverlay`, and back
            leaves the tab at any height (ADR-0103). */}
        <SnapSheet
          stops={MAP_SHEET_STOPS}
          order={MAP_SHEET_ORDER}
          view={sheetView}
          onViewChange={setSheetView}
          grabLabel={t.map.view.grab}
          stopLabels={t.map.view.stop}
          header={
            <>
              {nearChip}
              {/* The toggle is anchored at the row's trailing end and does not move when
                  the sort chip leaves at the map extreme: a control that changes position
                  between stops is the same defect §1 refuses above the split. Its fill is
                  a thumb whose position IS the stop (§5), so `half` reads as "between the
                  two extremes" rather than as a broken segmented control. */}
              <div className="map-viewtoggle" role="group" aria-label={t.map.view.toggleLabel}>
                <button
                  type="button"
                  className={sheetView === MAP_SHEET_VIEW.full ? 'on' : ''}
                  aria-pressed={sheetView === MAP_SHEET_VIEW.full}
                  onClick={() => setSheetView(MAP_SHEET_VIEW.full)}
                >
                  {t.map.view.list}
                </button>
                <button
                  type="button"
                  className={sheetView === MAP_SHEET_VIEW.map ? 'on' : ''}
                  aria-pressed={sheetView === MAP_SHEET_VIEW.map}
                  onClick={() => setSheetView(MAP_SHEET_VIEW.map)}
                >
                  {t.map.view.map}
                </button>
              </div>
            </>
          }
        >
          <div className="map-sheet-scroll" ref={sheetRef}>
            {/* The refusal notice does NOT move: it explains why the LIST is in schedule
                order, so it belongs to the list's scroll region (ADR-0122 §6). One card
                moves and one does not, and the split is exactly what each is about. */}
            {geoNotice}
            {ghostRow}
            {listBody}
          </div>
        </SnapSheet>
      </div>

      {overlays}
    </div>
  );
}

// One pinned-place row (ADR-0109 §1 anatomy). The whole row taps to SELECT the
// place — which focuses its pin on our map and never leaves the app (ADR-0121 §8);
// the trailing נווט is the one Google action it keeps (directions). A coordless
// Place-lite offers "＋ מיקום" to enrich it in place. Commitment (hard) shows a 🔒;
// a pure shelf idea shows "על המדף".
function PlaceRow({
  usage,
  place,
  order,
  ambient,
  outcome,
  isNextStop,
  isNow,
  day,
  time,
  what,
  pencilled,
  distance,
  distanceStale,
  selected,
  refs,
  onSelect,
  onEnrich,
}: {
  usage: PlaceUsage;
  place: Place;
  /** This place's position in the day's sequence — the SAME number its pin carries
   *  (`buildPinOrderIndex`), so the canvas and the list can't disagree about which
   *  stop is second. Absent for anything with no position in the schedule: a ghost,
   *  an idea, an ambient stay night (ADR-0121 §6). */
  order?: number;
  ambient: boolean;
  /** What a human said happened here (ADR-0117 §1): visited, skipped, or — absent —
   *  nobody settled it, where the row's position is the only claim. */
  outcome?: 'done' | 'skipped';
  /** The single navigate-to-next row (ADR-0106 §6): amber ring + tag. */
  isNextStop?: boolean;
  /** You are HERE, right now (`deriveNow`, the board's own resolver). Amber like
   *  `isNextStop` — both are time (ADR-0028) — and never both on one row, since
   *  `eventPhase` reads `now` or `upcoming`, never both. */
  isNow?: boolean;
  /** Which day, relative (מחר / אתמול / עוד 3 ימים) — only when the list spans
   *  several, since a day-scoped list already names its day (ADR-0085). */
  day?: string;
  /** When this place is due that day, already in that event's own zone (ADR-0107). */
  time?: string;
  /** What happens here — a transition word for a booking end, else the title. */
  what?: string;
  /** The day is an idea's pencilled-in target, not a schedule (ADR-0116 §1), so the
   *  tag stays neutral — amber is reserved for time & commitment (ADR-0028). */
  pencilled?: boolean;
  /** Near-me: how far away, or the offline "can't measure" label. */
  distance?: string;
  /** The distance shown is the offline placeholder, not a measurement. */
  distanceStale?: boolean;
  /** This row is the one selection — its pin carries the same ring (ADR-0121 §8). */
  selected?: boolean;
  /** The way in to each reference, present only while selected. */
  refs?: RefEntry[];
  /** Select this place (and focus its pin, when it has one). **Absent on the canvas
   *  place card, whose body is inert** (ADR-0122 §7): there is nowhere for a tap on it
   *  to go — it already shows everything the row shows, way-in included — and raising
   *  the sheet from it would take away the map the card is sitting on. Without it the
   *  row renders as plain content rather than a `button` that does nothing. */
  onSelect?: () => void;
  /** Open the picker to give a coordless Place-lite real coordinates. */
  onEnrich: () => void;
}) {
  const hue = usage.pin.category ? CATEGORY_PIN_HUE[usage.pin.category] : 'leisure';
  const glyph = usage.pin.category ? iconForCategory(usage.pin.category) : '📍';
  const isHard = usage.pin.commitment === 'hard';
  const isPureIdea = usage.isMaybe && !usage.isScheduled;
  const dirUrl = mapsDirectionsUrl(place);
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
    // A skipped place is quiet: still listed (it may hold a booking, and it can be
    // restored) but no longer competing with what is actually happening (ADR-0117 §4).
    outcome === 'skipped' && 'skipped',
    usage.coordless && 'nocoord',
    isNextStop && 'nextstop',
    isNow && 'nowstop',
    selected && 'selected',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rowClass}
      data-place={usage.placeId}
      {...(onSelect
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': selected,
            onClick: onSelect,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect();
              }
            },
          }
        : null)}
    >
      {/* The category badge doubles as the number's host (ADR-0121 §6): a numbered
          pin whose row says nothing about the order makes the two halves read as two
          different lists. Same corner, same stamp as `.pin-n` — one number, shown
          twice, never a second treatment. */}
      <span
        className={`map-badge cat-${hue}` + (usage.coordless ? ' nocoord' : '')}
        data-order={order}
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
            <span className={'map-tag' + (pencilled ? '' : ' time')}>
              {day}
              {day && time && ` ${DOT_SEPARATOR} `}
              {time && <span dir="auto">{time}</span>}
            </span>
          )}
          {isNow && <span className="map-tag now">{t.map.happeningNow}</span>}
          {isNextStop && <span className="map-tag next">{t.map.nextStop}</span>}
          {/* The outcome, in the app's existing words for it (the day view's own
              tags) and in the status hues --ok/--miss reserve for exactly this
              (ADR-0028) — never a new accent on the map's budget. */}
          {outcome && (
            <span className={'map-tag ' + (outcome === 'done' ? 'ok' : 'miss')}>
              {outcome === 'done' ? t.event.didThis : t.event.skipped}
            </span>
          )}
          {meta && <span className="map-tag">{meta}</span>}
          {isPureIdea && <span className="map-tag mbadge">{t.map.shelfTag}</span>}
          {place.rating != null && (
            <span className="map-tag rate" dir="auto">
              ★ {place.rating.toFixed(1)}
            </span>
          )}
        </span>
      </span>
      <span className="map-right">
        {distance && (
          // Both a measurement ("9 ק״מ") and the offline placeholder are Hebrew
          // text, so neither is forced LTR (ADR-0118) — that is what read "ק״מ 9".
          // The numeral inside the measurement is isolated by `measure`.
          <span className={'map-dist' + (distanceStale ? ' stale' : '')}>{distance}</span>
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
      {/* Full-width and ≥40px, so it is a real touch target (ADR-0017) — which is
          also why the meta line's own 11.5px tags are not the link. */}
      {refs && refs.length > 0 && (
        <span className="map-refs">
          {refs.map((ref) => (
            <button
              key={ref.key}
              type="button"
              className="map-ref"
              onClick={(e) => {
                e.stopPropagation();
                ref.onOpen();
              }}
            >
              <span className="map-ref-kind">{ref.kind}</span>
              <span className="map-ref-label">{ref.label}</span>
              <Icon name="caret" dir="left" />
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
