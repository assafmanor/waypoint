# 2026-08-21 — The bare online map: a build id with an expiry date

**Fixed**, from a field report:

> _"A new bug in the maps. When online, you can't see locations (cities, streets, country borders, names in general - bare map). Saved maps when offline on the other hand do have them."_

Amendment: [ADR-0187's 2026-08-21 entry](../decisions/0187-detail-is-live-and-an-extract-is-only-for-the-plane.md).

## The cause, in one line

`MAP_PLANET_BUILD = '20260813'` — pinned in `packages/shared` on 2026-08-14 — names an upstream object that upstream deletes. Measured from the sandbox on the day of the report:

| build      | `build.protomaps.com` |
| ---------- | --------------------- |
| `20260821` | 200                   |
| `20260820` | 200                   |
| …          | 200                   |
| `20260815` | 200                   |
| `20260814` | **404**               |
| `20260813` | **404**               |
| `20260812` | **404**               |

Seven dailies, retained. The pin was eight days old, so every live range read reached an object that was gone, `MapController.planet` answered `502`, and the detail source drew nothing.

## Why the symptom is "bare" and not "broken"

Two facts of the design meet, and neither is wrong on its own:

- The style is **one detail source over the coarse world's fills only** — deliberately fills, because taking the world's labels and roads too would draw every city name twice, a few pixels apart, one overzoomed (ADR-0186 §7). Fills are land, water and landcover. So a dead detail source leaves a correct, well-coloured, completely **anonymous** map: coastlines and parks, no cities, no streets, no borders.
- `isGroundSource` counts **either** archive as ground, on purpose ("the coarse one drawing is still a map on screen"). World tiles arrived, so `onFirstPaint` fired, `tilesPainted` latched — and the cue, the retry pill and `MapDiagnostic` all render under `!tilesPainted`. Nothing had anything to say.

The offline path was untouched throughout, which is the report's second sentence: an extract cut while `20260813` still existed is a file on the device, and it has every label in it.

## The fix, and the thing it is not

It is not a bump. Bumping the constant reproduces the bug in seven days, and the safeguard §1 claimed for the pin — "changing one without the other is a compile-time diff" — is worth nothing when the correct action is to change **both**, on a schedule nobody is holding.

So: the server resolves the newest daily upstream actually serves (8 parallel 16-byte probes, checked for the PMTiles magic, 6h TTL, awaited once at boot), and states it on `/me` as `map.liveBuild` — the seam `push.vapidPublicKey` already established for "only the server knows this, and the client needs it before the first gesture". The client builds the path from that answer. `MAP_PLANET_BUILD` is gone; there is no build id left in the frontend to expire.

Three smaller decisions inside it:

- **The route now serves any build inside the retention window, not just today's.** §1's "a stale bundle gets a 404 and falls back" was written for a bundle that could not learn better. A client's id is now at most one `/me` stale and the bytes an id names are immutable, so refusing yesterday's build would blank a map that is reading a perfectly good archive. The open-proxy property is intact: daily shape, inside the window, and upstream serves it — three tests the client controls none of, at most 8 ids probeable, `planet-latest` refused with no request leaving the building.
- **No resolvable build falls back to the world archive as the detail source**, which is what a plane without an extract already does. Labels to z6 beat none, and it means the failure this note is about can no longer present as _nothing_.
- **Extracts read the same resolved source.** `extractArgs` requires its source rather than defaulting to the dead constant. This half had not been reported yet — it only bites the next cut, and it would have taken out the world layer on a fresh deploy.

## Verified against real upstream, not only in the suite

The whole class of bug here is one no unit test could see, so the check was the running backend against the real bucket: boot logged `live map source is planet build 20260821`; `/me` answered `map: { liveBuild: "20260821" }`; `/map/planet-20260821.pmtiles` returned `206` opening with `PMTiles`; `planet-20260820` (a day-old client) `206`; **`planet-20260813` — the id the shipped bundle was asking for — `404`**; `planet-latest` `404`.

## Left open, and named rather than quietly skipped

**A detail source that yields no tiles while the world layer paints is still invisible to the pane.** This fix removes the only known cause; it does not make the class loud. Doing that means counting tiles per source and deciding what "painted" means when one of two ground sources is dead — a change to the pane's failure vocabulary, which is a decision and not a tail of a bug fix. It is on the backlog beside this line.

The general lesson is small and cheap to state: **a value that names somebody else's object needs to know how long that object lives.** The pin was reviewed by three sessions and none of them asked for the retention policy, because "immutable bytes" reads like "immutable URL". It isn't.
