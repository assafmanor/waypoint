# 0186 — The map is ours, and it works on a plane

**Date:** 2026-08-13
**Status:** Accepted (design). Reverses [ADR-0106](0106-maps-and-places-epic-scope-and-phasing.md) §7 and [ADR-0121](0121-embedded-map-phase-6-design.md) §11/§14 on offline tiles, and replaces ADR-0121 §3's renderer choice.
**Supersedes on the rendering question only.** Everything ADR-0121 decided about _what the map says_ — the pin ladder, the camera's rules, the sheet, the day connector, the filters — is untouched and is the requirement this must reproduce.

## Context

**Field report #35 has now had four causes and three rounds of fixes** (sessions 247, 256, 257, 262). Two of them were found and fixed on 2026-08-13:

- `@vis.gl/react-google-maps` keeps the Maps-API loading status in **module state, written once**, so a single transient failure left the map dead for the life of the page and no retry could clear it (session 262, ADR-0121's first 2026-08-13 amendment).
- The tiles watchdog **unmounted the in-flight map**, so a load slower than the bound could never finish (session 262b, the second amendment).

Both were real. Neither addresses the shape of the problem, which is this: **the map is the one screen in this app that cannot work without fetching third-party code at runtime, and that code installs page-global, one-shot state we do not control.** Every cause so far has been a variation on that sentence. The list beside the map, the pins, the photos and the place data are all already offline-capable through Dexie; only the ground under them is not.

The owner asked the question that reframes it: _"is it possible to add offline maps? It would both solve the map not loading issue I think, and also it would give us a map that is available offline (on the flight etc)."_

**And the reason we said no is wrong.** ADR-0106 §7 records offline tiles as _"a PWA limitation the PRD already accepts."_ That is not a PWA limitation. A browser can render a map with no network at all. It is a **Google** limitation, and a double one: the Maps JS API has no offline mode, and the Maps Platform terms forbid storing or pre-fetching tiles. Both are properties of the vendor, so they are answered by changing the vendor rather than by accepting the loss.

**What makes this tractable rather than a rewrite** is a fact this repo earned on purpose. The Google JS API appears in exactly **eight non-test files, all of them rendering** — `MapPane`, `useMapCamera`, `useCanvasGestures`, `map-camera`, `map-config`, `constants`, `screens/Map.tsx`'s config latch, and `DevMapProbe`. Place search, autocomplete, photos and enrichment **never touch it**: they already go through our own backend proxies (ADR-0108/0110). The basemap is the only thing coupled to Google.

## Decision

### 1. Replace the renderer. Do not put a second one beside it

**MapLibre GL JS**, rendering **PMTiles** archives built from **Protomaps'** OSM-derived planet basemap.

Not "Google when online, ours when offline". Two renderers is two pin implementations, two cameras, two gesture layers, two styles and two sets of bugs — the exact shape root `CLAUDE.md` rule 8 exists to prevent and that ADRs 0078/0079/0094/0095 all exist to undo. It would also keep the failure class this is meant to delete.

**And we use `maplibre-gl` directly, with no React wrapper.** `react-map-gl` exists and would shorten the port, but the bug that started this was a wrapper's module-global lifecycle state, and our actual usage is seven methods (§2). A wrapper here buys ergonomics we do not need in exchange for a lifecycle we would not own. `MapPane` keeps a plain `useRef` + `useEffect` holding one map instance, which is what ADR-0121 §4 always described anyway.

**`maplibre-gl` is bundled, not fetched at runtime**, and that is the whole point: there is no script tag, no page-global loader, no one-shot status, and nothing to poison. It is code-split behind the Map tab so it does not enter the first-paint path.

### 2. The port is small, and this is why

The full Google surface, counted rather than remembered:

| What we call today                        | MapLibre                            | Note                                                                                                                                   |
| ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `map.getZoom()`                           | `map.getZoom()`                     | —                                                                                                                                      |
| `map.moveCamera({center, zoom})`          | `map.jumpTo(...)` / `easeTo(...)`   | eased vs instant becomes explicit, which ADR-0129 §3 wanted anyway                                                                     |
| `map.getCenter()`                         | `map.getCenter()`                   | **`.lat`/`.lng` are properties, not methods.** `useMapCamera.ts:350` has a comment about exactly this Google trap; the trap disappears |
| `map.getDiv()`                            | `map.getContainer()`                | —                                                                                                                                      |
| `map.getProjection().fromLatLngToPoint()` | `map.project()` / `map.unproject()` | screen pixels directly — `latLngAtOffset`'s world-coordinate arithmetic gets shorter                                                   |
| `map.addListener('idle'/'zoom_changed')`  | `map.on('idle'/'zoom')`             | —                                                                                                                                      |
| `map.fitBounds(b, padding)`               | `map.fitBounds(b, { padding })`     | padding is already an object, so ADR-0128 §2's card reserve maps straight across                                                       |

Three larger pieces, all of which get **simpler**:

- **Pins port untouched.** Our markers were never Google's — ADR-0121 §6 built them from our own DOM so the `.map-pin` grammar (ADR-0123's `--pin-u` ratio system, the tiers, the tags, the outcome marks, the photo head) is CSS on real elements. `new maplibregl.Marker({ element })` takes that same node. **Nothing in the pin ladder changes.**
- **The day connector gets a real dashed line.** ADR-0121 §10 had to fake it: _"The Maps API has no `strokeDasharray`, so a dash is a repeating symbol along a fully transparent stroke."_ MapLibre has `line-dasharray`. The hack is deleted.
- **`clickableIcons={false}` and `disableDefaultUI` stop existing as concepts.** There is no vendor POI layer to suppress and no vendor chrome to switch off — we author the style and add the two controls we want. ADR-0121 §12's "our controls, not Google's" stops being a thing we enforce and becomes a thing that is true.

The reason this is cheap is ADR-0121 §13's own testing posture paying off: every _decision_ about the map already lives in pure functions in `lib/` with no Google in the process. Those files do not change.

### 3. One tile source, read remotely until it is local

The single idea that keeps this from becoming two systems.

PMTiles is a single-file archive addressed by HTTP range requests, and the same `pmtiles` protocol adapter reads it either way. So:

- **Before a download exists**, the protocol range-reads the archive **through our backend**, which fronts the upstream source. Same renderer, same style, same code path, just a network read.
- **After a download exists**, the protocol reads the local archive. Same everything, no network.

There is no "offline mode" branch in the renderer, and no second code path to keep in step. Offline is the absence of a fetch, not a feature flag.

**Remote reads go through our backend, never straight to a vendor** — the rule ADR-0108/0110 already set for every Google call, applied to tiles for the same reasons: any key stays server-side, we can cache, and we can change source without shipping a client.

### 4. What gets downloaded: a coarse world, plus one small box per cluster

The naive model — a bounding box per trip — is wrong, and the owner is who found it: _"what if the trip consists of a cross country trip? What about the layovers? Places outside of the trip countries?"_ Tokyo→Kyoto→Osaka is a tolerable box; Iceland's ring road is a huge box that is mostly ocean; Paris **and** Tokyo is a box containing the northern hemisphere.

So the unit is neither the trip nor the country. It is **the coordinates the trip actually contains**:

- **A coarse world layer, z0–6, downloaded once and shared by every trip.** A few MB. Nowhere is ever blank: coastlines, borders, major cities, everywhere on earth. This is the whole answer to "places outside the trip countries" — everywhere is _some_ map, just coarser.
- **One z7–14 extract per geographic cluster of the trip's places.** Cluster the coordinates, box each cluster, and skip the empty space between them.
- **Layovers need no special case.** A flight booking's endpoints are already `Place` rows with coordinates — that is what ADR-0166 §18's airport labelling is built on. Cluster over _all_ of a trip's places, including booking endpoints, and a layover airport is simply another cluster with a small box around it.
- **Growth is a top-up, not a re-download.** A place added in a new region adds one small extract.

z0–14 is the detail floor that makes the map worth having on the ground: street names and building footprints, enough to walk a neighbourhood. z15+ is refused as the storage lever it is.

### 5. Automatic, and what makes automatic safe

The download happens without being asked for (owner's call). That is only defensible if it cannot surprise you, so it carries four obligations:

- **A metered-connection check where one exists.** `navigator.connection` is Chrome/Android only — **Safari does not implement it, so on iOS we cannot tell wifi from cellular.** Since the entire point of this app is being abroad, an automatic 80 MB download on roaming data is a real bill. So: automatic where metering is detectable, and a **one-time per-trip prompt** where it is not. Same feature, degrading to a question only on the platform that cannot answer safely.
- **A storage check before, not an error after.** `navigator.storage.estimate()` gates the download, and `persist()` is requested so the browser does not evict the map during the flight it was downloaded for.
- **A visible size and a manual delete.** Non-negotiable once it is automatic: "offline maps · 180 MB · manage", with per-trip rows. It is the escape hatch, and it is also how anyone would ever notice the budget misbehaving.
- **Never for a trip that has already ended.** Do not fetch what §6 would immediately evict.

### 6. Retention: an extract is a cache, never data

**The principle that makes all of the above safe.** Nothing a person authored lives in a tile archive; losing one costs a re-download and nothing else. That licenses aggressive eviction, and aggressive eviction is what earns the right to download automatically.

1. **Delete on trip end plus a grace window** — not at `endDate`, because you fly home _after_ it and the return journey is exactly when you still want the map.
2. **Delete on trip delete, or on being removed from the trip** (ADR-0039). That one is correctness, not space.
3. **A total byte budget with LRU eviction.** The real safety net, because rules 1 and 2 miss the case that will actually bite: several trips planned at once, none of them ended.
4. **The trip you are currently in is pinned** and never evicted, even when it is least-recently-used. Otherwise the budget can take the map out from under you mid-flight.
5. **Survive it being gone anyway.** iOS evicts under storage pressure regardless of what we want, so a missing archive falls back to reading remotely and re-downloads quietly. Never an error state.

Note the tension rule 5 creates with `persist()` in §5, because it is not obvious: persisted storage is exempt from _browser_ eviction, which makes **our** budget the only bound. Rule 3 therefore has to be genuinely enforced, not advisory.

**This is new infrastructure, and it is deliberately shaped for a second consumer.** `doc-cache.ts` evicts only _dead_ versions — correctness, not space — so document blobs are unbounded today too. The budgeted-LRU store is built for tiles with an interface blobs can adopt, and blobs are **not** migrated in the same change (rule 8's "ask before the substantial refactor").

### 7. The style: ADR-0125's decisions survive, its implementation does not

ADR-0125 measured the terrain vocabulary and its numbers are the acceptance criteria here, not a starting point: warm low-chroma land against cool water, built-vs-natural split by chroma rather than lightness, park and nature reserve split by role, the curated **sights** set on with all commerce off, and the stated ceiling that keeps it a ground (land below chroma 14, pins 27.8–51.8).

What changes is where that lives: a Google cloud style keyed by two Map IDs becomes **a style JSON in this repo**. Three consequences, and the middle one is the reason to be pleased about it:

- It is **reviewable in a diff** and versioned with the code, where a cloud style was configuration nobody could see.
- **Dark mode gets cheaper and better.** Today ADR-0121 §11 mints two Map IDs and latches one at construction, so a theme flip cannot reach the canvas already drawn. A style JSON is swappable on a live map from **one** downloaded archive — no second Map ID, no second download, and no re-instantiation.
- It is real design work, and the biggest non-code cost in this ADR. It gets a mockup (`mockups/`) and is measured against ADR-0125's own numbers before it ships.

### 8. What this deletes

Worth stating, because it is most of the complexity the map has accumulated:

- **ADR-0121 §4's entire billing model.** "One `google.maps.Map` per tab visit, and never a second" exists because Dynamic Maps bills per instantiation. Our own renderer over our own tiles does not, so the invariant that shaped `MapPane`'s memoisation, its retry, its teardown and half its comments becomes an ordinary performance concern.
- **`MAP_LOAD_TIMEOUT_MS.TILES` and the whole watchdog**, along with `mapFailed`, `tilesLate`, `__resetModuleState`, and the four causes of #35. There is no third-party script to fail to load.
- **§11's "offline the map is absent".** The map becomes the part of the tab that works offline **best**, and the near-me chip is the only thing that still has to go (you cannot re-locate without a fix). This is the user-visible headline: the Map tab stops being the one screen that needs a network.
- **The three `VITE_GOOGLE_MAPS_*` vars and the graceful-absence path they gate.** Graceful absence does not disappear — a trip with no downloaded extract and no network still shows the coarse world layer, which is a better floor than a list.

### 9. What this is not

**Not offline search, and not routing.** Place search, autocomplete and enrichment stay online through the existing proxies; this is the basemap. **Not turn-by-turn** — ADR-0121 §14's paid-Routes line is untouched. **Not a change to any decision about what the map says** — the pin ladder, the camera's rules, the sheet, the filters and the day connector are requirements here, not open questions.

## Consequences

- **MapLibre requires WebGL, and so does the Google renderer.** If the residual #35 failure on the owner's phone turns out to be GPU or context-loss related — **still untested rather than excluded**, unchanged since session 257 — this does not fix it. That is the single most important thing to learn before Phase 2, and it is why §Phasing puts the fourth fix on a real phone first.
- **Attribution changes and is not optional.** Google's logo requirement is replaced by OpenStreetMap's ODbL attribution, which must be visible on the canvas. ADR-0121 §5's layout already reserves that band, so this is a copy change, not a layout one.
- **Backend gains storage and egress**, which it did not have before: fronting the upstream archive, and building/serving per-trip extracts. Sized in Phase 1, before anything is built on top of it.
- **The app bundle grows** by MapLibre, offset by the Google script no longer being fetched at runtime and by the code-split in §1. Measured, not assumed.
- **OSM data is not Google data.** Coverage and freshness differ, and in some places OSM is better and in some worse. This is a real trade and the owner should see the destination rendered in both before Phase 2 commits.

## Alternatives considered

- **Keep Google, add offline tiles as a fallback.** Rejected: two renderers, two of everything, and it keeps the failure class rather than deleting it (§1). It is also the option that _looks_ lowest-risk and is not — the fallback path would be the one nobody exercises until the flight.
- **Leaflet + raster tiles.** The genuinely WebGL-free option, and the reason it stays on the table: if #35 turns out to be a GPU fault, this is the answer. Rejected as the default because raster is roughly 3–5× the storage for the same area, cannot restyle for dark mode without a second tileset, and cannot rotate or scale text — losing ADR-0125's whole vocabulary and ADR-0123's pin-size system in exchange.
- **A paid vector vendor (MapTiler, Stadia).** Rejected for now: it reintroduces a key, a bill and a runtime dependency to solve a problem caused by a key, a bill and a runtime dependency. Protomaps' builds are free and self-hostable. Revisit only if operating the archive proves worse than paying someone to.
- **Keep patching Google.** This is round four. Each fix was correct and the class survived each one.

## Phasing

Each phase is reviewable alone, and none depends on a later one.

- **Phase 0 — the unknowns, measured before anything is built.** (a) Does the fourth fix hold on the owner's phone, and if not, **is WebGL implicated** — because that answers vector-vs-raster. (b) Can a bbox extract be pulled from a remote planet archive over range requests, or must we host the planet? (c) Actual extract size at z0–14 for a dense city. (d) iOS storage headroom on the owner's device. Output is numbers, not code.
- **Phase 1 — the tile pipeline.** Backend: front the upstream archive, build a per-trip extract from clustered coordinates, serve both. No frontend change; verified with the archive read remotely by a script.
- **Phase 2 — the renderer swap, online only.** `MapPane` on MapLibre reading remotely, with the style JSON to ADR-0125's numbers. Everything ADR-0121 decided must still be true, and the pin/camera/gesture tests are the check that it is.
- **Phase 3 — download, storage and retention.** The budgeted-LRU store, the automatic/prompt policy, the manage surface, the eviction rules. Offline is the absence of a fetch, so this phase is about §5 and §6 rather than about rendering.
- **Phase 4 — delete the old world.** Google renderer, its config vars, the watchdog, the billing invariant, and every comment that exists because of them.

## Still open

- **Every item in Phase 0.** None of them is asserted anywhere above; where this document needed one it says so.
- **Whether the coarse world layer is z0–6 or a different floor** — chosen for a few MB and "nowhere is blank", not measured.
- **Cluster geometry** — the radius that separates two clusters from one, and the padding around each box. A number to measure against real trips, not to pick here.
- **The grace window in §6 rule 1**, and the byte budget in rule 3. Both are owner-facing numbers.
- **Whether the budgeted-LRU store takes document blobs later** (§6). Named so it is a decision rather than a drift.
