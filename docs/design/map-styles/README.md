# Map styles (cloud-based styling, Phase 6)

The two cloud map styles behind the embedded map ([ADR-0121](../../decisions/0121-embedded-map-phase-6-design.md)), as importable JSON:

| File                      | Map ID           | Env var                        | Live?                              |
| ------------------------- | ---------------- | ------------------------------ | ---------------------------------- |
| `waypoint-map-day.json`   | `waypoint-day`   | `VITE_GOOGLE_MAPS_MAP_ID`      | Once imported — not yet associated |
| `waypoint-map-night.json` | `waypoint-night` | `VITE_GOOGLE_MAPS_MAP_ID_DARK` | No — inert until dark mode ships   |

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
- **Allowed properties differ per feature id.** `geometry` on `political` takes only `fillColor`/`visible`; on `political.border` the key is **`color`**, not `strokeColor`; POI labels add `pinFillColor`/`pinGlyphColor`/`pinOutlineColor`; several ids take `label` only or `geometry` only. A property that is legal on one id is a validation error on another.

### Validate before importing

Both files are checked against Google's published schema, so "valid" is a verified claim rather than an assurance:

```
curl -o cbms.json https://developers.google.com/static/maps/cbms-json-schema.json
npx ajv-cli@5 validate --spec=draft7 -s cbms.json \
  -d docs/design/map-styles/waypoint-map-day.json \
  -d docs/design/map-styles/waypoint-map-night.json
```

Both currently report `valid`. Re-run it after any edit — the per-id property differences above make a hand edit easy to get wrong in a way only a validator catches.

## How to apply

[Map styles](https://console.cloud.google.com/google/maps-apis/studio/styles) → **Create style** → **Import JSON** → paste the file's contents → save under the matching name → **Associate map IDs** → tick the Map ID above.

A style edit or a new association takes **up to ~6 hours** to appear on a live map.

## Why these values

The brief is ADR-0106 §C — **quiet base, loud pins** — so every colour is taken from `frontend/src/styles/tokens.css` rather than picked by eye. The canvas has to read as the same surface as the app around it, and the pins have to be the only loud thing on it.

| Map element                                         | Token                         | Day       | Night                 |
| --------------------------------------------------- | ----------------------------- | --------- | --------------------- |
| `natural.base` / `natural.land`, `backgroundColor`  | `--screen`                    | `#e7eaef` | `#0f1726`             |
| `infrastructure.roadNetwork` fill                   | `--card`-adjacent             | `#f4f6f8` | `#1a2740`             |
| `…road.highway` fill                                | `--card`                      | `#ffffff` | `#243352`             |
| Road / rail / border strokes                        | `--line` flattened            | `#dfe3ea` | `#22304d`             |
| `natural.water`                                     | cooler step off `--screen`    | `#d7dee8` | `#0a1120` (`--board`) |
| Label text (`natural`, `political.stateOrProvince`) | `--muted`                     | `#6c7488` | `#93a0b8`             |
| `political.city` / `countryOrRegion` label          | `--ink`                       | `#16233d` | `#e7eaf2`             |
| Label halo (`textStrokeColor`)                      | `--screen` (matches the base) | `#e7eaef` | `#0f1726`             |
| Highway / water labels                              | `--faint`                     | `#98a0b0` | `#8592ab`             |
| `landCover` / `urbanArea`                           | one step off `--screen`       | `#e2e6ec` | `#131f38`             |
| `pointOfInterest.recreation.park`                   | desaturated cool green        | `#dde5e1` | `#16283a`             |

Three deliberate suppressions, all of them "POI clutter dropped":

- **`pointOfInterest` labels are off at the root**, which takes every POI pin, glyph and name with it. This is the strongest single move toward "loud pins": with Google's own POI markers gone, our category teardrops are the only figures on the canvas.
- **Park and nature-reserve _geometry_ is switched back on.** A flat grey city is disorienting — green mass is spatial orientation, not clutter. Their labels stay off with every other POI label.
- **Road labels are off at `infrastructure.roadNetwork`, re-enabled only for highways**; transit stations, road shields, signs, direction arrows and intersection labels are off; rail tracks stay faint. Street names are noise under a pin, but a highway ribbon and a rail line are how you read a city at ADR-0121 §7's extent-fitted zoom.

Water is a **cooler, darker step off `--screen`** rather than any blue from the palette. A saturated blue would be a colour flood the budget (ADR-0028) has no room for, and would compete with the teal that means "location affordance".

**Buildings** keep a faint fill at `fillOpacity: 0.6` — enough to give the base texture at street zoom without becoming figure.

## No per-mode (Trip / Plan) styles

Deliberate, and recorded so it is not re-proposed. Mode identity lives in chrome and in map **figures** — the Plan-only dashed connector and the Trip-only amber next-stop cue (ADR-0121 §10/§6) — never in the base canvas:

- `mapId` is a **construction-time** property, so swapping it per mode re-creates the map and bills a fresh Dynamic Maps load on every mode toggle — exactly what ADR-0121 §4 forbids.
- `--plan` violet flooded across the ground is the colour flood ADR-0106 §C bans, and would fight the category pins for attention.
- Day/night is different in kind: `--screen` itself remaps under `data-theme="dark"`, so the canvas has no choice but to follow.

## When tokens change

These files are a **manual mirror** of `tokens.css`, not generated from it — cloud styling lives in Google's Console, so no build step can keep them in sync. If the palette moves, edit both, re-validate, re-import. The mapping table above is what makes that mechanical rather than a redesign.

## Not verified against a rendered map

Both files are schema-valid and authored from the tokens, but **neither has been seen on a live map** — the render cannot be exercised in this repo's suite (ADR-0121 §13 states that limit). Expect one adjustment round on a real device, most likely water contrast and the park fill, the two values reasoned to from the palette rather than lifted from it. Fix them **here**, not only in the Console, or the next import silently reverts the fix.
