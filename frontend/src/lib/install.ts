// The device's side of "put this on your home screen" (ADR-0204).
//
// Everything here is about THIS DEVICE and THIS INSTALL, which is why every piece of state
// it keeps lives in `localStorage` rather than on `User`: the same person on a new phone is
// a new install and should be offered it again. That is the mirror of why the notification
// CATEGORY preferences are account state (ADR-0198 §6) and the push ASK is not.
//
// `isInstalled` and `isWebKit` arrived here from `lib/push.ts`, where they were private
// because push needed them first — Safari delivers Web Push only to an installed PWA. Root
// `CLAUDE.md` rule 8: the second consumer generalises the one-off rather than copying it.
// `push.ts` imports them back.
import { INSTALL_ASK_BUDGET, INSTALL_ASK_GAP_MS } from '../constants';

/**
 * **Whether the app is running as an installed PWA.**
 *
 * Two checks because the platforms differ: `display-mode: standalone` is the standard, and
 * `navigator.standalone` is WebKit's older answer — the one that reports correctly on an
 * iPhone home-screen app. Dropping either one is how this question gets answered wrongly on
 * exactly the platform that most needs the offer.
 */
export function isInstalled(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * **Apple's engine**, which is what makes the share-sheet gesture the only way in.
 *
 * Deliberately a capability sniff rather than a UA string: every iOS browser is WebKit, so
 * what matters is the engine, and `standalone` on `navigator` is a WebKit-only property.
 */
export function isWebKit(): boolean {
  return 'standalone' in navigator;
}

/**
 * **How this device can install, if it can.** A closed set rather than a boolean, because
 * the four answers need four different surfaces and one of them is not an offer at all but
 * an instruction to leave (ADR-0204 §4).
 */
export const INSTALL_PATH = {
  /** Already on the home screen. Nothing is ever offered, anywhere. */
  INSTALLED: 'installed',
  /** The browser handed us a `beforeinstallprompt` we can fire from a gesture: one tap,
   *  a real install. Chrome, Edge, and the other Chromium browsers. */
  PROMPT: 'prompt',
  /** WebKit in a tab. There is no API at all, so the surface TEACHES the share-sheet
   *  gesture and its button cannot pretend to install. */
  TEACH: 'teach',
  /** A chat or social app's embedded browser. Installing is impossible from here on every
   *  platform, so the only useful move is to leave for a real browser — see `isInAppBrowser`
   *  for why this is the COMMON first open of an invite-only app, not an edge case. */
  IN_APP: 'inApp',
  /** No path we know of — a desktop browser with no prompt, a locked-down webview. Say
   *  nothing rather than teaching a gesture that does not exist here. */
  NONE: 'none',
} as const;
export type InstallPath = (typeof INSTALL_PATH)[keyof typeof INSTALL_PATH];

/**
 * **The one UA sniff in this module, and it is a sniff because no capability exposes it.**
 *
 * There is no API that answers "am I inside someone else's webview". The engine is the same,
 * the DOM is the same, and the only difference is the chrome around it — which is precisely
 * what a page cannot see. So this reads the markers the big chat apps append to their UA.
 *
 * **Why it earns its place** rather than being dropped as unreliable: joins here are
 * link-only (ADR-0030), invite links travel in chats, and a chat opens them in its own
 * webview — where the share sheet has no "add to home screen" at all. Without this branch
 * the most common first open of the app gets an instruction it cannot follow.
 *
 * **And the failure mode is safe in both directions.** A miss falls through to `TEACH` or
 * `PROMPT`, which is what we would have shown anyway; a false positive offers "open in your
 * browser", which is never wrong advice. Kept deliberately short — every entry is a real
 * marker, and the list is not a place to guess.
 */
const IN_APP_MARKERS = ['FBAN', 'FBAV', 'FB_IAB', 'Instagram', 'Line/', 'Twitter', 'WhatsApp'];

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return IN_APP_MARKERS.some((marker) => ua.includes(marker));
}

/**
 * **What this device's install surface should say.**
 *
 * Order matters and each step is load-bearing. Installed wins over everything, because an
 * installed app must never be offered an install. The captured prompt comes next, because a
 * device that HAS one should get the one-tap path even if it also matches something below.
 * The in-app check precedes the WebKit one, because an iOS chat webview is WebKit and would
 * otherwise be taught a gesture its chrome does not offer.
 */
export function installPath(): InstallPath {
  if (isInstalled()) return INSTALL_PATH.INSTALLED;
  if (deferredPrompt) return INSTALL_PATH.PROMPT;
  if (isInAppBrowser()) return INSTALL_PATH.IN_APP;
  if (isWebKit()) return INSTALL_PATH.TEACH;
  return INSTALL_PATH.NONE;
}

/** Is there any surface worth showing at all? `INSTALLED` and `NONE` are the two answers
 *  that mean "say nothing", and every caller asks the same question. */
export function canOfferInstall(path: InstallPath = installPath()): boolean {
  return path !== INSTALL_PATH.INSTALLED && path !== INSTALL_PATH.NONE;
}

/* ──────────────────────────────────────────────────────────────────────────────────────
   THE CAPTURED PROMPT

   `beforeinstallprompt` fires once, early, and is gone if it is not caught — which is the
   whole reason capture starts at app root on first load rather than when a surface opens.
   Preventing its default suppresses Chrome's own mini-infobar, so the app decides the
   moment instead of the browser (which is the entire point of ADR-0204).
   ────────────────────────────────────────────────────────────────────────────────────── */

/** Not in TypeScript's DOM lib — it is a Chromium extension to the platform, so the shape
 *  is declared here rather than asserted at the call site. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** Listeners that want to re-render when the prompt arrives or is spent. A set rather than
 *  a single callback because both the banner and the settings row can be mounted at once. */
const watchers = new Set<() => void>();

function notifyWatchers(): void {
  for (const watcher of watchers) watcher();
}

/**
 * Start capturing. Returns its own teardown, and is safe to call more than once — the app
 * calls it once at root, and the unit suite calls it per test.
 *
 * `appinstalled` is listened for as well, because an install that happens through the
 * browser's OWN menu must retire our offer just as surely as one through our button: the
 * prompt is spent either way, and a surface still offering it would be lying.
 */
export function startInstallCapture(): () => void {
  const onBeforePrompt = (event: Event) => {
    // Suppress Chrome's mini-infobar. Without this the browser picks the moment and the
    // app's whole ask policy (ADR-0204 §5) is decoration.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyWatchers();
  };
  const onInstalled = () => {
    deferredPrompt = null;
    notifyWatchers();
  };
  window.addEventListener('beforeinstallprompt', onBeforePrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforePrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Subscribe to "the install path may have changed". Returns its own unsubscribe. */
export function watchInstallPath(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

/**
 * Fire the captured prompt. **Must be called from a user gesture** — that is the platform's
 * rule, not ours, and the same rule `subscribeThisDevice` carries.
 *
 * The event is single-use: whatever the outcome, it is dropped, because a second `prompt()`
 * on a spent event rejects. `'unavailable'` rather than a throw when there is nothing to
 * fire, so a caller racing a capture that never happened gets an answer instead of an error.
 */
export async function fireInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  deferredPrompt = null;
  notifyWatchers();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    // A prompt the browser refused to show is not an accepted one, and it is not an error
    // the user can do anything about either.
    return 'dismissed';
  }
}

/** Test seam only — the unit suite has no real `beforeinstallprompt` to dispatch a typed
 *  event for. Not exported from anywhere the app imports. */
export function __setDeferredPromptForTest(event: BeforeInstallPromptEvent | null): void {
  deferredPrompt = event;
  notifyWatchers();
}

/* ──────────────────────────────────────────────────────────────────────────────────────
   THE ASK BUDGET (ADR-0204 §5)

   One key, the same shape as the existing `waypoint:push:asked`. What differs from push is
   deliberate and is the whole §5: there, one "no" is final, because a refused notification
   permission is not recoverable in-app on any platform. An install refusal IS recoverable,
   and installing gets MORE worth doing as departure nears — so here a "no" is a snooze, and
   the budget is what stops a snooze becoming a nag.
   ────────────────────────────────────────────────────────────────────────────────────── */

/** `waypoint:*` like every other key in this app (root `CLAUDE.md`: these keys ARE the
 *  local cache and are not renamed). */
const ASKED_KEY = 'waypoint:install:asked';

export interface InstallAskRecord {
  /** How many times this install has been asked, unprompted. */
  count: number;
  /** When the last ask was answered, epoch ms. `0` when never. */
  at: number;
}

const NEVER: InstallAskRecord = { count: 0, at: 0 };

/**
 * What this install has been asked so far. **Never throws** — a private window rejects the
 * read — and never returns a partial record: a value that fails to parse is treated as
 * `NEVER` rather than as `NaN`, which would otherwise sail through every comparison below
 * and make the budget unenforceable.
 */
export function installAskRecord(): InstallAskRecord {
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    if (!raw) return NEVER;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return NEVER;
    const { count, at } = parsed as Partial<InstallAskRecord>;
    if (!Number.isFinite(count) || !Number.isFinite(at)) return NEVER;
    return { count: Number(count), at: Number(at) };
  } catch {
    return NEVER;
  }
}

/** Record an answer. **Both buttons are answers** — taking the offer and dismissing it —
 *  exactly as in `PushAskBanner`, because re-asking somebody who said no is how a prompt
 *  becomes a nag. */
export function markInstallAsked(now: number): void {
  const { count } = installAskRecord();
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify({ count: count + 1, at: now }));
  } catch {
    /* Storage refused. See `installAskAllowed` for why that means "never ask". */
  }
}

/** One unprompted ask per run of the app, whatever else is true. Module-level rather than
 *  stored: it is about this session, and a session does not outlive the module. */
let askedThisSession = false;

/** Called when an ask is actually shown, so the session cap is spent by the SHOWING and not
 *  by the answering — a banner the user scrolls past has still been asked. */
export function markAskedThisSession(): void {
  askedThisSession = true;
}

export function __resetSessionForTest(): void {
  askedThisSession = false;
}

/**
 * **May the app speak unprompted right now?**
 *
 * Everything §5 lists that this module can know. What it deliberately does NOT know is
 * whether an overlay is open or a field is being typed in — those are React state, and the
 * component asks them with the same `useHasOverlay()` + `isEditingField()` pair
 * `useAppUpdate` already asks before it swaps a build.
 */
export function installAskAllowed(now: number): boolean {
  if (askedThisSession) return false;
  if (!canOfferInstall()) return false;
  let record: InstallAskRecord;
  try {
    // A storage that cannot remember a "no" must not be allowed to ask: the read below
    // returns `NEVER` on refusal, which would make every session the first one.
    localStorage.setItem(ASKED_KEY, localStorage.getItem(ASKED_KEY) ?? JSON.stringify(NEVER));
    record = installAskRecord();
  } catch {
    return false;
  }
  if (record.count >= INSTALL_ASK_BUDGET) return false;
  // `at === 0` is "never asked", which must not be held to the gap.
  return record.at === 0 || now - record.at >= INSTALL_ASK_GAP_MS;
}

/* ──────────────────────────────────────────────────────────────────────────────────────
   DOOR A'S ARM (ADR-0204 §2)

   "The first arrival after joining a trip" is not something a screen can infer once it has
   arrived — by then the join is history and the membership looks like any other. So the
   join ARMS it and the next trip surface consumes it. A one-shot flag rather than a
   timestamp: the question is "did the join just happen", and exactly one surface may answer.
   ────────────────────────────────────────────────────────────────────────────────────── */

const JOINED_KEY = 'waypoint:install:joined';

/** Set by the join, the moment the server returns a real membership. */
export function armInstallAskAfterJoin(): void {
  try {
    localStorage.setItem(JOINED_KEY, '1');
  } catch {
    /* No arm, no door A. The other doors and the settings row are unaffected. */
  }
}

/** Read AND clear, so the arm fires exactly once even if two surfaces mount together. */
export function consumeJoinArm(): boolean {
  try {
    const armed = localStorage.getItem(JOINED_KEY) !== null;
    if (armed) localStorage.removeItem(JOINED_KEY);
    return armed;
  } catch {
    return false;
  }
}
