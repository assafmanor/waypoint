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
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { APIProvider, AdvancedMarker, Map, Polyline, useMap } from '@vis.gl/react-google-maps';
import { isFramedByCamera, PIN_TIER, pinZIndex, type PinTier } from '../../lib/map-pins';
import { readMapBounds, useMapCamera } from '../../lib/useMapCamera';
import type { LatLng, MapBounds } from '../../lib/map-camera';
import type { MapsConfig } from '../../lib/map-config';
import { MAP_CONNECTOR, MAP_ZOOM, type PinHue } from '../../constants';
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
 *  One name to read carefully: this `skipped` is the CLOCK's tier, and its row
 *  counterpart is `.place.behind`. A row's own `.place.skipped` is the narrower
 *  claim — a human said this did not happen (ADR-0117 §4) — which the canvas does
 *  not draw, since every behind-you pin looks the same whatever closed it. */
const PIN_TIER_CLASS: Record<PinTier, string> = {
  [PIN_TIER.upcoming]: '',
  [PIN_TIER.idea]: 'soft',
  [PIN_TIER.ambient]: 'ambient',
  [PIN_TIER.behind]: 'skipped',
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
}: MapPaneProps) {
  return (
    <div className="map-pane">
      <APIProvider apiKey={config.apiKey}>
        <Map
          id={MAP_ID}
          className="map-canvas"
          // Construction-time and never changed: a `mapId` swap is a new map, and
          // a new map is a billed load (§4/§11 — which is also why there are no
          // per-mode map styles).
          mapId={config.mapId}
          defaultCenter={defaultCentre ?? { lat: 0, lng: 0 }}
          defaultZoom={defaultCentre ? MAP_ZOOM.SINGLE_PIN : MAP_ZOOM.WORLD}
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
          // then immediately clearing it. Google's own landmark/attraction icons (ADR-0125
          // §6) are neither: they arrive here carrying a `placeId`, and they open Google's
          // place card, so treating one as background would clear our selection behind it.
          onClick={(event) => {
            if (event.detail?.placeId) return;
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
        <MapCameraControls pins={pins} me={me} setSignal={setSignal} areaCount={areaCount} />
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
    PIN_TIER_CLASS[pin.tier],
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

/** The canvas chrome: the re-centre control and the `באזור` readout — plus the
 *  camera itself, which lives here because it needs a live map instance. Selection
 *  is what drives a focus, so it is read off the pin set rather than plumbed as a
 *  second prop: the screen already said which pin is selected. */
function MapCameraControls({
  pins,
  me,
  setSignal,
  areaCount,
}: {
  pins: readonly MapPin[];
  me?: LatLng;
  setSignal: string;
  areaCount: number | null;
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
  const { focus, reframe } = useMapCamera(map, { points, setSignal });

  // Focus pans, it does not zoom (§7). Keyed on the selected place, so a re-render
  // — a clock tick, a sheet drag — never re-pans; only a new selection does.
  const selected = pins.find((pin) => pin.selected);
  const selectedId = selected?.placeId;
  const focusRef = useRef<{ lat: number; lng: number } | undefined>(undefined);
  focusRef.current = selected ? { lat: selected.lat, lng: selected.lng } : undefined;
  useEffect(() => {
    if (selectedId && focusRef.current) focus(focusRef.current);
  }, [selectedId, focus]);

  const recentre = useCallback(() => {
    // With a fix, centre on you; without one, re-frame the filtered set. It never
    // asks for the permission (§12) — that stays the near-me chip's pre-prompt.
    if (me) focus(me);
    else reframe(points);
  }, [me, focus, reframe, points]);

  return (
    <>
      <div className="map-areacount" role="status" aria-live="polite">
        {areaCount === 0 ? (
          t.map.area.none
        ) : (
          <>
            <b dir="auto">{areaCount ?? '-'}</b> {t.map.area.suffix}
          </>
        )}
      </div>
      <button
        type="button"
        className="map-recenter"
        aria-label={t.map.recentre}
        title={t.map.recentre}
        onClick={recentre}
      >
        <Icon name="locate" />
      </button>
    </>
  );
}
