// @vitest-environment jsdom
//
// **What this proves and what it does not** (ADR-0185). The registration hook is
// mocked, so what is under test is the scheduling half: a waiting build is taken
// at a quiet moment and never at a costly one, the banner appears only when the
// quiet path could not run, and the poll re-checks `sw.js` on the interval. The
// browser half — that a real `waiting` event fires `onNeedRefresh`, that
// SKIP_WAITING reaches the generated worker, and that the old precache really
// does survive intact until it does — is NOT tested here and could not be by a
// unit test: it needs two builds and a dist swapped underneath a live tab. That
// half rests on the plugin's own client source (`dist/client/build/register.js`)
// and workbox-build's `sw-template.js`, both read and quoted in `useAppUpdate.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { AppUpdateNotice } from './AppUpdateNotice';
import { NavProvider } from '../state/nav-state';
import { ToastProvider } from './Toast';
import {
  SW_UPDATE_CHECK_MS,
  SW_UPDATE_IDLE_APPLY_MS,
  SW_UPDATE_NOTICE_AFTER_MS,
  SW_UPDATE_RECHECK_MS,
} from '../constants';
import { t } from '../i18n/he';

// The options the component's hook handed the plugin, so the test can fire the
// plugin's callbacks the way a real service-worker lifecycle would.
let swOptions: RegisterSWOptions | undefined;
const updateServiceWorker = vi.fn();
let reload: ReturnType<typeof vi.fn>;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: RegisterSWOptions) => {
    swOptions = options;
    return {
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    };
  },
}));

const offline = vi.hoisted(() => ({ value: false }));
vi.mock('../lib/outbox', () => ({ isOffline: () => offline.value }));

/** Stands in for the `ServiceWorkerRegistration` the plugin hands back. */
const fakeRegistration = () => ({ update: vi.fn() }) as unknown as ServiceWorkerRegistration;

/** A stand-in for `navigator.serviceWorker`: an event target with a controller,
 *  which is what tells a swap apart from a first install. */
const swContainer = new EventTarget() as EventTarget & { controller: unknown };
const installServiceWorkerContainer = (controlled: boolean) => {
  swContainer.controller = controlled ? {} : null;
  Object.defineProperty(navigator, 'serviceWorker', { value: swContainer, configurable: true });
};

/** `waiting`: a new build is installed and parked. Nothing has changed yet. */
const reportWaiting = () => act(() => swOptions?.onNeedRefresh?.());
/** The real swap signal: the controller changed, so this document is stale.
 *  Deliberately NOT the plugin's `onNeedReload`, which it gates on a heuristic. */
const reportSwapped = () =>
  act(() => void swContainer.dispatchEvent(new Event('controllerchange')));
const reportRegistered = (registration: ServiceWorkerRegistration) =>
  act(() => swOptions?.onRegisteredSW?.('/sw.js', registration));

/** A plain event rather than `fireEvent.pointerDown`: jsdom has no `PointerEvent`,
 *  and the hook only cares that something happened. */
const touchThePage = () => act(() => void window.dispatchEvent(new Event('pointerdown')));

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
};

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function renderNotice() {
  return render(
    // `NavProvider` is the overlay registry the swap asks before reloading, and
    // it needs the toast host; the notice itself needs neither.
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>
          <AppUpdateNotice />
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function setup() {
  installServiceWorkerContainer(true);
  swOptions = undefined;
  offline.value = false;
  updateServiceWorker.mockClear();
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  vi.useFakeTimers();
  setVisibility('visible');
}

function teardown() {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
}

describe('the automatic build swap', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('takes a waiting build at once on a document nobody has touched', () => {
    renderNotice();
    reportWaiting();

    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('holds off once the page has been used, and takes it when the tab hides', () => {
    renderNotice();
    touchThePage();
    reportWaiting();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    setVisibility('hidden');
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('takes it in the foreground once the page has been idle long enough', () => {
    renderNotice();
    touchThePage();
    reportWaiting();

    advance(SW_UPDATE_IDLE_APPLY_MS - SW_UPDATE_RECHECK_MS * 2);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    advance(SW_UPDATE_RECHECK_MS * 3);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('never reloads out from under a focused field, hidden or not', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    renderNotice();
    reportWaiting();
    setVisibility('hidden');
    advance(SW_UPDATE_IDLE_APPLY_MS);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    // Blurring is enough — the next recheck finds the page quiet again.
    input.blur();
    advance(SW_UPDATE_RECHECK_MS);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('asks for the swap, and reloads only once it has actually happened', () => {
    renderNotice();
    reportWaiting();
    // Asking is not reloading: the plugin posts SKIP_WAITING and returns.
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    reportSwapped();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once, even though the plugin reports the same swap a second way', () => {
    renderNotice();
    reportWaiting();
    reportSwapped();
    act(() => swOptions?.onNeedReload?.());

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says nothing at all along the way: the banner is not part of the quiet path', () => {
    const { container } = renderNotice();
    reportWaiting();
    reportSwapped();

    expect(container.querySelector('.fb-banner')).toBeNull();
  });
});

describe('the notice, for the swaps that could not be quiet', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('appears at once when another tab swapped the build under this one', () => {
    renderNotice();
    touchThePage();
    // No `onNeedRefresh` first: this tab never asked, it was claimed.
    reportSwapped();

    expect(screen.getByText(t.feedback.update.message)).toBeTruthy();
  });

  it('stays quiet on a first install, where the claim is not a swap', () => {
    // Nothing controlled this document when it loaded, so `clientsClaim()` taking
    // it is the opposite of a stale build — greeting that with a banner would put
    // "a new version was installed" in front of every first-ever visit.
    installServiceWorkerContainer(false);
    const { container } = renderNotice();
    reportSwapped();

    expect(container.querySelector('.fb-banner')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads straight away when its verb is pressed after such a swap', () => {
    renderNotice();
    touchThePage();
    reportSwapped();

    fireEvent.click(screen.getByRole('button', { name: t.feedback.update.action }));
    expect(reload).toHaveBeenCalled();
    // Nothing to skip past: the new worker already controls this tab.
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('appears when the quiet path has been blocked for long enough', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    const { container } = renderNotice();
    reportWaiting();
    advance(SW_UPDATE_NOTICE_AFTER_MS - SW_UPDATE_RECHECK_MS * 2);
    expect(container.querySelector('.fb-banner')).toBeNull();

    advance(SW_UPDATE_RECHECK_MS * 3);
    expect(screen.getByText(t.feedback.update.message)).toBeTruthy();
    input.remove();
  });

  it('dismisses without reloading', () => {
    const { container } = renderNotice();
    touchThePage();
    reportSwapped();

    fireEvent.click(screen.getByRole('button', { name: t.feedback.dismiss }));
    expect(container.querySelector('.fb-banner')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('the update poll', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('asks the registration to re-check on the interval, and stays quiet offline', () => {
    const registration = fakeRegistration();
    renderNotice();
    reportRegistered(registration);

    advance(SW_UPDATE_CHECK_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);

    offline.value = true;
    advance(SW_UPDATE_CHECK_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);

    offline.value = false;
    advance(SW_UPDATE_CHECK_MS);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
