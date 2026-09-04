// The device's side of Web Push (ADR-0197 §2/§7): can this device be reached, is it
// registered, and the two verbs that change that.
//
// Everything here is about the DEVICE. The category preferences ADR-0198 §6 puts on `User`
// are account state and are not this module's business — a subscription is per device, a
// preference follows the person, and keeping them apart is what makes a new phone work
// without re-choosing anything.
import { deletePushSubscription, registerPushSubscription } from './api';
// Both were private HERE first, because push needed them before anything else did.
// They moved to `lib/install.ts` when the install offer became the second consumer
// (ADR-0204 §7 / rule 8): the second caller generalises the one-off, it does not copy it.
import { isInstalled, isWebKit } from './install';

/**
 * **The id of THIS device's subscription row**, so the settings list can mark which row is
 * the one you are looking at.
 *
 * Local because that is the only place it can live: the server cannot tell which device a
 * request came from, and the alternative — comparing endpoints — would mean shipping a bearer
 * capability in a list response (ADR-0197 §2). So the id comes back from `POST` and is kept
 * here, and the list carries no endpoint at all.
 *
 * `waypoint:*` like every other key in this app (root `CLAUDE.md`: these keys ARE the local
 * cache and are not renamed). Losing it is harmless — the list simply marks no row as this
 * one, which is the same thing it does on a device that never subscribed.
 */
const SUBSCRIPTION_ID_KEY = 'waypoint:push:subscription-id';

/** The stored id, or `null`. Never throws: private-mode storage rejects a read. */
export function thisDeviceSubscriptionId(): string | null {
  try {
    return localStorage.getItem(SUBSCRIPTION_ID_KEY);
  } catch {
    return null;
  }
}

function rememberSubscriptionId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(SUBSCRIPTION_ID_KEY);
    else localStorage.setItem(SUBSCRIPTION_ID_KEY, id);
  } catch {
    /* A device that cannot store this still subscribes; only the mark is lost. */
  }
}

/**
 * Why this device cannot be subscribed, or `null` when it can.
 *
 * A closed set rather than a boolean, because **the four reasons need four different
 * sentences** and one of them is not a refusal at all but an instruction (ADR-0197 §7: the
 * iOS hole is stated in the UI, not discovered in a field report).
 */
export const PUSH_BLOCKER = {
  /** The browser has no Push API at all. On an Apple browser this usually means the app is
   *  in a tab rather than on the home screen — see `needsInstall`. */
  UNSUPPORTED: 'unsupported',
  /** Safari 16.4+ delivers Web Push only to an INSTALLED PWA. This is the one blocker with
   *  a cure the user can perform, so it is a separate member from `unsupported`. */
  NEEDS_INSTALL: 'needsInstall',
  /** The user said no. Not recoverable in-app on any platform — only in browser settings —
   *  which is the whole reason §7 never asks on load. */
  DENIED: 'denied',
  /** This server holds no VAPID keypair, so nothing could be sent even if we subscribed.
   *  A capability of the deployment, not of the device. */
  SERVER: 'server',
} as const;
export type PushBlocker = (typeof PUSH_BLOCKER)[keyof typeof PUSH_BLOCKER];

/**
 * Can this device be subscribed, and if not, why.
 *
 * `vapidPublicKey` comes from `/me` (ADR-0197 §7), so the server's own capability is part
 * of the same answer rather than a second thing a caller has to remember to check.
 */
export function pushBlocker(vapidPublicKey: string | null | undefined): PushBlocker | null {
  if (!vapidPublicKey) return PUSH_BLOCKER.SERVER;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // The order matters: on an un-installed iOS tab there is no `PushManager`, and telling
    // that user "unsupported" would be false — the cure is one gesture away.
    return isWebKit() && !isInstalled() ? PUSH_BLOCKER.NEEDS_INSTALL : PUSH_BLOCKER.UNSUPPORTED;
  }
  if (Notification.permission === 'denied') return PUSH_BLOCKER.DENIED;
  return null;
}

/**
 * **Has this install already been asked, at the second door?**
 *
 * ADR-0197 §7's second place to ask is "immediately after a first deadline is set on a task —
 * once per install, dismissible, never re-asked", and this key is the "once per install"
 * half. Set by taking the offer OR by dismissing it: both are answers, and re-asking somebody
 * who said no is how a prompt becomes a nag.
 *
 * Deliberately **not** on `User`: it is about a device's install, and the same person on a new
 * phone should be offered it again — which is the mirror image of why the category
 * preferences ARE on `User`.
 */
const ASKED_KEY = 'waypoint:push:asked';

export function pushAskAnswered(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) !== null;
  } catch {
    // Storage refused (a private window). Treat it as answered: the settings surface is
    // always available, and a prompt that cannot remember a "no" must not be shown.
    return true;
  }
}

export function markPushAskAnswered(): void {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* Nothing to do — see above. */
  }
}

/** The existing subscription for this device, or `null`. Never throws: a caller asking
 *  "am I registered" while the worker is still installing should get an answer, not a
 *  rejection. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** base64url → the `Uint8Array` `subscribe()` demands. The API predates `BufferSource`
 *  accepting a string, so every Web Push client on earth carries this function.
 *
 *  Built over an explicit `ArrayBuffer` rather than through `Uint8Array.from`, and that is
 *  not style: since TypeScript 5.7 the typed arrays are generic in their backing buffer, so
 *  `from` yields `Uint8Array<ArrayBufferLike>` — which `BufferSource` rejects, because a
 *  `SharedArrayBuffer` cannot be one. Naming the buffer is what makes the type exact. */
function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The subscription's two keys, base64url, as the server stores them. `getKey` hands back
 *  raw bytes; `PushSubscription.toJSON()` would encode them for us but its `keys` member is
 *  typed as an optional record of strings, so this reads the bytes and encodes them itself
 *  rather than asserting on a shape the DOM lib will not promise. */
function encodedKeys(subscription: PushSubscription): { p256dh: string; auth: string } | null {
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!p256dh || !auth) return null;
  return { p256dh: base64Url(p256dh), auth: base64Url(auth) };
}

function base64Url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Subscribe this device and register it with the server.
 *
 * **Must be called from a user gesture** — that is the platform's rule for the permission
 * prompt, not ours (ADR-0197 §7). Throws on refusal or failure, so a caller can report it;
 * the one thing it will not do is leave the device subscribed to a push service the server
 * does not know about, because the local subscription is rolled back if the registration
 * call fails.
 */
export async function subscribeThisDevice(vapidPublicKey: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  // **A subscription made against a DIFFERENT server key is not reusable**, and reusing it
  // fails silently: the push service still answers, our sends are signed with a key it will
  // not accept for that endpoint, and every one of them is rejected with the switch reading
  // on. So a mismatch is dropped and re-made here rather than carried forward.
  const reusable = existing && keyMatches(existing, vapidPublicKey) !== false ? existing : null;
  if (existing && !reusable) {
    await existing.unsubscribe().catch(() => {});
    rememberSubscriptionId(null);
  }
  const subscription =
    reusable ??
    (await registration.pushManager.subscribe({
      // Required, and required to be true: a subscription that could send a silent push is
      // one Chrome refuses to create. It is also what the worker's always-show rule honours.
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(vapidPublicKey),
    }));

  const keys = encodedKeys(subscription);
  if (!keys) {
    await subscription.unsubscribe().catch(() => {});
    throw new Error('push subscription carried no keys');
  }

  try {
    await register(subscription, keys);
  } catch (error) {
    // **The rollback is the point.** A device subscribed at the push service but unknown to
    // the server is a permission spent for nothing, and the next attempt would find an
    // existing subscription and skip straight past `subscribe()` — so it would stay broken.
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
}

/** Tell the server about this device, and keep the row id it answers with. Its own function
 *  because the reconcile below needs exactly this half and none of the gesture around it. */
async function register(
  subscription: PushSubscription,
  keys: { p256dh: string; auth: string },
): Promise<void> {
  const { id } = await registerPushSubscription({
    endpoint: subscription.endpoint,
    ...keys,
    userAgent: navigator.userAgent,
  });
  rememberSubscriptionId(id);
}

/**
 * base64url as the server spells it, so two keys can be compared as strings. A VAPID public
 * key travels unpadded, but a caller pasting one from elsewhere may pad it.
 */
const normaliseKey = (key: string): string =>
  key.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Was this subscription created against the key the server signs with **today**?
 *
 * `null` where the browser will not say — `options.applicationServerKey` is absent on some
 * older engines — and every caller reads that as *leave it alone*. Dropping a subscription
 * that is probably working because we could not read its key is a worse failure than the one
 * this detects.
 */
function keyMatches(subscription: PushSubscription | null, vapidPublicKey: string): boolean | null {
  const key = subscription?.options?.applicationServerKey;
  if (!key) return null;
  return base64Url(key) === normaliseKey(vapidPublicKey);
}

/**
 * **Make the server's picture of this device match the device**, once per signed-in start.
 *
 * ── THE FAILURE IT EXISTS FOR ─────────────────────────────────────────────────────────────
 *
 * The settings switch reads one thing only: does this browser hold a subscription. The
 * SERVER's row is a second fact, and the two drift apart in ways nobody can see from the
 * phone — the push service reports an endpoint gone and the server prunes the row (ADR-0197
 * §10, a subscription's *normal* death), another device revokes this one from the device
 * list, the endpoint rotates. In every case the switch still reads on, no notification ever
 * arrives again, and the app offers nothing to press. That is the state one phone was in
 * while a second phone on the same trip received every send (owner, 2026-09-04).
 *
 * ── AND WHY IT RE-POSTS RATHER THAN CHECKING FIRST ────────────────────────────────────────
 *
 * There is deliberately no route that answers "do you know this endpoint" — an endpoint is a
 * bearer capability and never appears in a list response (ADR-0197 §2), and the device list
 * carries ids, which say nothing about an endpoint that has since rotated. `POST` is already
 * an idempotent upsert keyed on the endpoint, so the cheapest honest reconcile is to send it:
 * one small request per app start, and it repairs every one of the cases above (including a
 * phone handed to a different signed-in user, which is the update half's own reason).
 *
 * **Never throws and never asks for anything.** It runs at boot, so a failure is worth
 * exactly one retry on the next start, and it must not put a permission prompt anywhere
 * near a screen the person did not open.
 */
export async function reconcileThisDevice(
  vapidPublicKey: string | null | undefined,
): Promise<void> {
  if (!vapidPublicKey) return;
  try {
    const subscription = await currentSubscription();
    // Nothing registered here. The switch says so honestly, and asking would need a gesture.
    if (!subscription) return;

    if (keyMatches(subscription, vapidPublicKey) === false) {
      await subscription.unsubscribe().catch(() => {});
      rememberSubscriptionId(null);
      // Permission already granted needs no gesture, so the repair is invisible. Without it
      // the switch now reads OFF — which is at least true, and one tap from working.
      if (Notification.permission === 'granted') await subscribeThisDevice(vapidPublicKey);
      return;
    }

    const keys = encodedKeys(subscription);
    if (keys) await register(subscription, keys);
  } catch {
    /* Next start tries again. A boot path owes the app nothing here. */
  }
}

/**
 * Unsubscribe this device, locally and on the server.
 *
 * **Both halves, and the local one is not optional** (ADR-0197 §2.3). This also runs on
 * sign-out, where the server call may well fail because the session is already gone — that
 * is why the local `unsubscribe()` happens regardless and the server call is best-effort:
 * a phone handed to somebody else must stop waking with the previous person's deadlines,
 * and the server prunes its own row when the push service later reports it gone.
 */
export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {});
  await deletePushSubscription(endpoint).catch(() => {});
  // The row is gone, so the id names nothing. Cleared last, so a failed server call does not
  // lose the one handle a retry could use.
  rememberSubscriptionId(null);
}
