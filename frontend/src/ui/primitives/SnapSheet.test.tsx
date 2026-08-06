// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../test/pointer-events';
import { SnapSheet } from './SnapSheet';
import {
  MAP_CONTROLS_H,
  MAP_SHEET_ORDER,
  MAP_SHEET_STOPS,
  MAP_SHEET_VIEW,
  SNAP_DRAG_SLOP_PX,
  type MapSheetView,
} from '../../constants';

const CONTAINER = 600;
const HALF = 0.56 * CONTAINER;
const FULL = CONTAINER - MAP_CONTROLS_H;

/** jsdom lays nothing out, so the two measurements the drag needs are stubbed: the
 *  container's height (what a fraction resolves against) and the sheet's own
 *  (where the drag starts from). */
function stubLayout(sheetHeight: () => number) {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return CONTAINER;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const height = this.classList.contains('wp-snapsheet') ? sheetHeight() : 0;
    return {
      height,
      width: 390,
      top: 0,
      bottom: height,
      left: 0,
      right: 390,
      x: 0,
      y: 0,
    } as DOMRect;
  });
}

const headerTap = vi.fn();

function Host({ initial = MAP_SHEET_VIEW.half }: { initial?: MapSheetView }) {
  const [view, setView] = useState<MapSheetView>(initial);
  return (
    <div className="host">
      <SnapSheet
        stops={MAP_SHEET_STOPS}
        order={MAP_SHEET_ORDER}
        view={view}
        onViewChange={setView}
        grabLabel="גובה הרשימה"
        stopLabels={{ map: 'מפה', half: 'חצי', full: 'מלא' }}
        // A real control INSIDE the drag region — which is the whole reason the slop
        // threshold and the late pointer capture below are load-bearing (ADR-0122 §4).
        header={
          <button
            onClick={() => {
              headerTap();
              setView(MAP_SHEET_VIEW.full);
            }}
          >
            רשימה
          </button>
        }
      >
        <p>rows</p>
      </SnapSheet>
    </div>
  );
}

const sheet = () => document.querySelector('.wp-snapsheet') as HTMLElement;
/** The DRAG TARGET is the whole top region, not the grab line inside it. */
const region = () => document.querySelector('.wp-snapsheet-top') as HTMLElement;
const grab = () => screen.getByRole('separator');
/** Two moves fired back to back, the second CONTINUING the direction of the first — the
 *  release samples the last two, which is what a flick is.
 *
 *  **The second leg carries real distance, and that is load-bearing.** It used to be
 *  **1px**, on the reasoning that jsdom stamps the two events ~0ms apart and the hook
 *  floors `dt` at 1ms. The floor is a lower bound on `dt`; nothing bounds it from above,
 *  and `1px / dt >= SNAP_FLICK_PX_PER_MS` needs the two `fireEvent`s within **2ms** of
 *  each other — true on an idle machine, false on a loaded CI runner, where this snapped
 *  back to `half` and failed (reproduced locally: 1 run in 6 under load). Half the
 *  gesture gives `dt` a ~40ms budget instead, which is the same claim with 20x the
 *  margin: a real flick covers real distance per frame. The gesture's TOTAL travel is
 *  unchanged, so "nowhere near the stop by distance" still holds — and it now shares its
 *  waypoints with `slowMoveTo`'s test below, so the only difference between the two is
 *  the timing, which is the thing being tested. */
const flickTo = (from: number, to: number) => {
  fireEvent.pointerMove(region(), { clientY: Math.round((from + to) / 2) });
  fireEvent.pointerMove(region(), { clientY: to });
};
/** A move with real time in front of it. The velocity can only come out LOWER on a
 *  slower machine, so "below the threshold" is stable rather than timing-dependent. */
const slowMoveTo = async (y: number) => {
  await new Promise((resolve) => setTimeout(resolve, 80));
  fireEvent.pointerMove(region(), { clientY: y });
};

describe('SnapSheet (ADR-0121 §5, the region drag ADR-0122 §4)', () => {
  beforeEach(() => {
    stubLayout(() => HALF);
    // jsdom implements no pointer capture at all, and WHEN it is taken is the decision.
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    headerTap.mockClear();
  });

  it('states its resting height declaratively, so the browser animates the snap', () => {
    render(<Host />);
    expect(sheet().style.getPropertyValue('--snap-h')).toBe('56%');
    expect(sheet().dataset.view).toBe('half');
    // No imperative height at rest — that is what lets a release animate.
    expect(sheet().style.height).toBe('');
  });

  it('follows the caller’s view, so a shortcut control and the drag share one state', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'רשימה' }));
    expect(sheet().dataset.view).toBe('full');
    // The full stop is the container MINUS the row above it, stated as a `calc` so the
    // screen never measures its own layout (ADR-0122 §3).
    expect(sheet().style.getPropertyValue('--snap-h')).toBe('calc(100% - 46px)');
  });

  it('opens at the map stop — the sheet’s own top row and nothing of the list', () => {
    render(<Host initial={MAP_SHEET_VIEW.map} />);
    expect(sheet().style.getPropertyValue('--snap-h')).toBe('52px');
  });

  // Dragging UP grows the sheet: it is anchored at the bottom, so the height is the
  // distance from the finger to that edge.
  it('a drag up releases to the next stop, and takes an imperative height on the way', () => {
    render(<Host />);
    fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(region(), { clientY: 100 });
    // Mid-gesture the height is the finger's, not a stop's — and easing is off.
    expect(sheet().style.height).toBe(`${HALF + 200}px`);
    expect(sheet().className).toContain('dragging');

    fireEvent.pointerUp(region(), { clientY: 100 });
    expect(sheet().dataset.view).toBe('full');
    expect(sheet().style.height).toBe('');
    expect(sheet().className).not.toContain('dragging');
  });

  it('a drag down releases to the map stop', () => {
    render(<Host />);
    fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(region(), { clientY: 560 });
    fireEvent.pointerUp(region(), { clientY: 560 });
    expect(sheet().dataset.view).toBe('map');
  });

  it('clamps: a drag past the top cannot exceed the full stop, past the bottom cannot go under the map stop', () => {
    render(<Host />);
    fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(region(), { clientY: -5000 });
    // Not the container: the sheet must not cover the controls row floating above it.
    expect(sheet().style.height).toBe(`${FULL}px`);
    fireEvent.pointerMove(region(), { clientY: 5000 });
    expect(sheet().style.height).toBe('52px');
    fireEvent.pointerUp(region(), { clientY: 5000 });
  });

  // A press with no movement is a tap, not a drag — releasing must not snap the
  // sheet to whichever stop happens to be nearest.
  // ── THE EMPTY AREA IS A SECOND DRAG TARGET (ADR-0122 §4's 2026-08-06 amendment) ──
  // Owner: _"sometimes there's a lot of free space that I feel like it would be easier and more
  // intuitive to scroll from, for example when the list is empty or there's a large area that's
  // empty"_. The 51px handle row was the only way in, and a sheet whose body is mostly blank is
  // exactly where a bigger target costs nothing.
  //
  // What jsdom CAN answer here is the wiring — that the slack exists, that it drives the same one
  // gesture, and that it is not an accessible control. **Whether it has any HEIGHT is flexbox, so
  // it is not answerable here at all**: `flex: 1 0 0` versus a long list's zero is a layout fact,
  // and jsdom lays nothing out. That half is the CSS's own claim (`snap-sheet.css`) and a human
  // pass, and saying so is the point (ADR-0121 §13).
  describe('the empty area below the list drags too', () => {
    const slackEl = () => document.querySelector('.wp-snapsheet-slack') as HTMLElement;

    it('exists inside the scroller, and is not a control a screen reader has to walk', () => {
      render(<Host />);
      expect(slackEl()).toBeTruthy();
      // Inside the BODY, which is what makes `flex: 1` mean "the space the list did not take".
      expect(slackEl().parentElement?.className).toContain('wp-snapsheet-body');
      // The splitter above is the accessible control, and its keyboard already reaches every
      // stop — a second announced handle would be one more thing to walk past for no verb.
      expect(slackEl().getAttribute('aria-hidden')).toBe('true');
      expect(document.querySelectorAll('[role="separator"]')).toHaveLength(1);
    });

    it('drags DOWN to the next stop down, which is the gesture the report asked for', () => {
      render(<Host />);
      fireEvent.pointerDown(slackEl(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(slackEl(), { clientY: 300 + SNAP_DRAG_SLOP_PX + 1 });
      expect(sheet().className).toContain('dragging');
      fireEvent.pointerMove(slackEl(), { clientY: 560 });
      fireEvent.pointerUp(slackEl(), { clientY: 560 });
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.map);
    });

    it('drags UP to the full list from the same place', () => {
      render(<Host />);
      fireEvent.pointerDown(slackEl(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(slackEl(), { clientY: 60 });
      fireEvent.pointerUp(slackEl(), { clientY: 60 });
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
    });

    // ONE gesture with two targets, not two gestures: the slop threshold, the late capture and
    // the clamp are `useSnapDrag`'s and are not re-implemented per target.
    it('takes the same slop threshold, so a tap on it is not a drag', () => {
      render(<Host />);
      fireEvent.pointerDown(slackEl(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(slackEl(), { clientY: 300 + SNAP_DRAG_SLOP_PX - 1 });
      expect(sheet().className).not.toContain('dragging');
      fireEvent.pointerUp(slackEl(), { clientY: 300 + SNAP_DRAG_SLOP_PX - 1 });
      // Unmoved: a press that never passed the slop must not snap the sheet to whatever stop
      // happens to be nearest where it is sitting.
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
    });

    it('captures the pointer on ITSELF, so a drag that leaves it is not lost to the canvas', () => {
      render(<Host />);
      fireEvent.pointerDown(slackEl(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(slackEl(), { clientY: 100 });
      expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalled();
    });
  });

  it('a press with no movement changes nothing', () => {
    render(<Host />);
    fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
    fireEvent.pointerUp(region(), { clientY: 300 });
    expect(sheet().dataset.view).toBe('half');
    expect(sheet().style.height).toBe('');
  });

  it('ignores a non-primary button, so a right-click never restarts the gesture', () => {
    render(<Host />);
    fireEvent.pointerDown(region(), { clientY: 300, button: 2 });
    fireEvent.pointerMove(region(), { clientY: 100 });
    expect(sheet().style.height).toBe('');
  });

  it('a cancelled gesture (pointercancel) still snaps rather than freezing mid-drag', () => {
    render(<Host />);
    fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(region(), { clientY: 100 });
    fireEvent.pointerCancel(region(), { clientY: 100 });
    expect(sheet().dataset.view).toBe('full');
    expect(sheet().style.height).toBe('');
  });

  // ── The three mechanisms a REGION target needs (ADR-0122 §4) ──────────────────
  describe('the target is a region, so the taps inside it must survive', () => {
    it('below the slop it is a tap: nothing drags, and the control inside the region is tapped', () => {
      render(<Host />);
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      // A finger emits moves on a tap. This is what used to flip `moved` on the first one.
      fireEvent.pointerMove(region(), { clientY: 300 + SNAP_DRAG_SLOP_PX - 1 });
      expect(sheet().style.height).toBe('');
      expect(sheet().className).not.toContain('dragging');

      fireEvent.pointerUp(region(), { clientY: 300 + SNAP_DRAG_SLOP_PX - 1 });
      // No snap, and the click that follows reaches the control it was aimed at.
      expect(sheet().dataset.view).toBe('half');
      fireEvent.click(screen.getByRole('button', { name: 'רשימה' }));
      expect(headerTap).toHaveBeenCalledTimes(1);
    });

    it('above the slop it is a drag, and the click that follows is swallowed', () => {
      render(<Host />);
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(region(), { clientY: 300 - SNAP_DRAG_SLOP_PX - 1 });
      expect(sheet().className).toContain('dragging');
      fireEvent.pointerUp(region(), { clientY: 200 });
      // The drag ends in a click retargeted to the capturing element. It must not read as
      // a tap on the toggle that happens to live in the same region.
      fireEvent.click(screen.getByRole('button', { name: 'רשימה' }));
      expect(headerTap).not.toHaveBeenCalled();
    });

    it('a swallowed click is swallowed ONCE — the next genuine tap works', () => {
      render(<Host />);
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(region(), { clientY: 200 });
      fireEvent.pointerUp(region(), { clientY: 200 });
      fireEvent.click(screen.getByRole('button', { name: 'רשימה' }));
      fireEvent.click(screen.getByRole('button', { name: 'רשימה' }));
      expect(headerTap).toHaveBeenCalledTimes(1);
    });

    // With capture active the following `click` is retargeted to the capturing element,
    // so capturing on `pointerdown` kills every tap inside the region.
    it('takes pointer capture at DRAG START, never at pointerdown', () => {
      render(<Host />);
      const capture = HTMLElement.prototype.setPointerCapture as unknown as ReturnType<
        typeof vi.fn
      >;
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      expect(capture).not.toHaveBeenCalled();
      fireEvent.pointerMove(region(), { clientY: 300 - SNAP_DRAG_SLOP_PX + 1 });
      expect(capture).not.toHaveBeenCalled();

      fireEvent.pointerMove(region(), { clientY: 200 });
      expect(capture).toHaveBeenCalledTimes(1);
      // Once, not per move.
      fireEvent.pointerMove(region(), { clientY: 150 });
      expect(capture).toHaveBeenCalledTimes(1);
      fireEvent.pointerUp(region(), { clientY: 150 });
    });

    // The region is ~51px tall and the gesture travels hundreds of px: two frames in, the
    // pointer is outside it, and a region-bound listener stops hearing anything.
    it('hears moves that leave the region entirely', () => {
      render(<Host />);
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(window, { clientY: 100 });
      expect(sheet().style.height).toBe(`${HALF + 200}px`);
      fireEvent.pointerUp(window, { clientY: 100 });
      expect(sheet().dataset.view).toBe('full');
    });
  });

  // `nearestStop` measures distance only, so a real flick that travels little used to
  // snap back to where it started (ADR-0122 §4).
  describe('a flick commits, a slow drag does not', () => {
    it('a short fast flick down from half lands on the map stop', () => {
      render(<Host />);
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      flickTo(300, 340);
      fireEvent.pointerUp(region(), { clientY: 340 });
      // 40px down from half is nowhere near the map stop by distance — the velocity is
      // what commits it.
      expect(sheet().dataset.view).toBe('map');
    });

    it('the same drag done slowly stays at half', async () => {
      render(<Host />);
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      await slowMoveTo(320);
      await slowMoveTo(340);
      fireEvent.pointerUp(region(), { clientY: 340 });
      expect(sheet().dataset.view).toBe('half');
    });

    it('a short fast flick up from half lands on full', () => {
      render(<Host />);
      fireEvent.pointerDown(region(), { clientY: 300, button: 0 });
      flickTo(300, 260);
      fireEvent.pointerUp(region(), { clientY: 260 });
      expect(sheet().dataset.view).toBe('full');
    });
  });

  // ── The splitter (ADR-0122 §4) ────────────────────────────────────────────────
  describe('the handle is a real ARIA splitter, not a button that does nothing', () => {
    it('reports where it is on the axis, in words', () => {
      render(<Host />);
      expect(grab().getAttribute('aria-label')).toBe('גובה הרשימה');
      expect(grab().getAttribute('aria-orientation')).toBe('horizontal');
      expect(grab().getAttribute('aria-valuemin')).toBe('0');
      expect(grab().getAttribute('aria-valuemax')).toBe('2');
      expect(grab().getAttribute('aria-valuenow')).toBe('1');
      // "1 of 3" says nothing about what the sheet is showing; the stop's name does.
      expect(grab().getAttribute('aria-valuetext')).toBe('חצי');
    });

    it('arrows move one stop, and Home/End go to the extremes', () => {
      render(<Host />);
      fireEvent.keyDown(grab(), { key: 'ArrowUp' });
      expect(sheet().dataset.view).toBe('full');
      expect(grab().getAttribute('aria-valuenow')).toBe('2');
      expect(grab().getAttribute('aria-valuetext')).toBe('מלא');

      // Which is the whole point: `half` was unreachable without a pointer.
      fireEvent.keyDown(grab(), { key: 'ArrowDown' });
      expect(sheet().dataset.view).toBe('half');

      fireEvent.keyDown(grab(), { key: 'Home' });
      expect(sheet().dataset.view).toBe('map');
      fireEvent.keyDown(grab(), { key: 'End' });
      expect(sheet().dataset.view).toBe('full');
    });

    it('the extremes do not wrap around', () => {
      render(<Host initial={MAP_SHEET_VIEW.map} />);
      fireEvent.keyDown(grab(), { key: 'ArrowDown' });
      expect(sheet().dataset.view).toBe('map');
    });

    it('leaves other keys alone', () => {
      render(<Host />);
      fireEvent.keyDown(grab(), { key: 'a' });
      expect(sheet().dataset.view).toBe('half');
    });
  });

  // It is a pane, not an overlay: it registers nothing with the back stack, so it
  // needs no NavProvider to render at all (ADR-0103).
  it('renders with no overlay plumbing whatsoever', () => {
    render(<Host />);
    expect(screen.getByText('rows')).toBeTruthy();
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });
});
