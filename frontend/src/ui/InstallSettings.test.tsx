// @vitest-environment jsdom
//
// ADR-0204 §6. The permanent home is the reason everything else is allowed to give up after
// two asks, so the properties that matter are the ones about it always being TRUE: it never
// nags, it never lies about the state, and it never shows a button that could not work.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { t } from '../i18n/he';

vi.mock('../state/nav-state', () => ({
  useOverlay: () => {},
  useHasOverlay: () => () => false,
}));

import { InstallSettings } from './InstallSettings';
import { __setDeferredPromptForTest } from '../lib/install';

/** The browser surface the install path is read from. */
function browser({ installed = false, ua = 'Chrome/126' } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('display-mode: standalone') && installed,
  }));
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

const withPrompt = () =>
  __setDeferredPromptForTest({
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  } as never);

beforeEach(() => {
  __setDeferredPromptForTest(null);
  browser();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'standalone');
  __setDeferredPromptForTest(null);
});

describe('the permanent row', () => {
  it('offers the install when there is a path, and says what it buys', () => {
    withPrompt();
    render(<InstallSettings />);
    expect(screen.getByText(t.install.settings.notInstalled)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.install.settings.action })).toBeTruthy();
    expect(screen.getByText(t.install.settings.hint)).toBeTruthy();
  });

  it('reports an installed app and offers nothing', () => {
    browser({ installed: true });
    render(<InstallSettings />);
    expect(screen.getByText(t.install.settings.installed)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.install.settings.action })).toBeNull();
  });

  // The row must not become a dead label on a browser with no path at all: a control that
  // reliably does nothing is worse than no control, which is the rule the notification
  // section already holds.
  it('says so where no path exists, rather than showing a button that cannot work', () => {
    render(<InstallSettings />);
    expect(screen.queryByRole('button', { name: t.install.settings.action })).toBeNull();
    expect(screen.getByText(t.install.settings.unavailable)).toBeTruthy();
  });

  it('opens the sheet, and the sheet is the same one every door opens', () => {
    withPrompt();
    render(<InstallSettings />);
    act(() => screen.getByRole('button', { name: t.install.settings.action }).click());
    // Scoped to the dialog: the row's verb and the sheet's are the SAME word, which is the
    // copy being right rather than a collision — one surface, one verb for it.
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText(t.install.sheet.sub)).toBeTruthy();
    expect(sheet.getByRole('button', { name: t.install.sheet.doInstall })).toBeTruthy();
  });

  // A `beforeinstallprompt` can land after this screen is already open, and an install
  // completed in another tab must retire the button — both are the same subscription.
  it('follows the path changing underneath it', () => {
    render(<InstallSettings />);
    expect(screen.queryByRole('button', { name: t.install.settings.action })).toBeNull();
    // The capture notifies its watchers synchronously, so the re-render is `act`'s to flush.
    act(withPrompt);
    expect(screen.getByRole('button', { name: t.install.settings.action })).toBeTruthy();
  });
});
