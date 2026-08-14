// @vitest-environment jsdom
//
// **MapLibre needs a GPU and jsdom has none**, so `maplibre-gl` is stubbed to a plain object
// that records what it was constructed with and lets a test fire its events — the same
// posture `MapPane.test.tsx` takes with `@vis.gl/react-google-maps`, and for the same reason
// (ADR-0121 §13): whether a canvas LOOKS right is a human pass, and saying so is the point.
//
// What is under test is therefore the part that is OURS, which for this component is its
// LIFECYCLE — the one thing ADR-0186 §1 chose to hand-roll rather than take from a wrapper.
// So: the map is constructed once and never per render, `remove()` runs on unmount, the
// first-paint signal is the `idle` AFTER `load` and not a moment earlier, and a tile that
// 404s is reported without being read as a dead canvas.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

/** `addProtocol` is page-global, which `MapCanvas` is explicit about — so it is a spy
 *  rather than a no-op: "registered once, however many panes mount" is an assertion. */
const addProtocol = vi.fn();
const tileHandler = vi.fn();

type Handler = (event?: unknown) => void;

const add = (into: Map<string, Set<Handler>>, type: string, fn: Handler) => {
  const set = into.get(type) ?? new Set<Handler>();
  set.add(fn);
  into.set(type, set);
};

/** MapLibre's map, reduced to what `MapCanvas` actually touches: a constructor that records
 *  its options, `on`/`once`, and `remove`. Keyed handler sets rather than one bag, because
 *  the component registers `load`, `idle` and `error` on the same object and a shared set
 *  would make a tile error fire the first-paint callback. */
class FakeMapLibreMap {
  static built: FakeMapLibreMap[] = [];
  /** Makes construction throw — the module-or-protocol failure, which is the one thing
   *  `MapCanvas` treats as "the canvas cannot exist" (as opposed to a tile that failed). */
  static failToBuild = false;
  readonly options: Record<string, unknown>;
  removed = 0;
  private readonly persistent = new Map<string, Set<Handler>>();
  private readonly oneShot = new Map<string, Set<Handler>>();

  constructor(options: Record<string, unknown>) {
    if (FakeMapLibreMap.failToBuild) throw new Error('webgl unavailable');
    this.options = options;
    FakeMapLibreMap.built.push(this);
  }
  on(type: string, fn: Handler) {
    add(this.persistent, type, fn);
    return this;
  }
  once(type: string, fn: Handler) {
    add(this.oneShot, type, fn);
    return this;
  }
  remove() {
    this.removed += 1;
  }
  /** Fired the way MapLibre fires: a `once` handler is spent, an `on` handler is not. */
  fire(type: string, event?: unknown) {
    const spent = this.oneShot.get(type);
    this.oneShot.delete(type);
    for (const fn of [...(spent ?? []), ...(this.persistent.get(type) ?? [])]) fn(event);
  }
}

vi.mock('maplibre-gl', () => ({ Map: FakeMapLibreMap, addProtocol }));
vi.mock('pmtiles', () => ({
  Protocol: class {
    tile = tileHandler;
  },
}));

import { MapCanvas, type MapCanvasProps, type MapTileUrls } from './MapCanvas';
import { mapBackground, mapStyle } from '../../lib/map-style';
import { MAP_COLOR_SCHEME } from '../../lib/map-config';

/** The source id the style gives the archive it draws from. Hard-coded here on purpose: the
 *  canvas filters `sourcedata` by it, and a test that imported the same constant could not catch
 *  the two drifting apart. `isGroundSource` is the contract, and this is the value it must accept. */
const MAP_STYLE_SOURCE = 'protomaps';

const TOKYO = { lat: 35.68, lng: 139.76 };
const WORLD: MapTileUrls = { world: '/map/world.pmtiles' };
const WITH_TRIP: MapTileUrls = {
  world: '/map/world.pmtiles',
  trip: '/trips/t1/map/extract.pmtiles',
};

/** The map is built behind three chained dynamic `import()`s, so the effect has not
 *  finished when `render` returns and one microtask drain is not enough to get there.
 *  Everything a test asserts about the instance has to be awaited through this. */
const settle = () =>
  act(async () => {
    for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
  });

const holder = () => document.querySelector('.map-canvas') as HTMLElement;
const built = () => FakeMapLibreMap.built.at(-1)!;

const props = (partial: Partial<MapCanvasProps> = {}): MapCanvasProps => ({
  scheme: partial.scheme ?? MAP_COLOR_SCHEME.light,
  urls: partial.urls ?? WORLD,
  centre: partial.centre ?? TOKYO,
  zoom: partial.zoom ?? 12,
  onMap: partial.onMap ?? vi.fn(),
  onFirstPaint: partial.onFirstPaint,
  onIdle: partial.onIdle,
  onError: partial.onError,
  onUnavailable: partial.onUnavailable,
});

async function paint(partial: Partial<MapCanvasProps> = {}) {
  const all = props(partial);
  const view = render(<MapCanvas {...all} />);
  await settle();
  return { ...view, all };
}

// `addProtocol` is deliberately NOT cleared: the protocol is registered once per PAGE, so
// the count accumulating across this whole file is exactly the claim the last test makes.
afterEach(() => {
  cleanup();
  FakeMapLibreMap.built.length = 0;
  FakeMapLibreMap.failToBuild = false;
});

describe('MapCanvas — the lifecycle ADR-0186 §1 chose to own', () => {
  // **The whole reason there is no React wrapper here.** A rebuild used to be a billed load
  // (ADR-0121 §4); it is now a blank canvas and a lost camera, and the discipline is
  // identical — so a consumer re-rendering every second (which `screens/Map.tsx` does) must
  // not be able to construct a second map, not even by handing down fresh callbacks.
  it('constructs the map once, and no re-render builds a second', async () => {
    const { rerender } = await paint();
    expect(FakeMapLibreMap.built).toHaveLength(1);
    const first = built();

    rerender(
      <MapCanvas
        {...props({
          centre: { lat: 0, lng: 0 },
          zoom: 3,
          scheme: MAP_COLOR_SCHEME.dark,
          urls: WITH_TRIP,
        })}
      />,
    );
    await settle();
    expect(FakeMapLibreMap.built).toHaveLength(1);
    expect(built()).toBe(first);
    expect(first.removed).toBe(0);
  });

  it('hands the live instance out, with the module, and takes both back on unmount', async () => {
    const onMap = vi.fn();
    const { unmount } = await paint({ onMap });
    expect(onMap).toHaveBeenCalledTimes(1);
    // Asserted argument-wise rather than with `toHaveBeenCalledWith`: the second argument is the
    // renderer MODULE, and a failure there would try to pretty-print the whole of `maplibre-gl`.
    expect(onMap.mock.calls[0][0]).toBe(built());
    // **The module comes with the instance**, which is what lets the consumer construct markers
    // in the same commit instead of a microtask later. `Marker` is what it is wanted for.
    expect(onMap.mock.calls[0][1]).toHaveProperty('Map');
    const map = built();

    unmount();
    // `null` FIRST — both of them — so a consumer holding either drops it before the context
    // goes. Handing back a live module beside a dead map would be an invitation to use it.
    expect(onMap.mock.calls.at(-1)![0]).toBeNull();
    expect(onMap.mock.calls.at(-1)![1]).toBeNull();
    // `remove()` releases the WebGL context and every listener. Not doing it is how a
    // tab-switching app accumulates contexts until the browser starts reclaiming them.
    expect(map.removed).toBe(1);
  });

  it('does not build a map at all when it was unmounted before the module arrived', async () => {
    const onMap = vi.fn();
    const view = render(<MapCanvas {...props({ onMap })} />);
    view.unmount();
    await settle();
    expect(FakeMapLibreMap.built).toHaveLength(0);
  });

  // **`load` is not a painted map and `idle` alone is not either.** MapLibre has no single
  // "tiles painted" event, so the honest equivalent of Google's `onTilesLoaded` — which is
  // what the pane's watchdog waits on — is the pair. Getting this wrong in either direction
  // is a watchdog that resolves on an empty canvas or one that never resolves at all.
  describe('the first-paint signal means a TILE arrived (the watchdog’s input)', () => {
    /** One tile of our own ground, loaded and parsed — the event `load`/`idle` cannot stand in
     *  for. `sourceId` matters: a future second source must not answer for this one. */
    const tileArrives = (map = built()) =>
      act(() => map.fire('sourcedata', { sourceId: MAP_STYLE_SOURCE, tile: {} }));

    // ── THE BLANK MAP THAT SAID NOTHING (2026-08-14, from the owner's phone) ──────────
    // The whole reason this signal is not `load` + `idle`. Both settle on their own schedule,
    // and a map whose every tile request failed satisfies both — "nothing pending" includes
    // "nothing left to fail". Shipping that pair as the watchdog's input latched `tilesPainted`
    // on a canvas showing only its own background colour, which took the cue, the retry pill and
    // the diagnostic away with it. Field report #28, arrived at from a new direction.
    it('stays silent through load and idle when NO tile ever arrives', async () => {
      const onFirstPaint = vi.fn();
      await paint({ onFirstPaint });
      act(() => built().fire('load'));
      act(() => built().fire('idle'));
      act(() => built().fire('idle'));
      expect(onFirstPaint).not.toHaveBeenCalled();
    });

    it('stays silent for a tile belonging to some other source', async () => {
      const onFirstPaint = vi.fn();
      await paint({ onFirstPaint });
      act(() => built().fire('load'));
      act(() => built().fire('sourcedata', { sourceId: 'something-else', tile: {} }));
      act(() => built().fire('idle'));
      expect(onFirstPaint).not.toHaveBeenCalled();
    });

    // A source-level `sourcedata` (the archive's own header parsing) carries no `tile`. It is
    // not a painted tile and must not be read as one.
    it('stays silent for a source event that carries no tile', async () => {
      const onFirstPaint = vi.fn();
      await paint({ onFirstPaint });
      act(() => built().fire('load'));
      act(() => built().fire('sourcedata', { sourceId: MAP_STYLE_SOURCE }));
      act(() => built().fire('idle'));
      expect(onFirstPaint).not.toHaveBeenCalled();
    });

    it('stays silent on load by itself', async () => {
      const onFirstPaint = vi.fn();
      await paint({ onFirstPaint });
      act(() => built().fire('load'));
      tileArrives();
      expect(onFirstPaint).not.toHaveBeenCalled();
    });

    it('fires once a tile has arrived and the map has settled, and not again', async () => {
      const onFirstPaint = vi.fn();
      await paint({ onFirstPaint });
      act(() => built().fire('load'));
      tileArrives();
      act(() => built().fire('idle'));
      expect(onFirstPaint).toHaveBeenCalledTimes(1);
      act(() => built().fire('idle'));
      expect(onFirstPaint).toHaveBeenCalledTimes(1);
    });

    // **The payoff of arming it on EVERY idle rather than only the first.** Tiles that are
    // merely slow arrive after several idles have already gone by, and the pane's slow notice has
    // to retire itself when they land — which only happens if this still fires late.
    it('fires late when the tiles were only slow, after idles have already passed', async () => {
      const onFirstPaint = vi.fn();
      await paint({ onFirstPaint });
      act(() => built().fire('load'));
      act(() => built().fire('idle'));
      act(() => built().fire('idle'));
      expect(onFirstPaint).not.toHaveBeenCalled();
      tileArrives();
      act(() => built().fire('idle'));
      expect(onFirstPaint).toHaveBeenCalledTimes(1);
    });

    it('reports every later settle separately, for the pane’s onViewChange', async () => {
      const onIdle = vi.fn();
      await paint({ onIdle });
      act(() => built().fire('load'));
      act(() => built().fire('idle'));
      act(() => built().fire('idle'));
      // Unconditional, unlike first paint: the bounds readout wants every settle, whether or
      // not anything painted — a panned-away empty view is a real answer for `X באזור`.
      expect(onIdle).toHaveBeenCalledTimes(2);
    });

    it('says nothing to a consumer that has already unmounted', async () => {
      const onFirstPaint = vi.fn();
      const onIdle = vi.fn();
      const { unmount } = await paint({ onFirstPaint, onIdle });
      const map = built();
      unmount();
      act(() => map.fire('load'));
      act(() => map.fire('sourcedata', { sourceId: MAP_STYLE_SOURCE, tile: {} }));
      act(() => map.fire('idle'));
      expect(onFirstPaint).not.toHaveBeenCalled();
      expect(onIdle).not.toHaveBeenCalled();
    });
  });

  // **A tile 404 arrives as `error`.** Reading a single one as "the map is dead" would put
  // the pane in its failure state over one missing tile at the edge of an extract — so the
  // canvas reports and keeps going, and whether anything ever painted is what decides
  // death. That decision is the PANE's, and this is the half that has to leave it open.
  describe('an error is reported, and is not by itself a dead canvas', () => {
    const fireError = async (raw: unknown) => {
      const onError = vi.fn();
      const onUnavailable = vi.fn();
      await paint({ onError, onUnavailable });
      act(() => built().fire('error', { error: raw }));
      return { onError, onUnavailable, map: built() };
    };

    it('does not mark the canvas failed, and does not tear the map down', async () => {
      const { onError, onUnavailable, map } = await fireError({ message: 'tile 404' });
      expect(onError).toHaveBeenCalledTimes(1);
      // **The split that keeps the pane from guessing.** A tile error reaches `onError` and
      // nothing else: `onUnavailable` is the terminal signal, and firing it here would put
      // the pane into `ErrorState` over one missing tile at the edge of an extract.
      expect(onUnavailable).not.toHaveBeenCalled();
      expect(holder().hasAttribute('data-map-failed')).toBe(false);
      expect(map.removed).toBe(0);
    });

    // MapLibre's event carries `ErrorLike` — a `message` and no guaranteed `name` — so it
    // cannot be handed to anything typed for `Error`. Normalised here rather than at each
    // consumer, which is what keeps the pane's diagnostic field one shape.
    it('normalises ErrorLike into a real Error, keeping its message', async () => {
      const { onError } = await fireError({ message: 'tile 404' });
      const reported = onError.mock.calls[0][0] as Error;
      expect(reported).toBeInstanceOf(Error);
      expect(reported.message).toBe('tile 404');
    });

    it('passes a real Error straight through', async () => {
      const real = new TypeError('nope');
      const { onError } = await fireError(real);
      expect(onError).toHaveBeenCalledWith(real);
    });

    it('still reports something when the payload carries no message at all', async () => {
      const { onError } = await fireError(undefined);
      expect((onError.mock.calls[0][0] as Error).message).toBe('maplibre error');
    });
  });

  // The other half of the split above: the module or the protocol failing means there is no
  // canvas to have, so the holder says so rather than sitting there as an empty box.
  it('marks the holder failed when the map cannot be constructed at all', async () => {
    FakeMapLibreMap.failToBuild = true;
    const onError = vi.fn();
    const onUnavailable = vi.fn();
    await paint({ onError, onUnavailable });
    expect(holder().hasAttribute('data-map-failed')).toBe(true);
    expect((onUnavailable.mock.calls[0][0] as Error).message).toBe('webgl unavailable');
    // And NOT through the tile channel, which the pane deliberately treats as harmless.
    expect(onError).not.toHaveBeenCalled();
  });

  // **`[lng, lat]`, not `{lat, lng}`.** MapLibre is GeoJSON-ordered and the app is not;
  // this is the one line where the two conventions meet, so it is the one place a silent
  // transposition — Tokyo becoming a point in Somalia — could be introduced.
  it('crosses the coordinate as [lng, lat]', async () => {
    await paint({ centre: TOKYO, zoom: 15 });
    expect(built().options.center).toEqual([TOKYO.lng, TOKYO.lat]);
    expect(built().options.zoom).toBe(15);
  });

  it('opens on the style and ground colour for the scheme it was given', async () => {
    await paint({ scheme: MAP_COLOR_SCHEME.dark, urls: WITH_TRIP });
    expect(built().options.style).toEqual(mapStyle(MAP_COLOR_SCHEME.dark, WITH_TRIP));
    // Painted on the holder so the first frame is the map's own ground rather than the page
    // showing through while tiles arrive. Compared through a reference element rather than
    // against the token directly: jsdom re-serialises a colour it parses (`rgb(…)`), so the
    // literal string never survives the round trip. The pair below is what makes this an
    // assertion rather than a tautology — the two schemes must not resolve to one ground.
    const asPainted = (scheme: typeof MAP_COLOR_SCHEME.dark | typeof MAP_COLOR_SCHEME.light) => {
      const probe = document.createElement('div');
      probe.style.background = mapBackground(scheme);
      return probe.style.background;
    };
    expect(holder().style.background).toBe(asPainted(MAP_COLOR_SCHEME.dark));
    expect(asPainted(MAP_COLOR_SCHEME.dark)).not.toBe(asPainted(MAP_COLOR_SCHEME.light));
  });

  // ADR-0186 §2: these stop being suppressions of vendor chrome and become choices. Our
  // attribution lives in the style (`MAP_ATTRIBUTION`), because MapLibre's own control is
  // vendor chrome on an RTL page.
  it('switches off MapLibre’s own attribution control and keyboard handling', async () => {
    await paint();
    expect(built().options.attributionControl).toBe(false);
    expect(built().options.keyboard).toBe(false);
  });

  // **The page-global this migration had to be explicit about.** `addProtocol` registers a
  // HANDLER, not a status — there is no success/failure latch to inherit, which is the
  // distinction that makes it acceptable where vis.gl's write-once `LOADED`/`FAILED` was
  // not. It is still guarded, so a remount cannot stack handlers on top of each other.
  it('registers the pmtiles protocol once, however many panes mount', async () => {
    const { unmount } = await paint();
    unmount();
    await paint();
    // ONE, across every mount in this file — the guard is module-scoped, and it is never
    // torn down on purpose: a second pane mounting while the first unmounts would otherwise
    // pull the protocol out from under it.
    expect(addProtocol.mock.calls).toEqual([['pmtiles', tileHandler]]);
  });

  // The latest-ref idiom, asserted rather than assumed: the effect runs once, so a callback
  // handed down later reaches the events only if the ref is what the listeners read. A
  // consumer re-rendering every second gets fresh identities constantly.
  it('delivers events to the callbacks it has NOW, not the ones it mounted with', async () => {
    const first = vi.fn();
    const { rerender } = await paint({ onFirstPaint: first });
    const later = vi.fn();
    rerender(<MapCanvas {...props({ onFirstPaint: later })} />);
    act(() => built().fire('load'));
    act(() => built().fire('sourcedata', { sourceId: MAP_STYLE_SOURCE, tile: {} }));
    act(() => built().fire('idle'));
    expect(first).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
  });
});
