// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useExitTransition } from './useExitTransition';

/** Minimal host: exposes the hook's two outputs and a way to trigger a close. */
function Host({ onClose }: { onClose: () => void }) {
  const { closing, beginClose } = useExitTransition(onClose);
  return (
    <button data-closing={closing ? '' : undefined} onClick={beginClose}>
      close
    </button>
  );
}

const btn = () => document.querySelector<HTMLButtonElement>('button')!;
const press = () => act(() => void btn().click());

describe('useExitTransition (ADR-0144)', () => {
  beforeEach(() => {
    // A readable token is what puts the hook on its animated branch; with none it is
    // synchronous, which is what the rest of the suite exercises.
    document.documentElement.style.setProperty('--t-quick', '140ms');
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    document.documentElement.style.removeProperty('--t-quick');
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('marks closing, then hands back after the exit duration', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    press();
    expect(btn().hasAttribute('data-closing')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(140));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // THE REGRESSION. `Modal` unmounts on close so it never needed a reset, but the
  // anchored panels persist and re-open — and without the reset, `closing` stayed true
  // and the idempotence guard made every later close a no-op: the picker opened once and
  // then could never be shut again.
  it('resets, so a surface that persists can close more than once', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);

    press();
    act(() => void vi.advanceTimersByTime(140));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(btn().hasAttribute('data-closing')).toBe(false);

    press();
    act(() => void vi.advanceTimersByTime(140));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is idempotent while the exit is playing', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    press();
    press();
    press();
    act(() => void vi.advanceTimersByTime(500));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not hand back after unmounting mid-exit', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Host onClose={onClose} />);
    press();
    unmount();
    act(() => void vi.advanceTimersByTime(500));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes synchronously when no animation will play', () => {
    document.documentElement.style.removeProperty('--t-quick');
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    // No timer advanced: an unreadable duration means nothing is animating, so waiting
    // would hold a dismissed surface on screen (ADR-0140 §5).
    press();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(btn().hasAttribute('data-closing')).toBe(false);
  });

  it('closes synchronously under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    press();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
