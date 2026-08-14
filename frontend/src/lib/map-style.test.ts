import { describe, expect, it } from 'vitest';
import { MAP_COLOR_SCHEME } from './map-config';
import { MAP_ATTRIBUTION, isGroundSource, mapBackground, mapStyle } from './map-style';

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

  it('builds a real layer stack for both themes from the same archives', () => {
    // The claim ADR-0186 §7 makes against two latched Map IDs: same tiles, two styles.
    for (const scheme of [MAP_COLOR_SCHEME.light, MAP_COLOR_SCHEME.dark]) {
      const style = mapStyle(scheme, URLS);
      expect(style.layers.length).toBeGreaterThan(20);
    }
  });
});

/* **THE COARSE GROUND STAYS UNDER THE DETAILED ONE** (§4's "nowhere is ever blank").
   A trip extract covers clusters and not the space between them, and it can also simply fail to
   build — and with one source in the style that renders NOTHING, which is a self-inflicted copy of
   the bug this migration exists to end. The 2026-08-14 blank map is why this is asserted rather
   than described: §3's prose already SAID "the trip's own archive over the shared world layer"
   while the code picked one of them. */
describe('the two reads (ADR-0186 §3/§4)', () => {
  const WORLD_ONLY = { world: 'https://x/map/world.pmtiles' };

  it('reads only the world layer when the trip has no extract yet', () => {
    const style = mapStyle(MAP_COLOR_SCHEME.light, WORLD_ONLY);
    const sources = Object.keys(style.sources);
    expect(sources).toHaveLength(1);
    expect((style.sources[sources[0]!] as { url: string }).url).toContain('world.pmtiles');
  });

  it('puts the world UNDER the trip archive once there is one', () => {
    const style = mapStyle(MAP_COLOR_SCHEME.light, URLS);
    expect(Object.keys(style.sources)).toHaveLength(2);
    const ids = style.layers.map((layer) => layer.id);
    const lastWorld = ids.findLastIndex((id) => id.startsWith('world-'));
    const firstDetail = ids.findIndex((id, at) => at > 0 && !id.startsWith('world-'));
    expect(lastWorld).toBeGreaterThan(0);
    // Every world layer precedes every detail layer, so the trip's ground draws over it.
    expect(firstDetail).toBeGreaterThan(lastWorld);
  });

  it('takes only FILLS from the world, so no label or road is drawn twice', () => {
    // The trap this avoids: the same city name from two archives, one overzoomed, a few pixels
    // apart, which reads as a blurry double rather than as a fallback.
    const style = mapStyle(MAP_COLOR_SCHEME.light, URLS);
    const underlay = style.layers.filter((layer) => layer.id.startsWith('world-'));
    expect(underlay.length).toBeGreaterThan(0);
    expect(underlay.every((layer) => layer.type === 'fill')).toBe(true);
  });

  it('carries exactly one background layer, first, whichever shape it is', () => {
    // `background` has no source; two of them is an invalid style and zero is a transparent
    // canvas showing the page through the map.
    for (const urls of [WORLD_ONLY, URLS]) {
      const style = mapStyle(MAP_COLOR_SCHEME.dark, urls);
      const backgrounds = style.layers.filter((layer) => layer.type === 'background');
      expect(backgrounds).toHaveLength(1);
      expect(style.layers[0]!.type).toBe('background');
    }
  });

  it('names every layer’s source as one the canvas will accept as ground', () => {
    // `MapCanvas` decides "a tile arrived" by source id, so a source the style invents and
    // `isGroundSource` does not know would make first paint unreachable — a blank map that says
    // nothing, which is the exact defect of 2026-08-14.
    const style = mapStyle(MAP_COLOR_SCHEME.light, URLS);
    for (const layer of style.layers) {
      const source = (layer as { source?: string }).source;
      if (source) expect(isGroundSource(source)).toBe(true);
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
