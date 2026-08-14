import { MAP_PLANET_BUILD } from '@waypoint/shared';
import { describe, expect, it } from 'vitest';
import {
  MAP_COLOR_SCHEME,
  MAP_THEME,
  mapColorScheme,
  mapPaneAvailable,
  mapTileUrls,
} from './map-config';

describe('mapTileUrls (ADR-0187)', () => {
  it('renders online detail from the immutable live build, never from the trip extract', () => {
    expect(mapTileUrls('t1')).toEqual({
      world: '/map/world.pmtiles',
      detail: `/map/planet-${MAP_PLANET_BUILD}.pmtiles`,
      extract: '/trips/t1/map/extract.pmtiles',
    });
  });
});

describe('mapColorScheme (ADR-0186)', () => {
  it('maps both app themes directly to the owned style flavours', () => {
    expect(mapColorScheme(MAP_THEME.light)).toBe(MAP_COLOR_SCHEME.light);
    expect(mapColorScheme(MAP_THEME.dark)).toBe(MAP_COLOR_SCHEME.dark);
  });
});

describe('mapPaneAvailable (ADR-0186 Phase 3)', () => {
  it('keeps the map canvas available offline', () => {
    expect(mapPaneAvailable({ offline: true })).toBe(true);
  });
});
