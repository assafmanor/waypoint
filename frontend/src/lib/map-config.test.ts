import { describe, expect, it } from 'vitest';
import { MAP_PLANET_BUILD } from '@waypoint/shared';
import { MAP_COLOR_SCHEME, MAP_THEME, mapTileUrls, readMapsConfig } from './map-config';

const FULL = {
  VITE_GOOGLE_MAPS_BROWSER_KEY: 'key-1',
  VITE_GOOGLE_MAPS_MAP_ID: 'waypoint-day',
  VITE_GOOGLE_MAPS_MAP_ID_DARK: 'waypoint-night',
};

describe('mapTileUrls (ADR-0187)', () => {
  it('renders online detail from the immutable live build, never from the trip extract', () => {
    expect(mapTileUrls('t1')).toEqual({
      world: '/map/world.pmtiles',
      detail: `/map/planet-${MAP_PLANET_BUILD}.pmtiles`,
      extract: '/trips/t1/map/extract.pmtiles',
    });
  });
});

describe('readMapsConfig (ADR-0121 §2)', () => {
  it('resolves the browser key and the day Map ID', () => {
    expect(readMapsConfig(FULL)).toEqual({
      apiKey: 'key-1',
      mapId: 'waypoint-day',
      colorScheme: MAP_COLOR_SCHEME.light,
    });
  });

  it('picks the night Map ID under a dark theme', () => {
    expect(readMapsConfig(FULL, MAP_THEME.dark)?.mapId).toBe('waypoint-night');
  });

  // The Map ID names a PAIR of styles; colorScheme picks which one renders. Google
  // defaults it to LIGHT, so the night Map ID without this renders its light slot
  // — the right ID, the wrong face (ADR-0158 §12).
  it('asks for the dark style slot in dark, the light one in light', () => {
    expect(readMapsConfig(FULL, MAP_THEME.dark)?.colorScheme).toBe(MAP_COLOR_SCHEME.dark);
    expect(readMapsConfig(FULL, MAP_THEME.light)?.colorScheme).toBe(MAP_COLOR_SCHEME.light);
  });

  it('falls back to the day Map ID when only one was minted', () => {
    const { VITE_GOOGLE_MAPS_MAP_ID_DARK: _dropped, ...oneId } = FULL;
    expect(readMapsConfig(oneId, MAP_THEME.dark)?.mapId).toBe('waypoint-day');
  });

  // The scheme tracks the THEME, not the Map ID it landed on. One Map ID asked for
  // its dark slot still beats a light canvas under a dark app.
  it('still asks for the dark slot when it fell back to the day Map ID', () => {
    const { VITE_GOOGLE_MAPS_MAP_ID_DARK: _dropped, ...oneId } = FULL;
    expect(readMapsConfig(oneId, MAP_THEME.dark)?.colorScheme).toBe(MAP_COLOR_SCHEME.dark);
  });

  // Graceful absence, not a disabled state: a checkout without Google setup must
  // render today's list-only tab rather than an empty frame or a crash.
  it('is null without a key, and null without a Map ID', () => {
    expect(readMapsConfig({ VITE_GOOGLE_MAPS_MAP_ID: 'waypoint-day' })).toBeNull();
    expect(readMapsConfig({ VITE_GOOGLE_MAPS_BROWSER_KEY: 'key-1' })).toBeNull();
    expect(readMapsConfig({})).toBeNull();
  });

  // An empty `VITE_…=` line in a `.env` is "unset". Passing '' straight to the API
  // loader would fail at load time instead of degrading.
  it('treats a blank value as absent rather than passing it to the loader', () => {
    expect(
      readMapsConfig({ VITE_GOOGLE_MAPS_BROWSER_KEY: '  ', VITE_GOOGLE_MAPS_MAP_ID: 'x' }),
    ).toBeNull();
    expect(
      readMapsConfig({ VITE_GOOGLE_MAPS_BROWSER_KEY: 'k', VITE_GOOGLE_MAPS_MAP_ID: '' }),
    ).toBeNull();
  });

  it('trims, so a stray newline in a .env value cannot reach the script URL', () => {
    expect(
      readMapsConfig({ VITE_GOOGLE_MAPS_BROWSER_KEY: ' k \n', VITE_GOOGLE_MAPS_MAP_ID: ' m ' }),
    ).toEqual({ apiKey: 'k', mapId: 'm', colorScheme: MAP_COLOR_SCHEME.light });
  });
});
