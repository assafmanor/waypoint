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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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
  useMap: () => null,
}));

import { MapPane, type MapPin } from './MapPane';
import { PIN_TIER } from '../../lib/map-pins';
import { MAP_CONNECTOR } from '../../constants';
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

function paint(props: Partial<Parameters<typeof MapPane>[0]> = {}) {
  return render(
    <MapPane
      config={CONFIG}
      pins={props.pins ?? [pin({ placeId: 'a' })]}
      setSignal={props.setSignal ?? 'day'}
      onSelectPin={props.onSelectPin ?? vi.fn()}
      onCanvasTap={props.onCanvasTap ?? vi.fn()}
      onViewChange={props.onViewChange ?? vi.fn()}
      areaCount={props.areaCount ?? 1}
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

    // Google's own landmark/attraction icons are visible again (ADR-0125 §6) and they open
    // Google's place card. That tap arrives as a map click carrying a `placeId`, so reading
    // it as background would clear our selection behind the card that just opened.
    it("a tap on one of GOOGLE's landmark icons is not a tap on the canvas either", () => {
      const onCanvasTap = vi.fn();
      paint({ onCanvasTap });
      nextTap.placeId = 'ChIJLU7jZClu5kcR4PcOOO6p3I0';
      fireEvent.click(document.querySelector('[data-map]')!);
      expect(onCanvasTap).not.toHaveBeenCalled();
    });
  });

  it('re-centre is a named icon control, not a raw glyph', () => {
    paint();
    const button = screen.getByRole('button', { name: t.map.recentre });
    expect(button.querySelector('svg.icon')).toBeTruthy();
    expect(button.textContent).toBe('');
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
      />,
    );
    expect(markers()[0]).toBe(before);
    expect(document.querySelectorAll('[data-map]')).toHaveLength(1);
  });
});
