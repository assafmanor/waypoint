// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useSpringLoadedDay } from './useSpringLoadedDay';
import { DRAG_DAY_DWELL_MS } from '../constants';

const onSwitch = vi.fn();

function Host({ overDate, activeDate = 'D1' }: { overDate: string | null; activeDate?: string }) {
  useSpringLoadedDay(overDate, activeDate, onSwitch);
  return null;
}

describe('useSpringLoadedDay (ADR-0116 session-119)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    onSwitch.mockClear();
  });

  it('switches to a day the drag rests on', () => {
    render(<Host overDate="D2" />);
    vi.advanceTimersByTime(DRAG_DAY_DWELL_MS - 50);
    expect(onSwitch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(onSwitch).toHaveBeenCalledWith('D2');
  });

  // The substance of the dwell: a drag crosses several pills on its way anywhere, and
  // opening every day it passes over would be unusable.
  it('does not switch to a day merely passed over', () => {
    const { rerender } = render(<Host overDate="D2" />);
    vi.advanceTimersByTime(DRAG_DAY_DWELL_MS - 50);
    rerender(<Host overDate="D3" />);
    vi.advanceTimersByTime(DRAG_DAY_DWELL_MS - 50);
    expect(onSwitch).not.toHaveBeenCalled();
    // …and the day it settles on is the one it ended up over.
    vi.advanceTimersByTime(50);
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith('D3');
  });

  it('leaving the strip cancels a pending switch', () => {
    const { rerender } = render(<Host overDate="D2" />);
    vi.advanceTimersByTime(DRAG_DAY_DWELL_MS - 50);
    rerender(<Host overDate={null} />);
    vi.advanceTimersByTime(DRAG_DAY_DWELL_MS * 2);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('resting on the day already on screen is not a switch', () => {
    render(<Host overDate="D1" activeDate="D1" />);
    vi.advanceTimersByTime(DRAG_DAY_DWELL_MS * 2);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('fires once, not once per re-render', () => {
    const { rerender } = render(<Host overDate="D2" />);
    // This screen re-renders every second on the clock; a callback identity in the
    // effect's deps would restart the dwell on every tick and it would never fire.
    for (let i = 0; i < 5; i++) rerender(<Host overDate="D2" />);
    vi.advanceTimersByTime(DRAG_DAY_DWELL_MS);
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});
