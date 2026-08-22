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
import { useSwipePager, type SwipePager, type SwipeStep } from './useSwipePager';
import { fakeScroller } from '../test/scroller-harness';
// jsdom has neither `PointerEvent` nor pointer capture, and this gesture is nothing but
// coordinates and a capture call.
import '../test/pointer-events';

const WIDTH = 360;
const COMMIT = WIDTH * SWIPE_PAGER.COMMIT_SHARE;
/** What the first move spends getting the gesture recognised on the MOUSE path — `swipe`'s
 *  first step, and therefore the follow's origin (§9). The page's travel is measured from
 *  there, so a case about the commit DISTANCE has to send the finger this much further than
 *  the distance it is testing. On touch the same cost is `DECIDE_PX`, i.e. 6px. */
const CLAIM = SWIPE_PAGER.SLOP_PX + 4;

function Host({
  onStep,
  canStep = () => true,
  enabled = true,
  rtl = true,
  strip = false,
  pageKey = 'a',
  api,
}: {
  onStep: (step: SwipeStep) => void;
  canStep?: (step: SwipeStep) => boolean;
  enabled?: boolean;
  rtl?: boolean;
  strip?: boolean;
  /** Which page is drawn. Held by the test rather than advanced by `onStep`, because when it
   *  changes is the whole subject of the settle cases below (§8). */
  pageKey?: string;
  /** Hands the COMMANDED half out to the test (ADR-0116 §2d) — the edge dwell's channel,
   *  which has no pointer events to fake. */
  api?: (pager: {
    hold: SwipePager<HTMLDivElement>['hold'];
    turn: SwipePager<HTMLDivElement>['turn'];
  }) => void;
}) {
  const { ref, hold, turn } = useSwipePager<HTMLDivElement>({ canStep, onStep, enabled, pageKey });
  api?.({ hold, turn });
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
  let pager: {
    hold: SwipePager<HTMLDivElement>['hold'];
    turn: SwipePager<HTMLDivElement>['turn'];
  } | null = null;
  const withApi = { ...props, api: (p: typeof pager) => (pager = p) };
  const view = render(<Host {...withApi} />);
  const host = view.getByTestId('host');
  /** The page the host draws changes — what `onStep` causes in the app, where the day comes
   *  back through the router. This is the moment a committed turn is allowed to give the
   *  offset back (§8). */
  let drawn = 0;
  const drawNextPage = () =>
    act(() => {
      view.rerender(<Host {...withApi} pageKey={`page-${++drawn}`} />);
    });
  /** Change a prop mid-gesture — `enabled` going false under a bound listener is a real
   *  sequence, not a contrivance: the hold-drag fires on a timer after the press. */
  const update = (next: Partial<Parameters<typeof Host>[0]>) =>
    act(() => {
      view.rerender(<Host {...withApi} {...next} />);
    });
  // jsdom lays nothing out, and the commit threshold is a SHARE of the surface's width —
  // with a zero rect the hook falls back to `window.innerWidth` and the numbers below
  // would mean something else.
  host.getBoundingClientRect = () => ({ width: WIDTH, height: 640 }) as DOMRect;
  if (props.strip) {
    const stripEl = view.getByTestId('strip');
    fakeScroller(stripEl, [view.getByTestId('chip')], { axis: 'inline', viewport: 40 });
  }
  /** The commanded channel — `hold` and `turn`, wrapped in `act` because both write state. */
  const command = {
    hold: (step: SwipeStep | null, px?: number) => act(() => pager!.hold(step, px)),
    turn: (step: SwipeStep) => act(() => pager!.turn(step)),
  };
  return { view, host, drawNextPage, update, command };
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

/**
 * One gesture, start to finish — including the page turn unless `settle: false`, which is for
 * the cases that inspect the surface mid-settle.
 *
 * **`pace` is not decoration: it is the gesture's speed, and speed now decides things** (§9).
 * jsdom's `event.timeStamp` is driven by the fake clock, so the ms advanced between the last
 * two moves IS the velocity the recogniser reads — and with no advance at all `dt` floors at
 * 1ms and every swipe in this file would read as a flick, quietly turning the distance cases
 * below into velocity cases that pass for the wrong reason. The default is a deliberate drag;
 * `flick: true` is a thrown one.
 */
function swipe(
  from: HTMLElement,
  {
    dx,
    dy = 0,
    cancel = false,
    settled = true,
    flick = false,
    pace = flick ? 16 : 400,
  }: {
    dx: number;
    dy?: number;
    cancel?: boolean;
    settled?: boolean;
    flick?: boolean;
    pace?: number;
  },
) {
  fireEvent.pointerDown(from, { clientX: 200, clientY: 300, button: 0 });
  // Two moves: the first crosses the slop and claims (or does not), the second is where
  // the finger actually ends up.
  const step = Math.sign(dx || 1) * Math.min(Math.abs(dx), SWIPE_PAGER.SLOP_PX + 4);
  fireEvent.pointerMove(window, { clientX: 200 + step, clientY: 300 + Math.sign(dy) * 2 });
  act(() => {
    vi.advanceTimersByTime(pace);
  });
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
    swipe(host, { dx: CLAIM + COMMIT + 10, settled: false });
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
    swipe(host, { dx: -(CLAIM + COMMIT + 10) });
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it('mirrors under [dir=ltr] — the same finger reaches the previous page', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep, rtl: false });
    swipe(host, { dx: CLAIM + COMMIT + 10 });
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

  // **Leaves level at ZERO and then tracks the finger exactly** (§9). Asserted as a
  // difference rather than an absolute, which is the actual claim: whatever the gesture spent
  // being recognised is not the page's to travel, and every px after that is. The absolute
  // version of this assertion was what a 24px lurch passed.
  it('follows the finger one-for-one from where it was claimed', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM, clientY: 300 });
    // The claiming move itself moves nothing: no jump onto the surface.
    expect(offset(host)).toBe('0px');
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM + 60, clientY: 300 });
    expect(offset(host)).toBe('60px');
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM + 100, clientY: 300 });
    expect(offset(host)).toBe('100px');
    fireEvent.pointerUp(window, { clientX: 200 + CLAIM + 100, clientY: 300 });
  });

  it('follows the finger one-for-one when there IS a page that way', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM + 120, clientY: 300 });
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

  // The hold-drag owns the pointer once it has it, and it takes it on a TIMER — so `enabled`
  // goes false with this hook's listeners already bound. Read only at the press, the standing
  // down promised by the docblock did not happen, and the day surface would translate under a
  // dragged card's ghost.
  it('stands down when something else takes the pointer mid-gesture', () => {
    const onStep = vi.fn();
    const { host, update } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    update({ enabled: false });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM + 200, clientY: 300 });
    expect(host.hasAttribute('data-swiping')).toBe(false);
    expect(offset(host)).toBe('');
    fireEvent.pointerUp(window, { clientX: 200 + CLAIM + 200, clientY: 300 });
    settle();
    expect(onStep).not.toHaveBeenCalled();
  });

  // ── THE FLICK (§9) ────────────────────────────────────────────────────────────────────
  //
  // Owner: _"quick swipes don't always register."_ They didn't: distance was the only thing
  // that committed, so a flick that travelled less than a fifth of the page was refused however
  // fast it was thrown. `SNAP_FLICK_PX_PER_MS` is the app's existing answer to exactly this
  // report from the sheet, and these cases pin the three questions that come with reusing it.
  //
  // Velocity here is `(last two moves) / ms`, and the ms is the fake clock — `pace` in `swipe`.
  it('commits a flick that never travels the commit distance', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    // Half of what a deliberate drag would need, thrown: 60px in 16ms is 3.75px/ms.
    swipe(host, { dx: CLAIM + COMMIT / 2, flick: true });
    expect(onStep).toHaveBeenCalledWith(1);
    expect(COMMIT / 2).toBeLessThan(COMMIT);
  });

  it('refuses the same distance dragged slowly', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    // The identical travel at 0.15px/ms — under the threshold, so distance alone decides.
    swipe(host, { dx: CLAIM + COMMIT / 2, pace: 400 });
    expect(onStep).not.toHaveBeenCalled();
    expect(host.hasAttribute('data-swiping')).toBe(false);
  });

  // A flick BACK from a half-open page means "no", not "the other way". Position decides
  // between the page you are on and the one you are already moving toward; the flick only
  // picks between those two, so against the drag it commits nothing.
  it('refuses a flick thrown back against the drag', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM + 90, clientY: 300 });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    // Still 30px out — the next page is half revealed — but the finger left going back.
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM + 30, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 200 + CLAIM + 30, clientY: 300 });
    settle();
    expect(onStep).not.toHaveBeenCalled();
  });

  // The floor under the flick: a thumb rolling a few px off a tap is fast, and it is not a
  // swipe. `SLOP_PX` answers this question for the mouse's claim too — one number, one meaning.
  it('refuses a fast twitch shorter than the slop', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep });
    fireEvent.pointerDown(host, { clientX: 200, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM, clientY: 300 });
    act(() => {
      vi.advanceTimersByTime(4);
    });
    const twitch = SWIPE_PAGER.SLOP_PX - 6;
    fireEvent.pointerMove(window, { clientX: 200 + CLAIM + twitch, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 200 + CLAIM + twitch, clientY: 300 });
    settle();
    expect(onStep).not.toHaveBeenCalled();
  });

  // **The offset is owed to the page that arrives, not to the end of the animation** (§8).
  // Dropping it drops the transform with it, so dropping it early puts the day you LEFT back
  // at level for as long as the render takes — which is the stutter the owner reported, and
  // `e2e/day-swipe.spec.ts` is where the no-frame-between claim is asserted against a real
  // engine. Here it is the contract: held after the settle, released by the page.
  it('holds the follow attributes after the settle, until the page it turned to is drawn', () => {
    const onStep = vi.fn();
    const { host, drawNextPage } = mount({ onStep });
    swipe(host, { dx: COMMIT + 40, settled: false });
    // `motionDurationMs` answers 0 with no `tokens.css` (every jsdom run), and the commit
    // is still scheduled rather than inline — so it takes a turn of the loop, not zero.
    expect(host.hasAttribute('data-swipe-settling')).toBe(true);
    settle();
    expect(onStep).toHaveBeenCalledWith(1);
    expect(host.getAttribute('data-swipe-settling')).toBe('turn');
    expect(host.hasAttribute('data-swiping')).toBe(true);
    expect(offset(host)).not.toBe('');

    drawNextPage();
    expect(host.hasAttribute('data-swipe-settling')).toBe(false);
    expect(host.hasAttribute('data-swiping')).toBe(false);
    expect(offset(host)).toBe('');
  });

  // A refusal has nothing to wait for: no page is arriving, so there is no second state for a
  // frame to be caught between, and holding the strain until some unrelated render happened
  // would leave the surface visibly bent.
  it('drops them at the settle when the swipe was refused', () => {
    const onStep = vi.fn();
    const { host } = mount({ onStep, canStep: () => false });
    swipe(host, { dx: COMMIT + 40 });
    expect(onStep).not.toHaveBeenCalled();
    expect(host.hasAttribute('data-swipe-settling')).toBe(false);
    expect(host.hasAttribute('data-swiping')).toBe(false);
    expect(offset(host)).toBe('');
  });

  // ── THE COMMANDED TURN (ADR-0116 §2d, and its repair) ──────────────────────────────────
  //
  // The edge dwell drives `hold`/`turn` instead of a finger, and it drives them from a
  // STREAM: `hold(step)` is re-issued on every pointer move the drag sees and on every frame
  // the auto-scroll scrolls. The three cases below are that fact, and the first is the defect
  // the owner reported as _"doesn't always move to the next day"_ — one pixel of jitter inside
  // the turn's `--t-base` used to clear its timer and re-park the page at the detent, so the
  // day never changed and the page visibly snapped back out of a turn it had begun.
  describe('a page turn that was commanded rather than dragged', () => {
    it('lifts to the detent, then commits when the turn is asked for', () => {
      const onStep = vi.fn();
      const { host, command, drawNextPage } = mount({ onStep });
      command.hold(1, 48);
      expect(host.hasAttribute('data-edge-lift')).toBe(true);
      expect(offset(host)).toBe('48px');

      command.turn(1);
      expect(host.hasAttribute('data-edge-lift')).toBe(false);
      expect(host.getAttribute('data-swipe-settling')).toBe('turn');
      settle();
      expect(onStep).toHaveBeenCalledWith(1);
      drawNextPage();
      expect(offset(host)).toBe('');
    });

    it('ignores a lift re-issued while the turn is in flight', () => {
      const onStep = vi.fn();
      const { host, command } = mount({ onStep });
      command.hold(1, 48);
      command.turn(1);
      const travelling = offset(host);
      // The jitter. Same step, same distance, the value the caller has been repeating.
      command.hold(1, 48);
      expect(offset(host)).toBe(travelling);
      expect(host.getAttribute('data-swipe-settling')).toBe('turn');
      settle();
      expect(onStep).toHaveBeenCalledWith(1);
    });

    // The asymmetry, and it is the reason the guard above is not simply "ignore every hold":
    // letting go is the gesture withdrawing, and a day arriving after the card has been
    // dropped would move the surface out from under the drop.
    it('but lets go of one, and takes the day back with it', () => {
      const onStep = vi.fn();
      const { host, command } = mount({ onStep });
      command.hold(1, 48);
      command.turn(1);
      command.hold(null);
      expect(offset(host)).toBe('0px');
      expect(host.hasAttribute('data-swipe-settling')).toBe(false);
      settle();
      expect(onStep).not.toHaveBeenCalled();
    });

    // Idempotence for its own sake: the same command twice must not restart the detent, or the
    // page re-animates from where it already is on every frame the caller repeats itself.
    it('holds the detent still while the same lift is repeated', () => {
      const onStep = vi.fn();
      const { host, command } = mount({ onStep });
      command.hold(1, 48);
      command.hold(1, 48);
      command.hold(1, 48);
      expect(offset(host)).toBe('48px');
      expect(host.hasAttribute('data-edge-lift')).toBe(true);
      // And a change of mind about the direction is not idempotent — it is a new detent.
      command.hold(-1, 48);
      expect(offset(host)).toBe('-48px');
    });

    it('lifts again after the day it turned to has been drawn', () => {
      const onStep = vi.fn();
      const { host, command, drawNextPage } = mount({ onStep });
      command.hold(1, 48);
      command.turn(1);
      settle();
      drawNextPage();
      expect(offset(host)).toBe('');
      // The next cycle: the finger never left the band, so the edge re-commands the lift and
      // the surface must take it — the DOM having been cleared is what makes this not a repeat.
      command.hold(1, 48);
      expect(offset(host)).toBe('48px');
      expect(host.hasAttribute('data-edge-lift')).toBe(true);
    });
  });

  // A gesture that begins inside the previous one's wait owns the surface, and the reset it
  // was owed must not fire mid-drag and flatten it.
  it('a second swipe inside the wait keeps its own follow', () => {
    const onStep = vi.fn();
    const { host, drawNextPage } = mount({ onStep });
    swipe(host, { dx: COMMIT + 40 });
    swipe(host, { dx: COMMIT + 40, settled: false });
    drawNextPage();
    expect(host.hasAttribute('data-swiping')).toBe(true);
    expect(offset(host)).not.toBe('');
  });
});
