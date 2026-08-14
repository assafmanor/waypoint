// The rendered map's configuration — which ground to read, and which face of it to paint.
//
// **The interesting thing here is what is no longer load-bearing.** ADR-0121 §2 made this file
// about three `VITE_GOOGLE_MAPS_*` vars resolving to "we can draw a map" or "we cannot",
// because without a browser key and a Map ID there was no canvas. ADR-0186 bundles the
// renderer and serves the tiles from our own backend, so **there is no build configuration
// left to be missing**: a checkout draws a map by existing, and the only remaining absence is
// being offline (§8, until Phase 3 makes even that false).
//
// `MapsConfig` / `readMapsConfig` / `mapsConfig` below are therefore down to ONE reader —
// `DevMapTuner`, which reports what a Google canvas was built from. They are Phase 4's to
// delete along with the vars and the renderer; leaving them here rather than half-removing
// them is what keeps this a reviewable phase.

import { MAP_PLANET_BUILD } from '@waypoint/shared';
import { documentTheme, THEME, type Theme } from './theme';
import { apiAssetUrl } from './api-asset';

/** The coarse fallback, the detailed render source, and the downloadable extract.
 *
 * Online `detail` is the build-pinned live proxy. Phase 3c replaces that URL with a local archive
 * offline; the style and renderer keep reading the same shape. `extract` is intentionally not a
 * render source while online (ADR-0187). */
export interface MapTileUrls {
  world: string;
  detail: string;
  extract?: string;
}

/**
 * The archives this build reads.
 *
 * **Through our own backend, never a vendor** — the rule ADR-0108/0110 already set for every
 * Google call, applied to tiles for the same three reasons: any key stays server-side, we can
 * cache, and we can change source without shipping a client.
 *
 * The build id is part of the live URL because PMTiles caches directory pages by archive URL. A
 * daily build moving byte offsets under one stable URL would silently map tile addresses to the
 * wrong bytes; a new URL makes the change explicit and invalidates every layer of cache.
 */
export function mapTileUrls(tripId?: string | null): MapTileUrls {
  return {
    world: apiAssetUrl(MAP_ARCHIVE_PATH.world),
    detail: apiAssetUrl(MAP_ARCHIVE_PATH.live),
    ...(tripId ? { extract: apiAssetUrl(MAP_ARCHIVE_PATH.extract(tripId)) } : {}),
  };
}

/** The backend's own routes for the archives, named beside the reader (ADR-0095). */
const MAP_ARCHIVE_PATH = {
  world: '/map/world.pmtiles',
  live: `/map/planet-${MAP_PLANET_BUILD}.pmtiles`,
  extract: (tripId: string) => `/trips/${tripId}/map/extract.pmtiles`,
} as const;

/** What the pane needs to construct a map. Absent (`null`) is a first-class state. */
export interface MapsConfig {
  /** `VITE_GOOGLE_MAPS_BROWSER_KEY` — public, Maps-JS-only, referrer-locked. */
  apiKey: string;
  /** The cloud-styled Map ID for the active theme (ADR-0121 §1: mandatory). */
  mapId: string;
  /** Which of the Map ID's two style slots to render. A Map ID carries a light
   *  style AND a dark style, and `colorScheme` is what picks between them — it
   *  is **not** implied by the Map ID. Google defaults it to `LIGHT`, so a map
   *  built without it renders the night Map ID's *light* slot: the right ID,
   *  the wrong face, and indistinguishable on screen from "the night style was
   *  never imported" (ADR-0158 §12). */
  colorScheme: MapColorScheme;
}

/** The two slots, named beside the config that resolves them (ADR-0095). Values
 *  are `google.maps.ColorScheme` members, spelled as the strings the API accepts
 *  so nothing here has to import the Maps namespace. */
export const MAP_COLOR_SCHEME = {
  light: 'LIGHT',
  dark: 'DARK',
} as const;
export type MapColorScheme = (typeof MAP_COLOR_SCHEME)[keyof typeof MAP_COLOR_SCHEME];

/** The three build vars, named beside the type that reads them (ADR-0095). */
export interface MapsEnv {
  VITE_GOOGLE_MAPS_BROWSER_KEY?: string;
  VITE_GOOGLE_MAPS_MAP_ID?: string;
  /** Inert until dark mode ships (ADR-0121 §11) — minted so enabling it is a
   *  token flip, not a Maps-project task. */
  VITE_GOOGLE_MAPS_MAP_ID_DARK?: string;
}

/** The theme the map style follows. This used to define its own `MAP_THEME`
 *  pair, because the map needed a theme signal before anything in the app set
 *  one; `lib/theme.ts` now owns that concept for everybody (ADR-0158 §8), and
 *  the alias stays so the map's own vocabulary still reads locally. */
export const MAP_THEME = THEME;
export type MapTheme = Theme;

/** Resolve the config, or `null` when either half is missing. Whitespace-only
 *  values count as missing: an empty `VITE_…=` line in a `.env` is "unset", and
 *  passing `''` to the API loader would fail at load time instead of degrading.
 *
 *  The dark Map ID falls back to the light one rather than to nothing, so a
 *  checkout that minted only one still draws a map (ADR-0121 §11).
 *
 *  `colorScheme` follows the THEME, not the Map ID that was resolved — including
 *  down that fallback. A checkout with only the day Map ID still asks for `DARK`
 *  in dark mode, and gets whatever that one Map ID holds in its dark slot: worst
 *  case Google's default dark, which beats a light canvas behind a dark app. */
export function readMapsConfig(env: MapsEnv, theme: MapTheme = MAP_THEME.light): MapsConfig | null {
  const apiKey = env.VITE_GOOGLE_MAPS_BROWSER_KEY?.trim();
  const light = env.VITE_GOOGLE_MAPS_MAP_ID?.trim();
  const dark = env.VITE_GOOGLE_MAPS_MAP_ID_DARK?.trim();
  const isDark = theme === MAP_THEME.dark;
  const mapId = isDark ? dark || light : light;
  if (!apiKey || !mapId) return null;
  return {
    apiKey,
    mapId,
    colorScheme: isDark ? MAP_COLOR_SCHEME.dark : MAP_COLOR_SCHEME.light,
  };
}

/** The theme the document is in right now — `lib/theme.ts`'s reader, re-exported
 *  under the map's name. Live since ADR-0158 phase 4 set `data-theme`; the night
 *  style it selects still needs its one-time Cloud-console import (ADR-0121 §11,
 *  `prerequisites-checklist.md` §4), and an unimported Map ID renders
 *  Google-default rather than failing. */
export const documentMapTheme = documentTheme;

/** The live config for this build + document. `null` → the tab is list-only. */
export function mapsConfig(): MapsConfig | null {
  return readMapsConfig(import.meta.env as unknown as MapsEnv, documentMapTheme());
}

/**
 * **Which face of the ground to paint.** Straight off the document's theme, because a style
 * JSON is swappable on a live map — ADR-0186 §7's cheapest win over two latched Map IDs,
 * where a theme flip could not reach the canvas already drawn.
 *
 * It keeps `MAP_COLOR_SCHEME`'s `'LIGHT'`/`'DARK'` spelling even though nothing Google reads
 * it any more: `mapStyle`, `mapBackground` and `MAP_CONNECTOR.COLOR` are all keyed on it, and
 * renaming the two values would be a churn with no reader asking for it.
 */
export function mapColorScheme(theme: MapTheme = documentMapTheme()): MapColorScheme {
  return theme === MAP_THEME.dark ? MAP_COLOR_SCHEME.dark : MAP_COLOR_SCHEME.light;
}

/**
 * Is there a rendered map on the Map tab at all?
 *
 * **Offline there is not — and that is now the ONLY reason there is not** (ADR-0186 §8). It
 * used to also require the three `VITE_GOOGLE_MAPS_*` vars, because without a key and a Map
 * ID there was no canvas to draw; the renderer is bundled now, so there is no build
 * configuration left to be missing and a checkout draws a map by existing.
 *
 * **The graceful absence itself is unchanged, only its trigger.** §2's rule still holds — no
 * pane, no toggle, no instance, today's list-only tab rather than an empty frame — and
 * `Map.test.tsx` still covers that path, now by being offline rather than by having no keys.
 *
 * It stays true only until Phase 3: once an extract can be downloaded, the map becomes the
 * part of this tab that works offline BEST (§8), and this function loses its last reason to
 * return false. Shared, because two callers must agree: the Map screen (which renders the
 * split) and the shell (which makes the body full-bleed for it).
 */
export function mapPaneAvailable(opts: { offline: boolean }): boolean {
  return !opts.offline;
}
