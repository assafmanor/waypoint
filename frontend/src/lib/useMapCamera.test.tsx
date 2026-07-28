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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapCamera } from './useMapCamera';
import type { LatLng, MapBounds } from './map-camera';
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
  fitBounds(bounds: MapBounds, padding?: unknown) {
    this.fits.push({ bounds, padding });
    this.bounds = bounds;
    this.zoom = this.fitResultZoom;
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

function mount(
  fake: FakeMap | null,
  points: readonly LatLng[],
  setSignal = 'day',
  arrival: LatLng | null = null,
) {
  return renderHook(
    ({
      map,
      pts,
      signal,
      arrivalFocus,
    }: {
      map: FakeMap | null;
      pts: readonly LatLng[];
      signal: string;
      arrivalFocus: LatLng | null;
    }) => useMapCamera(map ? asMap(map) : null, { points: pts, setSignal: signal, arrivalFocus }),
    { initialProps: { map: fake, pts: points, signal: setSignal, arrivalFocus: arrival } },
  );
}

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

    view.rerender({ map, pts: DAY, signal: 'day', arrivalFocus: null });
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
    view.rerender({ map, pts: [KYOTO], signal: 'day|food', arrivalFocus: null });
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
    view.rerender({ map, pts: neighbourhood, signal: 'day|food', arrivalFocus: null });

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
    view.rerender({ map, pts: [TOKYO], signal: 'day|food', arrivalFocus: null });
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
    view.rerender({ map, pts: DAY, signal: 'day|food', arrivalFocus: null });
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

    view.rerender({ map, pts: [...DAY], signal: 'day', arrivalFocus: null }); // new array, same signal
    view.rerender({ map, pts: [...DAY], signal: 'day', arrivalFocus: null });
    expect(map.fits).toHaveLength(framed);
    expect(map.center).toEqual(where);
  });

  it('a null map is inert, and framing happens once it arrives', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(null, DAY);
    view.rerender({ map, pts: DAY, signal: 'day', arrivalFocus: null });
    expect(map.fits).toHaveLength(1);
  });
});

describe('focus and re-centre', () => {
  // ADR-0127 §1 reverses ADR-0121 §7's "focus never zooms" in ONE direction. The
  // protection §7 wanted — don't throw away the context I was reading — is entirely
  // about not pulling BACK, and that half is kept.
  it('focus zooms IN when the view is too far out to read the place', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    map.zoom = 9;
    view.result.current.focus(TOKYO);
    expect(map.zoom).toBe(MAP_ZOOM.PLACE);
    expect(map.center).toEqual(TOKYO);
    // A zoom change means the place was unreadable from here, so the journey is not
    // worth animating: it jumps rather than panning across a country.
    expect(map.pans).toHaveLength(0);
  });

  it('focus PANS and leaves the zoom alone when it is already close enough', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    map.zoom = MAP_ZOOM.PLACE + 2;
    view.result.current.focus(TOKYO);
    expect(map.pans).toEqual([TOKYO]);
    expect(map.zoom).toBe(MAP_ZOOM.PLACE + 2);
  });

  it('focus NEVER zooms out — that is the half of §7 that stands', () => {
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    map.zoom = 19;
    view.result.current.focus(TOKYO);
    expect(map.zoom).toBe(19);
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
  // a fit both ran, so the fit overwrote it. The fix removes the second runner.
  describe('an arrival focus owns the framing (ADR-0127 §3)', () => {
    it('an arrival centres on the place, and the opening fit never runs', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      mount(map, DAY, 'day', TOKYO);
      expect(map.center).toEqual(TOKYO);
      expect(map.zoom).toBe(MAP_ZOOM.PLACE);
      expect(map.fits).toHaveLength(0);
    });

    // The real arrival order: the map mounts unsized, the screen's own effect then
    // supplies the focus, and only later does the map become real. Keying on the live
    // prop would have dropped it in between — which is the slow arrival this is for.
    it('an arrival that lands BEFORE the map is sized still wins', () => {
      const map = new FakeMap();
      map.bounds = null; // not rendered yet: no fit is possible
      const view = mount(map, DAY);
      expect(map.fits).toHaveLength(0);
      view.rerender({ map, pts: DAY, signal: 'day', arrivalFocus: TOKYO });
      map.settle();
      expect(map.center).toEqual(TOKYO);
      expect(map.fits).toHaveLength(0);
    });

    // And the other order: the fit already claimed the opening frame, then the arrival
    // widens the scope, which changes the signal. The arrival still wins.
    it('an arrival that lands AFTER a fit still wins the next framing', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY);
      expect(map.fits).toHaveLength(1);
      view.rerender({ map, pts: DAY, signal: 'all', arrivalFocus: KYOTO });
      expect(map.center).toEqual(KYOTO);
      expect(map.fits).toHaveLength(1);
    });

    // Spent once: a later control change is an ordinary re-frame, not a second
    // centring on an arrival nobody made again.
    it('it is spent once — a later control change re-frames normally', () => {
      const map = new FakeMap();
      map.bounds = WORLD;
      const view = mount(map, DAY, 'day', TOKYO);
      expect(map.fits).toHaveLength(0);
      map.bounds = { north: 36, south: 35.5, east: 140, west: 139.5 };
      view.rerender({ map, pts: DAY, signal: 'all', arrivalFocus: TOKYO });
      expect(map.fits).toHaveLength(1);
    });
  });

  it('under reduced motion the camera still MOVES — it jumps instead of easing', () => {
    // jsdom implements no `matchMedia` at all, so it is defined rather than spied.
    vi.stubGlobal('matchMedia', () => ({ matches: true }) as unknown as MediaQueryList);
    const map = new FakeMap();
    map.bounds = WORLD;
    const view = mount(map, DAY);
    view.result.current.focus(TOKYO);
    expect(map.pans).toHaveLength(0);
    expect(map.center).toEqual(TOKYO);
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
