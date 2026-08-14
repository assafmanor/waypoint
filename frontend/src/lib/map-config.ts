// The rendered map's configuration: which ground to read, and which face of it to paint.
import { MAP_PLANET_BUILD } from '@waypoint/shared';
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
  live: `/map/planet-${MAP_PLANET_BUILD}.pmtiles`,
  extract: (tripId: string) => `/trips/${tripId}/map/extract.pmtiles`,
} as const;

/** The archives this build reads, always through our backend rather than a vendor URL. */
export function mapTileUrls(tripId?: string | null): MapTileUrls {
  return {
    world: apiAssetUrl(MAP_ARCHIVE_PATH.world),
    detail: apiAssetUrl(MAP_ARCHIVE_PATH.live),
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
