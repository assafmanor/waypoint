import { describe, expect, it } from 'vitest';
import {
  MAP_COLOR_SCHEME,
  MAP_THEME,
  mapColorScheme,
  mapPaneAvailable,
  mapTileUrls,
} from './map-config';

describe('mapTileUrls (ADR-0187)', () => {
  it('renders online detail from the build the SERVER states, never from the trip extract', () => {
    expect(mapTileUrls('t1', '20260821')).toEqual({
      world: '/map/world.pmtiles',
      detail: '/map/planet-20260821.pmtiles',
      extract: '/trips/t1/map/extract.pmtiles',
    });
  });

  // The 2026-08-21 bug, from the other end: the id used to be a constant in the bundle, and
  // upstream keeps about a week of dailies — so `detail` named an object nobody serves, every
  // range read 404'd, and the only thing left drawing was the world layer's fills. There is no
  // build id in this package any more, and this is the assertion that says so.
  it('falls back to the coarse world when the server states no live build', () => {
    expect(mapTileUrls('t1', null).detail).toBe('/map/world.pmtiles');
    expect(mapTileUrls('t1').detail).toBe('/map/world.pmtiles');
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
