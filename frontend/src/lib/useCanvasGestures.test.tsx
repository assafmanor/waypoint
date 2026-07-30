// @vitest-environment jsdom
//
// The canvas gestures' imperative half (ADR-0145 §1/§2, ADR-0147 §1). The recogniser itself
// is a pure table in `canvas-gestures.test.ts`; what is under test here is the part that
// cannot be — the listeners, the hold timer, and the click swallow.
//
// **The swallow is why this file exists.** A completed gesture fires one `click` that must
// not read as a tap, so the pipeline arms a capture-phase listener for exactly one. Arming
// without a disarm strands it: the listener then eats the user's NEXT genuine tap, which
// presents as "the thing I tapped did not respond" — a tap outside `IconPicker` failing to
// close it, for instance, since that panel's dismissal is a bubble-phase `click` on
// `document` and this guard stops propagation ahead of it. `useHoldToDrag` already carried
// the fallback and the note; copying the arm without the disarm is how that lesson got lost
// on the way to the canvas.
import '../test/pointer-events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef, type RefObject } from 'react';
import { DRAG_CLICK_SWALLOW_MS, DRAG_HOLD_MS } from '../constants';
import { useCanvasGestures } from './useCanvasGestures';
import type { LatLng } from './map-camera';

/** The ~60-line fake map ADR-0145 records as sufficient: the gestures touch a handful of
 *  methods, so a fake covers them completely (`frontend/CLAUDE.md` — "before declaring
 *  imperative glue untestable, count the methods it actually calls"). */
function fakeMap(zoom = 14) {
  return {
    getZoom: () => zoom,
    getCenter: () => ({ lat: () => 35.68, lng: () => 139.76 }),
    get: () => undefined,
    // A projection that is linear on purpose: this file asserts plumbing, not arithmetic.
    // The geography is `canvas-gestures.test.ts`'s job, against Google's real Mercator.
    getProjection: () => ({
      fromLatLngToPoint: (ll: LatLng) => ({ x: ll.lng, y: ll.lat }),
      fromPointToLatLng: (pt: { x: number; y: number }) => ({
        lat: () => pt.y,
        lng: () => pt.x,
      }),
    }),
  } as unknown as google.maps.Map;
}

let root: Root;
let host: HTMLDivElement;
let pane: HTMLDivElement;
const holds: LatLng[] = [];

function Harness({ paneRef }: { paneRef: RefObject<HTMLElement | null> }) {
  const camera = useRef({ zoomTo: vi.fn(), stepZoomIn: vi.fn() }).current;
  useCanvasGestures(fakeMap(), camera, paneRef, (at) => holds.push(at));
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  holds.length = 0;
  pane = document.createElement('div');
  // jsdom reports every rect as zero; the gesture reads the pane's box, so give it one.
  pane.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 390, height: 500, right: 390, bottom: 500 }) as DOMRect;
  document.body.appendChild(pane);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const paneRef = { current: pane } as RefObject<HTMLElement | null>;
  act(() => root.render(<Harness paneRef={paneRef} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  pane.remove();
  vi.useRealTimers();
});

const press = (y: number) =>
  pane.dispatchEvent(
    new PointerEvent('pointerdown', { clientX: 100, clientY: y, bubbles: true, button: 0 }),
  );
const lift = (y: number) =>
  pane.dispatchEvent(
    new PointerEvent('pointerup', { clientX: 100, clientY: y, bubbles: true, button: 0 }),
  );

/** Did a genuine tap survive to a bubble-phase `document` listener — i.e. is the swallow
 *  disarmed? This is the shape `IconPicker`'s own outside-tap dismissal has. */
function tapReaches(): boolean {
  let reached = false;
  const listener = () => {
    reached = true;
  };
  document.addEventListener('click', listener);
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.removeEventListener('click', listener);
  return reached;
}

describe('the long press', () => {
  it('drops a pin at the press point once the hold completes', () => {
    press(250);
    expect(holds).toHaveLength(0);
    act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
    expect(holds).toHaveLength(1);
  });

  it('does not drop when the finger lifts before the hold', () => {
    press(250);
    act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS - 20));
    lift(250);
    act(() => void vi.advanceTimersByTime(200));
    expect(holds).toHaveLength(0);
  });

  it('drops at most one pin per press', () => {
    press(250);
    act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS * 3));
    expect(holds).toHaveLength(1);
  });
});

describe('the click swallow', () => {
  it("eats the click a drop's own release fires, so the new card is not closed by it", () => {
    press(250);
    act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
    // The release's synthetic click — this one must NOT reach the screen, or `onCanvasTap`
    // clears the selection and the card just opened disappears.
    expect(tapReaches()).toBe(false);
  });

  it('DISARMS after that one click, so the next genuine tap is untouched', () => {
    press(250);
    act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
    expect(tapReaches()).toBe(false);
    expect(tapReaches()).toBe(true);
  });

  it('disarms on a timeout when the release fires no click at all', () => {
    // The case that made this a bug rather than a nicety: this pipeline `preventDefault`s the
    // touch stream that would have synthesised the click, so on a real device the swallow can
    // be armed and never spent. Without the fallback it eats the user's next real tap — the
    // "tapping outside the icon picker does not close it" symptom.
    press(250);
    act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
    act(() => void vi.advanceTimersByTime(DRAG_CLICK_SWALLOW_MS));
    expect(tapReaches()).toBe(true);
  });

  it('is disarmed by unmount, so it cannot reach the next screen', () => {
    press(250);
    act(() => void vi.advanceTimersByTime(DRAG_HOLD_MS));
    act(() => root.unmount());
    expect(tapReaches()).toBe(true);
    // Re-mounted in `afterEach`'s place, so the teardown there stays valid.
    root = createRoot(host);
    act(() => root.render(<div />));
  });
});
