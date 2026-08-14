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
// Drawn first in `mockups/map-basemap-ours-v1.html`; the approved two-theme rebalance and
// regional-landcover stress test live in `map-basemap-ours-v2.html`.
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

/** **Where the labels' glyphs come from, and it is us** (ADR-0186 §3).
 *
 *  A GL renderer does not draw labels with the page's fonts: it fetches pre-rendered SDF
 *  glyphs from this template, 256 codepoints per request, on the tile worker. This pointed at
 *  `protomaps.github.io` until Phase 3 — a vendor host on a user's fetch path, and a map
 *  downloaded for a flight that draws no label it has not already seen.
 *
 *  Vendored into `public/` by `scripts/fetch-map-glyphs.mjs`, and **relative on purpose**: the
 *  service worker only caches what it can match same-origin, and Phase 3's download warms these
 *  ranges through the same cache. `map-style.test.ts` fails if a fontstack the style names has
 *  no directory on disk — which is the only way to notice upstream adding one. */
const GLYPHS = '/map-glyphs/{fontstack}/{range}.pbf';

/** OSM's licence requires attribution, and it is not optional. It replaces Google's logo
 *  in the band ADR-0121 §5's layout already reserves at the canvas's bottom. */
export const MAP_ATTRIBUTION = '© OpenStreetMap · Protomaps';

/** The palette, in the app's own tokens where one exists and in ADR-0125's measured hexes
 *  where the ground has no token of its own. Every comment here names the section that
 *  decided the value — a future edit has to preserve the RATIO, not the hex (§8). */
const LIGHT = {
  ...namedFlavor('light'),
  background: '#eee8dc',
  earth: '#eee8dc',
  water: '#b7cad8',
  park_a: '#dce6d6',
  park_b: '#dce6d6',
  wood_a: '#cfdcc5',
  wood_b: '#cfdcc5',
  scrub_a: '#e0e6d2',
  scrub_b: '#e0e6d2',
  glacier: '#e8eef1',
  sand: '#eee2cb',
  beach: '#eee2cb',
  buildings: '#ddd6ca',
  pedestrian: '#f4f0e7',
  hospital: '#eadbd8',
  school: '#e5e0d4',
  industrial: '#e1ddd2',
  zoo: '#dce6d6',
  aerodrome: '#e2e1dc',
  runway: '#d5d1c8',
  pier: '#ddd6ca',
  other: '#faf8f2',
  minor_service: '#faf8f2',
  minor_a: '#faf8f2',
  minor_b: '#faf8f2',
  link: '#f7f4ec',
  major: '#f7f4ec',
  highway: '#f1ede3',
  minor_service_casing: '#d9d3c7',
  minor_casing: '#d6d0c4',
  link_casing: '#d4cdc0',
  major_casing_early: '#d1c9ba',
  major_casing_late: '#d1c9ba',
  highway_casing_early: '#cbc2b1',
  highway_casing_late: '#cbc2b1',
  railway: '#c5bdaf',
  boundaries: '#aba393',
  city_label: '#25314a',
  city_label_halo: '#f4f0e7',
  subplace_label: '#5e6678',
  subplace_label_halo: '#f4f0e7',
  state_label: '#747c8d',
  state_label_halo: '#f4f0e7',
  country_label: '#5e6678',
  roads_label_major: '#686f7e',
  roads_label_major_halo: '#faf8f2',
  roads_label_minor: '#7b8290',
  roads_label_minor_halo: '#faf8f2',
  ocean_label: '#7892a3',
  landcover: {
    grassland: '#dce7cf',
    barren: '#ead9c9',
    urban_area: '#ddd7cd',
    farmland: '#e8e0c7',
    glacier: '#e8eef1',
    scrub: '#d4dfcf',
    forest: '#c8d9c3',
  },
};

/** The dark ground stays warm rather than following the indigo chrome, but is lifted enough
 *  to keep built mass, natural cover and roads readable on a phone. The nested `landcover`
 *  palette matters at country and regional zooms; leaving the named flavour's compressed
 *  defaults there would make Iceland one dark field even if every close-up value were right. */
const DARK = {
  ...namedFlavor('dark'),
  background: '#343027',
  earth: '#343027',
  water: '#213542',
  park_a: '#364331',
  park_b: '#364331',
  wood_a: '#2d3b2b',
  wood_b: '#2d3b2b',
  scrub_a: '#3d4433',
  scrub_b: '#3d4433',
  glacier: '#4b5661',
  sand: '#4b4134',
  beach: '#4b4134',
  buildings: '#464037',
  pedestrian: '#514b40',
  hospital: '#4a3938',
  school: '#443f35',
  industrial: '#423e35',
  zoo: '#364331',
  aerodrome: '#403d37',
  runway: '#514c43',
  pier: '#464037',
  other: '#676156',
  minor_service: '#676156',
  minor_a: '#676156',
  minor_b: '#676156',
  link: '#797265',
  major: '#797265',
  highway: '#8b8375',
  minor_service_casing: '#2c2821',
  minor_casing: '#2c2821',
  link_casing: '#27231c',
  major_casing_early: '#26221b',
  major_casing_late: '#26221b',
  highway_casing_early: '#211d17',
  highway_casing_late: '#211d17',
  railway: '#5d574d',
  boundaries: '#6a6458',
  city_label: '#f0ede6',
  city_label_halo: '#29251e',
  subplace_label: '#cec7ba',
  subplace_label_halo: '#29251e',
  state_label: '#9e978b',
  state_label_halo: '#29251e',
  country_label: '#cec7ba',
  roads_label_major: '#d8d1c3',
  roads_label_major_halo: '#27231c',
  roads_label_minor: '#b7b0a4',
  roads_label_minor_halo: '#27231c',
  ocean_label: '#83a1b6',
  landcover: {
    grassland: '#3f4b38',
    barren: '#4c4036',
    urban_area: '#403b36',
    farmland: '#4e4935',
    glacier: '#4b5661',
    scrub: '#414432',
    forest: '#2d3d31',
  },
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
 * `sources` is where the two reads meet: **one detailed archive over the shared world layer**,
 * both through the `pmtiles://` protocol. Online detail is live; offline it is downloaded, with
 * nothing in the style knowing which transport supplied it (ADR-0187).
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

  // Exactly one detailed source. Online it is the live proxy; Phase 3c swaps this URL to the local
  // extract offline. The style does not know or care which transport supplied the same archive.
  const detail = layers(SOURCE, flavor, { lang: 'he' });
  const detailSource = SOURCE;
  const sources: Record<string, unknown> = {
    [detailSource]: vector(urls.detail, MAP_TRIP_MAXZOOM),
  };

  // `background` carries no source and must appear exactly once, first.
  const background = detail.filter((layer) => layer.type === 'background');
  const over = detail.filter((layer) => layer.type !== 'background');
  // **THE WORLD GOES UNDERNEATH, AND ONLY ITS GROUND DOES** (§4's "nowhere is ever blank").
  // A local extract covers clusters, not the space between them, and a live detail request can
  // fail. In either case the coarse archive stays underneath so the ground is never blank.
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
