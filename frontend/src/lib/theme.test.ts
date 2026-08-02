// @vitest-environment jsdom
//
// `lib/theme.ts` touches localStorage, matchMedia and <html>, so it needs a DOM.
// The repo's convention is this per-file docblock rather than a global setting.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME_PICK,
  documentTheme,
  readThemePick,
  resolveTheme,
  setThemePick,
  startTheme,
  THEME,
  THEME_PICK,
  THEME_STORAGE_KEY,
  writeThemePick,
} from './theme';

/** A controllable `matchMedia`, since jsdom has none. Returns a setter so a test
 *  can flip the OS preference and fire the listener the way a real OS does. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return (next: boolean) => {
    matches = next;
    listeners.forEach((fn) => fn());
  };
}

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.remove();
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('takes an explicit pick literally, whatever the OS says', () => {
    expect(resolveTheme(THEME_PICK.light, true)).toBe(THEME.light);
    expect(resolveTheme(THEME_PICK.dark, false)).toBe(THEME.dark);
  });

  it('follows the OS only under `system`', () => {
    expect(resolveTheme(THEME_PICK.system, true)).toBe(THEME.dark);
    expect(resolveTheme(THEME_PICK.system, false)).toBe(THEME.light);
  });
});

describe('the stored pick', () => {
  it('defaults to `system` when nothing is stored', () => {
    expect(readThemePick()).toBe(DEFAULT_THEME_PICK);
    expect(DEFAULT_THEME_PICK).toBe(THEME_PICK.system);
  });

  it('ignores a stored value that is not a pick', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse');
    expect(readThemePick()).toBe(THEME_PICK.system);
  });

  it('round-trips', () => {
    writeThemePick(THEME_PICK.dark);
    expect(readThemePick()).toBe(THEME_PICK.dark);
  });

  it('survives storage throwing, because a theme is not worth a boot crash', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readThemePick()).toBe(THEME_PICK.system);
    spy.mockRestore();
    // and the write half too
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => writeThemePick(THEME_PICK.dark)).not.toThrow();
    setSpy.mockRestore();
  });
});

describe('applyTheme', () => {
  it('writes dark as an attribute and light as its ABSENCE', () => {
    // tokens.css keeps light in :root and dark in a variant block, so a
    // data-theme="light" would make that selector lie.
    applyTheme(THEME.dark);
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme(THEME.light);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('moves the browser-chrome meta with the theme', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#1B2A4A');
    document.head.appendChild(meta);
    applyTheme(THEME.dark);
    expect(meta.getAttribute('content')).toBe('#0F1726');
    applyTheme(THEME.light);
    expect(meta.getAttribute('content')).toBe('#1B2A4A');
  });

  it('does not throw when the meta is absent', () => {
    expect(() => applyTheme(THEME.dark)).not.toThrow();
  });

  it('documentTheme reads back what was painted', () => {
    applyTheme(THEME.dark);
    expect(documentTheme()).toBe(THEME.dark);
    applyTheme(THEME.light);
    expect(documentTheme()).toBe(THEME.light);
  });
});

describe('startTheme', () => {
  it('applies the stored pick immediately', () => {
    stubMatchMedia(false);
    writeThemePick(THEME_PICK.dark);
    const stop = startTheme();
    expect(documentTheme()).toBe(THEME.dark);
    stop();
  });

  it('follows the OS while the pick is `system`', () => {
    const setOs = stubMatchMedia(false);
    const stop = startTheme();
    expect(documentTheme()).toBe(THEME.light);
    setOs(true);
    expect(documentTheme()).toBe(THEME.dark);
    stop();
  });

  it('ignores the OS once a pick is explicit', () => {
    const setOs = stubMatchMedia(false);
    writeThemePick(THEME_PICK.light);
    const stop = startTheme();
    setOs(true);
    expect(documentTheme()).toBe(THEME.light);
    stop();
  });

  it('re-reads the pick on each OS change, so another tab is not ignored', () => {
    const setOs = stubMatchMedia(false);
    const stop = startTheme();
    // another tab switches to an explicit light pick
    writeThemePick(THEME_PICK.light);
    setOs(true);
    expect(documentTheme()).toBe(THEME.light);
    stop();
  });

  it('stops listening after the returned unsubscribe', () => {
    const setOs = stubMatchMedia(false);
    startTheme()();
    setOs(true);
    expect(documentTheme()).toBe(THEME.light);
  });
});

describe('setThemePick', () => {
  it('stores and applies in one step', () => {
    stubMatchMedia(false);
    setThemePick(THEME_PICK.dark);
    expect(readThemePick()).toBe(THEME_PICK.dark);
    expect(documentTheme()).toBe(THEME.dark);
  });

  it('back to `system` re-reads the OS rather than keeping the last resolved value', () => {
    stubMatchMedia(false);
    setThemePick(THEME_PICK.dark);
    setThemePick(THEME_PICK.system);
    expect(documentTheme()).toBe(THEME.light);
  });
});
