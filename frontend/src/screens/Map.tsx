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
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from 'react';
import {
  EVENT_STATUS,
  matchesAnyTerm,
  type Booking,
  type DeliveredImageValue,
  type EventCategory,
  type MaybeItem,
  type Place,
  type PlaceResult,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { useMapScope, usePlaceErrandReturn, type PlaceErrand } from '../state/map-scope-state';
import { useIsOffline, withChangeGroup } from '../lib/outbox';
import {
  buildPlaceUsageIndex,
  comparePlacesBySchedule,
  countPlacesByCategory,
  isDayUsagePast,
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
  coordLabel,
  mapsDirectionsUrl,
  mapsKnowledgeUrl,
  mapsPredictionUrl,
  nextDestination,
} from '../lib/places';
import {
  PLACE_REF_KIND,
  placeLinks,
  placeRefSubject,
  placeRefs,
  soleIdeaFor,
} from '../lib/place-refs';
import { badgePhoto } from '../lib/place-photo';
import { placeCredit, placeSummary, type PlaceSummary } from '../lib/place-summary';
import { MediaViewer } from '../ui/MediaViewer';
import { apiAssetUrl } from '../lib/api-asset';
import { useCandidateEnrichment } from '../lib/useCandidateEnrichment';
import { noteCountFor, noteCountForContext, noteCountsByHost } from '../lib/notes';
import { attachmentCountForContext, attachmentCountsByHost } from '../lib/attachments';
import { resolveHostContext } from '../lib/host-context';
import { useCenterSelected } from '../lib/useCenterSelected';
import {
  buildDayStopSequence,
  buildPinOrderIndex,
  isAsidePin,
  type DayStop,
  isFramedByCamera,
  PIN_TIER,
  pinOutcome,
  pinSizeCss,
  pinTransition,
  placeGlyph,
  placePinTier,
  placePoint,
  type PinContext,
  type PinOutcome,
  type PinTier,
} from '../lib/map-pins';
import {
  countPointsInBounds,
  pointInBounds,
  type LatLng,
  type MapArrival,
  type MapBounds,
} from '../lib/map-camera';
import { mapColorScheme, mapPaneAvailable, mapsConfig, mapTileUrls } from '../lib/map-config';
import { prefersReducedMotion } from '../lib/motion';
import { observeResize } from '../lib/observe-resize';
import { usePlaceSearch } from '../lib/usePlaceSearch';
import { useVerbs, type AddMaybeOptions } from '../state/verbs';
import { stopHeightCss } from '../lib/snap-sheet';
import { countVisible, revealRows, visibleItems, type Revealed } from '../lib/filter-reveal';
import { daySelectTarget, useBackLayer, withBookingFormReturn } from '../state/nav-state';
import { useNavigate } from 'react-router-dom';
import { formatTime, relativeDayLabel } from '../lib/time';
import { eventEdgeTransition } from '../lib/transitions';
import { connectionStopKey, connectionStops } from '../lib/day-joins';
import { bookingWhen } from '../lib/booking-journey';
import { shortTitleText } from '../lib/route-title';
import { derivedPlaceLabel, shortPlaceLabel } from '../lib/place-label';
import { useClock } from '../lib/useClock';
import { formatDistance, haversineMeters } from '../lib/distance';
import { useGeolocation } from '../lib/useGeolocation';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import {
  CATEGORY_PIN_HUE,
  DEFAULT_PLACE_ICON,
  DOT_SEPARATOR,
  MAP_ATTRIBUTION_H,
  MS_PER_MINUTE,
  MAP_CONTROLS_H,
  MAP_FLOAT_GAP,
  MAP_PIN,
  MAP_ROW_DISCLOSURE,
  MAP_SHEET_ORDER,
  MAP_SHEET_STOPS,
  MAP_TRACK_SETTLE_MS,
  MAP_SHEET_STRIP_H,
  MAP_SHEET_VIEW,
  PLACE_CORPUS,
  PLACE_REFS_CAP,
  ROW_SCROLL_WAIT_FRAMES,
  type MapRowDisclosure,
  type MapSheetView,
} from '../constants';
import { ChoiceGrid, type Choice } from '../ui/primitives/ChoiceGrid';
import { AddLocationButton } from '../ui/primitives/PlacePicker';
import { RevealList } from '../ui/primitives/RevealList';
import { SnapSheet } from '../ui/primitives/SnapSheet';
import { ToggleChip } from '../ui/primitives/ToggleChip';
import { MapPane, type MapDraftMarker, type MapPin, type MapResultPin } from '../ui/domain/MapPane';
import {
  MapPlaceForm,
  type MapPlaceFormSpec,
  type MapPlaceFormValue,
} from '../ui/domain/MapPlaceForm';
import { DevMapTuner } from '../dev/DevMapTuner';
import { PlaceResearch, ResultRow } from './PlaceResearch';
import { BookingDetail } from '../ui/BookingDetail';
import { BookingSheet, type BookingSheetDraft } from '../ui/BookingSheet';
import { EventForm, type EventFormDraft } from '../ui/EventForm';
import { HostNotes } from '../ui/HostNotes';
import { HostDocuments } from '../ui/HostDocuments';
import { NoteMark } from '../ui/domain/NoteMark';
import { DocumentMark } from '../ui/domain/DocumentMark';
import { PlaceBadge } from '../ui/domain/PlaceBadge';
import { KNOWLEDGE_DENSITY, PlaceKnowledge } from '../ui/domain/PlaceKnowledge';
import { RowManageSheet } from '../ui/domain/ListRow';
import { SettleControl } from '../ui/domain/SettleControl';
import { ConfirmDialog } from '../ui/primitives/ConfirmDialog';
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
  /** Which day this reference lands on — named only when the block is not already
   *  scoped to one, the same rule the row's own meta line runs one line above it. */
  day?: string;
  /** The moment it happens here, in the reference's OWN zone (ADR-0107) — a departure
   *  in its origin, an arrival in its destination. */
  time?: string;
  /** The same moment as an instant, which is what the cap's relevance rank reads
   *  (`PLACE_REFS_CAP`). Absent on a reference with no clock at all. */
  at?: number;
  /** Where this reference sorts when there are more than the block shows: 0 is the one
   *  most worth keeping. Display order stays chronological — this only decides what
   *  survives the fold. */
  rank: number;
  onOpen: () => void;
  /** SETTLING, on the reference that names its own target (ADR-0139). Present only on an
   *  EVENT reference: an idea and a booking carry no `EVENT_STATUS`, so there is nothing to
   *  settle and the absence is a consequence rather than a rule.
   *
   *  This is what makes "which event?" a non-question. A place can carry several on one day
   *  and ADR-0117 §5 is explicit that an outcome belongs to ALL of a day's references rather
   *  than the one that won the row's clock — so the verb cannot sit on the place. The way-in
   *  block already enumerates the references one per row, each labelled in its own words, so
   *  hanging the verb here needs no disambiguator at all. */
  settle?: {
    /** What a human already said, if they did. Drives tag-plus-undo instead of the pair. */
    outcome?: PinOutcome;
    /** The clock has passed it and nobody answered — ADR-0117 §1's third state, and the one
     *  the emphasis is for. Not a gate on the controls: **every** event is settleable here
     *  (ADR-0117 §2 already lets a human close tonight's dinner at 11:00), and gating on the
     *  clock would take the undo away the instant a row was settled. */
    asking: boolean;
    onDone: () => void;
    onSkip: () => void;
    /** Back to `planned` — the shipped `verbs.restore`. */
    onUndo: () => void;
  };
}

/** **Did this event come out of the row's note section?** The section is CONTENT inside a row
 *  that is itself a `role="button"` running `select` — so without this, tapping a note or
 *  `＋ פתק` also re-selects the place, which re-frames the camera and scrolls the list under
 *  you. Every other control in that row calls `stopPropagation` for the same reason; this is
 *  the one case where the controls belong to a shared component (`NoteSection`, five hosts),
 *  so the row declines the event instead of the section swallowing it. */
const fromNotes = (target: EventTarget | null): boolean =>
  target instanceof Element && !!target.closest('.note-sec');

/** The glyph to carry onto the created idea — a human's PICK only, so an untouched derivation
 *  leaves `verbs.addMaybe` to supply the shelf's own default. Same rule as `Place.icon`'s write
 *  below, stated once: a derived glyph is not a choice, and storing one stops the thing
 *  following its category. */
const authoredIcon = (value?: MapPlaceFormValue): string | undefined =>
  value?.iconTouched ? value.icon : undefined;

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
    // Both of the canvas's make-a-place paths write through these (ADR-0147 §6): a dropped
    // pin is a `createPlace` with coordinates and no `googlePlaceId`, and a rename is an
    // `updatePlace`. Neither is a search, so neither goes through `usePlaceSearch` — its
    // session, its debounce and its dedup are all about a query, and a canvas gesture has none.
    indexVerbs,
    notes,
    documentAttachments,
    hostContexts,
    noteVerbs,
    // What the world knows about these places (ADR-0166 §6) — server-owned, and a missing key
    // is the normal "we know nothing" state rather than a loading one.
    enrichments,
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
    setChromeReclaimed,
    maybesFacet,
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
  // ── THE PLACE ERRAND (ADR-0134 §1-§4) ─────────────────────────────────────────
  // A form sent us here to pick ONE place. While it is live the tab is in errand mode:
  // every row gains `בחירה`, `נווט` goes away, and `＋ אולי` is replaced rather than
  // joined — "only choosing one place and not adding more and more places".
  // …AND THE FOURTH TARGET IS OURS (ADR-0134 §9): the coordless row's `＋ מיקום`, which
  // used to open `PlacePickerSheet` — a second search surface over the map, on the one tab
  // that already IS a search over a map. It is the same question ("which place is this?"),
  // so it is the same mode, started locally because we are already standing on the
  // destination: no hand-over, no navigation, nothing to return to.
  const [rowErrand, setRowErrand] = useState<PlaceErrand | null>(null);
  const pendingErrand = errand.pending ?? rowErrand;
  // WHO CAN ANSWER IT. A form errand takes either half — the trip's own places answer it
  // free and offline, which is the fact ADR-0134 §1 reconciled the whole reversal on. A ROW
  // errand can only be answered by Google: the coordless row is already in our list, and a
  // second row of ours cannot tell it where it is. So the trip's rows keep their ordinary
  // grammar (no `בחירה`, no commit on a second tap) while a row errand is live.
  //
  // This also removes a control that did nothing: the retired sheet offered the trip's own
  // places for the enrich too, and the Map discarded the id it handed back.
  const errandTakesOurPlaces = pendingErrand != null && pendingErrand.target.kind !== 'place';
  // ENRICHING IN PLACE, RATHER THAN MINTING A SECOND ROW (ADR-0110 §1). Under a row errand
  // the pick adopts the chosen `googlePlaceId`/coords/timezone onto the row you started
  // from, which is the whole point: that place stays the one your booking already
  // references. It is the same option the retired sheet passed, on the same hook.
  const enrichPlaceId = rowErrand?.target.kind === 'place' ? rowErrand.target.id : undefined;
  // **THE ERRAND SAYS WHAT WOULD ANSWER IT** (field report #6). A flight leg asks for an
  // airport, so this tab's search asks Google for airports — the form knows the question and
  // the tab owns the search, which is exactly the split ADR-0134 §1 set up. Absent for every
  // other errand and for free browsing, which is the whole corpus as before.
  const research = usePlaceSearch({
    corpus: PLACE_CORPUS.text,
    biasRef,
    enrichPlaceId,
    kind: pendingErrand?.kind,
  });
  const verbs = useVerbs();
  // Assign and return, in one act. The place is handed back through the OTHER channel and
  // the form's host re-opens itself from the draft (§2) — this screen deliberately knows
  // nothing about what a booking form contains.
  //
  // ONE PATH NOW, and the second one is gone (owner, session 173). §2 had a "cheap path" for
  // a SAVED booking: patch it here with `updateBooking` and return with nothing to restore,
  // on the reasoning that an existing entity has no unsaved state to lose. Both halves of
  // that were wrong in practice — _"it saves the new location instead of simply returning to
  // the edit form"_ — because choosing a place on a map is not the same act as saving the
  // booking, and because the form is where you were going either way. So every errand
  // returns a draft with the place assigned, and the SAVE stays where every other save is:
  // the form's own button.
  // WHERE THE RETURN LANDS. `returnTo` is a URL, and the Index's bookings screen is view
  // state rather than a route (ADR-0098) — so a booking errand that started there returns to
  // a LANDING with no host mounted to hear the answer. `withBookingFormReturn` asks the Index
  // to mount it; everywhere else the host never left and the helper leaves the path alone.
  //
  // A row errand has no `returnTo` at all — it never left — and that one fact is what both
  // exits below branch on, rather than each asking what kind of errand it is holding.
  const returnPath = useCallback((taken: PlaceErrand) => {
    if (!taken.returnTo) return null;
    return taken.target.kind === 'booking' ? withBookingFormReturn(taken.returnTo) : taken.returnTo;
  }, []);

  const finishErrand = useCallback(
    (placeId: string) => {
      const taken = errand.take();
      if (!taken) return;
      errandResult.hand({ errand: taken, placeId });
      const back = returnPath(taken);
      if (back) navigate(back, { replace: true });
    },
    [errand, errandResult, navigate, returnPath],
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
    // The row errand is local, so cancelling it is just putting the tab back: nothing to
    // hand over, nowhere to go. It is cleared FIRST because `errand.take()` would find
    // nothing and return early, leaving the banner up.
    if (rowErrand) {
      setRowErrand(null);
      return;
    }
    const taken = errand.take();
    if (!taken) return;
    if (taken.draft || taken.target.id) errandResult.hand({ errand: taken, placeId: null });
    const back = returnPath(taken);
    if (back) navigate(back, { replace: true });
  }, [rowErrand, errand, errandResult, navigate, returnPath]);
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
  // nav-state learns nothing about this screen. Registered while the row is open (the
  // screen itself never unmounts), and it hands off rather than repeating: one back closes
  // the row, the next leaves the tab.
  //
  // **EITHER OCCUPANT, not just the field** (owner, session 175: _"a system back should do
  // the same as if the button was clicked"_). The row has one pinned `✕` serving both the
  // query and the facets, and it runs exactly this `openDisclosure(null)` — but the layer
  // was gated on the QUERY, so with the filter panel open a system back walked past a
  // visible close control and left the tab. The gate is the disclosure, which is what the
  // ✕ is bound to.
  useBackLayer(() => {
    openDisclosure(null);
    return { remainsActive: false };
  }, disclosure !== null);

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
  // A booking reached through a selected row's way-in (§8) — `BookingDetail` is a
  // Modal sheet, so back closes it (ADR-0053), and editing hands off to the same
  // merged `BookingSheet` the Index uses.
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2), through the same shared hook every other
  // form host uses: without it the sheet returns closed and the rest of what was typed is
  // gone, which is the whole reason the errand carries a draft.
  const [bookingDraft, setBookingDraft] = useState<BookingSheetDraft | null>(null);
  usePlaceErrandReturn<BookingSheetDraft>('booking', 'map', (returned) => {
    if (!returned.draft) return;
    setEditBooking(bookings.find((b) => b.id === returned.target.id) ?? null);
    setBookingDraft(returned.draft);
  });

  // ── PUT A PLACE ON A DAY (ADR-0135) ───────────────────────────────────────
  // The tab now hosts `EventForm` too, over the map, on its own tab — which is why this is
  // NOT the place errand run backwards (§3). The errand exists because of LOSS: a form is a
  // `Modal` whose local state no URL addresses, so leaving it loses what was typed, and all
  // of ADR-0134's machinery is for surviving a round trip between two screens. Here there is
  // no round trip. `Modal`'s own `useOverlay` is the whole back story — back closes the form
  // and lands on the map with the row still selected.
  const [scheduleForm, setScheduleForm] = useState<{
    placeId: string;
    /** The originating idea, when there is exactly one (§5) — `EventForm maybeItem` then makes
     *  the save `verbs.schedule`, creating the event AND consuming it in one action. With two
     *  or more this is null and nothing is consumed: two ideas on one place are two
     *  intentions, and scheduling one must not eat the other. */
    maybeItem: MaybeItem | null;
  } | null>(null);
  const [eventDraft, setEventDraft] = useState<EventFormDraft | null>(null);
  // Session 165's rule: A HOST THAT RENDERS A FORM OWES IT A WAY BACK. The place field keeps
  // its own `onFind`, so an errand can start from inside this form — and without this hook it
  // would return to a CLOSED form with everything typed gone. One line in a mechanism already
  // generalised for exactly this; the `hostTab` filter already handles a `returnTo` at the Map.
  usePlaceErrandReturn<EventFormDraft>('event', 'map', (returned) => {
    if (!returned.draft) return;
    setEventDraft(returned.draft);
    // Re-open on the place the draft carries, so the reopened form is the one that left.
    setScheduleForm({ placeId: returned.draft.placeId ?? '', maybeItem: null });
  });

  const openScheduleForm = (placeId: string) => {
    setScheduleForm({ placeId, maybeItem: soleIdeaFor(placeId, maybeItems) });
    setEventDraft(null);
  };

  // ── REMOVING A PLACE (ADR-0157) ──────────────────────────────────────────────
  // Two surfaces, one confirm. `pinMenuId` is the long press's menu — the canvas's answer to
  // "act on this pin", since the canvas has no room for a row of verbs; `deletingId` is the
  // confirm both ways in open. Ids rather than rows, so a place edited by a peer while the
  // sheet is up is re-read rather than frozen at the moment it was pressed.
  const [pinMenuId, setPinMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // A latest-ref, because `holdCanvas` is one of the `useCallback(…, [])` handlers the
  // memoized pane takes — see the note there.
  const openPinMenu = useRef<(placeId: string) => void>(() => {});
  openPinMenu.current = (placeId) => {
    // An errand is one question, and ADR-0134 §3 has the verbs CHANGE rather than
    // accumulate — the same rule that takes `נווט` and the schedule verb off the row.
    if (!pendingErrand) setPinMenuId(placeId);
  };
  const closeScheduleForm = useCallback(() => {
    setScheduleForm(null);
    setEventDraft(null);
  }, []);

  // ── The rendered map (Phase 6, ADR-0121; the ground is ours since ADR-0186) ────────
  // **Latched once, all three, and for the same reason they always were**: the pane is
  // memoized on prop identity and this screen re-renders every second, so a fresh object here
  // would re-diff every marker — and `MapCanvas` latches its opening values at construction
  // anyway, so a live re-read would describe the map that WOULD be built next rather than the
  // one on screen (the mistake ADR-0146 §5 had to amend for `DevMapTuner`).
  //
  // `scheme` is what a whole `MapsConfig` collapsed to (ADR-0186 §8): with the renderer
  // bundled and the tiles ours, there is no key and no Map ID left to resolve.
  const scheme = useMemo(() => mapColorScheme(), []);
  const tileUrls = useMemo(() => mapTileUrls(), []);
  // Still read for `DevMapTuner`, which reports what a Google canvas was built from and is
  // Phase 4's to delete along with the vars themselves.
  const config = useMemo(() => mapsConfig(), []);
  // Absent, never disabled (§2/§11) — and **offline is now its only cause**. It used to also
  // require the three `VITE_GOOGLE_MAPS_*` vars, because without them there was no canvas to
  // draw; there is no build configuration to be missing any more, so a checkout draws a map by
  // existing. Phase 3 takes the last reason away too, at which point the map becomes the part
  // of this tab that works offline best (ADR-0186 §8).
  const hasMap = mapPaneAvailable({ offline });
  const [sheetView, setSheetView] = useState<MapSheetView>(MAP_SHEET_VIEW.half);
  // Row ↔ pin are ONE selection (§8). Not `.nextstop`, whose amber means "the stop
  // you are heading to" — selecting a row must not claim that.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // **Which selected place has been EXPANDED into its research card** (ADR-0167 §11.1). A second
  // id rather than a boolean, so changing the selection cannot leave the expansion behind on a
  // place you are no longer looking at — the state that would otherwise need clearing in the
  // five places `setSelectedId` is called.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** **Did the selection come from this ROW's own tap?** (ADR-0168 §4.)
   *
   *  "Clicking again" means clicking the same thing again, and without this it did not: a
   *  selection can also arrive from a pin, a ring, an arrival or an errand, and treating a
   *  row tap as a second press of something the CANVAS opened would break the one gesture
   *  ADR-0134 §6 exists for — a result's row tap FRAMES it, which is the only way to see a
   *  place you tapped as a ring and then went to the list for.
   *
   *  So a row closes on the next tap only once its own tap is what opened it, which also
   *  makes the ring → row → row sequence read correctly: pan, frame, close. */
  const [openedFromRow, setOpenedFromRow] = useState(false);
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

  // …AND A LIVE QUERY WIDENS THE LIST THE SAME WAY `כל הימים` DOES.
  //
  // Search is global by rule — scope-blind and facet-blind, the Index's rule (ADR-0102) —
  // but only the PREDICATE was: every row still read itself against the strip's day, so a
  // hit from another day resolved no `placeDay` at all and rendered with no day, no time
  // and no meta, filed under `ללא יום`. That is a claim about the place made out of a
  // fact about the scope, and `ללא יום` is a real block with a real meaning (ADR-0109's
  // session-127 amendment) that a mis-scoped row was walking into.
  //
  // So the scope a ROW is read against is not `allDays` but this: the list spans the trip
  // when the user says so **or when a query already made it**. One named fact rather than
  // a `searching` test at each of the three places that ask (the order, the block, and
  // what the row says), because they diverging is the defect itself.
  //
  // It is the LIST that widens, not the tab: the facet counts, `מה נשאר` and the pin
  // numbering keep reading `dayCtx` (the chips are covered by the query field while it is
  // open, and a pin's number must not renumber under a keystroke). And the place CARD is
  // untouched — it has always named the day of anything out of scope through `forceDay`,
  // which is why this defect could be checked on a real device and read as fixed.
  const listSpansTrip = allDays || searching;
  const listCtx = { onDate: listSpansTrip ? undefined : activeDate, nowMs, today };

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
  // Declared up here rather than beside the row helpers that also read it: the list's ORDER
  // needs it now (ADR-0182 §3 — whether a moment is known, not merely clocked), and so do
  // the pins (a place's transition word comes off the event that owns its day). One lookup
  // for all of them is the same reason they share every other derivation.
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const eventLookup = useCallback((id: string) => eventById.get(id), [eventById]);

  // `eventById` is what lets the order ask whether a moment is KNOWN rather than merely
  // clocked (ADR-0182 §3) — so a check-in's floor and a check-out's ceiling sink to the end
  // of the list exactly as they carry no number, instead of sorting among the numbered
  // stops on a time neither can defend. The same lookup `dayStopCtx` hands the sequence,
  // so the list and the card's track cannot order the day differently.
  const orderCtx = { nameOf, ...listCtx, eventById: eventLookup };
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

  // **Which places are connection stops** (ADR-0159), from the same rule the day list
  // draws its bands from — so the pin, the row beneath it and the day's own band say
  // one thing about a place you are only passing through. Keyed by place AND day: an
  // airport you change planes at on the way out is a plain destination on the way home.
  const connectionWordAt = useMemo(() => {
    const words = new Map<string, string>();
    for (const stop of connectionStops(bookings, events, bookingWhen(events))) {
      words.set(
        connectionStopKey(stop.placeId, stop.date),
        t.day.join.word[stop.type] ?? t.day.join.word.flight,
      );
    }
    return (placeId: string, date: string) => words.get(connectionStopKey(placeId, date));
  }, [bookings, events]);

  // ── The pins (ADR-0121 §6) ────────────────────────────────────────────────
  // The number is the index in the scoped day sequence, computed over the whole
  // scoped set with NO clock — so neither a filter, nor near-me, nor the ticking
  // clock can renumber a pin, and this memo is stable across a tick. All-days
  // there is no day to be an index in, so nothing is numbered at all: the row
  // says which day it is in words instead (`relativeDayLabel`, `dayMeta`).
  // `nowMs` is here now and the memo is NOT keyed on it, deliberately (ADR-0121 §6's
  // 2026-08-06 amendment). The stop sequence is clock-free; the clock only picks which of its
  // own stops a twice-visited place shows, which can change at most when a moment passes — so
  // keying the memo on a per-second tick would rebuild it 3,600 times an hour to produce the
  // same map. Read through a latest-ref, the way every other per-second read on this screen is.
  const nowRef = useRef(nowMs);
  nowRef.current = nowMs;
  // Keyed on the MINUTE, which is the granularity the question actually has: a stop's moment
  // passes at a minute boundary, and the app shows no finer time than that anywhere.
  const orderMinute = Math.floor(nowMs / MS_PER_MINUTE);
  // ONE context for both readers of the day's order (ADR-0182 §1). The numbering on the
  // pins and the sequence the card steps through are the same derivation asked twice, so
  // they cannot disagree about what a stop is — which is the failure ADR-0121 §6's
  // 2026-08-06 amendment was written to end, reached from a second direction.
  const dayStopCtx = {
    nameOf,
    onDate: scopedDate,
    eventById: eventLookup,
    // The same lookup the pin's WORD reads (ADR-0159 §6), so a place cannot be a
    // layover in one sentence and two stops in the other.
    isConnectionStop: (placeId: string, date: string) => connectionWordAt(placeId, date) != null,
  };
  const orderIndex = useMemo(
    () => buildPinOrderIndex(dayScoped, { ...dayStopCtx, nowMs: nowRef.current }),
    [dayScoped, scopedDate, placeById, orderMinute],
  );
  /** **The day's stops, in order** — what the card's track steps through (ADR-0182 §1).
   *  Clock-free by construction, so it is NOT keyed on `orderMinute`: a tick must not
   *  reorder a traversal any more than it may renumber a pin. Empty in an all-days scope,
   *  which is why there is no traversal there and nothing to disable (§11). */
  const dayStops = useMemo(
    () => buildDayStopSequence(dayScoped, dayStopCtx),
    [dayScoped, scopedDate, placeById],
  );

  // `planning` withdraws the behind-you tier in Plan mode (ADR-0130 §2): the clock still
  // resolves which day a place is read as, but a day you are arranging has no past — and
  // the pins you can least afford to fade are the ones you came to rearrange. It sits
  // beside `nextStopId`/`nowStopId`, which are Trip-only for the mirror-image reason.
  // One context for both derivations, because they have to agree: the tier says which day
  // the pin is read as, and the mark reports on THAT day (`pinOutcome`'s rule 2). Built in
  // the render body, not memoized — `nowMs` ticks every second, so a memo would rebuild it
  // anyway, and it is only ever read here.
  const pinCtx: PinContext = { onDate: scopedDate, nowMs, today, planning: mode === 'plan' };
  // `planning` withdraws the behind-you tier in Plan mode (ADR-0130 §2): the clock still
  // resolves which day a place is read as, but a day you are arranging has no past — and
  // the pins you can least afford to fade are the ones you came to rearrange. It sits
  // beside `nextStopId`/`nowStopId`, which are Trip-only for the mirror-image reason.
  const pinTier = (usage: PlaceUsage): PinTier => placePinTier(usage, pinCtx);

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
      // Hoisted out of the object because the phase word reads them too: an amber pin's
      // word survives the day scope where every other pin's does not (see `transition`).
      const isNext = nextStopId === usage.placeId && !isAsidePin(tier);
      const isNow = nowStopId === usage.placeId && !isAsidePin(tier);
      // Hoisted for the same reason those two are: the object below reads it once, and a ghost
      // (which draws no fill) has to be able to opt out without asking the resolver twice.
      const pinPhoto =
        tier === PIN_TIER.ghost ? undefined : badgePhoto(place, enrichments[usage.placeId]);
      pinsNow.push({
        placeId: usage.placeId,
        lat: point.lat,
        lng: point.lng,
        hue: usage.pin.category ? CATEGORY_PIN_HUE[usage.pin.category] : 'leisure',
        // A ghost has no fill for a glyph to sit on, so it carries none.
        glyph: tier === PIN_TIER.ghost ? '' : placeGlyph(place, usage.pin.category),
        // **THE SAME PHOTOGRAPH THE ROW'S BADGE CARRIES** (ADR-0167 §16, treatment B) — via the
        // same `badgePhoto`, so §2's "a picked icon beats a fetched photo" cannot hold in the
        // list and not on the canvas. A ghost draws no fill at all, so it draws no photo either.
        // Whether it is DRAWN at this stop is CSS's call (a container query on the pane), which
        // is what keeps a stop change from touching this array.
        photoUrl: pinPhoto && apiAssetUrl(pinPhoto.url),
        tier,
        // WHICH KIND of behind-you it is (ADR-0117 §1 on the canvas). Derived from the
        // SAME context the tier is, so the grey and the mark can never describe two
        // different days — and undefined on every other tier, which is what keeps a ✓ off
        // another day's ghost and out of Plan mode entirely.
        outcome: pinOutcome(usage, pinCtx),
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
        nextStop: isNext,
        nowStop: isNow,
        // WHICH TRANSITION IS NEXT HERE (ADR-0141) — the word the row's own meta line
        // already leads with, so `צ׳ק-אאוט` stops being something only the list knows.
        //
        // THE DAY SCOPE GATES THE NEUTRAL ONE, and it is the screen's call for exactly the
        // reason the number's is (ADR-0121 §6, session 146): all-days there is nothing on
        // the pin saying which day the word belongs to, so two stays from two different
        // days both read `צ׳ק-אין` — the same ambiguity that killed all-days renumbering.
        // The measurement agreed twice over (a trip's worth of edges collides on a phone),
        // but the ambiguity is the argument and the density is only the proof.
        //
        // AN AMBER PIN IS EXEMPT, and not as a courtesy: the ambiguity the gate exists to
        // prevent cannot arise on it. It is by definition the one place that is happening
        // now or next, so there is no question which day its word belongs to — and a live
        // claim is about the clock, never about which day you happen to be looking at.
        //
        // An ASIDE pin is excluded for the reason it carries no amber either: it is not
        // what you are looking at.
        transition:
          (scopedDate || isNext || isNow) && !isAsidePin(tier)
            ? pinTransition(usage, pinCtx, eventLookup, connectionWordAt)
            : undefined,
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
        // In the key for the same reason `aside` is: it is a rendered mark, and a place
        // settled while the tab is open changes nothing else about its pin.
        p.outcome,
        // In the key because it is a rendered class: a promotion that changed the paint
        // but not this string would hand the memo an "equal" array and the markers would
        // keep the old ratio. The pin SET usually changes with the query too, so the bug
        // would have been intermittent rather than absent — the worse kind.
        p.aside,
        p.match,
        p.order,
        // In the key because enrichment ARRIVES while the tab is open — over the WS, on a
        // place you just added (ADR-0166 §17) — and a pin whose photo changed but whose
        // everything else did not would keep the glyph until something else moved.
        p.photoUrl,
        // In the key because it is rendered text: a place settled, rescoped or re-edged
        // while the tab is open changes the tag and nothing else about the pin.
        p.transition,
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
  const select = (placeId: string, opts: { fromRow?: boolean; land?: boolean } = {}) => {
    // **SELECTING SOMETHING ELSE CLOSES THE FORM.** A row tap is a different intent — it names
    // a place — so it is not swallowed and it is not trapped: the form closes and the tap does
    // what it came to do. One gesture, one intent. `closeDraftOnSelect` rather than a call to
    // `cancelDraft` because `select` is declared above the draft state it would reach into.
    closeDraftOnSelect.current();
    setSelectedId(placeId);
    // A new subject starts collapsed — see `clearSelection`'s note: the expansion is a state of
    // the one selected row, not of the screen.
    setExpandedId(null);
    // Which gesture opened it, so the row knows whether the NEXT tap on it is a second press
    // of itself or the first press of a row the canvas opened (ADR-0168 §4).
    setOpenedFromRow(!!opts.fromRow);
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
    // **`fromRow` IS PROVENANCE; `land` IS TREATMENT, and they were one flag doing both.**
    // Everything below — normalise the sheet, frame, scroll the row into view — is "put this
    // place in front of you", which an ARRIVAL from an event/booking/idea wants exactly as much
    // as a row tap does. What it must NOT inherit is the provenance: `openedFromRow` decides
    // whether the next tap on the row CLOSES it, and a place the app put in front of you has not
    // been tapped yet, so the user's first tap must not be read as their second (the reasoning
    // `openedFromRow`'s own comment already spells out, which names arrivals in its list).
    if (opts.fromRow || opts.land) {
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
      // an arrival is spent once and the same row may be tapped twice.
      if (point) setArrival({ at: point, frame: true });
      // AND THE BLOCK IT JUST OPENED IS SCROLLED INTO VIEW (ADR-0135 §8). Selection reveals
      // a way-in block plus its footer under the row, and the block already overflows the
      // `half` sheet on a 360 with two references — 186px against a 153px scroller, as
      // shipped. Without this the footer can open entirely below the fold on the screen
      // ADR-0017 names as the small target, and the action would be the half you cannot see.
      //
      // **The card's TOP, not the minimum movement** (owner, 2026-08-05). §8's `nearest` was
      // reasoned about a row that fits, and this card does not: `nearest` is a no-op once the box
      // spans the whole scrollport, which is why a tall selection appeared to scroll not at all.
      // One helper, one mode — see `showRowInList`.
      showRowInList.current(placeId, ownedResults.get(placeId));
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
    showRowInList.current(placeId, ownedResults.get(placeId));
  };

  /**
   * **Put the selected row's TOP at the top of the list** (owner, 2026-08-05: _"it should auto
   * scroll to the top of the card, it's much better when the card is too big to display fully"_).
   *
   * Three callers: a row or pin tap at a list stop, **leaving the map extreme with something
   * already selected**, and **a row that just grew** (the expansion).
   *
   * **`start`, and this supersedes two earlier choices** — ADR-0135 §8's `nearest` for the
   * selection reveal and the `center` this function shipped with. Both were reasoned about a row
   * that FITS, and the selection card stopped fitting the moment it grew a summary, a hero and a
   * note section:
   *
   *  - **`nearest` is a no-op on a card taller than the scrollport.** Per spec it scrolls the
   *    minimum to bring the box into view, and a box that already spans the whole port needs
   *    nothing — so a tall card produced no scroll at all, which is exactly what was reported.
   *  - **`center` on a card taller than the port centres it**, which puts the identity row —
   *    the name, the badge, the address — ABOVE the fold. You get the middle of a card whose top
   *    you cannot see.
   *  - **`start` is the only one that is correct at every card height**, and it is also the only
   *    one that survives being called mid-transition: the sheet's height animates over
   *    `--t-base`, and aligning the row's top to the scroller's top stays true as the box grows,
   *    where a centred or minimal offset does not.
   *
   * The place's row, WHEREVER it is. Normally that is its trip row; when Google's half is what
   * matched it, the trip list has no row for it and its row is the result row. Two selectors
   * rather than one because the row genuinely moves between two hosts — the same fact the card
   * and the ghost row are both about (ADR-0122 §7).
   *
   * A ref, not a `useCallback`: this screen re-renders every second and every caller wants the
   * latest `sheetRef`, never a closure from an earlier tick (ADR-0121 §4's latest-ref idiom).
   */
  const showRowInList = useRef<(placeId?: string | null, resultId?: string | null) => void>(
    () => {},
  );
  /** The one frame this may have pending. **At most one scroll is ever in flight**, and both
   *  reasons are behavioural rather than tidiness: two transitions in quick succession (tap a row,
   *  then change the stop) would otherwise fire two scrolls, the first aimed at a target the
   *  second has already replaced; and a frame that outlives the screen would scroll a row that is
   *  no longer on it. */
  const pendingScroll = useRef<number | undefined>(undefined);
  useEffect(() => () => cancelAnimationFrame(pendingScroll.current ?? 0), []);
  showRowInList.current = (placeId, resultId) => {
    // Deferred a frame so a row that has just grown is measured at its real height, and so a stop
    // change has committed the sheet's new box before we scroll inside it.
    //
    // **AND IT WAITS FOR A ROW THAT IS NOT THERE YET** (owner, 2026-08-06: _"when clicking on the
    // icon to go to the map, it sometimes doesn't go to the map list row. I can see that it's
    // expanded, but it just doesn't land there."_). One frame is enough when the row is already
    // rendered — which is why it worked most of the time — and it is not when the same gesture
    // widened the list to find it: an arrival from another day calls `setAllDays` and this in one
    // pass, and whether React has committed the wider list by the next frame is a race. So it
    // retries for a bounded handful of frames rather than scrolling to nothing once.
    cancelAnimationFrame(pendingScroll.current ?? 0);
    let framesLeft = ROW_SCROLL_WAIT_FRAMES;
    const findAndScroll = () => {
      // The sheet where there IS one, the document otherwise — because the graceful-absence path
      // renders this list straight into the shell's scrolling body with no sheet at all (§8).
      // Scoping to a null ref there meant a selected card could open below the fold and nothing
      // moved, which is the same defect this function exists for.
      //
      // **That path is reached by being OFFLINE now, and by nothing else** (ADR-0186 §8): a
      // missing Maps key used to be its other cause, and there is no build configuration left to
      // be missing. Worth naming, because the two layouts put this list in different scrollers and
      // `scrollIntoView` acts on whichever one it is in — `e2e/place-know.spec.ts` measured the
      // wrong box for exactly that reason until Phase 2 made the split e2e's default.
      const scope: ParentNode = sheetRef.current ?? document;
      const row =
        (placeId ? scope?.querySelector(`[data-place="${placeId}"]`) : null) ??
        (resultId ? scope?.querySelector(`[data-result="${resultId}"]`) : null);
      // The gap above the card is `scroll-margin-top` on `.place` (map.css), not a number here:
      // it is a property of the row's own box, and CSS is where the sheet's edges already live.
      //
      // **AND IT ANIMATES** (owner, 2026-08-06: _"it's a little confusing when it doesn't do the
      // animation"_ — ADR-0168 §3). The offset was right and the arrival was instant, so the list
      // was simply somewhere else the next frame and nothing said a row had been brought to you.
      // Reduced motion drops the easing and keeps the move, which is this app's one rule about
      // animation everywhere else (ADR-0098 §4) — and `motion.ts` is where that question is
      // answered, never a media query written out again here.
      if (!row) {
        // Not rendered yet — try again next frame, up to the budget. `pendingScroll` still holds
        // at most one frame, so the "one scroll in flight" rule above is unchanged.
        if (framesLeft-- > 0) pendingScroll.current = requestAnimationFrame(findAndScroll);
        return;
      }
      row.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    };
    pendingScroll.current = requestAnimationFrame(findAndScroll);
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
    // **The expansion belongs to the selected row, so it goes with it** (ADR-0168 §4). It was
    // already inert once the row was unselected (`expanded` is `selected && …`), which is why
    // nothing showed — but the id survived, so re-selecting the same place re-opened its
    // research card, and closing a row on purpose now makes that reachable in two taps.
    setExpandedId(null);
    setOpenedFromRow(false);
  }, []);
  // **A SELECTION IS A BACK LAYER, because the canvas already dismisses it** (owner, session
  // 176: _"when there's an implicit way to go back (closing a modal by tapping outside it for
  // example) we should also treat system back as the same"_). Selecting raises the place card
  // and a tap on blank canvas clears it (`onCanvasTap` below is this same function) — so back
  // owed that and was leaving the tab instead, throwing away the screen where the canvas
  // would only have thrown away the selection.
  //
  // Registered on there BEING a selection, which also keeps the ordering honest against this
  // screen's other two layers: a layer joins the stack when it becomes active, so whichever
  // of {selection, query row, errand} you opened last is the one back peels first.
  useBackLayer(
    () => {
      clearSelection();
      return { remainsActive: false };
    },
    selectedId != null || ghostId != null || selectedResultId != null,
  );

  // A RING TAP selects its ROW — and, at the map extreme where there is no row, raises the
  // result's own CARD (`resultCard` below). That is the third occupant ADR-0132 §8 made the
  // stop's return conditional on, built now that the owner has asked for the stop back: the
  // rule is ADR-0122 §7's unchanged, **the row surfaces wherever the sheet cannot show it**,
  // and a Google result at the map stop is simply the third case of it.
  //
  // Same latest-ref shape as `onPinTap`, so `MapPane`'s memo survives the clock tick.
  const onResultTap = useRef<(googlePlaceId: string) => void>(() => {});
  onResultTap.current = (googlePlaceId: string) => {
    // **TAPPING WHAT IS ALREADY SELECTED COMMITS IT** (owner, session 171). Not a double
    // tap and not a gesture: the first tap already means "this one", so the second one on
    // the SAME ring can only mean "yes, that one" — no timing window, no gesture machinery,
    // and it composes with ADR-0134 §3 rather than reversing it, because the first tap still
    // only selects.
    //
    // **AND IT IS NO LONGER ERRAND-SCOPED** (owner, 2026-08-06: _"double clicking on a
    // result ＋ should treat it like you've selected `הוסף למדף`, same way that it does when
    // adding a place to an event/booking"_ — ADR-0168 §5). Session 171 gated it on _"outside
    // an errand there is nothing to commit to"_, and that premise was simply wrong: there is
    // the SHELF, which is where a result's add has always landed. So the gesture is one rule
    // and the CONTEXT picks the destination — `בחירה` under an errand, the shelf without one
    // — which is `landPlace`'s existing branch reached by a second route rather than a
    // second rule beside it.
    //
    // It skips the naming form, deliberately, and that is the whole point of a shortcut: the
    // form is what `＋ אולי` on the row opens (ADR-0147 §4), and `הוספה למדף` is that form's
    // own submit. This is the same landing without the stop in between.
    if (selectedResultId === googlePlaceId) {
      const result = research.predictions.find((r) => r.googlePlaceId === googlePlaceId);
      if (result) void addResult(result);
      return;
    }
    setSelectedId(null);
    setGhostId(null);
    setSelectedResultId(googlePlaceId);
    // The canvas opened this, so the row's own next tap is that row's FIRST press: it frames,
    // and only the one after it closes (ADR-0168 §4).
    setOpenedFromRow(false);
    // A ring is ON the canvas, so tapping it PANS (ADR-0129 §1, unchanged) — the framing
    // below belongs to the result's ROW, which is the tap you make without being able to
    // see the place. `selectResultRow` is that one.
    //
    // Through the one scroll helper, which is where the deferred frame, the single-flight
    // guard and the animated `start` alignment already live: this was a second, quieter copy
    // of that job aligning to `center`, so a ring tap and a pin tap put the same card in two
    // different places (ADR-0168 §3).
    showRowInList.current(null, googlePlaceId);
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
    setOpenedFromRow(true);
    if (result.lat == null || result.lng == null) return;
    setSheetView((view) => (view === MAP_SHEET_VIEW.half ? view : MAP_SHEET_VIEW.half));
    setArrival({ at: { lat: result.lat, lng: result.lng }, frame: true });
  };
  const selectResultRow = useCallback((result: PlaceResult) => onResultRowTap.current(result), []);

  // A ROW ERRAND ENDS WHERE IT STARTED (ADR-0134 §9): close the field, and select the row —
  // which the pick has just turned from a coordless line into a real pin, so `select`'s
  // framing shows you the answer on the canvas you asked the question on. A latest-ref like
  // the taps above, because `select` closes over this render's `ownedResults`/`sheetView`
  // and a `useCallback` would frame against a stale one.
  const finishRowErrand = useRef<(placeId: string) => void>(() => {});
  finishRowErrand.current = (placeId: string) => {
    setRowErrand(null);
    openDisclosure(null);
    select(placeId, { fromRow: true });
  };

  // ── WHERE A NEW PLACE LANDS — ONE COMPOSITION, EVERY SOURCE ────────────────────────
  // FOUR SOURCES, THREE DESTINATIONS, AND THE INVOCATION DECIDES IT (ADR-0131 §11,
  // ADR-0134 §3/§9). Under a ROW errand the pick already did the work — the hook enriched the
  // row in place — so there is nothing to assign and nowhere to return: the tab clears the
  // errand and SELECTS the row, which is now a real pin, so the answer is visible where the
  // question was asked. Under a form errand the place is ASSIGNED and the tab returns, with no
  // `MaybeItem` ("only choosing one place and not adding more and more places"). With no
  // errand it goes to the shelf.
  //
  // **This is the one place that branch is written**, and the reason it is a function rather
  // than three lines repeated per source: a search result's add and a canvas gesture's confirm
  // reach the same three destinations, and a second copy is exactly the parallel-composition
  // defect ADR-0094/0095 exist to undo. A fifth source is a call to this, not a fourth copy.
  //
  // A latest-ref because it reads `rowErrand`/`pendingErrand` and `select` closes over this
  // render's `ownedResults`/`sheetView` — a `useCallback` would frame against a stale one.
  const landPlace = useRef<(placeId: string, idea: AddMaybeOptions & { title: string }) => void>(
    () => {},
  );
  landPlace.current = (placeId, idea) => {
    if (rowErrand) finishRowErrand.current(placeId);
    else if (pendingErrand) finishErrand(placeId);
    else {
      // A `Place` with no reference is cache-only and would not list at all (ADR-0112), so
      // every add must also create one — the uncategorised `MaybeItem` that `＋ אולי` already
      // creates, with its own toast and undo (ADR-0115 §3). The icon and category the form
      // collected ride along on it: `verbs.addMaybe` already takes both, which is why the form
      // can carry a category with no new column.
      const { title, ...opts } = idea;
      verbs.addMaybe(title, { ...opts, placeId });
      select(placeId, { fromRow: true });
    }
  };

  // ADDING A RESULT — one path, whether it was tapped as a row or as a ring. Two steps,
  // both already built: resolve the place (which, for a Text Search result, spends
  // NOTHING — the search already returned the name, the address and the point, so the
  // server skips Place Details, ADR-0132 §7), then land it through the branch above. The row
  // then flips to `כבר בטיול` and the ring disappears on its own: both read the same
  // derivation, so neither needs telling.
  //
  // **Outside an errand this is no longer where a result's add begins** — the `＋ אולי` control
  // opens the form first, so the place arrives with the name and glyph you chose instead of
  // Google's for you to correct later (ADR-0147 §4, amending ADR-0131 §11's "picked → shelf").
  // Under an errand the control is `בחירה`, a different verb answering one question, and it
  // still commits directly: this function is that path.
  // WHAT A HUMAN AUTHORED, WRITTEN ONTO THE PLACE. The name, the glyph and the category are the
  // three user-owned fields on a `Place`, and this is the one write for all of them — rename is
  // this call and nothing else, and the add paths make it when what was typed differs from what
  // Google (or the existing row) already says. Skipped entirely when nothing differs, so an
  // add that accepts the name as offered costs no second request.
  const applyAuthored = useRef<(place: Place, value: MapPlaceFormValue) => Promise<Place>>(
    async (place) => place,
  );
  applyAuthored.current = async (place, value) => {
    const name = value.name === '' ? place.name : value.name;
    const patch = {
      ...(name !== place.name && { name }),
      // **Only a PICK is stored**, never a glyph the category derived: storing a derived one
      // would freeze the place's icon at whatever the category said that day, and it would then
      // shadow the category from then on — the same defect `chosenIcon` exists to undo one
      // layer down. `iconTouched` is the form telling us which it was.
      ...(value.iconTouched && value.icon !== place.icon && { icon: value.icon }),
      // **And the category itself is stored** (ADR-0165), which is what makes the pills a
      // control rather than a decoration: they used to drive the glyph and be dropped here, so
      // a rename whose only act was a category tap wrote NOTHING — no request, no error, no
      // change. Now the place carries its own, so the pin's hue moves with the pills too.
      //
      // **`categoryTouched`, for the same reason `iconTouched` is read one line up:** the pills
      // OPEN on the category the references derived, and writing an untouched seed would stamp
      // that derived value onto the row on any save — a conversion performed by a default nobody
      // touched, which this repo has now fixed twice elsewhere (ADR-0136 §2).
      ...(value.categoryTouched &&
        value.category != null &&
        value.category !== place.category && { category: value.category }),
      // **Absent means the source never offered the field**, which is both add paths — where
      // writing `''` would clear a nickname the place might already carry. An empty string IS
      // a value here: it is how the rename form clears one.
      ...(value.nickname !== undefined &&
        value.nickname !== (place.nickname ?? '') && { nickname: value.nickname }),
    };
    if (Object.keys(patch).length === 0) return place;
    await indexVerbs.updatePlace(place.id, patch);
    return { ...place, ...patch };
  };

  const [addingResultId, setAddingResultId] = useState<string | null>(null);
  const [addResultFailed, setAddResultFailed] = useState(false);
  /** Returns the place it added, so the caller can hang what the human authored on it — the
   *  notes need an id, and this is the one path where the place is obtained rather than made. */
  const addResult = useCallback(
    async (result: PlaceResult, authored?: MapPlaceFormValue): Promise<Place | null> => {
      setAddingResultId(result.googlePlaceId);
      setAddResultFailed(false);
      try {
        const place = await research.pick(result);
        // The name is the user's, so a name they typed is written over Google's — through the
        // same one write rename uses, because it is the same act (ADR-0147).
        const named = authored ? await applyAuthored.current(place, authored) : place;
        landPlace.current(named.id, {
          title: named.name,
          icon: authoredIcon(authored),
          category: authored?.category,
        });
        return named;
      } catch {
        setAddResultFailed(true);
        return null;
      } finally {
        setAddingResultId(null);
      }
    },
    [research.pick],
  );

  // THE RESULT ROW'S TRAILING VERB, whichever host it is in. **Two verbs, and they are not the
  // same act**, which is why this branches rather than always doing one thing:
  //
  //   • `＋ אולי` (no errand) OPENS THE FORM, so a place enters the trip with the name and glyph
  //     you chose rather than Google's for you to correct later. That is a change to shipped
  //     behaviour — ADR-0131 §11's "picked → shelf" — recorded in ADR-0147 §4 rather than
  //     smuggled, and the gain is that all four sources really are one form.
  //   • `בחירה` (under an errand) still commits DIRECTLY: the tab is answering one question, and
  //     a naming form in the middle of choosing a place for a booking is not that question
  //     ("only choosing one place and not adding more and more places", ADR-0134 §3).
  const addOrNameResult = useRef<(result: PlaceResult) => void>(() => {});
  addOrNameResult.current = (result) => {
    if (pendingErrand) void addResult(result);
    else
      openDraft.current(
        { kind: 'result', result },
        // A Text Search result arrives WITH its location (ADR-0132 §7), so there is always
        // something to frame — except for the coordless match our own text found.
        result.lat != null && result.lng != null ? { lat: result.lat, lng: result.lng } : undefined,
      );
  };
  const onResultAdd = useCallback((result: PlaceResult) => addOrNameResult.current(result), []);

  // ── MAKING AND NAMING A PLACE: THREE SOURCES, ONE FORM (ADR-0147) ──────────────────
  // A long press on the canvas · a search result's add · the pencil on a selected row. **They
  // are one act — a place's NAME is the user's** — and they differ only in how the `Place` is
  // obtained, which is exactly what `MapDraft`'s discriminant names. Everything after that is
  // shared: one form, one authored write, one destination branch.
  //
  // A fourth shipped and was removed: a tap on one of Google's own sights opened this form, and
  // a form on every POI tap is noise (ADR-0148 §6). Google's own card answers that tap, which is
  // ADR-0125 §6 unamended — and it took the phase's only paid gesture with it.
  type MapDraft =
    /** 6b. A bare coordinate and nothing else: no name, no `place_id`, no reverse geocode
     *  (paid, and refused — ADR-0131 §9). The name is typed. */
    | { kind: 'drop'; at: LatLng }
    /** A Text Search result's `＋ אולי`. Free to resolve (the search already returned the name,
     *  the address and the point, ADR-0132 §7), and prefilled, so the form is only a chance to
     *  correct the label before it enters the trip. */
    | { kind: 'result'; result: PlaceResult }
    /** A place the trip already has, reached by the pencil on its selected row. */
    | { kind: 'rename'; place: Place };

  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  // The form's value, MIRRORED so the canvas can draw it — the marker under a dropped pin
  // carries the category's hue, and the category lives in the form. The form stays the owner
  // and reports (`onValueChange`); this is a copy for rendering, never a second source.
  const [draftLook, setDraftLook] = useState<{ icon: string; category?: EventCategory }>({
    icon: DEFAULT_PLACE_ICON,
  });

  // **A TAP OUTSIDE THE FORM CLOSES IT — the same function every other way out runs.**
  // `frontend/CLAUDE.md` is explicit: a cancel control, a backdrop or outside tap, Escape and
  // the Android gesture must all run one handler, and the shipped form bound three of the four.
  //
  // The canvas tap IS the outside tap, so there is no backdrop to add: it already means "I am
  // done with what was selected" and it is already the place card's own dismissal (ADR-0122 §7).
  // No scrim either — a scrim would say the map is disabled, and the map is the thing you are
  // naming a point on, so you must be able to see it.
  //
  // A latest-ref because `cancelDraft` is declared below with the draft state it owns.
  const dismissAll = useRef<() => void>(() => {});
  /** Just the form, for a gesture that means something else and must still go through (a row
   *  tap). Distinct from `dismissAll`, which is the OUTSIDE tap and clears the selection too. */
  const closeDraftOnSelect = useRef<() => void>(() => {});
  const onOutsideTap = useCallback(() => dismissAll.current(), []);

  // ── WHAT THE CARD IS OCCUPYING, **MEASURED** (ADR-0148 §3) ─────────────────────────
  // `mapFitPadding`'s `bottomReservePx` is what keeps a fit from putting a pin under the
  // card, and its own comment says it must be "a live number rather than a constant because
  // the card comes and goes on a tap". The caller passed `MAP_CARD_RESERVE_H` — a constant
  // sized for a selected `.place` row — and the form is nearly twice that, so the pin you had
  // just dropped landed **behind the form naming it**.
  //
  // **That is the fourth time this repo has written a landing position as a constant** (the
  // three in `frontend/CLAUDE.md`: ADR-0142's card top, ADR-0143's stamp offset, the trip
  // handoff's target). So it is measured, and measured for BOTH cards rather than special-
  // cased for the form — one number, from the element that is actually there.
  //
  // Safe to measure here, and the distinction matters: this feeds the camera through a
  // latest-**ref** (`bottomReserveRef`), never `--sheet-h`, so it cannot put a layout read on
  // the per-second render — which is the constraint `MAP_CARD_BODY_H`'s comment was about.
  // The iOS half of the visibility fix — see `useKeyboardInset`. 0 wherever the platform
  // resized the viewport for the keyboard, which is every case the layout already handled.
  const keyboardInset = useKeyboardInset();
  const cardRef = useRef<HTMLDivElement>(null);
  /** **The card's band, read from the DOM at the moment it is asked for** — the camera's
   *  source of truth, and it goes nowhere near React state.
   *
   *  **A LAYOUT EFFECT WAS NOT ENOUGH, and the experiment says so** (2026-08-06; owner:
   *  _"Not panning in full map when clicking on a pin"_, on a build that had the layout-effect
   *  fix). ADR-0128 §2's amendment reasoned that layout effects all precede passive ones, so a
   *  measurement committed here would be visible to `MapPane`'s pan. It is not: setting state
   *  from a layout effect schedules a **synchronous re-render**, and React flushes the pending
   *  passive effects of the commit that is already done **before** starting it. So the child's
   *  pan still runs against the value from the previous render — 0 on the tap that first raises
   *  a card. Reproduced in isolation (a parent measuring in `useLayoutEffect`, a memoized child
   *  storing the prop in a ref during render and reading it in an effect keyed on the
   *  selection): the child sees `0`, every time.
   *
   *  A **reading taken when the camera moves** cannot have this bug under any ordering, which
   *  is the same lesson `frontend/CLAUDE.md` already records three times over as "a landing
   *  position written as a constant instead of measured". It costs one
   *  `getBoundingClientRect` per camera move — moves are rare, and this is emphatically not on
   *  the per-second render. */
  const readCardReserve = useCallback(
    () => {
      const box = cardRef.current?.getBoundingClientRect().height ?? 0;
      return box > 0 ? Math.ceil(box) + MAP_ATTRIBUTION_H + MAP_FLOAT_GAP : 0;
    },
    // Stable for the life of the screen, which `MapPane`'s memo depends on (§4/§6).
    [],
  );
  /** The same number as STATE, and it has a different job: it is the **signal** that the card
   *  came up or changed size, which is what the reveal effect is keyed on. Lagging a commit
   *  behind the reading above is harmless for a trigger and fatal for a measurement — so the
   *  two are deliberately separate rather than one value doing both. */
  const [cardReserve, setCardReserve] = useState(0);
  const measureCardReserve = useRef<() => void>(() => {});
  measureCardReserve.current = () => setCardReserve(readCardReserve());
  // **A LAYOUT EFFECT, AND THE CAMERA IS WHY** (ADR-0128 §2's 2026-08-06 amendment). This used to
  // be a passive `useEffect`, and passive effects run in tree order — CHILD first — so `MapPane`'s
  // own focus effect panned for a selection while this measurement still described the card that
  // was up BEFORE it. Usually 0. So the pan that most needed to clear a card was the one pan that
  // could not see one, and the offset would have been silently dead on the very gesture it exists
  // for.
  //
  // Layout effects all run before any passive effect, so measuring here means the reserve is
  // committed by the time the child pans. That is what `useLayoutEffect` is for — a measurement
  // another effect reads — and it costs nothing new: the read is one `getBoundingClientRect` on one
  // element, and this effect already ran on every render (it has no dependency array, deliberately:
  // the card's height is content, not a value we could list).
  useLayoutEffect(() => {
    measureCardReserve.current();
    // The card's height changes with its content — a hint line appears, an error shows, the
    // bounded form is capped by a stop change — so it is re-measured rather than read once.
    // The one-shot read above is the part correctness depends on; the observer keeps it true.
    // `observeResize` owns the jsdom guard the three copies of this each carried (rule 8).
    return observeResize(cardRef.current, () => measureCardReserve.current());
  });

  /** The stop the sheet was at when the form opened, so closing it gives that back. This is
   *  what makes normalising a DEFERRAL rather than a loss — ADR-0147 rejected standing the
   *  sheet down because "it takes away the list you were reading", and it no longer does. */
  const stopBeforeDraft = useRef<MapSheetView | null>(null);

  const openDraft = useRef<(next: MapDraft, frameAt?: LatLng) => void>(() => {});
  openDraft.current = (next, frameAt) => {
    // **EXACTLY ONE CARD ON THIS CANVAS** (ADR-0125 §6, ADR-0122 §7). A canvas gesture lands
    // on something that is not ours, so it replaces the selection outright — which is also
    // what every map app does when you tap something else. The other two sources are ABOUT
    // what is selected (a row's pencil, a result's add), so they keep it: the row stays lit
    // and the ring stays filled under the form. The card slot is kept single by gating the
    // other two cards on `!draft` instead, which says it where it is true.
    if (next.kind === 'drop') clearSelection();
    setDraft(next);
    setDraftFailed(false);
    setDraftLook({
      icon: placeGlyph({ icon: next.kind === 'rename' ? next.place.icon : undefined }, undefined),
    });
    // **THE FORM IMPLIES THE `map` STOP, FROM EVERY ORIGIN** (ADR-0148 §2). Not "when the room
    // is short": always, so standing the sheet down stops being a special behaviour of the
    // form and becomes the same act as tapping `רשימה / מפה`. It is also a CORRECTION rather
    // than an optimisation — at `full` the card's room is negative by construction, so the
    // pencil on a row up there used to open a form that could not be drawn at all.
    if (sheetView !== MAP_SHEET_VIEW.map) stopBeforeDraft.current = sheetView;
    setSheetView(MAP_SHEET_VIEW.map);
    // **AND THE PIN MUST BE VISIBLE, NOT MERELY CENTRED** (§3). Deferred a frame for two
    // reasons that need the same wait: the split has just been given the sheet's height back,
    // and the card has not been laid out yet — so framing now would fit against a canvas that
    // no longer exists and reserve a card height nobody has measured. `requestAnimationFrame`
    // is this screen's existing idiom for exactly that (`onResultTap`'s scroll).
    //
    // **AND A LONG PRESS PANS, IT DOES NOT ZOOM** (owner, on a phone: _"when long clicking to
    // add a new place it zooms in and pans to it — in these cases I don't want a zoom"_). This
    // is ADR-0129 §1's rule reaching the case that needs it most: a drop names a PIXEL you are
    // looking at, so being zoomed for it is the same "inconvenient" that rule took off a pin
    // tap. The pan stays, because it is what clears the pin from under the form. The other two
    // sources still frame — a row's place may be off screen, or not drawn at all.
    if (frameAt) {
      const at = { ...frameAt };
      const frame = next.kind !== 'drop';
      requestAnimationFrame(() => {
        measureCardReserve.current();
        setArrival({ at, frame });
      });
    }
  };

  // **ONE DERIVATION, ONE PUSH** (ADR-0148). Both of this tab's keyboard-bearing surfaces
  // want the header and the tab bar off screen, and the shell must not learn which — so the
  // screen ORs its own two states here rather than the shell doing it at the read site.
  //
  // The form's trigger is deliberately **the form being open**, not the keyboard literally.
  // Tapping a category pill takes focus off the name field, so the keyboard drops — and a
  // keyboard-literal trigger would pop the chrome back, re-lay-out the card, and remove it
  // again on the next touch of the field. That is the "form breathes" failure already
  // rejected for the pills themselves, moved up to the shell where it is worse. Holding it
  // for the form's whole life CONTAINS "while the keyboard is up" and never flickers — and it
  // costs nothing when the keyboard is down, because at the `map` stop the form needs 243px
  // and has 372 with the chrome off.
  useEffect(() => {
    setChromeReclaimed(queryFieldOpen || draft != null);
    // Leaving the tab must give the chrome back, since the state outlives this screen.
    return () => setChromeReclaimed(false);
  }, [queryFieldOpen, draft, setChromeReclaimed]);

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setDraftFailed(false);
    // The sheet goes back to the stop it came from: nothing was taken, only deferred.
    if (stopBeforeDraft.current) setSheetView(stopBeforeDraft.current);
    stopBeforeDraft.current = null;
  }, []);

  // The one handler, now that both halves exist. Order matters only in that the form is the
  // nearer surface: closing it also restores the stop it deferred.
  dismissAll.current = () => {
    if (draft) cancelDraft();
    clearSelection();
  };
  closeDraftOnSelect.current = () => {
    // A RENAME is about the row you are selecting, so re-selecting must not close its own form
    // out from under it — that is `beginRename` → `select` in one gesture.
    if (draft && draft.kind !== 'rename') cancelDraft();
  };

  // **BACK CLOSES THE FORM.** It is a state this mounted screen enters and leaves with a
  // visible cancel, which is the shape `frontend/CLAUDE.md` names as needing a deliberate
  // layer: without one, a system back would leave the tab and throw away what was typed, while
  // the ✕ two pixels away only closed the card. Gated on the form being up, so the
  // `IconPicker`'s own layer (gated on its panel) lands above and back peels the panel first.
  useBackLayer(() => {
    cancelDraft();
    return { remainsActive: false };
  }, draft != null);

  // **The expansion is a state this mounted screen enters and leaves, so it owes the back stack a
  // layer** (ADR-0103; `frontend/CLAUDE.md` names this exact shape). The screen never unmounts, so
  // it cannot express "there is something to peel" by existing — and there IS something: a visible
  // `‹ חזרה לפרטי המקום`. Without this, a system back on the research card would deselect the
  // place or leave the tab while that control sat on screen, which is precisely how the Map's
  // disclosure row broke once. Gated on the state, so it lands ABOVE the selection's own layer and
  // back peels the expansion first.
  useBackLayer(() => {
    setExpandedId(null);
    // The place stays selected: collapsing returns you to its itinerary detail, which is what
    // the control it mirrors says it does.
    return { remainsActive: false };
  }, expandedId != null);

  // **AN EXPANDED CARD BRINGS ITS OWN BOTTOM INTO VIEW** (owner, 2026-08-05: _"Still cutoff when
  // opening to half map half list"_, with the way back and `עוד בגוגל` under the tab bar).
  //
  // Expanding adds a 130px hero, a credit and the whole summary — some 300px — to a row inside a
  // scroller that at `half` is about 380px tall. The reveal on SELECTION already had this problem
  // and ADR-0135 §8 answered it (`nearest`, deferred a frame, "the action would be the half you
  // cannot see"); the mode change is a bigger version of the same growth and inherited none of it.
  //
  // `nearest` rather than `center`: the row is on screen — you just tapped inside it — so the job
  // is to bring what appeared BELOW it into view and nothing else. At the `map` stop the expansion
  // happens on the canvas card, which is not in this scroller at all, so the query finds nothing
  // and this is a no-op there (the card is bounded and scrolls itself, `map.css`).
  useEffect(() => {
    if (!expandedId) return;
    showRowInList.current(expandedId);
  }, [expandedId]);

  // **LEAVING THE MAP EXTREME BRINGS THE SELECTION WITH YOU** (owner, 2026-08-05, with a
  // screenshot of the selected card opening below the fold).
  //
  // A selection made at the `map` stop cannot scroll anything — there is no list on screen, which
  // is why `select` returns early there and why the tapped place surfaces as a card on the canvas
  // instead (ADR-0122 §7). Switching to `רשימה` then showed the list at whatever offset it was
  // left at, with the selected row — the one thing you were looking at, now carrying a summary, a
  // note section and a footer — wherever it happened to be, often clipped by the tab bar.
  //
  // Keyed on the STOP, so it fires on the toggle, on a drag that lands at a new stop, and on the
  // `liftToList` normalisation — everything that puts the list on screen — and not on the
  // selection itself, which `select` already handles at the stop where it can.
  useEffect(() => {
    if (sheetView === MAP_SHEET_VIEW.map) return;
    if (!selectedId && !selectedResultId) return;
    showRowInList.current(selectedId, selectedResultId);
    // The STOP is the trigger and the only dep on purpose: a change of SELECTION is `select`'s
    // own job (it centres, or normalises the sheet first), and re-running here on it would
    // scroll the same row twice — the second time with `center`, undoing the `nearest` a row
    // tap deliberately chose so it would not shove the row you are looking at.
  }, [sheetView]);

  // The full picture, one level below the expanded card (ADR-0167 §11.1). The viewer registers
  // its own layer, so back peels the picture, then the expansion, then the selection.
  //
  // **The picture itself, not a place id.** It used to be a `placeId` resolved against
  // `enrichments`, which cannot name the second surface that now has a hero: a Google result nobody
  // has added has no `placeId` and no snapshot row (ADR-0166 §17). Both hosts hand over what the
  // viewer actually needs — a title and an image — so neither has to be looked up.
  const [fullPicture, setFullPicture] = useState<{
    title: string;
    image: DeliveredImageValue;
  } | null>(null);

  // ── WHAT WE KNOW ABOUT A PLACE WE HAVE NOT ADDED (ADR-0166 §17) ─────────────────────
  // **The tapped result, and only it.** A search returns several candidates and most of them
  // nobody keeps, so enriching the list would spend Wikimedia's patience on places no one looked
  // at; a tap already means "this one" (owner's call, 2026-08-05). A result the trip ALREADY owns
  // asks nothing: its enrichment is in the snapshot, keyed by its own `placeId`, and the card that
  // shows is our place's rather than this row.
  const selectedCandidate =
    selectedResultId != null
      ? research.predictions.find(
          (r) => r.googlePlaceId === selectedResultId && !research.alreadyInTrip(r),
        )
      : undefined;
  const candidateFields = useCandidateEnrichment({
    tripId: trip.id,
    candidate: selectedCandidate,
    offline,
  });
  // Resolved ONCE for both hosts — the sheet's row and the canvas card are the same row in two
  // places (ADR-0122 §7), so they must not resolve the same answer twice.
  const candidateKnowledge = {
    image: candidateFields?.image,
    summary: placeSummary(candidateFields),
  };
  const showCandidatePicture = () => {
    if (candidateKnowledge.image && selectedCandidate) {
      setFullPicture({ title: selectedCandidate.primaryText, image: candidateKnowledge.image });
    }
  };

  // The three props `MapPane` takes, `useCallback(…, [])` over the latest-ref above. The pane
  // is memoized and this screen re-renders every second, so a fresh identity here re-diffs
  // every marker — the anti-pattern `frontend/CLAUDE.md` lists as already fixed once.
  // **Neither gesture needs an offline guard:** `hasMap` already withholds the whole pane, so
  // they are absent rather than disabled (ADR-0121 §11).
  // **One gesture, two objects** (ADR-0157 §2). A hold on blank canvas makes a place there;
  // a hold ON a place opens that place's menu instead — never both, and never a new place
  // dropped on top of an existing one, which is what the gesture did before the pane learned
  // to report what the finger was on.
  const holdCanvas = useCallback((at: LatLng, placeId?: string) => {
    if (placeId) openPinMenu.current(placeId);
    else openDraft.current({ kind: 'drop', at }, at);
  }, []);

  // The pencil (ADR-0147 §3). Any place is renameable — including one Google named — because
  // otherwise the same row would be editable or not depending on where it came from, and the
  // backend has preserved a user-authored name over Google's since long before there was a way
  // to type one.
  const beginRename = useRef<(placeId: string) => void>(() => {});
  beginRename.current = (placeId) => {
    const place = placeById.get(placeId);
    // Framed like every other source (§3): the pencil can be tapped from a row you cannot
    // see the pin of — at `full` you cannot see the canvas at all — so the place you are
    // renaming has to come into view with its form. A coordless Place-lite frames nothing,
    // exactly as its row's tap does.
    if (place) openDraft.current({ kind: 'rename', place }, placePoint(place));
  };

  // The confirm. Every source ends in the same two steps — **obtain the place, then write what
  // the human authored onto it** — and every ADD then ends in the one destination branch
  // (`landPlace`). Which of the four it was decides only the first step.
  const commitDraft = useRef<(value: MapPlaceFormValue) => void>(() => {});
  commitDraft.current = async (value) => {
    if (!draft || savingDraft) return;
    setSavingDraft(true);
    setDraftFailed(false);
    // **The notes, after their host and inside the same change group** (ADR-0152 §6b). Ordering
    // is the whole reason this is a step of its own: offline the outbox is FIFO, so a note
    // queued after its place still finds its host on the server, and a note queued before it
    // would be refused. Nothing waits on a network round trip — a place's id is
    // client-generated on the drop path and already in hand on the other two.
    const writeNotes = (placeId: string) =>
      value.notes.length === 0
        ? undefined
        : withChangeGroup(async () => {
            for (const body of value.notes) await noteVerbs.createNote({ body, placeId });
          });
    try {
      if (draft.kind === 'result') {
        // Its own path because the resolve is the research hook's (free, and it owns the
        // row's busy/failed state), but it lands through the same branch as everything else.
        const added = await addResult(draft.result, value);
        if (added) {
          await writeNotes(added.id);
          cancelDraft();
        } else setDraftFailed(true);
        return;
      }
      if (draft.kind === 'rename') {
        // No landing: the place is already in the trip, so there is nothing to reference and
        // nowhere to return. Renaming is `applyAuthored` and nothing else.
        await applyAuthored.current(draft.place, value);
        await writeNotes(draft.place.id);
        cancelDraft();
        return;
      }
      // A dropped pin, and it is FREE: no session, no Details, no reverse geocode (ADR-0147
      // §3). The name, the icon and the category ride along on the create, so it never exists
      // un-authored and there is nothing to write over afterwards.
      const placeId = await indexVerbs.createPlace({
        name: value.name,
        lat: draft.at.lat,
        lng: draft.at.lng,
        icon: value.iconTouched ? value.icon : undefined,
        category: value.category,
      });
      await writeNotes(placeId);
      cancelDraft();
      landPlace.current(placeId, {
        title: value.name,
        icon: authoredIcon(value),
        category: value.category,
      });
    } catch {
      setDraftFailed(true);
    } finally {
      setSavingDraft(false);
    }
  };

  // ── THE SPOT THE OPEN FORM IS ABOUT (ADR-0147 §5) ─────────────────────────────
  // **Only the long press needs one.** It lands on bare canvas, so nothing else says where it
  // went: OUR pin, dashed because it is provisional (ADR-0011's soft grammar reused rather than
  // a new colour), in the hue the form's category pills are choosing. The other two need nothing
  // — a renamed place has its own selected pin, and a search result is already a ring in
  // `results` above — so a second marker on either would say the same thing twice.
  const draftMarkerNow: MapDraftMarker | null =
    hasMap && draft?.kind === 'drop'
      ? {
          ...draft.at,
          hue: draftLook.category ? CATEGORY_PIN_HUE[draftLook.category] : 'leisure',
          glyph: draftLook.icon,
        }
      : null;
  // The same content-key memo as `pins`/`results`, and needed for the same reason: an inline
  // `{ lat, lng }` in the JSX undoes the pane's memo silently (§4/§6).
  const draftMarkerKey = draftMarkerNow
    ? [draftMarkerNow.lat, draftMarkerNow.lng, draftMarkerNow.hue, draftMarkerNow.glyph].join('|')
    : '';
  const draftMarker = useMemo(() => draftMarkerNow, [draftMarkerKey]);

  // A pin tap, behind a stable identity. `MapPane` is memoized, so a handler
  // re-created every render would break the memo and re-diff every marker once a
  // second — which is exactly what §4/§6 forbid. The latest-ref keeps the callback
  // stable while its body still sees this render's state.
  const onPinTap = useRef<(placeId: string) => void>(() => {});
  onPinTap.current = (placeId: string) => {
    // The same "tap what is already selected to commit it" the rings take (session 171) —
    // the owner's `＋ or existing`, so both populations answer a second tap the same way.
    // It composes with ADR-0134 §3 rather than reversing it: the FIRST tap still only
    // selects, so you still look before you commit.
    if (errandTakesOurPlaces && selectedId === placeId) {
      finishErrand(placeId);
      return;
    }
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
  // Somewhere the camera has been asked to GO, and whether that may zoom (`MapArrival`).
  // `frame: true` is the two intents that mean "take me to this one" (ADR-0129 §1): an
  // arrival from `מפה`, and the place card's badge. Held in state rather than read from
  // `focusPlaceId`, which is consumed in this same pass: the camera may not be sized for
  // several more, and dropping the focus in between is exactly what made an arrival land
  // on the day's frame. The camera spends it once, and a fresh object each time is what
  // lets the same place be asked for again on a second tap.
  const [arrival, setArrival] = useState<MapArrival | null>(null);
  const frameSelected = useCallback(() => {
    const point = selectedId ? placePoint(placeById.get(selectedId) ?? {}) : null;
    if (point) setArrival({ at: point, frame: true });
  }, [selectedId, placeById]);
  // **AND IT LANDS THE SAME WAY A ROW TAP DOES** (owner, 2026-08-06). It used to set the
  // selection and the arrival by hand, which framed the camera and then left the list wherever
  // it was — so a place you reached from an event, a booking or the shelf was selected somewhere
  // below the fold, with nothing saying a row had been brought to you. The scroll was never a
  // decision anyone made against; it simply was not on this path, because this path had grown its
  // own half-copy of `select` (rule 8, in the small).
  //
  // **It opens at `half` rather than at the map extreme, and that is a measured call, not the
  // status quo winning.** The tab unmounts on leave, so `half` is where an arrival already
  // landed; what makes it right is that the CARD costs more canvas than the sheet does. Clear
  // map is `0.44S − 54` at `half` against `S − 136 − card` at the map extreme, so the extreme
  // only wins while the card is under `0.56S − 82` — about 265px on a 620px split, where the
  // reported card measured **336**. A place worth arriving at is exactly the one carrying the
  // references, the summary and the notes that make its card heavy, so the extreme loses on the
  // very places this path serves. Two supporting reasons: the row is the real object and the
  // card is its stand-in where a list cannot be shown (ADR-0122 §7), and "I picked a place, show
  // me" should not have two behaviours depending on which screen picked it.
  const landOnPlace = useRef<(placeId: string) => void>(() => {});
  landOnPlace.current = (placeId) => select(placeId, { land: true });
  useEffect(() => {
    if (!focusPlaceId) return;
    const usage = usageIndex.get(focusPlaceId);
    // Widen FIRST: day-scoped, the row this is about to scroll to would not be in the list at
    // all, and the deferred frame `showRowInList` waits is what lets the widened list commit.
    if (usage && !usage.days.some((d) => d.date === activeDate)) setAllDays(true);
    landOnPlace.current(focusPlaceId);
    clearFocus();
  }, [focusPlaceId, usageIndex, activeDate, setAllDays, clearFocus]);

  // The shelf's tail arriving (ADR-0116 session-202 §5). It turns on the `אולי`
  // facet and nothing else: the day scope rode in on `?day=`, and the tail was
  // ranked against that day, so widening here would answer a wider question than
  // the strip asked. Consumed once, so a later visit to the tab is not still
  // filtered by a tap from three screens ago.
  useEffect(() => {
    if (maybesFacet.take()) setMaybesOnly(true);
  }, [maybesFacet]);

  // ── The row's meta line: `<time> · <what happens here>` (ADR-0109 §1) ──────
  // It replaces the address, which said nothing about why the place is on the list
  // (the shipped row read "Dimitras, Nicosia, Lefkosia 2058" — true and useless).
  // The time renders in the EVENT's own zone (ADR-0107), and each end of a booking
  // gets its own: a departure in its origin, an arrival in its destination.
  const zoneCtx = useMemo(() => liveZoneContext(nowMs, zoneEvidence), [nowMs, zoneEvidence]);

  // A row rendered OUT of the day scope — a surfaced ghost, the canvas place card —
  // reads in all-days grammar, so it drops the scope everywhere that scope is asked
  // for: its day, its outcome, AND its references. Threading it into two of the three
  // was the bug: a ghost's references are by definition on another day, so
  // `refEntriesFor` filtered every one of them out and the way-in block §8 promised
  // came back empty on exactly the rows that have no other way in.
  const metaCtx = (opts: { forceDay?: boolean }) => ({
    onDate: opts.forceDay ? undefined : listCtx.onDate,
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
    const day = listSpansTrip || opts.forceDay ? relativeDayLabel(usageDay.date, today) : undefined;
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
      // A connection stop says so instead (ADR-0159): the pin above this row would
      // otherwise read `עצירת ביניים` while the row read `נחיתה`, which is the exact
      // disagreement ADR-0141 removed between the two.
      what:
        connectionWordAt(usage.placeId, usageDay.date) ??
        eventEdgeTransition(event, usageDay.edge) ??
        shortTitleText(event.title),
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
  //
  // **ONE ENTRY PER REFERENCE**, which is §8's own wording rather than a new rule
  // (amended 2026-08-05, on the owner's report of a place viewer with too many
  // lines). A booking-linked reference was drawing TWO rows carrying the SAME label,
  // told apart only by the leading word — so half of a hub place's block was a copy
  // of the other half, and Ben Gurion with three legs read as six rows of three
  // facts. The row now goes to whatever HOLDS the reference's detail: the booking
  // when there is one (the code, the documents, the notes), the day otherwise. The
  // event's half is not lost with its row — its clock is on the entry's own meta line
  // and its outcome is the settle pair beside it (ADR-0139 §1), which is everything
  // that second row could do except leave the tab.
  const refEntriesFor = (usage: PlaceUsage, opts: { forceDay?: boolean } = {}): RefEntry[] => {
    const { onDate } = metaCtx(opts);
    const goToDay = (date: string) => {
      const target = daySelectTarget(date, today, 'days');
      navigate(target.to, { replace: target.replace });
    };
    // Which day only matters when the block spans several — day-scoped, the strip
    // already names it and `היום ·` on every entry is noise. A reference with no day
    // at all says so in either scope: inside a scoped block, silence would read as
    // "on this day".
    const dayLabel = (date: string | undefined): string | undefined =>
      date == null ? t.map.noDay : onDate != null ? undefined : relativeDayLabel(date, today);

    const entries = placeRefs(usage.placeId, { events, bookings, maybeItems }, { onDate }).map(
      (ref): Omit<RefEntry, 'rank'> => {
        const event = ref.eventId ? eventById.get(ref.eventId) : undefined;
        const booking = ref.bookingId ? bookings.find((b) => b.id === ref.bookingId) : undefined;
        if (ref.kind === PLACE_REF_KIND.idea) {
          // The shelf, which both day surfaces render (Trip's day view and Plan's
          // builder), so this needs no mode switch. Labelled with the idea's OWN name:
          // two ideas on one place are two intentions (`soleIdeaFor` turns on exactly
          // that) and the entry used to read `על המדף · <day>` for both of them.
          const idea = maybeItems.find((m) => m.id === ref.maybeId);
          return {
            key: ref.key,
            kind: t.map.refs.idea,
            label: idea?.title || t.map.shelfTag,
            day: dayLabel(ref.date),
            onOpen: () => goToDay(ref.date ?? today),
          };
        }
        const title = event ? shortTitleText(event.title) : (booking?.title ?? '');
        const edgeWord = event && ref.edge ? eventEdgeTransition(event, ref.edge) : undefined;
        // The time renders in the reference's own zone, each end of a bracketed booking
        // in its own — the same resolution the row's meta line makes one line up.
        const zones = event && eventZones(event, zoneCtx);
        const zone = zones && (ref.edge === 'end' ? zones.endZone : zones.startZone);
        const settled =
          event?.status === EVENT_STATUS.DONE
            ? ('done' as const)
            : event?.status === EVENT_STATUS.SKIPPED
              ? ('skipped' as const)
              : undefined;
        // The emphasis is the CLOCK's question, asked only of a day that has passed with
        // nothing said about it — the same `isDayUsagePast` the tier, the block header and
        // `מה נשאר` all read, so the four cannot disagree about whether a day is closed.
        const usageDay = usage.days.find((d) => d.date === (ref.date ?? event?.date));
        return {
          key: ref.key,
          // The booking leads when there is one: it is what a traveller standing at the
          // place wants first, and it is `PlaceRef.kind`'s own answer rather than a
          // second opinion about which entity names this reference.
          kind: booking ? t.map.refs.booking : t.map.refs.event,
          label: [title, edgeWord].filter(Boolean).join(` ${DOT_SEPARATOR} `),
          day: dayLabel(ref.date),
          time: ref.at != null && zone ? formatTime(new Date(ref.at), zone) : undefined,
          at: ref.at,
          onOpen: booking
            ? () => setDetailBooking(booking)
            : () => goToDay(ref.date ?? event?.date ?? today),
          settle: event && {
            outcome: settled,
            asking: !settled && !!usageDay && isDayUsagePast(usageDay, nowMs, today),
            onDone: () => verbs.done(event),
            onSkip: () => verbs.skip(event),
            onUndo: () => verbs.restore(event),
          },
        };
      },
    );

    // **WHICH ONES SURVIVE THE FOLD** (`PLACE_REFS_CAP`), and it is a different order from
    // the one they are drawn in. Chronological is right for READING a place's history, and
    // wrong for choosing what to keep: on an airport the trip's first flight is the least
    // useful row on the last day. So an open question leads — a passed day nobody answered
    // is the one entry that cannot be acted on once it is folded away — then whatever is
    // nearest to now, in either direction.
    const rank = new Map<string, number>();
    entries
      .map((entry, i) => ({ entry, i }))
      .sort((a, b) => {
        const asking = Number(!!b.entry.settle?.asking) - Number(!!a.entry.settle?.asking);
        if (asking !== 0) return asking;
        const distance = (entry: Omit<RefEntry, 'rank'>) =>
          entry.at == null ? Infinity : Math.abs(entry.at - nowMs);
        const [da, db] = [distance(a.entry), distance(b.entry)];
        return da === db ? a.i - b.i : da - db;
      })
      .forEach(({ entry }, r) => rank.set(entry.key, r));
    return entries.map((entry) => ({ ...entry, rank: rank.get(entry.key) ?? 0 }));
  };

  // Built once per note-list change rather than filtered per row: this list can be the whole
  // trip's places, and the mark is on every row that has one (ADR-0152 §6c).
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);
  // Its twin for attachments (ADR-0174 §1), built once per link-list change.
  const docCounts = useMemo(
    () => attachmentCountsByHost(documentAttachments),
    [documentAttachments],
  );

  const renderRow =
    (opts: {
      onSelect?: (placeId: string) => void;
      /** The other reading of the same tap (ADR-0168 §4). Passed by whoever passes
       *  `onSelect`, and absent on the canvas card for the same reason `onSelect` is. */
      onDeselect?: () => void;
      forceDay?: boolean;
      onFrame?: () => void;
      onChoose?: (placeId: string) => void;
      /** **Render at the selected density even when this row is not the selection**
       *  (ADR-0182's density amendment). The two were one fact until the card became a
       *  track: everything below is gated on `selected` because the LIST can hold the
       *  whole trip and a note section per row is a section nobody is looking at — a
       *  reason about cost, not about selection. A track holds three slides and wants
       *  them all at one density with exactly one selection, so the two questions come
       *  apart here and nowhere else. Defaults to `selected`, so every existing caller
       *  is unchanged. */
      revealed?: boolean;
      /** The centring ref, on the slide that is the current selection — see
       *  `useCenterSelected`. Absent everywhere else, including the list. */
      slideRef?: RefObject<HTMLDivElement | null>;
      /** **The card's visible dismissal** — see `PlaceRow`'s `onClose`. Passed by the canvas
       *  card only, and only for the slide that IS the selection: a `✕` on a neighbour would
       *  close a card you are not on. */
      onClose?: () => void;
    }) =>
    (usage: PlaceUsage) => {
      const place = placeById.get(usage.placeId);
      if (!place) return null;
      const prominence = listSpansTrip
        ? undefined
        : usage.days.find((d) => d.date === activeDate)?.prominence;
      const { day, time, what, pencilled } = dayMeta(usage, { forceDay: opts.forceDay });
      // What a human said happened here (ADR-0117 §1) — read off the same day the
      // meta line describes. A strictly-middle stay night reports nothing: nothing
      // happens there to have an outcome about.
      const usageDay = placeMetaDay(usage, metaCtx(opts));
      const outcome = usageDay?.prominence === 'ambient' ? undefined : usageDay?.outcome;
      const selected = selectedId === usage.placeId;
      // The density, which is `selected` everywhere but inside the card's track — see
      // `revealed` above. `selected` still decides the CHROME (the ink border, the ring,
      // the rename pencil), and deliberately so: making every slide look selected would
      // trade the track's imbalance for an ambiguity about which card you are on.
      const revealed = opts.revealed ?? selected;
      return (
        <PlaceRow
          photo={badgePhoto(place, enrichments[usage.placeId])}
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
          rowRef={opts.slideRef}
          notes={noteCountForContext(
            noteCounts,
            resolveHostContext(hostContexts, { kind: 'place', id: usage.placeId }),
          )}
          // **A place SHOWS what its one context carries** (ADR-0173 §4's follow-up, decided
          // and never built until ADR-0174 §3). Same context, same derivation as the notes
          // beside it — a place displays and never originates, so there is no attach control
          // anywhere on this row.
          documents={attachmentCountForContext(
            docCounts,
            resolveHostContext(hostContexts, { kind: 'place', id: usage.placeId }),
          )}
          // Connected here rather than inside the row, which stays presentational — and gated
          // on `selected` for the same reason the refs are: the list can hold dozens of rows,
          // and a note section per unselected row is a section nobody is looking at.
          notesSlot={
            revealed ? (
              <HostNotes host={{ kind: 'place', id: place.id, name: place.name }} />
            ) : undefined
          }
          // Above the notes, the order every other read surface uses. Gated on `selected`
          // for the same reason they are: the list can hold the whole trip.
          documentsSlot={
            revealed ? <HostDocuments host={{ kind: 'place', id: place.id }} /> : undefined
          }
          onSelect={opts.onSelect && (() => opts.onSelect!(usage.placeId))}
          onDeselect={opts.onDeselect}
          // Gated on `selected` for the same reason the notes and the refs are: the list can hold
          // the whole trip, and a summary block per unselected row is 64px nobody is reading.
          summary={revealed ? placeSummary(enrichments[usage.placeId]) : undefined}
          // **The mode change** (ADR-0167 §11.1): expanding shows what an un-added research place
          // shows, so the notes, the references and the schedule footer come OFF while the hero
          // and the whole summary go on. One presentation in two states, not two cards.
          expanded={selected && expandedId === usage.placeId}
          // Offered only when there is something to expand INTO — a place we know nothing about
          // has no hero and no more summary, so the control would open an empty room
          // (ADR-0109 §7). `עוד בגוגל` in the footer is that place's way to more.
          onExpand={() => setExpandedId(usage.placeId)}
          onCollapse={() => setExpandedId(null)}
          onFullPicture={() => {
            const image = enrichments[usage.placeId]?.image;
            if (image) setFullPicture({ title: place.name, image });
          }}
          image={revealed ? enrichments[usage.placeId]?.image : undefined}
          // Free, and present even when we know nothing (ADR-0167 §6) — but not under an errand,
          // where the tab answers one question and the verbs CHANGE rather than accumulate
          // (ADR-0134 §3), which is the same rule that takes `נווט` and the schedule verb off.
          moreUrl={revealed && !pendingErrand ? mapsKnowledgeUrl(place) : undefined}
          refs={revealed ? refEntriesFor(usage, opts) : undefined}
          onSchedule={
            // Absent under a place errand (ADR-0134 §3 / ADR-0135 §7): the tab is answering
            // one question, so the verb changes rather than accumulating — exactly as `נווט`
            // gives its slot to `בחירה` on the same row.
            selected && !pendingErrand ? () => openScheduleForm(usage.placeId) : undefined
          }
          onEnrich={() =>
            setRowErrand({
              target: { kind: 'place', id: place.id },
              // The row names itself, which is all the banner needs: you are standing on
              // the thing you are answering, so there is no reference to name it by.
              label: place.name,
            })
          }
          onFrame={opts.onFrame}
          onChoose={opts.onChoose && (() => opts.onChoose!(usage.placeId))}
          // Selected only, and never under an errand: the tab is then answering one question,
          // and ADR-0134 §3 has the verbs CHANGE rather than accumulate — the same rule that
          // takes `נווט` and the schedule verb off this row.
          onRename={
            selected && !pendingErrand ? () => beginRename.current(usage.placeId) : undefined
          }
          // Selection-gated on the same rule as the pencil (ADR-0157 §2), so the trash is
          // wherever the row is — the sheet's list AND the canvas card, one `renderRow`.
          onDelete={selected && !pendingErrand ? () => setDeletingId(usage.placeId) : undefined}
          onClose={opts.onClose}
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
          renderRow={renderRow({
            onSelect,
            onDeselect: openedFromRow ? clearSelection : undefined,
            onChoose: opts.onChoose,
          })}
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
    <ToggleChip
      on={distanceOrder}
      // Teal is what this control is ABOUT (location), so it holds in both states; a
      // refusal drops it to `muted`, which is the chip saying it can no longer act rather
      // than disappearing (ADR-0109 §7). `.map-nearchip` is the layout/animation hook.
      tone={nearMe && locationRefused ? 'muted' : 'teal'}
      className="map-nearchip"
      onClick={toggleNearMe}
    >
      <Icon name="pin" /> {geo.status === 'locating' ? t.map.near.locating : t.map.near.chip}
    </ToggleChip>
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
              <ToggleChip
                on={maybesOnly}
                provisional
                count={maybesInScope}
                className="map-maybes"
                onClick={() => setMaybesOnly((v) => !v)}
              >
                {t.map.filter.maybes}
              </ToggleChip>
            )}
            {/* The same idiom for the same shape of question — an independent toggle
                beside `אולי`, not a third multi-value facet (ADR-0121 §9). Which is now
                literally the same component, not the same class name copied. */}
            {hasBehind && (
              <ToggleChip
                on={leftOnly}
                provisional
                count={leftInScope}
                className="map-maybes"
                onClick={() => setLeftOnly((v) => !v)}
              >
                {t.map.filter.left}
              </ToggleChip>
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
          <ToggleChip on={allDays} className="map-scopechip" onClick={() => setAllDays(!allDays)}>
            <Icon name="calendar" /> {t.map.allDays}
          </ToggleChip>
          {/* An `indicator`, not a `toggle`: the on-state says WHICH facets are live, and
              the tap opens the strip rather than pressing anything — so it carries no
              `aria-pressed` and names the fact in its own label instead. */}
          <ToggleChip
            on={Boolean(facetGlyphs)}
            semantics="indicator"
            className="map-facets"
            ariaLabel={facetWords ? t.map.filter.activeAria(facetWords) : undefined}
            onClick={() => openDisclosure(MAP_ROW_DISCLOSURE.facets)}
          >
            {facetGlyphs || t.map.filter.open}
          </ToggleChip>
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
              <Icon name="navigate" /> {t.map.dayRoute}
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
      <div className="gt">
        <Icon name="pin" /> {t.map.near.prompt.title}
      </div>
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
        {renderRow({
          onSelect: (id) => select(id, { fromRow: true }),
          onDeselect: openedFromRow ? clearSelection : undefined,
          forceDay: true,
        })(ghostUsage)}
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
  // `!draft` is where "exactly one card" is enforced (ADR-0125 §6): the make/rename form is
  // ABOUT the selected place, so the selection deliberately survives opening it — and the card
  // it would otherwise raise stands down instead of the selection being thrown away.
  const cardUsage =
    sheetView === MAP_SHEET_VIEW.map && selectedId && !draft
      ? usageIndex.get(selectedId)
      : undefined;
  /** **THE SELECTION COMMITS ON SETTLE, never during the scroll** (ADR-0182 §10).
   *
   *  `google.maps.Map` is a live, billed object and this screen re-renders every second, so
   *  driving the camera from every scroll frame is the one thing this must not do. The track
   *  reports continuously; the selection changes once, when it has stopped.
   *
   *  A debounce rather than `scrollend`, which is not on every engine we ship to yet, and
   *  rather than an `IntersectionObserver`, which answers "is it visible" where the question
   *  is "which one is centred".
   *
   *  It calls `select(placeId)` BARE — no `fromRow`, no `land`. Those normalise the sheet to
   *  `half` and scroll the list row into view, and raising the sheet would take away the map
   *  you are swiping on (ADR-0122 §7). So this is the PIN tap's call, not the row tap's. */
  const trackSettle = useRef(0);
  useEffect(() => () => window.clearTimeout(trackSettle.current), []);
  const onTrackScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const track = e.currentTarget;
    window.clearTimeout(trackSettle.current);
    trackSettle.current = window.setTimeout(() => {
      const middle = track.scrollLeft + track.clientWidth / 2;
      let centred: HTMLElement | undefined;
      let closest = Infinity;
      for (const slide of track.querySelectorAll<HTMLElement>('.place[data-place]')) {
        const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - middle);
        if (distance < closest) {
          closest = distance;
          centred = slide;
        }
      }
      const placeId = centred?.dataset.place;
      if (placeId && placeId !== selectedId) select(placeId);
    }, MAP_TRACK_SETTLE_MS);
  };

  /** **THE WINDOW: previous · current · next, and never more** (ADR-0182's peek amendment).
   *
   *  A peek can only ever show one neighbour either side, so that is what is mounted —
   *  three full cards rather than the day's. That bound is the whole reason this is
   *  affordable on a screen that re-renders every second and whose memoisation is measured
   *  (§4's note); mounting the day would put a note section and a way-in block per stop
   *  behind a 28px sliver nobody has looked at yet.
   *
   *  Empty in an all-days scope, because `dayStops` is (§11): there is no sequence to step
   *  through rather than a control to disable, and the card falls back to the single
   *  full-width card it has always been. */
  const trackStops = useMemo(() => {
    const at = cardUsage ? dayStops.findIndex((s) => s.usage.placeId === cardUsage.placeId) : -1;
    if (at < 0) return [];
    return [dayStops[at - 1], dayStops[at], dayStops[at + 1]].filter(Boolean);
  }, [dayStops, cardUsage]);
  /** The selected slide centres itself when the selection arrives from somewhere else — a
   *  pin tap, a row tap, an arrival. `lib/useCenterSelected.ts` already is this, on the
   *  inline axis, including the trap it needs: under MANDATORY snap the centred child must
   *  say `scroll-snap-align: center` or the browser re-snaps the offset back to a
   *  start-aligned boundary. `active` is off with no track, which also resets its arrival
   *  latch so re-entering centres instantly rather than animating. */
  const trackSlideRef = useCenterSelected<HTMLDivElement>(selectedId, {
    active: trackStops.length > 1,
  });
  const renderSlide = (stop: DayStop) => {
    const usage = stop.usage;
    const isCurrent = usage.placeId === cardUsage?.placeId;
    return (
      <Fragment key={usage.placeId}>
        {renderRow({
          forceDay: !inDayScope(usage),
          onFrame: isCurrent ? frameSelected : undefined,
          // A card is the only way to reach one of OUR places at this stop, so under an
          // errand it has to be able to choose it — otherwise a trip place is pickable from
          // the list and not from the canvas, on the tab that exists to show you where things
          // are (ADR-0134 §3).
          onChoose: errandTakesOurPlaces && isCurrent ? finishErrand : undefined,
          // **One density across the track, one selection in it.** The neighbours read as
          // cards rather than as short rows floating at the bottom of a tall one, which is
          // what the peek has to show for the edge to mean anything.
          revealed: true,
          slideRef: isCurrent ? trackSlideRef : undefined,
          onClose: isCurrent ? clearSelection : undefined,
        })(usage)}
      </Fragment>
    );
  };
  const placeCard = cardUsage && (
    <div
      className="map-placecard"
      ref={cardRef}
      // The attribute, not a class: `map.css` keys the track's whole geometry on it, and a
      // day with one stop must stay the plain full-width card rather than a lone slide
      // measuring itself at `calc(100% - 2×peek - 2×gap)` inside empty gutters.
      {...(trackStops.length > 1 ? { 'data-track': '' } : null)}
      onScroll={trackStops.length > 1 ? onTrackScroll : undefined}
    >
      {trackStops.length > 1
        ? trackStops.map(renderSlide)
        : renderRow({
            forceDay: !inDayScope(cardUsage),
            onFrame: frameSelected,
            onChoose: errandTakesOurPlaces ? finishErrand : undefined,
            onClose: clearSelection,
          })(cardUsage)}
    </div>
  );

  // THE FORM, HOSTED ON THE CANVAS (ADR-0147 §4). Same host as the two cards below, and a
  // place that is not in the trip yet is the sharpest case of the rule that put them there —
  // `.map-placecard` is "the row wherever the sheet cannot show it" (ADR-0122 §7) and this one
  // has **no row at any stop**, which is also why it is NOT gated on the `map` stop the way
  // the selection card is. In practice the gesture can only start on visible canvas, so at
  // `full` it never arises.
  //
  // **Everything that varies between the three sources is DATA**, which is the design's whole
  // claim: this function is the only place that knows which source is which, and the form
  // itself knows none of it (`MapPlaceForm`).
  const draftSpec = (): MapPlaceFormSpec => {
    switch (draft!.kind) {
      case 'drop': {
        const { at } = draft as Extract<MapDraft, { kind: 'drop' }>;
        return {
          title: t.map.make.dropTitle,
          name: '',
          // Deliberately the point and not an address: a reverse geocode is paid (§7), and the
          // camera has already framed the spot, so the coordinates are confirmation that the
          // pin fell where the finger was. `coordLabel` keeps the numeric run an LTR island in
          // the RTL flow (ADR-0118).
          note: coordLabel(at),
          confirmLabel: t.map.make.add,
        };
      }
      case 'result': {
        const { result } = draft as Extract<MapDraft, { kind: 'result' }>;
        return {
          title: t.map.make.resultTitle,
          name: result.primaryText,
          note: result.secondaryText,
          vetUrl: mapsPredictionUrl(result),
          confirmLabel: t.map.make.add,
        };
      }
      case 'rename': {
        const r = draft as Extract<MapDraft, { kind: 'rename' }>;
        const usage = usageIndex.get(r.place.id);
        return {
          title: t.map.make.renameTitle,
          name: r.place.name,
          note: r.place.address,
          icon: r.place.icon,
          // The place's own category, else the one the referencing entities agree on — so the
          // pills open where the place already is. `pin.category` already resolves that
          // precedence (ADR-0165), and reading it rather than the column keeps this card and
          // the pin under it answering with one value. **And it is written back now**: a
          // `Place` carries a category of its own, which is what stopped the pills being a
          // control with nowhere to write.
          category: usage?.pin.category ?? r.place.category,
          // **The short label, offered only here** (ADR-0166 §18): the two ADD sources have no
          // place to nickname yet, and asking before the thing exists is a question about
          // nothing. The fallback shown in the hint is what the row would say with the field
          // empty — the served city where enrichment resolved one, else the stripped
          // name — so "leave it blank" is a visible choice rather than a guess.
          nickname: {
            value: r.place.nickname ?? '',
            // Deliberately resolved WITHOUT the nickname: the hint answers "what would this
            // say if I left it empty", and passing the place whole would answer with the
            // nickname it is standing in for.
            fallback:
              derivedPlaceLabel({ name: r.place.name }, enrichments[r.place.id]) ??
              shortPlaceLabel(r.place.name),
          },
          confirmLabel: t.map.make.save,
        };
      }
    }
  };
  const draftCard = draft && (
    <div className="map-placecard" ref={cardRef}>
      <MapPlaceForm
        // **The form is reset by its KEY.** Every field in it is local state seeded from the
        // spec, so a second draft has to be a second instance — which is how a `useState` form
        // is reset without a synchronising effect. The discriminant plus the subject is the
        // draft's identity.
        key={`${draft.kind}:${
          draft.kind === 'rename'
            ? draft.place.id
            : draft.kind === 'result'
              ? draft.result.googlePlaceId
              : `${draft.at.lat},${draft.at.lng}`
        }`}
        spec={draftSpec()}
        busy={savingDraft}
        error={
          draftFailed ? (draft.kind === 'rename' ? t.map.make.saveFailed : t.map.make.failed) : null
        }
        onConfirm={(value) => commitDraft.current(value)}
        onCancel={cancelDraft}
        onValueChange={(value) => setDraftLook({ icon: value.icon, category: value.category })}
      />
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
    sheetView === MAP_SHEET_VIEW.map && selectedResultId && !cardUsage && !draft
      ? research.predictions.find((r) => r.googlePlaceId === selectedResultId)
      : undefined;
  const resultCard = cardResult && (
    <div className="map-placecard" ref={cardRef}>
      <ResultRow
        result={cardResult}
        selected
        chooseMode={pendingErrand != null}
        busy={addingResultId === cardResult.googlePlaceId}
        image={candidateKnowledge.image}
        summary={candidateKnowledge.summary}
        onFullPicture={showCandidatePicture}
        onAdd={() => onResultAdd(cardResult)}
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

  // **AND "NAMED BEFORE THE OTHERS" IS THE BRANCH ORDER, INCLUDING THE EMPTY TRIP** (owner,
  // 2026-08-07: the picker said `אין עדיין מקומות` while a live Google result for Ben
  // Gurion rendered underneath it). `allUsages.length === 0` was tested FIRST, so a trip with
  // no places of its own — which is every trip while you pick the place for your first booking
  // — stated an emptiness the search was in the middle of disproving. It is the same rule the
  // merged emptiness below already holds for the other half, and the query has to outrank all
  // three causes, not two of them. At rest the empty trip still gets to say so.
  //
  // ONE LIST, ONE EMPTINESS (owner, session 164). The two halves used to be two sections
  // with two headers and two empty states, and the result was the screenshot that got this
  // changed: `לא נמצאו מקומות` in bold, with three Google results underneath it. A list
  // cannot say "nothing" and then show something.
  //
  // So the trip's half no longer answers for itself. Emptiness is now a fact about the
  // MERGED list, and it is only stated once Google has settled — while a paid search is in
  // flight the honest answer is "still looking", which the skeletons already say.
  const listBody = searching ? (
    listCount === 0 && researchEmpty ? (
      <p className="map-res-hint">{t.map.search.noResultsTitle}</p>
    ) : (
      renderList(listRows, (id) => select(id, { fromRow: true }), {
        onChoose: errandTakesOurPlaces ? finishErrand : undefined,
      })
    )
  ) : allUsages.length === 0 ? (
    <EmptyState
      size="pane"
      icon={<Icon name="map" />}
      title={t.map.empty.title}
      body={t.map.empty.body}
    />
  ) : listCount === 0 ? (
    facetsActive ? (
      <EmptyState
        icon={<Icon name="search" />}
        title={t.map.filter.noResultsTitle}
        body={t.map.filter.noResultsBody(facetWords)}
        action={{ label: t.map.filter.clear, onClick: clearFacets }}
      />
    ) : (
      <EmptyState
        size="pane"
        icon={<Icon name="calendar" />}
        title={t.map.emptyDay.title}
        body={t.map.emptyDay.body}
        action={{ label: t.map.emptyDay.action, onClick: () => setAllDays(true) }}
      />
    )
  ) : (
    renderList(listRows, (id) => select(id, { fromRow: true }), {
      onChoose: errandTakesOurPlaces ? finishErrand : undefined,
    })
  );

  // GOOGLE'S HALF, IN THE SHEET (ADR-0131 §8) — re-parented out of the retired overlay,
  // not rewritten: `PlaceResearch` already took only these three props and rendered
  // `.map-research`, which is ADR-0115 §7's reuse audit paying off.
  //
  // It is the paid half's ROWS. Its places are on the canvas too, as rings — ADR-0132 §7
  // switched this half's SKU to Text Search, which returns each result WITH its location,
  // retiring ADR-0115 §2's "a prediction carries no coordinates, so there is nothing to
  // draw" on this surface. A coordless match is the exception, and it is the gap §8 names:
  // a row here and nothing on the canvas. And it is in BOTH modes now —
  // ADR-0115 §6's "Plan mode only" is withdrawn, and its own §1 arm with it (§8a), so
  // `PLACE_SEARCH_MIN_CHARS` is what stands between a keystroke and a paid call.
  const googleHalf = searching && (
    <PlaceResearch
      search={research}
      offline={offline}
      selectedId={selectedResultId}
      chooseMode={pendingErrand != null}
      selectedKnowledge={candidateKnowledge}
      onShow={selectResultRow}
      onFullPicture={showCandidatePicture}
      addingId={addingResultId}
      addFailed={addResultFailed}
      onAdd={onResultAdd}
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

  /** **What this delete costs, in the two counts nothing can recover afterwards.** The rows
   *  whose location Postgres is about to null, and the notes its cascade will take — neither
   *  writes a `Change` row, so the confirm is the only moment either can be learned
   *  (ADR-0157 §2, the rule ADR-0152 §2 set for the other four hosts). `undefined` when the
   *  place is unreferenced, which is the common case and needs no line at all.
   *
   *  **Counted BY KIND** since session 212 (ADR-0157 §8): `פריטים` was correct, unactionable,
   *  and hid the one fact worth knowing — a place added and immediately deleted warned about
   *  "one item", and the item was the shelf idea the add itself had created. */
  const deleteConsequence = (placeId: string): ReactNode => {
    const links = placeLinks(placeId, { events, bookings, maybeItems });
    // The sole live idea is DELETED with the place rather than left without a location
    // (ADR-0157 §9), so it leaves the "survives without a location" count and gets its own
    // clause. Same helper the verb resolves, so the sentence cannot promise one thing and
    // the write do another.
    const swallowed = soleIdeaFor(placeId, maybeItems);
    // Each surviving link as the reader knows it: its kind and its own title, so the
    // sentence can NAME it while there are few enough to name (ADR-0157 §8).
    const subjects = links
      .filter((link) => link.id !== swallowed?.id)
      .map((link) => placeRefSubject(link, { events, bookings, maybeItems }));
    const refs = subjects.length;
    const hostedNotes = noteCountFor(noteCounts, 'place', placeId);
    if (refs === 0 && hostedNotes === 0 && !swallowed) return undefined;
    const clauses: ReactNode[] = [];
    if (refs > 0)
      clauses.push(
        <>
          <Icon name="pin" /> {t.map.del.refs(subjects)}
        </>,
      );
    if (swallowed)
      clauses.push(
        <>
          <Icon name="shelf" /> {t.map.del.idea}
        </>,
      );
    if (hostedNotes > 0)
      clauses.push(
        <>
          <Icon name="clipboard" /> {t.notes.hostDelete(hostedNotes)}
        </>,
      );
    return clauses.map((clause, i) => (
      <Fragment key={i}>
        {i > 0 && ` ${DOT_SEPARATOR} `}
        {clause}
      </Fragment>
    ));
  };

  // **The long press's menu** (ADR-0157 §2). The canvas's counterpart to the verbs a selected
  // ROW reveals: a pin has no room for them, so the gesture that means "act on this" opens
  // the app's existing row menu instead of a surface of its own (`RowManageSheet`, a fourth
  // consumer after bookings, documents and members). Nothing here deletes: the destructive
  // item opens the same confirm the row's trash does.
  const pinMenuPlace = pinMenuId ? placeById.get(pinMenuId) : undefined;
  const pinMenu = pinMenuPlace && (
    <RowManageSheet
      title={pinMenuPlace.name}
      subject={pinMenuPlace.address}
      onClose={() => setPinMenuId(null)}
      actions={[
        {
          label: t.map.make.edit,
          icon: 'edit',
          onSelect: () => {
            setPinMenuId(null);
            beginRename.current(pinMenuPlace.id);
          },
        },
        {
          label: t.map.del.action,
          icon: 'trash',
          danger: true,
          onSelect: () => {
            setPinMenuId(null);
            setDeletingId(pinMenuPlace.id);
          },
        },
      ]}
    />
  );

  // **The one confirm both ways in open** (ADR-0157 §2). It names what the delete costs
  // BEFORE it happens, in the two counts nothing else can recover afterwards: the rows that
  // lose their location, and the notes the database cascade takes (ADR-0152 §2's rule, from
  // the fifth host). Recomputed here rather than captured at the press, so a peer's edit in
  // the seconds the dialog is open cannot make the sentence a lie.
  const deletingPlace = deletingId ? placeById.get(deletingId) : undefined;
  const deleteConfirm = deletingPlace && (
    <ConfirmDialog
      tone="danger"
      icon={<Icon name="trash" />}
      title={t.map.del.title}
      body={t.map.del.body(deletingPlace.name)}
      consequence={deleteConsequence(deletingPlace.id)}
      confirmLabel={t.map.del.confirm}
      cancelLabel={t.common.cancel}
      onCancel={() => setDeletingId(null)}
      onConfirm={() => {
        setDeletingId(null);
        // The selection would otherwise outlive the row it points at — and at the map
        // extreme that is a card for a place that no longer exists.
        if (selectedId === deletingPlace.id) clearSelection();
        verbs.removePlace(deletingPlace);
      }}
    />
  );

  const overlays = (
    <>
      {/* Reached through a selected row's way-in (§8). */}
      {detailBooking && (
        <BookingDetail
          booking={detailBooking}
          onClose={() => setDetailBooking(null)}
          onOpen={setDetailBooking}
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
      {/* The way-in block's footer opens this, pre-filled with the place (ADR-0135 §1-2).
          What the form then DOES with it — a `יש הזמנה` row that also creates a Booking —
          is ADR-0136's, which is why this passes a place and nothing else. */}
      {scheduleForm && (
        <EventForm
          defaults={{ placeId: scheduleForm.placeId }}
          maybeItem={scheduleForm.maybeItem}
          draft={eventDraft}
          onOpenBooking={setDetailBooking}
          onClose={closeScheduleForm}
        />
      )}
      {pinMenu}
      {deleteConfirm}
      {/* **The full picture, one level below the expanded card** (ADR-0167 §11.1 + §10.2). The
          app's own zoomable preview rather than a bigger thumbnail: ADR-0062 permits zoom in
          exactly one place and this is it, and a 116px hero revealed inside the card was measured
          leaving the notes scroller 31px. It carries the credit as its caption, because full
          screen is the photograph's most prominent display. */}
      {fullPicture && (
        <MediaViewer
          title={fullPicture.title}
          mimeType={fullPicture.image.mimeType}
          source={{ kind: 'url', url: apiAssetUrl(fullPicture.image.url) }}
          caption={placeCredit(fullPicture.image)}
          /* The delivered image carries its own dimensions, so the viewer's frame is this
             picture's box from the first frame — nothing to letterbox and nothing to settle. */
          intrinsic={fullPicture.image}
          onClose={() => setFullPicture(null)}
        />
      )}
    </>
  );

  // The map is absent — **offline, which is now the only way** (ADR-0186 §8, until Phase 3
  // removes even that): the tab is exactly the list it has always been, in the ordinary
  // scrolling body. Not a greyed watermarked frame — that would be a third grammar for a fact
  // this tab already states two ways (ADR-0121 §11).
  if (!hasMap) {
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
      // Pairs with `--sheet-h: 0` above: the height goes to the canvas and the sheet's own
      // node stands down, rather than being a 0px sliver with its contents clipped.
      data-form={draft ? 'open' : undefined}
      style={
        {
          // The pane is sized to the area the SNAPPED sheet leaves visible, so Google's
          // attribution stays visible and a drag costs no relayout (ADR-0121 §5).
          // **WHILE THE FORM IS OPEN THE SHEET IS NOT SHOWN AT ALL** (ADR-0148 §2), which is one
          // step past normalising to `map` and is what makes the whole form fit with no
          // scrolling on every target. At `map` the sheet is nothing but its own 52px strip —
          // a grab handle, `רשימה / מפה` and `קרוב עכשיו` — over a list you cannot see. None of
          // that is the task while you are naming a point, and the view toggle in it actively
          // contradicts a form that just moved you to the canvas: the same derived-affordance
          // rule that takes `נווט` off a row under an errand (ADR-0134 §4).
          //
          // `sheetView` is still `map` underneath, so the stop the form deferred is restored on
          // close and nothing about the sheet's own state is touched.
          '--sheet-h': draft ? '0px' : stopHeightCss(MAP_SHEET_STOPS[sheetView]),
          // Written from the TS constants, never measured: this screen re-renders every
          // second, so a layout read here is the anti-pattern `frontend/CLAUDE.md`
          // names. `--map-controls-h` is the same number `mapFitPadding`'s top is
          // derived from, so the row's layout and the band the camera keeps clear of
          // pins cannot drift apart (ADR-0122 §1).
          '--map-controls-h': `${MAP_CONTROLS_H}px`,
          '--snap-top-h': `${MAP_SHEET_STRIP_H}px`,
          '--map-attr-h': `${MAP_ATTRIBUTION_H}px`,
          // **What the keyboard is covering that the layout does not know about** (ADR-0148 §4).
          // 0 on Android, where the viewport resized and `--sheet-h` above already describes
          // reality; the keyboard's height on iOS, where it does not. Only the card's `bottom`
          // reads it, so it never touches the pane's size and cannot cost a relayout of the
          // canvas — and it changes on a focus, not on the clock.
          '--map-kb-h': `${keyboardInset}px`,
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
          scheme={scheme}
          urls={tileUrls}
          pins={pins}
          results={results}
          onSelectResult={selectResult}
          me={me}
          connector={dayShapeVisible ? orderedStops : undefined}
          setSignal={cameraSignal}
          defaultCentre={defaultCentre}
          onSelectPin={selectPin}
          onCanvasTap={onOutsideTap}
          onViewChange={onViewSettled}
          areaCount={areaCount}
          areaSorted={areaSorted}
          onAreaSort={toggleAreaSort}
          onLocate={locateFromCanvas}
          arrival={arrival}
          // The MEASURED reserve, not "a card is open": the constant it replaced was sized
          // for a selected row and the form is nearly twice that, which put a freshly
          // dropped pin behind the form naming it (ADR-0148 §3).
          //
          // TWO PROPS FOR ONE FACT, deliberately, because they answer different questions and
          // one value cannot do both (see `readCardReserve`): the getter is what the camera
          // READS when it moves — immune to effect ordering, which is what made the state
          // version silently 0 on the tap that raises the card — and the number is the SIGNAL
          // that the card changed, which is what the reveal effect keys on.
          cardReserveAt={readCardReserve}
          cardReserve={cardReserve}
          // Both make-a-place gestures (ADR-0147). Stable identities via latest-refs, like
          // every other handler this memoized pane takes — an inline arrow here would
          // re-diff every marker once a second (§7, ADR-0121 §4).
          onHold={holdCanvas}
          draftMarker={draftMarker}
        />
        {draftCard}
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
        {/* The device-pass instrument (ADR-0146). A SIBLING, like everything else in this
            split — wrapping `<MapPane>` would remount it, and a remount is billed
            (ADR-0121 §4) — and it holds all of its state itself, so a stepper tap
            re-renders the panel and nothing else. Dropped from a production build with
            the gate, the way `App.tsx` mounts `DevTimeTravel`.

            It is handed the LATCHED `config` rather than reading one of its own: the panel's
            job is to report what the canvas beside it was built from, and a live re-read says
            what the next canvas would be built from instead. */}
        {import.meta.env.DEV && <DevMapTuner config={config} />}
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
  rowRef,
  usage,
  place,
  photo,
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
  notes,
  documents,
  documentsSlot,
  notesSlot,
  summary,
  expanded,
  onExpand,
  onCollapse,
  image,
  onFullPicture,
  moreUrl,
  refs,
  onSchedule,
  onSelect,
  onDeselect,
  onEnrich,
  onFrame,
  onChoose,
  onRename,
  onDelete,
  onClose,
}: {
  /** Attached by the card's track to the slide that is the current selection, so
   *  `useCenterSelected` can scroll it to the centre (ADR-0182). Absent in the list. */
  rowRef?: RefObject<HTMLDivElement | null>;
  usage: PlaceUsage;
  place: Place;
  /** **The photograph that fills the badge** (ADR-0167 §1), or absent for the glyph — which is
   *  most rows and looks exactly as it always did. Resolved by `badgePhoto`, which is where the
   *  "a picked icon beats a fetched photo" rule lives (§2). */
  photo?: DeliveredImageValue;
  /** **The two-line summary block** (ADR-0167 §9.3), or absent when we know nothing — which is
   *  the common case and draws nothing at all (ADR-0109 §7). Already resolved by `placeSummary`:
   *  which language variant a reader gets, and the one word that marks it when it is not ours.
   *  Selection-gated by the caller, like the notes and the references. */
  summary?: PlaceSummary;
  /** **This place is showing its research card** (ADR-0167 §11.1). Expanding is a MODE CHANGE,
   *  not growth: the hero and the whole summary come on, and the notes, the references and the
   *  schedule footer go off — which is what dissolved §10.2's measured problem, where a hero
   *  revealed INSIDE the card left the notes scroller 31px. */
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  /** The photograph itself, for the hero and its credit — the badge takes only the URL, since a
   *  40px square carries no attribution and needs none (§4). */
  image?: DeliveredImageValue;
  /** Open the full picture (ADR-0167 §11.1: the preview stays as the level below the expanded
   *  card, reached from the hero). Owned by the screen, because the viewer is a portal. */
  onFullPicture?: () => void;
  /** **`עוד בגוגל`** (ADR-0167 §6): what Google knows about this place. Present whenever the
   *  reveal's footer is, including when we know nothing — that is when it matters most. */
  moreUrl?: string;
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
  /** How many notes this place carries (ADR-0152 §6c on a third meta grammar). **The mark is
   *  the LAST item in the meta line**, after the rating, which is the whole of its layout
   *  rule: `.map-m` has wrapped since it shipped and every fact in it is already its own
   *  element, so the mark is one more item in a line built to take them — and rendering it
   *  last means the thing that wraps first is the mark, never a semantic tag. That is why
   *  this row needed none of `EventCard`'s three changes (§6c): there the meta is a joined
   *  string on a line that must not grow. */
  notes?: number;
  /** **How many DOCUMENTS this place shows** (ADR-0174 §1) — its one context's, since a place
   *  can never host an attachment of its own (ADR-0173 §4). The mark reads exactly what the
   *  section below it lists, because both resolve through the same context. */
  documents?: number;
  /** **Where a place's inherited documents are read** — the connected `<HostDocuments>`,
   *  present only while selected, above the notes. */
  documentsSlot?: ReactNode;
  /** **Where a place's notes are read and written** — the connected `<HostNotes>`, present
   *  only while selected, which is what gives a place a body at all: it has no detail surface
   *  of its own — the pin's long-press menu holds verbs, not content (ADR-0157 §2) — and this
   *  same row IS its card at the `map` stop (ADR-0153 §8's amendment). One node, two surfaces,
   *  because `renderRow` is shared. */
  notesSlot?: ReactNode;
  /** The way in to each reference, present only while selected. */
  refs?: RefEntry[];
  /** **Put this place on a day** (ADR-0135 §1) — the block's one primary action, in its own
   *  footer under the reference list. Absent while a place errand is live, because the tab is
   *  then answering one question and ADR-0134 §3 has the verb CHANGE rather than accumulate:
   *  a control only where it has something to do, the same derived-affordance rule this tab
   *  runs for `נווט`, `קרוב עכשיו` and `באזור`. */
  onSchedule?: () => void;
  /** Select this place (and focus its pin, when it has one). **Absent on the canvas
   *  place card, whose body is inert** (ADR-0122 §7): there is nowhere for a tap on it
   *  to go — it already shows everything the row shows, way-in included — and raising
   *  the sheet from it would take away the map the card is sitting on. Without it the
   *  row renders as plain content rather than a `button` that does nothing. */
  onSelect?: () => void;
  /** **Close this row again** (ADR-0168 §4; owner, 2026-08-06: _"I need it to shrink back
   *  when clicking again"_). Selecting a row opens a card inside it — the summary, the notes,
   *  the references, the footer — and until now the only way to shut that was to select
   *  something else or to press back. Passed wherever `onSelect` is, since it is the same
   *  tap read a second time. */
  onDeselect?: () => void;
  /** Only the place card passes this: it makes the badge the way in to its own pin
   *  (ADR-0129 §1). Absent everywhere else, so the list's badges stay inert. */
  onFrame?: () => void;
  /** Present only while a place errand is live: choose THIS place for the form that sent
   *  it, and return (ADR-0134 §3). */
  onChoose?: () => void;
  /** Open the picker to give a coordless Place-lite real coordinates. */
  onEnrich: () => void;
  /** **Give this place your own name** (ADR-0147 §3). Present only while selected, which is
   *  what makes it free: every other slot on this row is measured-spent, and a selected row is
   *  already the object that reveals its verbs. */
  onRename?: () => void;
  /** **Remove this place from the trip** (ADR-0157 §2). Selection-gated like the pencil, and
   *  in the FOOTER rather than beside it: the pencil is a 16px control carrying a 44px
   *  `::after`, so a second one next to it would overlap its target by 20px — and of the two
   *  verbs the one you must not hit by accident is this one. The footer gives it a real box
   *  beside the schedule pill, which is also where the eye already looks for this row's
   *  verbs. */
  onDelete?: () => void;
  /** **Close this card** (ADR-0182's device pass; owner: _"we should add a way to close the card
   *  and/or collapse it"_). The canvas card's only, and it is the one control this row was
   *  missing: the card is dismissible three ways already — a tap on blank canvas, system back,
   *  selecting something else — and **none of them is visible on it**, the body being
   *  deliberately inert there (ADR-0122 §7) where a list row answers a second tap with
   *  `onDeselect`.
   *
   *  It is `clearSelection` itself and not a handler beside it: whatever dismisses a surface runs
   *  the same function system back does (ADR-0103's 2026-07-29 amendments). */
  onClose?: () => void;
}) {
  // **THE WAY-IN BLOCK IS FOLDED BY DEFAULT** (ADR-0121 §8's 2026-08-05 amendment). A hub
  // place carries a reference per leg, and the block sits between the notes and the row's
  // primary action — so it shows what matters now and names the rest. Row state, not screen
  // state: it is a property of the one selected row, and selecting another starts folded.
  const [allRefs, setAllRefs] = useState(false);
  // Kept: the top-ranked few, PLUS every open question whatever its rank. A passed day
  // nobody answered is the entry you cannot act on once it is folded away, and it is the
  // only one the block emphasises in the first place (ADR-0139 §2).
  const keptRef = (ref: RefEntry) => ref.rank < PLACE_REFS_CAP || !!ref.settle?.asking;
  // Counted off the FOLDED reading rather than off what is on screen, so `עוד 2` does not
  // become `עוד 0` the moment it is opened.
  const foldedRefs = (refs ?? []).filter((ref) => !keptRef(ref)).length;
  const { rows: refRows } = revealRows(refs ?? [], (ref) => allRefs || keptRef(ref));

  const hue = usage.pin.category ? CATEGORY_PIN_HUE[usage.pin.category] : 'leisure';
  // The same one chain the pin reads (`placeGlyph`), so the row's badge and its pin can never
  // disagree about which glyph this place shows — the property the list-first investment was
  // for, and the reason a `??` chain here would be a second copy of the rule.
  const glyph = placeGlyph(place, usage.pin.category);
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

  // **WHAT A TAP ON THE BODY MEANS, IN ONE PLACE** (ADR-0168 §4). Three readings of one
  // gesture, and the order is the whole rule: the innermost state closes first.
  //
  //  - **Expanded → the way back.** `‹ חזרה לפרטי המקום` stays as the block's NAMED control,
  //    exactly as `עוד ›` stayed when the whole summary became tappable (`PlaceKnowledge`) —
  //    what grows is the target, not the affordance. Owner, 2026-08-06: _"to go back you must
  //    click on the little `חזרה לפרטי המקום` button. This is very inconvenient and easy to
  //    miss. I think that instead clicking anywhere on the card should go back to the place."_
  //  - **Selected → close the row.** _"I need it to shrink back when clicking again."_
  //  - **Otherwise → select it**, which is what it always did.
  //
  // `onDeselect` is ABSENT when the canvas opened this row (`openedFromRow`), and then the
  // tap falls through to `onSelect` — which is the framing ADR-0134 §6 built. Written as a
  // fall-through rather than a condition on `selected`, because a `selected` row with no
  // `onDeselect` must stay tappable, not go inert.
  //
  // Note what this gives the CANVAS CARD for free, and it is the reason the handler is
  // derived rather than gated on `onSelect`: that card passes no `onSelect` (its body is inert,
  // ADR-0122 §7) and no `onDeselect`, but it does pass `onCollapse` — so an expanded card
  // there becomes tappable to return, and a collapsed one stays inert, with no branch about
  // which host we are in.
  const onBodyTap = expanded ? onCollapse : (selected && onDeselect) || onSelect;
  // **EXPANDED, THE BODY IS A TARGET AND NOT A CONTROL** — no `role`, no `tabIndex`, no name.
  // `‹ חזרה לפרטי המקום` is inside it and is the named, focusable way back, so announcing the
  // body as a second button with the same label reads it out twice; the keyboard path is that
  // button. Exactly what `PlaceKnowledge` does when the whole summary block becomes tappable
  // around `עוד ›` — "the tap target grows; the accessible control does not move."
  const bodyIsControl = !!onBodyTap && !expanded;
  return (
    <div
      ref={rowRef}
      className={rowClass}
      data-place={usage.placeId}
      {...(onBodyTap
        ? {
            onClick: (e: React.MouseEvent) => {
              if (!fromNotes(e.target)) onBodyTap();
            },
          }
        : null)}
      {...(bodyIsControl
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': selected,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              if (fromNotes(e.target)) return;
              e.preventDefault();
              onBodyTap();
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
        // The stored `url` is root-relative and the API may be another origin, so it is
        // prefixed here — the same resolution an uploaded avatar's bytes get.
        photoUrl={photo && apiAssetUrl(photo.url)}
      >
        {glyph}
      </PlaceBadge>
      <span className="map-main">
        <span className="map-t">
          {/* Both stored strings on this row come from Google and carry their own
              direction, so both sniff it (ADR-0118): a name that opens with a numeral
              run (`7-Eleven Shinjuku`) reorders in the RTL flow exactly as an address
              does, and `meta` below is an address, a Hebrew transition word or a
              category, depending on the row. */}
          <span className="map-name" dir="auto">
            {place.name}
          </span>
          {isHard && (
            <span className="map-lock" aria-hidden="true">
              <Icon name="lock" />
            </span>
          )}
          {/* REVEALED BY SELECTION, and that is the whole answer to where this hangs — CSS
              shows it on `.place.selected`, so an unselected row pays nothing. An `Icon`, not
              an emoji (ADR-0138); 16px of layout with a 44px `::after` target (ADR-0017), and
              `stopPropagation` because the row's own tap frames the place. */}
          {onRename && (
            <button
              type="button"
              className="map-rename"
              aria-label={t.map.make.edit}
              title={t.map.make.edit}
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
            >
              <Icon name="edit" />
            </button>
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
          {meta && (
            <span className="map-tag" dir="auto">
              {meta}
            </span>
          )}
          {isPureIdea && <span className="map-tag mbadge">{t.map.shelfTag}</span>}
          {place.rating != null && (
            <span className="map-tag rate" dir="auto">
              <Icon name="star" /> {place.rating.toFixed(1)}
            </span>
          )}
          {/* LAST, deliberately: it is the item this line drops to the next row first, so a
              crowded row can never lose a semantic tag to it. Not a `.map-tag` — a note is
              context, not one of this row's claims (ADR-0028 has no colour to lend it). */}
          <NoteMark count={notes} />
          <DocumentMark count={documents} />
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
            <Icon name="navigate" /> {t.actions.navigate}
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
      {/* **THE CARD'S ONE VISIBLE WAY OUT** (ADR-0182's device pass). A fourth column of the
          identity row rather than a corner overlay, and that is what keeps it PINNED: the card
          becomes a scroller once its pinned rows alone exceed the cap (§9's amendment), and an
          absolutely-positioned corner control scrolls away exactly when the card is at its
          tallest. `stopPropagation` for the same reason the pencil has it — the body's own tap
          means something else. */}
      {onClose && (
        <button
          type="button"
          className="map-cardclose"
          aria-label={t.map.closeCard}
          title={t.map.closeCard}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <Icon name="close" />
        </button>
      )}
      {/* **WHAT THE WORLD KNOWS, pinned under the identity** (ADR-0167 §9.3). Two lines,
          always visible while the row is selected, and NOT inside the notes scroller: the
          group's own writing does not share a region with fetched text (§9.5), and this block
          is one of the four things the bounded card pins.

          §9's arithmetic is why it can be here at all: hours ride the meta line at 0px, so the
          64px this costs is paid for rather than added. Absent — not empty — when we know
          nothing, which is the common case (ADR-0109 §7). */}
      {/* **THE HERO, THE CREDIT AND THE SUMMARY, in the one component both rows render** (§11.1's
          "one presentation, not two", ADR-0166 §17). The density is this row's state; everything
          about how they look, clamp and read belongs to the block. `ResultRow` renders the same
          call at `deciding`, which is what stopped a second copy of these three blocks from
          appearing beside this one when the deciding surface shipped. */}
      <PlaceKnowledge
        density={expanded ? KNOWLEDGE_DENSITY.EXPANDED : KNOWLEDGE_DENSITY.COLLAPSED}
        image={image}
        summary={summary}
        onExpand={onExpand}
        onFullPicture={onFullPicture}
      />
      {/* **WHAT WE KNOW ABOUT THIS PLACE, between the facts and the verbs.** The order is
          `BookingDetail`'s (facts → notes) and the idea sheet's (notes → verbs); notes last,
          under the schedule footer, would put content below a primary action, which is the
          one arrangement no surface here uses. A full-width line in a row that has wrapped
          one of those since it shipped (`.map-refs`), so it needs one declaration. */}
      {!expanded && documentsSlot}
      {!expanded && notesSlot}
      {/* Full-width and ≥40px, so it is a real touch target (ADR-0017) — which is
          also why the meta line's own 11.5px tags are not the link. */}
      {!expanded && refs && refs.length > 0 && (
        <div className="map-refs">
          {/* Folding is a LIST CHANGE, so it is the app's one reveal (ADR-0120) rather than a
              conditional slice: a folded entry collapses in place and the rest ride the
              stagger back, the same motion the tab's own chips already run. */}
          <RevealList
            className="map-reflist"
            rows={refRows}
            getKey={(ref) => ref.key}
            renderRow={(ref) => (
              /* THE ROW IS A CONTAINER, not the button it used to be (ADR-0139 §3). Buttons do
                 not nest, and the settle pair has to be a real control beside the open one — so
                 the open affordance becomes its own button keeping all the remaining width, and
                 the cluster is its SIBLING. Exactly `ListRow`'s shape, where
                 `.wp-listrow-right` is a sibling of the open button rather than a child. */
              <span className={'map-ref' + (ref.settle?.asking ? ' asking' : '')}>
                <button
                  type="button"
                  className="map-ref-open"
                  onClick={(e) => {
                    e.stopPropagation();
                    ref.onOpen();
                  }}
                >
                  {/* TWO LINES, the row's own grammar one line up (`.map-t` / `.map-m`): what
                      this reference IS, then what kind of thing it is and when. It costs ~6px
                      of height and gives the label the width the leading chip used to take —
                      ADR-0139's Consequences measured that label wanting 199px against 146,
                      and this is where the difference comes from. */}
                  <span className="map-ref-text">
                    <span className="map-ref-label">{ref.label}</span>
                    <span className="map-ref-meta">
                      <span className="map-ref-kind">{ref.kind}</span>
                      {ref.day && (
                        <>
                          {DOT_SEPARATOR}
                          <span>{ref.day}</span>
                        </>
                      )}
                      {ref.time && (
                        <>
                          {DOT_SEPARATOR}
                          {/* An LTR island inside the Hebrew line, never the whole tag. */}
                          <span dir="auto">{ref.time}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <Icon name="caret" dir="left" />
                </button>
                {/* The verb hangs on the reference row because that row already names its
                    target (ADR-0139 §1) — the pair itself is the shared control. */}
                {ref.settle && (
                  <SettleControl
                    variant="compact"
                    outcome={ref.settle.outcome}
                    onDone={ref.settle.onDone}
                    onSkip={ref.settle.onSkip}
                    onUndo={ref.settle.onUndo}
                  />
                )}
              </span>
            )}
          />
          {/* THE FOLD, and it only exists where there is something folded. `עוד N` names how
              many rather than saying "more", because the number is what tells you whether it
              is worth a tap on a place that carries two extra legs or nine. */}
          {(foldedRefs > 0 || allRefs) && (
            <button
              type="button"
              className="map-ref-more"
              aria-expanded={allRefs}
              onClick={(e) => {
                e.stopPropagation();
                setAllRefs((on) => !on);
              }}
            >
              <Icon name="caret" dir={allRefs ? 'up' : 'down'} />
              {allRefs ? t.map.refs.less : t.map.refs.more(foldedRefs)}
            </button>
          )}
        </div>
      )}
      {/* **The ROW's footer, not the reference block's** — moved out of `.map-refs` when the
          note section arrived, and it corrects two things at once. It is the row's one primary
          action rather than a fourth reference, so a selected place with NO references now
          offers it too (it used to render only inside a non-empty `.map-refs`, which is
          precisely the place most likely to want scheduling). And in the bounded card it is
          what the grid can PIN: a foot inside a scrolling block cannot stay in view. */}
      {/* **The way back, beside the one Google exit** (ADR-0167 §11.1's `.backrow`). It replaces the
          footer rather than joining it: while you are looking at the place as a SUBJECT, the
          schedule action and the delete are not on screen — that is what makes this a mode change
          rather than a taller card. */}
      {expanded && (
        <span className="map-refs-foot map-backrow">
          <button
            type="button"
            className="map-know-more"
            onClick={(e) => {
              e.stopPropagation();
              onCollapse?.();
            }}
          >
            <Icon name="caret" dir="right" />
            {t.map.know.back}
          </button>
          {moreUrl && (
            <a
              className="map-gbtn"
              href={moreUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {t.map.know.moreOnGoogle}
            </a>
          )}
        </span>
      )}
      {!expanded && (onSchedule || onDelete || moreUrl) && (
        <span className="map-refs-foot">
          {onSchedule && (
            <button
              type="button"
              className="map-addmaybe"
              onClick={(e) => {
                e.stopPropagation();
                onSchedule();
              }}
            >
              <Icon name="plus" /> {t.map.scheduleToDay}
            </button>
          )}
          {/* **The way through to what Google knows** (ADR-0166 §13, ADR-0167 §6) — the answer
              to enrichment's coverage hole, and free. It is here and not on the collapsed row,
              which keeps its single Google exit (`נווט`), so ADR-0121 §8's density argument
              holds where it was aimed. **Always present when the row is selected**, including
              when we know nothing at all — that is the majority case, and then this is the
              whole content of the block rather than an empty state to apologise for. */}
          {moreUrl && (
            <a
              className="map-gbtn"
              href={moreUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {t.map.know.moreOnGoogle}
            </a>
          )}
          {/* Quiet beside the primary, and `--miss` because that is the hue this app's
              destructive verbs already wear (`.wp-row-action.danger`) — never a second red
              of its own. It opens the confirm; nothing is deleted by this press. */}
          {onDelete && (
            <button
              type="button"
              className="map-del"
              aria-label={t.map.del.aria(place.name)}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Icon name="trash" /> {t.map.del.action}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
