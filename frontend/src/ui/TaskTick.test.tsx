// @vitest-environment jsdom
// **The hold, and the three ways it must not lose a tick** (ADR-0195).
//
// `TaskTick` delays its CALLER so the beat has something to play in, which makes it the one
// place in the tasks feature where a press and a write are not the same instant. Every test
// here is about that gap: it closes, it closes only in one direction, and it closes even when
// the row is torn out mid-beat.
//
// Note what makes this file necessary rather than paranoid: in jsdom `tokens.css` is absent,
// so `motionDurationMs` answers 0 and the gap does not exist — which is exactly why the four
// surfaces' own suites needed no changes, and equally why none of them can see any of this.
// The token is stubbed below to make the gap real.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TaskTick } from './TaskTick';

/** Make `motionDurationMs` answer a real duration by giving `:root` the token it reads. */
function withMotion(ms = 240) {
  document.documentElement.style.setProperty('--t-base', `${ms}ms`);
  return ms;
}

afterEach(() => {
  document.documentElement.style.removeProperty('--t-base');
  vi.useRealTimers();
  cleanup();
});

describe('TaskTick', () => {
  it('ticks synchronously when nothing will animate', () => {
    // The jsdom default, and the reason the four consumers' specs are untouched.
    const onTick = vi.fn();
    render(<TaskTick done={false} title="להזמין כרטיסים" onTick={onTick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('holds the tick for the beat, then fires it', () => {
    vi.useFakeTimers();
    const ms = withMotion();
    const onTick = vi.fn();
    render(<TaskTick done={false} title="להזמין כרטיסים" onTick={onTick} />);
    const tick = screen.getByRole('button');

    fireEvent.click(tick);
    // The beat is on the element and the row has NOT been told yet — that pair is the whole
    // design: the answer lands before the data does.
    expect(tick.classList.contains('is-ticking')).toBe(true);
    expect(onTick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(ms - 1);
    expect(onTick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(tick.classList.contains('is-ticking')).toBe(false);
  });

  it('un-ticks immediately and plays no beat', () => {
    vi.useFakeTimers();
    withMotion();
    const onTick = vi.fn();
    render(<TaskTick done title="להזמין כרטיסים" onTick={onTick} />);
    const tick = screen.getByRole('button');

    fireEvent.click(tick);
    // A correction, not an achievement. The way back is the open state's own `transition`,
    // which is CSS and needs no class — so a beat here would be the bug, not a nicety.
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(tick.classList.contains('is-ticking')).toBe(false);
  });

  it('flushes a held tick when the row unmounts mid-beat', () => {
    vi.useFakeTimers();
    withMotion();
    const onTick = vi.fn();
    const { unmount } = render(<TaskTick done={false} title="להזמין כרטיסים" onTick={onTick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onTick).not.toHaveBeenCalled();
    unmount();

    // The one failure the hold could have introduced: a tap that never became a write.
    expect(onTick).toHaveBeenCalledTimes(1);
    // ...and exactly once — the flushed timer must not also fire.
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('names the task it closes, and reports its own state', () => {
    const { rerender } = render(<TaskTick done={false} title="להזמין כרטיסים" onTick={vi.fn()} />);
    const tick = screen.getByRole('button');
    expect(tick.getAttribute('aria-label')).toContain('להזמין כרטיסים');
    expect(tick.getAttribute('aria-pressed')).toBe('false');
    rerender(<TaskTick done title="להזמין כרטיסים" onTick={vi.fn()} />);
    expect(tick.getAttribute('aria-pressed')).toBe('true');
  });

  it('wears the density its host asked for, and nothing else', () => {
    render(<TaskTick done={false} title="א" onTick={vi.fn()} />);
    expect(screen.getByRole('button').className).toBe('tsk-tick');
    cleanup();
    render(<TaskTick done={false} title="א" onTick={vi.fn()} density="section" />);
    expect(screen.getByRole('button').className).toBe('tsk-tick-sec');
  });
});
