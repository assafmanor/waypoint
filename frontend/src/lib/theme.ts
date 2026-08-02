// The app's light/dark theme (ADR-0158 §8). Owns three things: what the user
// PICKED, what that RESOLVES to right now, and putting the answer on <html>.
//
// This generalizes `map-config.ts`'s `MAP_THEME`/`documentMapTheme`, which were
// the same concept at one call site — the map needed a theme signal before
// anything set one, so it wrote its own (rule 8: extend the one-off, don't add
// a second beside it). `map-config` now imports from here.
//
// Where the value lives, and why it is not on the user row: the theme has to be
// on <html> BEFORE FIRST PAINT or the app flashes light. A server-stored
// preference structurally cannot beat the first frame — it arrives a round trip
// later and would change the theme *after* paint — so a device-local store is
// load-bearing whether or not a server copy exists, and a server copy would be
// pure duplication with a flash attached. It is also the honest model: the theme
// is a property of the SCREEN YOU ARE HOLDING (a phone at night and a laptop in
// daylight legitimately disagree), where `avatarHue` — the stored-preference
// precedent this was measured against — is a property of the person.
//
// The pre-paint half of this lives as an inline script in `index.html`, because
// by the time this module executes the first frame is already gone. The two must
// agree; `THEME_STORAGE_KEY` and the attribute name are the contract, and the
// script is deliberately tiny for that reason.

/** What the document is actually in. Also the map's style axis (ADR-0121 §11). */
export const THEME = { light: 'light', dark: 'dark' } as const;
export type Theme = (typeof THEME)[keyof typeof THEME];

/** What the user chose. `system` is a real rung, not the absence of one — it
 *  keeps TRACKING the OS, so it cannot collapse into a resolved value. Named
 *  constants, never bare strings at a call site (ADR-0095). */
export const THEME_PICK = { system: 'system', light: 'light', dark: 'dark' } as const;
export type ThemePick = (typeof THEME_PICK)[keyof typeof THEME_PICK];

/** `system` by default: two rungs would force a shipped default, and a
 *  dark-mode phone would open light. It is also the only honest state for
 *  someone who has never chosen. */
export const DEFAULT_THEME_PICK: ThemePick = THEME_PICK.system;

export const THEME_STORAGE_KEY = 'waypoint:theme';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** The browser-chrome colour, which is NOT a CSS token — it is a `<meta>` the
 *  browser reads to paint its own bar, so it has to be written per theme in JS.
 *  Values are `--indigo` (the always-dark trip chrome) and the dark `--screen`. */
const THEME_COLOR: Record<Theme, string> = { light: '#1B2A4A', dark: '#0F1726' };

function isPick(v: unknown): v is ThemePick {
  return v === THEME_PICK.system || v === THEME_PICK.light || v === THEME_PICK.dark;
}

/** The stored pick, or the default. Never throws: Safari private mode makes
 *  `localStorage` access itself raise, and a theme is not worth a boot crash. */
export function readThemePick(): ThemePick {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isPick(raw) ? raw : DEFAULT_THEME_PICK;
  } catch {
    return DEFAULT_THEME_PICK;
  }
}

export function writeThemePick(pick: ThemePick): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pick);
  } catch {
    /* storage unavailable — the pick still applies for this session */
  }
}

/** Pick + what the OS currently says → the theme to render. Pure, so the whole
 *  resolution is testable without a document or a media query. */
export function resolveTheme(pick: ThemePick, prefersDark: boolean): Theme {
  if (pick === THEME_PICK.light) return THEME.light;
  if (pick === THEME_PICK.dark) return THEME.dark;
  return prefersDark ? THEME.dark : THEME.light;
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(DARK_MEDIA_QUERY).matches;
}

/** Write the theme onto `<html>` and into the browser-chrome meta.
 *
 *  Light is the ABSENCE of the attribute rather than `data-theme="light"`,
 *  matching `tokens.css` — the light values live in `:root` and the dark block
 *  is the variant. Setting a light attribute would make the selector lie. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === THEME.dark) root.dataset.theme = THEME.dark;
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

/** What the document is in right now, read off the attribute rather than
 *  recomputed — so a caller can never disagree with what is painted. */
export function documentTheme(): Theme {
  if (typeof document === 'undefined') return THEME.light;
  return document.documentElement.dataset.theme === THEME.dark ? THEME.dark : THEME.light;
}

/** Apply the stored pick, and keep following the OS while the pick is `system`.
 *  Returns an unsubscribe. Called once by the app shell; the pre-paint script in
 *  `index.html` has already done the first application, so this is about staying
 *  correct rather than getting there. */
export function startTheme(): () => void {
  const apply = () => applyTheme(resolveTheme(readThemePick(), systemPrefersDark()));
  apply();
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(DARK_MEDIA_QUERY);
  const onChange = () => {
    // Only `system` follows the OS. Re-reading the pick here rather than closing
    // over it is what keeps a change in another tab from being ignored.
    if (readThemePick() === THEME_PICK.system) apply();
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** Store a pick and apply it immediately. */
export function setThemePick(pick: ThemePick): void {
  writeThemePick(pick);
  applyTheme(resolveTheme(pick, systemPrefersDark()));
}
