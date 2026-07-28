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
import { memo, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { APIProvider, AdvancedMarker, Map, Polyline, useMap } from '@vis.gl/react-google-maps';
import {
  isAsidePin,
  isFramedByCamera,
  PIN_TIER,
  pinZIndex,
  type PinTier,
} from '../../lib/map-pins';
import { readMapBounds, useMapCamera } from '../../lib/useMapCamera';
import type { LatLng, MapBounds } from '../../lib/map-camera';
import type { MapsConfig } from '../../lib/map-config';
import { MAP_CARD_RESERVE_H, MAP_CONNECTOR, MAP_ZOOM, type PinHue } from '../../constants';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import './map-pane.css';

/** The one `<Map>` id, so sibling controls can reach the instance via `useMap`
 *  without being rendered inside the canvas div. */
const MAP_ID = 'waypoint-map';

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
 *  counterpart is `.place.behind`. A row's own `.place.skipped` is the narrower
 *  claim — a human said this did not happen (ADR-0117 §4) — which the canvas does
 *  not draw, since every behind-you pin looks the same whatever closed it.
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

/** One pin, entirely in primitives. No `PlaceUsage`, no `Place`, no state — which
 *  is what lets a clock tick diff to nothing (§6). */
export interface MapPin {
  placeId: string;
  lat: number;
  lng: number;
  hue: PinHue;
  /** The category glyph. A ghost drops it (no fill to sit on), so it may be ''. */
  glyph: string;
  tier: PinTier;
  /** The subordinate SIZE both out-of-scope populations take (ADR-0130 §3's ratio).
   *  Normally `isAsidePin(tier)`, but a live query withdraws it (ADR-0131 §4): search
   *  is scope-blind, so the day scope is not what chose the set and a match must not be
   *  drawn as the thing you are not looking at. The paint is unaffected — a promoted
   *  ghost is still hollow, because it is still another day's. The camera reads THIS,
   *  not the tier, so the `frame` control frames the matches for free; the amber cues
   *  and the day connector deliberately keep reading the tier. */
  aside?: boolean;
  /** Position in the day's sequence, or absent when it has none (§6). */
  order?: number;
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

export interface MapPaneProps {
  config: MapsConfig;
  pins: readonly MapPin[];
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
  /** A place the camera has been asked to **frame** — either of the two intents that
   *  mean "take me to this one" (ADR-0129 §1): an arrival via `מפה` on an event or a
   *  booking, and the place card's own badge. It OWNS the next framing rather than being
   *  panned on top of one, which is what stops the opening fit overwriting it (ADR-0127
   *  §3), and it is spent once. A selection on its own does NOT come through here — that
   *  pans and never zooms. */
  framePlace?: LatLng | null;
  /** The place card is up, so a fit reserves the band it occupies (ADR-0128 §2). A
   *  boolean rather than a height: the number belongs in `constants.ts` with the rest of
   *  the card's geometry, not in the screen. */
  cardOpen?: boolean;
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
      if (zoom != null && zoom < MAP_ZOOM.DOT_BELOW) pane.dataset.pins = 'dot';
      else delete pane.dataset.pins;
    };
    sync();
    const listener = map.addListener('zoom_changed', sync);
    return () => listener.remove();
  }, [map, paneRef]);
  return null;
}

function MapPaneInner({
  config,
  pins,
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
  framePlace,
  cardOpen,
}: MapPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  return (
    <div className="map-pane" ref={paneRef}>
      <APIProvider apiKey={config.apiKey}>
        <Map
          id={MAP_ID}
          className="map-canvas"
          // Construction-time and never changed: a `mapId` swap is a new map, and
          // a new map is a billed load (§4/§11 — which is also why there are no
          // per-mode map styles).
          mapId={config.mapId}
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
          onIdle={(event) => onViewChange(readMapBounds(event.map))}
          // A tap on the BACKGROUND clears the selection. An `AdvancedMarker` is a DOM
          // overlay, so a tap on a pin should not reach here at all — the guard is cheap
          // insurance against the one ordering that would matter, selecting a pin and
          // then immediately clearing it.
          //
          // A tap on one of GOOGLE's sight icons (ADR-0125 §6) does land here, carrying a
          // `placeId`, and it deliberately clears too: Google answers that tap with its own
          // place card, and ours renders on the same canvas at the `map` stop, so keeping
          // the selection would stack two cards. Replacing a selection when you tap
          // something else is also what every map app does. So do NOT skip on
          // `event.detail.placeId` — that reads like a fix and is the bug.
          onClick={(event) => {
            const target = event.domEvent?.target as HTMLElement | null;
            if (target?.closest?.('.map-pin')) return;
            onCanvasTap();
          }}
        >
          {pins.map((pin) => (
            <PinMarker key={pin.placeId} pin={pin} onSelect={onSelectPin} />
          ))}
          {me && <MeMarker at={me} />}
          <DayConnector path={connector} />
        </Map>
        {/* Outside `<Map>` so our chrome is never inside the canvas Google manages,
            but inside `<APIProvider>` so it can still reach the instance by id. */}
        <PinDensity paneRef={paneRef} />
        <MapCameraControls
          pins={pins}
          me={me}
          setSignal={setSignal}
          areaCount={areaCount}
          areaSorted={areaSorted}
          onAreaSort={onAreaSort}
          onLocate={onLocate}
          framePlace={framePlace}
          cardOpen={cardOpen}
        />
      </APIProvider>
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
    pin.nextStop && 'nextstop',
    pin.nowStop && 'nowstop',
    pin.selected && 'selected',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <AdvancedMarker
      position={{ lat: pin.lat, lng: pin.lng }}
      zIndex={pinZIndex(pin)}
      title={pin.label}
      onClick={() => onSelect(pin.placeId)}
    >
      <div className={cls} role="button" aria-label={pin.label}>
        {/* The tag belongs to the amber cue, so it is rendered only with it —
            un-scoping its styles would still leave the text in the DOM. The two
            cues cannot co-occur on one pin, so this is one slot, not two. */}
        {pin.nowStop && <span className="pin-tag">{t.map.happeningNow}</span>}
        {pin.nextStop && <span className="pin-tag">{t.map.nextStop}</span>}
        <span className="pin-b">
          {pin.glyph && (
            <span className="pin-g" aria-hidden="true">
              {pin.glyph}
            </span>
          )}
        </span>
        {/* The order, as a number — a line between two stops is symmetric and
            cannot say which end you reach first (§6/§10). Mono, like every other
            numeral in the app; an LTR island, like every other one (ADR-0118). */}
        {pin.order != null && (
          <span className="pin-n" dir="auto">
            {pin.order}
          </span>
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

/** The day's order as a dashed neutral line (§10). Dashed because a straight
 *  segment is not the route you will walk — drawing it solid would claim it is —
 *  which also leaves **solid + amber** unspent for a real Routes polyline later.
 *  The Maps API has no `strokeDasharray`, so a dash is a repeating symbol along a
 *  fully transparent stroke. */
const DayConnector = memo(function DayConnector({ path }: { path?: readonly LatLng[] }) {
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
      strokeColor={MAP_CONNECTOR.COLOR}
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
  pins,
  me,
  setSignal,
  areaCount,
  areaSorted,
  onAreaSort,
  onLocate,
  framePlace,
  cardOpen,
}: {
  pins: readonly MapPin[];
  me?: LatLng;
  setSignal: string;
  areaCount: number | null;
  areaSorted: boolean;
  onAreaSort: () => void;
  onLocate: () => void;
  framePlace?: LatLng | null;
  cardOpen?: boolean;
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
  const {
    focus,
    reframe,
    locate: locateCamera,
  } = useMapCamera(map, {
    points,
    setSignal,
    framePlace,
    // The card's band, so a fit does not put a pin under it (ADR-0128 §2). The hook
    // reads it through a ref, so this changing on a tap re-pads the NEXT fit without
    // re-running the framing effect — i.e. without moving the camera on a pin tap.
    bottomReserve: cardOpen ? MAP_CARD_RESERVE_H : 0,
  });

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
