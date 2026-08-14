# Retired Google cloud map styles (Phase 6 history)

> Retired by ADR-0186 Phase 4 on 2026-08-14. These JSON files are not consumed by the app and need
> no Map ID or frontend environment variable. The live light and dark styles are authored in
> `frontend/src/lib/map-style.ts`; the material below remains only as renderer-migration history.

The two cloud map styles behind the embedded map ([ADR-0121](../../decisions/0121-embedded-map-phase-6-design.md)), as importable JSON:

| File                      | Map ID           | Env var                        | Live?                            |
| ------------------------- | ---------------- | ------------------------------ | -------------------------------- |
| `waypoint-map-day.json`   | `waypoint-day`   | `VITE_GOOGLE_MAPS_MAP_ID`      | Yes                              |
| `waypoint-map-night.json` | `waypoint-night` | `VITE_GOOGLE_MAPS_MAP_ID_DARK` | No — inert until dark mode ships |

The palette these files carry was redesigned in [ADR-0125](../../decisions/0125-map-canvas-terrain-vocabulary.md) after the first version was seen on a real phone and read as lifeless. **Read that ADR before changing a colour here** — it carries the measurements, the two rejections it reverses, and the chroma ceiling that keeps the ground from fighting the pins.

## The schema is cloud-based maps styling (CBMS), not the legacy styler array

**This matters more than it looks.** There are two Google map-style JSON formats and they are **not** interchangeable — Google states the cloud schema is not backward compatible with embedded JSON style declarations:

|          | Legacy (embedded `styles` option)      | **CBMS (what the Console imports)**                          |
| -------- | -------------------------------------- | ------------------------------------------------------------ |
| Shape    | a bare **array**                       | an **object** with a `styles` array                          |
| Selector | `featureType` + `elementType`          | a single dotted **`id`** (`pointOfInterest.recreation.park`) |
| Values   | `stylers: [{ color }, { visibility }]` | `geometry` / `label` objects with named properties           |

The files here are CBMS. Authoring them in the legacy format was tried first and rejected by the Console — recorded so nobody "fixes" them back.

The rules the schema enforces, all of which the files obey:

- **Top level:** only `variant` (`light`/`dark`), `backgroundColor`, `monochrome`, `metadata`, `styles`. No other keys.
- **Colours are 6-digit hex only** (`^#[0-9a-fA-F]{6}$`) — no shorthand, no 8-digit alpha. Transparency is a **separate** `fillOpacity` / `strokeOpacity` / `textFillOpacity` (0–1, steps of 0.01).
- **`strokeWidth`** is 0–8 in steps of 0.125.
- **`visible`** is a boolean **or** a per-zoom object keyed `z00`–`z22` — which is the hook if a feature ever needs to appear only past a zoom.
- **Allowed properties differ per feature id, and so does whether an id has `geometry` at all.** `geometry` on `political` takes only `fillColor`/`visible`; on `political.border` the key is **`color`**, not `strokeColor`; POI labels add `pinFillColor`/`pinGlyphColor`/`pinOutlineColor`; **`natural.water.lake` / `.river` / `.ocean` are label-only** (which is why inland water cannot be coloured separately from the sea). A property that is legal on one id is a validation error on another.

### Validate before importing — the schema is vendored here

`cbms-json-schema.json` in this directory is Google's published schema, committed verbatim. It is vendored rather than fetched because `developers.google.com` is **not reachable from agent/sandbox sessions** (the egress proxy answers 403), and a pass that could not validate is exactly how an invalid id (`landCover.iceAndSnow` — the real one is `landCover.ice`) and two ids styled with properties they do not have got as far as review.

```
npx ajv-cli@5 validate --spec=draft7 -s docs/design/map-styles/cbms-json-schema.json \
  -d docs/design/map-styles/waypoint-map-day.json \
  -d docs/design/map-styles/waypoint-map-night.json
```

Both currently report `valid`. **Re-run it after any edit** — the per-id differences above make a hand edit easy to get wrong in a way only a validator catches. Refresh the vendored copy from `https://developers.google.com/static/maps/cbms-json-schema.json` when Google adds feature types.

## How to apply

[Map styles](https://console.cloud.google.com/google/maps-apis/studio/styles) → **Create style** → **Import JSON** → paste the file's contents → save under the matching name → **Associate map IDs** → tick the Map ID above.

A style edit or a new association takes **up to ~6 hours** to appear on a live map.

> **The Console is not the source of truth.** A colour tweaked only in the Console exists nowhere in git and the next import silently reverts it — which already happened once (the sea was made bluer by hand and the repo file didn't carry it). Change the file here, validate, then import.

## Why these values

The brief is ADR-0106 §C — **quiet base, loud pins** — as re-read by [ADR-0125](../../decisions/0125-map-canvas-terrain-vocabulary.md): _quiet_ means **low chroma, not grey**. Three rules generate the whole palette, and they matter more than any single hex:

1. **Land is warm (~43°), water is cool (~206°),** both under 35% saturation. Temperature contrast separates ground from sea without spending any colour budget.
2. **Built mass is achromatic, nature is chromatic.** City and countryside are told apart by _saturation_ at nearly equal lightness (`urbanArea` chroma 3.0 against `forest` 13.6), leaving lightness free for the figure-ground stack.
3. **Every ground tone stays below chroma 14 and above L\* 78** (day). The five pin hues run chroma 27.8–51.8 — so the ground reads, and still cannot compete.

| Map element                                    | Day                                                | Night                                              | Note                                                                     |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `natural.base` / `.land`, `backgroundColor`    | `#efebe1`                                          | `#191e2c`                                          | one step off `--paper`; night lifts off `--screen` so a coast exists     |
| `natural.water`                                | `#b0c6d7`                                          | `#08121d`                                          | 14.3 L\* below the land (was 4.4)                                        |
| `natural.land.landCover`                       | `#dae4d4`                                          | `#1e291b`                                          | parent fallback: vegetation                                              |
| `…landCover.forest`                            | `#cfe0c9`                                          | `#1f301c`                                          | the strongest natural green                                              |
| `…landCover.shrub`                             | `#e0e5d8`                                          | `#22261c`                                          | above the treeline                                                       |
| `…landCover.crops` / `.dryCrops`               | `#e4e7d5` / `#eae7d8`                              | `#25261c` / `#28261c`                              | farmland, warm                                                           |
| `…landCover.tundra`                            | `#e1e7e6`                                          | `#202725`                                          | cold and barren, near-achromatic                                         |
| `…landCover.ice`                               | `#eff5f7`                                          | `#2f4049`                                          | glaciers — the only ground _lighter_ than the land                       |
| `…landCover.sand` / `recreation.beach`         | `#eee5d3`                                          | `#2a2720`                                          | desert and beach                                                         |
| `infrastructure.urbanArea`                     | `#e2ded9`                                          | `#20263b`                                          | built mass, achromatic                                                   |
| `infrastructure.businessCorridor`              | `#e2dbd5`                                          | `#302520`                                          | where the shops are, as a _zone_ not a pin                               |
| `infrastructure.building`                      | `#dbd5cf`                                          | `#222c40`                                          | `fillOpacity: 0.6` — texture, never figure                               |
| Road fills: local / arterial / highway         | `#f6f4ed` / `#fbfaf6` / `#ffffff`                  | `#222b3e` / `#29364a` / `#30445a`                  | casings ~8 L\* under each fill (day), ~5 over (night)                    |
| `noTraffic.pedestrianMall`                     | `#f3efe6`                                          | `#2d2920`                                          | exactly `--paper` — an old town _is_ the app's paper                     |
| `noTraffic.trail`                              | `#e4e9e1` / stroke `#c1d0b9`                       | `#21281f` / `#293625`                              | a path through nature, not a small road                                  |
| `recreation.park`                              | `#dde3d7`                                          | `#1e271b`                                          | **the quiet green** — pins land here                                     |
| `recreation.natureReserve`                     | `#d2dec7`                                          | `#1e2d1a`                                          | the strong green — pins don't                                            |
| `recreation` (catch-all)                       | `#dfe4dc`                                          | `#1f271d`                                          | golf / sports / zoo stop rendering as blank land                         |
| `transit.airport`                              | `#dfe1e5`                                          | `#21262e`                                          | cool neutral infrastructure                                              |
| Google sights: pin fill / glyph / outline      | `#c9ccd4` / `#4b5568` / `#ffffff`                  | `#414b61` / `#c2c6cf` / `#191e2c`                  | chroma 5.0 — achromatic on purpose (see below)                           |
| `recreation.peak` pin                          | fill `#efebe1`, glyph `#847b6c`, outline `#ddd5ca` | fill `#191e2c`, glyph `#8592ab`, outline `#273042` | coloured into the ground                                                 |
| `political.border`                             | `#b0b7c4`                                          | `#353f57`                                          | 18.9 L\* off the land (was 9.4), so countries read at continent zoom     |
| Label ink: city / country                      | `#16233d` (`--ink`)                                | `#e7eaf2`                                          | halo = the land                                                          |
| Label ink: state, natural, natureReserve, peak | `#6c7488` (`--muted`)                              | `#93a0b8`                                          |                                                                          |
| Water labels                                   | `#486175`                                          | `#8592ab`                                          | a slate that survives the deeper water (`--faint` measured 1.49:1 on it) |
| Highway labels                                 | `#847b6c`                                          | `#8592ab`                                          | warm faint, so the ribbon stays quiet                                    |

### Sights on, commerce off

`pointOfInterest` labels are still off **at the root** — that one line takes every POI pin, glyph and name with it, and it is what keeps the canvas quiet. A **sights** set is then re-enabled over it (ADR-0125 §6), because a travel map that doesn't show the Eiffel Tower isn't quiet, it's uninformative:

| On                                                                                                                                                                 | Off                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entertainment` (attraction, museum, historic, arts, themePark), `landmark`, `recreation.zoo`, `recreation.peak`, `recreation.natureReserve`, water / island names | `entertainment.casino`, `entertainment.cinema`, `other.placeOfWorship`, and everything commercial — restaurant, cafe, bar, winery, shopping, grocery, bank, atm, gasStation, parkingLot |

The `entertainment` **parent** carries the treatment so a feature type Google adds later inherits it; `casino`/`cinema` are switched back off by name. `placeOfWorship` stays off because a famous cathedral is already a `landmark`, while the id itself pins every neighbourhood church.

**Google's pins and ours coexist by chroma, not lightness:** Google's sights get a light neutral pin (`#c9ccd4`, chroma 5.0) with a dark glyph and white ring; ours are the five category hues at chroma 27.8–51.8. Grey pin = a thing that exists, coloured pin = a thing on your trip. `peak` goes further and colours its pin into the ground — a mountain wants a name more than a marker.

**These labels are drawn, and not tappable.** `MapPane` sets **`clickableIcons: false`** (ADR-0125 §6's 2026-07-30 amendment), so Google never answers a tap on one with its own info window — a card on the same canvas band ours occupies at the `map` stop (ADR-0122 §7), un-styleable and LTR. Nothing in this file changes with it: `clickableIcons` is the **tap**, the style is the **label**, and the sights set above is the part that matters. A tap that lands on a sight is now an ordinary canvas tap and clears the selection, as every canvas tap does.

### Also suppressed

- **Road labels are off at `infrastructure.roadNetwork`, re-enabled only for highways**; transit stations, road shields, signs, direction arrows and intersection labels are off. Street names are noise under a pin, but a highway ribbon is how you read a region at ADR-0121 §7's extent-fitted zoom.
- **`political.landParcel`, `.neighborhood`, `.sublocality`** are off.

## No per-mode (Trip / Plan) styles

Deliberate, and recorded so it is not re-proposed. Mode identity lives in chrome and in map **figures** — the Plan-only dashed connector and the Trip-only amber next-stop cue (ADR-0121 §10/§6) — never in the base canvas:

- `mapId` is a **construction-time** property, so swapping it per mode re-creates the map and bills a fresh Dynamic Maps load on every mode toggle — exactly what ADR-0121 §4 forbids.
- `--plan` violet flooded across the ground is the colour flood ADR-0106 §C bans, and would fight the category pins for attention.
- Day/night is different in kind: the theme signal is real, so the canvas has no choice but to follow.

## When tokens change

These files are a **manual mirror** of `tokens.css`, not generated from it — cloud styling lives in Google's Console, so no build step can keep them in sync. If the palette moves, edit both, re-validate, re-import. The table above is what makes that mechanical rather than a redesign; the three rules under "Why these values" are what to preserve when a hex has to move.

## What has not been seen rendered

The ground (warm land, cool water, the value range) **was** judged on a real phone across two rounds. The **terrain layer and the sights layer** — the land-cover band, trails, pedestrian malls, business corridors, the park/reserve split, `peak`, and Google's neutral sight pins — are schema-valid and reasoned from the tokens but have not been seen. Expect one pass on `forest` strength, on how loud the sight pins actually read at city zoom, and on whether `peak` earns its place. ADR-0121 §13 states the standing limit: a rendered Google map cannot be exercised in this repo's suite. Fix findings **here**, not only in the Console.

One unresolved observation from the round-2 screenshot: **lines radiating from Genoa's port** (presumably ferry or shipping routes) match no obvious id in the taxonomy. Catalogue it here if it proves to be noise.
