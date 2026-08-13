// The build swap: it waits, then takes itself at a moment that costs nothing
// (ADR-0185, superseding ADR-0181's decision 1).
//
// `vite-plugin-pwa` is on `registerType: 'prompt'` with Workbox's `skipWaiting`
// OFF, which is the whole fix and not a preference: a rebuilt SW now **waits**
// instead of activating under the open page. While it waits, the old SW keeps
// serving its own complete precache, so the running JS and the chunks it has not
// loaded yet still agree. Under the previous `autoUpdate` they did not — the new
// SW claimed the tab and its activate deleted every old `assets/*-<hash>.js`,
// which the deploy had already removed from the server too, so the next lazy
// route 404'd and (with no error boundary anywhere) blanked the app.
//
// **Read the plugin's client source before changing anything here** (its
// `dist/client/build/register.js`), because the two callbacks are not what their
// names suggest and they swap meaning with the mode:
//
//   • `onNeedRefresh` fires on `waiting` — a new build is installed and parked.
//     Nothing has changed for this page. This is the signal we schedule against,
//     and it is reliable: workbox-window also raises it for a worker that was
//     already parked when the page loaded, which is the cold-open-after-a-deploy
//     case. Belt and braces anyway, `onRegisteredSW` checks `reg.waiting` itself.
//   • `onNeedReload` is NOT the reload signal, and trusting it cost a real
//     browser run to find. The plugin's `controlling` handler reads
//     `if (event.isUpdate)`, and workbox-window only sets `isUpdate` when its own
//     `updateLikelyTriggeredExternally` heuristic says the update was ours —
//     a guess that includes *"more than 60 seconds since `register()`"*, which is
//     true of every update a long-lived tab ever finds. Measured, with two builds
//     and a dist swapped underneath a live tab: SKIP_WAITING posted, the new
//     worker activated and claimed the tab, `controllerchange` fired — and
//     `onNeedReload` never ran. The page sat there running orphaned JS, which is
//     the exact state this whole change exists to prevent.
//
//     So the reload hangs off `controllerchange` directly. No heuristic, no
//     opinion about who asked: the controller changed, therefore this document is
//     stale, therefore it reloads. `onNeedReload` is still passed, because it is
//     also an OVERRIDE — passing it suppresses the plugin's own
//     `window.location.reload()` — and it routes into the same idempotent handler.
//
// `updateServiceWorker()` in this mode posts SKIP_WAITING to the waiting worker
// and returns; it reloads nothing (that half of ADR-0181 §2 still holds). The
// SW answers that message only because `skipWaiting` is false — the generated
// worker calls `self.skipWaiting()` unconditionally when it is true and registers
// no listener at all, which is the silent trap ADR-0181 §3 warned about.
//
// Nothing here guards the outbox: a queued write lives in IndexedDB and the
// flush is FIFO and idempotent (ADR-0018), so a reload mid-flush re-sends and the
// server rejects the duplicate. What a reload really costs is unsaved UI — an
// open sheet, a focused field — and that is what `canReloadQuietly` asks about.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  SW_UPDATE_CHECK_MS,
  SW_UPDATE_IDLE_APPLY_MS,
  SW_UPDATE_NOTICE_AFTER_MS,
  SW_UPDATE_RECHECK_MS,
} from '../constants';
import { useHasOverlay } from '../state/nav-state';
import { isOffline } from './outbox';
import { getNow } from './useClock';
import { observeVisibility } from './visibility';

/** `waiting` — a new build is parked and this page is untouched by it.
 *  `swapped` — a new SW already controls this tab, so only a reload is correct. */
type SwapStage = 'none' | 'waiting' | 'swapped';

export interface AppUpdate {
  /** The banner's only cue: a swap this tab could not take quietly. */
  noticeVisible: boolean;
  /** Take the new build now. */
  reload: () => void;
  /** Put the notice away. The automatic path keeps trying underneath it. */
  dismiss: () => void;
}

/** Would a reload right now throw away something the user typed or opened? The
 *  page being hidden is not an exemption — an app switched away from mid-form is
 *  the most likely way to be mid-form. */
function isEditing(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

export function useAppUpdate(): AppUpdate {
  const [stage, setStage] = useState<SwapStage>('none');
  const [noticeDue, setNoticeDue] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const hasOverlay = useHasOverlay();
  // The plugin captures its callbacks once, on first render, so everything they
  // touch is a ref or a stable setter.
  const weAskedRef = useRef(false);
  const stageRef = useRef<SwapStage>('none');
  stageRef.current = stage;

  // Was this document already controlled when it loaded? If not, the first
  // `controllerchange` is `clientsClaim()` taking a brand-new install — the
  // opposite of a swap, and announcing it would greet every first visit with a
  // "new version" banner.
  const wasControlledRef = useRef(navigator.serviceWorker?.controller != null);
  const swappedRef = useRef(false);

  /** The controller changed: this document is now stale, whoever caused it. */
  const onSwapped = useCallback(() => {
    if (!wasControlledRef.current) {
      wasControlledRef.current = true;
      return;
    }
    if (swappedRef.current) return;
    swappedRef.current = true;
    // We asked for this swap and picked the moment; finish the job.
    if (weAskedRef.current) {
      window.location.reload();
      return;
    }
    // Somebody else's doing — another tab took the update, so this one is now
    // running orphaned JS. Urgent enough to say so, and still worth reloading
    // quietly the moment we can.
    setStage('swapped');
    setNoticeDue(true);
  }, []);

  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh: () => setStage('waiting'),
    onNeedReload: onSwapped,
    onRegisteredSW: (_swUrl, reg) => {
      setRegistration(reg);
      if (reg?.waiting) setStage('waiting');
    },
  });

  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;
    container.addEventListener('controllerchange', onSwapped);
    return () => container.removeEventListener('controllerchange', onSwapped);
  }, [onSwapped]);

  const reload = useCallback(() => {
    weAskedRef.current = true;
    if (stageRef.current === 'swapped') {
      window.location.reload();
      return;
    }
    // Resolves as soon as SKIP_WAITING is posted. The reload is `onSwapped`'s,
    // once the new worker has actually taken the tab.
    void updateServiceWorker();
  }, [updateServiceWorker]);

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

  // Every interaction, tracked from mount rather than from the moment an update
  // lands: `0` means this document has never been touched, which is the common
  // case after a deploy (the SW update check fires on navigation, so the new
  // build turns up seconds after the app opens) and the cheapest reload there is.
  const touchedAtRef = useRef(0);
  useEffect(() => {
    const mark = () => {
      touchedAtRef.current = getNow();
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', mark, opts);
    window.addEventListener('keydown', mark, opts);
    return () => {
      window.removeEventListener('pointerdown', mark, opts);
      window.removeEventListener('keydown', mark, opts);
    };
  }, []);

  useEffect(() => {
    if (stage === 'none') return;
    const pendingSince = getNow();

    const canReloadQuietly = () => !hasOverlay() && !isEditing();
    const isIdle = () => getNow() - touchedAtRef.current >= SW_UPDATE_IDLE_APPLY_MS;
    // Asked once and once only. If SKIP_WAITING goes unanswered the page is still
    // whole and still safe, so re-posting it every recheck buys nothing — the
    // notice below becomes the fallback, and the next cold load takes the build.
    const takeIt = () => {
      if (weAskedRef.current || !canReloadQuietly()) return;
      reload();
    };

    // The one moment worth an event of its own: hidden means nobody is looking,
    // and a backgrounded page is throttled hard enough that the poll below would
    // miss the window the OS gives it.
    const stopVisibility = observeVisibility({ onHidden: takeIt });

    // Everything else — never touched, put down for a while, or blocked by a
    // sheet that has since closed — is the same question re-asked slowly.
    const id = window.setInterval(() => {
      if (isIdle()) takeIt();
      if (getNow() - pendingSince >= SW_UPDATE_NOTICE_AFTER_MS) setNoticeDue(true);
    }, SW_UPDATE_RECHECK_MS);
    if (isIdle()) takeIt();

    return () => {
      stopVisibility();
      window.clearInterval(id);
    };
  }, [stage, reload, hasOverlay]);

  return {
    noticeVisible: noticeDue && !dismissed,
    reload,
    dismiss: useCallback(() => setDismissed(true), []),
  };
}
