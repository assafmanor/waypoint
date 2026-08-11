// @vitest-environment jsdom
//
// A rendered Google map cannot be exercised in the suite (ADR-0121 §13), and this
// does not pretend to: `@vis.gl/react-google-maps` is stubbed, so what is under test
// is the part that is OURS — the pin markup and its class grammar, the number, the
// z-order, the amber cue, the area readout, and the fact that a clock tick does not
// re-diff a marker. Whether any of it LOOKS right on a real canvas is a human step
// on a machine with the browser key.
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../test/pointer-events';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

/** The four vis.gl pieces the pane uses, as plain DOM. `Map` renders its children
 *  (that is how markers reach the canvas), `AdvancedMarker` renders its content with
 *  the props we set on it, and `useMap` reports no instance — which is the honest
 *  stub, since there is no map. */
const idleHandlers: ((bounds: unknown) => void)[] = [];
/* The `placeId` the next canvas click carries — Google sets it when the tap landed on one
   of ITS icons (a landmark, an attraction) rather than on empty canvas. */
const nextTap: { placeId: string | null } = { placeId: null };
/** Google's own tap handler, kept so a test can fire it the way Google does — as a CALL,
 *  not as a DOM event. That distinction is the whole of the pane's gesture guard: a
 *  `stopPropagation` reaches an event stream and cannot reach a subscription. */
type CanvasClick = (e: { domEvent: unknown; detail: { placeId: string | null } }) => void;
const googleTap: { fire: CanvasClick | undefined } = { fire: undefined };
/** `APIProvider`'s own failure channel (field report #28) — Google's script-load
 *  rejection, surfaced as a plain callback the stub exposes for a test to call. */
const apiError: { fire: ((error: unknown) => void) | undefined } = { fire: undefined };
/** The base map's success signal — a real `<Map>` fires this once tiles paint. A test
 *  calls it (or doesn't, to exercise the watchdog) exactly like `googleTap` above. */
const tilesLoaded: { fire: (() => void) | undefined } = { fire: undefined };
vi.mock('@vis.gl/react-google-maps', () => ({
  // The real enum's shape (`index.d.ts`'s `APILoadingStatus`) — `MapPane` reads it by
  // member name to publish the dev diagnostic, so the stub has to carry the same names.
  APILoadingStatus: {
    NOT_LOADED: 'NOT_LOADED',
    LOADING: 'LOADING',
    LOADED: 'LOADED',
    FAILED: 'FAILED',
    AUTH_FAILURE: 'AUTH_FAILURE',
  },
  APIProvider: ({
    children,
    onError,
  }: {
    children?: ReactNode;
    onError?: (error: unknown) => void;
  }) => {
    apiError.fire = onError;
    return <div data-api>{children}</div>;
  },
  Map: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => (
    <div
      data-map
      data-mapid={String(props.mapId)}
      data-colorscheme={String(props.colorScheme)}
      data-gestures={String(props.gestureHandling)}
      data-nodefaultui={String(props.disableDefaultUI)}
      data-clickableicons={String(props.clickableIcons)}
      // The Maps API hands its click handler a wrapped event carrying the DOM one; the
      // pane reads that to tell a tap on the canvas from a tap on a pin, so the stub
      // has to pass it through in the same shape.
      ref={() => {
        googleTap.fire = props.onClick as CanvasClick | undefined;
        tilesLoaded.fire = props.onTilesLoaded as (() => void) | undefined;
      }}
      onClick={(event) =>
        (props.onClick as CanvasClick | undefined)?.({
          domEvent: event.nativeEvent,
          detail: { placeId: nextTap.placeId },
        })
      }
    >
      {children}
    </div>
  ),
  AdvancedMarker: ({
    children,
    zIndex,
    position,
    onClick,
  }: {
    children?: ReactNode;
    zIndex?: number;
    position?: { lat: number; lng: number };
    onClick?: () => void;
  }) => (
    <div
      data-marker
      data-z={zIndex}
      data-at={position ? `${position.lat},${position.lng}` : ''}
      // TWO CHANNELS, because in the browser there are two. A marker is a DOM overlay, so a
      // tap on it really does produce a DOM click — but the handler `AdvancedMarker` takes is
      // wired to GOOGLE's own marker click, a subscription nothing can `stopPropagation` on.
      // The DOM half keeps the older tests reading naturally; the ref hangs the same callback
      // on the node so a test can fire it the way Google does, which is the only channel that
      // reaches the pane's `gestureTapRef` guard. `googleTap` above is this same trick for the
      // canvas, and for the same reason.
      ref={(el) => {
        if (el) (el as HTMLElement & { gmpClick?: () => void }).gmpClick = onClick;
      }}
      onClick={onClick}
    >
      {children}
    </div>
  ),
  Polyline: (props: Record<string, unknown>) => (
    <div
      data-polyline
      data-points={(props.path as unknown[])?.length}
      data-color={props.strokeColor}
    />
  ),
  // `null` by default — the honest stub, since there is no map — but settable, because
  // the dot tier (ADR-0128 §1) is decided from the map's own zoom. The fake below is
  // deliberately inert for the CAMERA (no bounds, a 0x0 div) so setting it cannot make
  // the other tests start fitting.
  useMap: () => mapStub.current,
}));

const mapStub: { current: FakeZoomMap | null } = { current: null };

class FakeZoomMap {
  zoom = 14;
  /** Keyed by event type on purpose: the camera registers an `idle` retry on this same
   *  object, and a shared handler set would make a pinch fire the framing too. */
  private handlers = new Map<string, Set<() => void>>();
  getZoom() {
    return this.zoom;
  }
  /** `undefined` by default — a map that has not rendered — which is half of what keeps
   *  this stub inert. A padding test has to make it real, or the camera defers to `idle`
   *  and never fits at all. */
  viewport: { north: number; south: number; east: number; west: number } | null = null;
  getBounds() {
    const b = this.viewport;
    if (!b) return undefined;
    return {
      getNorthEast: () => ({ lat: () => b.north, lng: () => b.east }),
      getSouthWest: () => ({ lat: () => b.south, lng: () => b.west }),
    };
  }
  /** 0×0 by default, which is what keeps this stub inert for the camera: an unsized
   *  div has no honest fit, so `apply` bails. A test that wants to see the PADDING
   *  gives it a real box. */
  box = { width: 0, height: 0 };
  getDiv() {
    return { getBoundingClientRect: () => this.box } as unknown as HTMLElement;
  }
  setCenter() {}
  setZoom() {}
  panTo() {}
  centre = { lat: 0, lng: 0 };
  getCenter() {
    const c = this.centre;
    return { lat: () => c.lat, lng: () => c.lng };
  }
  moveCamera(at: { center?: { lat: number; lng: number }; zoom?: number }) {
    if (at.center) this.centre = at.center;
    if (at.zoom != null) this.zoom = at.zoom;
  }
  readonly fits: { padding?: { bottom: number } }[] = [];
  fitBounds(_bounds: unknown, padding?: { bottom: number }) {
    this.fits.push({ padding });
  }
  addListener(type: string, fn: () => void) {
    const set = this.handlers.get(type) ?? new Set();
    set.add(fn);
    this.handlers.set(type, set);
    return { remove: () => set.delete(fn) };
  }
  /** The gesture pipeline reads the zoom limits off the map and turns a pixel into a
   *  coordinate through Google's OWN projection (ADR-0129 §3). Linear on purpose: the
   *  geography is `canvas-gestures.test.ts`'s job, against the real Mercator. */
  get() {
    return undefined;
  }
  getProjection() {
    return {
      fromLatLngToPoint: (ll: { lat: number; lng: number }) => ({ x: ll.lng, y: ll.lat }),
      fromPointToLatLng: (pt: { x: number; y: number }) => ({ lat: () => pt.y, lng: () => pt.x }),
    };
  }
  pinchTo(zoom: number) {
    this.zoom = zoom;
    this.handlers.get('zoom_changed')?.forEach((fn) => fn());
  }
}

import { MapPane, type MapPin } from './MapPane';
import { PIN_TIER } from '../../lib/map-pins';
import { MAP_COLOR_SCHEME } from '../../lib/map-config';
import {
  DRAG_CLICK_SWALLOW_MS,
  DRAG_HOLD_MS,
  MAP_CONNECTOR,
  MAP_LOAD_TIMEOUT_MS,
  MAP_ZOOM,
} from '../../constants';
import { t } from '../../i18n/he';

const CONFIG = { apiKey: 'k', mapId: 'waypoint-day', colorScheme: MAP_COLOR_SCHEME.light };

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
      config={props.config ?? CONFIG}
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
    />,
  );
}

const pins = () => [...document.querySelectorAll('.map-pin')];
/** Tap a pin the way GOOGLE reports it — a call on the marker's own subscription, not a DOM
 *  event. The distinction is the whole of the pane's guard (see the `AdvancedMarker` stub). */
const firePinTap = (pin: Element) =>
  act(() => {
    (pin.closest('[data-marker]') as HTMLElement & { gmpClick?: () => void }).gmpClick?.();
  });
const markers = () => [...document.querySelectorAll<HTMLElement>('[data-marker]')];

afterEach(() => {
  cleanup();
  mapStub.current = null;
  idleHandlers.length = 0;
  nextTap.placeId = null;
  apiError.fire = undefined;
  tilesLoaded.fire = undefined;
});

describe('MapPane — our markup, not PinElement (ADR-0121 §6)', () => {
  it('constructs one map, with the mandatory mapId and our gesture/control choices', () => {
    paint();
    const map = document.querySelector('[data-map]') as HTMLElement;
    expect(document.querySelectorAll('[data-map]')).toHaveLength(1);
    // A `mapId` is the price of admission: advanced markers do not load without one.
    expect(map.dataset.mapid).toBe('waypoint-day');
    // And the ID alone does not choose a style: it names a light/dark PAIR, and
    // Google renders the light one unless asked otherwise. Shipping the night Map
    // ID without this is what left the canvas light under a dark app — a prop
    // silently not forwarded, which is precisely what this stub exists to catch.
    expect(map.dataset.colorscheme).toBe('LIGHT');
    // Google's controls are un-styleable, unlabelled and RTL-unaware (§12).
    expect(map.dataset.nodefaultui).toBe('true');
    // The default demands two fingers inside a scrollable page (§12).
    expect(map.dataset.gestures).toBe('greedy');
    // Google's sight labels are drawn and not tappable (ADR-0125 §6's 2026-07-30
    // amendment). This is the whole of that decision, so it is asserted rather than
    // left to the render nobody can see.
    expect(map.dataset.clickableicons).toBe('false');
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
    const z = (i: number) => Number(markers()[i].dataset.z);
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

  // Dashed, neutral, no arrowheads — it says "this is the order", not "this is the
  // route" (§10). The Maps API has no dash array, so the dash is a repeating symbol
  // along a transparent stroke.
  it('draws the day connector only with two or more stops, neutral and transparent-stroked', () => {
    const { unmount } = paint({ connector: [{ lat: 1, lng: 1 }] });
    expect(document.querySelector('[data-polyline]')).toBeNull();
    unmount();
    paint({
      connector: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
    });
    const line = document.querySelector('[data-polyline]') as HTMLElement;
    expect(line.dataset.points).toBe('3');
    expect(line.dataset.color).toBe(MAP_CONNECTOR.COLOR.light);
  });

  // The dash is a TS constant handed to Google, so it sat out the CSS remap entirely
  // and measured 1.01:1 on the night style's land — invisible (ADR-0158 §16). It now
  // follows the LATCHED colour scheme rather than `documentTheme()`, so the line and
  // the canvas it is drawn on cannot disagree after a theme flip.
  it('takes the connector colour from the canvas it was built for, not the document', () => {
    paint({
      config: { ...CONFIG, colorScheme: MAP_COLOR_SCHEME.dark },
      connector: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
    });
    const line = document.querySelector('[data-polyline]') as HTMLElement;
    expect(line.dataset.color).toBe(MAP_CONNECTOR.COLOR.dark);
  });

  it('draws no connector when none is given (Trip mode, or all-days scope)', () => {
    paint();
    expect(document.querySelector('[data-polyline]')).toBeNull();
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

    // An `AdvancedMarker` is a DOM overlay, so a pin tap should not reach the map's own
    // click at all — but if it ever does, selecting a pin and instantly clearing it is
    // the one ordering that would be silently broken.
    it('a tap on a PIN is not a tap on the canvas', () => {
      const onCanvasTap = vi.fn();
      const onSelectPin = vi.fn();
      paint({ onCanvasTap, onSelectPin });
      fireEvent.click(pins()[0]);
      expect(onSelectPin).toHaveBeenCalledWith('a');
      expect(onCanvasTap).not.toHaveBeenCalled();
    });

    // Google's sight labels are drawn but not tappable (ADR-0125 §6's amendment), so a tap
    // that lands on one is a tap on the canvas and nothing else — no `placeId`, no info
    // window. The stub cannot withhold the id the way the real API does, so the assertion is
    // the one that still means something at this seam: a tap CARRYING one is not special-cased.
    // "Skip when `event.detail.placeId` is set" reads like a fix and has been the bug twice.
    it('a canvas tap clears the selection whether or not it carries a placeId', () => {
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap });
      nextTap.placeId = 'ChIJLU7jZClu5kcR4PcOOO6p3I0';
      fireEvent.click(document.querySelector('[data-map]')!);
      expect(onCanvasTap).toHaveBeenCalledTimes(1);
    });

    // **The release of one of OUR gestures is not a tap** (ADR-0148's build-log amendment).
    // Reported from a phone: a long press opened the form and lifting the finger closed it
    // again, because since §7 a canvas tap dismisses the form. The seam is what this covers
    // and it is why the test lives here rather than beside the recogniser: `useCanvasGestures`
    // can only prove it armed the guard, and Google reports a tap by CALLING us — so the
    // hook's `document` swallow never sees that channel at all.
    it("ignores the tap Google reports for the long press's own release", () => {
      vi.useFakeTimers();
      const onCanvasTap = vi.fn();
      const map = new FakeZoomMap();
      mapStub.current = map;
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
      googleTap.fire?.({ domEvent: undefined, detail: { placeId: null } });
      expect(onCanvasTap).not.toHaveBeenCalled();
      // And only that one: the guard expires, so the next real tap on the canvas still lands.
      act(() => void vi.advanceTimersByTime(DRAG_CLICK_SWALLOW_MS));
      googleTap.fire?.({ domEvent: undefined, detail: { placeId: null } });
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
      const map = new FakeZoomMap();
      mapStub.current = map;
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
      const map = new FakeZoomMap();
      mapStub.current = map;
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
        config={CONFIG}
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
    const map = new FakeZoomMap();
    map.zoom = MAP_ZOOM.DOT_BELOW - 1;
    mapStub.current = map;
    paint();
    expect(pane().dataset.pins).toBe('dot');

    // Pinching in past the threshold restores the full teardrop, during the gesture.
    act(() => map.pinchTo(MAP_ZOOM.DOT_BELOW));
    expect(pane().dataset.pins).toBeUndefined();
    act(() => map.pinchTo(MAP_ZOOM.DOT_BELOW - 3));
    expect(pane().dataset.pins).toBe('dot');
  });

  // The card's reserve reaches the camera through the PANE, and that wiring is one line
  // — which is exactly how it silently failed to exist the first time. The hook's own
  // test cannot see this path, so it is asserted here.
  it('the place card’s reserve reaches the camera’s padding (ADR-0128 §2)', () => {
    const WIDE = { north: 60, south: 10, east: 160, west: 110 };
    const map = new FakeZoomMap();
    map.box = { width: 390, height: 517 };
    map.viewport = WIDE;
    mapStub.current = map;
    const two = [pin({ placeId: 'a' }), pin({ placeId: 'b', lat: 35.9, lng: 139.9 })];
    const { unmount } = paint({ pins: two });
    const plain = map.fits.at(-1)!.padding!.bottom;
    unmount();

    const withCard = new FakeZoomMap();
    withCard.box = { width: 390, height: 517 };
    withCard.viewport = WIDE;
    mapStub.current = withCard;
    paint({ pins: two, cardReserve: 160 });
    expect(withCard.fits.at(-1)!.padding!.bottom).toBeGreaterThan(plain);
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
    const map = new FakeZoomMap();
    map.zoom = MAP_ZOOM.DOT_BELOW - 2;
    mapStub.current = map;
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
    const map = new FakeZoomMap();
    map.zoom = MAP_ZOOM.DOT_BELOW - 2;
    mapStub.current = map;
    paint({ pins: [pin({ placeId: 'now', nowStop: true, order: 2 })] });
    const el = document.querySelector('[aria-label="now"]')!;
    expect(el.querySelector('.pin-n')?.textContent).toBe('2');
    expect(el.querySelector('.pin-tag')?.textContent).toBe(t.map.happeningNow);
  });

  // The reason it is a data attribute and not a prop or state: the markers are content
  // inside a live `google.maps.Map`, where a needless re-diff is the cheap failure and a
  // re-instantiation is a billed one (ADR-0121 §4).
  it('does not touch a single marker node when the tier flips', () => {
    const map = new FakeZoomMap();
    mapStub.current = map;
    paint({ pins: [pin({ placeId: 'a' }), pin({ placeId: 'b' })] });
    const before = markers();
    act(() => map.pinchTo(MAP_ZOOM.DOT_BELOW - 4));
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
    act(() => apiError.fire?.(new Error('boom')));
    expect(document.querySelector('[data-map]')).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(t.map.loadError);
    expect(screen.getByRole('button', { name: new RegExp(t.feedback.retry) })).toBeTruthy();
  });

  it('tiles that never load within the bound are treated as a failure too', async () => {
    vi.useFakeTimers();
    paint();
    expect(document.querySelector('[data-map]')).toBeTruthy();
    // The `setMapFailed(true)` that decides this lands from a timer's `.catch`, outside
    // any event React already knows to flush around — `act` is what forces the commit
    // before the assertion below reads the DOM.
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(document.querySelector('[data-map]')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(t.map.loadError);
  });

  it('tiles loading before the bound never fails at all', async () => {
    vi.useFakeTimers();
    paint();
    act(() => tilesLoaded.fire?.());
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(document.querySelector('[data-map]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry remounts a fresh map, never reusing the failed instance', async () => {
    vi.useFakeTimers();
    paint();
    act(() => apiError.fire?.(new Error('boom')));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
    // The retry swaps `ErrorState` back for a freshly keyed `<APIProvider>` — a NEW
    // watchdog, not the settled/rejected one the failed attempt left behind.
    expect(document.querySelector('[data-map]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    // And the new attempt gets its own full bound rather than inheriting none of it —
    // failing again only once ITS watchdog, not the first one's leftovers, expires.
    await act(() => vi.advanceTimersByTimeAsync(MAP_LOAD_TIMEOUT_MS.TILES));
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
