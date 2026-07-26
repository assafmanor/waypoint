import { describe, expect, it } from 'vitest';
import { MAP_THEME, readMapsConfig } from './map-config';

const FULL = {
  VITE_GOOGLE_MAPS_BROWSER_KEY: 'key-1',
  VITE_GOOGLE_MAPS_MAP_ID: 'waypoint-day',
  VITE_GOOGLE_MAPS_MAP_ID_DARK: 'waypoint-night',
};

describe('readMapsConfig (ADR-0121 §2)', () => {
  it('resolves the browser key and the day Map ID', () => {
    expect(readMapsConfig(FULL)).toEqual({ apiKey: 'key-1', mapId: 'waypoint-day' });
  });

  it('picks the night Map ID under a dark theme, which is inert readiness today', () => {
    expect(readMapsConfig(FULL, MAP_THEME.dark)?.mapId).toBe('waypoint-night');
  });

  it('falls back to the day Map ID when only one was minted', () => {
    const { VITE_GOOGLE_MAPS_MAP_ID_DARK: _dropped, ...oneId } = FULL;
    expect(readMapsConfig(oneId, MAP_THEME.dark)?.mapId).toBe('waypoint-day');
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
    ).toEqual({ apiKey: 'k', mapId: 'm' });
  });
});
