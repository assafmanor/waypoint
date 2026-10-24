// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  // ── A SWIPE THAT BEGINS AS A SCROLL IS A SCROLL; THE SHEET MOVES ONLY WHEN A SWIPE BEGINS WITH
  // THE LIST ALREADY AT ITS END (ADR-0122 §4's 2026-09-15 amendment, third reading) ──
  // The 2026-08-06 rule was "the body drags while it cannot scroll", which left a list that fills
  // the sheet with no body drag at all. The first build of this amendment grew the sheet before
  // it scrolled; the owner corrected it to scroll first and hand the same gesture to the sheet at
  // the list's end; and then, off that build: _"sometimes I just want to scroll and I don't want
  // it to change mode immediately. I want to first finish scrolling, then if I want to change
  // mode I'd swipe again."_
  //
  // So the one question is asked of the LIST, once, at the slop: can it still scroll the way the
  // finger is going? If yes, the gesture is the browser's pan for its whole life, and the hook
  // stands down. If no, the sheet moves from the first pixel. A list that fits is at both ends at
  // once, so it behaves exactly as it did.
  //
  // jsdom reports 0 for every scroll metric, so a list that FITS is its default; `outgrow()` says
  // the list is taller than the sheet (max scroll = MAX_SCROLL), and `scrollTop` is a plain settable
  // property here, so where the list stands is set directly. Real panning is
  // `e2e/snap-sheet-drag.spec.ts`'s.
  describe('a swipe that begins as a scroll is a scroll; the sheet moves only from the list’s end', () => {
    const body = () => document.querySelector('.wp-snapsheet-body') as HTMLElement;
    const MAX_SCROLL = CONTAINER;
    const outgrow = () => {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains('wp-snapsheet-body') ? CONTAINER + MAX_SCROLL : 0;
        },
      });
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        () => ({ overflowY: 'auto', overflowX: 'visible' }) as CSSStyleDeclaration,
      );
    };
    /** A mouse-shaped gesture: pointer events only. */
    const drag = (from: number, to: number) => {
      fireEvent.pointerDown(body(), { clientY: from, button: 0 });
      fireEvent.pointerMove(body(), { clientY: to });
      fireEvent.pointerUp(body(), { clientY: to });
    };
    /** The touch stream a finger also dispatches, as the browser would. Plain `Event`s with the
     *  lists defined on them, since jsdom has no `Touch`; wrapped in `act` because a claimed
     *  move writes to the sheet from inside the handler. */
    const touchMove = (y: number) => {
      const ev = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: [{ clientX: 200, clientY: y }] });
      act(() => {
        window.dispatchEvent(ev);
      });
      return ev.defaultPrevented;
    };
    const touchEnd = (y: number) => {
      const ev = new Event('touchend', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: [] });
      Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: 200, clientY: y }] });
      act(() => {
        window.dispatchEvent(ev);
      });
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
      // `outgrow` writes onto the prototype, which `restoreAllMocks` does not undo — without
      // this, every later case would see a scrollable list and the fitting-list cases would lie.
      afterEach(() => {
        delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
      });

      // **The correction.** A list with more below it keeps an upward finger: the sheet does not
      // move, nothing is captured, and the browser's pan is left alone.
      it('at half with more list below, a drag UP is the list’s: the sheet neither moves nor claims', () => {
        render(<Host />);
        drag(300, 60);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
        expect(sheet().style.height).toBe('');
        expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
      });

      it('at half with the list at its bottom, a drag UP grows the sheet to full', () => {
        render(<Host />);
        body().scrollTop = MAX_SCROLL;
        drag(300, 60);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
      });

      it('at half with the list at its top, a drag DOWN shrinks the sheet to map', () => {
        render(<Host />);
        drag(300, 560);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.map);
      });

      it('at full with the list at its top, a drag DOWN shrinks the sheet', () => {
        stubLayout(() => FULL);
        render(<Host initial={MAP_SHEET_VIEW.full} />);
        drag(300, 500);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
      });

      // A list scrolled below its top owns the downward gesture too: the finger is asking to
      // read what is above, and a sheet that closed instead would take the list away mid-read.
      it('a drag DOWN on a list scrolled below its top is the list’s, at any stop', () => {
        stubLayout(() => FULL);
        render(<Host initial={MAP_SHEET_VIEW.full} />);
        body().scrollTop = 120;
        drag(300, 500);
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
        expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
      });

      // A sideways finger is a strip's, or a text selection's — never the sheet's.
      it('a drag that is more sideways than vertical is not the sheet’s', () => {
        render(<Host />);
        body().scrollTop = MAX_SCROLL;
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        fireEvent.pointerMove(body(), { clientX: 260, clientY: 300 - 40 });
        fireEvent.pointerUp(body(), { clientX: 260, clientY: 300 - 40 });
        expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
        expect(sheet().style.height).toBe('');
      });

      // ── THE THIRD READING. A gesture that began as the list's stays the list's to its end and
      // past it: the hook stood down at the verdict, so nothing it does afterwards is seen. Each
      // case lifts BEFORE it asserts — the gesture's listeners live on `window`.
      describe('a swipe that began as a scroll stays a scroll', () => {
        it('reaching the list’s end under the finger moves no sheet; the next swipe does', () => {
          render(<Host />);
          fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
          // Past the slop with more list below: the list's. Not prevented, so the browser pans.
          const first = touchMove(290);
          // The browser cancels the pointer as its pan begins.
          fireEvent.pointerCancel(body(), { clientY: 290 });
          // The pan takes the list to its bottom while the finger keeps going, far past it…
          body().scrollTop = MAX_SCROLL;
          touchMove(240);
          touchMove(60);
          const heightDuring = sheet().style.height;
          touchEnd(60);
          expect(first).toBe(false);
          // …and the sheet did not move: this swipe was a scroll, start to finish.
          expect(heightDuring).toBe('');
          expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
          // A NEW swipe, with the list already at its bottom, is the sheet's from the first pixel.
          drag(300, 60);
          expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
        });

        it('runs the other way too: scrolling a list back to its top closes nothing', () => {
          stubLayout(() => FULL);
          render(<Host initial={MAP_SHEET_VIEW.full} />);
          body().scrollTop = 60;
          fireEvent.pointerDown(body(), { clientX: 200, clientY: 200, button: 0 });
          const first = touchMove(210);
          fireEvent.pointerCancel(body(), { clientY: 210 });
          body().scrollTop = 0;
          touchMove(260);
          touchMove(460);
          const heightDuring = sheet().style.height;
          touchEnd(460);
          expect(first).toBe(false);
          expect(heightDuring).toBe('');
          expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.full);
          // 200px, not more: jsdom's two moves are ~0ms apart, so this release reads as a
          // flick, and a flick commits to the FIRST stop below the release height.
          drag(200, 400);
          expect(sheet().dataset.view).toBe(MAP_SHEET_VIEW.half);
        });
      });

      // ── The touch half of the claim at the slop: the browser's pan is taken by `preventDefault`
      // on the `touchmove` only when the sheet's turn has come, and NOT before — a prevented
      // first `touchmove` forfeits the whole touch's scrolling, so a move still under the slop
      // must be left alone or the list would lose a scroll `claim` was about to hand it.
      it('claims the touch when the list is already at its end that way', () => {
        render(<Host />);
        body().scrollTop = MAX_SCROLL;
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        const prevented = touchMove(300 - SNAP_DRAG_SLOP_PX - 2);
        // The `pointermove` a finger also dispatches then carries the height, as ever.
        fireEvent.pointerMove(window, { clientX: 200, clientY: 300 - SNAP_DRAG_SLOP_PX - 2 });
        const live = sheet().className.includes('dragging');
        fireEvent.pointerUp(window, { clientX: 200, clientY: 300 - SNAP_DRAG_SLOP_PX - 2 });
        expect(prevented).toBe(true);
        expect(live).toBe(true);
      });

      it('leaves the touch to the browser while the list can still scroll that way', () => {
        render(<Host />);
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        const first = touchMove(300 - SNAP_DRAG_SLOP_PX - 2);
        const later = touchMove(200);
        touchEnd(200);
        expect(first).toBe(false);
        expect(later).toBe(false);
        expect(sheet().className).not.toContain('dragging');
      });

      it('decides nothing while the finger is under the slop', () => {
        render(<Host />);
        body().scrollTop = MAX_SCROLL;
        fireEvent.pointerDown(body(), { clientX: 200, clientY: 300, button: 0 });
        const under = touchMove(300 - (SNAP_DRAG_SLOP_PX - 1));
        // …and the claim is still open once it crosses.
        const over = touchMove(300 - (SNAP_DRAG_SLOP_PX + 2));
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
