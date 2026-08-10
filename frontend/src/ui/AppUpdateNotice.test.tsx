// @vitest-environment jsdom
//
// **What this proves and what it does not** (ADR-0181). The registration hook is
// mocked, so what is under test is the React half: the plugin reports an update →
// the banner renders → the verb reloads → dismiss puts it away, and the poll asks
// the registration to re-check on the interval (and stays quiet offline). The
// browser half — that a real `activated` event fires `onNeedReload` at all, and
// that an un-prompted tab really does fail a lazy import against the new precache
// — is NOT tested here and could not be by a unit test: it needs two builds and a
// dist swapped underneath a live tab. That half rests on the plugin's own client
// source (`dist/client/build/register.js`), read and quoted in `useAppUpdate.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { AppUpdateNotice } from './AppUpdateNotice';
import { SW_UPDATE_CHECK_MS } from '../constants';
import { t } from '../i18n/he';

// The options the component's hook handed the plugin, so the test can fire the
// plugin's callbacks the way a real service-worker lifecycle would.
let swOptions: RegisterSWOptions | undefined;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: RegisterSWOptions) => {
    swOptions = options;
    return {
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    };
  },
}));

const offline = vi.hoisted(() => ({ value: false }));
vi.mock('../lib/outbox', () => ({ isOffline: () => offline.value }));

/** Stands in for the `ServiceWorkerRegistration` the plugin hands back. */
const fakeRegistration = () => ({ update: vi.fn() }) as unknown as ServiceWorkerRegistration;

/** The plugin fires this on the new SW's `activated` event under `autoUpdate`. */
const reportUpdate = () => act(() => swOptions?.onNeedReload?.());

const reportRegistered = (registration: ServiceWorkerRegistration) =>
  act(() => swOptions?.onRegisteredSW?.('/sw.js', registration));

describe('AppUpdateNotice', () => {
  beforeEach(() => {
    swOptions = undefined;
    offline.value = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders nothing until the registration reports an update', () => {
    const { container } = render(<AppUpdateNotice />);
    expect(container.querySelector('.fb-banner')).toBeNull();

    reportUpdate();
    expect(screen.getByText(t.feedback.update.message)).toBeTruthy();
  });

  it('reloads when the verb is pressed', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<AppUpdateNotice />);
    reportUpdate();

    fireEvent.click(screen.getByRole('button', { name: t.feedback.update.action }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('dismisses without reloading', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const { container } = render(<AppUpdateNotice />);
    reportUpdate();

    fireEvent.click(screen.getByRole('button', { name: t.feedback.dismiss }));
    expect(container.querySelector('.fb-banner')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('asks the registration to re-check on the interval, and stays quiet offline', () => {
    const registration = fakeRegistration();
    render(<AppUpdateNotice />);
    reportRegistered(registration);

    act(() => void vi.advanceTimersByTime(SW_UPDATE_CHECK_MS));
    expect(registration.update).toHaveBeenCalledTimes(1);

    offline.value = true;
    act(() => void vi.advanceTimersByTime(SW_UPDATE_CHECK_MS));
    expect(registration.update).toHaveBeenCalledTimes(1);

    offline.value = false;
    act(() => void vi.advanceTimersByTime(SW_UPDATE_CHECK_MS));
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
