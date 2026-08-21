// @vitest-environment jsdom
//
// The page-step gesture (ADR-0200). Four things are worth pinning and none of them is
// the arithmetic:
//
//   1. **Which way is "next"** — the app is RTL, so the finger that reaches the next page
//      moves RIGHT, and the mirror (`[dir='ltr']`) reverses it. A hard-coded sign here is
//      a gesture that works in one direction on one layout.
//   2. **The refusal at the ends** is not "nothing happens": the surface still follows the
//      finger, damped and capped, so the gesture answers. Asserting only "no step" would
//      pass for a dead surface.
//   3. **The vertical pan is not ours.** The surface lives inside the body's scroller and
//      the two gestures start at the same point.
//   4. **A strip inside it keeps its own axis.** This is the defect ADR-0182's device pass
//      found from the other side (`touch-action` on an ancestor), and here it is the
//      recogniser's job instead.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { SWIPE_PAGER } from '../constants';
import { useSwipePager, type SwipeStep } from './useSwipePager';
import { fakeScroller } from '../test/scroller-harness';
// jsdom has neither `PointerEvent` nor pointer capture, and this gesture is nothing but
// coordinates and a capture call.
import '../test/pointer-events';

const WIDTH = 360;
const COMMIT = WIDTH * SWIPE_PAGER.COMMIT_SHARE;

function Host({
  onStep,
  canStep = () => true,
  enabled = true,
  rtl = true,
  strip = false,
}: {
  onStep: (step: SwipeStep) => void;
  canStep?: (step: SwipeStep) => boolean;
  enabled?: boolean;
  rtl?: boolean;
  strip?: boolean;
}) {
  const { ref } = useSwipePager<HTMLDivElement>({ canStep, onStep, enabled });
  return (
    // `direction` inline rather than via `dir`: jsdom's `getComputedStyle` resolves the
    // style declaration, not the attribute's presentational hint.
    <div ref={ref} data-testid="host" style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      <button data-testid="card">card</button>
      {strip && (
        <div data-testid="strip">
          <span data-testid="chip">chip</span>
        </div>
      )}
    </div>
  );
}

function mount(props: Parameters<typeof Host>[0]) {
  const view = render(<Host {...props} />);
  const host = view.getByTestId('host');
  // jsdom lays nothing out, and the commit threshold is a SHARE of the surface's width —
  // with a zero rect the hook falls back to `window.innerWidth` and the numbers below
  // would mean something else.
  host.getBoundingClientRect = () => ({ width: WIDTH, height: 640 }) as DOMRect;
  if (props.strip) {
    const stripEl = view.getByTestId('strip');
    fakeScroller(stripEl, [view.getByTestId('chip')], { axis: 'inline', viewport: 40 });
  }
  return { view, host };
}

/** Let the page finish turning. **The step commits here, not at the release** — the exit
 *  animation carries the outgoing page off screen first, so that the arriving pane is exactly
 *  at rest when the date changes under it (ADR-0200 §7). `motionDurationMs` answers 0 with no
 *  `tokens.css`, so this is one turn of the loop rather than a wait. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

/** One gesture, start to finish — including the page turn unless `settle: false`, which is
 *  for the cases that inspect the surface mid-settle. */
function swipe(
  from: HTMLElement,
  {
    dx,
    dy = 0,
    cancel = false,
    settled = true,
  }: { dx: number; dy?: number; cancel?: boolean; settled?: boolean },
) {
  fireEvent.pointerDown(from, { clientX: 200, clientY: 300, button: 0 });
  // Two moves: the first crosses the slop and claims (or does not), the second is where
  // the finger actually ends up.
  const step = Math.sign(dx || 1) * Math.min(Math.abs(dx), SWIPE_PAGER.SLOP_PX + 4);
  fireEvent.pointerMove(window, { clientX: 200 + step, clientY: 300 + Math.sign(dy) * 2 });
  fireEvent.pointerMove(window, { clientX: 200 + dx, clientY: 300 + dy });
  fireEvent[cancel ? 'pointerCancel' : 'pointerUp'](window, {
    clientX: 200 + dx,
    clientY: 300 + dy,
  });
  if (settled) settle();
}

const offset = (host: HTMLElement) => host.style.getPropertyValue('--swipe-dx');

// Fake timers for the whole file, because the commit is now on a timer by design: the step
// lands when the page has finished turning. A test that asserted it synchronously would be
// asserting the old contract.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSwipePager', () => {
  it('steps to the NEXT page when the finger moves toward inline-start (right, in RTL)', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    swipe(host, { dx: COMMIT + 10, settled: false });
    // The turn finishes the travel rather than springing back: the offset goes to a full page
    // out, which is what lands the arriving pane exactly at rest (ADR-0200 §7).
    expect(host.getAttribute('data-swipe-settling')).toBe('turn');
    expect(parseFloat(offset(host))).toBe(WIDTH);
    settle();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('steps to the PREVIOUS page the other way', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    swipe(host, { dx: -(COMMIT + 10) });
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it('mirrors under [dir=ltr] — the same finger reaches the previous page', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep, rtl: false });
    swipe(host, { dx: COMMIT + 10 });
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it('does not commit a swipe that stops short of the threshold', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    swipe(host, { dx: COMMIT - 10, settled: false });
    expect(onStep).not.toHaveBeenCalled();
    // …and it did claim the gesture, so the surface followed and is on its way back to level.
    // `back`, not `turn` — the attribute's value is what tells the CSS which duration to use,
    // so a refusal asserting only that the attribute EXISTS would pass for a page turn.
    expect(host.getAttribute('data-swipe-settling')).toBe('back');
    expect(offset(host)).toBe('0px');
  });

  it('leaves a mostly-vertical drag to the body it sits in', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 210, clientY: 300 + SWIPE_PAGER.SLOP_PX + 5 });
    fireEvent.pointerMove(window, { clientX: 200 + COMMIT + 50, clientY: 500 });
    fireEvent.pointerUp(window, { clientX: 200 + COMMIT + 50, clientY: 500 });
    expect(onStep).not.toHaveBeenCalled();
    expect(host.hasAttribute('data-swiping')).toBe(false);
  });

  it('leaves a press inside a horizontally scrolling strip to the strip', () => {
    const onStep = vi.fn();
    const { view } = mount({ onStep, strip: true });
    swipe(view.getByTestId('chip'), { dx: COMMIT + 40 });
    expect(onStep).not.toHaveBeenCalled();
  });

  it('still claims a press on an ordinary control inside the surface', () => {
    const onStep = vi.fn();
    const { view } = mount({ onStep, strip: true });
    swipe(view.getByTestId('card'), { dx: COMMIT + 40 });
    expect(onStep).toHaveBeenCalledWith(1);
  });

  // THE REBUFF. Not "nothing happens" — the surface strains, capped, and comes back.
  it('refuses an edge by straining instead of stepping', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep, canStep: (step) => step !== 1 });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 200 + SWIPE_PAGER.SLOP_PX + 4, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 200 + 300, clientY: 300 });
    expect(host.hasAttribute('data-swiping')).toBe(true);
    const strained = parseFloat(offset(host));
    expect(strained).toBeGreaterThan(0);
    expect(strained).toBeLessThanOrEqual(SWIPE_PAGER.EDGE_MAX_PX);
    fireEvent.pointerUp(window, { clientX: 200 + 300, clientY: 300 });
    expect(onStep).not.toHaveBeenCalled();
    expect(offset(host)).toBe('0px');
    settle();
    expect(onStep).not.toHaveBeenCalled();
  });

  it('follows the finger one-for-one when there IS a page that way', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 200 + SWIPE_PAGER.SLOP_PX + 4, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 200 + 120, clientY: 300 });
    expect(offset(host)).toBe('120px');
  });

  it('commits nothing while disabled', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep, enabled: false });
    swipe(host, { dx: COMMIT + 40 });
    expect(onStep).not.toHaveBeenCalled();
    expect(host.hasAttribute('data-swiping')).toBe(false);
  });

  // A cancelled gesture is the browser saying it took the pan. It must not commit — and it
  // must not arm the click swallow either, which would eat the user's next genuine tap.
  it('commits nothing when the browser cancels the pointer', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    swipe(host, { dx: COMMIT + 40, cancel: true });
    expect(onStep).not.toHaveBeenCalled();
  });

  it('swallows the click a completed swipe fires on the control it started from', () => {
    const onStep = vi.fn();
    const onClick = vi.fn();
    const { view, host } = mount({ onStep });
    view.getByTestId('card').addEventListener('click', onClick);
    swipe(host, { dx: COMMIT + 40, settled: false });
    fireEvent.click(view.getByTestId('card'));
    expect(onClick).not.toHaveBeenCalled();
  });

  // The travel is read from the moves, not from the release. A `pointerup` that arrives at
  // the origin (no point left to report against — real, and what an e2e `touchEnd` produces)
  // would otherwise read as a large swipe in the OPPOSITE direction.
  it('trusts the last move for the distance, not the release event', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 200 + SWIPE_PAGER.SLOP_PX + 4, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 200 + COMMIT + 40, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 0, clientY: 0 });
    settle();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  // The axis decision, which has to happen at the BROWSER's slop rather than ours: a
  // horizontal move is `preventDefault`ed so the pan never starts, a vertical one is left
  // alone so it does.
  describe('the axis decision on the first real touchmove', () => {
    const touch = (host: HTMLElement, dx: number, dy: number) => {
      fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
      const ev = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', {
        value: [{ clientX: 200 + dx, clientY: 300 + dy }],
      });
      window.dispatchEvent(ev);
      // Lift, or this gesture's `window` listeners are still live for the next case — which
      // is exactly the leak the hook's own teardown now closes.
      fireEvent.pointerUp(window, { clientX: 200 + dx, clientY: 300 + dy });
      return ev.defaultPrevented;
    };

    it('takes a horizontal move away from the browser', () => {
      const { host } = mount({ onStep: vi.fn() });
      expect(touch(host, SWIPE_PAGER.DECIDE_PX + 2, 0)).toBe(true);
    });

    it('leaves a vertical move to it', () => {
      const { host } = mount({ onStep: vi.fn() });
      expect(touch(host, 0, SWIPE_PAGER.DECIDE_PX + 2)).toBe(false);
    });

    it('decides nothing while the finger has barely moved', () => {
      const { host } = mount({ onStep: vi.fn() });
      expect(touch(host, SWIPE_PAGER.DECIDE_PX - 2, 0)).toBe(false);
    });
  });

  it('drops the follow attributes once the settle is over', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    swipe(host, { dx: COMMIT + 40, settled: false });
    // `motionDurationMs` answers 0 with no `tokens.css` (every jsdom run), and the removal
    // is still scheduled rather than inline — so it takes a turn of the loop, not zero.
    expect(host.hasAttribute('data-swipe-settling')).toBe(true);
    settle();
    expect(host.hasAttribute('data-swipe-settling')).toBe(false);
    expect(host.hasAttribute('data-swiping')).toBe(false);
    expect(offset(host)).toBe('');
  });
});
