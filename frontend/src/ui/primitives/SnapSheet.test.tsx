// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
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

  // ── THE BODY DRAGS WHEN THE LIST CANNOT USE THE GESTURE THAT WAY (ADR-0122 §4's 2026-09-15
  // amendment) ──
  // The 2026-08-06 rule was "the body drags while it cannot scroll" — the owner's report was an
  // empty state and a short list, and it left a list that fills the sheet with no body drag at
  // all, which the owner then reported: _"When scrollable, you can't drag the list to change the
  // mode."_ One rule now covers both: **up is the sheet's while the sheet can still grow; down is
  // the sheet's while the list is at its top**; everything else is the list's own scroll.
  //
  // The claim is taken at the slop, from the direction, and on touch it is a `preventDefault`
  // on the `touchmove` — so there is no `touch-action` and no `data-drag` on the body any more.
  //
  // jsdom reports 0 for every scroll metric, so a list that FITS is its default; `outgrow()`
  // is how a test says the list is taller than the sheet, and `scrollTop` is a plain settable
  // property here, so where the list stands is set directly.
  describe('the body drags when the list cannot use the gesture that way', () => {
    const body = () => document.querySelector('.wp-snapsheet-body') as HTMLElement;
    const outgrow = () => {
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
    const drag = (from: number, to: number) => {
      fireEvent.pointerDown(body(), { clientY: from, button: 0 });
      fireEvent.pointerMove(body(), { clientY: to });
      fireEvent.pointerUp(body(), { clientY: to });
    };

    describe('a list that fits — the 2026-08-06 case, unchanged', () => {
      it('drags DOWN to the map stop', () => {
        render(<Host />);
        fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
        fireEvent.pointerMove(body(), { clientY: 300 + SNAP_DRAG_SLOP_PX + 1 });
        expect(sheet().className).toContain('dragging');
        fireEvent.pointerMove(body(), { clientY: 560 });
        fireEvent.pointerUp(body(), { clientY: 560 });
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.map);
      });

      it('drags UP to the full list', () => {
        render(<Host />);
        drag(300, 60);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
      });

      it('carries no `touch-action` attribute — the claim is per gesture now', () => {
        render(<Host />);
        expect(body().hasAttribute('data-drag')).toBe(false);
      });
    });

    describe('a list that outgrows the sheet — the reported case', () => {
      beforeEach(outgrow);

      // From `half` a drag up OPENS the list rather than scrolling it: the list has the whole
      // rest of the screen to grow into, and nothing scrolls until the sheet is as tall as it
      // gets. Every native bottom sheet makes this choice.
      it('at half, a drag UP grows the sheet to full', () => {
        render(<Host />);
        drag(300, 60);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
      });

      it('at half, a drag DOWN from a list at its top shrinks the sheet to map', () => {
        render(<Host />);
        drag(300, 560);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.map);
      });

      // **The other half of the rule.** At the top stop the sheet cannot grow, so an upward
      // finger is the list's scroll and the hook stands down — nothing captured, no height set.
      it('at full, a drag UP is the list’s scroll: the sheet neither moves nor claims', () => {
        stubLayout(() => FULL);
        render(<Host initial={MAP_SHEET_VIEW.full} />);
        drag(300, 60);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
        expect(sheet().style.height).toBe('');
        expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
      });

      it('at full, a drag DOWN from a list at its top shrinks the sheet', () => {
        stubLayout(() => FULL);
        render(<Host initial={MAP_SHEET_VIEW.full} />);
        drag(300, 500);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
      });

      // A list that is scrolled down owns the downward gesture too: the finger is asking to
      // read what is above, and a sheet that closed instead would take the list away mid-read.
      it('a drag DOWN on a list scrolled below its top is the list’s, at any stop', () => {
        stubLayout(() => FULL);
        render(<Host initial={MAP_SHEET_VIEW.full} />);
        body().scrollTop = 120;
        drag(300, 500);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
        expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
      });

      it('…and a drag UP on that same scrolled list still grows the sheet while it can', () => {
        render(<Host />);
        body().scrollTop = 120;
        drag(300, 60);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
      });

      // **The continuation.** The travel the clamp refuses is handed to the list, so one gesture
      // from `half` both opens the list and starts reading it — and coming back down unwinds the
      // scroll before the sheet moves again.
      it('a drag UP past the top stop keeps following the finger as the list’s scroll', async () => {
        render(<Host />);
        fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
        // FULL - HALF px of travel puts the sheet exactly at the top stop…
        fireEvent.pointerMove(body(), { clientY: 300 - (FULL - HALF) });
        expect(sheet().style.height).toBe(`${FULL}px`);
        expect(body().scrollTop).toBe(0);
        // …and the next 90px, which the clamp refuses, become scroll.
        fireEvent.pointerMove(body(), { clientY: 300 - (FULL - HALF) - 90 });
        expect(sheet().style.height).toBe(`${FULL}px`);
        expect(body().scrollTop).toBe(90);
        // Back down: the scroll unwinds first, the sheet only then.
        fireEvent.pointerMove(body(), { clientY: 300 - (FULL - HALF) - 30 });
        expect(body().scrollTop).toBe(30);
        expect(sheet().style.height).toBe(`${FULL}px`);
        // Slowly, so the release reads a drag and not a downward flick: the last two moves are
        // the velocity, and 70px has to take well over 140ms to stay under the flick threshold.
        await new Promise((resolve) => setTimeout(resolve, 250));
        fireEvent.pointerMove(body(), { clientY: 300 - (FULL - HALF) + 40 });
        expect(body().scrollTop).toBe(0);
        expect(sheet().style.height).toBe(`${FULL - 40}px`);
        fireEvent.pointerUp(body(), { clientY: 300 - (FULL - HALF) + 40 });
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
      });

      it('the continuation scrolls from where the list already stood, never from zero', () => {
        render(<Host />);
        body().scrollTop = 50;
        fireEvent.pointerDown(body(), { clientY: 300, button: 0 });
        fireEvent.pointerMove(body(), { clientY: 300 - (FULL - HALF) - 90 });
        expect(body().scrollTop).toBe(140);
        fireEvent.pointerUp(body(), { clientY: 300 - (FULL - HALF) - 90 });
      });

      // A sideways finger is a strip's, or a text selection's — never the sheet's.
      it('a drag that is more sideways than vertical is not the sheet’s', () => {
        render(<Host />);
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        fireEvent.pointerMove(body(), { clientX: 260, clientY: 300 - 40 });
        fireEvent.pointerUp(body(), { clientX: 260, clientY: 300 - 40 });
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
        expect(sheet().style.height).toBe('');
      });

      // ── The touch half of the claim: the browser's pan is taken by `preventDefault` on the
      // `touchmove`, at the same moment the direction decides, and NOT before — a prevented
      // first `touchmove` forfeits the whole touch's scrolling, so a move still under the slop
      // must be left alone or the list would lose a scroll `claim` was about to hand it.
      const touchMove = (dy: number) => {
        const ev = new Event('touchmove', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'touches', { value: [{ clientX: 200, clientY: 300 + dy }] });
        window.dispatchEvent(ev);
        return ev.defaultPrevented;
      };

      // Each case lifts BEFORE it asserts: the gesture's listeners live on `window`, so a
      // failing assertion ahead of the release would leak them into the next case.
      it('claims the touch when the gesture is the sheet’s', () => {
        render(<Host />);
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        const prevented = touchMove(-(SNAP_DRAG_SLOP_PX + 2));
        // The `pointermove` a finger also dispatches then carries the height, as ever.
        fireEvent.pointerMove(window, { clientX: 200, clientY: 300 - SNAP_DRAG_SLOP_PX - 2 });
        const live = sheet().className.includes('dragging');
        fireEvent.pointerUp(window, { clientX: 200, clientY: 300 - SNAP_DRAG_SLOP_PX - 2 });
        expect(prevented).toBe(true);
        expect(live).toBe(true);
      });

      it('leaves the touch to the browser when the gesture is the list’s', () => {
        stubLayout(() => FULL);
        render(<Host initial={MAP_SHEET_VIEW.full} />);
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        const first = touchMove(-(SNAP_DRAG_SLOP_PX + 2));
        // Stood down for good: a later move in the other direction is not re-examined.
        const reversed = touchMove(80);
        fireEvent.pointerUp(window, { clientX: 200, clientY: 380 });
        expect(first).toBe(false);
        expect(reversed).toBe(false);
        expect(sheet().className).not.toContain('dragging');
      });

      it('decides nothing while the finger is under the slop', () => {
        render(<Host />);
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        const under = touchMove(-(SNAP_DRAG_SLOP_PX - 1));
        // …and the claim is still open once it crosses.
        const over = touchMove(-(SNAP_DRAG_SLOP_PX + 2));
        fireEvent.pointerUp(window, { clientX: 200, clientY: 300 - SNAP_DRAG_SLOP_PX - 2 });
        expect(under).toBe(false);
        expect(over).toBe(true);
      });
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

  // A press with no movement is a tap, not a drag — releasing must not snap the
  // sheet to whichever stop happens to be nearest.
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
