// The rendered map's configuration: which ground to read, and which face of it to paint.
import { mapPlanetArchivePath } from '@waypoint/shared';
import { apiAssetUrl } from './api-asset';
import { documentTheme, THEME, type Theme } from './theme';

/** The coarse fallback, detailed render source, and downloadable extract.
 *
 * Online `detail` is the build-pinned live proxy. Offline it resolves to a local archive;
 * `extract` is the download artefact and is deliberately not an online render source (ADR-0187). */
export interface MapTileUrls {
  world: string;
  detail: string;
  extract?: string;
}

/** The backend's archive routes, named beside their reader (ADR-0095). The build id is part of
 * the live URL so a new planet archive cannot reuse cached directory offsets from an old one. */
const MAP_ARCHIVE_PATH = {
  world: '/map/world.pmtiles',
  live: mapPlanetArchivePath,
  extract: (tripId: string) => `/trips/${tripId}/map/extract.pmtiles`,
  /** **The offline route pack** (ADR-0206 §V1.8) — the trip's travel times, downloaded beside the
   *  archive and stored in the same byte cache, so one size readout counts them and one delete
   *  removes them. Named here with the other archive routes for ADR-0095's reason. */
  routes: (tripId: string) => `/trips/${tripId}/routes/pack`,
} as const;

/** Where this trip's route pack is fetched from. Separate from `mapTileUrls` because it is not a
 *  tile source: nothing renders it, `useMapArchives` downloads it and `route-pack.ts` reads it. */
export function routePackUrl(tripId: string): string {
  return apiAssetUrl(MAP_ARCHIVE_PATH.routes(tripId));
}

/**
 * The archives this build reads, always through our backend rather than a vendor URL.
 *
 * **`liveBuild` comes from the server** (`Me['map'].liveBuild`) and is not a constant, which is
 * the 2026-08-21 fix: upstream keeps roughly a week of daily builds, so a build id compiled into
 * the bundle stops existing — every live range read 404s, the detail source draws nothing, and
 * what is left on screen is the world layer's fills. A map of coastlines with no city on it.
 *
 * **No live build is a real state, and its answer is the world layer.** The coarse archive as the
 * detail source is exactly what a plane with no extract already falls back to: labels and borders
 * to z6 rather than none at all, and never blank (ADR-0186 §4).
 */
export function mapTileUrls(tripId?: string | null, liveBuild?: string | null): MapTileUrls {
  const world = apiAssetUrl(MAP_ARCHIVE_PATH.world);
  return {
    world,
    detail: liveBuild ? apiAssetUrl(MAP_ARCHIVE_PATH.live(liveBuild)) : world,
    ...(tripId ? { extract: apiAssetUrl(MAP_ARCHIVE_PATH.extract(tripId)) } : {}),
  };
}

/** Style flavour keys used by the owned MapLibre style. */
export const MAP_COLOR_SCHEME = {
  light: 'LIGHT',
  dark: 'DARK',
} as const;
export type MapColorScheme = (typeof MAP_COLOR_SCHEME)[keyof typeof MAP_COLOR_SCHEME];

/** The map follows the app's theme vocabulary directly (ADR-0158 §8). */
export const MAP_THEME = THEME;
export type MapTheme = Theme;
export const documentMapTheme = documentTheme;

/** Which face of the owned style to paint. A theme change can restyle the existing map from the
 * same downloaded archive; there is no cloud Map ID or build-time key to resolve (ADR-0186 §7). */
export function mapColorScheme(theme: MapTheme = documentMapTheme()): MapColorScheme {
  return theme === MAP_THEME.dark ? MAP_COLOR_SCHEME.dark : MAP_COLOR_SCHEME.light;
}

/** The bundled renderer and local archives have no configuration or connectivity absence state. */
export function mapPaneAvailable(_opts: { offline: boolean }): boolean {
  return true;
}
