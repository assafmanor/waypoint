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
import { MAP_TRIP_MAXZOOM, MAP_WORLD_MAXZOOM } from '@waypoint/shared';
import type { StyleSpecification } from 'maplibre-gl';
import { MAP_COLOR_SCHEME, type MapColorScheme, type MapTileUrls } from './map-config';

/** The tile sources' names inside the style — referenced by every one of the ~70 layer
 *  definitions `layers()` generates per source, so they are constants rather than literals.
 *
 *  `DETAIL` is the archive the map is really drawn from; `WORLD` is the coarse ground beneath
 *  it. Two names because there are genuinely two reads (§3/§4) whenever a trip has an extract. */
const SOURCE = 'protomaps';
const WORLD_SOURCE = 'protomaps-world';

/** **Is this `sourcedata` event about our ground?** MapLibre reports a tile arriving with the
 *  source it belongs to, and "did any tile of our ground actually load" is the only honest
 *  first-paint signal there is — see `MapCanvas`. Either source answers yes: both draw ground,
 *  and the coarse one drawing is still a map on screen. */
export const isGroundSource = (id: string | undefined): boolean =>
  id === SOURCE || id === WORLD_SOURCE;

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
export function mapStyle(scheme: MapColorScheme, urls: MapTileUrls): StyleSpecification {
  const flavor = scheme === MAP_COLOR_SCHEME.dark ? DARK : LIGHT;
  /**
   * **The tile TEMPLATE, never the archive's metadata** — and this is the whole of the
   * 2026-08-14 blank map.
   *
   * A `url: 'pmtiles://…'` source makes MapLibre fetch the archive as TileJSON, and the pmtiles
   * protocol answers by synthesising one **from the archive's own header**: `minzoom`, `maxzoom`
   * and `bounds`. Those are then authoritative, and MapLibre clips tile loading to them. So an
   * archive whose header carries a degenerate or wrong bbox produces a source that requests **no
   * tiles at all and reports no error** — pmtiles only `console.error`s an invalid bbox and hands
   * it over anyway. On the device that read exactly as `tiles:0 err:none` with the archive serving
   * clean 206s, which is a state no amount of retrying could improve.
   *
   * Declaring `tiles` skips the metadata step entirely: MapLibre uses the zooms stated here and
   * defaults `bounds` to the whole world, so what the ground covers is a decision in this repo
   * rather than a byte in a file the backend cut. It also removes a network round trip.
   *
   * **This is also why the e2e passed while the app did not.** That spec reads Protomaps' planet
   * archive, whose header is correct by construction — so it exercised the one archive that could
   * not expose this. Ours had never been read by any test.
   */
  const vector = (url: string, maxzoom: number) =>
    ({
      type: 'vector',
      tiles: [`pmtiles://${url}/{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom,
      attribution: MAP_ATTRIBUTION,
    }) as const;

  // The archive the map is actually drawn from. The trip's own where it exists, and the world
  // otherwise — which is a correct map at low zoom and, at the zoom this app OPENS at, very
  // nearly an empty one. See `mapTileUrls`: that is why the extract is not optional in practice.
  const detail = layers(urls.trip ? SOURCE : WORLD_SOURCE, flavor, { lang: 'he' });
  const detailSource = urls.trip ? SOURCE : WORLD_SOURCE;
  const sources: Record<string, unknown> = {
    [detailSource]: vector(
      urls.trip ?? urls.world,
      urls.trip ? MAP_TRIP_MAXZOOM : MAP_WORLD_MAXZOOM,
    ),
  };

  // `background` carries no source and must appear exactly once, first.
  const background = detail.filter((layer) => layer.type === 'background');
  const over = detail.filter((layer) => layer.type !== 'background');
  if (!urls.trip) {
    return {
      version: 8,
      glyphs: GLYPHS,
      sources,
      layers: [...background, ...over],
    } as StyleSpecification;
  }

  // **THE WORLD GOES UNDERNEATH, AND ONLY ITS GROUND DOES** (§4's "nowhere is ever blank").
  // A trip extract covers clusters, not the space between them, and it can also simply fail to
  // build — in which case a single-source style renders NOTHING, which is a self-inflicted copy
  // of the bug this migration exists to end. So the coarse archive stays in the style beneath it.
  //
  // Fills only, deliberately: taking the whole generated set would draw every label and road
  // twice — the same city name from two archives, one overzoomed, a few pixels apart, which reads
  // as a blurry double. Fills are land, water and landcover, and a doubled fill is invisible
  // because the two are the same colour by construction. Ids are prefixed because `layers()`
  // generates the same ~70 ids for any source it is given.
  sources[WORLD_SOURCE] = vector(urls.world, MAP_WORLD_MAXZOOM);
  const underlay = layers(WORLD_SOURCE, flavor, { lang: 'he' })
    .filter((layer) => layer.type === 'fill')
    .map((layer) => ({ ...layer, id: `world-${layer.id}` }));

  return {
    version: 8,
    glyphs: GLYPHS,
    sources,
    layers: [...background, ...underlay, ...over],
  } as StyleSpecification;
}
