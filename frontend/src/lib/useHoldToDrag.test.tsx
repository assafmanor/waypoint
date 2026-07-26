// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useHoldToDrag } from './useHoldToDrag';
import { DRAG_HOLD_MS } from '../constants';

// The gesture arbitration (ADR-0116 §5, session-114): a scroll and a drag are the
// same movement, so only TIME can tell them apart. These assert the arbitration —
// that a flick never arms a drag, and that a hold does.
// jsdom implements neither PointerEvent nor pointer capture, so without the shim the
// events arrive with no coordinates and no `pointerType` — and the arbitration
// under test is entirely about those two things. Shared with the sheet's snap drag.
import '../test/pointer-events';

const handlers = {
  onArm: vi.fn(),
  onMove: vi.fn(),
  onDrop: vi.fn(),
  onCancel: vi.fn(),
};

function Card({ onClick, tick = 0 }: { onClick?: () => void; tick?: number }) {
  const holdToDrag = useHoldToDrag();
  return (
    <button type="button" onClick={onClick} {...holdToDrag(handlers)}>
      idea {tick}
    </button>
  );
}

/** A touchmove as the browser delivers it: cancellable only while the browser hasn't
 *  yet committed to scrolling. */
const touchMove = (cancelable = true) => {
  const e = new Event('touchmove', { cancelable, bubbles: true });
  card().dispatchEvent(e);
  return e;
};

const card = () => screen.getByRole('button');
const down = (x = 100, y = 100, pointerType = 'touch') =>
  fireEvent.pointerDown(card(), { clientX: x, clientY: y, pointerType, pointerId: 1 });
const move = (x: number, y: number) =>
  fireEvent.pointerMove(card(), { clientX: x, clientY: y, pointerId: 1 });

describe('useHoldToDrag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no pointer capture.
    Element.prototype.setPointerCapture = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    Object.values(handlers).forEach((h) => h.mockClear());
  });

  it('does not arm before the hold elapses', () => {
    render(<Card />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS - 50);
    expect(handlers.onArm).not.toHaveBeenCalled();
  });

  it('arms once the finger has been still for the hold', () => {
    render(<Card />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    expect(handlers.onArm).toHaveBeenCalledTimes(1);
  });

  it('a flick before the hold is a scroll: the drag never arms', () => {
    render(<Card />);
    down(100, 100);
    move(100, 60); // past the slop, still inside the hold window
    vi.advanceTimersByTime(DRAG_HOLD_MS * 2);
    expect(handlers.onArm).not.toHaveBeenCalled();
    expect(handlers.onMove).not.toHaveBeenCalled();
  });

  it('tolerates a small wobble during the hold', () => {
    render(<Card />);
    down(100, 100);
    move(103, 102); // within the slop — a finger is never perfectly still
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    expect(handlers.onArm).toHaveBeenCalledTimes(1);
  });

  it('reports moves only once armed, and a release commits the drop', () => {
    render(<Card />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    move(100, 300);
    fireEvent.pointerUp(card());
    expect(handlers.onMove).toHaveBeenCalledWith(expect.objectContaining({ clientY: 300 }));
    expect(handlers.onDrop).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it('a release before the hold is a tap: no drop, no cancel', () => {
    render(<Card />);
    down();
    fireEvent.pointerUp(card());
    expect(handlers.onDrop).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it('the browser taking the gesture cancels an armed drag', () => {
    render(<Card />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    fireEvent.pointerCancel(card());
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onDrop).not.toHaveBeenCalled();
  });

  it('swallows the click a completed drag fires, so a drop is not also a tap', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick} />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    move(100, 300);
    fireEvent.pointerUp(card());
    fireEvent.click(card());
    expect(onClick).not.toHaveBeenCalled();
  });

  // The dragged card is `pointer-events: none` while it's in flight, so the click a
  // release fires RETARGETS to whatever sits under the finger — a gap chip, a row.
  // A capture handler on the card itself never sees it, which is how a drop ended up
  // opening the new-event sheet.
  it('swallows that click even when it retargets to another element', () => {
    const elsewhere = vi.fn();
    render(
      <>
        <Card />
        <button type="button" onClick={elsewhere}>
          gap
        </button>
      </>,
    );
    fireEvent.pointerDown(screen.getByText(/idea/), {
      clientX: 100,
      clientY: 100,
      pointerType: 'touch',
      pointerId: 1,
    });
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    fireEvent.pointerUp(screen.getByText(/idea/));
    fireEvent.click(screen.getByText('gap'));
    expect(elsewhere).not.toHaveBeenCalled();
  });

  it('leaves an ordinary tap clickable', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick} />);
    down();
    fireEvent.pointerUp(card());
    fireEvent.click(card());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // The other thing a long press means to the platform: `user-select: none` on the
  // card doesn't stop it, because `selectstart` is what begins the selection and the
  // finger ends up over other elements entirely.
  it('cancels selectstart for as long as the hold lasts', () => {
    render(<Card />);
    down();
    const selectstart = new Event('selectstart', { cancelable: true, bubbles: true });
    document.dispatchEvent(selectstart);
    expect(selectstart.defaultPrevented).toBe(true);
  });

  it('turns selection off page-wide while armed, and restores it on drop', () => {
    render(<Card />);
    down();
    expect(document.body.classList.contains('wp-dragging')).toBe(false);
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    expect(document.body.classList.contains('wp-dragging')).toBe(true);
    fireEvent.pointerUp(card());
    expect(document.body.classList.contains('wp-dragging')).toBe(false);
  });

  it('stops cancelling selection once the gesture is over', () => {
    render(<Card />);
    down();
    fireEvent.pointerUp(card());
    const selectstart = new Event('selectstart', { cancelable: true, bubbles: true });
    document.dispatchEvent(selectstart);
    expect(selectstart.defaultPrevented).toBe(false);
  });

  it('a scroll flick releases the selection guard with the drag', () => {
    render(<Card />);
    down(100, 100);
    move(100, 60); // a scroll, so the pending drag is dropped
    const selectstart = new Event('selectstart', { cancelable: true, bubbles: true });
    document.dispatchEvent(selectstart);
    expect(selectstart.defaultPrevented).toBe(false);
  });

  // The reported bug: native touch scrolling kept running during an armed drag, so
  // the page moved one way while the edge auto-scroll moved it the other and the card
  // could never settle over a target. The guard has to be attached at MOUNT — by arm
  // time the browser has already put the gesture on the compositor fast path, where
  // touchmove is `cancelable: false` and preventDefault is a silent no-op.
  it('lets a touch scroll normally before the drag arms', () => {
    render(<Card />);
    down();
    expect(touchMove().defaultPrevented).toBe(false);
  });

  it('suppresses native touch scrolling for the length of an armed drag', () => {
    render(<Card />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    expect(touchMove().defaultPrevented).toBe(true);
  });

  it('hands scrolling back the moment the drag ends', () => {
    render(<Card />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    fireEvent.pointerUp(card());
    expect(touchMove().defaultPrevented).toBe(false);
  });

  it('does not fight a touchmove the browser has already made uncancellable', () => {
    render(<Card />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    // Nothing to assert but the absence of a console warning: calling preventDefault
    // on a non-cancellable event is a no-op the browser complains about.
    expect(touchMove(false).defaultPrevented).toBe(false);
  });

  // The other half of the same report ("the drag activates, but only on some parts of
  // the card"): the card was never the variable. The hold's cleanup was keyed on a
  // callback identity that changed every render, so any re-render inside the hold
  // window — and the builder re-renders every second, on the clock — cleared the
  // pending timer and the drag silently never armed.
  it('survives a re-render during the hold', () => {
    const { rerender } = render(<Card tick={0} />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS - 100);
    rerender(<Card tick={1} />);
    vi.advanceTimersByTime(100);
    expect(handlers.onArm).toHaveBeenCalledTimes(1);
  });

  it('still suppresses native scrolling after a re-render mid-drag', () => {
    const { rerender } = render(<Card tick={0} />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    rerender(<Card tick={1} />);
    expect(touchMove().defaultPrevented).toBe(true);
  });

  // The drag must outlive the thing it started on: dwelling over the day strip
  // switches the day under you, which unmounts the very row being dragged
  // (session-119). Pointer capture would be released and element handlers would
  // unmount with it, so move/up live on the window.
  it('keeps tracking after the dragged element unmounts', () => {
    let show = true;
    function Host() {
      const holdToDrag = useHoldToDrag();
      return show ? (
        <button type="button" {...holdToDrag(handlers)}>
          idea
        </button>
      ) : (
        <span>gone</span>
      );
    }
    const { rerender } = render(<Host />);
    down();
    vi.advanceTimersByTime(DRAG_HOLD_MS);
    expect(handlers.onArm).toHaveBeenCalledTimes(1);

    show = false;
    rerender(<Host />);

    // The source is gone; the gesture is not.
    fireEvent.pointerMove(window, { clientX: 100, clientY: 260, pointerId: 1 });
    expect(handlers.onMove).toHaveBeenCalledWith(expect.objectContaining({ clientY: 260 }));
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(handlers.onDrop).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it('a mouse drags immediately — there is no scroll to disambiguate', () => {
    render(<Card />);
    down(100, 100, 'mouse');
    expect(handlers.onArm).toHaveBeenCalledTimes(1);
  });
});
