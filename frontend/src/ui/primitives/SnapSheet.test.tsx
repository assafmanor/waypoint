// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../test/pointer-events';
import { SnapSheet } from './SnapSheet';
import {
  MAP_SHEET_ORDER,
  MAP_SHEET_STOPS,
  MAP_SHEET_VIEW,
  type MapSheetView,
} from '../../constants';

const CONTAINER = 600;
const HALF = 0.56 * CONTAINER;

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

function Host({ initial = MAP_SHEET_VIEW.half }: { initial?: MapSheetView }) {
  const [view, setView] = useState<MapSheetView>(initial);
  return (
    <div className="host">
      <SnapSheet
        stops={MAP_SHEET_STOPS}
        order={MAP_SHEET_ORDER}
        view={view}
        onViewChange={setView}
        grabLabel="גרירה"
        header={<button onClick={() => setView(MAP_SHEET_VIEW.full)}>רשימה</button>}
      >
        <p>rows</p>
      </SnapSheet>
    </div>
  );
}

const sheet = () => document.querySelector('.wp-snapsheet') as HTMLElement;
const grab = () => screen.getByRole('button', { name: 'גרירה' });

describe('SnapSheet (ADR-0121 §5)', () => {
  beforeEach(() => stubLayout(() => HALF));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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
    expect(sheet().style.getPropertyValue('--snap-h')).toBe('100%');
  });

  it('opens at the peek height when asked', () => {
    render(<Host initial={MAP_SHEET_VIEW.peek} />);
    expect(sheet().style.getPropertyValue('--snap-h')).toBe('116px');
  });

  // Dragging UP grows the sheet: it is anchored at the bottom, so the height is the
  // distance from the finger to that edge.
  it('a drag up releases to the next stop, and takes an imperative height on the way', () => {
    render(<Host />);
    fireEvent.pointerDown(grab(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(grab(), { clientY: 100 });
    // Mid-gesture the height is the finger's, not a stop's — and easing is off.
    expect(sheet().style.height).toBe(`${HALF + 200}px`);
    expect(sheet().className).toContain('dragging');

    fireEvent.pointerUp(grab(), { clientY: 100 });
    expect(sheet().dataset.view).toBe('full');
    expect(sheet().style.height).toBe('');
    expect(sheet().className).not.toContain('dragging');
  });

  it('a drag down releases to the peek', () => {
    render(<Host />);
    fireEvent.pointerDown(grab(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(grab(), { clientY: 560 });
    fireEvent.pointerUp(grab(), { clientY: 560 });
    expect(sheet().dataset.view).toBe('peek');
  });

  it('clamps: a drag past the top cannot exceed the container, past the bottom cannot go under the peek', () => {
    render(<Host />);
    fireEvent.pointerDown(grab(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(grab(), { clientY: -5000 });
    expect(sheet().style.height).toBe(`${CONTAINER}px`);
    fireEvent.pointerMove(grab(), { clientY: 5000 });
    expect(sheet().style.height).toBe('116px');
    fireEvent.pointerUp(grab(), { clientY: 5000 });
  });

  // A press with no movement is a tap, not a drag — releasing must not snap the
  // sheet to whichever stop happens to be nearest.
  it('a press with no movement changes nothing', () => {
    render(<Host />);
    fireEvent.pointerDown(grab(), { clientY: 300, button: 0 });
    fireEvent.pointerUp(grab(), { clientY: 300 });
    expect(sheet().dataset.view).toBe('half');
    expect(sheet().style.height).toBe('');
  });

  it('ignores a non-primary button, so a right-click never restarts the gesture', () => {
    render(<Host />);
    fireEvent.pointerDown(grab(), { clientY: 300, button: 2 });
    fireEvent.pointerMove(grab(), { clientY: 100 });
    expect(sheet().style.height).toBe('');
  });

  it('a cancelled gesture (pointercancel) still snaps rather than freezing mid-drag', () => {
    render(<Host />);
    fireEvent.pointerDown(grab(), { clientY: 300, button: 0 });
    fireEvent.pointerMove(grab(), { clientY: 100 });
    fireEvent.pointerCancel(grab(), { clientY: 100 });
    expect(sheet().dataset.view).toBe('full');
    expect(sheet().style.height).toBe('');
  });

  it('the handle is a named control — the gesture’s only affordance', () => {
    render(<Host />);
    expect(grab().getAttribute('aria-label')).toBe('גרירה');
  });

  // It is a pane, not an overlay: it registers nothing with the back stack, so it
  // needs no NavProvider to render at all (ADR-0103).
  it('renders with no overlay plumbing whatsoever', () => {
    render(<Host />);
    expect(screen.getByText('rows')).toBeTruthy();
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });
});
