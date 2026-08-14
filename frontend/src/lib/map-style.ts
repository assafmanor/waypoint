// **The ground, as a file we own** (ADR-0186 §7).
//
// ADR-0125 measured this vocabulary against Google's cloud styles, and it ports here
// almost verbatim — because that ADR's §8 wrote it as RELATIONSHIPS rather than as a list
// of Google feature ids: warm land against cool water, built mass achromatic against
// chromatic nature, every terrain tone below chroma 14 and above L* 78 so the pins
// (chroma 27.8–51.8) stay the loud things. Relationships are what survive a vendor change.
//
// Two consequences of it living here rather than in a console, both good:
// it is reviewable in a diff, and **dark mode is a live restyle from ONE download**
// instead of a second Map ID latched at construction (ADR-0121 §11).
//
// Drawn and rendered first in `mockups/map-basemap-ours-v1.html`, which is where these
// values were judged against real Tokyo tiles rather than reasoned about.
import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { MAP_COLOR_SCHEME, type MapColorScheme } from './map-config';

/** The tile source's name inside the style — referenced by every one of the ~70 layer
 *  definitions `layers()` generates, so it is a constant rather than a literal. */
const SOURCE = 'protomaps';

/** Glyph and sprite assets. Protomaps' own public asset host, which is a static CDN of
 *  fonts rather than a tile service — it is not on the offline path, because MapLibre
 *  caches glyph ranges and our labels are a bounded set. */
const GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';

/** OSM's licence requires attribution, and it is not optional. It replaces Google's logo
 *  in the band ADR-0121 §5's layout already reserves at the canvas's bottom. */
export const MAP_ATTRIBUTION = '© OpenStreetMap · Protomaps';

/** The palette, in the app's own tokens where one exists and in ADR-0125's measured hexes
 *  where the ground has no token of its own. Every comment here names the section that
 *  decided the value — a future edit has to preserve the RATIO, not the hex (§8). */
const LIGHT = {
  ...namedFlavor('light'),
  background: '#efebe1', // §1 — one step deeper than --paper (#f3efe6)
  earth: '#efebe1',
  water: '#b9c8d4', // §1/§2 — cool ~206°, ~14 L* below the land
  park_a: '#dde3d7', // §5 — the QUIET green: urban parks are where pins land
  park_b: '#dde3d7',
  wood_a: '#d2dec7', // §5 — the strong green: wilderness, where they do not
  wood_b: '#d2dec7',
  scrub_a: '#dfe3d4',
  scrub_b: '#dfe3d4',
  glacier: '#eef1f3',
  sand: '#efe6d2',
  beach: '#efe6d2',
  buildings: '#e4dfd4', // §4 — built mass is ACHROMATIC warm (chroma ~3.8)
  pedestrian: '#f3efe6', // §7 — --paper exactly, the coincidence worth keeping
  hospital: '#eee2e0',
  school: '#eae6da',
  industrial: '#e9e5da',
  zoo: '#dde3d7',
  aerodrome: '#e7e6e2',
  runway: '#dcdad3',
  pier: '#e4dfd4',
  // Roads stay WHITE ribbons on the warm ground — the figure-ground stack §4 leaves
  // lightness free to do.
  other: '#ffffff',
  minor_service: '#ffffff',
  minor_a: '#ffffff',
  minor_b: '#ffffff',
  link: '#ffffff',
  major: '#ffffff',
  highway: '#ffffff',
  minor_service_casing: '#e3ded2',
  minor_casing: '#e0dbcf',
  link_casing: '#ded8ca',
  major_casing_early: '#dcd5c5',
  major_casing_late: '#dcd5c5',
  highway_casing_early: '#d6cfbd',
  highway_casing_late: '#d6cfbd',
  railway: '#cfc9bb',
  boundaries: '#b6ae9f',
  city_label: '#16233d', // --ink
  city_label_halo: '#f3efe6',
  subplace_label: '#61687a', // --muted
  subplace_label_halo: '#f3efe6',
  state_label: '#7a8090',
  state_label_halo: '#f3efe6',
  country_label: '#61687a',
  roads_label_major: '#61687a',
  roads_label_major_halo: '#ffffff',
  roads_label_minor: '#7a8090',
  roads_label_minor_halo: '#ffffff',
  ocean_label: '#8398a8',
};

/** The dark ground follows `--paper` DARK (`#2e2a20`) rather than the indigo, so §1's
 *  warm-land-against-cool-water survives the theme instead of the map going one flat
 *  blue — which is the exact "lifeless" reading §1 was written to fix, one theme over. */
const DARK = {
  ...namedFlavor('dark'),
  background: '#26221a',
  earth: '#26221a',
  water: '#131c2a',
  park_a: '#232a1e',
  park_b: '#232a1e',
  wood_a: '#1f2a1c',
  wood_b: '#1f2a1c',
  scrub_a: '#262a1f',
  scrub_b: '#262a1f',
  glacier: '#2b3138',
  sand: '#2e2a20',
  beach: '#2e2a20',
  buildings: '#302b20',
  pedestrian: '#2e2a20', // --paper dark exactly, §7 held across the theme
  hospital: '#302626',
  school: '#2c2820',
  industrial: '#2b2820',
  zoo: '#232a1e',
  aerodrome: '#2a2823',
  runway: '#35322a',
  pier: '#302b20',
  other: '#463f31',
  minor_service: '#463f31',
  minor_a: '#4d4636',
  minor_b: '#4d4636',
  link: '#565040',
  major: '#565040',
  highway: '#6a6250',
  minor_service_casing: '#221e17',
  minor_casing: '#221e17',
  link_casing: '#221e17',
  major_casing_early: '#1e1b14',
  major_casing_late: '#1e1b14',
  highway_casing_early: '#1a1710',
  highway_casing_late: '#1a1710',
  railway: '#4a4436',
  boundaries: '#5d5747',
  city_label: '#e7eaf2',
  city_label_halo: '#1a1710',
  subplace_label: '#b8b3a4',
  subplace_label_halo: '#1a1710',
  state_label: '#8d8779',
  state_label_halo: '#1a1710',
  country_label: '#b8b3a4',
  roads_label_major: '#c3bdad',
  roads_label_major_halo: '#221e17',
  roads_label_minor: '#9a9484',
  roads_label_minor_halo: '#221e17',
  ocean_label: '#5f7183',
};

/** The colour the canvas paints before any tile arrives. Taken from the flavour's own
 *  earth so there is no cool flash under a warm map — ADR-0125 §1 made exactly this point
 *  about `backgroundColor` following the land rather than `--screen`. */
export function mapBackground(scheme: MapColorScheme): string {
  return (scheme === MAP_COLOR_SCHEME.dark ? DARK : LIGHT).earth;
}

/**
 * The style for one theme.
 *
 * `sources` is where the two reads meet: **the trip's own archive over the shared world
 * layer**, both through the `pmtiles://` protocol, so the same style works against a
 * remote read and a downloaded file with nothing in here knowing which it got
 * (ADR-0186 §3).
 */
export function mapStyle(
  scheme: MapColorScheme,
  urls: { world: string; trip?: string },
): StyleSpecification {
  const flavor = scheme === MAP_COLOR_SCHEME.dark ? DARK : LIGHT;
  // The trip's archive is listed FIRST so its layers draw over the coarse world where the
  // two overlap; outside it, the world is all there is and nowhere is blank (§4).
  const source = urls.trip ?? urls.world;
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      [SOURCE]: {
        type: 'vector',
        url: `pmtiles://${source}`,
        attribution: MAP_ATTRIBUTION,
      },
    },
    layers: layers(SOURCE, flavor, { lang: 'he' }),
  } as StyleSpecification;
}
