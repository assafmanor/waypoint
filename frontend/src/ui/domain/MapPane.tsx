// The rendered map: one canvas, our pins, our controls (ADR-0121 §5/§6/§12).
//
// **One `google.maps.Map` per tab visit, and never a second.** Dynamic Maps bills
// per instantiation, so the cost question is not "how many tiles" but "how many
// times do we construct a map" (§4). This component is mounted once per visit and
// re-rendered freely: the `רשימה / מפה` toggle RESIZES the live map, a filter
// re-diffs markers, a sheet drag moves a sibling. `AppShell` keys `<main>` by tab,
// so leaving the tab unmounts it — that is the only teardown there is.
//
// It is presentational (ADR-0096's `ui/domain` rule): every pin arrives as
// PRIMITIVES, keyed by `placeId`, so the screen's per-second clock tick reconciles
// to a no-op diff. That is the marker-level restatement of §4, and the reason
// `memo` below is load-bearing rather than an optimisation.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map,
  Polyline,
  __resetModuleState,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  isAsidePin,
  isFramedByCamera,
  MAP_RESULT_SELECTED_Z,
  MAP_RESULT_Z,
  PIN_TIER,
  pinZIndex,
  type PinOutcome,
  type PinTier,
} from '../../lib/map-pins';
import { readMapBounds, useMapCamera } from '../../lib/useMapCamera';
import { useCanvasGestures } from '../../lib/useCanvasGestures';
import { observeResize } from '../../lib/observe-resize';
import { observeVisibility } from '../../lib/visibility';
import { RELOAD_GUARD_KEY, reloadOnce } from '../../lib/guarded-reload';
import { PhaseTimeoutError, withDeadline } from '../../lib/deadline';
import type { LatLng, MapArrival, MapBounds } from '../../lib/map-camera';
import { MAP_COLOR_SCHEME, type MapColorScheme, type MapsConfig } from '../../lib/map-config';
import {
  MAP_CONNECTOR,
  MAP_LOAD_PHASE,
  MAP_LOAD_TIMEOUT_MS,
  MAP_RELOAD_COOLDOWN_MS,
  MAP_ZOOM,
  type PinHue,
} from '../../constants';
import { publishMapReading, TUNE, tune } from '../../lib/dev-tuning';
import { DevMapProbe } from '../../dev/DevMapProbe';
import { Icon, type IconName } from '../Icon';
import { MapDiagnostic } from './MapDiagnostic';
import { ErrorState } from '../feedback/ErrorState';
import { t } from '../../i18n/he';
import './map-pane.css';

/** The one `<Map>` id, so sibling controls can reach the instance via `useMap`
 *  without being rendered inside the canvas div. */
const MAP_ID = 'waypoint-map';

/** A stable empty default for `results`, for the same reason `noop` below is stable. */
const EMPTY_RESULTS: readonly MapResultPin[] = [];

/** Tier → the class that draws it, mirroring `.place`'s own vocabulary so a badge
 *  and a teardrop are one visual system by construction: `soft` is the dashed
 *  provisional, `ambient` the quiet backdrop, `skipped` the desaturated behind-you
 *  treatment. `upcoming` needs no modifier — it is the plain category pin.
 *
 *  Two tiers, two classes each, because two things are being said (ADR-0130 §3):
 *  `aside` is the subordinate RATIO both out-of-scope populations take, and the
 *  second class is the paint — a `ghost` is hollow because it is another day's, a
 *  `shelf` maybe wears the same `soft` grammar as any other maybe because that is
 *  what it is. Keeping the ratio in its own class is also what lets the dot tier name
 *  the pair in one selector instead of two.
 *
 *  One name to read carefully: this `skipped` is the CLOCK's tier, and its row
 *  counterpart is `.place.behind`. A row's own `.place.skipped` is the narrower claim —
 *  a human said this did not happen (ADR-0117 §4) — and the canvas draws THAT as a mark
 *  in the pin's body rather than as a second paint (`PIN_OUTCOME_ICON` below), so the
 *  tier stays one treatment and the outcome stays one axis.
 *
 *  **The PAINT lives here and the RATIO does not** (ADR-0131 §4). `aside` used to ride
 *  along in these strings, which was right while the only reason to be subordinate was
 *  the day scope. A live query is a second reason to be IN it: search is scope-blind by
 *  rule, so a match from another day is what you asked for. The paint still says _what
 *  it is_ (hollow = another day, which is the answer to "which day?"); the ratio says
 *  _how much it is claiming_, and that is the caller's call. So the pin carries `aside`
 *  as its own flag and this map is paint only. */
const PIN_TIER_PAINT: Record<PinTier, string> = {
  [PIN_TIER.upcoming]: '',
  [PIN_TIER.idea]: 'soft',
  [PIN_TIER.ambient]: 'ambient',
  [PIN_TIER.behind]: 'skipped',
  [PIN_TIER.shelf]: 'soft',
  [PIN_TIER.ghost]: 'ghost',
};

/** ── WHAT HAPPENED HERE (ADR-0137, keeping ADR-0117 §1's promise on the canvas) ──────
 *  One fact, drawn in **two places**, because the two tiers that can carry it have
 *  different room — and giving each the space it has is what stops either one paying for
 *  the mark:
 *
 *  - **A ghost takes it in the CENTRE.** A ghost is hollow by design (no fill, no glyph,
 *    no number, because nothing of this day is in it), so its middle is empty and the mark
 *    costs it nothing. It also gets the biggest mark on the ladder, which the smallest pin
 *    on the ladder needs. Drawn as a coloured STROKE so the ghost stays an outline.
 *  - **A filled pin takes it on the SHOULDER, in the number's own slot**, and **keeps its
 *    category glyph** — that glyph is how you tell one grey pin from another, which is
 *    exactly what the first pass got wrong by trading it away. The number is what gives
 *    way instead (ADR-0137 §2): a settled stop's position in the day is spent, since you
 *    are no longer going to it in any order, and one badge reads cleaner than two.
 *
 *  **Green and red, and this is on-budget rather than an exception.** An outcome is a
 *  status, which is what `--ok`/`--miss` are reserved for (ADR-0028 / rule 4), and it is
 *  what the row's own tags already use — so the two halves of the split now agree on the
 *  colour as well as the words. The first pass claimed colour was impossible here, but
 *  that was only true of ITS placement: the `saturate(.3)` that flattens green and red to
 *  one olive lives on `.pin-b`, and neither of these marks is inside it (a ghost has no
 *  filter at all, and the shoulder badge is `.pin-b`'s sibling).
 *
 *  Colour is **additive, never the carrier**: ✓ and ✕ differ in shape for anyone who
 *  cannot separate the hues, and `PIN_OUTCOME_LABEL` puts it in words for anyone who
 *  cannot see the pin. */
const PIN_OUTCOME_ICON: Record<PinOutcome, IconName> = { done: 'check', skipped: 'skip' };

/** …and the same fact in words, for the pin's accessible name. A mark is invisible to a
 *  screen reader, so the one surface that answers in shapes has to answer in the app's own
 *  words too — the day view's `היינו`/`דילגנו`, which is what the row shows. */
const PIN_OUTCOME_LABEL: Record<PinOutcome, string> = {
  done: t.event.didThis,
  skipped: t.event.skipped,
};

/** One pin, entirely in primitives. No `PlaceUsage`, no `Place`, no state — which
 *  is what lets a clock tick diff to nothing (§6). */
export interface MapPin {
  placeId: string;
  lat: number;
  lng: number;
  hue: PinHue;
  /** The category glyph. A ghost drops it (no fill to sit on), so it may be ''. */
  glyph: string;
  /** **The photograph that fills the pin's head** (ADR-0167 §16, treatment B), already
   *  origin-prefixed by the screen — or absent, which is the majority of pins and draws the
   *  glyph exactly as it always did.
   *
   *  Resolved by the same `badgePhoto` the list row uses, so §2's rule (a picked icon beats a
   *  fetched photo) cannot hold on one surface and not the other. **Whether it is DRAWN is
   *  CSS's call, not this flag's:** the photo is drawn wherever the pin still draws its glyph
   *  and dropped where the glyph is, on the dot tier — one axis, in `map-pane.css`, so a stop
   *  change or a zoom costs no prop, no state and no marker re-diff (ADR-0121 §4). The canvas's
   *  height was a second axis until ADR-0167 §16's third amendment retired it. */
  photoUrl?: string;
  tier: PinTier;
  /** What a human said happened here, on the two tiers that can have an outcome at all
   *  (`pinOutcome`). A ghost draws it in the empty centre only it has; a filled pin draws
   *  it in its shoulder badge, where it replaces the number — see `PIN_OUTCOME_ICON`.
   *  Absent is ADR-0117 §1's third state, and the commonest one: nobody settled it. */
  outcome?: PinOutcome;
  /** The subordinate SIZE both out-of-scope populations take (ADR-0130 §3's ratio).
   *  Normally `isAsidePin(tier)`, but a live query withdraws it (ADR-0131 §4): search
   *  is scope-blind, so the day scope is not what chose the set and a match must not be
   *  drawn as the thing you are not looking at. The paint is unaffected — a promoted
   *  ghost is still hollow, because it is still another day's. The camera reads THIS,
   *  not the tier, so the `frame` control frames the matches for free; the amber cues
   *  and the day connector deliberately keep reading the tier. */
  aside?: boolean;
  /** **This pin is a result of the live query** — either half of the search found it
   *  (session 168). Its one reader is the errand's context demotion, which asks "is this
   *  what you are choosing" and must not answer "no" about a place your search just
   *  surfaced. On the PIN rather than on the screen for the same reason `aside` is: a
   *  screen-wide switch would promote whatever else the canvas carries, and separating the
   *  two is what ADR-0131 §4 was for. */
  match?: boolean;
  /** Position in the day's sequence, or absent when it has none (§6). */
  order?: number;
  /** **Which transition is next here** — `צ׳ק-אין`, `המראה`, … (`pinTransition`,
   *  ADR-0141). It OWNS the tag slot when present, because it says what `עכשיו` /
   *  `היעד הבא` say and one thing more; those two stay as the fallback for a place with
   *  no bracketed end. Which end it is carries pre-vs-during, so there is no second
   *  field for the phase. Absent on `behind`, on a mid-span night, on every aside tier,
   *  and — unless the pin is one of the two amber cues — outside a day scope, which is
   *  the screen's call for the reason `order` is (see `Map.tsx`). */
  transition?: string;
  /** The single amber time-anchor the canvas allows — Trip mode, exactly one pin. */
  nextStop?: boolean;
  /** You are here, right now. The canvas's second amber cue, and the only animated
   *  thing on it: `nextStop` waits still, this one pulses (ADR-0109's 2026-07-27
   *  amendment). Mutually exclusive with `nextStop` — an event is `now` or
   *  `upcoming`, never both — so no pin ever draws the two together. */
  nowStop?: boolean;
  selected?: boolean;
  /** Accessible name: the pin is a real button, so it needs one. */
  label: string;
}

/** An unsaved Google result on our canvas (ADR-0132 §6) — a RING, and deliberately not
 *  a `MapPin`. The prominence ladder expresses DEGREE (six tiers, two amber cues,
 *  selection, a zoom-keyed dot) and "not ours yet" is a difference of KIND, so it takes
 *  the one axis nothing else uses: silhouette. Being off the ladder is also why it needs
 *  none of the fields above — no tier, no hue, no order, no amber. */
export interface MapResultPin {
  /** Google's own id. Never a `placeId`: there is no row for this yet. */
  googlePlaceId: string;
  lat: number;
  lng: number;
  label: string;
  selected?: boolean;
}

/** **The spot the open form is about** (ADR-0147 §5) — a marker for a place that does not exist
 *  yet. Only the LONG PRESS needs one: it lands on bare canvas, so nothing else says where it
 *  went. It takes **our own pin**, dashed because it is provisional (ADR-0011's soft grammar
 *  reused rather than a new colour) and in the category's hue, so choosing a category moves it.
 *
 *  The other two sources need nothing. A search result is already a ring in `results`, and a
 *  renamed place already has its own selected pin — a second marker on either would say the same
 *  thing twice, which is the mess ADR-0125 §6 refused.
 *
 *  It carried a `ringed` variant for the tapped sight until ADR-0148 §6 removed that source; the
 *  variant went with it rather than being left for a caller that no longer exists. */
export interface MapDraftMarker {
  lat: number;
  lng: number;
  /** The category's hue and glyph, so the marker under the form answers its category pills. */
  hue?: PinHue;
  glyph?: string;
}

export interface MapPaneProps {
  config: MapsConfig;
  pins: readonly MapPin[];
  /** Unsaved Text Search results, drawn as rings (ADR-0132 §6). Memoized on a content
   *  key by the caller, exactly like `pins` — same per-second-tick rule. */
  results?: readonly MapResultPin[];
  /** A ring was tapped: the screen raises its card with the add action. */
  onSelectResult?: (googlePlaceId: string) => void;
  /** Where the device is, when near-me is granted. */
  me?: LatLng;
  /** The day's stops in order — a dashed neutral connector, Plan mode + day scope
   *  only (§10). Absent (or under two points) draws nothing. */
  connector?: readonly LatLng[];
  /** Changes exactly when a control changed the pin SET, so the camera re-frames
   *  then and at no other time (§7). */
  setSignal: string;
  /** The camera's first frame, before any fit — a map must be constructed with
   *  some centre, and the first fit replaces it. */
  defaultCentre?: LatLng;
  onSelectPin: (placeId: string) => void;
  /** The canvas background was tapped: the selection clears, which is the map idiom and
   *  the place card's own dismissal (ADR-0122 §7). Nothing registers with the back
   *  stack — the card is not an overlay, for the same reasons the sheet is not. */
  onCanvasTap: () => void;
  /** **A press held still, and what it was held on** — make a place here (ADR-0147 §1), or
   *  act on the pin under the finger (ADR-0157 §2). One prop for both because it is one
   *  gesture: which act it is depends only on whether it landed on a place, and the screen
   *  is where both acts live. Absent — offline, or on the list-only path — the gesture is
   *  never armed at all, which is the "absent, not disabled" rule the pane already follows
   *  for everything Google-shaped (ADR-0121 §11). */
  onHold?: (at: LatLng, placeId?: string) => void;
  /** The spot the open make/rename form is about. Memoized on a content key by the caller,
   *  exactly like `pins` and `results` — same per-second-tick rule. */
  draftMarker?: MapDraftMarker | null;
  /** The viewport settled: the `באזור` readout recomputes here and never during a
   *  pan (§9 — a number churning under a moving finger is noise). */
  onViewChange: (bounds: MapBounds | null) => void;
  /** How many of our places are on the canvas right now, `null` before the first
   *  idle. Zero says so out loud rather than leaving an empty canvas unexplained. */
  areaCount: number | null;
  /** The list is currently ordered by the area (ADR-0126 §5). A primitive, so the
   *  memo still holds — and the ONLY thing it drives is the readout's own pressed
   *  state, which `aria-pressed` cannot express in CSS the way `data-view` can. */
  areaSorted: boolean;
  /** The readout was tapped: order the in-view places first. The intent lives in the
   *  SCREEN, like `sortByDistance` — nothing about it reaches the map instance. */
  onAreaSort: () => void;
  /** Somewhere the camera has been **asked to go**, and whether that may zoom — see
   *  `MapArrival`. `frame: true` is either of the two intents that mean "take me to this
   *  one" (ADR-0129 §1): an arrival via `מפה` on an event or a booking, and the place
   *  card's own badge. `frame: false` is a form opening on a point you are already looking
   *  at (ADR-0148 §3). Either way it OWNS the next framing rather than being panned on top
   *  of one, which is what stops the opening fit overwriting it (ADR-0127 §3), and it is
   *  spent once. A selection on its own does NOT come through here. */
  arrival?: MapArrival | null;
  /** The place card is up, so a fit reserves the band it occupies (ADR-0128 §2). A
   *  boolean rather than a height: the number belongs in `constants.ts` with the rest of
   *  the card's geometry, not in the screen. */
  /** **What the place card is occupying at the canvas's bottom, measured** — so a fit never
   *  puts a pin under it (ADR-0122 §7, built in ADR-0128 §2). It replaced a `cardOpen`
   *  boolean plus a constant, which was sized for a selected row and therefore wrong by
   *  ~140px for the make/rename form (ADR-0148 §3). 0 when no card is up. */
  cardReserve?: number;
  /** The same band, READ when the camera moves — see `Map.tsx`'s `readCardReserve`. The
   *  number above is a signal and lags a commit; this is the measurement. */
  cardReserveAt?: () => number;
  /** Locate was tapped with no fix to centre on. The camera half stays here (it needs
   *  the map instance); the permission ladder is the screen's, because that is where
   *  `useGeolocation` and the pre-prompt live (ADR-0126 §6). */
  onLocate: () => void;
}

/** Below `MAP_ZOOM.DOT_BELOW` every pin degrades to a dot (ADR-0121 §6, finally built).
 *  It is written as a **data attribute on the pane**, imperatively, rather than as
 *  React state or a prop — because CSS can then do the whole degradation and NO marker
 *  re-renders at all. That is the same arrangement ADR-0123 chose for the pin's size (a
 *  `clamp()` the browser resolves against the pane) and for the same reason: the markers
 *  live in a live `google.maps.Map` where a needless re-diff is the cheap failure and a
 *  re-instantiation is a billed one (§4).
 *
 *  Keyed on `zoom_changed` rather than `idle` so the tier flips DURING a pinch, which is
 *  when it is the answer to anything. A dataset write per zoom event is nothing. */
function PinDensity({ paneRef }: { paneRef: RefObject<HTMLDivElement | null> }) {
  const map = useMap(MAP_ID);
  useEffect(() => {
    if (!map) return;
    const sync = () => {
      const pane = paneRef.current;
      if (!pane) return;
      const zoom = map.getZoom();
      if (zoom != null && zoom < tune(TUNE.zoomDotBelow, MAP_ZOOM.DOT_BELOW))
        pane.dataset.pins = 'dot';
      else delete pane.dataset.pins;
    };
    sync();
    const listener = map.addListener('zoom_changed', sync);
    return () => listener.remove();
  }, [map, paneRef]);
  return null;
}

/** **A map that started and then DIED, which nothing here could previously see**
 *  (field report #35's real cause; ADR-0121's 2026-08-14 amendment).
 *
 *  Reproduced deterministically with `WEBGL_lose_context` — which is what a phone's GPU
 *  does to a long-backgrounded page, and why the trigger was always _"resuming the app
 *  after a while"_ rather than anything about the network, the loader or the bound.
 *
 *  Measured with the context lost: the terrain is **gone**, Google's own logo and
 *  attribution are still drawn, the place list is fine, and the app says **nothing** — no
 *  cue, no error, no recovery, for 26s+. That picture is field report #28 verbatim.
 *
 *  **Why no watchdog caught it:** `MAP_LOAD_TIMEOUT_MS.TILES` guards the FIRST paint, and
 *  `tilesPainted` is already true by the time the context dies, so no timer is armed.
 *  Every earlier fix addressed _the map never started_; this is _the map started, then
 *  died_, which had no detector at all. Session 247 declined to act on this event on the
 *  reasoning that a post-paint loss is "recovered mid-session" — **it is not.**
 *
 *  Three properties, each measured rather than assumed:
 *
 *  - **Capture phase, on the PANE.** `webglcontextlost` does not bubble, but a capture
 *    listener on an ancestor sees it on the way down — so this survives Google replacing
 *    its own canvas, which a listener bound to the canvas would not.
 *  - **Rebuild, not restore.** Calling `restoreContext()` does redraw, at the DEFAULT
 *    world camera — the Atlantic instead of Tokyo. Only a fresh map gets both a live
 *    context and the right camera back.
 *  - **Deferred until visible.** The loss happens while backgrounded, and a map built
 *    while the page is hidden is the failure that started all of this. So the rebuild
 *    waits for a resume that a person is actually present for. */
function ContextLossRecovery({
  paneRef,
  onLost,
}: {
  paneRef: RefObject<HTMLDivElement | null>;
  onLost: () => void;
}) {
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const onContextLost = () => onLostRef.current();
    pane.addEventListener('webglcontextlost', onContextLost, true);
    return () => pane.removeEventListener('webglcontextlost', onContextLost, true);
  }, [paneRef]);
  return null;
}

/** No-op default for the ring callback, hoisted so it is a stable identity — an inline
 *  arrow here would be a fresh prop every render on a screen that ticks every second,
 *  which is the exact hazard §4 exists for. */
const noop = () => {};

function MapPaneInner({
  config,
  pins,
  results = EMPTY_RESULTS,
  onSelectResult,
  me,
  connector,
  setSignal,
  defaultCentre,
  onSelectPin,
  onCanvasTap,
  onViewChange,
  areaCount,
  areaSorted,
  onAreaSort,
  onLocate,
  arrival,
  cardReserve,
  cardReserveAt,
  onHold,
  draftMarker,
}: MapPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  // Is the tap Google is about to report the release of a gesture of OURS? Owned by
  // `useCanvasGestures` and read below — a ref rather than state, because a re-render here
  // re-diffs every marker on a map that ticks every second (ADR-0121 §4).
  const gestureTapRef = useRef(false);
  // **Which of the two long presses this was** (ADR-0157 §2). The recogniser reports the
  // element the finger landed on; a marker is a DOM overlay in this same pane, so resolving
  // `data-pin` here is what stops a hold over a pin dropping a second place on top of it —
  // and it keeps the screen's two handlers free of the DOM. `useCanvasGestures` reads this
  // through a latest-ref, so its identity is free.
  const handleHold = useCallback(
    (at: LatLng, target: EventTarget | null) => {
      const pin = (target as HTMLElement | null)?.closest?.('[data-pin]');
      onHold?.(at, pin?.getAttribute('data-pin') ?? undefined);
    },
    [onHold],
  );
  // **The release of a long press on a pin is not a tap on that pin** (ADR-0157's
  // session-211 amendment). Reported from a phone: holding a pin opened its menu AND raised
  // the place card behind it — two surfaces for one gesture, and the card is the one you
  // did not ask for. It is the exact defect the canvas tap below was already guarded against
  // (ADR-0148's build log), one target over: a marker's click is **Google's callback**, not
  // a DOM event, so the recogniser's `document` swallow cannot reach it and the ref is the
  // only channel that can. Wrapped here rather than in `PinMarker` so the marker stays
  // presentational — and memoized, because a fresh identity re-diffs every marker on a
  // screen that ticks every second (ADR-0121 §4).
  const selectPin = useCallback(
    (placeId: string) => {
      if (gestureTapRef.current) return;
      onSelectPin(placeId);
    },
    [onSelectPin],
  );
  // **A load failure is a third reason to be list-only, never a fourth grammar**
  // (field report #28; ADR-0121's 2026-08-11 amendment). `onError` below catches a
  // failed *script* load (bad key, blocked network), which clears the canvas for
  // `ErrorState` in the pane's own slot — the place list beside it is untouched and
  // still useful.
  //
  // **This is now the SCRIPT failure only** (ADR-0121's 2026-08-13 amendment). The
  // tiles watchdog used to land here too, and that was the defect: expiry unmounted
  // the whole `<APIProvider>` subtree, so an in-flight load was destroyed at the bound
  // and every retry restarted from zero — a map that needed longer than the bound could
  // never finish, no matter how many times you asked. See `tilesLate` below.
  const [mapFailed, setMapFailed] = useState(false);
  // Bumped on retry so the `<APIProvider>` subtree below remounts under a fresh
  // `key` — never reused: ADR-0121 §4's one-instantiation-per-visit invariant means
  // a second `google.maps.Map` is constructed only on a genuinely failed one, never
  // on a rerender, which is exactly what a `key` bump (rather than clearing local
  // state and hoping the failed instance recovers) buys here.
  const [attempt, setAttempt] = useState(0);
  // **The wait is stated, not left blank** (field report #35's other half). Before the first
  // tile paints, the canvas is empty while our own markers already draw on it — the exact
  // picture #28 reported as a failure, and with the bound now at 20s it is a picture a slow
  // network can hold for real seconds. So the pane says which it is. Cheap and honest:
  // `onTilesLoaded` is already the success signal the watchdog waits for, so this is that
  // same boolean rendered, not a second mechanism, and it resets with `[attempt]` below so a
  // retry says "loading" again rather than staying on the failed attempt's last word.
  const [tilesPainted, setTilesPainted] = useState(false);
  // **The tiles took longer than the bound, and that is all it means** (ADR-0121's
  // 2026-08-13 amendment; owner: the 20s bound was _"waiting 20 seconds for nothing"_).
  // Our own markers being on screen proves the script loaded and the map constructed, so
  // while the attempt is still alive we have no evidence of a FAILURE — only of slowness.
  // So the wait's own slot changes its words and gains a way out, the canvas stays live
  // underneath, and `tilesPainted` retires this by itself if the tiles do land.
  //
  // Keeping the instance is also the CHEAPER branch under ADR-0121 §4, which counts
  // instantiations rather than seconds: tearing down and retrying is what buys a second
  // billed load. So this tightens §4 rather than bending it.
  const [tilesLate, setTilesLate] = useState(false);
  const tilesLoadedRef = useRef<(() => void) | null>(null);
  // Dev-only, and the zero point for the elapsed reading below — stamped here rather than
  // anywhere else because `withDeadline` starts counting on the next line, so the number the
  // panel reports and the bound it is judged against cannot drift apart.
  const attemptStartRef = useRef<number | null>(null);

  // ── THE CANVAS SUPERVISOR ───────────────────────────────────────────────────────────
  // **A failed map SAYS so; it does not rebuild itself** (ADR-0121's 2026-08-15
  // amendment). Two things leave a dead canvas and neither has a Google-exposed signal:
  // a context the phone reclaimed while backgrounded, and tiles that never arrived. Both
  // route through `markFailure`.
  //
  // **Automatic rebuilding is gone, on a measurement rather than a taste.** The Maps JS
  // **load quota** read 97% while the pane was failing, and every rebuild is a billed map
  // load (§4) — so an automatic retry against a quota refusal spends the very thing whose
  // exhaustion caused it. Six shipped fixes' worth of loops were accelerating the fault
  // they were meant to cure. What actually recovers this map is a new DOCUMENT, which the
  // owner found before any of them did: _"only restarting the app fixes it"_.
  //
  // `consecutiveRef` counts FAILURES IN A ROW and is what the diagnostic's `fails:` field
  // reports — it read 2 and 3 on the reporting device, so it stays. A paint proves the GPU
  // is fine, so `handleTilesLoaded` resets it.
  const consecutiveRef = useRef(0);
  /** Read inside a visibility handler that must not re-subscribe on every paint. */
  const tilesPaintedRef = useRef(false);
  /** Counted for the diagnostic only: how many times this pane has been resumed. On a
   *  phone the failure arrives with a resume, so "how many" is the fact that says whether
   *  the reading was taken on the first one or the twentieth. */
  const resumesRef = useRef(0);
  /** What `APIProvider.onError` last rejected with — see `handleMapError`. Survives the
   *  retry that clears everything else, because the question it answers is about the
   *  PAGE rather than about this attempt. */
  const lastErrorRef = useRef<string | null>(null);

  /** **The one place a dead map is recorded.** Every detection site routes here, so the
   *  count the diagnostic reports and the cue the person sees can never disagree — which
   *  they did while the increment lived inside the rebuild scheduler and the cue did not.
   *
   *  **`tilesPainted` goes back to false, and that is a fact rather than a trick.** The cue,
   *  the retry and the diagnostic all render under `!tilesPainted` (below), so a context
   *  that dies AFTER the first paint would otherwise set `tilesLate` and show nothing at
   *  all — a blank canvas with no affordance, which is field report #28 verbatim. The old
   *  code hid that by rebuilding; with the rebuild gone, saying so is the whole response,
   *  so it has to be sayable. A map whose context is dead is not painted. */
  const markFailure = useCallback(() => {
    consecutiveRef.current += 1;
    tilesPaintedRef.current = false;
    setTilesPainted(false);
    setTilesLate(true);
  }, []);

  useEffect(() => {
    // A tab coming back is the moment to try again: visible, laid out, someone looking at
    // it. This is also what runs an attempt that came due while the page was hidden.
    const stop = observeVisibility({
      // A resume does not rebuild: coming back to the app is not evidence that spending a
      // billed load will help. Counted, because the diagnostic reads it.
      onResume: () => {
        resumesRef.current += 1;
      },
      // **The one moment a reload is free** — ADR-0185 chose exactly this for the build
      // swap, and for the same reason: nobody is looking, nothing is mid-sentence, and
      // there is no overlay to lose because there is no interaction happening.
      //
      // This is now the ONLY automatic recovery, and it is the only one ever measured to
      // work: a fresh document clears whatever outlives the map object, which is the
      // owner's own workaround done for them — _"restarting the app fixes it"_. It costs
      // one load rather than a loop of them, and `reloadOnce` holds it to once per
      // cooldown so a device that keeps failing degrades to the visible error instead of
      // reloading itself under someone repeatedly.
      onHidden: () => {
        if (consecutiveRef.current > 0 && !tilesPaintedRef.current) {
          reloadOnce(RELOAD_GUARD_KEY.map, MAP_RELOAD_COOLDOWN_MS);
        }
      },
    });
    return stop;
  }, []);

  useEffect(() => {
    setMapFailed(false);
    setTilesPainted(false);
    tilesPaintedRef.current = false;
    setTilesLate(false);
    // **No longer DEV-gated**: the diagnostic reports elapsed time on a real device, and
    // a clock that only exists in development is no use to the one place the answer is.
    // It is a single `performance.now()` per attempt.
    attemptStartRef.current = performance.now();
    // The device-pass capture (§1b, backlog workstream M) rides on this attempt's OWN
    // signals rather than a second probe — cleared here so a retry does not show the
    // FAILED attempt's status while the fresh one is still loading.
    if (import.meta.env.DEV) {
      publishMapReading({
        apiStatus: APILoadingStatus.NOT_LOADED,
        apiError: null,
        tilesLoaded: false,
        tilesLoadedMs: null,
      });
    }
    let live = true;
    withDeadline(
      MAP_LOAD_PHASE.TILES,
      MAP_LOAD_TIMEOUT_MS.TILES,
      () => new Promise<void>((resolve) => (tilesLoadedRef.current = resolve)),
    ).catch((error) => {
      if (!live || !(error instanceof PhaseTimeoutError)) return;
      // Say so, and stop there. The notice below carries a manual retry: a person tapping
      // is a load somebody chose to spend, which is the distinction the removed automatic
      // rebuild could not make.
      markFailure();
    });
    return () => {
      live = false;
      tilesLoadedRef.current = null;
    };
  }, [attempt, markFailure]);
  const handleTilesLoaded = useCallback(() => {
    tilesLoadedRef.current?.();
    tilesLoadedRef.current = null;
    setTilesPainted(true);
    // **A paint is proof the GPU is fine**, so the failure streak resets here. Not doing
    // this is exactly what made the fixed budget a regression.
    tilesPaintedRef.current = true;
    consecutiveRef.current = 0;
    if (import.meta.env.DEV) {
      const started = attemptStartRef.current;
      publishMapReading({
        apiStatus: APILoadingStatus.LOADED,
        tilesLoaded: true,
        tilesLoadedMs: started == null ? null : Math.round(performance.now() - started),
      });
    }
  }, []);
  const handleMapError = useCallback((error: unknown) => {
    setMapFailed(true);
    // **Kept for the diagnostic, not just for DEV.** The owner's sequence — the map dies
    // silently, then a tab switch mounts a fresh pane which errors AT ONCE — means this
    // fires on a page where the script had already loaded successfully once. So what
    // `importLibrary` rejected WITH is the fact that separates a network/referrer failure
    // from a poisoned loader, and it is the one thing no reading has ever carried.
    lastErrorRef.current = String(
      error instanceof Error ? `${error.name}: ${error.message}` : error,
    ).slice(0, 120);
    if (import.meta.env.DEV) {
      publishMapReading({ apiStatus: APILoadingStatus.FAILED, apiError: String(error) });
    }
  }, []);
  // **A retry has to reset the LIBRARY, not just our subtree** (field report #35's third
  // cause, and the one that made the first two fixes look like they had not worked).
  //
  // `@vis.gl/react-google-maps` holds the Maps-API loading status in MODULE state and writes
  // it **once**: the first attempt stamps `serializedApiParams` and only sets `LOADED` while
  // that stamp is still empty. Every later mount therefore takes the "already loaded
  // externally" branch, re-imports `core`/`maps` — successfully — and never moves the status
  // off `FAILED`; a status left at `LOADING` is worse still, since the loader returns early
  // with no error at all. Either way `useApiIsLoaded()` stays false, so vis.gl never calls
  // `new google.maps.Map()`: the pane renders, our markers draw, the loading cue stays up,
  // and 20s later the watchdog reports a failure on an API that is sitting there loaded.
  // A `key` bump builds a fresh component over a dead loader, which is exactly why the
  // Retry did nothing and only a real app restart recovered — the state it clears is the
  // page's, not the component's. **One transient failure poisons the whole page**, and a
  // warm resume onto a just-restored mobile link is the ordinary way to get one (the pane
  // also unmounts and remounts as `offline` flaps there, so the poisoning can happen with
  // nothing on screen to report it).
  //
  // Google's own bootstrap is already retryable — it clears its promise in `script.onerror`
  // — so this global is the single broken link in the chain.
  //
  // ponytail: `__resetModuleState` is vis.gl's own test-only hook. It is the only thing that
  // clears that global, and the alternative is `location.reload()`, which throws away the
  // trip state to fix a canvas. Safe here because `retryMap` is only reachable from
  // `ErrorState`, i.e. with no `APIProvider` mounted to be orphaned by the listener clear.
  // Delete it if vis.gl ever makes the status recoverable.
  /** Sampled at the moment the reading is asked for, never held as state — nothing here
   *  may re-render the marker subtree on a screen that ticks every second (§4). */
  const diagnosticFacts = useCallback(
    () => ({
      failures: consecutiveRef.current,
      resumes: resumesRef.current,
      elapsedMs: attemptStartRef.current == null ? 0 : performance.now() - attemptStartRef.current,
      painted: tilesPaintedRef.current,
      lastError: lastErrorRef.current,
    }),
    [],
  );

  /** The tap on `ErrorState` or on the slow notice. **A deliberate retry reloads the
   *  app**, and it does so FIRST rather than after a budget of rebuilds — because a fresh
   *  `google.maps.Map` over a wedged page was shipped for six sessions and the owner's
   *  verdict was flat: _"Once it's dead, it's dead until you switch to another app"_. No
   *  `canReloadQuietly` gate here: the person tapping IS the consent.
   *
   *  If the cooldown refuses, fall through to the cheaper thing rather than doing nothing
   *  — reset the loader global (session 262's cause) and build one fresh map, which is at
   *  least a load somebody asked for. */
  const retryMap = useCallback(() => {
    if (reloadOnce(RELOAD_GUARD_KEY.map, MAP_RELOAD_COOLDOWN_MS)) return;
    __resetModuleState();
    consecutiveRef.current = 0;
    setAttempt((n) => n + 1);
  }, []);
  return (
    <div className="map-pane" ref={paneRef}>
      {/* OUTSIDE the branch below, deliberately: the pane element is what carries the
          capture listener, and it has to keep hearing a context die even once the canvas
          has been swapped for `ErrorState`. */}
      {/* A lost context still marks the map dead so the pane SAYS so — but it no longer
          builds another one. See `markFailure`: a rebuild is a billed load. */}
      <ContextLossRecovery paneRef={paneRef} onLost={markFailure} />
      {mapFailed ? (
        <>
          <ErrorState size="pane" title={t.map.loadError} onRetry={retryMap} />
          <MapDiagnostic paneRef={paneRef} facts={diagnosticFacts} />
        </>
      ) : (
        <APIProvider key={attempt} apiKey={config.apiKey} onError={handleMapError}>
          <Map
            id={MAP_ID}
            className="map-canvas"
            // Construction-time and never changed: a `mapId` swap is a new map, and
            // a new map is a billed load (§4/§11 — which is also why there are no
            // per-mode map styles).
            mapId={config.mapId}
            // A Map ID holds BOTH a light and a dark style; this is what picks one.
            // Google's default is LIGHT, so without it the night Map ID renders its
            // light slot — the failure that reads exactly like an unimported style
            // (ADR-0158 §12). Construction-time too, and latched by the same memo.
            colorScheme={config.colorScheme}
            defaultCenter={defaultCentre ?? { lat: 0, lng: 0 }}
            defaultZoom={defaultCentre ? MAP_ZOOM.PLACE : MAP_ZOOM.WORLD}
            // Google's controls are Google-chromed, unlabelled and unaware of an RTL
            // page, so: none of them, then add back only what we need (§12). Zoom is
            // the pinch; the one control we add is re-centre, below.
            disableDefaultUI
            // The default demands two fingers inside a scrollable page and shows
            // Google's un-styleable "use two fingers" overlay — a phone-first
            // regression (ADR-0017). The pane is fixed, not inline content, so
            // one-finger pan is unambiguous; the sheet handle owns vertical drags.
            gestureHandling="greedy"
            // **Google's POI labels are looked at, never tapped** (owner, 2026-07-30, on a
            // real phone: _"I want to disable Google maps POI"_ — ADR-0125 §6's amendment).
            // The labels themselves stay: ADR-0125 §6's curated sights set is a cloud style
            // and untouched, so the Eiffel Tower is still drawn and still named. What goes is
            // GOOGLE'S ANSWER to a tap on one — its info window, which lands on the same canvas
            // band our place card owns and belongs to a product this one is not.
            //
            // Nothing needed the tap any more. It was ADR-0147 §4's free input for the
            // "make a place from a sight" source, and ADR-0148 §6 removed that source; what
            // remained was a tap whose whole effect was to open something we did not draw.
            clickableIcons={false}
            onIdle={(event) => onViewChange(readMapBounds(event.map))}
            // The base map's own success signal (see `mapFailed` above) — nothing else on
            // this component says tiles actually painted.
            onTilesLoaded={handleTilesLoaded}
            // A tap on the BACKGROUND clears the selection. An `AdvancedMarker` is a DOM
            // overlay, so a tap on a pin should not reach here at all — the guard is cheap
            // insurance against the one ordering that would matter, selecting a pin and
            // then immediately clearing it.
            //
            // A tap on one of GOOGLE's sight labels (ADR-0125 §6) lands here as an ordinary
            // canvas tap and clears, which is what it always did. What changed is that
            // `clickableIcons={false}` above means it now arrives with **no `placeId`** and
            // with no info window behind it — so the outcome the three previous passes were
            // arguing about (two stacked cards) can no longer arise at all, from either end.
            //
            // **A release that completed one of our own gestures is not a tap.** The long
            // press's release lands here as an ordinary canvas tap, and since ADR-0148 §7 a
            // canvas tap dismisses the form — so a drop opened the form and lifting the finger
            // closed it again. The DOM-level swallow cannot cover this: what arrives here is
            // Google's own callback, and a subscription is not a stream to stop propagating.
            onClick={(event) => {
              const target = event.domEvent?.target as HTMLElement | null;
              if (target?.closest?.('.map-pin')) return;
              if (gestureTapRef.current) return;
              onCanvasTap();
            }}
          >
            {pins.map((pin) => (
              <PinMarker key={pin.placeId} pin={pin} onSelect={selectPin} />
            ))}
            {results.map((result) => (
              <ResultMarker
                key={result.googlePlaceId}
                result={result}
                onSelect={onSelectResult ?? noop}
              />
            ))}
            {me && <MeMarker at={me} />}
            {draftMarker && <DraftMarker marker={draftMarker} />}
            <DayConnector path={connector} scheme={config.colorScheme} />
          </Map>
          {/* **The wait, stated** (field report #35). Until the first tile paints the canvas
            is empty while our own markers already draw on it — the very picture #28 reported
            as a failure — and with the bound at 20s a slow network holds it for real seconds.
            Outside `<Map>` like every other piece of our chrome (the rule right below), over
            the canvas rather than instead of it: Google needs its own div live to paint into,
            so this can never be a branch AROUND the map the way `ErrorState` is. It carries
            no timer and no second signal — `onTilesLoaded` is already what the watchdog
            waits for, so this is that boolean rendered. */}
          {!tilesPainted && (
            <div className="map-loading" role="status">
              {tilesLate ? t.map.loadingSlow : t.map.loading}
              {/* **The way out, in the wait's own slot** (ADR-0121's 2026-08-13 amendment).
                One element with two states rather than a second surface: the words change
                and a control appears, so §11's "one floating object over the canvas" holds
                and there is never a moment with both a wait and an error on screen. The
                button re-enables pointer events for itself alone — the cue around it stays
                `none`, so the pan and the long press still belong to the canvas. */}
              {tilesLate && (
                <>
                  <button type="button" className="map-loading-retry" onClick={retryMap}>
                    {t.feedback.retry}
                  </button>
                  <MapDiagnostic paneRef={paneRef} facts={diagnosticFacts} />
                </>
              )}
            </div>
          )}
          {/* Outside `<Map>` so our chrome is never inside the canvas Google manages,
            but inside `<APIProvider>` so it can still reach the instance by id. */}
          <PinDensity paneRef={paneRef} />
          {/* The device-pass panel's zoom readout (ADR-0146 §5). Deliberately `PinDensity`'s
            shape and position: stateless, null-rendering, one listener — so it cannot
            re-render this subtree, which is what keeps a dev tool clear of a marker
            re-diff. Dropped entirely from a production build with the gate. */}
          {import.meta.env.DEV && <DevMapProbe mapId={MAP_ID} />}
          <MapCameraControls
            paneRef={paneRef}
            pins={pins}
            results={results}
            me={me}
            setSignal={setSignal}
            areaCount={areaCount}
            areaSorted={areaSorted}
            onAreaSort={onAreaSort}
            onLocate={onLocate}
            arrival={arrival}
            cardReserve={cardReserve}
            cardReserveAt={cardReserveAt}
            onHold={handleHold}
            gestureTapRef={gestureTapRef}
          />
        </APIProvider>
      )}
    </div>
  );
}

/** Re-renders only when its props change identity, which the screen keeps stable
 *  across a clock tick — the whole point of the primitive-props rule above. */
export const MapPane = memo(MapPaneInner);

/** Our markup, not `PinElement` (§6). Google's pin gives background/border/glyph —
 *  enough for a solid teardrop, not enough for the dashed-idea / desaturated-past
 *  grammar `.place` already speaks, which is why the content is ours. Static per
 *  place: no React state lives inside a marker. */
/** The ring (ADR-0132 §6, **redrawn in ADR-0168 §2**). No tip — a tip is a claim about
 *  WHICH BUILDING and a result is a candidate. It sits ON the coordinate instead of
 *  pointing at it, which is the truthful geometry for something that is not in the trip
 *  yet, and it is under every trip pin in z-order: what you already have outranks what you
 *  might add.
 *
 *  **The `＋` is gone and the element is empty on purpose** (ADR-0168 §2). Two reasons, and
 *  the second is the load-bearing one: at 28px on a phone the glyph was not legible — the
 *  reading ADR-0132's own device pass owed and could not take — and it described the wrong
 *  gesture, because tapping a ring SELECTS it (the add is a labelled control on the row it
 *  raises). The ring's hole is drawn by CSS, so there is nothing for the markup to carry.
 *  `aria-label` is where the name lives, as it always was. */
const ResultMarker = memo(function ResultMarker({
  result,
  onSelect,
}: {
  result: MapResultPin;
  onSelect: (googlePlaceId: string) => void;
}) {
  return (
    <AdvancedMarker
      position={{ lat: result.lat, lng: result.lng }}
      zIndex={result.selected ? MAP_RESULT_SELECTED_Z : MAP_RESULT_Z}
      title={result.label}
      onClick={() => onSelect(result.googlePlaceId)}
    >
      <div
        className={'map-result' + (result.selected ? ' selected' : '')}
        role="button"
        aria-label={result.label}
      />
    </AdvancedMarker>
  );
});

const PinMarker = memo(function PinMarker({
  pin,
  onSelect,
}: {
  pin: MapPin;
  onSelect: (placeId: string) => void;
}) {
  const cls = [
    'map-pin',
    `cat-${pin.hue}`,
    PIN_TIER_PAINT[pin.tier],
    // The ratio, separately from the paint — see `MapPin.aside`. Absent means "derive it
    // from the tier", which is what the two agree on in every state but a live query, so
    // the flag reads as a WITHDRAWAL rather than as a field every caller must remember.
    // Same `??` shape as `isFramedByCamera`, for the same reason.
    (pin.aside ?? isAsidePin(pin.tier)) && 'aside',
    pin.match && 'match',
    pin.nextStop && 'nextstop',
    pin.nowStop && 'nowstop',
    pin.selected && 'selected',
  ]
    .filter(Boolean)
    .join(' ');
  // WHAT THE TAG SAYS, decided once. The transition word owns the slot when there is one
  // — it says what `עכשיו`/`היעד הבא` say and one thing more (ADR-0141 §1) — and those
  // two remain the fallback for a place with no bracketed end, which is what a restaurant
  // reservation has. `nowStop`/`nextStop` then decide the tag's HUE rather than its words.
  const tagText =
    pin.transition ??
    (pin.nowStop ? t.map.happeningNow : pin.nextStop ? t.map.nextStop : undefined);
  // The mark is silent, so the outcome joins the NAME — `שם · היינו`, the app's own
  // separator. Built here rather than folded into the screen's `label` so the words and
  // the shape they stand in for are written in one place.
  //
  // AND SO DOES THE CUE THE WORD DISPLACED. Once the tag reads `צ׳ק-אאוט`, `עכשיו` is
  // carried visually by the leading dot and the pulse — so the name composes it back in
  // words, and nothing that used to be readable is now only visible (ADR-0141 §6, the
  // same three-carriers arrangement ADR-0137 §3 made for the outcome).
  const cue = pin.nowStop ? t.map.happeningNow : pin.nextStop ? t.map.nextStop : undefined;
  const name = [
    pin.label,
    pin.transition ? cue : undefined,
    pin.outcome && PIN_OUTCOME_LABEL[pin.outcome],
  ]
    .filter(Boolean)
    .join(' · ');
  // WHERE THE ONE MARK GOES, decided once. Two independent conditions is how the first
  // pass drew a ghost's outcome twice — in its centre AND on a shoulder it does not have a
  // number for. Splitting the single `outcome` into two named slots makes the exclusivity
  // a fact of the markup rather than an invariant two JSX guards have to agree on.
  const hasGlyph = pin.glyph !== '';
  const centreMark = hasGlyph ? undefined : pin.outcome;
  const badgeMark = hasGlyph ? pin.outcome : undefined;
  return (
    <AdvancedMarker
      position={{ lat: pin.lat, lng: pin.lng }}
      zIndex={pinZIndex(pin)}
      title={name}
      onClick={() => onSelect(pin.placeId)}
    >
      {/* `data-pin` is how a long press finds out WHICH place it landed on (ADR-0157 §2) —
          the canvas's one recogniser reports the pressed element and the pane resolves it
          here, the same way `data-place` lets a ring tap find its row. */}
      <div className={cls} data-pin={pin.placeId} role="button" aria-label={name}>
        {/* ONE TAG SLOT, one line, and two hues in one geometry (ADR-0141 §3). Amber is
            what a LIVE claim costs and its population is unchanged — the one `nowStop`
            and the one `nextStop`; a planned edge is `plain`, so the tag population can
            grow without the amber budget moving (ADR-0028 / ADR-0105's "an accent, not a
            ground", and ADR-0119's own neutral-tag precedent one surface over).

            `live` is the leading dot, and it is the debt §1 incurs rather than decoration:
            it carries "you are here" now that the word does not, at REST, because
            `App.css` kills the pulse under reduced motion. It is `.map-tag.now`'s own
            dot — itself Home's board blip — so the board, the list and the canvas really
            are the one idiom `map.css` already claims they are. */}
        {tagText && (
          <span
            className={
              'pin-tag' +
              (pin.nowStop || pin.nextStop ? '' : ' plain') +
              (pin.nowStop ? ' live' : '')
            }
          >
            {tagText}
          </span>
        )}
        {/* THE BODY holds whichever of the two the pin has: a glyph if it has one, or the
            outcome mark in the empty centre only a ghost offers. It stays `.pin-g` in both
            cases so the glyph's whole existing treatment — the counter-rotation, the
            size-off-`--pin-u`, and being dropped at the dot tier and under the errand's
            demotion — covers the mark with nothing re-stated. The two are exclusive by
            construction rather than by a rule: a ghost carries no glyph. */}
        <span className="pin-b">
          {/* **The photograph, clipped by an INNER element** (ADR-0167 §16). Never by `.pin-b`
              itself, which deliberately carries no `overflow`: the order counter overhangs it, and
              clipping the head cuts that counter into a quarter-circle (§11.2's trap, which cost a
              release once). Counter-rotated and over-sized, because `.pin-b` is rotated 45° so its
              tip points at the coordinate — the same counter-rotation `.pin-g` does for the glyph,
              at the scale a rotated square needs to cover its own box.
              It is rendered whenever we HAVE one; whether it is DRAWN is the dot tier's call, in
              the same rules that drop the glyph — so a zoom answers it without a re-render. */}
          {pin.photoUrl && (
            <span className="pin-photo" aria-hidden="true">
              <img src={pin.photoUrl} alt="" loading="lazy" decoding="async" />
            </span>
          )}
          {hasGlyph && (
            <span className="pin-g" aria-hidden="true">
              {pin.glyph}
            </span>
          )}
          {centreMark && (
            <span className={`pin-g outcome ${centreMark}`} aria-hidden="true">
              <Icon name={PIN_OUTCOME_ICON[centreMark]} />
            </span>
          )}
        </span>
        {/* ONE SHOULDER BADGE, holding whichever of the two the pin has to say.
            Normally the order, as a number — a line between two stops is symmetric and
            cannot say which end you reach first (§6/§10). Mono, like every other numeral
            in the app; an LTR island, like every other one (ADR-0118).

            **An outcome REPLACES the number** (ADR-0137 §2, owner's call): once a human
            has settled a stop, its position in the day is spent — you are not going to it
            in any order — and one badge per shoulder is visibly cleaner than two. So this
            is a single slot rather than a pair, which is also why the outcome needs no
            geometry of its own.

            A ghost never reaches here: its mark went in the centre, and it carries no
            number either. */}
        {badgeMark ? (
          <span className={`pin-n outcome ${badgeMark}`} aria-hidden="true">
            <Icon name={PIN_OUTCOME_ICON[badgeMark]} />
          </span>
        ) : (
          pin.order != null && (
            <span className="pin-n" dir="auto">
              {pin.order}
            </span>
          )
        )}
      </div>
    </AdvancedMarker>
  );
});

/** "You are here" — the spatial addition ADR-0109 §7 always said Phase 6 would
 *  add for free once near-me was granted. */
const MeMarker = memo(function MeMarker({ at }: { at: LatLng }) {
  return (
    <AdvancedMarker position={at} zIndex={ME_MARKER_Z} title={t.map.near.youAreHere}>
      <span className="map-me" aria-hidden="true" />
    </AdvancedMarker>
  );
});
/** Above every pin: it is the one thing on the canvas that is not a place. */
const ME_MARKER_Z = 1000;

/** THE SPOT THE OPEN FORM IS ABOUT (ADR-0147 §5) — see {@link MapDraftMarker} for why one
 *  source draws a pin and the others a ring. Inert: the form beneath it is the only thing that
 *  acts on this point, so the marker says where and nothing else. */
const DraftMarker = memo(function DraftMarker({ marker }: { marker: MapDraftMarker }) {
  const at = { lat: marker.lat, lng: marker.lng };
  return (
    <AdvancedMarker position={at} zIndex={DRAFT_MARKER_Z}>
      <div className={`map-pin pending cat-${marker.hue ?? 'leisure'}`} aria-hidden="true">
        <span className="pin-b">
          <span className="pin-g">{marker.glyph}</span>
        </span>
      </div>
    </AdvancedMarker>
  );
});
/** Under the device marker and over every place: the point you are naming is what you are
 *  looking at, and nothing already on the trip should hide it. */
const DRAFT_MARKER_Z = 950;

/** The day's order as a dashed neutral line (§10). Dashed because a straight
 *  segment is not the route you will walk — drawing it solid would claim it is —
 *  which also leaves **solid + amber** unspent for a real Routes polyline later.
 *  The Maps API has no `strokeDasharray`, so a dash is a repeating symbol along a
 *  fully transparent stroke. */
const DayConnector = memo(function DayConnector({
  path,
  scheme,
}: {
  path?: readonly LatLng[];
  /** The canvas's OWN slot, not `documentTheme()`. The map latches its style at
   *  mount (§4: a re-instantiation is a billed load), so after a theme flip the
   *  document says dark while the canvas Google is still painting is light.
   *  Taking the scheme from the same latched config the canvas was built from
   *  makes the line and the ground it is drawn on agree by construction. */
  scheme: MapColorScheme;
}) {
  const icons = useMemo(
    () => [
      {
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 1,
          strokeWeight: MAP_CONNECTOR.WEIGHT,
          scale: MAP_CONNECTOR.DASH_SCALE,
        },
        offset: '0',
        repeat: MAP_CONNECTOR.DASH_REPEAT,
      },
    ],
    [],
  );
  if (!path || path.length < 2) return null;
  return (
    <Polyline
      path={[...path]}
      strokeColor={
        scheme === MAP_COLOR_SCHEME.dark ? MAP_CONNECTOR.COLOR.dark : MAP_CONNECTOR.COLOR.light
      }
      strokeOpacity={0}
      icons={icons}
      // It carries no arrowheads: the numbers are the order, and at phone size an
      // arrowhead on a 2.5px dashed line is mush (§10).
      clickable={false}
      zIndex={0}
    />
  );
});

/** The canvas chrome: ONE furniture band — the two camera controls at the inline
 *  start, the `באזור` readout at the inline end — plus the camera itself, which
 *  lives here because it needs a live map instance. Selection is what drives a
 *  focus, so it is read off the pin set rather than plumbed as a second prop: the
 *  screen already said which pin is selected. */
function MapCameraControls({
  paneRef,
  pins,
  results,
  me,
  setSignal,
  areaCount,
  areaSorted,
  onAreaSort,
  onLocate,
  arrival,
  cardReserve,
  cardReserveAt,
  onHold,
  gestureTapRef,
}: {
  paneRef: RefObject<HTMLDivElement | null>;
  pins: readonly MapPin[];
  results: readonly MapResultPin[];
  me?: LatLng;
  setSignal: string;
  areaCount: number | null;
  areaSorted: boolean;
  onAreaSort: () => void;
  onLocate: () => void;
  /** See `MapPaneProps` — the pane hands it straight to the camera. */
  arrival?: MapArrival | null;
  cardReserve?: number;
  cardReserveAt?: () => number;
  /** The long press lives here rather than beside `PinDensity` for the same reason the
   *  drag zoom does: it must drive THIS camera's pane, and the recogniser that owns it is
   *  the same one (ADR-0147 §1). Element-shaped rather than place-shaped: resolving what
   *  the press was ON is the PANE's job (see `MapPaneInner`), not the camera's. */
  onHold?: (at: LatLng, target: EventTarget | null) => void;
  /** Written by the recogniser, read by the canvas's own click handler above: the release of
   *  a completed gesture must not be read as a tap. */
  gestureTapRef: RefObject<boolean>;
}) {
  const map = useMap(MAP_ID);
  // The camera answers to the day's OWN pins, never to the ghost tier: a ghost is a
  // place this day does not contain, so framing it makes the camera chase somewhere
  // you are not going (§6/§7). With the trip's other days scattered across a
  // continent, that is the difference between framing two stops and framing Europe.
  //
  // When the day has no pins of its own, "you" is the only honest frame there is —
  // and passing a single point resolves to a centre at neighbourhood zoom, so this
  // needs no separate branch. With neither, the camera is left alone.
  const points = useMemo(() => {
    const own = pins.filter(isFramedByCamera).map(({ lat, lng }) => ({ lat, lng }));
    if (own.length > 0) return own;
    return me ? [me] : [];
  }, [pins, me]);
  // What is AROUND a framed place, without being anything the camera fits (ADR-0134 §7).
  // Derived here rather than taken as a prop: the pane already has the rings, and one prop
  // that must change in step with another is the fragility §4's memo rules exist to avoid.
  const resultPoints = useMemo(() => results.map(({ lat, lng }) => ({ lat, lng })), [results]);
  const {
    focus,
    reframe,
    showResults,
    locate: locateCamera,
    keepCentred,
    zoomTo,
    stepZoomIn,
  } = useMapCamera(map, {
    points,
    setSignal,
    arrival,
    focusContext: resultPoints,
    // The card's band, so a fit does not put a pin under it (ADR-0128 §2). The hook
    // reads it through a ref, so this changing on a tap re-pads the NEXT fit without
    // re-running the framing effect — i.e. without moving the camera on a pin tap.
    bottomReserve: cardReserveAt ?? cardReserve ?? 0,
  });

  // **The one-finger zoom** (ADR-0145). It lives here rather than beside `PinDensity`
  // because it must drive THIS camera: a second `useMapCamera` would be a second eased
  // driver on one map, which is the invariant ADR-0129 §3 exists to hold. A fresh object
  // per render is fine and deliberate — the hook reads it through a latest-ref, because
  // this screen re-renders every second and re-running the gesture's effect is precisely
  // the bug session 116 spent a round on.
  // The long press that makes a place is the same recogniser's third phase, so it arrives
  // here rather than as a second pipeline (ADR-0147 §1). A fresh callback per render is fine
  // and deliberate for the same reason the object above is: the hook reads it through a
  // latest-ref, because this screen re-renders every second.
  useCanvasGestures(map, { zoomTo, stepZoomIn }, paneRef, onHold, gestureTapRef);

  // Focus pans AND zooms in when the view is too far out to read the place (ADR-0127
  // §1, reversing §7's "focus never zooms" in the one direction that was protecting
  // nothing). Keyed on the selected place, so a re-render — a clock tick, a sheet
  // drag — never re-moves the camera; only a new selection does.
  const selected = pins.find((pin) => pin.selected);
  const selectedId = selected?.placeId;
  const focusRef = useRef<{ lat: number; lng: number } | undefined>(undefined);
  focusRef.current = selected ? { lat: selected.lat, lng: selected.lng } : undefined;
  useEffect(() => {
    if (selectedId && focusRef.current) focus(focusRef.current);
  }, [selectedId, focus]);

  // **AND WHEN THE BAND CHANGES UNDER A SELECTION THAT DID NOT** (ADR-0122 §7's 2026-08-06
  // amendment; owner: _"the card … completely covers the pin"_, then _"switching from full map
  // … to half map half list, the pin is not centered anymore"_). The effect above is keyed on
  // the selection **on purpose** — a re-render must never re-move the camera — which leaves the
  // whole class of changes that are not selections: a card raised over a place chosen earlier,
  // an enrichment growing an open one, and the card LEAVING while the pane shrinks around it.
  //
  // So it is keyed on the two numbers that define the visible band: what the card takes, and how
  // tall the canvas is. The height is **observed rather than derived from the sheet's stop** —
  // the pane's own box is the fact the camera measures against, and reading it directly means a
  // stop this component knows nothing about cannot desynchronise the two.
  //
  // `keepCentred` is within tolerance for a band that barely moved, so the added keys cannot turn
  // an ordinary re-render into a camera move — and it measures against the move it may already
  // have started, so the two keys landing in SEPARATE commits (the pane resizes, then the card
  // renders and is measured) correct each other instead of the first one winning.
  const [canvasH, setCanvasH] = useState(0);
  useEffect(
    () =>
      observeResize(paneRef.current, () =>
        setCanvasH(Math.round(paneRef.current?.getBoundingClientRect().height ?? 0)),
      ),
    [paneRef],
  );
  useEffect(() => {
    if (selectedId && focusRef.current) keepCentred(focusRef.current);
  }, [selectedId, cardReserve, canvasH, keepCentred]);

  // **AND A SETTLED RESULT SET GETS THE SAME TREATMENT** (ADR-0168 §1): at the map extreme
  // a result outside the view left the tab looking like nothing had been found, because the
  // sheet holds no rows there and the ring was the only evidence.
  //
  // Keyed on WHICH results these are and nothing else. That excludes `selected`, which the
  // `results` memo key deliberately includes — so tapping a ring cannot re-move the camera,
  // and the points are read through a latest-ref so a new array identity from the clock tick
  // is not a new set. Exactly the arrangement the selection effect above uses, one
  // population over.
  const resultSignal = results.map((result) => result.googlePlaceId).join('|');
  const resultPointsRef = useRef(resultPoints);
  resultPointsRef.current = resultPoints;
  useEffect(() => {
    if (resultPointsRef.current.length > 0) showResults(resultPointsRef.current);
  }, [resultSignal, showResults]);

  // LOCATE-ONLY (ADR-0126 §6). Both branches do the same job — take me to me — where
  // the one this replaces did two unrelated ones depending on a permission you could
  // not see. Note what it cannot do: `focus` is a camera call and never prompts, and
  // nothing here touches `getCurrentPosition`. Only the screen's ladder can ask, and
  // only through the pre-prompt, which stays the single place allowed to (§12).
  const locate = useCallback(() => {
    // A repeat tap steps one level in from wherever the map IS (#20) — statelessly, so
    // a pinch between taps cannot desynchronise it and no tap count lives anywhere.
    if (me) locateCamera(me);
    else onLocate();
  }, [me, locateCamera, onLocate]);

  // The job the second tap used to do invisibly, now a control that says it: frame
  // exactly what `reframe` already frames. ABSENT when the day has no pins of its
  // own — `points` falls back to `[me]`, which would make this a second locate
  // button wearing a different glyph (derived affordance, ADR-0050).
  const framable = pins.some(isFramedByCamera);
  const frame = useCallback(() => reframe(points), [reframe, points]);

  // Tappable only when there is an area to sort BY. Zero keeps saying so and stays a
  // readout; `null` is "no idle yet", so there are no bounds to snapshot either.
  const areaTappable = areaCount != null && areaCount > 0;

  return (
    <>
      {/* One cluster, so the band's geometry is written once and the
          one-floating-object rule (ADR-0122 §6) needs one selector, not three. */}
      <div className="map-camctl">
        <button
          type="button"
          className="map-recenter"
          aria-label={t.map.locate}
          title={t.map.locate}
          onClick={locate}
        >
          <Icon name="locate" />
        </button>
        {framable && (
          <button
            type="button"
            className="map-frame"
            aria-label={t.map.frameAll}
            title={t.map.frameAll}
            onClick={frame}
          >
            <Icon name="frame" />
          </button>
        )}
      </div>
      {/* The live region WRAPS the control rather than becoming it (ADR-0126 §4):
          one node cannot hold both roles, and `role="status"` would win over
          `role="button"`. This is `StatusBanner`'s own shape — a polite region with a
          control inside it — so the count text exists once in the DOM and what the
          region announces is the button's own words, not a second copy of them. */}
      <div className={'map-areacount' + (areaSorted ? ' on' : '')} role="status" aria-live="polite">
        {areaTappable ? (
          <button
            type="button"
            className="map-areabtn"
            aria-pressed={areaSorted}
            // The ACTION as a description. An `aria-label` would override the visible
            // text, and the visible text has to stay the accessible NAME (§4).
            title={t.map.area.action}
            onClick={onAreaSort}
          >
            <b dir="auto">{areaCount}</b> {t.map.area.suffix}
          </button>
        ) : (
          <span>
            {areaCount === 0 ? (
              t.map.area.none
            ) : (
              <>
                <b dir="auto">-</b> {t.map.area.suffix}
              </>
            )}
          </span>
        )}
      </div>
    </>
  );
}
