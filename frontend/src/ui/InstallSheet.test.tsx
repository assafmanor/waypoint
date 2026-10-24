// @vitest-environment jsdom
//
// ADR-0204 §4. The whole of this surface's design is "only the BODY varies, and the three
// bodies are different KINDS of thing" — so the specs here are mostly about what each
// platform must NOT be given: a button that claims to install where nothing can.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { t } from '../i18n/he';

const fired = vi.hoisted(() => ({ count: 0 }));

vi.mock('../lib/install', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/install')>();
  return {
    ...actual,
    fireInstallPrompt: () => {
      fired.count += 1;
      return Promise.resolve('accepted' as const);
    },
  };
});

import { InstallSheet } from './InstallSheet';
import { INSTALL_PATH } from '../lib/install';

// `Modal` registers with the back stack through `useOverlay`, which needs the nav provider.
// Stubbed rather than wrapped: this file is about the sheet's body, and the back contract is
// `Modal.test.tsx`'s subject.
vi.mock('../state/nav-state', () => ({
  useOverlay: () => {},
  useHasOverlay: () => () => false,
}));

beforeEach(() => {
  fired.count = 0;
});
afterEach(cleanup);

describe('the Chrome path', () => {
  it('offers a button that really installs, and closes whatever the answer', async () => {
    const onClose = vi.fn();
    render(<InstallSheet path={INSTALL_PATH.PROMPT} onClose={onClose} />);
    const button = screen.getByRole('button', { name: t.install.sheet.doInstall });
    button.click();
    expect(fired.count).toBe(1);
    // The close is chained off the prompt's promise, so it lands a microtask later.
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says the reasons, and points at the permanent home', () => {
    render(<InstallSheet path={INSTALL_PATH.PROMPT} onClose={vi.fn()} />);
    expect(screen.getByText(t.install.sheet.whyOffline)).toBeTruthy();
    expect(screen.getByText(t.install.sheet.whyNotify)).toBeTruthy();
    expect(screen.getByText(t.install.sheet.whyHome)).toBeTruthy();
    expect(screen.getByText(t.install.sheet.note)).toBeTruthy();
  });
});

describe('the WebKit path', () => {
  it('teaches the gesture in ordered steps', () => {
    render(<InstallSheet path={INSTALL_PATH.TEACH} onClose={vi.fn()} />);
    expect(screen.getByText(t.install.sheet.stepShare)).toBeTruthy();
    expect(screen.getByText(t.install.sheet.stepAdd)).toBeTruthy();
  });

  // The rule this surface exists to hold: nothing here can install, so nothing here may
  // offer to. A button saying "התקנה" on iOS would be the worst outcome on the file.
  it('offers no install button at all — only an acknowledgement', () => {
    const onClose = vi.fn();
    render(<InstallSheet path={INSTALL_PATH.TEACH} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: t.install.sheet.doInstall })).toBeNull();
    const got = screen.getByRole('button', { name: t.install.sheet.doGot });
    expect(got.dataset.quiet).toBe('true');
    got.click();
    expect(onClose).toHaveBeenCalled();
    expect(fired.count).toBe(0);
  });
});

describe('the embedded-browser path', () => {
  it('says why, and hands over the link instead of a dead button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<InstallSheet path={INSTALL_PATH.IN_APP} onClose={vi.fn()} />);
    expect(screen.getByText(t.install.sheet.inAppTitle)).toBeTruthy();
    screen.getByRole('button', { name: t.install.sheet.inAppCopy }).click();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: t.install.sheet.inAppCopied })).toBeTruthy(),
    );
  });

  // The reasons are for a surface that can act on them. Here the only useful sentence is
  // "you cannot do this from in here", so the list would be noise above a refusal.
  it('does not list the reasons, and offers no install', () => {
    render(<InstallSheet path={INSTALL_PATH.IN_APP} onClose={vi.fn()} />);
    expect(screen.queryByText(t.install.sheet.whyOffline)).toBeNull();
    expect(screen.queryByRole('button', { name: t.install.sheet.doInstall })).toBeNull();
  });

  it('survives a clipboard that refuses', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    render(<InstallSheet path={INSTALL_PATH.IN_APP} onClose={vi.fn()} />);
    expect(() =>
      screen.getByRole('button', { name: t.install.sheet.inAppCopy }).click(),
    ).not.toThrow();
  });
});
