// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BuildBadge } from './BuildBadge';

/** The env var is pinned empty for the whole suite (`vite.config.ts`'s `test.env`), so the
 *  OFF case is the default and the ON case has to say so — which is the right way round:
 *  the assertion that matters most is that production ships nothing. */
function withBadge(value: string) {
  vi.stubEnv('VITE_BUILD_BADGE', value);
}

describe('BuildBadge', () => {
  // `globals` is off in this config, so RTL's automatic cleanup never registers and renders
  // accumulate across tests in the file — which reads as "found multiple elements".
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('renders nothing when the env var is unset — the production case', () => {
    const { container } = render(<BuildBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a value that is not a deliberate on', () => {
    // Guards the shape of the check itself: `VITE_BUILD_BADGE=0` reads as off, and so does
    // any leftover string, rather than "non-empty means on".
    withBadge('0');
    const { container } = render(<BuildBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the build label when switched on', () => {
    withBadge('1');
    const { container } = render(<BuildBadge />);
    // `__BUILD_LABEL__` is injected by `define`, so the vitest run has a real value here —
    // whatever the checkout is. Asserting it is non-empty is the honest assertion; asserting
    // a specific SHA would fail on every commit.
    expect(container.textContent!.length).toBeGreaterThan(0);
  });

  it('always carries a timestamp, which is the part that survives a missing commit', () => {
    // Staging printed `unknown 08-14 09:22` because Railway does not forward its `GIT_*`
    // vars into the Docker build and the context has no `.git`. The clock is what actually
    // answers "did my redeploy land?", so it is never conditional on the commit resolving.
    withBadge('1');
    const { container } = render(<BuildBadge />);
    expect(container.textContent).toMatch(/\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('cannot eat a tap, so it can never hide the thing being tested', () => {
    // The first version was a button that hid itself on tap, and the owner tapped it and
    // lost the one thing they had asked for.
    withBadge('true');
    const { container } = render(<BuildBadge />);
    expect(screen.queryByRole('button')).toBeNull();
    expect((container.firstChild as HTMLElement).style.pointerEvents).toBe('none');
  });
});
