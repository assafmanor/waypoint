// @vitest-environment jsdom
//
// A rendered Google map cannot be exercised in the suite (ADR-0121 §13), and this
// does not pretend to: `@vis.gl/react-google-maps` is stubbed, so what is under test
// is the part that is OURS — the pin markup and its class grammar, the number, the
// z-order, the amber cue, the area readout, and the fact that a clock tick does not
// re-diff a marker. Whether any of it LOOKS right on a real canvas is a human step
// on a machine with the browser key.
import { afterEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: ReactNode }) => <div data-api>{children}</div>,
  Map: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => (
    <div
      data-map
      data-mapid={String(props.mapId)}
      data-gestures={String(props.gestureHandling)}
      data-nodefaultui={String(props.disableDefaultUI)}
      // The Maps API hands its click handler a wrapped event carrying the DOM one; the
      // pane reads that to tell a tap on the canvas from a tap on a pin, so the stub
      // has to pass it through in the same shape.
      onClick={(event) =>
        (
          props.onClick as
            ((e: { domEvent: unknown; detail: { placeId: string | null } }) => void) | undefined
        )?.({
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
  pinchTo(zoom: number) {
    this.zoom = zoom;
    this.handlers.get('zoom_changed')?.forEach((fn) => fn());
  }
}

import { MapPane, type MapPin } from './MapPane';
import { PIN_TIER } from '../../lib/map-pins';
import { MAP_CONNECTOR, MAP_ZOOM } from '../../constants';
import { t } from '../../i18n/he';

const CONFIG = { apiKey: 'k', mapId: 'waypoint-day' };

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
      config={CONFIG}
      pins={props.pins ?? [pin({ placeId: 'a' })]}
      setSignal={props.setSignal ?? 'day'}
      onSelectPin={props.onSelectPin ?? vi.fn()}
      onCanvasTap={props.onCanvasTap ?? vi.fn()}
      onViewChange={props.onViewChange ?? vi.fn()}
      areaCount={props.areaCount === undefined ? 1 : props.areaCount}
      areaSorted={props.areaSorted ?? false}
      onAreaSort={props.onAreaSort ?? vi.fn()}
      onLocate={props.onLocate ?? vi.fn()}
      cardOpen={props.cardOpen}
      me={props.me}
      connector={props.connector}
      defaultCentre={props.defaultCentre}
    />,
  );
}

const pins = () => [...document.querySelectorAll('.map-pin')];
const markers = () => [...document.querySelectorAll<HTMLElement>('[data-marker]')];

afterEach(() => {
  cleanup();
  mapStub.current = null;
  idleHandlers.length = 0;
  nextTap.placeId = null;
});

describe('MapPane — our markup, not PinElement (ADR-0121 §6)', () => {
  it('constructs one map, with the mandatory mapId and our gesture/control choices', () => {
    paint();
    const map = document.querySelector('[data-map]') as HTMLElement;
    expect(document.querySelectorAll('[data-map]')).toHaveLength(1);
    // A `mapId` is the price of admission: advanced markers do not load without one.
    expect(map.dataset.mapid).toBe('waypoint-day');
    // Google's controls are un-styleable, unlabelled and RTL-unaware (§12).
    expect(map.dataset.nodefaultui).toBe('true');
    // The default demands two fingers inside a scrollable page (§12).
    expect(map.dataset.gestures).toBe('greedy');
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
    expect(line.dataset.color).toBe(MAP_CONNECTOR.COLOR);
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

    // Google's own sight icons are visible again (ADR-0125 §6) and a tap on one arrives here
    // as a map click carrying a `placeId`. It clears like any other, and that is the point:
    // Google answers the tap with its own place card, ours renders on the same canvas at the
    // `map` stop, and exempting the POI tap would stack the two.
    it("a tap on one of GOOGLE's sight icons clears the selection, so two cards never stack", () => {
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap });
      nextTap.placeId = 'ChIJLU7jZClu5kcR4PcOOO6p3I0';
      fireEvent.click(document.querySelector('[data-map]')!);
      expect(onCanvasTap).toHaveBeenCalledTimes(1);
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
    paint({ pins: two, cardOpen: true });
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
