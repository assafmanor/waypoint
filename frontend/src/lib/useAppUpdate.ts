// The service-worker update signal (ADR-0181, F-13).
//
// `vite-plugin-pwa` is on `registerType: 'autoUpdate'` with Workbox's
// `skipWaiting`/`clientsClaim`, so a rebuilt SW **activates and claims this tab
// immediately** — deliberately (vite.config.ts): an offline reload in between
// must never run stale JS. The cost of that choice lands on the tab that is
// already open, whose running JS still holds the OLD build's chunk hashes while
// the new SW has already replaced the precache. The next dynamic import of a
// not-yet-loaded route can then miss.
//
// **Read the plugin's client source before changing anything here** (its
// `dist/client/build/register.js`), because two things are not what the README
// suggests. In `autoUpdate` mode `onNeedRefresh` is **never called** and
// `useRegisterSW`'s `needRefresh` stays `false` forever — the signal is
// `onNeedReload`, fired on the new SW's `activated`. And `onNeedReload` is not
// merely a notification: passing it **suppresses the plugin's default, which is
// a silent `window.location.reload()`** of a live tab. So this hook both raises
// the notice and is what stops the app yanking the page out from under someone
// mid-sentence. Which is also why the reload below is our own `location.reload()`
// and not `updateServiceWorker()` — in `autoUpdate` that function only awaits the
// registration and returns; it reloads nothing.
import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { SW_UPDATE_CHECK_MS } from '../constants';
import { isOffline } from './outbox';

export interface AppUpdate {
  /** A new build has taken over this tab; the JS still running is the old one. */
  updateReady: boolean;
  /** Reload to pick up the new build. */
  reload: () => void;
  /** Put the notice away without reloading. */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdate {
  const [updateReady, setUpdateReady] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();

  useRegisterSW({
    onNeedReload: () => setUpdateReady(true),
    onRegisteredSW: (_swUrl, reg) => setRegistration(reg),
  });

  // The browser re-checks `sw.js` on navigation and roughly once a day. This is a
  // standalone PWA that stays open for the length of a trip, so without a poll a
  // tab opened before a deploy never learns there was one. Skipped while offline —
  // `update()` would only queue a doomed fetch on a plane.
  useEffect(() => {
    if (!registration) return;
    const id = window.setInterval(() => {
      if (!isOffline()) void registration.update();
    }, SW_UPDATE_CHECK_MS);
    return () => window.clearInterval(id);
  }, [registration]);

  const reload = useCallback(() => window.location.reload(), []);
  const dismiss = useCallback(() => setUpdateReady(false), []);

  return { updateReady, reload, dismiss };
}
