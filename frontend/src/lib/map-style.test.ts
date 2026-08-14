import { describe, expect, it } from 'vitest';
import { MAP_COLOR_SCHEME } from './map-config';
import { MAP_ATTRIBUTION, mapBackground, mapStyle } from './map-style';

/* ADR-0125's vocabulary, now a file we own (ADR-0186 §7). What is asserted here is what a
   palette edit could break silently — the RELATIONSHIPS §8 says a future edit has to
   preserve, not the hexes, which are allowed to move. */

const URLS = { world: 'https://x/map/world.pmtiles', trip: 'https://x/trips/t/extract.pmtiles' };

/** Relative luminance, so the ground's own contrast claims are checked rather than eyeballed. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

describe('mapStyle', () => {
  it('reads the trip archive over the world layer, both through the pmtiles protocol', () => {
    // §3's "one tile source, read remotely until it is local" — nothing in the style
    // knows which it got, which is what keeps offline from being a second code path.
    const style = mapStyle(MAP_COLOR_SCHEME.light, URLS);
    const source = Object.values(style.sources)[0] as { url: string };
    expect(source.url).toBe(`pmtiles://${URLS.trip}`);
  });

  it('falls back to the world layer for a trip with no archive', () => {
    // A trip nobody has added a place to yet still draws a map (§4).
    const style = mapStyle(MAP_COLOR_SCHEME.light, { world: URLS.world });
    const source = Object.values(style.sources)[0] as { url: string };
    expect(source.url).toBe(`pmtiles://${URLS.world}`);
  });

  it('carries OSM attribution, which the licence does not make optional', () => {
    const source = Object.values(mapStyle(MAP_COLOR_SCHEME.light, URLS).sources)[0] as {
      attribution: string;
    };
    expect(source.attribution).toBe(MAP_ATTRIBUTION);
    expect(MAP_ATTRIBUTION).toContain('OpenStreetMap');
  });

  it('builds a real layer stack for both themes from one source', () => {
    // The claim ADR-0186 §7 makes against two latched Map IDs: same tiles, two styles.
    for (const scheme of [MAP_COLOR_SCHEME.light, MAP_COLOR_SCHEME.dark]) {
      const style = mapStyle(scheme, URLS);
      expect(style.layers.length).toBeGreaterThan(20);
      expect(Object.keys(style.sources)).toHaveLength(1);
    }
  });
});

describe('the ground keeps ADR-0125 §8 ratios', () => {
  it('paints the pre-tile canvas the LAND colour, so there is no cool flash', () => {
    // §1 made exactly this point about `backgroundColor` following the land.
    expect(mapBackground(MAP_COLOR_SCHEME.light)).toBe('#efebe1');
    expect(mapBackground(MAP_COLOR_SCHEME.dark)).toBe('#26221a');
  });

  it('keeps land lighter than water in light, and warmer than it in both', () => {
    // §1's temperature contrast is the lever, and it is what "quiet, not dead" means.
    const land = mapBackground(MAP_COLOR_SCHEME.light);
    expect(luminance(land)).toBeGreaterThan(luminance('#b9c8d4'));
  });

  it('keeps the dark ground dark enough for a light pin to be the figure', () => {
    // The finding from the mockup's render: in dark the pin FILL carries the
    // separation, because the white ring measures 1.01:1 against dark park. So the
    // ground has to stay well under the pin hues rather than merely differ from them.
    const darkGround = luminance(mapBackground(MAP_COLOR_SCHEME.dark));
    const lightestPin = luminance('#d9c08a'); // --cat-services, the lightest of the five
    expect(lightestPin / darkGround).toBeGreaterThan(4);
  });
});
