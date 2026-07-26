// The rendered map's build-time configuration (ADR-0121 §2). Three `VITE_` vars,
// read once and resolved to "we can draw a map" or "we cannot" — there is no
// third, disabled state: a checkout without Google setup renders today's
// list-only tab rather than an empty frame (§2's graceful absence, the same rule
// offline follows in §11).
//
// The browser key is public and unproxyable by construction — it lives in the
// script URL (ADR-0108 §1) — so it is API-restricted to Maps JavaScript and
// referrer-locked instead of hidden. The `mapId` is mandatory, not optional:
// advanced markers do not load without one (ADR-0121 §1).
//
// Build-time, not runtime: Vite inlines `import.meta.env`, so a changed value
// needs a rebuild. `readMapsConfig` takes its env as an argument so the
// resolution is unit-testable without one.

/** What the pane needs to construct a map. Absent (`null`) is a first-class state. */
export interface MapsConfig {
  /** `VITE_GOOGLE_MAPS_BROWSER_KEY` — public, Maps-JS-only, referrer-locked. */
  apiKey: string;
  /** The cloud-styled Map ID for the active theme (ADR-0121 §1: mandatory). */
  mapId: string;
}

/** The three build vars, named beside the type that reads them (ADR-0095). */
export interface MapsEnv {
  VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
  VITE_GOOGLE_MAPS_MAP_ID?: string;
  /** Inert until dark mode ships (ADR-0121 §11) — minted so enabling it is a
   *  token flip, not a Maps-project task. */
  VITE_GOOGLE_MAPS_MAP_ID_DARK?: string;
}

/** The theme the map style follows — the app's own `data-theme` signal, not a
 *  Maps concept. Named constants, never bare strings at a call site (ADR-0095). */
export const MAP_THEME = { light: 'light', dark: 'dark' } as const;
export type MapTheme = (typeof MAP_THEME)[keyof typeof MAP_THEME];

/** Resolve the config, or `null` when either half is missing. Whitespace-only
 *  values count as missing: an empty `VITE_…=` line in a `.env` is "unset", and
 *  passing `''` to the API loader would fail at load time instead of degrading.
 *
 *  The dark Map ID falls back to the light one rather than to nothing, so a
 *  checkout that minted only one still draws a map (ADR-0121 §11 — dark mode is
 *  inert app-wide, so this fallback is the honest state, not a compromise). */
export function readMapsConfig(env: MapsEnv, theme: MapTheme = MAP_THEME.light): MapsConfig | null {
  const apiKey = env.VITE_GOOGLE_MAPS_BROWSER_KEY?.trim();
  const light = env.VITE_GOOGLE_MAPS_MAP_ID?.trim();
  const dark = env.VITE_GOOGLE_MAPS_MAP_ID_DARK?.trim();
  const mapId = theme === MAP_THEME.dark ? dark || light : light;
  if (!apiKey || !mapId) return null;
  return { apiKey, mapId };
}

/** The theme the document is in right now. Dark mode is not shipped (`tokens.css`
 *  states the remap is inert), so this reads `light` today — it exists so the
 *  night style is a flip away rather than a code change (ADR-0121 §11). */
export function documentMapTheme(): MapTheme {
  if (typeof document === 'undefined') return MAP_THEME.light;
  return document.documentElement.dataset.theme === MAP_THEME.dark
    ? MAP_THEME.dark
    : MAP_THEME.light;
}

/** The live config for this build + document. `null` → the tab is list-only. */
export function mapsConfig(): MapsConfig | null {
  return readMapsConfig(import.meta.env as unknown as MapsEnv, documentMapTheme());
}

/** Is there a rendered map on the Map tab at all? Offline there is not: the map is
 *  the one part of this tab that was never available offline, so it is **absent** —
 *  no pane, no toggle, no map instance, no billed load (ADR-0121 §11). Shared,
 *  because two callers must agree: the Map screen (which renders the split) and the
 *  shell (which makes the body full-bleed for it). */
export function mapPaneAvailable(opts: { offline: boolean }): boolean {
  return !opts.offline && mapsConfig() != null;
}
