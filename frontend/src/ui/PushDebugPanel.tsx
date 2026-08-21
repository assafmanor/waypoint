// The gesture that subscribes this device, and nothing more (ADR-0197 phase 1).
//
// **An instrument, not product UI** — the same register as `BuildBadge` and `NavDebugHud`:
// inline styles, Latin text, no token spend, no design-language grammar, gated behind
// `VITE_PUSH_DEBUG` so a production build ships nothing. The designed surface is phase 1b's
// (a Notifications row in `UserSettings`, with the per-category preferences and the honest
// iOS state), and it replaces this.
//
// **Why any UI at all in a phase that promised none.** The permission prompt must come from
// a user gesture — the platform's rule, not ours — so there is no way to register a device
// from a curl. The *send* is a backend route for the reason its own comment gives (push
// exists only in a production build, where `import.meta.env.DEV` is false), so this panel
// deliberately has no "send" button: it registers, and `POST /notifications/test` does the
// rest against any build, including a phone on staging.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../state/auth-state';
import {
  currentSubscription,
  PUSH_BLOCKER,
  pushBlocker,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type PushBlocker,
} from '../lib/push';

function panelEnabled(): boolean {
  const flag = import.meta.env.VITE_PUSH_DEBUG;
  return flag === '1' || flag === 'true';
}

/** Latin, and deliberately not in `i18n/he.ts` — an instrument spends no copy budget. The
 *  install line is the one that carries real information rather than a diagnosis. */
const BLOCKER_TEXT: Record<PushBlocker, string> = {
  [PUSH_BLOCKER.SERVER]: 'server has no VAPID keypair',
  [PUSH_BLOCKER.UNSUPPORTED]: 'no Push API in this browser',
  [PUSH_BLOCKER.NEEDS_INSTALL]:
    'add to home screen first (iOS delivers push only to an installed PWA)',
  [PUSH_BLOCKER.DENIED]: 'permission denied — only recoverable in browser settings',
};

const BOX: React.CSSProperties = {
  border: '1px solid rgba(128,128,128,0.4)',
  borderRadius: 8,
  padding: 12,
  margin: '16px 0',
  font: '12px/1.5 monospace',
  direction: 'ltr',
  textAlign: 'left',
};

export function PushDebugPanel() {
  const { me } = useAuth();
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const subscription = await currentSubscription();
    setEndpoint(subscription?.endpoint ?? null);
  }, []);

  useEffect(() => {
    if (!panelEnabled()) return;
    void refresh();
  }, [refresh]);

  if (!panelEnabled()) return null;

  const vapidPublicKey = me?.push?.vapidPublicKey ?? null;
  const blocker = pushBlocker(vapidPublicKey);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return (
    <section style={BOX}>
      <div>
        <strong>push (VITE_PUSH_DEBUG)</strong>
      </div>
      <div>permission: {typeof Notification === 'undefined' ? 'n/a' : Notification.permission}</div>
      <div>server key: {vapidPublicKey ? 'present' : 'absent'}</div>
      <div>subscribed: {endpoint ? 'yes' : 'no'}</div>
      {/* The endpoint identifies the device to the push service and is a bearer capability;
          shown here because reading it is how you confirm the row the backend stored is
          this device, and this panel only exists in a build that asked for it. */}
      {endpoint ? <div style={{ wordBreak: 'break-all' }}>{endpoint}</div> : null}
      {blocker ? <div>blocked: {BLOCKER_TEXT[blocker]}</div> : null}
      {error ? <div>error: {error}</div> : null}
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={busy || blocker !== null || endpoint !== null || !vapidPublicKey}
          onClick={() => void run(() => subscribeThisDevice(vapidPublicKey!))}
        >
          subscribe this device
        </button>
        <button
          type="button"
          disabled={busy || endpoint === null}
          onClick={() => void run(unsubscribeThisDevice)}
        >
          unsubscribe
        </button>
      </div>
      <div style={{ marginTop: 8, opacity: 0.7 }}>
        then: POST /notifications/test (DEV_AUTH only)
      </div>
    </section>
  );
}
