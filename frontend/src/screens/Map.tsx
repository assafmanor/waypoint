// The Map tab (ADR-0109/0110 for the list, ADR-0121 for the rendered map) — the
// pinned-place surface, re-emphasized by mode: Trip defaults to today's places,
// Plan to all. It reuses the Index filter grammar (ChoiceGrid pills + the shared
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
  type PlaceResult,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { useMapScope, usePlaceErrandReturn, type PlaceErrand } from '../state/map-scope-state';
import { useIsOffline } from '../lib/outbox';
import {
  buildPlaceUsageIndex,
  comparePlacesBySchedule,
  countPlacesByCategory,
  isOnShelf,
  isPlaceLeft,
  matchesPlaceCategory,
  matchesPlaceFilter,
  placeBlock,
  placeMetaDay,
  PLACE_BLOCK,
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
  isAsidePin,
  isFramedByCamera,
  PIN_TIER,
  pinSizeCss,
  placePinTier,
  placePoint,
  type PinTier,
} from '../lib/map-pins';
import { countPointsInBounds, pointInBounds, type LatLng, type MapBounds } from '../lib/map-camera';
import { mapPaneAvailable, mapsConfig } from '../lib/map-config';
import { usePlaceSearch } from '../lib/usePlaceSearch';
import { useVerbs } from '../state/verbs';
import { stopHeightCss } from '../lib/snap-sheet';
import { countVisible, revealRows, visibleItems, type Revealed } from '../lib/filter-reveal';
import { daySelectTarget, useBackLayer } from '../state/nav-state';
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
  MAP_ROW_DISCLOSURE,
  MAP_SHEET_ORDER,
  MAP_SHEET_STOPS,
  MAP_SHEET_STRIP_H,
  MAP_SHEET_VIEW,
  PLACE_CORPUS,
  type MapRowDisclosure,
  type MapSheetView,
} from '../constants';
import { ChoiceGrid, type Choice } from '../ui/primitives/ChoiceGrid';
import { AddLocationButton, PlacePickerSheet } from '../ui/primitives/PlacePicker';
import { RevealList } from '../ui/primitives/RevealList';
import { SnapSheet } from '../ui/primitives/SnapSheet';
import { MapPane, type MapPin, type MapResultPin } from '../ui/domain/MapPane';
import { PlaceResearch, ResultRow } from './PlaceResearch';
import { BookingDetail } from '../ui/BookingDetail';
import { BookingSheet, type BookingSheetDraft } from '../ui/BookingSheet';
import { PlaceBadge } from '../ui/domain/PlaceBadge';
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
    events,
    bookings,
    maybeItems,
    places,
    activeDate,
    zoneEvidence,
    usingCachedSnapshot,
    indexVerbs,
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
  const {
    allDays,
    setAllDays,
    focusPlaceId,
    clearFocus,
    locationOffered,
    markLocationOffered,
    setQueryOpen,
    errand,
    errandResult,
  } = useMapScope();
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
  // ONE disclosure with two occupants (ADR-0131 §1): the facet strip, and the query
  // field that replaced ADR-0101's full-screen overlay on this tab — which covered the
  // canvas completely, on the one tab whose question is "where is this?". Both take the
  // row in place behind the same pinned `✕`. One three-valued state rather than two
  // booleans, because two booleans have a fourth state (both open) that must not exist.
  const [disclosure, setDisclosure] = useState<MapRowDisclosure | null>(null);
  const facetsOpen = disclosure === MAP_ROW_DISCLOSURE.facets;
  const [query, setQuery] = useState('');
  // The field is OPEN, which is a weaker fact than a query being live and the one the
  // app CHROME keys off (ADR-0132 §1): the keyboard opens on focus, before a character
  // exists, so the state the surface has to survive starts here. Published through the
  // Map's lifted view state, where `allDays` already talks to the header — the shell is
  // told what layout this surface wants, never what it is doing.
  const queryFieldOpen = disclosure === MAP_ROW_DISCLOSURE.query;
  // GOOGLE'S HALF LIVES HERE NOW, not inside `PlaceResearch` (ADR-0132 §7). It moved up
  // one level for a reason the SKU forced: Text Search returns results WITH coordinates,
  // so they are pins as well as rows — and a component rendered inside the sheet cannot
  // hand anything to the canvas. `PlaceResearch` keeps the rows and becomes presentational.
  //
  // The bias is a latest-ref rather than a value, so a camera idle can never re-run a
  // BILLED search: the hook reads it when a request actually fires (ADR-0132 §7).
  const biasRef = useRef<MapBounds | null>(null);
  const research = usePlaceSearch({ corpus: PLACE_CORPUS.text, biasRef });
  const verbs = useVerbs();
  // ── THE PLACE ERRAND (ADR-0134 §1-§4) ─────────────────────────────────────────
  // A form sent us here to pick ONE place. While it is live the tab is in errand mode:
  // every row gains `בחירה`, `נווט` goes away, and `＋ אולי` is replaced rather than
  // joined — "only choosing one place and not adding more and more places".
  const pendingErrand = errand.pending;
  // Assign and return, in one act. The place is handed back through the OTHER channel and
  // the form's host re-opens itself from the draft (§2) — this screen deliberately knows
  // nothing about what an event form contains.
  //
  // TWO ASSIGNMENT PATHS, and the difference is whether the thing being assigned to
  // EXISTS yet (ADR-0134 §2):
  //
  //  • **A saved BOOKING** — an ordinary patch through `indexVerbs.updateBooking`, which
  //    this screen can do, so the return is purely navigational: no draft, no host
  //    involvement, and the write goes where every write goes. This is `BookingDetail`'s
  //    `＋ מיקום`, whose whole flow has no unsaved state to lose.
  //  • **Anything else** — a form that has not saved yet (and an event, whose place edit
  //    belongs to its own guarded form rather than to a patch from here, ADR-0011). The
  //    place is handed BACK and the form's host re-opens it from the draft. That is the
  //    expensive path, and it is paid only where it is needed.
  const finishErrand = useCallback(
    (placeId: string) => {
      const taken = errand.take();
      if (!taken) return;
      const { target } = taken;
      if (target.kind === 'booking' && target.id) {
        void indexVerbs.updateBooking(target.id, { [target.field]: placeId }).catch(() => {});
      }
      // …AND THE ANSWER GOES BACK EITHER WAY (owner, session 170: _"return to booking isn't
      // working"_). The saved-booking path used to patch and navigate, handing nothing over
      // — and `returnTo` is a URL, while the thing you were looking at is a `Modal` that no
      // URL addresses. So you landed on the bare screen behind it, with the place correctly
      // assigned to a booking you could no longer see.
      //
      // The host re-opens it, through the channel it already listens on: a result with a
      // DRAFT re-opens the form, one with only a saved `target.id` re-opens that booking's
      // detail. No second mechanism, and no route for a sheet that deliberately has none.
      errandResult.hand({ errand: taken, placeId });
      navigate(taken.returnTo, { replace: true });
    },
    [errand, errandResult, navigate, indexVerbs],
  );
  // `ביטול` and back both run the same return, so there is exactly one way out (§2).
  // Cancelling assigns nothing — but it still has to GIVE THE FORM BACK (owner, session 168:
  // _"canceling a place pin doesn't return to the event form"_). It shipped navigating to
  // `returnTo` and handing nothing over, so the host had nothing to re-open from and a
  // half-typed event died on the way out. That is the exact loss the draft exists to prevent;
  // ADR-0134 §2 only ever spelled it out for the success path.
  //
  // Handed only when there is something to RESTORE — a form's draft, or a saved booking
  // whose detail sheet was open. Both exits owe the same return (session 170): cancelling
  // out of a `＋ מיקום` used to land on the bare screen behind the booking too, which is the
  // success path's bug with nothing even assigned to show for it.
  const cancelErrand = useCallback(() => {
    const taken = errand.take();
    if (!taken) return;
    if (taken.draft || taken.target.id) errandResult.hand({ errand: taken, placeId: null });
    navigate(taken.returnTo, { replace: true });
  }, [errand, errandResult, navigate]);
  useBackLayer(() => {
    cancelErrand();
    return { remainsActive: false };
  }, pendingErrand != null);
  // ARRIVING ON AN ERRAND OPENS THE FIELD (owner, session 168: _"opening map search for
  // event/booking doesn't start on keyboard open"_). You were sent here to FIND a place, so
  // the tab opens on the one control that does that, and the field's own `autoFocus` brings
  // the keyboard with it. It spends nothing — the min-chars floor is what stands between a
  // keystroke and a paid call (ADR-0131 §8b) — and it lands on the free half first, which is
  // the fact ADR-0134 §1 reconciled the whole reversal on: the trip's own places filter from
  // the first character.
  //
  // Once per errand, keyed on the errand OBJECT rather than a boolean: closing the field is
  // a decision, and re-opening it under the user would be the nag this tab already refuses
  // elsewhere (ADR-0109 §6's `locationOffered`).
  const fieldOpenedFor = useRef<PlaceErrand | null>(null);
  useEffect(() => {
    if (!pendingErrand || fieldOpenedFor.current === pendingErrand) return;
    fieldOpenedFor.current = pendingErrand;
    setDisclosure(MAP_ROW_DISCLOSURE.query);
  }, [pendingErrand]);
  // A tapped ring. Its own state rather than `selectedId`, because a result has no
  // `placeId` — there is no row for it yet, which is the whole point of it.
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  useEffect(() => {
    setQueryOpen(queryFieldOpen);
    // Leaving the tab must give the chrome back, since the state outlives this screen.
    return () => setQueryOpen(false);
  }, [queryFieldOpen, setQueryOpen]);
  // A query is LIVE, as opposed to the field merely being open. Everything downstream
  // keys on this: the list's predicate, the pin filter, the aside promotion (§4), and
  // the two readers that ask "is this pin's row absent from the list?".
  const searching = disclosure === MAP_ROW_DISCLOSURE.query && query.trim() !== '';
  // Google's half is available in BOTH modes (§8, withdrawing ADR-0115 §6). The split
  // between the two searches is not a mode — it is whether the thing has coordinates
  // yet: a trip place already carries them (that is what pinned it), a prediction
  // carries none until the pick, so the free half goes on the canvas and the paid half
  // is rows in this sheet. There is no arm either (§8a); the floor is the cost control.
  const openDisclosure = (next: MapRowDisclosure | null) => {
    setDisclosure(next);
    if (next !== MAP_ROW_DISCLOSURE.query) setQuery('');
    // ONE extreme normalises on open, not two (owner, session 166 — _"from the map search
    // view you can't maximize the map"_): `full`, because the pane is hidden there and a
    // search whose results are pins has nothing to show you.
    //
    // `map` used to normalise as well, and closing that stop was right at the time for a
    // structural reason: the sheet shows no rows there, so a coordless match had no pin AND
    // no row, and every Google result was a row with no pin. **The second half of that died
    // when results became rings** (ADR-0132 §6) — a result IS on the canvas now — and this
    // is the decision §8 left owed, taken. A coordless result is still invisible at that
    // stop; the ring tap's card (`resultCard`) is what makes the stop honest for the rest.
    //
    // Fired on the OPEN tap, never per keystroke — a sheet that moved while you typed would
    // relayout the canvas under a typing finger (ADR-0121 §5).
    if (next === MAP_ROW_DISCLOSURE.query && sheetView === MAP_SHEET_VIEW.full) {
      setSheetView(MAP_SHEET_VIEW.half);
    }
  };
  // …and a surface that has hidden the header AND the tab bar changed "where am I", so
  // back has to undo that before it leaves the tab (ADR-0132 §5). The design said "one
  // rule in `resolveBack`"; the mechanism for exactly this already existed — a back
  // LAYER, which is what `resolveBack` consults first — so nothing there is edited and
  // nav-state learns nothing about this screen. Registered only while the field is open
  // (the screen itself never unmounts), and it hands off rather than repeating: one back
  // closes the field, the next leaves the tab.
  useBackLayer(() => {
    openDisclosure(null);
    return { remainsActive: false };
  }, queryFieldOpen);

  // The paid half only ever sees a LIVE query — the field being open is not an intent to
  // spend (ADR-0131 §8b's floor is the other half of that). Handing it '' when the query
  // is blank keeps "nothing typed → nothing reaches the paid core" a property of this
  // screen rather than of the hook's internals.
  const researchQuery = searching ? query : '';
  useEffect(() => {
    research.setQuery(researchQuery);
  }, [researchQuery, research.setQuery]);
  // Closing the field retires the search: state cleared, and (for the Autocomplete half's
  // sake, since the corpus is a parameter) any session token dropped. The ring selection
  // goes with it — it points at something that is no longer on the canvas.
  useEffect(() => {
    if (queryFieldOpen) return;
    research.reset();
    setSelectedResultId(null);
  }, [queryFieldOpen, research.reset]);
  // A coordless Place-lite the user chose to enrich from the map (＋ מיקום).
  const [enrichTarget, setEnrichTarget] = useState<Place | null>(null);
  // A booking reached through a selected row's way-in (§8) — `BookingDetail` is a
  // Modal sheet, so back closes it (ADR-0053), and editing hands off to the same
  // merged `BookingSheet` the Index uses.
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2), through the same shared hook every other
  // form host uses: without it the sheet returns closed and the rest of what was typed is
  // gone, which is the whole reason the errand carries a draft.
  const [bookingDraft, setBookingDraft] = useState<BookingSheetDraft | null>(null);
  usePlaceErrandReturn<BookingSheetDraft>('booking', (returned) => {
    // NO DRAFT means the errand came from the booking's DETAIL sheet, which has no form
    // state to restore — what it has is a sheet that was open and that no URL addresses,
    // so the return has to re-open it (session 170).
    if (!returned.draft) {
      const booking = bookings.find((b) => b.id === returned.target.id);
      if (booking) setDetailBooking(booking);
      return;
    }
    setEditBooking(bookings.find((b) => b.id === returned.target.id) ?? null);
    setBookingDraft(returned.draft);
  });

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

  // ONE RULE, three callers (ADR-0126 §7): a canvas control whose answer lives in the
  // list normalises the sheet to `half`. A row tap already did it; the area sort and a
  // locate that cannot deliver now do too. Only from the `map` stop — at `full` the
  // list is entirely on screen, so there is nothing to lift.
  const liftToList = useCallback(() => {
    setSheetView((view) => (view === MAP_SHEET_VIEW.map ? MAP_SHEET_VIEW.half : view));
  }, []);

  const askForLocation = () => {
    setPromptOpen(false);
    setNearMe(true);
    setNoticeDismissed(false);
    geo.request();
  };

  // #19: the canvas can finally ask for the location permission. `MapPane` owns the
  // camera half (it holds the map instance); this is the permission half, and it is a
  // ROUTE to the pre-prompt rather than a second place that asks — ADR-0121 §12's
  // invariant, kept by ADR-0126 §6.
  //
  // It sets `nearMe` (the FACT, and your dot) and never `sortByDistance` (the intent),
  // which is session 138's split paying off: granting through this button lights the
  // me-dot and the distance chips and leaves the list in schedule order. One flag for
  // both is exactly the regression that split was written to fix.
  const [locatePending, setLocatePending] = useState(false);
  const requestLocate = useCallback(() => {
    setNearMe(true);
    setNoticeDismissed(false);
    if (geo.status === 'granted' && geo.coords) return; // the pane already centred
    if (geo.blocked) {
      // Known before we ask, and asking again cannot re-prompt — so route straight to
      // the notice that says so, which lives in the list.
      liftToList();
      return;
    }
    setLocatePending(true);
    // Standing permission shows NO dialog, so a card in front of it would be a page we
    // make you dismiss for nothing (ADR-0109 §6's own rule, as the on-open offer above).
    if (geo.permission === 'granted') geo.request();
    else openPrompt();
  }, [geo.status, geo.coords, geo.blocked, geo.permission, geo.request, liftToList, openPrompt]);

  // §7's rule keys on the OUTCOME, not the tap. "Location is off" is three states and
  // the Permissions API sees only two of them: with location services off the browser
  // still reports `granted` and the request fails anyway (`POSITION_UNAVAILABLE`), so
  // whether locate can deliver is knowable only once it has settled. Without this, a
  // locate at the `map` stop with the radio off spins, fails, and files its explanation
  // into a list that is not on screen — the silent nothing #19 is a report about.
  useEffect(() => {
    if (!locatePending || geo.status === 'idle' || geo.status === 'locating') return;
    if (locationRefused) liftToList();
    setLocatePending(false);
  }, [locatePending, geo.status, locationRefused, liftToList]);
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
    // One list, one order (ADR-0126 §5): the two sort intents are exclusive.
    setAreaBounds(null);
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
  // The scope + the clock, together: every question the tab asks of a place ("which
  // day is this", "is it behind us", "what does its row say") is answered against the
  // same three values, so they travel as one context rather than being re-assembled
  // per call site. `today` is the trip-local date, which is what lets a whole passed
  // day count as behind you even where nothing carries a clock.
  const today = liveToday(nowMs, zoneEvidence);
  const dayCtx = { onDate: scopedDate, nowMs, today };

  // ADR-0119's coupling rule, now on THREE axes: each facet's count is what the
  // OTHER facets leave visible, so no chip ever claims rows the list won't show.
  // Getting this wrong is not cosmetic — it is the exact defect ADR-0119 was
  // written to fix, and drawing the mockup reproduced it within minutes of adding
  // the third axis. Each line below reads "narrowed by everything but me".
  const shelfOk = (u: PlaceUsage) => !maybesOnly || isOnShelf(u);
  const leftOk = (u: PlaceUsage) => !leftOnly || isPlaceLeft(u, dayCtx);
  const countScope = useMemo(
    () => dayScoped.filter((u) => shelfOk(u) && leftOk(u)),
    [dayScoped, maybesOnly, leftOnly, scopedDate, nowMs, today],
  );
  const categoryCounts = useMemo(() => countPlacesByCategory(countScope), [countScope]);
  const hasMaybes = allUsages.some(isOnShelf);
  // The chip appears only when the trip has something BEHIND it — the same derived-
  // affordance rule the `אולי` chip follows (ADR-0050), which also makes it a no-op on
  // a trip that hasn't started without needing a mode gate. It used to gate on
  // `settled`, which was the old predicate's own blind spot: on a trip where nobody
  // taps היינו the chip never appeared, though there was a day of stops behind you it
  // would have cleared (ADR-0124).
  const hasBehind = allUsages.some((u) => !isPlaceLeft(u, dayCtx));
  // A derived affordance can go away WHILE ITS FILTER IS ON — another member consumes
  // the last idea, or un-settles the last event, and the snapshot arrives over the
  // socket. The chip unmounts, the toggle stays true, and the strip then holds no
  // control that can turn it off: an empty list with the summary still saying `אולי`
  // and no way back. The type chip already has this guard (`activeCategory` falls back
  // when its count empties); these are the same rule for the two toggles.
  useEffect(() => {
    if (!hasMaybes) setMaybesOnly(false);
  }, [hasMaybes]);
  useEffect(() => {
    if (!hasBehind) setLeftOnly(false);
  }, [hasBehind]);
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
    (u) => typeOk(u) && shelfOk(u) && isPlaceLeft(u, dayCtx),
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
  const nameOf = (u: PlaceUsage) => placeById.get(u.placeId)?.name ?? '';
  const orderCtx = { nameOf, ...dayCtx };
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
  // ── The area sort (#23, ADR-0126 §5) ──────────────────────────────────────
  // A sibling of `sortByDistance`, not a new mechanism: an INTENT that re-orders,
  // and the bounds it orders by are SNAPSHOTTED at the tap and never re-read. That
  // is not an optimisation — the tap raises the sheet, which resizes the pane and
  // fires a fresh `idle`, so an order keyed on live bounds would re-shuffle the
  // instant it was created. These are the bounds of the canvas you were looking at
  // when you tapped, which is what you meant by "what's around here".
  const [areaBounds, setAreaBounds] = useState<MapBounds | null>(null);
  const areaSorted = areaBounds != null;
  const placesInArea = useMemo(() => {
    const ids = new Set<string>();
    if (!areaBounds) return ids;
    for (const place of places) {
      const point = placePoint(place);
      if (point && pointInBounds(areaBounds, point)) ids.add(place.id);
    }
    return ids;
  }, [places, areaBounds]);

  // A new day is a new list, so an area order does not carry across the scope change
  // that produced it (ADR-0126 §5). The other two exits are a second tap and the
  // near-me chip.
  useEffect(() => setAreaBounds(null), [allDays, activeDate]);

  // The area order: in-view first, each group in the day's own schedule order. It
  // ORDERS and never hides, which is the whole of ADR-0126 §5 — an area FILTER is the
  // one facet whose predicate moves without the user touching the list, so it would
  // either churn under a panning finger or freeze out of sync with the canvas.
  // ADR-0106 §4 stands: the viewport is still the only area filter.
  const byArea = (a: PlaceUsage, b: PlaceUsage) =>
    Number(placesInArea.has(b.placeId)) - Number(placesInArea.has(a.placeId)) || bySchedule(a, b);
  // One list, one order, so the two sort INTENTS are exclusive; near-me wins because
  // turning either on clears the other and this is only the tie-break for a state
  // neither reducer can produce.
  const listOrder = distanceOrder ? byDistance : areaSorted ? byArea : bySchedule;

  const placeFilter = { category: activeCategory, maybesOnly, leftOnly, ...dayCtx };

  // Whether any FACET is narrowing the list — the day scope is not one of them, and
  // keeping them apart is the whole point of the empty state below: an empty day and
  // an over-narrow filter are two different situations with two different ways out.
  const facetsActive = activeCategory !== PLACE_CATEGORY_ALL || maybesOnly || leftOnly;
  const clearFacets = () => {
    setCategory(PLACE_CATEGORY_ALL);
    setMaybesOnly(false);
    setLeftOnly(false);
  };

  // Every control that changes this list is animated (ADR-0120 session-130), so
  // the row set is the whole trip and each control is a predicate over it: the
  // type chips, the `אולי` toggle, `מה נשאר`, AND the day scope (`כל הימים`, and
  // the strip's day itself) — a row leaving the scope collapses in place instead of
  // blinking out, and one arriving reveals with the same stagger. Re-orders
  // (near-me) are the other half, animated by `RevealList`'s move pass.
  // Search spans every place in the trip (name + address), ignoring day scope AND the
  // facets — the same "search is global" rule as the Index (ADR-0102). Which is also why
  // the scope chip is not in the row while the field is open: it is precisely the control
  // with nothing to say (§1).
  const matchesQuery = (u: PlaceUsage) => {
    const p = placeById.get(u.placeId);
    return !!p && matchesAnyTerm(query, [p.name, p.address]);
  };

  // ── WHICH OF OUR OWN PLACES GOOGLE'S RESULTS POINT AT ─────────────────────────
  // `placeId` → the Google id of the result that resolved to it. Owner report, session 167:
  // _"you can't see results that are already on the trip on the map"_.
  //
  // **THE TWO HALVES OF THIS SEARCH DO NOT MATCH THE SAME WAY, and that is the whole
  // reason this map exists.** Ours is a normalised substring over name + address
  // (`matchesAnyTerm`, deliberately dumb and free); Google's handles transliteration,
  // aliases and misspellings. So `מון` finds `Moon Sushi Bar Pinsker` in Google's half and
  // cannot find it in ours — and the place we ALREADY OWN was filtered off the canvas by
  // our own predicate, while its result row sat in the sheet saying `כבר בטיול` and
  // pointing at nothing. The canvas even said `אין מקומות באזור` over the exact spot.
  //
  // ADR-0132 §6 withholds the ring from a result we own "because it already has a pin".
  // That premise holds only while both halves agree about what matches, which they never
  // did. So: **a result we own counts as a match**, and it is drawn as OUR pin rather than
  // as a ring — the ring's silhouette means "not yours yet", and this one is yours. One
  // object per place either way, which is what §6 was actually protecting.
  const ownedResults = new Map<string, string>();
  if (searching) {
    for (const result of research.predictions) {
      const owned = research.alreadyInTrip(result);
      if (owned) ownedResults.set(owned.id, result.googlePlaceId);
    }
  }

  // ONE list, whose PREDICATE switches (ADR-0131 §1/§7). It used to be two arrays — the
  // day's list, and a second one the overlay rendered — which is what let the query live
  // on a surface that hid the canvas. With the query as a control on this row it is the
  // same list narrowing, so a row that stops matching collapses in place through the
  // shared reveal exactly as a chip's would (ADR-0120), and there is one empty state,
  // one count and one renderer instead of two.
  //
  // Every control that changes this list is animated (ADR-0120 session-130): the type
  // chips, the `אולי` toggle, `מה נשאר`, the day scope (`כל הימים`, and the strip's day
  // itself) and now the query. Re-orders (near-me, the area sort) are the other half,
  // animated by `RevealList`'s move pass.
  const listRows = revealRows([...allUsages].sort(listOrder), (u) =>
    searching
      ? // …or Google matched it for us, exactly as the pins read it (session 167). The
        // canvas half of this shipped and the LIST half did not, which is the owner's
        // second report on one defect: the pin appeared and the row still did not, so the
        // only row for a place you already own was GOOGLE's, saying `כבר בטיול`.
        matchesQuery(u) || ownedResults.has(u.placeId)
      : inDayScope(u) && matchesPlaceFilter(u, placeFilter),
  ).rows;
  const listCount = countVisible(listRows);

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
  // clock can renumber a pin, and this memo is stable across a tick. All-days
  // there is no day to be an index in, so nothing is numbered at all: the row
  // says which day it is in words instead (`relativeDayLabel`, `dayMeta`).
  const orderIndex = useMemo(
    () => buildPinOrderIndex(dayScoped, { nameOf, onDate: scopedDate }),
    [dayScoped, scopedDate, placeById],
  );

  // `planning` withdraws the behind-you tier in Plan mode (ADR-0130 §2): the clock still
  // resolves which day a place is read as, but a day you are arranging has no past — and
  // the pins you can least afford to fade are the ones you came to rearrange. It sits
  // beside `nextStopId`/`nowStopId`, which are Trip-only for the mirror-image reason.
  const pinTier = (usage: PlaceUsage): PinTier =>
    placePinTier(usage, { onDate: scopedDate, nowMs, today, planning: mode === 'plan' });

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
      //
      // A QUERY IS A FILTER LIKE ANY OTHER (ADR-0131 §3), which is why the matches need
      // no cue: they are the pins that REMAIN. The ladder has no free axis left anyway —
      // six tiers, two amber `box-shadow` cues, selection's `outline` shaped to compose
      // with them, and a zoom-keyed dot degradation. And it is facet-blind here for the
      // same reason it is in the list: one derivation, one filter layer (ADR-0121 §6).
      //
      // A MATCH is either half of the search finding it: our own text match, or Google
      // returning it as a result the trip already owns (`ownedResults`). Derived here, from
      // the very predicate that admits the pin, so the flag and the filter cannot drift —
      // the errand demotion reads it to exempt an answer from being treated as backdrop.
      const isMatch = searching && (matchesQuery(usage) || ownedResults.has(usage.placeId));
      if (!(searching ? isMatch : matchesPlaceFilter(usage, placeFilter))) continue;
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
        // THE PROMOTION (ADR-0131 §4). `aside` is the subordinate SIZE; the tier class
        // beside it is the paint. Under a query the day scope is not what chose this
        // set, so a match must not wear the ratio that means "not what you are looking
        // at" — while the paint stays, because a hollow ghost still answers _which day_,
        // which is exactly what you need to know when your search found Friday's.
        // Every pin here is a match while `searching` (non-matches were skipped above).
        aside: isAsidePin(tier) && !searching,
        // …and the SECOND reader of the same idea (session 168): a pin your search surfaced
        // is exempt from the errand's context demotion, because it is an answer rather than
        // the backdrop you are choosing against.
        match: isMatch,
        order: orderIndex.get(usage.placeId),
        // AND THE AMBER GUARD DELIBERATELY DOES NOT FOLLOW IT. `עכשיו`/`היעד הבא` are
        // claims about TIME, not about the search: a pin from a day you are not looking
        // at must not make one. Reading `tier` here rather than the flag above is the
        // whole distinction, and writing it as one query-aware predicate would have
        // changed five behaviours silently, two of them wrongly.
        nextStop: nextStopId === usage.placeId && !isAsidePin(tier),
        nowStop: nowStopId === usage.placeId && !isAsidePin(tier),
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
        // In the key because it is a rendered class: a promotion that changed the paint
        // but not this string would hand the memo an "equal" array and the markers would
        // keep the old ratio. The pin SET usually changes with the query too, so the bug
        // would have been intermittent rather than absent — the worse kind.
        p.aside,
        p.match,
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

  // ── THE RINGS (ADR-0132 §6) ───────────────────────────────────────────────────
  // Unsaved Google results, drawn because Text Search returns them WITH coordinates —
  // which is the whole reason ADR-0131 §8 could not do this and this phase changes SKU.
  //
  // A result already in the trip gets NO ring: it already has a pin, and a ring over it
  // would draw the same place twice while saying the opposite thing about it. Its row
  // states `כבר בטיול` instead, which is the same rule the picker has always run.
  const resultsNow: MapResultPin[] = [];
  if (hasMap && searching) {
    for (const result of research.predictions) {
      if (result.lat == null || result.lng == null) continue;
      if (research.alreadyInTrip(result)) continue;
      resultsNow.push({
        googlePlaceId: result.googlePlaceId,
        lat: result.lat,
        lng: result.lng,
        label: result.primaryText,
        selected: selectedResultId === result.googlePlaceId,
      });
    }
  }
  // Memoized on its own content, for the same reason `pins` is: this screen re-renders
  // every second, and a fresh array would re-diff every marker on the tick (§4/§6).
  const resultsKey = resultsNow
    .map((r) => [r.googlePlaceId, r.lat, r.lng, r.selected].join('|'))
    .join(';');
  const results = useMemo(() => resultsNow, [resultsKey]);

  // The camera answers CONTROLS, not content (§7): re-framing on every snapshot
  // change would move the map under someone who is reading it, and a manual pan
  // must win until the next scope change.
  // `query` is DELIBERATELY ABSENT (ADR-0131 §5), and not for `areaSorted`'s reason —
  // that one is a sort, while a query really is a filter, so it would otherwise belong
  // here. Two reasons of its own. Since ADR-0129 every camera move is a hand-rolled
  // per-frame ease, so re-fitting per keystroke is an animation restarting per keystroke.
  // And a chip is ONE DISCRETE ACT where a query is a STREAM — `ר`, `רמ`, `רמן`, each a
  // legitimate set — so a camera answering it is not "the camera answers a control"
  // (ADR-0121 §7), it is the camera answering a keystroke.
  //
  // Typing never moves the camera; COMMITTING to a place always does. The two ways to a
  // match already exist and neither is new: `frame` frames what the filters left (which
  // now includes the promoted matches, §4), and the card's badge frames one place with
  // its surroundings (ADR-0129 §1).
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
        .filter((pin) => pin.order != null && !isAsidePin(pin.tier))
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
    // ONE selection on the canvas. A ring and a pin can both be selected only if nothing
    // clears the other, and at the map extreme that would raise two cards on top of each
    // other — the exact defect `MapPane`'s "do NOT skip on `event.detail.placeId`" comment
    // records for Google's own card.
    //
    // …UNLESS THEY ARE THE SAME PLACE. When Google's half is what put this pin on the
    // canvas, the result row IS this place's row (the trip half never matched it), so both
    // ids naming it is one selection shown on both halves — the pin↔row rule, not two
    // selections (ADR-0121 §8).
    setSelectedResultId(ownedResults.get(placeId) ?? null);
    if (opts.fromRow) {
      // A row tap normalises the sheet to `half`: from `full` because the map it
      // focuses is invisible there (ADR-0121 §8), and from the map extreme because a
      // row you tapped in a list belongs in its list. A coordless row has no map to
      // reveal, so it shrinks nothing.
      const point = hasMap ? placePoint(placeById.get(placeId) ?? {}) : null;
      if (point && sheetView !== MAP_SHEET_VIEW.half) setSheetView(MAP_SHEET_VIEW.half);
      // …AND IT FRAMES, where a pin tap only pans (ADR-0134 §6). ADR-0129 §1 decided
      // both taps pan, on the report that being zoomed for a pin you can already see is
      // a nuisance — which is right for a pin and wrong for a row: a row in a list is
      // the one case where you cannot see the place, and at `full` there is no canvas at
      // all. So the tap's SOURCE decides, and the sheet moves first (above) so the
      // framing does not happen behind the list. A fresh object every time, because
      // `framePlace` is spent once and the same row may be tapped twice.
      if (point) setFramePlace({ ...point });
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
    // The place's row, WHEREVER it is. Normally that is its trip row; when Google's half is
    // what matched it, the trip list has no row for it and its row is the result row. Two
    // selectors rather than one because the row genuinely moves between two hosts — the same
    // fact the card and the ghost row are both about (ADR-0122 §7).
    const resultId = ownedResults.get(placeId);
    requestAnimationFrame(() => {
      const scope = sheetRef.current;
      const row =
        scope?.querySelector(`[data-place="${placeId}"]`) ??
        (resultId ? scope?.querySelector(`[data-result="${resultId}"]`) : null);
      row?.scrollIntoView({ block: 'center' });
    });
  };

  // Tapping the canvas background clears the selection — the map idiom, and the place
  // card's own dismissal. Nothing registers with the back stack: it is not an overlay,
  // for the same reasons the sheet is not (ADR-0121 §5, ADR-0103). Stable identity,
  // like every other `MapPane` handler (§4).
  // The viewport settled. Two readers, and the split matters: `viewBounds` is STATE
  // because `X באזור` re-renders off it, while the search bias is a REF because a paid
  // query must not re-fire when the camera moves (ADR-0132 §7). Same stable identity as
  // every other `MapPane` handler (§4).
  const onViewSettled = useCallback((bounds: MapBounds | null) => {
    setViewBounds(bounds);
    biasRef.current = bounds;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setGhostId(null);
    setSelectedResultId(null);
  }, []);

  // A RING TAP selects its ROW — and, at the map extreme where there is no row, raises the
  // result's own CARD (`resultCard` below). That is the third occupant ADR-0132 §8 made the
  // stop's return conditional on, built now that the owner has asked for the stop back: the
  // rule is ADR-0122 §7's unchanged, **the row surfaces wherever the sheet cannot show it**,
  // and a Google result at the map stop is simply the third case of it.
  //
  // Same latest-ref shape as `onPinTap`, so `MapPane`'s memo survives the clock tick.
  const onResultTap = useRef<(googlePlaceId: string) => void>(() => {});
  onResultTap.current = (googlePlaceId: string) => {
    setSelectedId(null);
    setGhostId(null);
    setSelectedResultId(googlePlaceId);
    // A ring is ON the canvas, so tapping it PANS (ADR-0129 §1, unchanged) — the framing
    // below belongs to the result's ROW, which is the tap you make without being able to
    // see the place. `selectResultRow` is that one.
    requestAnimationFrame(() => {
      sheetRef.current
        ?.querySelector(`[data-result="${googlePlaceId}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
  };
  const selectResult = useCallback(
    (googlePlaceId: string) => onResultTap.current(googlePlaceId),
    [],
  );

  // A RESULT'S ROW was tapped (ADR-0134 §6): the same "commit" a trip row's tap is, so it
  // does the same three things — selects, normalises the sheet so the canvas is on screen,
  // and FRAMES. The span reads the other rings as context, which `MapPane` supplies from
  // the results it is already drawing (§7), so nothing extra is threaded through here.
  //
  // A result with no coordinates selects and does not frame: there is nothing to frame,
  // exactly as for a coordless place of our own.
  //
  // A latest-ref like the two taps above, not a `useCallback([])`: it has to read whether
  // the trip already owns this result, and a stale closure would light the row without its
  // pin.
  const onResultRowTap = useRef<(result: PlaceResult) => void>(() => {});
  onResultRowTap.current = (result: PlaceResult) => {
    setGhostId(null);
    // If the trip owns it, this row is OUR place's row, so the selection names the place
    // too and its pin lights up with the row (see `select`'s note on the same pairing).
    setSelectedId(research.alreadyInTrip(result)?.id ?? null);
    setSelectedResultId(result.googlePlaceId);
    if (result.lat == null || result.lng == null) return;
    setSheetView((view) => (view === MAP_SHEET_VIEW.half ? view : MAP_SHEET_VIEW.half));
    setFramePlace({ lat: result.lat, lng: result.lng });
  };
  const selectResultRow = useCallback((result: PlaceResult) => onResultRowTap.current(result), []);

  // ADDING A RESULT — one path, whether it was tapped as a row or as a ring. Two steps,
  // both already built: resolve the place (which, for a Text Search result, spends
  // NOTHING — the search already returned the name, the address and the point, so the
  // server skips Place Details, ADR-0132 §7), then reference it from an uncategorised
  // idea, because a reference is what makes a place "in the trip" (ADR-0112). The row
  // then flips to `כבר בטיול` and the ring disappears on its own: both read the same
  // derivation, so neither needs telling.
  const [addingResultId, setAddingResultId] = useState<string | null>(null);
  const [addResultFailed, setAddResultFailed] = useState(false);
  const addResult = useCallback(
    async (result: PlaceResult) => {
      setAddingResultId(result.googlePlaceId);
      setAddResultFailed(false);
      try {
        const place = await research.pick(result);
        // THREE SOURCES, ONE DESTINATION, AND THE INVOCATION DECIDES IT (ADR-0131 §11,
        // ADR-0134 §3). With an errand live the place is ASSIGNED and the tab returns —
        // no `MaybeItem`, because "only choosing one place and not adding more and more
        // places" is the constraint. With no errand it goes to the shelf, unchanged.
        if (pendingErrand) finishErrand(place.id);
        else verbs.addMaybe(result.primaryText, { placeId: place.id });
      } catch {
        setAddResultFailed(true);
      } finally {
        setAddingResultId(null);
      }
    },
    [research.pick, verbs, pendingErrand, finishErrand],
  );

  // A pin tap, behind a stable identity. `MapPane` is memoized, so a handler
  // re-created every render would break the memo and re-diff every marker once a
  // second — which is exactly what §4/§6 forbid. The latest-ref keeps the callback
  // stable while its body still sees this render's state.
  const onPinTap = useRef<(placeId: string) => void>(() => {});
  onPinTap.current = (placeId: string) => {
    const usage = usageIndex.get(placeId);
    // An aside pin's row is not in the sheet, so the tap surfaces that one row instead.
    // Keyed on the REASON rather than on one tier: what makes the row missing is that the
    // day scope did not choose the place, which is true of a dayless maybe exactly as it
    // is of another day's ghost (ADR-0130 §3).
    //
    // Under a live query the list is trip-wide, so NOTHING is out of its scope and every
    // pin's row is already in it — the ghost row would double a row instead of supplying
    // a missing one. This reader is not the promotion (§4): it asks "is this pin's row
    // absent from the list?", and under a query the answer is uniformly no. ADR-0131's
    // table enumerated three of five tier readers; this is one of the two it missed, and
    // it needs the query for a different reason than the ratio does.
    setGhostId(!searching && usage && isAsidePin(pinTier(usage)) ? placeId : null);
    select(placeId);
  };
  const selectPin = useCallback((placeId: string) => onPinTap.current(placeId), []);

  // The `באזור` tap, behind the same stable identity for the same reason. It snapshots
  // the CURRENT bounds before anything moves, clears the other sort intent (one list,
  // one order), and lifts the sheet so the order it just produced is on screen.
  const onAreaTap = useRef<() => void>(() => {});
  onAreaTap.current = () => {
    if (areaSorted) {
      setAreaBounds(null);
      return;
    }
    setSortByDistance(false);
    setAreaBounds(viewBounds);
    liftToList();
  };
  const toggleAreaSort = useCallback(() => onAreaTap.current(), []);

  // Same stable-identity contract for locate: the pane calls it, so a fresh function
  // each render would re-diff every marker once a second (ADR-0121 §4/§6).
  const onLocateTap = useRef<() => void>(() => {});
  onLocateTap.current = requestLocate;
  const locateFromCanvas = useCallback(() => onLocateTap.current(), []);

  // `מפה` on an EventCard / BookingDetail routes here focused on a place (§8).
  // Consumed once, and it widens to all-days when the place is not in the day it
  // landed on — otherwise the action would point at something the scope hides.
  // A place the camera has been asked to FRAME — the two intents that mean "take me to
  // this one" (ADR-0129 §1): an arrival from `מפה`, and the place card's badge. Held in
  // state rather than read from `focusPlaceId`, which is consumed in this same pass: the
  // camera may not be sized for several more, and dropping the focus in between is
  // exactly what made an arrival land on the day's frame. The camera spends it once, and
  // a fresh object each time is what lets the same place be re-framed on a second tap.
  const [framePlace, setFramePlace] = useState<LatLng | null>(null);
  const frameSelected = useCallback(() => {
    const point = selectedId ? placePoint(placeById.get(selectedId) ?? {}) : null;
    if (point) setFramePlace({ ...point });
  }, [selectedId, placeById]);
  useEffect(() => {
    if (!focusPlaceId) return;
    const usage = usageIndex.get(focusPlaceId);
    if (usage && !usage.days.some((d) => d.date === activeDate)) setAllDays(true);
    setSelectedId(focusPlaceId);
    setFramePlace(placePoint(placeById.get(focusPlaceId) ?? {}) ?? null);
    clearFocus();
  }, [focusPlaceId, usageIndex, placeById, activeDate, setAllDays, clearFocus]);

  // ── The row's meta line: `<time> · <what happens here>` (ADR-0109 §1) ──────
  // It replaces the address, which said nothing about why the place is on the list
  // (the shipped row read "Dimitras, Nicosia, Lefkosia 2058" — true and useless).
  // The time renders in the EVENT's own zone (ADR-0107), and each end of a booking
  // gets its own: a departure in its origin, an arrival in its destination.
  const zoneCtx = useMemo(() => liveZoneContext(nowMs, zoneEvidence), [nowMs, zoneEvidence]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // A row rendered OUT of the day scope — a surfaced ghost, the canvas place card —
  // reads in all-days grammar, so it drops the scope everywhere that scope is asked
  // for: its day, its outcome, AND its references. Threading it into two of the three
  // was the bug: a ghost's references are by definition on another day, so
  // `refEntriesFor` filtered every one of them out and the way-in block §8 promised
  // came back empty on exactly the rows that have no other way in.
  const metaCtx = (opts: { forceDay?: boolean }) => ({
    onDate: opts.forceDay ? undefined : scopedDate,
    nowMs,
    today,
  });

  const dayMeta = (
    usage: PlaceUsage,
    opts: { forceDay?: boolean } = {},
  ): { day?: string; time?: string; what?: string; pencilled?: boolean } => {
    const usageDay = placeMetaDay(usage, metaCtx(opts));
    // Day-scoped, a strictly-middle stay night has no moment and nothing happens there —
    // saying the hotel's own name back on the hotel's row would be pure repetition.
    // All-days, `placeMetaDay` has already moved to the stay's next edge, so this only
    // fires for the scoped night it is meant to silence.
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
  const refEntriesFor = (usage: PlaceUsage, opts: { forceDay?: boolean } = {}): RefEntry[] =>
    placeRefs(
      usage.placeId,
      { events, bookings, maybeItems },
      { onDate: metaCtx(opts).onDate },
    ).flatMap((ref): RefEntry[] => {
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
    });

  const renderRow =
    (opts: {
      onSelect?: (placeId: string) => void;
      forceDay?: boolean;
      onFrame?: () => void;
      onChoose?: (placeId: string) => void;
    }) =>
    (usage: PlaceUsage) => {
      const place = placeById.get(usage.placeId);
      if (!place) return null;
      const prominence = allDays
        ? undefined
        : usage.days.find((d) => d.date === activeDate)?.prominence;
      const { day, time, what, pencilled } = dayMeta(usage, { forceDay: opts.forceDay });
      // What a human said happened here (ADR-0117 §1) — read off the same day the
      // meta line describes. A strictly-middle stay night reports nothing: nothing
      // happens there to have an outcome about.
      const usageDay = placeMetaDay(usage, metaCtx(opts));
      const outcome = usageDay?.prominence === 'ambient' ? undefined : usageDay?.outcome;
      const selected = selectedId === usage.placeId;
      return (
        <PlaceRow
          key={usage.placeId}
          usage={usage}
          place={place}
          order={orderIndex.get(usage.placeId)}
          ambient={prominence === 'ambient'}
          behind={blockOf(usage) === PLACE_BLOCK.behind}
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
          refs={selected ? refEntriesFor(usage, opts) : undefined}
          onEnrich={() => setEnrichTarget(place)}
          onFrame={opts.onFrame}
          onChoose={opts.onChoose && (() => opts.onChoose!(usage.placeId))}
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
  const renderList = (
    rows: Revealed<PlaceUsage>[],
    onSelect: (placeId: string) => void,
    opts: { onChoose?: (placeId: string) => void } = {},
  ) => {
    const shown = visibleItems(rows);
    // EITHER sort intent replaces the schedule blocks, because they no longer describe
    // the list (ADR-0126 §5 — the area sort is a sibling of near-me, so it takes the
    // same path rather than a parallel one).
    const blocks = distanceOrder || areaSorted ? [] : shown.map(blockOf);
    // A single-block list needs no header at all: labelling the only thing on screen
    // is the chrome ADR-0117 §3 refused for the ahead header.
    const labelled = new Set(blocks).size > 1;
    const headerFor = new Map<string, string>();
    if (labelled) {
      shown.forEach((usage, i) => {
        if (blocks[i] !== blocks[i - 1]) headerFor.set(usage.placeId, t.map.blockHeader[blocks[i]]);
      });
    }
    // The area sort needs TWO headers where near-me needs one: a distance is legible on
    // every row (each carries its own chip), but "in view" is not, so the boundary the
    // first group ends at has to be drawn. Same `.map-grouphead`, same mechanism — the
    // partition is just a different one.
    if (areaSorted) {
      const firstIn = shown.find((u) => placesInArea.has(u.placeId));
      const firstOut = shown.find((u) => !placesInArea.has(u.placeId));
      if (firstIn) headerFor.set(firstIn.placeId, t.map.area.groupHeader);
      if (firstOut) headerFor.set(firstOut.placeId, t.map.area.elsewhere);
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
            const header = headerFor.get(usage.placeId);
            return header && <div className="map-grouphead">{header}</div>;
          }}
          renderRow={renderRow({ onSelect, onChoose: opts.onChoose })}
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
  // ONE close control for both occupants, pinned OUTSIDE the scroller where the search
  // button sits at rest: a close control you have to scroll to reach is not a close
  // control. Its label names whichever is open. For the query it CLEARS AND CLOSES in one
  // act, so there is never an active filter you cannot see — the defect ADR-0119 exists
  // to prevent — and while the field is open its own text is what states the filter,
  // which is why it needs no collapsed summary the way `סינון` does.
  const closeControl = (
    <button
      type="button"
      className="map-facets-close"
      aria-label={facetsOpen ? t.map.filter.close : t.map.search.close}
      onClick={() => openDisclosure(null)}
    >
      <Icon name="close" />
    </button>
  );

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
            {hasBehind && (
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
          {closeControl}
        </>
      ) : disclosure === MAP_ROW_DISCLOSURE.query ? (
        <>
          {/* THE QUERY, IN THE ROW (ADR-0131 §1). 44px inside a 46px row, so the touch
              floor is met by geometry and the split pays not one pixel — `MAP_CONTROLS_H`
              stays 46 and the camera's top inset stays derived from it.
              `autoFocus` for ADR-0101 §3's reason, minus its machinery: the whole point
              of tapping search is to type. It is not a dialog, so there is no
              `useDialogFocus` contract to opt into here. */}
          <div className="map-querystrip">
            <Icon name="search" />
            <input
              autoFocus
              type="text"
              value={query}
              placeholder={t.map.search.placeholder}
              aria-label={t.map.search.button}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {closeControl}
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
            onClick={() => openDisclosure(MAP_ROW_DISCLOSURE.facets)}
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
            aria-label={t.map.search.button}
            onClick={() => openDisclosure(MAP_ROW_DISCLOSURE.query)}
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
  // THE PREREQUISITE, ANSWERED (ADR-0126 §5). `areaCount` reads the CANVAS, so it counts
  // the aside pins — places in view that the day scope did not choose, whether they are
  // another day's or on no day at all — and the sheet contains none of them:
  // `orderedStops` excludes them explicitly, twelve lines below where
  // the count is taken. So the readout names a set the list is structurally unable to
  // produce, and the button cannot honestly promise "these N rows".
  //
  // The count stays SPATIAL and the list says what it could not bring. Decoupling it
  // instead — counting only what the list can render — would show seven pins over a
  // readout saying four, which is the same two-halves-disagreeing defect pointing the
  // other way. Read off `pins`, the very array the count is taken from, so the two
  // numbers cannot drift.
  // The second reader ADR-0131's table missed, and the same clause answers it: the
  // shortfall this counts is "in the area, but not in this day", and under a live query
  // the list is trip-wide, so there is no shortfall to state. Asking it anyway would put
  // `N מקומות באזור אינם ביום הזה` over a list that is already showing them.
  const ghostsInArea = useMemo(
    () =>
      areaBounds && !searching
        ? pins.filter((pin) => isAsidePin(pin.tier) && pointInBounds(areaBounds, pin)).length
        : 0,
    [pins, areaBounds, searching],
  );

  // Session 144's grammar, reused rather than re-invented: say how many are outside
  // this day, and offer the same way out with the same words. And it genuinely
  // resolves — with all-days on there are no ghosts, the two numbers converge, and
  // this removes itself.
  const areaNotice = areaSorted && ghostsInArea > 0 && (
    <StatusBanner tone="neutral">
      {t.map.area.otherDays(ghostsInArea)}
      <button type="button" className="map-georetry" onClick={() => setAllDays(true)}>
        {t.map.emptyDay.action}
      </button>
    </StatusBanner>
  );

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
      {renderRow({
        forceDay: !inDayScope(cardUsage),
        onFrame: frameSelected,
        // A card is the only way to reach one of OUR places at this stop, so under an
        // errand it has to be able to choose it — otherwise a trip place is pickable from
        // the list and not from the canvas, on the tab that exists to show you where things
        // are (ADR-0134 §3).
        onChoose: pendingErrand ? finishErrand : undefined,
      })(cardUsage)}
    </div>
  );

  // THE TAPPED RING, ON THE SAME CANVAS HOST (ADR-0132 §8, built session 166). Same rule as
  // the place card and the ghost row above — the row surfaces wherever the sheet cannot show
  // it — so it is `ResultRow` in `.map-placecard`, not a second grammar for a Google result.
  //
  // `!cardUsage` is the one case where both selections name something: a result the trip
  // ALREADY OWNS sets both ids deliberately (session 167), and the place card is the richer
  // of the two — it carries the day, the distance and the way in to every reference. So the
  // place we own wins, which is also the honest answer to "what is this": ours.
  const cardResult =
    sheetView === MAP_SHEET_VIEW.map && selectedResultId && !cardUsage
      ? research.predictions.find((r) => r.googlePlaceId === selectedResultId)
      : undefined;
  const resultCard = cardResult && (
    <div className="map-placecard">
      <ResultRow
        result={cardResult}
        selected
        chooseMode={pendingErrand != null}
        busy={addingResultId === cardResult.googlePlaceId}
        onAdd={() => addResult(cardResult)}
      />
    </div>
  );

  // An empty list has three causes and the tab used to name one of them. The common
  // path is neither a filter nor an empty trip: the facets PERSIST across a day change
  // (rightly — it is the same question asked of each day), so scrolling the strip with
  // one on lands you here, and `אין מקומות שמתאימים לסינון` then blames the control you
  // did not touch. Each case now says which one it is and hands back the step out of
  // it, which is what `EmptyState`'s `action` is for (ADR-0078's "the app never
  // dead-ends") — and the filtered case names the facets it is holding, since the strip
  // may well be closed over them.
  //
  // A live query is a FOURTH cause, and it is named before the others because it is the
  // only one where nothing is "wrong": the trip simply has no place by that name. It must
  // not blame the facets (a query ignores them, §1) and it must not offer all-days (a
  // query already spans the trip), so it gets neither action — and in a moment the paid
  // half below may answer where the trip could not, which is the real way out.
  // Has the paid half SETTLED with nothing? Not the same as "has no results": below the
  // min-chars floor it is inert, and while a request is in flight the skeletons are the
  // answer. Only when it is active, done and empty does the merged list get to say so.
  const researchEmpty =
    offline || !research.active || (!research.loading && research.predictions.length === 0);

  const listBody =
    allUsages.length === 0 ? (
      <EmptyState icon="🗺️" title={t.map.empty.title} body={t.map.empty.body} />
    ) : searching ? (
      // ONE LIST, ONE EMPTINESS (owner, session 164). The two halves used to be two
      // sections with two headers and two empty states, and the result was the screenshot
      // that got this changed: `לא נמצאו מקומות` in bold, with three Google results
      // underneath it. A list cannot say "nothing" and then show something.
      //
      // So the trip's half no longer answers for itself. Emptiness is now a fact about the
      // MERGED list, and it is only stated once Google has settled — while a paid search is
      // in flight the honest answer is "still looking", which the skeletons already say.
      listCount === 0 && researchEmpty ? (
        <p className="map-res-hint">{t.map.search.noResultsTitle}</p>
      ) : (
        renderList(listRows, (id) => select(id, { fromRow: true }), {
          onChoose: pendingErrand ? finishErrand : undefined,
        })
      )
    ) : listCount === 0 ? (
      facetsActive ? (
        <EmptyState
          icon={ICONS.search}
          title={t.map.filter.noResultsTitle}
          body={t.map.filter.noResultsBody(facetWords)}
          action={{ label: t.map.filter.clear, onClick: clearFacets }}
        />
      ) : (
        <EmptyState
          icon="🗓️"
          title={t.map.emptyDay.title}
          body={t.map.emptyDay.body}
          action={{ label: t.map.emptyDay.action, onClick: () => setAllDays(true) }}
        />
      )
    ) : (
      renderList(listRows, (id) => select(id, { fromRow: true }), {
        onChoose: pendingErrand ? finishErrand : undefined,
      })
    );

  // GOOGLE'S HALF, IN THE SHEET (ADR-0131 §8) — re-parented out of the retired overlay,
  // not rewritten: `PlaceResearch` already took only these three props and rendered
  // `.map-research`, which is ADR-0115 §7's reuse audit paying off.
  //
  // It belongs HERE and not on the canvas for a fact rather than a preference: an
  // Autocomplete prediction carries NO COORDINATES until the pick (ADR-0115 §2), so
  // there is nothing to draw. The free half goes on the canvas because its places already
  // carry them; the paid half is rows because it cannot. And it is in BOTH modes now —
  // ADR-0115 §6's "Plan mode only" is withdrawn, and its own §1 arm with it (§8a), so
  // `PLACE_SEARCH_MIN_CHARS` is what stands between a keystroke and a paid call.
  const googleHalf = searching && (
    <PlaceResearch
      search={research}
      offline={offline}
      selectedId={selectedResultId}
      chooseMode={pendingErrand != null}
      onShow={selectResultRow}
      addingId={addingResultId}
      addFailed={addResultFailed}
      onAdd={addResult}
    />
  );

  // The sheet's scroll content under a query: the trip's own matches under `בטיול`, then
  // Google's under its own header. Grouped rather than interleaved, because "is this
  // already ours" is the most important fact about a result and a header answers it once
  // instead of per row. One fragment, so the list-only path (§8) cannot drift from it.
  // The errand says what the tab is doing and names its target in the reference's own
  // words (ADR-0134 §2) — `StatusBanner`, never a bespoke div (ADR-0078). `ביטול` sits in
  // it because the way out belongs with the statement of what you are in.
  const errandBanner = pendingErrand && (
    <StatusBanner tone="neutral">
      {t.map.errand.title(pendingErrand.label)}
      <button type="button" className="map-gbtn" onClick={cancelErrand}>
        {t.map.errand.cancel}
      </button>
    </StatusBanner>
  );

  const sheetList = (
    <>
      {errandBanner}
      {/* NO GROUP HEADERS (owner, session 164). ADR-0131 §8 grouped the two corpora under
          `בטיול` / `מגוגל` on the argument that "is this already ours" is the most
          important fact about a result and a header answers it once instead of per row.
          The owner disagrees, and the per-row signal it was standing in for already
          exists: a result wears the dashed "not ours yet" badge, and one that IS ours says
          `כבר בטיול` in its own slot. The header was restating a fact the rows carry. */}
      {listBody}
      {googleHalf}
    </>
  );

  const overlays = (
    <>
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
      {(editBooking || bookingDraft) && (
        <BookingSheet
          booking={editBooking}
          draft={bookingDraft}
          onClose={() => {
            setEditBooking(null);
            setBookingDraft(null);
          }}
        />
      )}
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
        {sheetList}
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
      // EVERY TRIP PIN IS CONTEXT WHILE AN ERRAND IS LIVE (owner, session 166). One
      // attribute on the screen, exactly as `data-scope` drives the dot tier: the whole
      // demotion is CSS, so no marker re-renders and nothing is re-diffed on a live map
      // (ADR-0121 §4). The pins' own `tier`/`aside` are untouched on purpose — those are
      // what the camera reads, and where the trip is IS where you want to start looking.
      //
      // A SEARCH RESULT IS EXEMPT, and it is exempt PER PIN rather than by switching this
      // attribute off (owner, session 168: _"not every trip pin, just search results that
      // are already saved"_). The demotion asks "is this what you are choosing", and a place
      // your search surfaced is an answer to that question, not the backdrop to it — so the
      // exemption belongs on the pin that earned it (`MapPin.match`, read by `:not(.match)`
      // in the CSS), exactly as ADR-0131 §4 put the `aside` withdrawal on the pin rather than
      // on the screen. Left as a screen-wide switch it would also promote anything the
      // canvas happens to carry for another reason, which is precisely the drift the §4
      // split exists to prevent.
      data-choosing={pendingErrand ? 'place' : undefined}
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
          '--pin-aside-scale': MAP_PIN.ASIDE_SCALE,
          // The dot tier's ratio (ADR-0128 §1). Written here with the others, and read
          // by CSS off the pane's own `data-pins` — so the tier flips under a pinch with
          // no marker re-render and no prop that changes on a gesture.
          '--pin-dot-scale': MAP_PIN.DOT_SCALE,
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
          results={results}
          onSelectResult={selectResult}
          me={me}
          connector={dayShapeVisible ? orderedStops : undefined}
          setSignal={cameraSignal}
          defaultCentre={defaultCentre}
          onSelectPin={selectPin}
          onCanvasTap={clearSelection}
          onViewChange={onViewSettled}
          areaCount={areaCount}
          areaSorted={areaSorted}
          onAreaSort={toggleAreaSort}
          onLocate={locateFromCanvas}
          framePlace={framePlace}
          cardOpen={cardUsage != null || cardResult != null}
        />
        {placeCard}
        {resultCard}
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
                {/* Present while searching too, since session 166: the derived-affordance
                    rule that removed it ("a control whose effect you could not see is not
                    offered") no longer applies to this one — the results ARE visible there,
                    as rings. */}
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
            {/* Only on this path: an area sort needs a canvas to read, so on the
                list-only tab it can never be on (ADR-0122 §8). */}
            {areaNotice}
            {ghostRow}
            {sheetList}
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
  behind,
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
  onFrame,
  onChoose,
}: {
  usage: PlaceUsage;
  place: Place;
  /** This place's position in the day's sequence — the SAME number its pin carries
   *  (`buildPinOrderIndex`), so the canvas and the list can't disagree about which
   *  stop is second. Absent for anything with no position in the schedule: a ghost,
   *  an idea, an ambient stay night (ADR-0121 §6). */
  order?: number;
  ambient: boolean;
  /** This place is behind you — the same `מה שמאחורינו` block the header names and
   *  `מה נשאר` hides, so the row, the pin, the header and the filter close a place at
   *  the same instant (ADR-0124). Distinct from `outcome`: this is where the clock (or
   *  a human's settle) put the place, not a claim about what happened at it. */
  behind: boolean;
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
  /** Only the place card passes this: it makes the badge the way in to its own pin
   *  (ADR-0129 §1). Absent everywhere else, so the list's badges stay inert. */
  onFrame?: () => void;
  /** Present only while a place errand is live: choose THIS place for the form that sent
   *  it, and return (ADR-0134 §3). */
  onChoose?: () => void;
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
    // Behind you, on the same derivation the block header reads — the row's half of
    // the pin's desaturation, which until now faded on the clock while the row faded
    // only on a human's `skipped`. Its own class, never `skipped`: the clock passing a
    // place and a human saying it did not happen are different claims.
    behind && 'behind',
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
      // The same double-tap shortcut the result rows carry (owner, session 170), and the
      // same scope: only while `בחירה` is the row's verb. One list, one gesture — a trip
      // row and a Google row are answers to the same question under an errand.
      onDoubleClick={onChoose}
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
          twice, never a second treatment.
          ON THE PLACE CARD it is also the way in to the pin (ADR-0129 §1): tapping it
          frames the place with what is around it. That is the verb the badge already
          carries on every other surface (ADR-0121's session-148 amendment made the badge
          "the way to the pin" on day cards, builder rows and booking details) — one step
          further in, since here you are already on the map. Reusing it costs no row slot
          and no new icon, which is exactly why session 148 measured and rejected a
          trailing-slot control. */}
      <PlaceBadge
        className={`map-badge cat-${hue}` + (usage.coordless ? ' nocoord' : '')}
        order={order}
        onShowOnMap={onFrame}
        label={t.map.frameOnPlace}
      >
        {glyph}
      </PlaceBadge>
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
        {/* WHILE AN ERRAND IS LIVE, `בחירה` REPLACES `נווט` (ADR-0134 §3/§4). Navigating
            somewhere is not the task when you are picking a place for a form, and "a
            control only where it has something to do" is the derived-affordance rule this
            tab already runs for `קרוב עכשיו`, `אולי`, `מה נשאר`, `באזור` at zero and
            `frame` with nothing to frame. It also pays for itself: `.map-right` is a
            column, so a verb ADDED beside `נווט` would cost height and the row would grow
            — measured, it stays at 73px because the verb takes the slot instead.
            And the row's TAP still only frames (§3): choosing is this explicit control, so
            you can look before you commit. */}
        {onChoose ? (
          <button
            type="button"
            className="map-addmaybe"
            onClick={(e) => {
              e.stopPropagation();
              onChoose();
            }}
          >
            {t.map.errand.choose}
          </button>
        ) : dirUrl ? (
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
          <AddLocationButton
            onClick={(e) => {
              e.stopPropagation();
              onEnrich();
            }}
          />
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
