// @vitest-environment jsdom
//
// The edge that names another day (ADR-0116 §2's 2026-08-22 amendment). Four things are worth
// pinning here and the dwell is not one of them — `useSpringLoadedDay` already owns that, and
// this hook only says WHICH day, which is the part with arithmetic in it:
//
//   1. **The mirror.** In RTL the next day lies to the LEFT, because that is where its peek
//      pane sits (`screens.css`). A hard-coded side here is a feature that works in one
//      direction on one layout, and the two ways of reaching tomorrow would disagree.
//   2. **The latch**, which is a transposed scar rather than caution: a row spans the surface,
//      so a card lifted from its end starts inside a band, and the days would begin flipping
//      under a finger that had not moved.
//   3. **The trip's ends**, where the neighbour is `null` and the edge must do nothing at all.
//   4. **Repeating.** Holding still steps again, and it does so because the neighbours changed
//      rather than because the finger moved — which is the one thing in here the dwell cannot
//      give for free.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { DRAG_DAY_EDGE_PX, DRAG_EDGE_SCROLL_RELEASE_PX } from '../constants';
import { useEdgeDayStep, type DayNeighbours, type EdgeDayStep } from './useEdgeDayStep';

const WIDTH = 360;
const LEFT = 20;

/** jsdom lays nothing out, and every number here is measured off a box — so the host states
 *  one, the way `useSwipePager`'s own harness does. */
function Host({
  neighbours,
  rtl = true,
  children,
}: {
  neighbours: DayNeighbours;
  rtl?: boolean;
  children: (edge: EdgeDayStep) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  if (ref.current) {
    ref.current.getBoundingClientRect = () =>
      ({ left: LEFT, width: WIDTH, right: LEFT + WIDTH, top: 0, height: 640 }) as DOMRect;
  }
  const edge = useEdgeDayStep(ref, neighbours);
  return (
    <div ref={ref} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      {children(edge)}
    </div>
  );
}

/** The hook's value, re-read after every act — it is state, so a stale capture would assert
 *  the previous frame. */
function mount(neighbours: DayNeighbours, rtl = true) {
  let api: EdgeDayStep | null = null;
  const view = render(
    <Host neighbours={neighbours} rtl={rtl}>
      {(edge) => {
        api = edge;
        return null;
      }}
    </Host>,
  );
  const at = (x: number) => ({ clientX: LEFT + x, clientY: 300 });
  return {
    // A first render happened with no box (the ref was null), so re-render to let the harness
    // install one — the same order a real host has, where layout exists by the time a drag arms.
    settle: () =>
      act(() =>
        view.rerender(
          <Host neighbours={neighbours} rtl={rtl}>
            {(e) => {
              api = e;
              return null;
            }}
          </Host>,
        ),
      ),
    arm: (x: number) => act(() => api!.arm(at(x))),
    track: (x: number) => act(() => api!.track(at(x))),
    stop: () => act(() => api!.stop()),
    date: () => api!.date,
    redraw: (next: DayNeighbours) =>
      act(() => {
        view.rerender(
          <Host neighbours={next} rtl={rtl}>
            {(e) => {
              api = e;
              return null;
            }}
          </Host>,
        );
      }),
  };
}

const PREV = '2026-08-21';
const NEXT = '2026-08-23';
const BOTH = { prev: PREV, next: NEXT };
/** Comfortably inside a band, and comfortably past the latch's release distance from the
 *  middle so a drag armed centrally is never gated. */
const AT_LOW = 4;
const AT_HIGH = WIDTH - 4;
const MIDDLE = WIDTH / 2;

afterEach(cleanup);

describe('useEdgeDayStep', () => {
  it('names the NEXT day at the left edge and the PREVIOUS one at the right, in RTL', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
    h.track(AT_HIGH);
    expect(h.date()).toBe(PREV);
  });

  it('mirrors under ltr', () => {
    const h = mount(BOTH, false);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(PREV);
    h.track(AT_HIGH);
    expect(h.date()).toBe(NEXT);
  });

  it('names nothing from the middle', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(MIDDLE);
    expect(h.date()).toBeNull();
    h.track(DRAG_DAY_EDGE_PX + 10);
    expect(h.date()).toBeNull();
  });

  // THE LATCH. A row spans the surface, so this is the ordinary case of picking a card up by
  // its end — not an edge case.
  it('says nothing about the band it was lifted in until the drag asks for it', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(AT_LOW);
    h.track(AT_LOW);
    expect(h.date()).toBeNull();
    // Still inside the band, not yet pushed far enough toward it to count as asking.
    h.track(AT_LOW - 2);
    expect(h.date()).toBeNull();
    // Leaving the band releases the latch, and coming back is then an ordinary approach.
    h.track(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
  });

  it('or until it pushes deeper into that band than it was lifted at', () => {
    const h = mount(BOTH);
    h.settle();
    const lifted = DRAG_DAY_EDGE_PX - 4;
    h.arm(lifted);
    h.track(lifted);
    expect(h.date()).toBeNull();
    h.track(lifted - DRAG_EDGE_SCROLL_RELEASE_PX);
    expect(h.date()).toBe(NEXT);
  });

  // The trip's ends, which is the same statement the swipe's rebuff makes: nothing arrives,
  // and no label is needed to say so.
  it('names nothing past the end of the trip', () => {
    const h = mount({ prev: PREV, next: null });
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBeNull();
    h.track(AT_HIGH);
    expect(h.date()).toBe(PREV);
  });

  // **Holding still keeps stepping.** The finger does not move, so nothing calls `track` — the
  // day having changed under it is the whole input. Without the effect that recomputes on the
  // neighbours, the edge would step exactly once and then look broken.
  it('re-aims at the new neighbour when the day it named has arrived', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
    // The dwell fired and the day is now NEXT, so the neighbours have shifted a day along.
    h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
    expect(h.date()).toBe('2026-08-24');
  });

  it('forgets the drag when it ends', () => {
    const h = mount(BOTH);
    h.settle();
    h.arm(MIDDLE);
    h.track(AT_LOW);
    expect(h.date()).toBe(NEXT);
    h.stop();
    expect(h.date()).toBeNull();
    // And a redraw after the drag is over must not resurrect a target.
    h.redraw({ prev: '2026-08-22', next: '2026-08-24' });
    expect(h.date()).toBeNull();
  });
});
