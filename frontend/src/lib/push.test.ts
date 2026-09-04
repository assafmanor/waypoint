// @vitest-environment jsdom
//
// `lib/push.ts` reads `navigator.serviceWorker`, `window.PushManager`, `matchMedia` and
// `Notification.permission`, so it needs a DOM — and each of those absences is itself one of
// the cases under test, which is why the harness builds the surface per test rather than
// relying on what jsdom happens to provide.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PUSH_BLOCKER,
  pushBlocker,
  reconcileThisDevice,
  subscribeThisDevice,
  thisDeviceSubscriptionId,
  unsubscribeThisDevice,
} from './push';
import { deletePushSubscription, registerPushSubscription } from './api';

// Both resolve by default. A bare `vi.fn()` answers `undefined`, and
// `unsubscribeThisDevice` calls `.catch()` on what it gets back — so a mock with no
// resolved value fails the spec for a reason that is only about the mock.
vi.mock('./api', () => ({
  // Resolves the row id, which is what the server returns and what `subscribeThisDevice`
  // stores so the settings list can mark "this device" without an endpoint (ADR-0197 §2).
  registerPushSubscription: vi.fn().mockResolvedValue({ id: 'sub-1' }),
  deletePushSubscription: vi.fn().mockResolvedValue(undefined),
}));

const VAPID =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkTPqLuXBLQxqSCXfQ0nnBIIiFuVBpEyIrxJEMHWQwWrGRKgTGCXOo0';

/** A second keypair's public half — what a rotated server key looks like from the device. */
const OTHER_VAPID =
  'BKagOny0KF_2pCJQ3m-qBrPGWTNfXCkR6QGVvj9OTvJ3aQ2z1oFcQ5CkkoTLcVn0hGVDrfSJ7hLZm4RlNb0Xk1M';

/** The browser surface `push.ts` reads, assembled per test — a jsdom `navigator` has no
 *  `serviceWorker` and no `PushManager`, which is itself one of the cases under test. */
function install(options: {
  serviceWorker?: boolean;
  pushManager?: boolean;
  standalone?: boolean;
  displayMode?: boolean;
  permission?: NotificationPermission;
  subscription?: unknown;
  subscribe?: () => unknown;
}) {
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(options.subscription ?? null),
      subscribe: vi.fn(async () => options.subscribe?.()),
    },
  };
  if (options.serviceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve(registration) },
      configurable: true,
    });
  } else {
    // `delete` on a defined property needs the descriptor to be configurable, which the
    // branch above guarantees; a jsdom navigator simply has none to begin with.
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
  if (options.pushManager) {
    (window as unknown as { PushManager?: unknown }).PushManager = class {};
  } else {
    Reflect.deleteProperty(window as unknown as object, 'PushManager');
  }
  if (options.standalone !== undefined) {
    Object.defineProperty(navigator, 'standalone', {
      value: options.standalone,
      configurable: true,
    });
  } else {
    Reflect.deleteProperty(navigator, 'standalone');
  }
  // `vi.stubGlobal`, not `spyOn`: jsdom implements no `matchMedia` at all, so there is no
  // function to spy on — the same reason `theme.test.ts` stubs it.
  vi.stubGlobal('matchMedia', () => ({ matches: options.displayMode ?? false }));
  (globalThis as unknown as { Notification: unknown }).Notification = {
    permission: options.permission ?? 'default',
  };
  return registration;
}

/** A `PushSubscription` as far as this module reads one. `getKey` hands back raw bytes.
 *
 *  `options` is absent by default, which is one of the cases under test: a browser that will
 *  not say which server key a subscription was made with must not have it dropped. Pass
 *  `serverKey` to get the `options.applicationServerKey` a real Chrome carries. */
function fakeSubscription(endpoint = 'https://push.example/abc', serverKey?: string) {
  return {
    endpoint,
    getKey: (name: string) =>
      name === 'p256dh' ? new Uint8Array([1, 2, 3]).buffer : new Uint8Array([4, 5]).buffer,
    unsubscribe: vi.fn().mockResolvedValue(true),
    ...(serverKey === undefined ? {} : { options: { applicationServerKey: decodeKey(serverKey) } }),
  };
}

/** base64url → the raw bytes a `PushSubscription.options` holds. */
function decodeKey(base64Url: string): ArrayBuffer {
  const binary = atob(base64Url.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('pushBlocker', () => {
  it('blames the SERVER when it holds no keypair, before looking at the device', () => {
    // Order matters: a device that could subscribe is still not reachable, and telling the
    // user to install the app would be a lie about whose problem it is.
    install({ serviceWorker: true, pushManager: true });
    expect(pushBlocker(null)).toBe(PUSH_BLOCKER.SERVER);
    expect(pushBlocker(undefined)).toBe(PUSH_BLOCKER.SERVER);
  });

  it('answers null when the device and the server can both do it', () => {
    install({ serviceWorker: true, pushManager: true });
    expect(pushBlocker(VAPID)).toBeNull();
  });

  // The iOS hole, which ADR-0197 §7 requires be STATED rather than discovered in the field.
  it('asks an un-installed WebKit tab to install, not "unsupported"', () => {
    install({ serviceWorker: true, pushManager: false, standalone: false });
    expect(pushBlocker(VAPID)).toBe(PUSH_BLOCKER.NEEDS_INSTALL);
  });

  it('does not ask a WebKit HOME-SCREEN app to install', () => {
    // Installed but still no PushManager — an iOS older than 16.4. Telling that user to add
    // it to the home screen is advice they have already taken.
    install({ serviceWorker: true, pushManager: false, standalone: true });
    expect(pushBlocker(VAPID)).toBe(PUSH_BLOCKER.UNSUPPORTED);
  });

  it('recognises an installed PWA by display-mode where standalone is absent', () => {
    install({ serviceWorker: true, pushManager: false, displayMode: true });
    expect(pushBlocker(VAPID)).toBe(PUSH_BLOCKER.UNSUPPORTED);
  });

  it('says unsupported for a non-WebKit browser with no Push API', () => {
    install({ serviceWorker: true, pushManager: false });
    expect(pushBlocker(VAPID)).toBe(PUSH_BLOCKER.UNSUPPORTED);
  });

  it('reports a denial, which no gesture can undo', () => {
    install({ serviceWorker: true, pushManager: true, permission: 'denied' });
    expect(pushBlocker(VAPID)).toBe(PUSH_BLOCKER.DENIED);
  });
});

describe('subscribeThisDevice', () => {
  it('registers a new subscription with the server', async () => {
    const subscription = fakeSubscription();
    install({ serviceWorker: true, pushManager: true, subscribe: () => subscription });

    await subscribeThisDevice(VAPID);

    // The id the server handed back is kept, because it is the only thing that can mark
    // "this device" in the settings list — the endpoint is a bearer capability and never
    // appears in a list response (ADR-0197 §2).
    expect(thisDeviceSubscriptionId()).toBe('sub-1');
    expect(registerPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://push.example/abc',
        // base64url of [1,2,3] and [4,5]: no `+`, `/` or `=` may survive the encoding.
        p256dh: 'AQID',
        auth: 'BAU',
      }),
    );
  });

  it('reuses an existing subscription rather than asking for permission again', async () => {
    const subscription = fakeSubscription();
    const registration = install({
      serviceWorker: true,
      pushManager: true,
      subscription,
    });

    await subscribeThisDevice(VAPID);

    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(registerPushSubscription).toHaveBeenCalledOnce();
  });

  // The rollback, and it is the assertion this file exists for. Without it, a device is
  // subscribed at the push service and unknown to the server — and the next attempt finds
  // the existing subscription, skips `subscribe()`, and stays broken forever.
  it('unsubscribes locally when the server registration fails', async () => {
    const subscription = fakeSubscription();
    install({ serviceWorker: true, pushManager: true, subscribe: () => subscription });
    vi.mocked(registerPushSubscription).mockRejectedValueOnce(new Error('500'));

    await expect(subscribeThisDevice(VAPID)).rejects.toThrow('500');
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('rolls back and refuses a subscription that carries no keys', async () => {
    const subscription = { ...fakeSubscription(), getKey: () => null };
    install({ serviceWorker: true, pushManager: true, subscribe: () => subscription });

    await expect(subscribeThisDevice(VAPID)).rejects.toThrow(/no keys/);
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(registerPushSubscription).not.toHaveBeenCalled();
  });
});

describe('unsubscribeThisDevice', () => {
  it('drops the device locally AND on the server', async () => {
    const subscription = fakeSubscription('https://push.example/xyz');
    install({ serviceWorker: true, pushManager: true, subscription });

    await unsubscribeThisDevice();

    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(deletePushSubscription).toHaveBeenCalledWith('https://push.example/xyz');
  });

  // The sign-out-after-session-loss path (ADR-0197 §2.3): the server call cannot work, and
  // the local half must happen anyway or the phone keeps receiving.
  it('still unsubscribes locally when the server call fails', async () => {
    const subscription = fakeSubscription();
    install({ serviceWorker: true, pushManager: true, subscription });
    vi.mocked(deletePushSubscription).mockRejectedValueOnce(new Error('401'));

    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('forgets the stored id, so the settings list stops marking a row that is gone', async () => {
    const subscription = fakeSubscription();
    install({ serviceWorker: true, pushManager: true, subscription });
    await subscribeThisDevice(VAPID);
    expect(thisDeviceSubscriptionId()).toBe('sub-1');

    await unsubscribeThisDevice();

    expect(thisDeviceSubscriptionId()).toBeNull();
  });

  it('is a no-op with nothing subscribed', async () => {
    install({ serviceWorker: true, pushManager: true });
    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
    expect(deletePushSubscription).not.toHaveBeenCalled();
  });

  it('does not throw where there is no service worker at all', async () => {
    install({});
    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
  });
});

/**
 * **The repair for the failure nobody on the phone can see** (owner, 2026-09-04: one phone
 * silent while a second phone on the same trip received every send).
 *
 * The switch reads the BROWSER's subscription; whether the server still holds a row for it is
 * a second fact, and it goes missing on its own — pruned when a push service reports the
 * endpoint gone (ADR-0197 §10), revoked from another device's list, rotated.
 */
describe('reconcileThisDevice', () => {
  it('re-posts this device, so a row the server no longer holds comes back', async () => {
    const subscription = fakeSubscription('https://push.example/live');
    install({ serviceWorker: true, pushManager: true, subscription, permission: 'granted' });

    await reconcileThisDevice(VAPID);

    expect(registerPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/live' }),
    );
    // And the row id comes back with it, so the settings list can mark this device again.
    expect(thisDeviceSubscriptionId()).toBe('sub-1');
    // The working subscription is NOT touched: it is the one thing here that cannot be
    // remade without a gesture.
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('drops a subscription made against a different server key, and re-makes it', async () => {
    // The silent rejection: the endpoint is alive, our sends are signed with a key the push
    // service will not accept for it, and the switch reads on through every failure.
    const stale = fakeSubscription('https://push.example/stale', OTHER_VAPID);
    const fresh = fakeSubscription('https://push.example/fresh', VAPID);
    install({
      serviceWorker: true,
      pushManager: true,
      subscription: stale,
      subscribe: () => fresh,
      permission: 'granted',
    });

    await reconcileThisDevice(VAPID);

    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(registerPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/fresh' }),
    );
  });

  // **The positive control, and it is the one that matters most here.** A key comparison
  // that answered "different" for the key actually in use would drop every subscribed
  // device on its next start — a repair that breaks what it was meant to fix.
  it('keeps a subscription made against the key in use', async () => {
    const subscription = fakeSubscription('https://push.example/ok', VAPID);
    install({ serviceWorker: true, pushManager: true, subscription, permission: 'granted' });

    await reconcileThisDevice(VAPID);

    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(registerPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/ok' }),
    );
  });

  it('does not re-make it where a gesture would be needed', async () => {
    // Permission not granted: `subscribe()` would prompt, and a boot path must never put a
    // permission prompt in front of somebody. The switch then reads off, which is true.
    const stale = fakeSubscription('https://push.example/stale', OTHER_VAPID);
    install({ serviceWorker: true, pushManager: true, subscription: stale, permission: 'default' });

    await reconcileThisDevice(VAPID);

    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(registerPushSubscription).not.toHaveBeenCalled();
  });

  it('leaves a subscription alone when the browser will not say which key made it', async () => {
    // `options.applicationServerKey` is absent on some engines. Dropping a probably-working
    // subscription over an unreadable field is a worse bug than the one being detected.
    const subscription = fakeSubscription();
    install({ serviceWorker: true, pushManager: true, subscription, permission: 'granted' });

    await reconcileThisDevice(VAPID);

    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(registerPushSubscription).toHaveBeenCalledOnce();
  });

  it('does nothing where there is nothing to reconcile', async () => {
    install({ serviceWorker: true, pushManager: true });
    await reconcileThisDevice(VAPID);
    // No server keypair is a property of the deployment, not of this device.
    install({ serviceWorker: true, pushManager: true, subscription: fakeSubscription() });
    await reconcileThisDevice(null);

    expect(registerPushSubscription).not.toHaveBeenCalled();
  });

  it('never throws — it runs at boot, and the next start tries again', async () => {
    install({
      serviceWorker: true,
      pushManager: true,
      subscription: fakeSubscription(),
      permission: 'granted',
    });
    vi.mocked(registerPushSubscription).mockRejectedValueOnce(new Error('500'));

    await expect(reconcileThisDevice(VAPID)).resolves.toBeUndefined();
  });
});
