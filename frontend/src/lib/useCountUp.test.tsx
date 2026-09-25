// @vitest-environment jsdom
//
// StrictMode runs every effect twice (mount, cleanup, mount). The first run's cleanup
// clears the interval, so a hook that remembers "already played this target" across
// that cleanup returns early on the second run and sticks at 0 — which is what every
// Home stat tile read under `pnpm dev` (F5). The same path runs in production when a
// target goes N → 0 → N. PlanHome.count-up.test.tsx renders without StrictMode, which
// is why it never saw this.
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { COUNT_UP } from '../constants';
import { useCountUp } from './useCountUp';

function Counter({ target }: { target: number }) {
  return <span data-testid="v">{useCountUp(target)}</span>;
}

const shown = () => document.querySelector('[data-testid="v"]')!.textContent;
const runOut = () =>
  act(() => {
    vi.advanceTimersByTime(COUNT_UP.STEP_MS * COUNT_UP.STEPS);
  });

describe('useCountUp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Motion IS wanted (jsdom's default reads as reduced), so the count actually runs.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('reaches its target under StrictMode', () => {
    render(
      <StrictMode>
        <Counter target={7} />
      </StrictMode>,
    );
    runOut();
    expect(shown()).toBe('7');
  });

  it('plays again when a target goes N → 0 → N', () => {
    const { rerender } = render(<Counter target={5} />);
    runOut();
    rerender(<Counter target={0} />);
    expect(shown()).toBe('0');
    rerender(<Counter target={5} />);
    runOut();
    expect(shown()).toBe('5');
  });
});
