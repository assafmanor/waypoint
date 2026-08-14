---
date: 2026-08-14
session: 269
topic: MapLibre migration — Phase 2 closed, handoff into Phase 3
adr: ADR-0186
branch: staging
---

# Handoff — MapLibre Phase 2 is done and working; Phase 3 next

**Phase 2 is verified on the owner's device.** The map draws its own PMTiles ground, in Hebrew, with
our pins on it. Field report #35's Phase-2 blank map is fully explained and fixed. What follows is the
state of the world, the three open items the first working map produced, and what Phase 3 is.

Read this, then [ADR-0186](../decisions/0186-the-map-is-ours-and-it-works-on-a-plane.md) — §3, §4 and
its **2026-08-14 amendments 269b–269j**, which are the whole debugging history in order. Do not read
the rest of `docs/`.

## 1. Where the code is

All on **`staging`** (not `main` — `main` has no Phase 1). Latest: `e3e91ca0`.

The session's commits, oldest first:

| Commit     | What                                                              |
| ---------- | ----------------------------------------------------------------- |
| `b6a88589` | a blank map says so; the ground has data at the zoom it opens at  |
| `1b946a4c` | the tile read carries the app's token (the 401)                   |
| `9056f489` | the runtime image needs a CA store, because the extractor is Go   |
| `d54a40ee` | nothing is built on the request path (503 + background cut)       |
| `d8086c89` | the diagnostic reports the archive's status, with credentials     |
| `19b1bc2b` | the style states the tile template, not the archive's header      |
| `13afeac2` | the diagnostic reads what is INSIDE the archive, and style state  |
| `03d09087` | the reading says which way the extract fails, and where it covers |
| `2bd25390` | **the fix** — name the tile worker's URL, which bundling breaks   |
| `e3e91ca0` | the Hebrew ground reads right-to-left                             |

## 2. What the blank map actually was

Worth carrying forward because the shape recurs.

MapLibre parses every tile on a **Web Worker**, and finds that worker by rewriting its own
`import.meta.url` to a **sibling** filename. Unbundled that is correct. Bundled, `import.meta.url` is
our hashed chunk, so it fetches `/assets/maplibre-gl-worker.mjs`, which the build never emits — and
`spa-fallback.filter.ts` answers any unknown path with `index.html` at **200**, so a module worker
starts from HTML and dies on parse. **No error reaches the map**, because a dead worker is not a tile
error: tiles are dispatched and never answered.

Fix: `import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'` →
`gl.setWorkerUrl(workerUrl)` inside `loadMapLibre()`, before any map exists.

**Why nothing caught it, and the rule to keep:** `playwright.config.ts` ran e2e against `pnpm dev`,
and `vite.config.ts`'s `optimizeDeps.exclude: ['maplibre-gl']` makes dev serve the real dist file
whose worker sibling exists. **An asset path, a chunk boundary and a worker URL are build-time facts
that a dev-server suite asserts none of.** `E2E_PREVIEW=1` now exists for exactly that class:

```bash
cd frontend
E2E_PREVIEW=1 npx playwright test                        # whole suite against pnpm build && pnpm preview
E2E_PREVIEW=1 MAP_TILES_E2E=1 npx playwright test e2e/map-renders.spec.ts   # + a real archive
```

**Wiring `E2E_PREVIEW=1` into CI is owed and is the single highest-value thing left.** It reproduces
the bug in both directions today: removing the `setWorkerUrl` line makes 2 specs fail there and 0
fail in dev.

## 3. The device diagnostic, and how to read it

Tap **`פרטים`** on a failing map. It only appears when the pane is failing, so a working map grows no
debug affordance. `MapDiagnostic.tsx` + `lib/pmtiles.ts`'s `archiveReading`.

```
gl:ok canvas:ok pane:411x285 painted:n tiles:0 sw:activated fails:1 resumes:0 t:5s
sdk:z8.87@9.68,100.01 style:n/2g online:y vis:v err:none
self:200/92ms world:206/96ms[z0-6/5461t/6:42.3k] extract:206/106ms[z0-14/127t/8:9.7k]
```

Field by field, and what each one is for:

- `gl:` — can this page make a **new** WebGL context. `none` means only a fresh document can recover.
- `painted:` / `tiles:N` — counted from MapLibre's own `sourcedata` events filtered by
  `isGroundSource`. **Not** `performance.getEntriesByType`, which reads zero forever because tiles are
  fetched on the worker thread.
- `style:y/2g` — `isStyleLoaded()` **and** how many ground sources the map holds. **Read the `2g` half
  only**: `isStyleLoaded()` delegates to `Style.loaded()`, which is false while any tile is pending,
  so `n` usually just restates `tiles:0`.
- `sdk:` — `none` / `nobox` / `z14@lat,lng`. Says nothing about the style; the camera answers fine on
  a map with no style at all.
- `world:` / `extract:` — **HTTP status/ms, then what is inside the archive**:
  `[z<min>-<max>/<addressedTiles>t/<z>:<bytes>]`. On a miss it walks down to the deepest zoom that
  does hold the point and reports the camera against the archive's own bbox:

| Reading                                | Meaning                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `6:42.3k`                              | healthy — real tile bytes at the camera                         |
| `14:MISS@10:3.1k` + `bbox:in`          | ground is in the archive but only to z10 — `maxZoom` overstates |
| `14:MISS@none` + `bbox:out@13.7,100.5` | the archive covers **other ground**, and that is where          |
| `err:Bad response code: 503`           | the cut is still running                                        |
| `err:Wrong magic number…`              | the stored blob is not an archive                               |
| `unregistered`                         | the pane failed before archives were registered                 |

**The lesson this readout is made of: `206` is not health.** It says bytes arrive. Three sessions were
lost to reading a status (or worse, a duration — `tile:101ms`) as "the archive is fine".

## 4. The three open items from the first working map

### (a) A 503 is reported as a failure — real, small, well-understood

Adding a place in a second country changes the region, so `mapRegionFor` yields a new `signature`, so
`mapExtractKey` is a new key that is not stored — and 269e's rule fires: **serve nothing, answer 503 +
`Retry-After`, cut in the background.** A two-cluster extract (Thailand + Israel) takes minutes.
Confirmed working end to end: _"after a few minutes the map of Israel got updated and the error went
away."_

The defect is only the **words**: the pane says _"failed to load the map"_ while the truth is
"preparing". `markFailure`/`MAP_ATTEMPT` in `MapPane.tsx` do not look at the status.

**Do not fix this with a longer timeout** — 269e argued that down: a longer bound makes a genuine hang
invisible for longer and still leaves someone watching a blank map for minutes. Give a **503 its own
state**, distinct from failure, with copy that says the map is being prepared. `MapCanvas`'s
`onError` already receives MapLibre's error, whose message carries the status.

### (b) The ground is too dark, and its terrains too close together — a design pass

Owner, on the first working map, in **dark** mode: _"the map is too dark and the contrast between the
different terrains too little."_

This is a design finding, not a defect. ADR-0125's vocabulary was **measured in light**
(`mockups/map-basemap-ours-v1.html`); the `DARK` block in `lib/map-style.ts` was derived from it by
reasoning and never judged against real tiles. It is one object in a reviewable file and dark mode is
a live restyle from one download, so it is cheap to change.

**But it wants the `design-mockups` skill and a mockup, not a nudge.** What must survive is the
**ratio** ADR-0125 §8 wrote as relationships rather than hexes: warm land against cool water, built
mass achromatic against chromatic nature, every terrain tone separated, and the pins still the loudest
thing on the canvas (chroma 27.8–51.8). Re-tuning hexes without re-measuring that is exactly how those
relationships get lost.

### (c) `glyphs` still points at a vendor host

`lib/map-style.ts`'s `GLYPHS` is `https://protomaps.github.io/basemaps-assets/…`. Against §3 (no
vendor host on a user's fetch path) and **unusable offline**, which makes it a Phase 3 blocker: a
downloaded archive with remote glyphs draws no labels on a plane. Same fix shape as the RTL plugin and
the worker — self-host it as a named asset. The font set is bounded.

## 5. Phase 3 — what it is

From ADR-0186 §3/§4. **Download, storage, retention.** Today every tile read is a network range
request through our backend; Phase 3 makes the same style read a local archive instead, so offline is
the _absence of a fetch_ rather than a second code path.

The pieces, in dependency order:

1. **Self-host `glyphs`** (4c). Nothing else in Phase 3 is truthful until labels work offline.
2. **Download the archives to the device.** The world layer once (42.7 MB) plus the trip's extract.
   The `pmtiles://` protocol reads a local file through the same `FetchSource` seam — `lib/pmtiles.ts`
   is where an archive's source is chosen, and it is the one file that needs to learn "local or
   remote".
3. **Retention, because an extract is a cache and never data** (§4). Delete on trip end + grace, on
   trip delete/removal, and a **byte budget with LRU** keeping the current trip **pinned**.
   `mapExtractKey`'s flat `map_<tripId>_<sig>` prefix already gives eviction everything it needs
   without an index (`isExtractKeyFor`).
4. **Metering.** `navigator.connection` is Chrome-only, so on iOS metered-ness is undetectable and
   automatic download degrades to a **one-time prompt** rather than a roaming bill.
5. **iOS storage headroom** — Phase 0(d), still unmeasured, and the only remaining Phase 0 unknown
   now that WebGL is answered by a working map.

**Phase 4 is the deletion pass** and is independent: `MapsConfig`, the three `VITE_GOOGLE_MAPS_*`
vars (already gating nothing), `DevMapTuner`'s Google fields, and `@vis.gl/react-google-maps` from
`package.json`.

## 6. Standing debts

- **`E2E_PREVIEW=1` in CI** (§2). Owed, highest value, cheap.
- **A CI step that builds the runtime image, cuts a small real extract and renders it.** Owed four
  times across 269d/269e/269f/269g. Every failure in that chain — the CA store, the request-path
  build, the header metadata — was invisible to a suite running where a CA store exists, reading an
  archive somebody else built. **No test has ever read an archive our own `pmtiles extract`
  produced**; `lib/pmtiles.archive.test.ts` reads a real archive assembled byte by byte in the test,
  which is close but is not the cutter's output. Cannot be built in the agent sandbox: no `pmtiles`
  binary, no Docker daemon.
- **`lib/maplibre.ts`'s `import()` is not a real chunk boundary** — `map-camera-adapter.ts` imports
  `MercatorCoordinate` statically, so rolldown folds the module in (`INEFFECTIVE_DYNAMIC_IMPORT` in
  every build log). Making it real means hand-rolling two mercator formulas, provable against
  `MercatorCoordinate` in the adapter's own test.
- **Owner's call, deliberately not taken:** should `GET /map/world.pmtiles` be `@Public()`? Its own
  comment leans that way ("the same public OSM ground for everyone") and it would make the coarse
  floor survive a stale session. **The trip extract must stay guarded regardless** — its areas say
  where the group is going (ADR-0039).
- **Untouched from the previous handoff:** PR #595 is open against `main`, and commit `56ce7d2` was
  mis-pushed to `main`. Both need the owner's decision; nothing this session touched either.

## 7. Field report #35 itself

**Still unknown, and nothing here should be read as closing it.** Everything fixed on 2026-08-14 was
introduced by this migration. The original report — a Google-rendered map dying after the phone
backgrounded it, recoverable only by restarting the app — has never been reproduced, and the swap
remains **the experiment, not the cure**. If a MapLibre pane dies the same way after backgrounding,
`markFailure` still clears `tilesPainted`, so the cue, the retry pill and the diagnostic all appear —
that path is intact and tested, and it is what will say which way the experiment went.

## 8. Commands

```bash
# unit — 3737 tests, 217 files
cd frontend && npx vitest run

# e2e against the dev server (fast, hermetic)
cd frontend && npx playwright test

# e2e against the PRODUCTION BUNDLE — use this for anything build-time
cd frontend && E2E_PREVIEW=1 npx playwright test

# + a real archive over range requests from build.protomaps.com
cd frontend && E2E_PREVIEW=1 MAP_TILES_E2E=1 npx playwright test e2e/map-renders.spec.ts

# whole repo
pnpm typecheck && pnpm lint && pnpm build
```

Two backend specs (`booking-notes-migration`, `sync.gateway`) fail on a clean tree too — verified
against a stash, not this work.
