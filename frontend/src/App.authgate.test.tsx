// @vitest-environment jsdom
// Regression coverage for the "stuck on טוען… after logout then login" bug: the
// AuthGate render gate must lift once a saved intent is consumed, even when the
// intent equals the current path (so the effect neither navigates nor changes
// any other state). Before the fix the gate read sessionStorage directly at
// render time, so consuming that intent triggered no re-render and the boot
// screen stuck until the tab was closed.
import type { ReactNode } from 'react';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Drive the gate directly at status='authed' — the bug reproduces from a plain
// authed mount with a pending intent, no transition needed. Stub the whole auth
// module (its real boot effect would hit the network) but keep the other exports
// the App module graph references at import time as harmless passthroughs.
vi.mock('./state/auth-state', () => ({
  useAuth: () => ({ status: 'authed', me: null, login: () => {}, logout: () => {} }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

import { AuthGate } from './App';
import { saveIntent } from './lib/intent';
import { t } from './i18n/he';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AuthGate />}>
          <Route path="/" element={<div>HOME_OUTLET</div>} />
          <Route path="login" element={<div>LOGIN_SCREEN</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthGate intent gate', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => cleanup());

  it('lifts the boot gate after consuming an intent equal to the current path (logout→login→"/")', async () => {
    saveIntent('/'); // logout from "/" saved this; OAuth lands back on "/"
    renderAt('/');
    // The gate resolves to the app, not a permanent boot screen.
    expect(await screen.findByText('HOME_OUTLET')).toBeTruthy();
    expect(screen.queryByText(t.shell.booting)).toBeNull();
  });

  it('renders the outlet with no pending intent', async () => {
    renderAt('/');
    expect(await screen.findByText('HOME_OUTLET')).toBeTruthy();
  });
});
