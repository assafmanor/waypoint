// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function Host({
  initial = MAP_SHEET_VIEW.half,
  children = <p>rows</p>,
}: {
  initial?: MapSheetView;
  children?: ReactNode;
}) {
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
        {children}
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
  // ── THE BODY DRAGS WHILE IT CANNOT SCROLL (ADR-0122 §4's 2026-08-06 amendment) ──
  // Owner: _"when the list doesn't scroll (or there's text that's not list items, for example the
  // empty state has a glyph+text that doesn't allow us to scroll), we should be able to use the
  // same gesture"_. This supersedes a `flex: 1` spacer that claimed only the space AFTER the
  // content — the same idea reaching a subset of the same cases, and it under-delivered on exactly
  // the one named first, since an empty state is a tall block that leaves no gap below itself.
  //
  // **The one fact is "can it scroll", and it is why this is easy rather than hard.** Dragging from
  // a scroller needs `touch-action: none`, which is what makes a list unscrollable, and a native
  // pan cannot be taken over once it has started — so the choice cannot be deferred to the first
  // move either. None of that arises when the content fits: no pan can start, so nothing competes.
  //
  // jsdom reports 0 for every scroll metric, so "cannot scroll" is its default — which is what
  // makes the GATE testable here, the stubs being the scenario. `touch-action` itself and real
  // overflow stay `e2e/snap-sheet-drag.spec.ts`'s.
  describe('the body drags while it cannot scroll', () => {
    const body = () => document.querySelector('.wp-snapsheet-body') as HTMLElement;
    /** How a test says the list outgrew the sheet. */
    const makeScrollable = () => {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains('wp-snapsheet-body') ? CONTAINER * 2 : 0;
        },
      });
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        () => ({ overflowY: 'auto', overflowX: 'visible' }) as CSSStyleDeclaration,
      );
    };

    it('marks itself a drag target, which is what carries `touch-action`', async () => {
      render(<Host />);
      // The attribute has to exist BEFORE a gesture starts — the browser reads `touch-action`
      // when it decides whether to pan, not when we decide to claim.
      await waitFor(() => expect(body().hasAttribute('data-drag')).toBe(true));
    });

    it('drags DOWN to the next stop down, which is the gesture the report asked for', () => {
      render(<Host />);
      fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(body(), { clientY: 300 + SNAP_DRAG_SLOP_PX + 1 });
      expect(sheet().className).toContain('dragging');
      fireEvent.pointerMove(body(), { clientY: 560 });
      fireEvent.pointerUp(body(), { clientY: 560 });
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.map);
    });

    it('drags UP to the full list from the same place', () => {
      render(<Host />);
      fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(body(), { clientY: 60 });
      fireEvent.pointerUp(body(), { clientY: 60 });
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
    });

    // **The gate.** A list taller than the sheet owns its own vertical gesture, and this is the
    // one state the rule must never be wrong about.
    it('refuses the press once the list outgrows the sheet', async () => {
      makeScrollable();
      render(<Host />);
      await waitFor(() => expect(body().hasAttribute('data-drag')).toBe(false));
      fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(body(), { clientY: 60 });
      fireEvent.pointerUp(body(), { clientY: 60 });
      // Unmoved: the scroll kept the gesture.
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
    });

    // A press on a field is a caret or a text selection, and a sheet that moves under that is
    // worse than no gesture — the Map's sheet holds a note composer on every selected row.
    it('leaves a press on an editable field alone', () => {
      render(
        <Host>
          <textarea data-testid="composer" />
        </Host>,
      );
      const field = screen.getByTestId('composer');
      fireEvent.pointerDown(field, { clientY: 300, button: 0 });
      fireEvent.pointerMove(field, { clientY: 60 });
      fireEvent.pointerUp(field, { clientY: 60 });
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
    });

    // ONE gesture with two targets, not two gestures: the slop, the late capture and the clamp
    // are `useSnapDrag`'s and are not re-implemented per target.
    it('takes the same slop threshold, so a tap on the list is not a drag', () => {
      render(<Host />);
      fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(body(), { clientY: 300 + SNAP_DRAG_SLOP_PX - 1 });
      expect(sheet().className).not.toContain('dragging');
      fireEvent.pointerUp(body(), { clientY: 300 + SNAP_DRAG_SLOP_PX - 1 });
      expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
    });

    it('captures the pointer, so a drag that leaves the body is not lost to the canvas', () => {
      render(<Host />);
      fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
      fireEvent.pointerMove(body(), { clientY: 100 });
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
