# Map styles (cloud-based styling, Phase 6)

The two cloud map styles behind the embedded map ([ADR-0121](../../decisions/0121-embedded-map-phase-6-design.md)), as importable JSON:

| File                      | Map ID           | Env var                        | Live?                                           |
| ------------------------- | ---------------- | ------------------------------ | ----------------------------------------------- |
| `waypoint-map-day.json`   | `waypoint-day`   | `VITE_GOOGLE_MAPS_MAP_ID`      | Once imported — not yet associated              |
| `waypoint-map-night.json` | `waypoint-night` | `VITE_GOOGLE_MAPS_MAP_ID_DARK` | No — inert until dark mode ships (ADR-0121 §11) |

## How to apply

[Map styles](https://console.cloud.google.com/google/maps-apis/studio/styles) → **Create style** → **Import JSON** → paste the file's contents → save under the matching name → **Associate map IDs** → tick the Map ID above.

A style edit or a new association takes **up to ~6 hours** to appear on a live map. If the Console's JSON import is unavailable (it is the newer path — ADR-0121 §1), the values below are the recipe to set by hand in the visual editor; nothing here depends on the import.

## Why these values

The brief is ADR-0106 §C — **quiet base, loud pins** — so every colour is taken from `frontend/src/styles/tokens.css` rather than picked by eye. That is the point: the canvas has to read as the same surface as the app around it, and the pins have to be the only loud thing on it.

| Map element            | Token                         | Day       | Night                 |
| ---------------------- | ----------------------------- | --------- | --------------------- |
| Base geometry          | `--screen`                    | `#e7eaef` | `#0f1726`             |
| Roads (local)          | `--card`-adjacent             | `#f4f6f8` | `#1a2740`             |
| Roads (highway)        | `--card`                      | `#ffffff` | `#243352`             |
| Road / admin strokes   | `--line` flattened            | `#dfe3ea` | `#22304d`             |
| Water                  | cooler step off `--screen`    | `#d7dee8` | `#0a1120` (`--board`) |
| Label text             | `--muted`                     | `#6c7488` | `#93a0b8`             |
| Locality label text    | `--ink`                       | `#16233d` | `#e7eaf2`             |
| Label halo             | `--screen` (matches the base) | `#e7eaef` | `#0f1726`             |
| Highway / water labels | `--faint`                     | `#98a0b0` | `#8592ab`             |

Three deliberate suppressions, all of them "POI clutter dropped":

- **All label icons are off, globally.** This is the strongest single move toward "loud pins": with Google's own POI glyphs gone, our category teardrops are the only figures on the canvas. Without it, the map competes with itself.
- **`poi` is off entirely, except park _geometry_.** Parks keep a desaturated fill (`#dde5e1` / `#16283a`) because a flat grey city is disorienting — a park is spatial orientation, not clutter. Park _labels_ stay off like every other POI label.
- **Road labels are off except highways; transit labels and stations are off, transit lines stay faint.** Street names at phone size are noise under a pin, but a highway ribbon and a rail line are how you read a city's shape at the fitted zoom (ADR-0121 §7 zooms to the filtered set's extent, which is often district or city scale).

Water is a **cooler, darker step off `--screen`** rather than any blue from the palette. A saturated blue would be a colour flood the budget (ADR-0028) has no room for, and would compete with the teal that means "location affordance".

## When tokens change

These files are a **manual mirror** of `tokens.css`, not generated from it — cloud styling lives in Google's Console, so there is no build step that could keep them in sync. If the palette moves, re-import both. The mapping table above is what makes that a mechanical edit rather than a redesign.

## Not verified against a rendered map

Both files are authored from the tokens and the brief; neither has been seen on a live map (the render cannot be exercised in this repo's test suite — ADR-0121 §13 states that limit). Expect one round of adjustment on a real device, most likely to water contrast and the park fill, which are the two values chosen by reasoning about the palette rather than lifted straight from it.
