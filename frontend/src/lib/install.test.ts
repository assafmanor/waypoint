// @vitest-environment jsdom
//
// `lib/install.ts` reads `matchMedia`, `navigator.standalone`, `navigator.userAgent` and
// `localStorage`, and every one of those absences or refusals is itself a case under test —
// so the harness builds the browser surface per test rather than relying on what jsdom
// happens to provide (the same shape, and the same reason, as `push.test.ts`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSTALL_PATH,
  __resetSessionForTest,
  __setDeferredPromptForTest,
  armInstallAskAfterJoin,
  canOfferInstall,
  consumeJoinArm,
  fireInstallPrompt,
  installAskAllowed,
  installAskRecord,
  installPath,
  isInAppBrowser,
  isInstalled,
  isWebKit,
  markAskedThisSession,
  markInstallAsked,
  startInstallCapture,
} from './install';
import { INSTALL_ASK_BUDGET, INSTALL_ASK_GAP_MS } from '../constants';

/** The browser surface `install.ts` reads. Every option defaults to the least capable
 *  answer, so a test states only the fact it is about. */
function browser(options: { standalone?: boolean; displayMode?: boolean; ua?: string } = {}) {
  // `vi.stubGlobal`, not `spyOn`: jsdom implements no `matchMedia` at all, so there is no
  // function to spy on — the same reason `push.test.ts` and `theme.test.ts` stub it.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('display-mode: standalone') && options.displayMode === true,
  }));
  if (options.standalone === undefined) {
    Reflect.deleteProperty(navigator, 'standalone');
  } else {
    Object.defineProperty(navigator, 'standalone', {
      value: options.standalone,
      configurable: true,
    });
  }
  Object.defineProperty(navigator, 'userAgent', {
    value: options.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/126',
    configurable: true,
  });
}

/** A `beforeinstallprompt` stand-in. jsdom cannot dispatch the real event type, and the
 *  outcome is the only part the module reads. */
function promptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined);
  return {
    event: { prompt, userChoice: Promise.resolve({ outcome }) } as never,
    prompt,
  };
}

beforeEach(() => {
  localStorage.clear();
  __setDeferredPromptForTest(null);
  __resetSessionForTest();
  browser();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('isInstalled', () => {
  it('is false in an ordinary tab', () => {
    expect(isInstalled()).toBe(false);
  });

  it('is true on the standard signal', () => {
    browser({ displayMode: true });
    expect(isInstalled()).toBe(true);
  });

  // The check that matters most: this is the ONLY one that reports correctly on an iPhone
  // home-screen app, and it is the platform the whole offer exists for.
  it('is true on WebKit’s older signal, with no display-mode match', () => {
    browser({ standalone: true });
    expect(isInstalled()).toBe(true);
  });

  it('is false for a WebKit tab, where `standalone` exists and is false', () => {
    browser({ standalone: false });
    expect(isInstalled()).toBe(false);
    expect(isWebKit()).toBe(true);
  });
});

describe('isInAppBrowser', () => {
  it.each([
    ['Mozilla/5.0 (iPhone) FBAN/FBIOS', 'Facebook'],
    ['Mozilla/5.0 (iPhone) Instagram 300.0', 'Instagram'],
    ['Mozilla/5.0 (Linux; Android) WhatsApp/2.24', 'WhatsApp'],
  ])('recognises %s', (ua) => {
    browser({ ua });
    expect(isInAppBrowser()).toBe(true);
  });

  it('leaves an ordinary browser alone', () => {
    browser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1' });
    expect(isInAppBrowser()).toBe(false);
  });
});

describe('installPath', () => {
  it('is INSTALLED before anything else, even with a prompt in hand', () => {
    browser({ displayMode: true });
    __setDeferredPromptForTest(promptEvent().event);
    expect(installPath()).toBe(INSTALL_PATH.INSTALLED);
    expect(canOfferInstall()).toBe(false);
  });

  it('is PROMPT when one was captured', () => {
    __setDeferredPromptForTest(promptEvent().event);
    expect(installPath()).toBe(INSTALL_PATH.PROMPT);
  });

  // The ordering that is load-bearing: an iOS chat webview is WebKit, and teaching it the
  // share gesture would send the user hunting for a control its chrome does not have.
  it('is IN_APP rather than TEACH inside an iOS chat webview', () => {
    browser({ standalone: false, ua: 'Mozilla/5.0 (iPhone) Instagram 300.0' });
    expect(installPath()).toBe(INSTALL_PATH.IN_APP);
  });

  it('is TEACH for a plain WebKit tab', () => {
    browser({ standalone: false, ua: 'Mozilla/5.0 (iPhone) Safari/605.1' });
    expect(installPath()).toBe(INSTALL_PATH.TEACH);
  });

  it('is NONE where nothing applies, and offers nothing', () => {
    expect(installPath()).toBe(INSTALL_PATH.NONE);
    expect(canOfferInstall()).toBe(false);
  });
});

describe('the captured prompt', () => {
  it('suppresses the browser’s own infobar and takes the event', () => {
    const stop = startInstallCapture();
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    const prevented = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(prevented).toHaveBeenCalled();
    expect(installPath()).toBe(INSTALL_PATH.PROMPT);
    stop();
  });

  it('is single-use — a second fire finds nothing rather than rejecting', async () => {
    const { event, prompt } = promptEvent('accepted');
    __setDeferredPromptForTest(event);
    await expect(fireInstallPrompt()).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
    await expect(fireInstallPrompt()).resolves.toBe('unavailable');
  });

  it('answers `unavailable` with nothing captured, rather than throwing', async () => {
    await expect(fireInstallPrompt()).resolves.toBe('unavailable');
  });

  // An install through the browser's own menu spends the prompt just as surely as ours, and
  // a surface still offering it would be lying.
  it('drops the prompt when the app is installed elsewhere', () => {
    const stop = startInstallCapture();
    __setDeferredPromptForTest(promptEvent().event);
    window.dispatchEvent(new Event('appinstalled'));
    expect(installPath()).not.toBe(INSTALL_PATH.PROMPT);
    stop();
  });
});

describe('the ask budget', () => {
  const NOW = 1_760_000_000_000;

  beforeEach(() => {
    // Something must be offerable, or every case below short-circuits on capability.
    __setDeferredPromptForTest(promptEvent().event);
  });

  it('allows the first ask', () => {
    expect(installAskRecord()).toEqual({ count: 0, at: 0 });
    expect(installAskAllowed(NOW)).toBe(true);
  });

  it('spends the session on the SHOWING, not the answering', () => {
    markAskedThisSession();
    expect(installAskAllowed(NOW)).toBe(false);
  });

  it('holds the gap between asks', () => {
    markInstallAsked(NOW);
    __resetSessionForTest();
    expect(installAskAllowed(NOW + INSTALL_ASK_GAP_MS - 1)).toBe(false);
    expect(installAskAllowed(NOW + INSTALL_ASK_GAP_MS)).toBe(true);
  });

  it('stops at the budget, however long you wait', () => {
    for (let i = 0; i < INSTALL_ASK_BUDGET; i += 1) {
      markInstallAsked(NOW + i * INSTALL_ASK_GAP_MS);
    }
    __resetSessionForTest();
    expect(installAskRecord().count).toBe(INSTALL_ASK_BUDGET);
    expect(installAskAllowed(NOW + 10 * INSTALL_ASK_GAP_MS)).toBe(false);
  });

  it('never asks an installed device', () => {
    browser({ displayMode: true });
    expect(installAskAllowed(NOW)).toBe(false);
  });

  // The failure that would otherwise be silent: a record that cannot be parsed must read as
  // "never asked" rather than as NaN, which would sail through every comparison above.
  it('treats a corrupt record as never asked rather than as NaN', () => {
    localStorage.setItem('waypoint:install:asked', '{"count":"lots"}');
    expect(installAskRecord()).toEqual({ count: 0, at: 0 });
  });

  // A private window rejects the write. A prompt that cannot remember a "no" must not ask.
  it('refuses to ask when storage cannot remember the answer', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(installAskAllowed(NOW)).toBe(false);
  });
});

describe('door A’s arm', () => {
  it('fires exactly once', () => {
    armInstallAskAfterJoin();
    expect(consumeJoinArm()).toBe(true);
    expect(consumeJoinArm()).toBe(false);
  });

  it('is false when nothing armed it', () => {
    expect(consumeJoinArm()).toBe(false);
  });

  it('survives storage refusing, without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => armInstallAskAfterJoin()).not.toThrow();
    expect(consumeJoinArm()).toBe(false);
  });
});
