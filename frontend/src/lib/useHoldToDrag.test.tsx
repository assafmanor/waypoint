// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useHoldToDrag } from './useHoldToDrag';
import { DRAG_HOLD_MS } from '../constants';

// The gesture arbitration (ADR-0116 §5, session-114): a scroll and a drag are the
// same movement, so only TIME can tell them apart. These assert the arbitration —
// that a flick never arms a drag, and that a hold does.
// jsdom implements neither PointerEvent nor pointer capture, so without this the
// events arrive with no coordinates and no `pointerType` — and the arbitration
// under test is entirely about those two things.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  readonly pointerId: number;
  constructor(type: string, props: MouseEventInit & { pointerType?: string; pointerId?: number }) {
    super(type, props);
    this.pointerType = props.pointerType ?? 'touch';
    this.pointerId = props.pointerId ?? 1;
  }
}
window.PointerEvent = TestPointerEvent as unknown as typeof window.PointerEvent;

const handlers = {
  onArm: vi.fn(),
  onMove: vi.fn(),
  onDrop: vi.fn(),
  onCancel: vi.fn(),
};

function Card({ onClick }: { onClick?: () => void }) {
  const holdToDrag = useHoldToDrag();
  return (
    <button type="button" onClick={onClick} {...holdToDrag(handlers)}>
      idea
    </button>
  );
}

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

  it('a mouse drags immediately — there is no scroll to disambiguate', () => {
    render(<Card />);
    down(100, 100, 'mouse');
    expect(handlers.onArm).toHaveBeenCalledTimes(1);
  });
});
