// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  edgeLatchAt,
  edgeScrollStep,
  gateEdgeStep,
  nearestScroller,
  useEdgeAutoScroll,
  type EdgeLatch,
} from './edge-autoscroll';
import { DRAG_EDGE_SCROLL_RELEASE_PX, DRAG_EDGE_SCROLL_ZONE_PX } from '../constants';

// The pacing only (ADR-0116 §5 amendment): the rAF loop and the scroller lookup
// need real layout, but how fast a held pointer scrolls is pure arithmetic.
describe('edgeScrollStep', () => {
  const H = 800;

  it('does not scroll from the middle of the screen', () => {
    expect(edgeScrollStep(400, H)).toBe(0);
    expect(edgeScrollStep(200, H)).toBe(0);
  });

  it('scrolls up near the top edge and down near the bottom', () => {
    expect(edgeScrollStep(10, H)).toBeLessThan(0);
    expect(edgeScrollStep(H - 10, H)).toBeGreaterThan(0);
  });

  it('ramps with depth into the edge band, so easing in crawls', () => {
    const shallow = Math.abs(edgeScrollStep(70, H, 84, 14));
    const deep = Math.abs(edgeScrollStep(4, H, 84, 14));
    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(shallow);
    expect(deep).toBeLessThanOrEqual(14);
  });

  it('never exceeds the max step, even past the edge', () => {
    expect(edgeScrollStep(-50, H, 84, 14)).toBe(-14);
    expect(edgeScrollStep(H + 50, H, 84, 14)).toBe(14);
  });

  it('shrinks the bands on a short viewport instead of overlapping them', () => {
    // With a 100px viewport an 84px band each side would overlap, making the
    // middle scroll both ways at once.
    expect(edgeScrollStep(50, 100, 84, 14)).toBe(0);
  });

  it('is inert without a viewport', () => {
    expect(edgeScrollStep(10, 0)).toBe(0);
  });
});

// "It starts scrolling toward whichever edge you're near before you even started
// moving": the shelf sits at the bottom of the list, so a card is nearly always
// picked up inside a band, and the drag opened by running the list away.
describe('gateEdgeStep', () => {
  // Lifted 20px from the bottom of the box and 20px from the top respectively.
  // `low`/`high` rather than up/down since the latch went axis-agnostic: the inline day
  // step shares it, and the band it guards there has no top (ADR-0116 §2's amendment).
  const bottom: EdgeLatch = { dir: 'high', from: 580 };
  const top: EdgeLatch = { dir: 'low', from: 20 };

  it('holds off the band the drag was lifted in while the pointer rests there', () => {
    expect(gateEdgeStep(14, 580, bottom).step).toBe(0);
    expect(gateEdgeStep(-14, 20, top).step).toBe(0);
  });

  it('ignores a wobble on the spot, in either direction', () => {
    expect(gateEdgeStep(14, 586, bottom).step).toBe(0);
    expect(gateEdgeStep(14, 570, bottom).step).toBe(0);
  });

  it('releases as soon as the drag pushes on toward that same edge', () => {
    // The second half of the report: an edge you started near was an edge you could
    // not scroll toward at all without walking away from it first.
    expect(gateEdgeStep(14, 580 + DRAG_EDGE_SCROLL_RELEASE_PX, bottom)).toEqual({
      step: 14,
      latch: null,
    });
    expect(gateEdgeStep(-14, 20 - DRAG_EDGE_SCROLL_RELEASE_PX, top)).toEqual({
      step: -14,
      latch: null,
    });
  });

  it('lets the opposite band scroll straight away — that reach is deliberate', () => {
    expect(gateEdgeStep(-14, 20, bottom)).toEqual({ step: -14, latch: null });
    expect(gateEdgeStep(14, 580, top)).toEqual({ step: 14, latch: null });
  });

  it('releases the latch once the pointer leaves the band, and scrolls on its return', () => {
    const left = gateEdgeStep(0, 300, bottom);
    expect(left).toEqual({ step: 0, latch: null });
    expect(gateEdgeStep(14, 580, left.latch).step).toBe(14);
  });

  it('is transparent to a drag lifted clear of both bands', () => {
    expect(gateEdgeStep(0, 300, null)).toEqual({ step: 0, latch: null });
    expect(gateEdgeStep(-9, 30, null)).toEqual({ step: -9, latch: null });
  });
});

describe('edgeLatchAt', () => {
  it('latches the band a drag was lifted in, remembering where', () => {
    expect(edgeLatchAt(14, 580)).toEqual({ dir: 'high', from: 580 });
    expect(edgeLatchAt(-14, 20)).toEqual({ dir: 'low', from: 20 });
  });

  it('latches nothing for a drag lifted in the middle', () => {
    expect(edgeLatchAt(0, 300)).toBeNull();
  });
});

// The loop itself, with a hand-cranked rAF: what the pure functions above can't say
// is what the FIRST frames of a drag do, which is the whole of the bug.
describe('useEdgeAutoScroll', () => {
  const BOX = { top: 100, height: 600 };
  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  const runFrames = (count = 4) =>
    act(() => {
      for (let i = 0; i < count; i++) frames.shift()?.(0);
    });

  /** A page-sized scroller with a card in it, scrolled to the middle so there is room
   *  to move either way. jsdom has no layout, so height, overflow and scrollTop are
   *  all supplied. */
  function scrollerWithCard() {
    const el = document.createElement('div');
    el.style.overflowY = 'auto';
    Object.defineProperty(el, 'scrollHeight', { value: 4000 });
    Object.defineProperty(el, 'clientHeight', { value: BOX.height });
    let scrollTop = 1000;
    Object.defineProperty(el, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => (scrollTop = Math.max(0, Math.min(4000 - BOX.height, v))),
    });
    el.getBoundingClientRect = () => ({ ...BOX, bottom: BOX.top + BOX.height }) as DOMRect;
    const card = document.createElement('div');
    el.append(card);
    document.body.append(el);
    return { el, card };
  }

  /** Viewport y values, since that is what a pointer reports: inside each band of the
   *  scroller's own box, and clear of both. */
  const inTopBand = BOX.top + 8;
  const inBottomBand = BOX.top + BOX.height - 8;
  const clearOfBands = BOX.top + BOX.height - DRAG_EDGE_SCROLL_ZONE_PX - 40;
  /** Just inside the bottom band, with room to push further into it — a card lifted
   *  from the shelf lands about here. */
  const enteringBottomBand = BOX.top + BOX.height - DRAG_EDGE_SCROLL_ZONE_PX + 12;

  it('does not scroll while the finger rests where the drag was lifted', () => {
    const { el, card } = scrollerWithCard();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: inBottomBand }));
    const before = el.scrollTop;
    runFrames();

    expect(el.scrollTop).toBe(before);
  });

  it('does not yank the list upward before the first move arrives', () => {
    // The tracked point used to start at 0,0 — pinned against the top edge — so every
    // drag, wherever it was lifted, scrolled up at full speed until the finger moved.
    const { el, card } = scrollerWithCard();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: clearOfBands }));
    const before = el.scrollTop;
    runFrames();

    expect(el.scrollTop).toBe(before);
  });

  it('scrolls when the drag pushes on toward the edge it was lifted at', () => {
    // The follow-up report: near an edge, dragging TOWARD that edge did nothing at all
    // — the latch waited for the pointer to leave a band it had never left.
    const { el, card } = scrollerWithCard();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: enteringBottomBand }));
    const before = el.scrollTop;
    act(() =>
      result.current.track({
        clientX: 0,
        clientY: enteringBottomBand + DRAG_EDGE_SCROLL_RELEASE_PX,
      }),
    );
    runFrames();

    expect(el.scrollTop).toBeGreaterThan(before);
  });

  it('still ignores the wobble of a thumb settling on the card', () => {
    const { el, card } = scrollerWithCard();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: enteringBottomBand }));
    const before = el.scrollTop;
    act(() => result.current.track({ clientX: 0, clientY: enteringBottomBand + 3 }));
    runFrames();

    expect(el.scrollTop).toBe(before);
  });

  it('reaches for the opposite edge immediately', () => {
    const { el, card } = scrollerWithCard();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: inBottomBand }));
    act(() => result.current.track({ clientX: 0, clientY: inTopBand }));
    runFrames();

    expect(el.scrollTop).toBeLessThan(1000);
  });

  it('scrolls into the lift band once the finger has left it and come back', () => {
    const { el, card } = scrollerWithCard();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: inBottomBand }));
    act(() => result.current.track({ clientX: 0, clientY: clearOfBands }));
    runFrames(2);
    const before = el.scrollTop;
    act(() => result.current.track({ clientX: 0, clientY: inBottomBand }));
    runFrames();

    expect(el.scrollTop).toBeGreaterThan(before);
  });

  it('re-runs the drop hit-test only on frames that really scrolled', () => {
    const { card } = scrollerWithCard();
    const onFrame = vi.fn();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: inBottomBand }, onFrame));
    runFrames();
    expect(onFrame).not.toHaveBeenCalled();

    act(() => result.current.track({ clientX: 0, clientY: inTopBand }));
    runFrames();
    expect(onFrame).toHaveBeenCalledWith({ clientX: 0, clientY: inTopBand });
  });

  it('starts each drag with a fresh latch, never the previous one', () => {
    const { el, card } = scrollerWithCard();
    const { result } = renderHook(() => useEdgeAutoScroll());

    act(() => result.current.start(card, { clientX: 0, clientY: inBottomBand }));
    act(() => result.current.track({ clientX: 0, clientY: inTopBand }));
    runFrames(2);
    act(() => result.current.stop());

    // Lifted clear of the bands this time, then held at the bottom: the previous
    // drag's released latch must not leak into it either way.
    act(() => result.current.start(card, { clientX: 0, clientY: clearOfBands }));
    const before = el.scrollTop;
    act(() => result.current.track({ clientX: 0, clientY: inBottomBand }));
    runFrames();

    expect(el.scrollTop).toBeGreaterThan(before);
  });
});

// The two bugs behind "dragging and auto-scrolling are clashing", both about WHICH
// element scrolls and WHEN the drop target is recomputed.
describe('scroller selection + frame callback', () => {
  const nodes: HTMLElement[] = [];
  const el = (style: Partial<CSSStyleDeclaration>, scrollH: number, clientH: number) => {
    const node = document.createElement('div');
    Object.assign(node.style, style);
    Object.defineProperty(node, 'scrollHeight', { value: scrollH, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: clientH, configurable: true });
    nodes.push(node);
    return node;
  };

  afterEach(() => {
    nodes.forEach((n) => n.remove());
    nodes.length = 0;
  });

  it('ignores a horizontally-scrolling strip that overflows vertically by a hair', () => {
    // `.shelf { overflow-x: auto }` computes overflow-y: auto, and such a strip is
    // often 1-2px taller than its box — picking it made the drag nudge the strip
    // instead of scrolling the page.
    const page = el({ overflowY: 'auto' }, 4000, 800);
    const strip = el({ overflowX: 'auto' }, 152, 150);
    const card = document.createElement('div');
    page.append(strip);
    strip.append(card);
    document.body.append(page);

    expect(nearestScroller(card)).toBe(page);
  });

  it('picks a strip that genuinely scrolls vertically', () => {
    const page = el({ overflowY: 'auto' }, 4000, 800);
    const inner = el({ overflowY: 'auto' }, 900, 300);
    const card = document.createElement('div');
    page.append(inner);
    inner.append(card);
    document.body.append(page);

    expect(nearestScroller(card)).toBe(inner);
  });
});
