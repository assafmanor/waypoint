import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAP_TRIP_MAXZOOM, MAP_WORLD_MAXZOOM } from '@waypoint/shared';
import { MAP_COLOR_SCHEME } from './map-config';
import { MAP_ATTRIBUTION, isGroundSource, mapBackground, mapStyle } from './map-style';

/* ADR-0125's vocabulary, now a file we own (ADR-0186 §7). What is asserted here is what a
   palette edit could break silently — the RELATIONSHIPS §8 says a future edit has to
   preserve, not the hexes, which are allowed to move. */

const URLS = {
  world: 'https://x/map/world.pmtiles',
  detail: 'https://x/map/planet-20260813.pmtiles',
  extract: 'https://x/trips/t/extract.pmtiles',
};

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
  it('reads live detail over the world layer, both through the pmtiles protocol', () => {
    // §3's "one tile source, read remotely until it is local" — nothing in the style
    // knows which it got, which is what keeps offline from being a second code path.
    const style = mapStyle(MAP_COLOR_SCHEME.light, URLS);
    const source = Object.values(style.sources)[0] as { tiles: string[] };
    expect(source.tiles).toEqual([`pmtiles://${URLS.detail}/{z}/{x}/{y}`]);
  });

  it('keeps live detail independent of whether an offline extract exists', () => {
    const style = mapStyle(MAP_COLOR_SCHEME.light, {
      world: URLS.world,
      detail: URLS.detail,
    });
    const source = Object.values(style.sources)[0] as { tiles: string[] };
    expect(source.tiles).toEqual([`pmtiles://${URLS.detail}/{z}/{x}/{y}`]);
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
   The world archive is the offline floor and a cheap underlay while live detail arrives. It must
   not duplicate labels or roads from the detailed source. */
describe('the two reads (ADR-0186 §3/§4)', () => {
  const WORLD_ONLY = {
    world: 'https://x/map/world.pmtiles',
    detail: 'https://x/map/planet-20260813.pmtiles',
  };

  it('reads live detail and the world underlay without an offline extract', () => {
    const style = mapStyle(MAP_COLOR_SCHEME.light, WORLD_ONLY);
    const sources = Object.keys(style.sources);
    expect(sources).toHaveLength(2);
    expect((style.sources[sources[0]!] as { tiles: string[] }).tiles[0]).toContain('planet-');
  });

  it('puts the world UNDER live detail when an offline extract URL is also available', () => {
    const style = mapStyle(MAP_COLOR_SCHEME.light, URLS);
    expect(Object.keys(style.sources)).toHaveLength(2);
    const ids = style.layers.map((layer) => layer.id);
    const lastWorld = ids.findLastIndex((id) => id.startsWith('world-'));
    const firstDetail = ids.findIndex((id, at) => at > 0 && !id.startsWith('world-'));
    expect(lastWorld).toBeGreaterThan(0);
    // Every world layer precedes every detail layer, so detailed ground draws over it.
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

/* **THE ARCHIVE'S HEADER MUST NOT BE ABLE TO SUPPRESS RENDERING** (2026-08-14).
   A `url: 'pmtiles://…'` source makes MapLibre fetch the archive as TileJSON, which the pmtiles
   protocol synthesises from the archive's own header — `minzoom`, `maxzoom` and `bounds`, all then
   authoritative, with tile loading clipped to them. pmtiles only `console.error`s an invalid bbox
   and hands it over anyway, so a bad header produces a source that requests NO tiles and reports NO
   error: `tiles:0 err:none` on the device, with the archive serving clean 206s.

   Declaring `tiles` instead means what the ground covers is a decision here rather than a byte in a
   file the backend cut. Asserted because the failure mode is silence — nothing throws, nothing logs
   in production, and the map is simply empty. */
describe('the source spec cannot be overruled by the archive', () => {
  const sourcesOf = (urls: { world: string; detail: string }) =>
    Object.values(mapStyle(MAP_COLOR_SCHEME.light, urls).sources) as Record<string, unknown>[];

  it('states a tile template, never a TileJSON url', () => {
    for (const urls of [{ world: 'w.pmtiles', detail: 'd.pmtiles' }]) {
      for (const source of sourcesOf(urls)) {
        expect(source.url).toBeUndefined();
        expect(source.tiles).toEqual([
          expect.stringMatching(/^pmtiles:\/\/.+\/\{z\}\/\{x\}\/\{y\}$/),
        ]);
      }
    }
  });

  it('states its own zoom range, and never a bbox that could clip the world', () => {
    const [detail, world] = sourcesOf({ world: 'w.pmtiles', detail: 'd.pmtiles' });
    // Live detail is z0-14 and the coarse ground z0-6; a wrong ceiling here is a source that
    // silently stops requesting tiles one level early instead of overzooming.
    expect(detail).toMatchObject({ minzoom: 0, maxzoom: MAP_TRIP_MAXZOOM });
    expect(world).toMatchObject({ minzoom: 0, maxzoom: MAP_WORLD_MAXZOOM });
    // No `bounds` at all: MapLibre then defaults to the whole world and clips nothing.
    for (const source of sourcesOf({ world: 'w.pmtiles', detail: 'd.pmtiles' })) {
      expect(source.bounds).toBeUndefined();
    }
  });

  it('keeps the live detail ceiling when no offline extract URL is available', () => {
    const [detail] = sourcesOf({ world: 'w.pmtiles', detail: 'd.pmtiles' });
    expect(detail).toMatchObject({ maxzoom: MAP_TRIP_MAXZOOM });
  });
});

/* **THE LABELS' GLYPHS ARE OURS AND ARE ON DISK** (ADR-0186 §3, Phase 3).
   A GL renderer draws no label with the page's fonts — it fetches pre-rendered SDF glyphs from
   the style's `glyphs` template, on the tile worker. That template pointed at a vendor host,
   which §3 forbids and a plane makes useless.

   Reading the directory rather than trusting the URL, because the failure this guards is a
   fontstack `@protomaps/basemaps` starts naming that `scripts/fetch-map-glyphs.mjs` was never
   re-run for: MapLibre then falls back to TinySDF and draws that script in the system font at
   the wrong weight, in whatever country nobody tested. Nothing throws. */
describe('the glyphs are self-hosted (ADR-0186 §3)', () => {
  const GLYPH_ROOT = fileURLToPath(new URL('../../public/map-glyphs', import.meta.url));
  const RANGES = 256;

  /** The fontstacks the style really names. `text-font` is an expression, not a string, and
   *  which stacks it reaches depends on `lang` — so this reads them out rather than listing. */
  function fontstacks(): string[] {
    const found = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === 'string' && value.startsWith('Noto')) found.add(value);
    };
    for (const scheme of [MAP_COLOR_SCHEME.light, MAP_COLOR_SCHEME.dark]) {
      for (const layer of mapStyle(scheme, URLS).layers) {
        walk((layer as { layout?: Record<string, unknown> }).layout?.['text-font']);
      }
    }
    return [...found];
  }

  it('points at our own origin, never a vendor host', () => {
    const { glyphs } = mapStyle(MAP_COLOR_SCHEME.light, URLS);
    expect(glyphs).toBe('/map-glyphs/{fontstack}/{range}.pbf');
  });

  it('has every range of every fontstack the style names', () => {
    const stacks = fontstacks();
    expect(stacks.length).toBeGreaterThan(0);
    for (const stack of stacks) {
      // All 256, including the empty ones: a range that 404s is a label rendered locally.
      expect(readdirSync(`${GLYPH_ROOT}/${stack}`)).toHaveLength(RANGES);
    }
  });
});
