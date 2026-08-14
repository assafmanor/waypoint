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

> **Amended 2026-08-13 (session 263c), on the owner asking how large the upstream archive actually is.** It is **127.88 GiB**, and that number was quietly shaping the design in the wrong direction — it made "front the upstream source" read as _proxy every tile range request_, because mirroring 128 GB is obviously unattractive. **We never need the planet.** What we need are slices, and the slices are small: **42.7 MB** for the whole world at z0–6, **22.7 MB** for a city at z0–14. So the backend **builds and stores extracts**, and fetches from upstream **once per area — ever** (5 requests for the world layer, 40 for Tokyo), rather than once per tile forever.
>
> Three things fall out, and the third is the one that settles the fork Phase 1 was carrying:
>
> - **Storage is a non-issue at this scale.** One world layer plus (trips × areas) × ~23 MB: five active trips at three areas each is **~350 MB total**, all of it re-derivable. That is a volume, not a cost decision.
> - **Latency stops being a question.** Tiles are served from our own disk instead of round-tripping a range request to another continent per tile.
> - **The hotlinking courtesy resolves itself**, and in the direction Protomaps' own docs ask for — _"copy the tileset to your own Cloud Storage"_. We copy the ~23 MB we need rather than all 128 GB, and never touch their bucket on a user's tile fetch.
>
> **So there is no range-proxy.** The extract is the download artefact Phase 3 needs anyway, and once it exists, serving the online case from it is free. One artefact, both jobs.

There is no "offline mode" branch in the renderer, and no second code path to keep in step. Offline is the absence of a fetch, not a feature flag.

**Remote reads go through our backend, never straight to a vendor** — the rule ADR-0108/0110 already set for every Google call, applied to tiles for the same reasons: any key stays server-side, we can cache, and we can change source without shipping a client.

### 4. What gets downloaded: a coarse world, plus one small box per cluster

The naive model — a bounding box per trip — is wrong, and the owner is who found it: _"what if the trip consists of a cross country trip? What about the layovers? Places outside of the trip countries?"_ Tokyo→Kyoto→Osaka is a tolerable box; Iceland's ring road is a huge box that is mostly ocean; Paris **and** Tokyo is a box containing the northern hemisphere.

So the unit is neither the trip nor the country. It is **the coordinates the trip actually contains**:

- **A coarse world layer, z0–6, downloaded once and shared by every trip.** Nowhere is ever blank: coastlines, borders, major cities, everywhere on earth. This is the whole answer to "places outside the trip countries" — everywhere is _some_ map, just coarser. **Measured 2026-08-13: 42.7 MB** (4s, 5 range requests). This paragraph originally guessed _"a few MB"_ and that was wrong by an order of magnitude — it is a real one-time download, though still a one-time one. **z0–6 rather than z0–8 is now a measured choice, not a taste:** z0–8 is **525.6 MB**, twelve times the bytes for detail that per-cluster extracts already supply wherever anyone actually goes. If 42.7 MB proves too much on a phone, the lever is z0–5, not the cluster zoom.
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

## Amendment (2026-08-13, session 263b) — drawn, rendered, and three of Phase 0's unknowns closed

The owner asked to see it before committing: _"I'd like to try it and see how it looks. I'd like it to kind of look similar to how it is with Google maps and also support dark and light themes."_ [`mockups/map-basemap-ours-v1.html`](../../mockups/map-basemap-ours-v1.html) is that — and it is the first map mockup in this repo whose **canvas is real**, since every predecessor had to fake the base in CSS behind a browser key and a billed load.

**Phase 0(b) and 0(c) are answered, and 0(c) was wrong by an order of magnitude.** `pmtiles extract` does work against the remote archive: central Tokyo (139.55,35.55 → 139.90,35.80, ~32×28 km) at z0–14 is **22.7 MB**, pulled from the 127.88 GiB daily build in **13.4 s over 40 HTTP range requests**. §4's storage argument is therefore far safer than it claimed — a four-cluster trip lands well under 100 MB, which changes the §5/§6 budget from a tight constraint to a comfortable one. The backend never needs the planet.

**§7 is confirmed rather than assumed.** ADR-0125's palette ported almost verbatim, and the reason is that ADR's own §8: it wrote the vocabulary as **relationships** (warm land against cool water, built achromatic against chromatic nature, everything below chroma 14) rather than as a list of Google feature ids, and relationships are what survive a vendor change. Its §7 pedestrian mall on `--paper` exactly becomes a single flavour key. Both themes come from **one download**, restyled on a live map — the thing two latched Map IDs cannot do (ADR-0121 §11).

**Three findings the render produced and no amount of reading would have:**

1. **`.map-pin` must sit INSIDE the marker element, never be it.** MapLibre positions its marker with `.maplibregl-marker { position: absolute }`; `map-pane.css` sets `.map-pin { position: relative }` (ADR-0123 — the pin's parts position against it). Both are one class deep, so **whichever stylesheet loads last wins**, ours does, and every marker fell into normal flow: six pins stacked into a measured 204px column, painting outside the pane and clipped by its `overflow: hidden`. §2's "the pins port untouched" is true **only** with the wrapper — which is also what vis.gl's `AdvancedMarker` does today, and why the collision has never existed. A build that hands `.map-pin` straight to `new maplibregl.Marker({element})` reintroduces it.
2. **The white ring does nothing in dark.** ADR-0125 §8 describes the pin hues running "with a white ring and a shadow". Measured here, that ring is **1.31:1** against park in light and **1.01:1** in dark, where it is `--card` (`#1a2740`) on a dark ground — so in dark the **fill** carries the separation alone (6.15–9.5:1). Coherent, and worth writing down: dimming the pin fills for dark would remove both separations at once.
3. **MapLibre measures its container once, at construction**, so a pane whose box settles later needs an explicit `resize()`. The app already owns that problem — `lib/observe-resize.ts` watches the pane's own box for ADR-0122 §7's band — so a build wires `resize()` to that existing observer rather than adding a second one (rule 8).

**What the mockup deliberately does not answer**, and neither does this amendment: how it reads on a phone in the hand, and whether OSM's coverage in Japan is good enough in practice. Both are device-pass questions. **Phase 0(a) — the WebGL question — is untouched and is still the one that decides vector-vs-raster.**

## Still open

- **Phase 0(a), the WebGL question** — untouched, and still the one that decides vector-vs-raster. (0(b) and 0(c) are closed by the amendment above; 0(d), iOS storage headroom, still needs the owner's device — though at 22.7 MB per city it is a much smaller worry than it was.)
- ~~**Whether the coarse world layer is z0–6 or a different floor**~~ — **measured 2026-08-13**: z0–6 is 42.7 MB against z0–8's 525.6 MB, so z0–6 stands and z0–5 is the lever if it must come down. See §4.
- **Cluster geometry** — the radius that separates two clusters from one, and the padding around each box. A number to measure against real trips, not to pick here.
- **The grace window in §6 rule 1**, and the byte budget in rule 3. Both are owner-facing numbers.
- **Whether the budgeted-LRU store takes document blobs later** (§6). Named so it is a decision rather than a drift.

## Amendment (2026-08-14, session 269) — Phase 2 is built: the renderer is swapped

`MapPane` renders MapLibre over our own PMTiles. `@vis.gl/react-google-maps` has no live call
site left in the app. What follows is what the build learned that §2 could not.

**§2's "the port is small" held, and the camera is why.** `useMapCamera` (~700 lines) and
`useCanvasGestures` changed by **eight type annotations and no logic** — `google.maps.Map` became
`CameraMap`, and their 76 tests passed unchanged on the first run. Pins changed by **nothing**:
ADR-0121 §6 built them from our own DOM, so `.map-pin` and ADR-0123's `--pin-u` system are
untouched CSS on real elements. That is ADR-0121 §13's testing posture paying off exactly as §2
predicted.

**Two real defects the swap exposed, both in Phase 1, both found by machines rather than by
reading.**

1. **`CameraMap` was short by two methods, and the compiler found it.** `useCanvasGestures`
   read the drag zoom's limits as `map.get('minZoom')` — Google's untyped `MVCObject` accessor,
   which type-checks against _anything_ and so hid itself from §2's count of seven. `getMinZoom`
   / `getMaxZoom` are now stated. This is the counted-the-call-sites rule working: the count was
   right about every method that had a name.
2. **`cameraMapFor().getBounds()` wrapped unconditionally**, so it returned a truthy object for
   a map with no bounds. Two failures in one line: `readMapBounds`'s `if (!bounds)` guard became
   unreachable and then threw inside a React effect, and `useMapCamera` lost the signal it reads
   as _"this map has not rendered, defer the framing to its own `idle`"_ — which is precisely the
   hazard ADR-0121's session-134 entry describes, where an unrendered fit resolves to a wild
   zoom-out and §7's containment guard then makes it permanent. Found only when `MapPane`'s suite
   started driving the real adapter instead of a hand-written Google dialect.

**Three things Phase 2 deliberately did NOT do, each stated so a later session does not read
them as oversights:**

- **The trip extract is not wired. Phase 2 renders the shared z0–6 world layer only, so the
  map is COARSE — no street detail until Phase 3.** Three reasons, and the third is
  disqualifying on its own: `GET /trips/:id/map/extract.pmtiles` cuts the archive
  **synchronously on first request** (~10s for two areas), it sits behind `MembershipGuard` so
  the `pmtiles` protocol's fetch must carry credentials, and `mapStyle` reads **one** source —
  so an extract that fails or 403s renders **nothing**. Shipping that as the experiment would be
  a self-inflicted copy of the bug this migration exists to end. Phase 3 owns the download and
  §6 rule 5 ("survive it being gone") is where the fallback belongs.
- **`mapStyle` still reads one source.** §3's own prose says _"the trip's own archive over the
  shared world layer"_ and the code picks one; making both draw needs the ~70 generated layers
  emitted twice with remapped ids and a `maxzoom` cap so world labels do not double under trip
  labels. That is a measurable render-cost change with no measurement available here, and it is
  Phase 3's, beside the download it protects.
- **The hidden-moment reload and the reload-first retry are kept unchanged.** Both were argued
  from Google's per-instantiation billing and from _"only restarting the app fixes it"_. The
  billing argument is dead and a rebuild is now free — but the measurement that a rebuild never
  recovered this is not, so keeping them is the conservative reading. **The swap is the
  experiment about that, not the answer.**

**What is deleted rather than ported**, confirming §2 and §8: `APIProvider`, `APILoadingStatus`,
`__resetModuleState` (with the page-global that made it necessary — the paragraph explaining
_why_ survives in `MapPane`, since it is the whole case for this ADR), `mapFailed` as a
_script_-load signal, `clickableIcons`, `disableDefaultUI`, `gestureHandling`, the mandatory
`mapId` and its two-slot `colorScheme`, `MapInstanceProbe` (there is no renderer context to
reach), and ADR-0121 §10's faked dashed line — `line-dasharray` is real, so `DASH_SCALE` and
`DASH_REPEAT` go with it. **And the three `VITE_GOOGLE_MAPS_*` vars stop gating anything:**
there is no build configuration left to be missing, so `mapPaneAvailable` is `!offline` and a
checkout draws a map by existing. `MapsConfig` survives for `DevMapTuner` alone and is Phase 4's.

**Four things the build had to add that no amount of reading would have produced:**

1. **The pin's markup reaches its marker through `createPortal`**, which this repo lint-blocks.
   A `maplibregl.Marker` owns its element, and ADR-0121 §6's pins are React. `eslint.config.mjs`
   carries the allowlist entry and the reasoning: a marker is content positioned inside the
   canvas by the renderer, nothing dismisses it, so ADR-0090's back-stack question answers no.
   It is the one allowlist entry that does not call `useOverlay`.
2. **OSM's attribution had to be drawn by us, and nearly was not.** `MapCanvas` passes
   `attributionControl: false` because MapLibre's own control is vendor chrome that ignores an
   RTL page — and the style's `attribution` field is surfaced _only_ by that control. Switching
   it off while trusting the field would have shipped **no attribution at all**, which is a
   licence failure that nothing would have failed on. `.map-attrib` renders it, in the band
   ADR-0121 §5's layout already reserved for Google's logo, and a test asserts it.
3. **`MapCanvas` needed two failure callbacks, not one.** A tile 404 and "the module failed"
   both arrived through `onError`, so the pane could not tell a missing tile at the edge of an
   extract from a canvas that cannot exist — and guessing lenient is a blank canvas with no
   affordance, field report #28 verbatim. `onUnavailable` is the terminal channel; `onError` is
   recorded for the diagnostic and changes nothing else.
4. **`MapCanvas` hands the MODULE over with the instance.** Markers need `Marker`, and
   re-entering the loader would put every pin a microtask behind the render that asked for it.

**`MapDiagnostic` is ported, which was the owner's explicit condition on replacing outright.**
`sdk:` reads the MapLibre instance through `CameraMap` (the three-way `none`/`nobox`/`z12@…`
split survives because `getBounds`/`getZoom`/`getCenter` exist on both), the tile-traffic regex
matches `*.pmtiles` and Protomaps' font CDN instead of four Google hosts, and the second fetch
probe is now a one-byte range request against our own archive — strictly sharper than `goog:`,
which could only say Google was reachable. `err:` gains rather than loses: a tile that cannot be
range-read says so in the message, where Google's loader rejected with nothing about tiles.

**And `markFailure()` still clears `tilesPainted`.** The cue, the retry pill and the diagnostic
all render under `!tilesPainted`, so a context dying _after_ the first paint would otherwise show
nothing at all. Carried through the swap with its test.

**Measured, since Consequences asked for it and not for an assumption.** The Map tab's chunk is
**1.09 MB raw / 286 kB gzip**; the entry chunk is unchanged at 310 kB, so the renderer stays out
of the first-paint path as §1 requires. Against that, the Maps JS script is no longer fetched at
runtime at all. The bytes move from a per-session vendor fetch to a versioned, cached, offline-capable
chunk — which is the trade this ADR is about. One residual: `lib/maplibre.ts`'s `import()` is not
a real chunk boundary, because `map-camera-adapter.ts` imports `MercatorCoordinate` statically;
opening the Map tab therefore evaluates the renderer whether or not a canvas is built. Backlogged
rather than fixed quietly, since the fix is hand-rolling two mercator formulas.

**What Phase 2 does NOT establish, and this is the important line.** The original cause of field
report #35 is still **unknown**. Session 268 excluded WebGL, the map's own context, layout, the
service worker, the network and the loader by measurement from the owner's device; quota (97%)
explains the Aug 13–14 failures only, since 4xx was flat at zero across Aug 7–13 while the bug was
reported daily. So this is **the experiment, not the cure**: if the MapLibre pane is healthy on
the owner's phone where Google's was not, the fault was in the SDK; if it fails the same way,
something above was mis-excluded and `MapDiagnostic` on the new pane is what says which. Six
sessions promised a cure. This one does not.

## Amendment (2026-08-14, session 269b) — the blank map, and the two defects behind it

The owner opened the Map tab on staging and saw **no map**: the pane, the attribution and the
pins all drew, the ground was a uniform brown rectangle, and **nothing on screen said anything
was wrong**. Owner: _"Make sure that you test the rendering before pushing broken builds."_ Both
halves of that are correct, and the second is the reason the first shipped.

**What I actually verified before pushing was that the canvas CONSTRUCTED** — `data-map-failed`
absent — and I reported that as the renderer being healthy. That is a proxy, not a render. Nothing
in the suite asked whether a tile ever arrived, and nothing could: jsdom has no GPU, so every unit
test stubs the renderer, and every e2e Map spec asserts markup, geometry or wiring — all of which
were **perfectly healthy on the failing device**. The gap was structural rather than an oversight
in one file.

### Defect 1 — the first-paint signal was satisfied by a blank map

`MapCanvas` derived first paint from `load` + `idle`. **Both settle on a map whose every tile
request failed**, because "nothing pending" includes "nothing left to fail". So `tilesPainted`
latched, the watchdog was satisfied, and the cue, the retry pill and the diagnostic — all of which
render under `!tilesPainted` — stayed away from a canvas showing only its own background colour.
That is field report #28 verbatim, reached from a new direction, and it is the same trap this ADR's
own trap-1 warns about from the other end.

Google's `onTilesLoaded` genuinely meant tiles. The replacement now does too: MapLibre reports each
tile through `sourcedata` with the source it belongs to, so first paint waits for one. Armed on
every idle rather than the first, so tiles that are merely slow still clear the notice when they
land. Verified in a real browser: with an unreadable archive the pane now shows the slow notice,
the retry and the diagnostic, and the diagnostic reads `painted:n`.

### Defect 2 — "coarse" was the wrong word for the world layer, and it was my word

Phase 2 shipped the **world layer alone** (z0–6), deferring the trip extract on three real risks —
a synchronous ~10s first cut, `MembershipGuard`, and a single-source style rendering nothing if the
extract fails. I described the consequence as a map that is "coarse" and would show "a correct but
empty-looking ground". **Measured, it is not coarse, it is empty**: the map opens at
`MAP_ZOOM.PLACE`, and a z6 tile overzoomed to z14 draws one flat landmass. The screenshot is
exactly that. A caveat stated in a session note is not a mitigation.

So the extract is wired, and each deferral reason is answered rather than dismissed: the slow first
cut is what Defect 1's fix now reports and retires by itself; a same-origin fetch carries the
membership cookie; and **`mapStyle` now keeps the world beneath the trip archive** rather than
picking one — which is what §3's own prose always said (_"the trip's own archive over the shared
world layer"_) while the code read one source. Fills only from the underlay, because taking the
whole generated set draws every label and road twice, one overzoomed, a few pixels apart.

### Defect 3 — the diagnostic's tile counter was structurally zero

`tiles:N` came from `performance.getEntriesByType('resource')` filtered to the tile hosts. **MapLibre
fetches tiles on a worker thread**, whose requests never appear in the main thread's resource
timeline — measured at `tiles:0` on a map that was drawing Bangkok perfectly. The field that was
meant to answer the device pass could not. It is counted from the renderer's own events now, which
makes it the discriminator it was supposed to be: `tiles:0` is an archive that cannot be read,
`tiles:N` with nothing on screen is an archive with no data at this zoom.

### What now exists so this cannot recur silently

`e2e/map-renders.spec.ts`, in two halves. The **hermetic** half runs everywhere: there is no
backend in e2e, so the archive request is answered by the dev server's SPA fallback — HTML where
PMTiles bytes belong, a faithful copy of the deployed failure — and the app must SAY so. That is
the regression test for Defect 1. The **opt-in** half (`MAP_TILES_E2E=1`) points both archive
requests at Protomaps' planet build over range requests and asserts the app's own first-paint
signal clears, attaching a screenshot of the terrain. Run today it draws Bangkok's streets, river,
Wat Arun and Thai labels correctly — **so the client, the style, the protocol and the pane were
never the fault**, which is the fact that localises the blank map to the archive being served.

### Still not established, and it matters

Whether the deployed backend's `/map/world.pmtiles` is a valid archive at all. `buildExtract`
shells out to a `pmtiles` binary (`PMTILES_BIN`), which is **absent from this sandbox** and unverified
on the deployed image; if it is missing there, both archives 404 or error and the pane will now say
so instead of sitting blank. **The next reading settles it in one tap**: `tiles:0` means the archive
cannot be read, and `tiles:N` on a still-empty map means it can. Two findings worth recording while
this is open: the style's `glyphs` URL points at `protomaps.github.io`, which is a **vendor host on
a user's fetch path** — contrary to §3's own rule and unusable in Phase 3's offline case; and
nothing yet verifies the archive the backend serves is a PMTiles file rather than whatever a
fallback route returns.

**This does not change the standing conclusion about field report #35.** The original cause is still
unknown, and this amendment is about a blank map Phase 2 introduced, not about the one that started
all of it.

## Amendment (2026-08-14, session 269c) — the tile read was never authenticated

The reading, from the owner's phone, and it names the cause outright:

```
gl:ok canvas:ok pane:411x596 painted:n tiles:0 sw:activated fails:1 resumes:0 t:4.9s
sdk:z11.48@32.14,34.83 online:y vis:v err:Error: Bad response code: 401 self:114ms tile:110ms
```

**401.** Every range read of both archives was refused. `MapController`'s routes are not
`@Public()`, and `app.module.ts` installs `JwtAuthGuard` globally — ADR-0020: _"every route needs a
Bearer access JWT unless marked `@Public()`"_. The `pmtiles://` protocol issues its own range
requests from inside MapLibre, on a **worker thread**, so they never pass through `lib/api.ts`'s
`apiFetch` and carried no `Authorization` header at all.

**Nothing in the repo could have caught this, and that is the part worth recording.** e2e has no
backend and no guard, so an unauthenticated range read is byte-for-byte indistinguishable from an
authenticated one there; unit tests stub the renderer entirely. The archive request was _made_, and
every layer that could observe it was satisfied. So the new assertion is on what the client
**sends**, not on what it gets back — `e2e/map-renders.spec.ts` reads the `Authorization` header off
the intercepted request, and `MapCanvas.test.tsx` reads it off the registered `FetchSource`.
Verified as a real regression test: both fail with the header suppressed.

`lib/pmtiles.ts` now owns archive registration. `FetchSource` is the sanctioned seam and pmtiles'
own documentation says so — _"This should be used instead of maplibre's `transformRequest` for
PMTiles archives"_ — and its `Headers` are mutable, which is what makes a rotating token survivable:
the archive object is registered once (keeping the header and directory caches that make a range
read cheap) and re-headered on every map build, on retry, and on any tile error. That last one
closes a gap that would otherwise be silent: `apiFetch` rotates the token on a 401, and tiles
fetched after a rotation would keep being refused **with the map already painted**, so the cue —
which guards only the first paint — would never appear.

**What was deliberately NOT done: no route was made `@Public()`.** For the world layer that is
arguably the right answer, and `MapController`'s own comment leans that way (_"the same public OSM
ground for everyone, and gating it would mean a signed-in fetch per trip for one shared file"_).
But the trip extract must stay guarded whatever else happens — the areas it covers say where the
group is going, which is precisely what ADR-0039 revokes with membership — and making a route public
is a security decision, so it is **raised for the owner rather than taken here**. Authenticating the
read fixes both archives and widens nothing. If the world layer is later made public, the win is
that the coarse ground floor survives a stale session, which is the one case this fix does not cover.

**Correcting the previous amendment on one point.** It listed "whether the deployed
`/map/world.pmtiles` is a valid archive at all" as the open question, and named the missing `pmtiles`
binary as the likely cause. That was a reasonable guess and it was wrong: the archive was never
reached. `tile:110ms` in the reading was the tell and I under-read it — the diagnostic's own probe
_settled_, so the route answers; a 401 settles just as fast as a 206. The binary question is still
genuinely open, and the next reading now distinguishes it: `tiles:N` means the archive is being read
and parsed, `tiles:0` with a different `err:` means it is not.
