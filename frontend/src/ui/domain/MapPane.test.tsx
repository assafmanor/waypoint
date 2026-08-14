// @vitest-environment jsdom
//
// A rendered map cannot be exercised in the suite (ADR-0121 §13), and this does not pretend
// to: `./MapCanvas` is stubbed, so what is under test is the part that is OURS — the pin
// markup and its class grammar, the number, the z-order, the amber cue, the area readout, the
// failure supervisor, and the fact that a clock tick does not re-diff a marker. Whether any of
// it LOOKS right on a real canvas is a human step on a device.
//
// **The stub moved down one layer with ADR-0186, and the suite got better for it.** It used to
// mock `@vis.gl/react-google-maps` — a vendor's four components — and therefore had to model a
// vendor's lifecycle: a page-global loading status, a script-load rejection, `__resetModuleState`.
// All of that is gone. What is stubbed now is our own `MapCanvas` (which has its own test
// file), and the map handed through it is a MapLibre-shaped fake that goes through the REAL
// `cameraMapFor` — so the camera, the gestures and the density probe are exercised against the
// adapter that ships rather than against a hand-written Google dialect.
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../test/pointer-events';
import { useEffect, useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MapCanvasProps } from './MapCanvas';

/** The canvas's own callbacks, hung here so a test can fire them the way the renderer does.
 *  `firstPaint` is the watchdog's input (`onTilesLoaded`'s successor); `unavailable` is the one
 *  terminal signal; `error` is a tile that failed and must change nothing. */
const canvas: {
  firstPaint?: () => void;
  idle?: () => void;
  error?: (error: Error) => void;
  unavailable?: (error: Error) => void;
  props?: MapCanvasProps;
} = {};

type Handler = (event?: unknown) => void;

/**
 * A MapLibre map, in MapLibre's own dialect — `getCenter()` returns PROPERTIES, `getBounds()`
 * answers corner-wise with `getNorth()`/`getSouth()`, the camera is `jumpTo`. `MapPane` wraps it
 * in the real `cameraMapFor`, which is what makes this fake cover the adapter too.
 *
 * **Inert for the CAMERA by default, deliberately**, and this is inherited from the suite it
 * replaces: no bounds and a 0×0 container, so `useMapCamera`'s `apply` bails and a test that
 * says nothing about framing cannot start fitting. A test that wants to see the padding gives
 * it a real box and a viewport.
 */
class FakeMapLibreMap {
  zoom = 14;
  centre = { lat: 0, lng: 0 };
  /** `undefined` by default — a map that has not rendered. Half of what keeps this inert. */
  viewport: { north: number; south: number; east: number; west: number } | null = null;
  /** 0×0 by default: an unsized container has no honest fit. */
  box = { width: 0, height: 0 };
  readonly fits: { padding?: { bottom: number } }[] = [];
  readonly sources = new Map<string, unknown>();
  readonly layers: Record<string, unknown>[] = [];
  removed = 0;
  resizes = 0;
  private readonly container = document.createElement('div');
  /** Keyed by event type on purpose: the camera registers an `idle` retry on this same object,
   *  and a shared handler set would make a pinch fire the framing too. */
  private readonly handlers = new Map<string, Set<Handler>>();

  getZoom() {
    return this.zoom;
  }
  getCenter() {
    return { lat: this.centre.lat, lng: this.centre.lng };
  }
  getContainer() {
    this.container.getBoundingClientRect = () => this.box as DOMRect;
    return this.container;
  }
  getMinZoom() {
    return undefined;
  }
  getMaxZoom() {
    return undefined;
  }
  getBounds() {
    const b = this.viewport;
    if (!b) return undefined;
    return {
      getNorth: () => b.north,
      getSouth: () => b.south,
      getEast: () => b.east,
      getWest: () => b.west,
    };
  }
  jumpTo(at: { center?: [number, number]; zoom?: number }) {
    if (at.center) this.centre = { lat: at.center[1], lng: at.center[0] };
    if (at.zoom != null) this.zoom = at.zoom;
  }
  fitBounds(_bounds: unknown, options?: { padding?: { bottom: number } }) {
    this.fits.push({ padding: options?.padding });
  }
  resize() {
    this.resizes += 1;
  }
  remove() {
    this.removed += 1;
  }
  isStyleLoaded() {
    return true;
  }
  addSource(id: string, source: unknown) {
    this.sources.set(id, source);
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  removeSource(id: string) {
    this.sources.delete(id);
  }
  addLayer(layer: Record<string, unknown>) {
    this.layers.push(layer);
  }
  getLayer(id: string) {
    return this.layers.find((layer) => layer.id === id);
  }
  removeLayer(id: string) {
    const at = this.layers.findIndex((layer) => layer.id === id);
    if (at >= 0) this.layers.splice(at, 1);
  }
  on(type: string, fn: Handler) {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(fn);
    this.handlers.set(type, set);
    return this;
  }
  off(type: string, fn: Handler) {
    this.handlers.get(type)?.delete(fn);
    return this;
  }
  once(type: string, fn: Handler) {
    return this.on(type, fn);
  }
  /** The gesture pipeline reads the zoom off the map, so a pinch is a zoom plus its event.
   *  `zoom` rather than `zoom_changed`: the adapter is what translates the name, and this fake
   *  sits on the MapLibre side of it. */
  pinchTo(zoom: number) {
    this.zoom = zoom;
    this.handlers.get('zoom')?.forEach((fn) => fn());
  }
}

/** The map the next `paint()` hands over. Always present — a test that wants no map is not a
 *  state this pane has any more, since the canvas is ours and constructs synchronously here. */
const mapStub: { current: FakeMapLibreMap } = { current: new FakeMapLibreMap() };

/** `maplibregl.Marker`, reduced to what `MapMarker` uses. **It appends the element to the
 *  map's container**, which is what real MapLibre does and what makes the pins queryable from
 *  `document` — and it adds `.maplibregl-marker`, so the wrapper collision ADR-0186's amendment
 *  found is at least structurally represented. */
class FakeMarker {
  private element: HTMLElement;
  lngLat: [number, number] = [0, 0];
  constructor(options: { element: HTMLElement; anchor?: string }) {
    this.element = options.element;
    this.element.classList.add('maplibregl-marker');
    this.element.dataset.anchor = options.anchor ?? '';
  }
  setLngLat(at: [number, number]) {
    this.lngLat = at;
    this.element.dataset.at = `${at[1]},${at[0]}`;
    return this;
  }
  addTo(map: FakeMapLibreMap) {
    map.getContainer().appendChild(this.element);
    return this;
  }
  remove() {
    this.element.remove();
    return this;
  }
}

const fakeGl = { Marker: FakeMarker } as unknown as typeof import('maplibre-gl');

/** `MapCanvas` stubbed to a plain div that hands over the fake map in an effect — synchronously
 *  as far as the suite is concerned, because RTL's `render` flushes effects. Its own lifecycle
 *  (constructed once, `remove()` on unmount, the first-paint pair, a tile error not being a
 *  death) is `MapCanvas.test.tsx`'s subject, not this file's. */
vi.mock('./MapCanvas', () => ({
  MapCanvas: (props: MapCanvasProps) => {
    canvas.props = props;
    canvas.firstPaint = props.onFirstPaint;
    canvas.idle = props.onIdle;
    canvas.error = props.onError;
    canvas.unavailable = props.onUnavailable;
    const holderRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      // **The fake map's container goes into the document**, because that is where the real
      // renderer's is — markers are appended to it, so a detached container means the pins
      // exist in memory and cannot be queried. Everything the suite asserts about a pin depends
      // on this one line.
      holderRef.current?.appendChild(mapStub.current.getContainer());
      props.onMap(mapStub.current as never, fakeGl);
      return () => props.onMap(null, null);
      // Once per mount, like the real thing: `props` is read fresh above on every render, and a
      // dependency here would hand the map over again on each one.
    }, []);
    return (
      <div data-map ref={holderRef} data-scheme={props.scheme} data-world={props.urls.world} />
    );
  },
}));

import { MapPane, type MapPin } from './MapPane';
import { PIN_TIER } from '../../lib/map-pins';
import { MAP_COLOR_SCHEME } from '../../lib/map-config';
import { mapReading } from '../../lib/dev-tuning';
import {
  DRAG_CLICK_SWALLOW_MS,
  DRAG_HOLD_MS,
  MAP_CONNECTOR,
  MAP_LOAD_TIMEOUT_MS,
  MAP_ZOOM,
} from '../../constants';
import { RELOAD_GUARD_KEY, stampReload } from '../../lib/guarded-reload';
import { t } from '../../i18n/he';

const URLS = { world: '/map/world.pmtiles' };

const pin = (partial: Partial<MapPin> & Pick<MapPin, 'placeId'>): MapPin => ({
  lat: 35.6,
  lng: 139.7,
  hue: 'leisure',
  glyph: '⛩️',
  tier: PIN_TIER.upcoming,
  label: partial.placeId,
  ...partial,
});

// `areaCount` defaults with an explicit `undefined` check rather than `??`: `null` is
// a real state here ("no idle yet"), distinct from zero, and the two render differently.
function paint(props: Partial<Parameters<typeof MapPane>[0]> = {}) {
  return render(
    <MapPane
      scheme={props.scheme ?? MAP_COLOR_SCHEME.light}
      urls={props.urls ?? URLS}
      pins={props.pins ?? [pin({ placeId: 'a' })]}
      setSignal={props.setSignal ?? 'day'}
      onSelectPin={props.onSelectPin ?? vi.fn()}
      onCanvasTap={props.onCanvasTap ?? vi.fn()}
      onViewChange={props.onViewChange ?? vi.fn()}
      areaCount={props.areaCount === undefined ? 1 : props.areaCount}
      areaSorted={props.areaSorted ?? false}
      onAreaSort={props.onAreaSort ?? vi.fn()}
      onLocate={props.onLocate ?? vi.fn()}
      cardReserve={props.cardReserve}
      onHold={props.onHold}
      me={props.me}
      connector={props.connector}
      defaultCentre={props.defaultCentre}
      results={props.results}
      onSelectResult={props.onSelectResult}
      draftMarker={props.draftMarker}
    />,
  );
}

const pins = () => [...document.querySelectorAll('.map-pin')];
/** Tap a pin. **An ordinary DOM click now**, and that is the swap's own simplification: Google
 *  reported a marker tap by CALLING us, a channel no `stopPropagation` could reach, so the pane
 *  needed a ref guard as its only defence (ADR-0157's session-211 amendment). A MapLibre marker
 *  is a plain element we own, so its click is in the same stream everything else is. */
const firePinTap = (pin: Element) => act(() => void fireEvent.click(pin));
const markers = () => [...document.querySelectorAll<HTMLElement>('.map-marker')];
/** The day connector, as it now exists: a line layer on the map, not a `<Polyline>` element. */
const connectorLayer = () =>
  mapStub.current.layers.find((layer) => layer.type === 'line') as
    { paint: Record<string, unknown> } | undefined;

afterEach(() => {
  cleanup();
  mapStub.current = new FakeMapLibreMap();
  canvas.firstPaint = undefined;
  canvas.idle = undefined;
  canvas.error = undefined;
  canvas.unavailable = undefined;
  canvas.props = undefined;
});

describe('MapPane — our markup, not PinElement (ADR-0121 §6)', () => {
  // **What this test asserted before is mostly DELETED rather than ported**, and that is the
  // clearest single measure of the swap. It used to check a mandatory `mapId`, the
  // `colorScheme` that picks one of its two style slots, `disableDefaultUI`, `gestureHandling`
  // and `clickableIcons` — five props that existed to suppress a vendor's chrome, name a cloud
  // style, or pay an admission fee for advanced markers. There is no vendor chrome, no Map ID
  // and no POI layer (ADR-0186 §2), so what is left to assert is what the pane actually
  // decides: one canvas, the scheme, and the ground it reads.
  it('builds exactly one canvas, on the scheme and the archive it was given', () => {
    paint({ scheme: MAP_COLOR_SCHEME.dark });
    expect(document.querySelectorAll('[data-map]')).toHaveLength(1);
    const map = document.querySelector('[data-map]') as HTMLElement;
    expect(map.dataset.scheme).toBe('DARK');
    expect(map.dataset.world).toBe(URLS.world);
    // The opening camera is the pane's to supply, and a map must be constructed with SOME
    // centre — the first fit replaces it (ADR-0127's opening-framing rules, unchanged).
    expect(canvas.props?.zoom).toBe(MAP_ZOOM.WORLD);
    expect(canvas.props?.centre).toEqual({ lat: 0, lng: 0 });
  });

  it('opens on the place zoom when the screen names a centre', () => {
    paint({ defaultCentre: { lat: 35.68, lng: 139.76 } });
    expect(canvas.props?.centre).toEqual({ lat: 35.68, lng: 139.76 });
    expect(canvas.props?.zoom).toBe(MAP_ZOOM.PLACE);
  });

  // **OSM's attribution is a licence obligation, not chrome** (ADR-0186's Consequences), and it
  // is asserted here because it is exactly the kind of requirement that disappears silently:
  // `MapCanvas` switches MapLibre's own control off, so if the pane did not draw this there
  // would be no attribution anywhere and nothing would fail.
  it('draws the OSM attribution the licence requires', () => {
    paint();
    const attribution = document.querySelector('.map-attrib');
    expect(attribution?.textContent).toContain('OpenStreetMap');
  });

  it('marks the pin with the anchor that puts its tip on the coordinate', () => {
    paint({ pins: [pin({ placeId: 'a', lat: 35.6, lng: 139.7 })] });
    const marker = markers()[0];
    expect(marker.dataset.anchor).toBe('bottom');
    expect(marker.dataset.at).toBe('35.6,139.7');
    // **The pin is INSIDE the marker, never IS it** — the collision ADR-0186's 2026-08-13
    // amendment measured: `.maplibregl-marker`'s `position: absolute` and `.map-pin`'s
    // `position: relative` are both one class deep, ours loads last, so a pin handed straight
    // to the renderer loses its positioning and six of them stack into a column.
    expect(marker.classList.contains('map-pin')).toBe(false);
    expect(marker.querySelector('.map-pin')).toBeTruthy();
  });

  it('a pin reads the same cat-* hue vocabulary as the list badge', () => {
    paint({ pins: [pin({ placeId: 'a', hue: 'food' })] });
    expect(pins()[0].className).toContain('cat-food');
    expect(pins()[0].querySelector('.pin-g')?.textContent).toBe('⛩️');
  });

  // The three states `PinElement` cannot draw — which is the whole reason the
  // marker's content is ours. Each mirrors its `.place` counterpart.
  it('each tier wears its `.place` counterpart’s class', () => {
    paint({
      pins: [
        pin({ placeId: 'up' }),
        pin({ placeId: 'idea', tier: PIN_TIER.idea }),
        pin({ placeId: 'amb', tier: PIN_TIER.ambient }),
        pin({ placeId: 'past', tier: PIN_TIER.behind }),
        pin({ placeId: 'ghost', tier: PIN_TIER.ghost, glyph: '' }),
        pin({ placeId: 'shelf', tier: PIN_TIER.shelf }),
      ],
    });
    const cls = (id: string) =>
      (document.querySelector(`[aria-label="${id}"]`) as HTMLElement).className;
    expect(cls('up')).toBe('map-pin cat-leisure');
    expect(cls('idea')).toContain('soft');
    expect(cls('amb')).toContain('ambient');
    expect(cls('past')).toContain('skipped');
    expect(cls('ghost')).toContain('ghost');
    // A ghost is hollow, so it has no glyph to sit on a fill.
    expect(document.querySelector('[aria-label="ghost"] .pin-g')).toBeNull();
    // Two classes each on the two subordinate tiers, because two things are being said
    // (ADR-0130 §3): `aside` is the shared ratio, the other is the paint. A shelf maybe
    // is painted as the maybe it is — dashed, hatched, filled, glyph and all — and only
    // the SIZE says you did not put it in this day.
    expect(cls('shelf').split(' ')).toEqual(
      expect.arrayContaining(['map-pin', 'cat-leisure', 'soft', 'aside']),
    );
    expect(cls('ghost')).toContain('aside');
    expect(cls('shelf')).not.toContain('ghost');
    expect(document.querySelector('[aria-label="shelf"] .pin-g')).toBeTruthy();
  });

  // ── WHAT HAPPENED THERE (ADR-0137) ────────────────────────────────────────────
  // One fact, two homes, because the two tiers that can carry it have different room.
  // The pane is where that split is visible, so it is where it is asserted.
  it('a ghost draws the mark in the centre only IT has free', () => {
    paint({
      pins: [
        pin({ placeId: 'been', tier: PIN_TIER.ghost, glyph: '', outcome: 'done' }),
        pin({ placeId: 'bailed', tier: PIN_TIER.ghost, glyph: '', outcome: 'skipped' }),
        pin({ placeId: 'nobodysaid', tier: PIN_TIER.ghost, glyph: '' }),
      ],
    });
    const mark = (id: string) => document.querySelector(`[aria-label^="${id}"] .pin-g.outcome`);
    // It reuses `.pin-g` — the glyph's own slot — so the counter-rotation, the size and
    // both places that drop the glyph cover it with nothing re-stated.
    expect(mark('been')?.className).toContain('done');
    expect(mark('bailed')?.className).toContain('skipped');
    // ADR-0117 §1's third state: no mark at all, and a hollow pin is the whole claim.
    expect(mark('nobodysaid')).toBeNull();
    // A ghost carries no shoulder badge at all — it has no number, and its mark went to
    // the centre it alone has free.
    expect(document.querySelector('.pin-n')).toBeNull();
  });

  it('a filled pin KEEPS its glyph, and the mark REPLACES its number', () => {
    paint({
      pins: [
        pin({ placeId: 'been', tier: PIN_TIER.behind, glyph: '🍜', order: 1, outcome: 'done' }),
        pin({
          placeId: 'bailed',
          tier: PIN_TIER.behind,
          glyph: '🎟️',
          order: 2,
          outcome: 'skipped',
        }),
        pin({ placeId: 'nobodysaid', tier: PIN_TIER.behind, glyph: '🏛️', order: 3 }),
      ],
    });
    const badge = (id: string) => document.querySelector(`[aria-label^="${id}"] .pin-n`);
    // The glyph is what tells one grey pin from another, which is why it stays — trading
    // it for the mark was the first pass's mistake (ADR-0137's own Alternatives).
    expect(document.querySelector('[aria-label^="been"] .pin-g')?.textContent).toBe('🍜');
    // ONE badge slot, and the outcome takes it: a settled stop's position in the day is
    // spent (ADR-0137 §2). So the number is GONE rather than sitting beside a second badge.
    expect(badge('been')?.className).toContain('done');
    expect(badge('been')?.textContent).toBe('');
    expect(badge('bailed')?.className).toContain('skipped');
    // …and an unsettled passed pin keeps the number, because nothing has spent it.
    expect(badge('nobodysaid')?.textContent).toBe('3');
    expect(badge('nobodysaid')?.className).not.toContain('outcome');
    // The centre variant is the ghost's alone.
    expect(document.querySelector('.pin-g.outcome')).toBeNull();
  });

  // All-days numbers nothing at all (§6), so the badge exists there PURELY for the
  // outcome — which is what stops the mark riding on the number's presence.
  // **THE PHOTOGRAPH ON THE PIN** (ADR-0167 §16, treatment B). What this suite owns is the
  // markup — the two traps it has to avoid are structural, and both cost something once:
  // the clip is on an INNER element (`.pin-b` carries no `overflow`, because the counter
  // overhangs it), and the glyph stays in the DOM for CSS to swap. **Whether the photo is
  // DRAWN is a container query** (`map-pane.css`), so jsdom cannot see it and neither can the
  // hermetic e2e, which has no Maps key: that half is the mockup's measurement and a device
  // pass (ADR-0167 §16).
  it('fills the pin with the photograph it is given, clipped inside the head', () => {
    paint({
      pins: [
        pin({ placeId: 'tower', glyph: '🏛️', photoUrl: '/enrichment/images/enr_1', order: 2 }),
        pin({ placeId: 'ramen', glyph: '🍜' }),
      ],
    });
    const head = document.querySelector('[aria-label^="tower"] .pin-b')!;
    const photo = head.querySelector('.pin-photo')!;
    expect(photo.querySelector('img')?.getAttribute('src')).toBe('/enrichment/images/enr_1');
    // Decorative: the pin's accessible name is the place, and the picture adds nothing to it.
    expect(photo.getAttribute('aria-hidden')).toBe('true');
    expect(photo.querySelector('img')?.getAttribute('alt')).toBe('');
    // The clip is the photo's own box — `.pin-b` must stay unclipped or the counter is cut.
    expect(head.classList.contains('pin-photo')).toBe(false);
    // The counter is still `.pin-b`'s SIBLING, i.e. still free to overhang it.
    expect(document.querySelector('[aria-label^="tower"] > .pin-n')?.textContent).toBe('2');
    // The glyph stays in the markup; the container query hides it where the photo shows.
    expect(head.querySelector('.pin-g')?.textContent).toBe('🏛️');
    // The majority of pins have no photograph and are untouched.
    expect(document.querySelector('[aria-label^="ramen"] .pin-photo')).toBeNull();
  });

  it('draws the badge for an outcome even where nothing is numbered', () => {
    paint({
      pins: [pin({ placeId: 'been', tier: PIN_TIER.behind, glyph: '🍜', outcome: 'done' })],
    });
    expect(document.querySelector('.pin-n.outcome')).toBeTruthy();
  });

  // A mark is invisible to a screen reader, and colour is invisible to plenty of eyes, so
  // the fact has to exist in words too. Shape + colour + words, three carriers, one fact.
  it('the outcome joins the accessible name in the app’s own words', () => {
    paint({
      pins: [
        pin({ placeId: 'been', tier: PIN_TIER.behind, glyph: '🍜', outcome: 'done', label: 'רמן' }),
        pin({ placeId: 'plain', tier: PIN_TIER.behind, glyph: '🍜', label: 'סושי' }),
      ],
    });
    expect(document.querySelector(`[aria-label="רמן · ${t.event.didThis}"]`)).toBeTruthy();
    // …and a pin with nothing to report says only its name, with no dangling separator.
    expect(document.querySelector('[aria-label="סושי"]')).toBeTruthy();
  });

  it('the number is on the pin, and a pin with no position in the day carries none', () => {
    paint({
      pins: [pin({ placeId: 'first', order: 1 }), pin({ placeId: 'idea', tier: PIN_TIER.idea })],
    });
    expect(document.querySelector('[aria-label="first"] .pin-n')?.textContent).toBe('1');
    expect(document.querySelector('[aria-label="idea"] .pin-n')).toBeNull();
  });

  // Gaps are correct and informative: `1, 3` says something is filtered out.
  it('renders the numbers it is given, gaps included', () => {
    paint({ pins: [pin({ placeId: 'a', order: 1 }), pin({ placeId: 'c', order: 3 })] });
    expect([...document.querySelectorAll('.pin-n')].map((n) => n.textContent)).toEqual(['1', '3']);
  });

  it('exactly one pin carries the amber next-stop cue, with its tag', () => {
    paint({
      pins: [
        pin({ placeId: 'next', order: 2, nextStop: true }),
        pin({ placeId: 'other', order: 3 }),
      ],
    });
    const next = document.querySelector('[aria-label="next"]') as HTMLElement;
    expect(next.className).toContain('nextstop');
    expect(next.querySelector('.pin-tag')?.textContent).toBe(t.map.nextStop);
    // Nothing else on the canvas is amber, and no other pin renders the tag text.
    expect(document.querySelectorAll('.pin-tag')).toHaveLength(1);
    expect((document.querySelector('[aria-label="other"]') as HTMLElement).className).not.toContain(
      'nextstop',
    );
  });

  // ── The phase word in the tag (ADR-0141) ────────────────────────────────────
  it('a transition word OWNS the tag slot, and the cue it displaced joins the name', () => {
    paint({
      pins: [
        pin({ placeId: 'hotel', order: 3, nowStop: true, transition: 'צ׳ק-אאוט' }),
        pin({ placeId: 'ramen', order: 4, nextStop: true }),
      ],
    });
    const hotel = document.querySelector('[aria-label^="hotel"]') as HTMLElement;
    const tag = hotel.querySelector('.pin-tag')!;
    // The word says what `עכשיו` said and one thing more, so it replaces it rather than
    // stacking above it — one slot, one line.
    expect(tag.textContent).toBe('צ׳ק-אאוט');
    expect(document.querySelectorAll('.pin-tag')).toHaveLength(2);
    // …and `עכשיו` is not lost, it MOVES: the dot and the pulse carry it visually, the
    // accessible name carries it in words (the ADR-0137 §3 three-carriers arrangement).
    expect(hotel.getAttribute('aria-label')).toBe(`hotel · ${t.map.happeningNow}`);
    // With no bracketed end there is no word, so the two cues stay the fallback — which is
    // what a restaurant reservation gets, and it is unchanged behaviour.
    const ramen = document.querySelector('[aria-label="ramen"]') as HTMLElement;
    expect(ramen.querySelector('.pin-tag')?.textContent).toBe(t.map.nextStop);
    expect(ramen.getAttribute('aria-label')).toBe('ramen');
  });

  it('amber is only the two live cues; a planned edge is the neutral tag', () => {
    paint({
      pins: [
        pin({ placeId: 'live', nowStop: true, transition: 'צ׳ק-אאוט' }),
        pin({ placeId: 'next', nextStop: true, transition: 'המראה' }),
        pin({ placeId: 'later', order: 5, transition: 'צ׳ק-אין' }),
      ],
    });
    const tag = (id: string) =>
      (document.querySelector(`[aria-label^="${id}"]`) as HTMLElement).querySelector('.pin-tag')!;
    // The amber population does not grow: two pins carried it before this change and two
    // carry it after (ADR-0028 / ADR-0105's "an accent, not a ground").
    expect(tag('live').className).not.toContain('plain');
    expect(tag('next').className).not.toContain('plain');
    expect(tag('later').className).toContain('plain');
    // The DOT is the live pin's alone — `nextStop` waits still, and a planned edge is not
    // a claim about the clock at all.
    expect(tag('live').className).toContain('live');
    expect(tag('next').className).not.toContain('live');
    expect(tag('later').className).not.toContain('live');
  });

  it('a pin with neither a word nor a cue renders no tag at all', () => {
    paint({ pins: [pin({ placeId: 'a', order: 1 })] });
    expect(document.querySelectorAll('.pin-tag')).toHaveLength(0);
  });

  // Selection is a separate class so the two COMPOSE: a pin can be both the next
  // stop and the one you just tapped.
  it('selection composes with the amber cue rather than replacing it', () => {
    paint({ pins: [pin({ placeId: 'a', nextStop: true, selected: true })] });
    expect(pins()[0].className).toContain('nextstop');
    expect(pins()[0].className).toContain('selected');
  });

  it('coincident pins get the stated z-order, next stop on top', () => {
    paint({
      pins: [
        pin({ placeId: 'ghost', tier: PIN_TIER.ghost }),
        pin({ placeId: 'next', nextStop: true }),
        pin({ placeId: 'idea', tier: PIN_TIER.idea }),
      ],
    });
    // The z-order is written onto the marker's own element — the wrapper is the renderer's,
    // not React's, so it is set imperatively rather than as a JSX prop.
    const z = (i: number) => Number(markers()[i].style.zIndex);
    expect(z(1)).toBeGreaterThan(z(2));
    expect(z(2)).toBeGreaterThan(z(0));
  });

  // Ghosts are drawn — they are context you can see and tap — while being excluded
  // from what the camera frames (session 134). Both halves matter: dropping them
  // would hide the café you are standing next to.
  it('draws ghosts alongside the day’s own pins', () => {
    paint({
      pins: [pin({ placeId: 'today' }), pin({ placeId: 'other-day', tier: PIN_TIER.ghost })],
    });
    expect(markers()).toHaveLength(2);
    expect(document.querySelector('[aria-label="other-day"]')?.className).toContain('ghost');
  });

  it('a pin tap selects that place', () => {
    const onSelectPin = vi.fn();
    paint({ pins: [pin({ placeId: 'shrine' })], onSelectPin });
    fireEvent.click(markers()[0]);
    expect(onSelectPin).toHaveBeenCalledWith('shrine');
  });

  it('the me dot appears only with a fix, above every pin', () => {
    const { unmount } = paint();
    expect(document.querySelector('.map-me')).toBeNull();
    unmount();
    paint({ me: { lat: 1, lng: 2 } });
    expect(document.querySelector('.map-me')).toBeTruthy();
  });

  // Dashed, neutral, no arrowheads — it says "this is the order", not "this is the route"
  // (§10). **And the dash is REAL now** (ADR-0186 §2): ADR-0121 §10 had to fake one as a
  // repeating symbol along a fully transparent stroke because the Maps API had no dash array,
  // so the assertion changes from "transparent-stroked with icons" to the thing anyone would
  // have written in the first place.
  it('draws the day connector only with two or more stops, dashed and neutral', () => {
    const { unmount } = paint({ connector: [{ lat: 1, lng: 1 }] });
    expect(connectorLayer()).toBeUndefined();
    unmount();
    paint({
      connector: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
    });
    const line = connectorLayer()!;
    expect(line.paint['line-color']).toBe(MAP_CONNECTOR.COLOR.light);
    expect(line.paint['line-dasharray']).toEqual([...MAP_CONNECTOR.DASH]);
    expect(line.paint['line-width']).toBe(MAP_CONNECTOR.WEIGHT);
    // All three stops, in MapLibre's own coordinate order.
    const source = mapStub.current.getSource('wp-connector') as {
      data: { geometry: { coordinates: number[][] } };
    };
    expect(source.data.geometry.coordinates).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  // The dash colour was a TS constant handed to Google, so it sat out the CSS remap entirely
  // and measured 1.01:1 on the night style's land — invisible (ADR-0158 §16). It takes the same
  // scheme the ground was painted from, so the line and the canvas cannot disagree.
  it('takes the connector colour from the canvas it was built for, not the document', () => {
    paint({
      scheme: MAP_COLOR_SCHEME.dark,
      connector: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
    });
    expect(connectorLayer()!.paint['line-color']).toBe(MAP_CONNECTOR.COLOR.dark);
  });

  it('draws no connector when none is given (Trip mode, or all-days scope)', () => {
    paint();
    expect(connectorLayer()).toBeUndefined();
  });

  // The layer and its source are the map's, not React's, so nothing unmounts them for us — and
  // a leak here would stack a second `wp-connector` on the next mount and throw.
  it('takes its layer and source back off the map on unmount', () => {
    const { unmount } = paint({
      connector: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
    });
    expect(mapStub.current.getSource('wp-connector')).toBeTruthy();
    unmount();
    expect(mapStub.current.getLayer('wp-connector-line')).toBeUndefined();
    expect(mapStub.current.getSource('wp-connector')).toBeUndefined();
  });

  // ADR-0106 §4 decided pan/zoom IS the area filter and no chip is ever built. This
  // readout is what finally says so on screen — and zero says so out loud, because an
  // empty canvas with no explanation reads as broken rather than panned-away.
  it('states the area count, and names an empty area rather than showing 0', () => {
    const { unmount } = paint({ areaCount: 6 });
    expect(document.querySelector('.map-areacount')?.textContent).toContain('6');
    expect(document.querySelector('.map-areacount')?.textContent).toContain(t.map.area.suffix);
    unmount();
    paint({ areaCount: 0 });
    expect(document.querySelector('.map-areacount')?.textContent).toBe(t.map.area.none);
  });

  // Tapping the canvas background clears the selection — the map idiom, and the place
  // card's own dismissal (ADR-0122 §7).
  describe('the canvas background clears the selection (ADR-0122 §7)', () => {
    it('a tap on the canvas reports it', () => {
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap });
      fireEvent.click(document.querySelector('[data-map]')!);
      expect(onCanvasTap).toHaveBeenCalledTimes(1);
    });

    // A marker is a DOM child of the pane, so a pin tap really DOES bubble to the pane's own
    // click — which makes `.map-pin` load-bearing rather than cheap insurance the way it was
    // under Google's separate callback. Selecting a pin and instantly clearing it is the
    // ordering this prevents.
    it('a tap on a PIN is not a tap on the canvas', () => {
      const onCanvasTap = vi.fn();
      const onSelectPin = vi.fn();
      paint({ onCanvasTap, onSelectPin });
      fireEvent.click(pins()[0]);
      expect(onSelectPin).toHaveBeenCalledWith('a');
      expect(onCanvasTap).not.toHaveBeenCalled();
    });

    // **The `placeId` case is GONE, not ported** (ADR-0186 §2). Google set `event.detail.placeId`
    // when a tap landed on one of its own POI icons, and "skip when it is set" read like a fix
    // and was the bug twice — so the suite asserted that a tap CARRYING one still cleared. There
    // is no vendor POI layer to tap and no info window behind it, so the outcome three passes
    // argued about cannot arise from either end. What replaces it is the assertion that the
    // pane's own chrome is not the canvas: a tap on a control must not also dismiss the card.
    it('a tap on the pane’s own chrome is not a tap on the canvas', () => {
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap, areaCount: 4 });
      fireEvent.click(document.querySelector('.map-areabtn')!);
      fireEvent.click(screen.getByRole('button', { name: t.map.locate }));
      expect(onCanvasTap).not.toHaveBeenCalled();
      // …and the canvas itself still reports.
      fireEvent.click(document.querySelector('[data-map]')!);
      expect(onCanvasTap).toHaveBeenCalledTimes(1);
    });

    // **The two the first pass missed**, and they are the reason the exclusion is by ROLE rather
    // than by a list of our own class names: the failure chrome lives INSIDE the pane, so under a
    // class list a tap on the retry pill or on `אבחון` also cleared the selection. Under Google
    // this could not arise at all — the canvas reported its own taps and our chrome was never in
    // that stream — so it is a hazard the swap introduced and this is the guard for it.
    it('a tap on the failure chrome is not a tap on the canvas either', () => {
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap });
      act(() => canvas.firstPaint?.());
      // A context death after the paint is what puts the retry and the diagnostic on screen.
      act(() => {
        document
          .querySelector('[data-map]')!
          .dispatchEvent(new Event('webglcontextlost', { bubbles: false }));
      });
      fireEvent.click(screen.getByText(t.map.diagnostic));
      expect(onCanvasTap).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
      expect(onCanvasTap).not.toHaveBeenCalled();
    });

    // The draft marker is the one marker with no role: it is `aria-hidden`, because the form
    // beneath it is what acts on that point (ADR-0147 §5). It still must not read as a tap on the
    // ground, or the release of the gesture that opened the form dismisses it.
    it('a tap on the draft marker is not a tap on the canvas', () => {
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap, draftMarker: { lat: 35.6, lng: 139.7, hue: 'food', glyph: '🍜' } });
      fireEvent.click(document.querySelector('.map-pin.pending')!);
      expect(onCanvasTap).not.toHaveBeenCalled();
    });

    // **The release of one of OUR gestures is not a tap** (ADR-0148's build-log amendment).
    // Reported from a phone: a long press opened the form and lifting the finger closed it
    // again, because since §7 a canvas tap dismisses the form. The seam is what this covers
    // and it is why the test lives here rather than beside the recogniser: `useCanvasGestures`
    // can only prove it armed the guard. Under Google the second channel was unavoidable — a tap
    // arrived as a CALL, which no `stopPropagation` can reach. It is an ordinary DOM click now,
    // but the guard stays: the recogniser's swallow is on `document` and the pane's handler is
    // on the pane, so the pane still hears it first.
    it("ignores the tap fired by the long press's own release", () => {
      vi.useFakeTimers();
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap, onHold: vi.fn() });
      const pane = document.querySelector('.map-pane')!;
      pane.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true, button: 0 }),
      );
      act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
      // Held well past the swallow's own window, which is the reported bug's shape: the guard
      // is armed by the RELEASE, so how long the finger stays down cannot matter.
      act(() => void vi.advanceTimersByTime(DRAG_CLICK_SWALLOW_MS * 2));
      pane.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 100, clientY: 200, bubbles: true, button: 0 }),
      );
      fireEvent.click(document.querySelector('[data-map]')!);
      expect(onCanvasTap).not.toHaveBeenCalled();
      // And only that one: the guard expires, so the next real tap on the canvas still lands.
      act(() => void vi.advanceTimersByTime(DRAG_CLICK_SWALLOW_MS));
      fireEvent.click(document.querySelector('[data-map]')!);
      expect(onCanvasTap).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  // ── THE HOLD REPORTS WHAT IT LANDED ON (ADR-0157 §2) ────────────────────────
  // The recogniser is one machine over the whole pane, and a marker is a DOM overlay INSIDE
  // that pane — so a hold over a pin reaches it exactly as a hold over blank canvas does. It
  // used to be answered the same way too, which is the defect: the gesture dropped a second
  // place on top of the one under your finger. The pane resolves `data-pin` and says which.
  describe('a long press says which place it was on (ADR-0157 §2)', () => {
    // The target is resolved AFTER the paint, so it is a getter: the pin does not exist
    // until the pane has rendered.
    const hold = (targetOf: () => Element) => {
      vi.useFakeTimers();
      const onHold = vi.fn();
      paint({ onHold });
      targetOf().dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true, button: 0 }),
      );
      act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
      vi.useRealTimers();
      return onHold;
    };

    it('carries the pin’s place id when the press landed on a pin', () => {
      const onHold = hold(() => pins()[0]);
      expect(onHold).toHaveBeenCalledTimes(1);
      expect(onHold.mock.calls[0][1]).toBe('a');
    });

    it('carries the id when the press landed on something INSIDE the pin', () => {
      const onHold = hold(() => pins()[0].querySelector('.pin-b')!);
      expect(onHold.mock.calls[0][1]).toBe('a');
    });

    it('carries no id at all when the press landed on the canvas', () => {
      const onHold = hold(() => document.querySelector('[data-map]')!);
      expect(onHold).toHaveBeenCalledTimes(1);
      expect(onHold.mock.calls[0][1]).toBeUndefined();
    });

    // **And the release is not a tap on that pin** (session 211, from a phone): holding a
    // pin opened its menu AND selected the place behind it — two surfaces for one gesture.
    // The canvas tap has been guarded against exactly this since ADR-0148; the marker was
    // not, and it cannot be guarded any other way: Google reports a marker click by CALLING
    // us, so the recogniser's DOM swallow never sees that channel.
    it("ignores the pin tap Google reports for the long press's own release", () => {
      vi.useFakeTimers();
      const onSelectPin = vi.fn();
      paint({ onSelectPin, onHold: vi.fn() });
      const pin = pins()[0];
      pin.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 200, bubbles: true, button: 0 }),
      );
      act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
      // Held past the swallow's own window, because the guard is armed by the RELEASE.
      act(() => void vi.advanceTimersByTime(DRAG_CLICK_SWALLOW_MS * 2));
      pin.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 100, clientY: 200, bubbles: true, button: 0 }),
      );
      firePinTap(pin);
      expect(onSelectPin).not.toHaveBeenCalled();

      // And only that one: the guard expires, so an ordinary tap on a pin still selects.
      act(() => void vi.advanceTimersByTime(DRAG_CLICK_SWALLOW_MS));
      firePinTap(pin);
      expect(onSelectPin).toHaveBeenCalledWith('a');
      vi.useRealTimers();
    });
  });

  // ADR-0126 §6 splits the one control that branched on a permission you could not
  // see. Both are named icon controls, and the pair is not ADR-0109 §1's rejected one:
  // that objection is about confusable silhouettes, which a crosshair and four corner
  // brackets are not.
  it('the two camera controls are named icon controls, not raw glyphs', () => {
    paint();
    for (const name of [t.map.locate, t.map.frameAll]) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg.icon')).toBeTruthy();
      expect(button.textContent).toBe('');
    }
  });

  // Both live in ONE cluster, which is what lets ADR-0122 §6's one-floating-object
  // rule keep working with a single extra selector instead of a third one.
  it('the camera controls are one band, not two independently placed objects', () => {
    paint();
    expect(document.querySelectorAll('.map-camctl')).toHaveLength(1);
    expect(document.querySelectorAll('.map-camctl > button')).toHaveLength(2);
  });

  // `points` falls back to `[me]` when the day has no pins of its own, so a frame
  // control there would be a second locate button wearing a different glyph.
  it('framing is ABSENT when the day has no pins of its own to frame', () => {
    paint({ pins: [pin({ placeId: 'g', tier: PIN_TIER.ghost })] });
    expect(screen.queryByRole('button', { name: t.map.frameAll })).toBeNull();
    expect(screen.getByRole('button', { name: t.map.locate })).toBeTruthy();
  });

  // #19's whole point: locate stops branching on whether there is a fix. With none it
  // reports up so the screen can route to the pre-prompt — which stays the only thing
  // allowed to ask (ADR-0121 §12, amended by ADR-0126 §6).
  it('locate with no fix asks the screen instead of silently re-framing', () => {
    const onLocate = vi.fn();
    paint({ onLocate });
    fireEvent.click(screen.getByRole('button', { name: t.map.locate }));
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('locate with a fix centres and does NOT ask', () => {
    const onLocate = vi.fn();
    paint({ onLocate, me: { lat: 35.6, lng: 139.7 } });
    fireEvent.click(screen.getByRole('button', { name: t.map.locate }));
    expect(onLocate).not.toHaveBeenCalled();
  });

  // ADR-0126 §4: the live region WRAPS the control rather than becoming it. One node
  // cannot hold `role="status"` and `role="button"`, and `role="status"` would win.
  describe('`באזור` is a control and a live region, in two nodes (ADR-0126 §4)', () => {
    it('the region keeps its role and the button sits inside it', () => {
      paint({ areaCount: 7 });
      const region = document.querySelector('.map-areacount')!;
      expect(region.getAttribute('role')).toBe('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      const button = region.querySelector('button')!;
      expect(button.getAttribute('role')).toBeNull();
      // The count text exists ONCE, so what the region announces is the button's own
      // words rather than a second copy of them.
      expect(region.textContent).toBe(button.textContent);
    });

    // The visible text stays the accessible NAME — a voice-control user has to be able
    // to say what they can see — so the action is the DESCRIPTION.
    it('the action is the title, never an aria-label over the count', () => {
      paint({ areaCount: 7 });
      const button = document.querySelector('.map-areabtn')!;
      expect(button.getAttribute('aria-label')).toBeNull();
      expect(button.getAttribute('title')).toBe(t.map.area.action);
      expect(screen.getByRole('button', { name: `7 ${t.map.area.suffix}` })).toBe(button);
    });

    it('tapping it asks the screen to sort, and states that it is on', () => {
      const onAreaSort = vi.fn();
      const { unmount } = paint({ areaCount: 7, onAreaSort });
      const button = document.querySelector('.map-areabtn')!;
      expect(button.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(button);
      expect(onAreaSort).toHaveBeenCalledTimes(1);
      unmount();
      paint({ areaCount: 7, areaSorted: true });
      expect(document.querySelector('.map-areabtn')!.getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelector('.map-areacount')!.className).toContain('on');
    });

    // Sorting by an empty area is a control that does nothing, which ADR-0109's
    // session-105 amendment refused. Before the first idle there are no bounds to
    // snapshot either, so neither state renders a button.
    it('neither an empty area nor a pre-idle count renders a button', () => {
      const { unmount } = paint({ areaCount: 0 });
      expect(document.querySelector('.map-areabtn')).toBeNull();
      expect(document.querySelector('.map-areacount')?.textContent).toBe(t.map.area.none);
      unmount();
      paint({ areaCount: null });
      expect(document.querySelector('.map-areabtn')).toBeNull();
    });
  });

  // The marker-level restatement of "one map per visit": the screen re-renders every
  // second, so a re-render with the SAME pin models must not touch the markers.
  it('a re-render with identical pins reuses the very same marker nodes', () => {
    const same = [pin({ placeId: 'a', order: 1 })];
    const view = paint({ pins: same });
    const before = markers()[0];
    view.rerender(
      <MapPane
        scheme={MAP_COLOR_SCHEME.light}
        urls={URLS}
        pins={same}
        setSignal="day"
        onSelectPin={vi.fn()}
        onCanvasTap={vi.fn()}
        onViewChange={vi.fn()}
        areaCount={1}
        areaSorted={false}
        onAreaSort={vi.fn()}
        onLocate={vi.fn()}
      />,
    );
    expect(markers()[0]).toBe(before);
    expect(document.querySelectorAll('[data-map]')).toHaveLength(1);
  });
});

// ADR-0121 §6 decided this and never built it; ADR-0128 §1 does. Keyed on ZOOM, never
// on the canvas — a pin's size must not change under a pinch, but its tier may — and
// applied entirely in CSS off one data attribute, so NO marker re-renders for it.
describe('the dot tier degrades a pin below a zoom threshold (ADR-0128 §1)', () => {
  const pane = () => document.querySelector('.map-pane') as HTMLElement;

  it('marks the pane when the zoom is below the threshold, and clears it above', () => {
    mapStub.current.zoom = MAP_ZOOM.DOT_BELOW - 1;
    paint();
    expect(pane().dataset.pins).toBe('dot');

    // Pinching in past the threshold restores the full teardrop, during the gesture.
    act(() => mapStub.current.pinchTo(MAP_ZOOM.DOT_BELOW));
    expect(pane().dataset.pins).toBeUndefined();
    act(() => mapStub.current.pinchTo(MAP_ZOOM.DOT_BELOW - 3));
    expect(pane().dataset.pins).toBe('dot');
  });

  // The card's reserve reaches the camera through the PANE, and that wiring is one line
  // — which is exactly how it silently failed to exist the first time. The hook's own
  // test cannot see this path, so it is asserted here.
  it('the place card’s reserve reaches the camera’s padding (ADR-0128 §2)', () => {
    const WIDE = { north: 60, south: 10, east: 160, west: 110 };
    mapStub.current.box = { width: 390, height: 517 };
    mapStub.current.viewport = WIDE;
    const two = [pin({ placeId: 'a' }), pin({ placeId: 'b', lat: 35.9, lng: 139.9 })];
    const { unmount } = paint({ pins: two });
    const plain = mapStub.current.fits.at(-1)!.padding!.bottom;
    unmount();

    mapStub.current.box = { width: 390, height: 517 };
    mapStub.current.viewport = WIDE;
    paint({ pins: two, cardReserve: 160 });
    expect(mapStub.current.fits.at(-1)!.padding!.bottom).toBeGreaterThan(plain);
  });

  // ADR-0128 §1's session-154 amendment: **demote what claims precision, keep what claims
  // priority.** The glyph, the number and the tip answer "which one" and "where exactly",
  // which a 30km view cannot support. The amber cue answers "what matters right now",
  // which no zoom invalidates — so the two time anchors are not degraded at all.
  //
  // jsdom applies no CSS, so what is asserted is the MECHANISM the rule is written in:
  // the degradation is scoped by `:not(.nowstop, .nextstop)`, so those two classes are
  // what carries the exemption and they must reach the markup.
  // The tier is now scoped by `data-scope` on the SCREEN (ADR-0128 §1's session-155
  // amendment), which the pane sits inside — so the pane's own test can only assert that
  // the classes and the flag the rules key on are present. Which pins actually shrink is
  // a CSS question, and jsdom applies no CSS.
  it('the time anchors keep the classes that exempt them from the dot tier', () => {
    mapStub.current.zoom = MAP_ZOOM.DOT_BELOW - 2;
    paint({
      pins: [
        pin({ placeId: 'now', nowStop: true, order: 2 }),
        pin({ placeId: 'next', nextStop: true, order: 3 }),
        pin({ placeId: 'plain', order: 4 }),
      ],
    });
    expect(pane().dataset.pins).toBe('dot');
    const cls = (id: string) =>
      (document.querySelector(`[aria-label="${id}"]`) as HTMLElement).className;
    expect(cls('now')).toContain('nowstop');
    expect(cls('next')).toContain('nextstop');
    expect(cls('plain')).not.toMatch(/nowstop|nextstop/);
  });

  // And they keep the PARTS the rule keeps — the number and the tag are still rendered at
  // dot zoom, because it is CSS that decides who shows them, not the markup.
  it('an exempt pin still renders its number and its tag at dot zoom', () => {
    mapStub.current.zoom = MAP_ZOOM.DOT_BELOW - 2;
    paint({ pins: [pin({ placeId: 'now', nowStop: true, order: 2 })] });
    const el = document.querySelector('[aria-label="now"]')!;
    expect(el.querySelector('.pin-n')?.textContent).toBe('2');
    expect(el.querySelector('.pin-tag')?.textContent).toBe(t.map.happeningNow);
  });

  // The reason it is a data attribute and not a prop or state: the markers are content
  // inside a live `google.maps.Map`, where a needless re-diff is the cheap failure and a
  // re-instantiation is a billed one (ADR-0121 §4).
  it('does not touch a single marker node when the tier flips', () => {
    paint({ pins: [pin({ placeId: 'a' }), pin({ placeId: 'b' })] });
    const before = markers();
    act(() => mapStub.current.pinchTo(MAP_ZOOM.DOT_BELOW - 4));
    expect(pane().dataset.pins).toBe('dot');
    expect(markers()).toEqual(before);
  });
});

// The base map's own load failure (field report #28): the canvas can mount and our own
// markers can render — they are DOM overlays, independent of Google's tile layer — while
// Google's tiles never draw. Two channels feed the pane's `mapFailed` state: `APIProvider`'s
// `onError` (a failed script load) and the `onTilesLoaded` watchdog below (tiles that never
// painted at all). Both replace the canvas with `ErrorState` in the PANE's own slot, never
// the whole tab — this suite only touches `MapPane`, whose box is exactly that slot.
describe('a load failure falls back to ErrorState, in the pane, with a bounded retry', () => {
  afterEach(() => vi.useRealTimers());

  it('a failed script load (APIProvider onError) swaps the canvas for ErrorState', () => {
    paint();
    expect(document.querySelector('[data-map]')).toBeTruthy();
    act(() => canvas.unavailable?.(new Error('boom')));
    expect(document.querySelector('[data-map]')).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(t.map.loadError);
    expect(screen.getByRole('button', { name: new RegExp(t.feedback.retry) })).toBeTruthy();
  });

  // **Tiles past the bound say SLOW, and the attempt survives** (ADR-0121's 2026-08-13
  // amendment). Expiry used to unmount the whole subtree, which destroyed an in-flight load
  // and made a map that needed longer than the bound impossible to ever finish — every retry
  // restarted from zero. Our markers being on screen prove the script loaded, so while the
  // attempt is alive the honest claim is slowness, not failure.
  it('tiles past the bound say the wait is slow, and keep the canvas alive', async () => {
    vi.useFakeTimers();
    paint();
    expect(document.querySelector('[data-map]')).toBeTruthy();
    // The state change that decides this lands from a timer's `.catch`, outside any event
    // React already knows to flush around — `act` is what forces the commit before the
    // assertion below reads the DOM.
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(document.querySelector('[data-map]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(t.map.loadingSlow)).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.feedback.retry) })).toBeTruthy();
  });

  // The payoff of not tearing it down: a load slower than the bound finishes on its own and
  // takes the notice with it, with nobody tapping anything.
  it('a late paint clears the slow notice by itself', async () => {
    vi.useFakeTimers();
    paint();
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(screen.getByText(t.map.loadingSlow)).toBeTruthy();
    act(() => canvas.firstPaint?.());
    expect(screen.queryByText(t.map.loadingSlow)).toBeNull();
    expect(screen.queryByText(t.map.loading)).toBeNull();
    expect(document.querySelector('[data-map]')).toBeTruthy();
  });

  // And the two signals stay apart: only a SCRIPT failure is a failure, and only it takes
  // the canvas away. Collapsing them is what the amendment undid.
  it('a script failure still takes the canvas, where a slow tiles phase does not', async () => {
    vi.useFakeTimers();
    paint();
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(document.querySelector('[data-map]')).toBeTruthy();
    act(() => canvas.unavailable?.(new Error('boom')));
    expect(document.querySelector('[data-map]')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(t.map.loadError);
    expect(screen.queryByText(t.map.loadingSlow)).toBeNull();
  });

  it('tiles loading before the bound never fails at all', async () => {
    vi.useFakeTimers();
    paint();
    act(() => canvas.firstPaint?.());
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(document.querySelector('[data-map]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Backlog workstream M / field report #35: the bound is a heuristic `constants.ts` itself
  // labels unmeasured, so the device pass has to answer how long a SUCCESSFUL paint costs on
  // that phone and network. The panel reads it off production's own `onTilesLoaded` — the
  // signal already here — measured from the same instant the watchdog starts counting.
  it('publishes how long the tiles phase took, for the pass that has to size the bound', async () => {
    vi.useFakeTimers();
    paint();
    expect(mapReading().tilesLoadedMs).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    act(() => canvas.firstPaint?.());
    expect(mapReading().tilesLoadedMs).toBe(2_500);
    // A retry starts a fresh clock rather than carrying the previous attempt's elapsed —
    // the same reason the other three fields are cleared on `[attempt]`. The reload
    // cooldown is spent first so the tap takes the rebuild path this asserts about; a
    // deliberate retry otherwise reloads the document and there is no next attempt here.
    stampReload(RELOAD_GUARD_KEY.map);
    act(() => canvas.unavailable?.(new Error('boom')));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
    expect(mapReading().tilesLoadedMs).toBeNull();
  });

  // Field report #35's other half: a blank canvas with our own pins on it and nothing said
  // is indistinguishable from the failure this suite covers above — and with the bound at
  // 20s a slow network holds that picture for real seconds. The cue rides `onTilesLoaded`,
  // the signal the watchdog already waits for, so there is no second mechanism to drift.
  it('says the wait is a wait until the first tile paints, and stops saying it after', () => {
    paint();
    expect(screen.getByText(t.map.loading)).toBeTruthy();
    act(() => canvas.firstPaint?.());
    expect(screen.queryByText(t.map.loading)).toBeNull();
  });

  it('never says loading and failed at once, and says it again on a retry', () => {
    vi.useFakeTimers();
    paint();
    act(() => canvas.unavailable?.(new Error('boom')));
    // The failure replaced the canvas, so the cue went with it — one answer on screen.
    expect(screen.queryByText(t.map.loading)).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(t.map.loadError);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
    // A fresh attempt is loading again, not still showing the failed one's last word.
    expect(screen.getByText(t.map.loading)).toBeTruthy();
  });

  // ── FIELD REPORT #35's THIRD CAUSE, AND WHY THIS TEST NO LONGER EXISTS ──────────────
  //
  // What stood here asserted that a retry called `__resetModuleState()`. vis.gl kept the
  // Maps-API loading status in module state and wrote it **once**, so one failed or stalled load
  // left it at `FAILED`/`LOADING` for the life of the page: `useApiIsLoaded()` stayed false,
  // `new google.maps.Map()` was never called, and a `key` bump rebuilt the component over a
  // dead loader — the retry that "does nothing", cured only by restarting the app. Reproduced in
  // real Chrome by failing the first Maps script fetch: the retry re-fetched it SUCCESSFULLY and
  // still painted no canvas.
  //
  // **There is nothing to reset.** `maplibre-gl` is bundled and a map is a class instance, so a
  // transient failure writes down no page-global state for the next attempt to inherit. The
  // assertion that replaces it is the one that was always the POINT of the reset: a retry gets a
  // genuinely fresh canvas rather than the failed one it was hoping would recover.
  it('retry builds a NEW canvas rather than reusing the failed one', () => {
    vi.useFakeTimers();
    stampReload(RELOAD_GUARD_KEY.map);
    paint();
    const first = document.querySelector('[data-map]');
    act(() => canvas.unavailable?.(new Error('boom')));
    expect(document.querySelector('[data-map]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
    const second = document.querySelector('[data-map]');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  // **A tile that 404s is not a dead map** (ADR-0186's trap 4). An extract has edges, so a
  // missing tile is an ordinary event — and routing it to `mapFailed` would put the pane into
  // `ErrorState` over one tile at the edge of the archive. It is recorded for the diagnostic and
  // changes nothing else, which is the whole reason `MapCanvas` splits the two callbacks.
  it('a tile error keeps the canvas, and only shows up in the diagnostic', () => {
    paint();
    act(() => canvas.firstPaint?.());
    act(() => canvas.error?.(new Error('pmtiles range failed')));
    expect(document.querySelector('[data-map]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(t.map.loadingSlow)).toBeNull();
    // It did not silently become a failure either — the streak is what the reload gate reads.
    expect(screen.queryByText(t.map.diagnostic)).toBeNull();
  });

  it('records what the tile error SAID, which Google’s loader never told us', () => {
    paint();
    act(() => canvas.error?.(new Error('pmtiles range failed')));
    // Surfaced through the diagnostic, which needs the map to be failing to be offered at all.
    act(() => canvas.unavailable?.(new Error('gone')));
    fireEvent.click(screen.getByText(t.map.diagnostic));
    expect(document.querySelector('.map-diag-out')!.textContent).toContain('err:');
  });

  /* **One way a canvas dies — NOT field report #35's cause**, and the correction matters
     because this comment claimed to be for three sessions. `WEBGL_lose_context` reproduces
     a blank canvas deterministically: a phone reclaims a backgrounded page's GPU context,
     and the tiles watchdog cannot see it because that guards only the FIRST paint. Worth
     handling, and it is real. But the owner's device then read `gl:ok canvas:ok` while
     failing, so on the reporting phone the context was alive and this was not what was
     wrong. Session 247 declined to act on this event; sessions 262-267 over-credited it. */
  describe('a lost GPU context is REPORTED, never rebuilt', () => {
    const setVisibility = (state: 'visible' | 'hidden') =>
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    const hide = () => {
      setVisibility('hidden');
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
    };
    const resume = () => {
      setVisibility('visible');
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
    };
    /** The event as the browser fires it: on the CANVAS, and it does not bubble. */
    const loseContext = () =>
      act(() => {
        (
          document.querySelector('[data-map]') ?? document.querySelector('.map-pane')!
        ).dispatchEvent(new Event('webglcontextlost', { bubbles: false }));
      });
    const stubReload = () => {
      const reload = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload },
        configurable: true,
      });
      window.sessionStorage.clear();
      return reload;
    };

    afterEach(() => setVisibility('visible'));

    it('says the map is broken when the context dies after a paint', () => {
      // **The trap this whole block exists to hold.** The cue, the retry and the diagnostic
      // all render under `!tilesPainted`, so a post-paint death used to set `tilesLate` and
      // show NOTHING — a blank canvas with no affordance, field report #28 verbatim. The
      // old code hid it by rebuilding; with the rebuild gone the cue is the whole response.
      paint();
      expect(screen.queryByText(t.map.loadingSlow)).toBeNull();
      loseContext();
      expect(screen.getByText(t.map.loadingSlow)).toBeTruthy();
    });

    it('hears the event through the CAPTURE phase, since it does not bubble', () => {
      // The listener is on the pane, not the canvas, so it survives Google replacing its
      // own canvas — but that only works because capture reaches a non-bubbling event.
      paint();
      act(() => {
        document
          .querySelector('[data-map]')!
          .dispatchEvent(new Event('webglcontextlost', { bubbles: false }));
      });
      expect(screen.getByText(t.map.loadingSlow)).toBeTruthy();
    });

    /* **The contract that replaced the backoff, and the reason it had to.** Every rebuild
       is a billed map load (ADR-0121 §4); the load quota was measured at 97% while the pane
       was failing, so an automatic retry spent the very thing whose exhaustion caused the
       failure. And it never worked anyway — owner: "Reloading the map (with the button for
       example, or the backoff) doesn't recover the map." */
    it('does NOT build another map, because a rebuild is a billed load', () => {
      vi.useFakeTimers();
      paint();
      const before = document.querySelector('[data-map]');
      loseContext();
      // Well past every delay the retired backoff ever used.
      act(() => void vi.advanceTimersByTime(5 * 60_000));
      expect(document.querySelector('[data-map]')).toBe(before);
    });

    it('does not rebuild on resume either', () => {
      vi.useFakeTimers();
      paint();
      const before = document.querySelector('[data-map]');
      hide();
      loseContext();
      resume();
      act(() => void vi.advanceTimersByTime(5 * 60_000));
      expect(document.querySelector('[data-map]')).toBe(before);
    });

    it('counts each failure for the diagnostic, even though it never retries', () => {
      paint();
      loseContext();
      loseContext();
      fireEvent.click(screen.getByText(t.map.diagnostic));
      // The count used to be incremented inside the rebuild scheduler, so deleting that
      // would have silently zeroed the one field that read 2 and 3 on the owner's phone.
      expect(document.querySelector('.map-diag-out')!.textContent).toContain('fails:2');
    });

    /* **The only automatic recovery left, and the only one ever measured to work.** A fresh
       DOCUMENT is what clears whatever outlives the map object — the owner's own workaround,
       done for them. ADR-0185 chose this same moment for the build swap: nobody is looking,
       nothing is mid-sentence, no overlay to lose. */
    it('reloads the app at the next hidden moment, which is when it costs nothing', () => {
      const reload = stubReload();
      paint();
      loseContext();
      expect(reload).not.toHaveBeenCalled();
      hide();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('never reloads under a map that is working', () => {
      // The guard that keeps this from being an app that restarts itself on a whim.
      const reload = stubReload();
      paint();
      hide();
      expect(reload).not.toHaveBeenCalled();
    });

    it('reloads at most once per cooldown, so a bad device degrades to the error', () => {
      const reload = stubReload();
      paint();
      loseContext();
      hide();
      resume();
      loseContext();
      hide();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    /* **The reading nobody has ever had.** Six fixes shipped for #35 on inference because
       every reproduction attempt recovers on a desktop, so the only way to learn what is
       true on the reporting phone is to read it there. */
    it('offers the diagnostic only once the map is failing, never on a working one', () => {
      paint();
      expect(screen.queryByText(t.map.diagnostic)).toBeNull();
      loseContext();
      expect(screen.getByText(t.map.diagnostic)).toBeTruthy();
    });

    it('reads the facts at the tap, and names the one that decides everything', () => {
      paint();
      loseContext();
      fireEvent.click(screen.getByText(t.map.diagnostic));
      const out = document.querySelector('.map-diag-out')!.textContent!;
      // `gl:` is the discriminator: if a fresh canvas cannot get a context, no rebuild
      // can ever work and only a new document will.
      expect(out).toContain('gl:');
      expect(out).toContain('canvas:');
      expect(out).toContain('pane:');
      expect(out).toContain('painted:');
      expect(out).toContain('fails:');
      expect(out).toContain('resumes:');
      // Google's own verdict on the map it built, which splits "the loader is wedged" from
      // "it has a camera and simply is not fetching" — two bugs with opposite fixes.
      expect(out).toContain('sdk:');
    });

    it('says so when tiles never arrive, and does not retry by itself', async () => {
      vi.useFakeTimers();
      paint();
      const before = document.querySelector('[data-map]');
      // The deadline lands from a promise `.catch`, so the timer alone does not flush it.
      await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
      expect(screen.getByText(t.map.loadingSlow)).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
      expect(document.querySelector('[data-map]')).toBe(before);
    });
  });

  /** **A deliberate retry reloads the app, and does it FIRST.** A fresh `google.maps.Map`
   *  over a wedged page shipped for six sessions and the owner's verdict was flat: _"Once
   *  it's dead, it's dead until you switch to another app"_. The person tapping is the
   *  consent, so there is no quiet-moment gate on this one. */
  it('retry reloads the app, which is the only recovery measured to work', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });
    window.sessionStorage.clear();
    paint();
    act(() => canvas.unavailable?.(new Error('boom')));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('retry remounts a fresh map once the reload cooldown refuses', async () => {
    vi.useFakeTimers();
    // The cooldown already spent, so the tap falls through to the cheaper thing rather
    // than doing nothing at all — one load somebody asked for.
    stampReload(RELOAD_GUARD_KEY.map);
    paint();
    act(() => canvas.unavailable?.(new Error('boom')));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
    // The retry swaps `ErrorState` back for a freshly keyed `<APIProvider>` — a NEW
    // watchdog, not the settled/rejected one the failed attempt left behind.
    expect(document.querySelector('[data-map]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    // And the new attempt gets its own full bound rather than inheriting none of it — its
    // own watchdog, not the first one's leftovers, is what reports the wait as slow.
    expect(screen.getByText(t.map.loading)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(screen.getByText(t.map.loadingSlow)).toBeTruthy();
  });
});
