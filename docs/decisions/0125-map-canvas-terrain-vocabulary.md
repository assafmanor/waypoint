# 0125 — The map canvas earns a terrain vocabulary

**Status:** Accepted — authored 2026-07-28 (session 144). Values are reasoned from the tokens and **schema-validated**; the first two rounds were judged on a real device, the terrain layer has not been seen yet.
**Date:** 2026-07-28
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§11** (the style brief: "desaturated cool-paper base matching `--screen`" becomes a **warm** base against cool water, and "POI clutter dropped" keeps its root suppression but gains a curated **sights** set) and [0106](0106-maps-and-places-epic-scope-and-phasing.md) **§C** (the "quiet base, loud pins" brief holds — what changes is that _quiet_ stops meaning _grey_). Relates [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget on a rendered canvas), [0038](0038-icons-and-canonical-category.md) §2 (the pin hues the ground must not fight), [0109](0109-map-tab-design.md) §3, [0123](0123-map-pin-size-is-a-share-of-the-canvas.md) (the other "seen on a real device, one scalar was wrong" pass).

## Context

The two cloud styles were authored from `tokens.css` in session 133 and imported. Seen on a real phone, the owner's verdict was **"the map style looks very lifeless to me and not really on the design language"** — and, separately, that the sea had already been made bluer **by hand in the Cloud Console**, a tweak the repo files never carried.

The README for `design/map-styles/` had predicted "expect one adjustment round on a real device, most likely water contrast and the park fill". That was the right instinct and the wrong size: it framed the problem as two numbers. Measured, it is structural. Every colour in the shipped day style, in Lab:

| Element                          | Hex       | L\*      | Hue |
| -------------------------------- | --------- | -------- | --- |
| highway / arterial / roadNetwork | `#ffffff` | 100–96.8 | 210 |
| land base                        | `#e7eaef` | **92.6** | 218 |
| landCover / urbanArea            | `#e2e6ec` | 91.2     | 216 |
| building                         | `#dfe3ea` | 90.1     | 218 |
| park                             | `#dde5e1` | 90.3     | 150 |
| water                            | `#d7dee8` | **88.2** | 215 |
| border                           | `#c9d0da` | 83.2     | 215 |

Two facts fall out, and neither is a matter of taste:

1. **One hue.** Everything sits in **210–218**. The single exception, `park` at hue 150, carries a chroma of about 5 — a grey with a rumour of green in it.
2. **A four-point field.** Base, landCover, building, park _and water_ all live inside **L\* 88.2–92.6**. Water is **4.4 L\*** off the land. Roads were the only thing with real separation, so the map read as a road diagram floating on an undifferentiated wash — no coastline, no city, no vegetation.

The night style had the same pathology, worse: hues 210–224, and land↔water **2.6 L\***.

A second round fixed the ground (warm land, cool water, a real value range) and the owner confirmed it read better. That round exposed the next gap, on a view of Liguria: **the Apennines behind Genoa were a flat cream field.** Which produced the actual brief for this ADR — _"because this is a travel map we should be able to differentiate easily between cities/nature, mountains/glaciers/lakes etc. Make everything trip relevant somewhat distinct, while not overwhelming and still adhering to the design language."_

## Decision

### 1. Quiet means low chroma, not grey — land goes warm, water stays cool

**Temperature contrast between land and water is the lever, and it is free.** The two fields are pushed apart in _hue_ (warm ~43° land against cool ~206° water) while both stay under 35% saturation, so nothing is added to the colour budget. This is how cartography has always separated ground from sea, and it is the difference between "quiet" and "dead".

The base is not an invention: `--paper` (`#f3efe6`) is already the palette's warm-paper surface. The canvas is one step deeper than it (`#efebe1`) so that white-bordered pins and white highway ribbons both still read as figures on it.

**`--screen` stops being the base.** ADR-0121 §11 tied the canvas to `--screen` so the map would "read as the same surface as the app". `--paper` is equally an app surface, and the adjacency that reasoning assumed does not exist: the map is full-bleed under a sheet with dark-indigo chrome above it (ADR-0122), so it never butts against `--screen`. `backgroundColor` follows the land rather than `--screen`, so there is no cool flash before tiles paint.

### 2. The field gets a real value range

| Pair          | Was          | Now          |
| ------------- | ------------ | ------------ |
| land ↔ water  | 4.4 L\*      | **14.3 L\*** |
| land ↔ park   | 2.3 L\*      | 3.6 L\*      |
| land ↔ forest | (no such id) | 5.7 L\*      |

### 3. The canvas earns a terrain vocabulary

A travel map has to answer _"is that a city or a mountain"_ before it answers anything else. Every `natural.land.landCover.*` sub-type takes a fill, so the ground gains a **land-cover band** — `forest`, `shrub`, `crops`, `dryCrops`, `tundra`, `ice`, `sand` — plus `natureReserve`, `beach`, `airport` and `businessCorridor` footprints.

**There is no relief shading to be had.** CBMS has no hillshade and no terrain/landform feature, so mountains cannot be drawn as mountains. They are drawn as what actually covers them: forest on the flanks, shrub above the treeline, `ice` on top. **Land-cover banding _is_ the relief** — that is why the vocabulary answers the mountain brief and a "terrain layer" toggle would not.

### 4. Built vs natural splits by chroma, not by lightness

The one rule that keeps the map legible at a glance without adding colour:

- **Built mass is achromatic warm** — `urbanArea` chroma 3.0, `building` 3.8, `businessCorridor` 4.0.
- **Nature is chromatic green** — `landCover` 9.1, `natureReserve` 12.8, `forest` 13.6.

So "city" and "countryside" are told apart by _saturation_, at almost equal lightness. Lightness stays available for the figure-ground stack (roads above land above water), which is the job it was already doing.

### 5. Park and nature reserve split by role, because pins land on one of them

Both were `#dde5e1`. They are now deliberately different, and the reason is pin legibility rather than cartography: a `--cat-leisure` pin (`#9cc9a0`) on the loud green measured **1.29:1** — a green pin vanishing into green ground.

- **`park` is the quiet green** (`#dde3d7`, chroma 6.6) — urban parks are exactly where pins land.
- **`natureReserve` is the strong green** (`#d2dec7`, chroma 12.8) — wilderness, where they essentially never do.

`pointOfInterest.recreation` gets a quiet green as a catch-all, so golf courses, sports complexes and zoos stop rendering as blank land in a city.

### 6. Sights come back on; commerce stays banned; the pin's _chroma_ says whose it is

ADR-0121's strongest "loud pins" move was killing `pointOfInterest` labels at the root, which takes every Google pin, glyph and name with it. **That went too far**, and the owner named the cost precisely: _"it doesn't pop up landmarks, tourist attractions etc (like a big Eiffel tower clickable icon)"_. On a travel map, the Eiffel Tower is not clutter — it is the reason you are looking.

So the root suppression stays, and a **sights** set is re-enabled over it:

| Re-enabled                                                              | Why                                                   | Pin fields?         |
| ----------------------------------------------------------------------- | ----------------------------------------------------- | ------------------- |
| `entertainment` (parent: attraction, museum, historic, arts, themePark) | the sights themselves                                 | yes, styled down    |
| `landmark`                                                              | the Eiffel Tower case, literally                      | yes, styled down    |
| `recreation.zoo`                                                        | a real destination, not a shop                        | yes, styled down    |
| `recreation.peak`                                                       | mountain names                                        | yes, styled down    |
| `recreation.natureReserve`                                              | national-park names are the trip                      | **none** on this id |
| water / island / archipelago                                            | inherited from `natural`, legible on the deeper water | none                |

Styling the **parent** `entertainment` rather than five children is deliberate: a feature type Google adds later inherits the treatment instead of silently defaulting. Its two non-sights children are then switched back off by name — **`casino` and `cinema`** are local entertainment, not why you flew somewhere.

Everything commercial stays off: `restaurant`, `cafe`, `bar`, `winery`, `shopping`, `grocery`, `bank`, `atm`, `gasStation`, `parkingLot`, the rest. Those are exactly what our own pins are _for_, and Google naming them is the clutter the root suppression exists to kill. `other.placeOfWorship` also stays off — a famous cathedral is already a `landmark` or a `touristAttraction`, whereas the id itself would put a pin on every neighbourhood church.

**The tension this creates is real:** Google's pins now share the canvas with ours, which is what ADR-0121 §11 was protecting against. It is resolved by the same rule as §4 — **chroma, not lightness**:

- **Google's sights are achromatic** — a light neutral pin (`#c9ccd4`, chroma **5.0**) with a dark glyph and a white ring.
- **Ours are chromatic** — the five category hues, chroma **27.8–51.8**.

So the canvas reads at a glance as _grey pin = a thing that exists, coloured pin = a thing on your trip_. Nothing is added to the colour budget, and the reference layer cannot be mistaken for the itinerary. `peak` goes further and colours its pin into the ground (`pinFillColor` = the land), since a mountain wants a name more than a marker.

**One code knock-on, handled.** Google's icons are clickable (`clickableIcons` was never disabled, so it defaults on — no change needed to get the tap). But that tap arrives as a **map click carrying a `placeId`**, and `MapPane`'s handler treated anything that wasn't one of our `.map-pin` overlays as background — meaning it cleared the user's selection behind the place card Google had just opened. The guard now returns early on `event.detail.placeId`, with a test for it.

### 7. Trails and pedestrian malls are trip-relevant infrastructure, not roads

`noTraffic.trail` gets a green-grey casing so a path through nature stops rendering as a small road. `noTraffic.pedestrianMall` lands on **`#f3efe6` — `--paper` exactly**: an old-town walkable zone is literally the app's paper surface, which is a coincidence worth keeping rather than rounding away.

### 8. The ceiling that keeps this a ground

Every terrain tone stays **below chroma 14 and above L\* 78** (day). The five pin hues run chroma **27.8–51.8** at L\* 63–79, with a white ring and a shadow. The ground can now be read; it still cannot compete. That ratio, not a list of hexes, is what a future edit has to preserve.

## Consequences

- **Cities, coastlines, forests, glaciers, beaches, farmland and pedestrian zones are distinguishable** on the base map, which is what a travel companion's map owes the person holding it.
- **The schema is vendored** at `design/map-styles/cbms-json-schema.json`. The README told the next person to `curl` it from `developers.google.com`; that host is not reachable from agent/sandbox sessions (403 at the egress proxy), which is how the first draft of this pass shipped an invalid id (`landCover.iceAndSnow`; the real one is `landCover.ice`) and two ids styled with a property they do not have. Validation is now offline and mandatory.
- **`natural.water.lake` / `.river` cannot be coloured** — the schema gives them labels only, so inland water is the same blue as the sea. Distinguishing a mountain lake from the coast is not available at any price; only their _names_ can differ.
- **The Console is not the source of truth, and a Console-only tweak is drift.** The bluer sea existed for two days in Google's Console and nowhere in git; the next import would have silently reverted it. Fix here, then import.
- The `--paper`-family base widens that token's documented role ("badge / warm paper accents") to include the map ground; `design-language.md`'s Map paragraph is updated in the same change.

## Alternatives considered

- **Keep the cool-grey base and only deepen the water.** The measurement kills it: with one hue across the whole field, deepening water buys a coastline and nothing else — no city, no vegetation, no mountain.
- **A saturated blue sea.** Rejected before ([the README's own "why these values"](../design/map-styles/README.md)) on the grounds that it would flood the budget and fight `--teal`. That reasoning conflated _blue_ with _saturated_: the sea is a 33%-saturation slate at L\* 79, an order of magnitude off `--me` (`#2e6be6`, 79% at L\* 45) and a different hue family from `--teal` (`#2c9c90`, 174°). Nobody reads sea-blue as a brand accent. **This ADR supersedes that paragraph.**
- **`monochrome: true`.** The schema offers it, and it is the honest name for what shipped. Rejected: it is the disease, not the treatment.
- **A terrain / relief layer, or Google's `TransitLayer`-style overlay for hillshade.** There is none in CBMS (§3). Land-cover banding is the available answer and turns out to be the better one — it is _data_ about the ground, not a shading effect over it.
- **Re-enable POI labels wholesale.** Rejected: the commercial POIs are precisely ADR-0121 §11's clutter, and our own pins already answer "what's here for us". The curated **sights** set (§6), with commerce still off and the reference/itinerary split carried by chroma, is the version that survives.
- **Keep every POI label off and let our own pins be the only markers.** This was the shipped position and the owner rejected it on sight: a map of Paris with no Eiffel Tower is not quiet, it is uninformative. Recorded because it is the position two ADRs currently argue for.
- **Give Google's sights a category hue so they match our pins.** Rejected: it would make "on your trip" and "merely exists" indistinguishable, which is worse than either extreme.
- **Distinct lake / river colours.** Not possible (see Consequences).
- **Per-mode (Trip / Plan) canvases.** Still no, unchanged: `mapId` is construction-time, so a swap re-bills a Dynamic Maps load on every mode toggle (ADR-0121 §4), and violet flooded across the ground is the colour flood ADR-0106 §C bans.
- **Generate the style files from `tokens.css` at build time.** Rejected again: cloud styling lives in Google's Console, so no build step can reach it. The mapping table in the README is what keeps the mirror mechanical.

## Still open

- **The terrain layer has not been seen rendered.** Rounds 1–2 were judged on a device; §3–§7 are reasoned and schema-valid. Expect one pass on `forest` strength and on whether `peak` survives §6's own warning.
- **The lines radiating from Genoa's port** (visible in the round-2 screenshot, presumably ferry or shipping routes) have no obvious id in the taxonomy. Unresolved; catalogue it if it proves to be noise.
