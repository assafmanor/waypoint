// @vitest-environment jsdom
//
// The regression this exists for is the absence of the thing under test: with no
// boundary, React unmounts the whole tree on an uncaught render error and the
// user gets a blank page (ADR-0185). So the assertion that matters is the
// negative one — the document is not empty.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppErrorBoundary } from './AppErrorBoundary';
import { t } from '../../i18n/he';

function Boom(): never {
  throw new Error('a chunk that is not there');
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error, and so do we on purpose (componentDidCatch is
    // the app's only crash record). Silenced so a passing run reads as one.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    cleanup();
  });

  it('passes children through when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>המסלול</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('המסלול')).toBeTruthy();
  });

  it('shows a recoverable screen instead of a blank page', () => {
    const { container } = render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(container.textContent).not.toBe('');
    expect(screen.getByText(t.feedback.errorTitle)).toBeTruthy();
    expect(screen.getByText(t.feedback.crash.body)).toBeTruthy();
  });

  it('offers a reload, and reloads', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: t.feedback.crash.action }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('records the crash, since a silent blank screen is what made the last one hard to place', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      'Unhandled render error',
      expect.any(Error),
      expect.anything(),
    );
  });
});
