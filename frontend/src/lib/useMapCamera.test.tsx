// @vitest-environment jsdom
//
// The camera's imperative half, against a **fake map**. This exists because session
// 133 shipped without it on the grounds that "a rendered Google map cannot be
// exercised in the suite" (ADR-0121 §13) — true of the canvas, and not true of this:
// the hook touches eight methods, so the map is fakeable and the logic that opened
// production on the whole world was testable all along.
//
// What it pins down is the three-way distinction the bug came from: the OPENING
// framing ignores the current view and waits for the map to be real, a LATER framing
// is containment-guarded, and a re-render is neither.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapCamera, type MapCamera } from './useMapCamera';
import { mapFitPadding, type LatLng, type MapArrival, type MapBounds } from './map-camera';
import { MAP_ZOOM } from '../constants';

const TOKYO = { lat: 35.68, lng: 139.76 };
const KYOTO = { lat: 35.01, lng: 135.77 };
const DAY = [TOKYO, KYOTO];
/** The camera a map is constructed with before anything frames it — and the trap:
 *  it contains every pin, so a containment-guarded first fit never moves. */
const WORLD: MapBounds = { north: 85, south: -85, east: 180, west: -180 };

class FakeMap {
  center: LatLng = { lat: 0, lng: 0 };
  zoom: number = MAP_ZOOM.WORLD;
  /** Every `moveCamera` the hook made. The camera is now driven ONE FRAME AT A TIME
   *  (ADR-0129 §3), so "how it got there" is as much of the behaviour as "where". */
  readonly moves: { center: LatLng; zoom: number }[] = [];
  /** `null` models a map that has not rendered yet: `getBounds()` is undefined until
   *  Google has a projection, which is also when the div has a real size. */
  bounds: MapBounds | null = null;
  box = { width: 390, height: 320 };
  /** What `fitBounds` would resolve to, so the zoom clamp can be exercised. */
  fitResultZoom: number = 12;
  readonly fits: { bounds: MapBounds; padding: unknown }[] = [];
  readonly pans: LatLng[] = [];
  private handlers = new Map<string, Set<() => void>>();

  getBounds() {
    const b = this.bounds;
    if (!b) return undefined;
    return {
      getNorthEast: () => ({ lat: () => b.north, lng: () => b.east }),
      getSouthWest: () => ({ lat: () => b.south, lng: () => b.west }),
    };
  }
  getDiv() {
    return { getBoundingClientRect: () => this.box } as unknown as HTMLElement;
  }
  getCenter() {
    const c = this.center;
    return { lat: () => c.lat, lng: () => c.lng };
  }
  /** `fitBounds` is a PROBE now: the hook calls it to learn Google's own answer for a
   *  bounds, reads the camera back, restores it and eases across (ADR-0129 §3). So this
   *  still resolves a zoom and a centre, and the assertions still count the calls. */
  fitBounds(bounds: MapBounds, padding?: unknown) {
    this.fits.push({ bounds, padding });
    this.bounds = bounds;
    this.zoom = this.fitResultZoom;
    this.center = {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    };
  }
  moveCamera(at: { center?: LatLng; zoom?: number }) {
    if (at.center) this.center = at.center;
    if (at.zoom != null) this.zoom = at.zoom;
    this.moves.push({ center: this.center, zoom: this.zoom });
  }
  getZoom() {
    return this.zoom;
  }
  setZoom(zoom: number) {
    this.zoom = zoom;
  }
  setCenter(center: LatLng) {
    this.center = center;
  }
  panTo(center: LatLng) {
    this.pans.push(center);
    this.center = center;
  }
  /** Google's own documented Web Mercator, so the anchoring test exercises the REAL
   *  round trip rather than a linear stand-in — a linear fake would pass while the shipped
   *  code was wrong about latitude, which is the whole risk of this feature.
   *  `hasProjection` false models a map that has not rendered yet. */
  hasProjection = true;
  getProjection() {
    if (!this.hasProjection) return undefined;
    const S = 256;
    return {
      fromLatLngToPoint: (ll: LatLng) => {
        const siny = Math.min(Math.max(Math.sin((ll.lat * Math.PI) / 180), -0.9999), 0.9999);
        return {
          x: S / 2 + ll.lng * (S / 360),
          y: S / 2 - 0.5 * Math.log((1 + siny) / (1 - siny)) * (S / (2 * Math.PI)),
        };
      },
      fromPointToLatLng: (p: { x: number; y: number }) => {
        const lng = (p.x - S / 2) / (S / 360);
        const lat =
          (2 * Math.atan(Math.exp(((S / 2 - p.y) * (2 * Math.PI)) / S)) - Math.PI / 2) *
          (180 / Math.PI);
        return { lat: () => lat, lng: () => lng };
      },
    } as unknown as google.maps.Projection;
  }
  addListener(type: string, fn: () => void) {
    const set = this.handlers.get(type) ?? new Set();
    set.add(fn);
    this.handlers.set(type, set);
    return { remove: () => set.delete(fn) };
  }
  /** Pretend the map finished rendering: it now has a viewport. */
  settle(bounds: MapBounds = WORLD) {
    this.bounds = bounds;
    this.handlers.get('idle')?.forEach((fn) => fn());
  }
  get idleListeners() {
    return this.handlers.get('idle')?.size ?? 0;
  }
}

const asMap = (fake: FakeMap) => fake as unknown as google.maps.Map;

/** Named, so `bottomReserve` stays OPTIONAL: inferring the shape from `initialProps`
 *  would make every existing rerender have to pass it. */
interface CameraProps {
  map: FakeMap | null;
  pts: readonly LatLng[];
  signal: string;
  arrival: MapArrival | null;
  bottomReserve?: number;
  focusContext?: readonly LatLng[];
}

/** An arrival that FRAMES — the `מפה` / card-badge intent, and what every case here but
 *  the panning one means (ADR-0129 §1). */
const framing = (at: LatLng): MapArrival => ({ at, frame: true });

function mount(
  fake: FakeMap | null,
  points: readonly LatLng[],
  setSignal = 'day',
  arrival: MapArrival | null = null,
) {
  return renderHook<MapCamera, CameraProps>(
    ({ map, pts, signal, arrival: owed, bottomReserve, focusContext }) =>
      useMapCamera(map ? asMap(map) : null, {
        points: pts,
        setSignal: signal,
        arrival: owed,
        bottomReserve,
        focusContext,
      }),
    {
      initialProps: {
        map: fake,
        pts: points,
        signal: setSignal,
        arrival,
      },
    },
  );
}

/** Most of this suite is about WHERE the camera ends up, not how it travels. Under
 *  `prefers-reduced-motion` a move is a single `moveCamera` to the destination — a real
 *  shipped path (ADR-0098 §4), not a test-only shortcut — so asking these questions
 *  there keeps them about the decision rather than about frame timing. The animation
 *  itself has its own describe at the bottom. */
function settleInstantly() {
  vi.stubGlobal('matchMedia', () => ({ matches: true }) as unknown as MediaQueryList);
}

beforeEach(settleInstantly);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the opening framing (session 134 — the map opened on the whole world)', () => {
  it('waits for the map to render, then fits — it does not fit into an unrendered map', () => {
    const map = new FakeMap();
    mount(map, DAY);
    // Nothing yet: a map with no bounds has no honest viewport to fit into.
    expect(map.fits).toHaveLength(0);
    expect(map.idleListeners).toBe(1);

    map.settle();
    expect(map.fits).toHaveLength(1);
    expect(map.fits[0].bounds).toEqual({
      north: 35.68,
      south: 35.01,
      east: 139.76,
      west: 135.77,
    });
  });

  // THE BUG. The map is constructed on a world view, which contains every pin, so a
  // containment-guarded first fit is a no-op — and every later one is too, because
  // the view still contains them. The opening framing must ignore the current view.
  it('fits even though the opening view already contains every pin', () => {
    const map = new FakeMap();
    map.bounds = WORLD; // already "rendered", wide open
    mount(map, DAY);
    expect(map.fits).toHaveLength(1);
  });

  it('defers while the div is unsized, and frames on a later idle instead', () => {
    const map = new FakeMap();
    map.box = { width: 0, height: 0 }; // measured before layout settled
    map.bounds = WORLD;
    mount(map, DAY);
    // It refused rather than fitting into nothing — and did not record a framing.
    expect(map.fits).toHaveLength(0);

    map.box = { width: 390, height: 320 };
    map.settle();
    expect(map.fits).toHaveLength(1);
  });

  it('frames when the pins only arrive after the map does', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, []);
    expect(map.fits).toHaveLength(0);

    view.rerender({ map, pts: DAY, signal: 'day', arrival: null });
    expect(map.fits).toHaveLength(1);
  });

  it('centres a lone pin at a neighbourhood zoom rather than fitting a point', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    mount(map, [TOKYO]);
    expect(map.fits).toHaveLength(0);
    expect(map.center).toEqual(TOKYO);
    expect(map.zoom).toBe(MAP_ZOOM.PLACE);
  });

  it('caps the fitted zoom, without leaving the user unable to pinch in', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    map.fitResultZoom = 21; // near-coincident pins fit to building level
    mount(map, DAY);
    expect(map.zoom).toBe(MAP_ZOOM.MAX_FIT);
    // The cap is a clamp after the fact, not a lingering map option to restore.
    map.setZoom(20);
    expect(map.zoom).toBe(20);
  });
});

describe('later framings answer controls, and only when they owe you something', () => {
  it('a control change re-fits when the new set does not fit the view', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    expect(map.fits).toHaveLength(1);

    // Now framed on the day; a chip narrows to somewhere outside that view.
    map.bounds = { north: 36, south: 35, east: 140, west: 139 };
    view.rerender({ map, pts: [KYOTO], signal: 'day|food', arrival: null });
    expect(map.center).toEqual(KYOTO);
  });

  // Reported off the running app: zoom out for a day whose places are hours apart,
  // then narrow — a category chip, `אולי`, `מה נשאר`, or simply another day — and the
  // camera stayed out, because the wide view still CONTAINED the smaller set. Three
  // pins in one corner of a country, with no control able to tighten it.
  it('a control change re-fits when the new set is DWARFED by the current view', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    const framed = map.fits.length;

    // A far-flung day has left a wide view…
    map.bounds = { north: 40, south: 30, east: 145, west: 130 };
    // …and a chip narrows to two places in one neighbourhood.
    const neighbourhood = [TOKYO, { lat: 35.69, lng: 139.77 }];
    view.rerender({ map, pts: neighbourhood, signal: 'day|food', arrival: null });

    expect(map.fits).toHaveLength(framed + 1);
    expect(map.fits.at(-1)!.bounds).toEqual({
      north: 35.69,
      south: 35.68,
      east: 139.77,
      west: 139.76,
    });
  });

  it('narrowing all the way to ONE pin re-centres instead of sitting zoomed out', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);

    map.bounds = { north: 40, south: 30, east: 145, west: 130 };
    view.rerender({ map, pts: [TOKYO], signal: 'day|food', arrival: null });
    // A zero-area extent fills nothing, so it can never read as "already framed".
    expect(map.center).toEqual(TOKYO);
    expect(map.zoom).toBe(MAP_ZOOM.PLACE);
  });

  it('a control change does NOT move when the results are already on screen', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    const framed = map.fits.length;

    map.bounds = { north: 36, south: 34, east: 141, west: 134 }; // holds both pins
    view.rerender({ map, pts: DAY, signal: 'day|food', arrival: null });
    // This is what removes "tap אוכל, the map lurches across the city".
    expect(map.fits).toHaveLength(framed);
  });

  // A manual pan wins until the next scope change — which falls out of the camera
  // answering signals only. This screen re-renders every second.
  it('a re-render with no signal change never touches the camera', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    const framed = map.fits.length;
    const where = { ...map.center };

    view.rerender({ map, pts: [...DAY], signal: 'day', arrival: null }); // new array, same signal
    view.rerender({ map, pts: [...DAY], signal: 'day', arrival: null });
    expect(map.fits).toHaveLength(framed);
    expect(map.center).toEqual(where);
  });

  it('a null map is inert, and framing happens once it arrives', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(null, DAY);
    view.rerender({ map, pts: DAY, signal: 'day', arrival: null });
    expect(map.fits).toHaveLength(1);
  });
});

describe('focus and re-centre', () => {
  // ADR-0127 §1 reverses ADR-0121 §7's "focus never zooms" in ONE direction. The
  // protection §7 wanted — don't throw away the context I was reading — is entirely
  // about not pulling BACK, and that half is kept.
  // ADR-0129 §1, reverting ADR-0127 §1 for selection and restoring ADR-0121 §7's rule
  // for the two cases it was always right about. Reported off a real map: being zoomed
  // for tapping a pin you can already SEE is "a little inconvenient" — you asked which
  // one it was, not to be taken somewhere. It is Google's own POI behaviour too.
  it('focus PANS at whatever zoom you are on, however far out that is', () => {
    for (const zoom of [6, MAP_ZOOM.PLACE, 19]) {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY);
      map.zoom = zoom;
      view.result.current.focus(TOKYO);
      expect(map.center).toEqual(TOKYO);
      expect(map.zoom).toBe(zoom);
      view.unmount();
    }
  });

  // #20, and the reason it is stateless: the step is read off the map's CURRENT zoom,
  // so a pinch between taps cannot desynchronise it and no tap count exists to drift.
  describe('locate steps in on a repeat tap (#20)', () => {
    it('the first tap from far out lands at the readable zoom', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY);
      map.zoom = 6;
      view.result.current.locate(TOKYO);
      expect(map.zoom).toBe(MAP_ZOOM.PLACE);
      expect(map.center).toEqual(TOKYO);
    });

    it('a repeat tap steps one level in, and stops at the ceiling', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY);
      map.zoom = MAP_ZOOM.PLACE;
      view.result.current.locate(TOKYO);
      expect(map.zoom).toBe(MAP_ZOOM.PLACE + 1);
      view.result.current.locate(TOKYO);
      expect(map.zoom).toBe(MAP_ZOOM.PLACE + 2);
      map.zoom = MAP_ZOOM.STEP_IN_MAX;
      view.result.current.locate(TOKYO);
      expect(map.zoom).toBe(MAP_ZOOM.STEP_IN_MAX);
    });

    it('a pinch between taps cannot desynchronise it: the step reads the MAP', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY);
      map.zoom = MAP_ZOOM.PLACE;
      view.result.current.locate(TOKYO);
      // The user pinches back out between taps. A tap counter would now be wrong.
      map.zoom = MAP_ZOOM.PLACE;
      view.result.current.locate(TOKYO);
      expect(map.zoom).toBe(MAP_ZOOM.PLACE + 1);
    });
  });

  // ADR-0127 §3. The defect was not that the pan was too slow — it was that a pan and
  // a fit both ran, so the fit overwrote it. The fix removes the second runner. Since
  // ADR-0129 §2 the arrival frames the place WITH ITS NEIGHBOURS, so it goes through the
  // ordinary fit — what says the arrival won is therefore WHICH bounds were fitted, not
  // whether a fit happened.
  describe('an arrival owns the framing (ADR-0127 §3, ADR-0129 §2)', () => {
    /** Is this the day's whole extent (Tokyo→Kyoto, ~4°) or a frame around one place? */
    const isPlaceFrame = (b: MapBounds) => b.north - b.south < 0.2;
    const centreOf = (b: MapBounds) => ({
      lat: (b.north + b.south) / 2,
      lng: (b.east + b.west) / 2,
    });

    it('frames the PLACE, not the day’s extent', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      mount(map, DAY, 'day', framing(TOKYO));
      const fitted = map.fits.at(-1)!.bounds;
      expect(isPlaceFrame(fitted)).toBe(true);
      expect(centreOf(fitted).lat).toBeCloseTo(TOKYO.lat, 6);
      expect(centreOf(fitted).lng).toBeCloseTo(TOKYO.lng, 6);
    });

    // ADR-0134 §7: an unsaved Google result is framed among the OTHER CANDIDATES, not
    // among the trip's plan — so the span reads a context set. Two questions about the
    // same neighbours, and the second one is why a ring can inform a frame without ever
    // pulling a fit (which would be a query moving the camera, ADR-0131 §5).
    it('the frame SPAN reads the focus context; the fit it performs does not', () => {
      // No trip pins on purpose. `focusBoundsFor` takes the FURTHEST of the nearest three,
      // so a day with a pin in Kyoto is already clamped at `MAX_SPAN_DEG` and no nearby
      // candidate could tighten it — which is the rule working, and would have made this
      // test pass for the wrong reason. The question here is whether the context is read
      // at all, so it is the only neighbour there is.
      const bareMap = new FakeMap();
      bareMap.bounds = WORLD;
      mount(bareMap, [], 'day', framing(TOKYO));
      const withoutContext = bareMap.fits.at(-1)!.bounds;

      const ctxMap = new FakeMap();
      ctxMap.bounds = WORLD;
      renderHook<MapCamera, CameraProps>(
        ({ map: m, pts, signal, arrival: owed, focusContext }) =>
          useMapCamera(m ? asMap(m) : null, {
            points: pts,
            setSignal: signal,
            arrival: owed,
            focusContext,
          }),
        {
          initialProps: {
            map: ctxMap,
            pts: [],
            signal: 'day',
            arrival: framing(TOKYO),
            focusContext: [{ lat: TOKYO.lat + 0.004, lng: TOKYO.lng }],
          },
        },
      );
      const withContext = ctxMap.fits.at(-1)!.bounds;
      // A candidate 0.004° away TIGHTENS the frame; with no neighbours at all the span
      // falls back to `MAP_FOCUS.DEFAULT_SPAN_DEG`.
      expect(withContext.north - withContext.south).toBeLessThan(
        withoutContext.north - withoutContext.south,
      );
      // …and it is not a point the camera fitted: the frame stays centred on the place.
      expect(centreOf(withContext).lat).toBeCloseTo(TOKYO.lat, 6);
    });

    // The real arrival order: the map mounts unsized, the screen's own effect then
    // supplies the focus, and only later does the map become real. Keying on the live
    // prop would have dropped it in between — which is the slow arrival this is for.
    it('an arrival that lands BEFORE the map is sized still wins', () => {
      const map = new FakeMap();
      map.bounds = null; // not rendered yet: no fit is possible
      const view = mount(map, DAY);
      expect(map.fits).toHaveLength(0);
      view.rerender({ map, pts: DAY, signal: 'day', arrival: framing(TOKYO) });
      map.settle();
      expect(isPlaceFrame(map.fits.at(-1)!.bounds)).toBe(true);
    });

    // And the other order: the fit already claimed the opening frame, then the arrival
    // widens the scope, which changes the signal. The arrival still wins.
    it('an arrival that lands AFTER a fit still wins the next framing', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY);
      expect(isPlaceFrame(map.fits.at(-1)!.bounds)).toBe(false); // the day's extent
      view.rerender({ map, pts: DAY, signal: 'all', arrival: framing(KYOTO) });
      const fitted = map.fits.at(-1)!.bounds;
      expect(isPlaceFrame(fitted)).toBe(true);
      expect(centreOf(fitted).lat).toBeCloseTo(KYOTO.lat, 6);
    });

    // **A PANNING arrival: the other half of ADR-0129 §1** (ADR-0148 §3's amendment, on the
    // owner's report that a long press "zooms in and pans to it — in these cases I don't want
    // a zoom"). A drop names a pixel already on screen, so it centres at the zoom you are at:
    // the camera moves, and `fitBounds` — which is what would change the zoom — is never
    // called. Both halves are asserted, because "it panned" and "it did not zoom" are two
    // different claims and only the pair rules out a fit that happened to land nearby.
    it('an arrival with `frame: false` PANS at the zoom it is at, and never fits', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY);
      const fits = map.fits.length;
      const zoom = map.zoom;

      view.rerender({ map, pts: DAY, signal: 'day', arrival: { at: KYOTO, frame: false } });
      expect(map.fits).toHaveLength(fits);
      expect(map.zoom).toBe(zoom);
      expect(map.center.lat).toBeCloseTo(KYOTO.lat, 6);
      expect(map.center.lng).toBeCloseTo(KYOTO.lng, 6);
    });

    // …and it is the same channel, so it owns the next framing exactly as a framing one does:
    // the pan must not be overwritten by a fit that was going to happen anyway.
    it('a panning arrival that lands before the map is sized still wins', () => {
      const map = new FakeMap();
      map.bounds = null;
      const view = mount(map, DAY);
      expect(map.fits).toHaveLength(0);
      view.rerender({ map, pts: DAY, signal: 'day', arrival: { at: KYOTO, frame: false } });
      map.settle();
      expect(map.fits).toHaveLength(0);
      expect(map.center.lat).toBeCloseTo(KYOTO.lat, 6);
    });

    // Spent once: a later control change is an ordinary re-frame, not a second
    // centring on an arrival nobody made again.
    it('it is spent once — a later control change re-frames the SET', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      // The SAME arrival object, re-passed — which is what "spent" means here: a fresh one
      // is a fresh ask (it is how tapping the same row twice re-frames it), so re-creating it
      // would prove nothing about spending.
      const owed = framing(TOKYO);
      const view = mount(map, DAY, 'day', owed);
      expect(isPlaceFrame(map.fits.at(-1)!.bounds)).toBe(true);
      map.bounds = { north: 36, south: 35.5, east: 140, west: 139.5 };
      view.rerender({ map, pts: DAY, signal: 'all', arrival: owed });
      expect(isPlaceFrame(map.fits.at(-1)!.bounds)).toBe(false);
    });
  });

  // ADR-0128 §2. The reserve changes on a TAP, and the reason it was deferred for a whole
  // phase is that carrying it must not move the camera — "a tap never takes away the
  // surface it was made on" (ADR-0122 §7). It is read through a ref for exactly this.
  it('opening the place card re-pads the fit but does NOT move the camera', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    const framed = map.fits.length;
    const where = { ...map.center };

    // A pin tap: the card opens, so the reserve appears — with no signal change.
    view.rerender({ map, pts: DAY, signal: 'day', arrival: null, bottomReserve: 160 });
    expect(map.fits).toHaveLength(framed);
    expect(map.center).toEqual(where);

    // And the NEXT genuine re-frame does carry it.
    map.bounds = WORLD;
    view.result.current.reframe(DAY);
    const padding = map.fits.at(-1)!.padding as { bottom: number };
    expect(padding.bottom).toBe(mapFitPadding(map.box.height, 160).bottom);
    expect(padding.bottom).toBeGreaterThan(mapFitPadding(map.box.height).bottom);
  });

  it('re-centre re-frames regardless of the current view — the escape hatch', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    const framed = map.fits.length;
    // Wide open, so containment would refuse; the explicit control must not.
    map.bounds = WORLD;
    view.result.current.reframe(DAY);
    expect(map.fits).toHaveLength(framed + 1);
  });
});

// ADR-0129 §3. Reported off a real map: reframing "portals" instead of moving. The cause
// is not that the app asked for a jump — it is that nothing could ask for anything else.
// `fitBounds` animates "depending on an internal heuristic", `panTo` only when the move
// is shorter than the viewport, and `moveCamera` is documented as instant. So the ease is
// OURS, one `moveCamera` per frame.
describe('the camera eases rather than portals (ADR-0129 §3)', () => {
  /** Undo the suite-wide reduced-motion stub: these tests are about the curve. */
  const withMotion = () =>
    vi.stubGlobal('matchMedia', () => ({ matches: false }) as unknown as MediaQueryList);

  it('moves in many steps, and lands exactly on the target', async () => {
    withMotion();
    const map = new FakeMap();
    map.bounds = WORLD;
    map.zoom = 9;
    const view = mount(map, DAY);
    map.moves.length = 0;
    view.result.current.focus(TOKYO);
    // The first frame is already a move, and it is NOT the destination — which is the
    // whole difference from a portal.
    expect(map.moves).toHaveLength(1);
    expect(map.moves[0].center).not.toEqual(TOKYO);

    await vi.waitFor(() => {
      expect(map.center.lat).toBeCloseTo(TOKYO.lat, 6);
      expect(map.center.lng).toBeCloseTo(TOKYO.lng, 6);
    });
    expect(map.moves.length).toBeGreaterThan(2);
  });

  // A second intent while one is in flight must not have two loops fighting over the
  // camera — the later one wins outright.
  it('a new move cancels the one in flight', async () => {
    withMotion();
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    view.result.current.focus(TOKYO);
    view.result.current.focus(KYOTO);
    await vi.waitFor(() => {
      expect(map.center.lat).toBeCloseTo(KYOTO.lat, 6);
    });
    // If the cancelled loop were still running it would drag the camera back.
    const settled = { ...map.center };
    await new Promise((r) => setTimeout(r, 40));
    expect(map.center).toEqual(settled);
  });

  // The very first framing of a map has no view to ease away FROM, so it lands at once:
  // easing out of a camera nobody chose is animating a fact, not a movement.
  it('the opening framing lands immediately, with nothing to ease from', () => {
    withMotion();
    const map = new FakeMap();
    map.bounds = WORLD;
    map.center = { lat: 0, lng: 0 };
    mount(map, DAY);
    expect(map.fits).toHaveLength(1);
    // One settle, not a curve: the probe restored nothing because there was nothing.
    expect(map.moves).toHaveLength(1);
  });
});

describe('the one-finger zoom’s two camera verbs (ADR-0145 §5/§2)', () => {
  it('zoomTo writes the zoom and NOTHING else — a drag zoom is not a pan', () => {
    // §3's decision, asserted where it can actually be caught: the gesture is
    // centre-anchored, so a frame of it must not move the centre. If point-anchoring is
    // ever added, this is the test that will say so out loud rather than silently.
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    const centre = { ...map.center };
    view.result.current.zoomTo(16.5);
    expect(map.zoom).toBe(16.5);
    expect(map.center).toEqual(centre);
  });

  it('zoomTo CANCELS an ease in flight instead of letting it notice (§5)', async () => {
    // ADR-0129 §4's `sameCamera` check is what saves the app from a pinch it cannot
    // intercept. This gesture it CAN, and within one frame the ease could still write
    // after us — so the ease is killed outright. Without the cancel, the loop's next
    // frame drags the zoom back toward its own target.
    vi.stubGlobal('matchMedia', () => ({ matches: false }) as unknown as MediaQueryList);
    const map = new FakeMap();
    map.bounds = WORLD;
    map.fitResultZoom = 12;
    const view = mount(map, DAY);
    // An ease is now running toward the fit. Take the camera mid-flight.
    view.result.current.zoomTo(19);
    expect(map.zoom).toBe(19);
    await new Promise((r) => setTimeout(r, 60));
    // Still ours. A surviving loop would have overwritten this several frames ago.
    expect(map.zoom).toBe(19);
  });

  it('stepZoomIn eases one level in about the current centre', () => {
    // The double-tap we take over from Google because intercepting the gesture suppressed
    // its own (§2). It goes through the ease, unlike Google's, which could not be asked to.
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    const centre = { ...map.center };
    map.zoom = 14;
    view.result.current.stepZoomIn();
    expect(map.zoom).toBe(15);
    expect(map.center).toEqual(centre);
  });

  // THE REGRESSION, and worth reading as a lesson about this file: the two cases below
  // used to be one test that asserted `MAP_ZOOM.STEP_IN_MAX` — i.e. it ENCODED the bug,
  // and passed. `stepZoomIn` reused `zoomStepIn`, which is LOCATE's ladder: its
  // `current < floor` branch returns the floor outright, so a double-tap from a globe view
  // jumped to city zoom instead of stepping, and its ceiling capped a gesture that should
  // reach as deep as a pinch. Only a device found it (owner, 2026-07-30).
  it('steps ONE level from a wide view — it does not jump to locate’s floor', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    map.zoom = MAP_ZOOM.WORLD;
    view.result.current.stepZoomIn();
    expect(map.zoom).toBe(MAP_ZOOM.WORLD + 1);
    expect(map.zoom).toBeLessThan(MAP_ZOOM.PLACE);
  });

  it('is not capped by locate’s ceiling — a double-tap goes as deep as a pinch', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    map.zoom = MAP_ZOOM.STEP_IN_MAX;
    view.result.current.stepZoomIn();
    expect(map.zoom).toBe(MAP_ZOOM.STEP_IN_MAX + 1);
  });

  // POINT ANCHORING (§3's amendment). Google's own double-click zoom anchored at the tapped
  // point; suppressing it and centring instead was a downgrade the device pass caught. The
  // assertion is the behaviour, not the arithmetic: the geography under the finger must not
  // move. It runs through the fake's real Mercator, so a latitude error cannot hide.
  it('anchors the step-zoom at the tapped point — the geography under the finger stays put', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    // After mount: the opening framing fits the day, so a camera set before it is discarded.
    map.center = TOKYO;
    map.zoom = 14;
    const offset = { x: 120, y: -80 };

    const proj = map.getProjection()!;
    const screenOf = (at: LatLng, centre: LatLng, zoom: number) => {
      const p = proj.fromLatLngToPoint(at)!;
      const c = proj.fromLatLngToPoint(centre)!;
      return { x: (p.x - c.x) * 2 ** zoom, y: (p.y - c.y) * 2 ** zoom };
    };
    // What is under the finger before the tap.
    const worldUnderFinger = proj.fromPointToLatLng({
      x: proj.fromLatLngToPoint(TOKYO)!.x + offset.x / 2 ** 14,
      y: proj.fromLatLngToPoint(TOKYO)!.y + offset.y / 2 ** 14,
    } as google.maps.Point)!;
    const before = { lat: worldUnderFinger.lat(), lng: worldUnderFinger.lng() };

    view.result.current.stepZoomIn(offset);

    // Same screen offset after the move, at the new zoom.
    const after = screenOf(before, map.center, map.zoom);
    expect(after.x).toBeCloseTo(offset.x, 6);
    expect(after.y).toBeCloseTo(offset.y, 6);
    // And it really did zoom, and really did move off centre.
    expect(map.zoom).toBe(15);
    expect(map.center).not.toEqual(TOKYO);
  });

  it('degrades to centre-anchored when the map has no projection yet', () => {
    // A map has no projection until it has rendered, and a double-tap before then must still
    // zoom rather than throw or refuse.
    const map = new FakeMap();
    map.bounds = WORLD;
    map.hasProjection = false;
    const view = mount(map, DAY);
    map.center = TOKYO;
    map.zoom = 14;
    view.result.current.stepZoomIn({ x: 120, y: -80 });
    expect(map.zoom).toBe(15);
    expect(map.center).toEqual(TOKYO);
  });

  it('a centred tap does not move the centre', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    map.center = TOKYO;
    map.zoom = 14;
    view.result.current.stepZoomIn({ x: 0, y: 0 });
    expect(map.center).toEqual(TOKYO);
    expect(map.zoom).toBe(15);
  });

  it('neither verb touches a map that has no camera yet', () => {
    const view = mount(null, DAY);
    expect(() => {
      view.result.current.zoomTo(15);
      view.result.current.stepZoomIn();
    }).not.toThrow();
  });
});
