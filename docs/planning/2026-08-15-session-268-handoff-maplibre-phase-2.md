# Handoff — MapLibre Phase 2 (the renderer swap), from session 268

**Branch: `staging`.** Everything below is pushed. Work directly on `staging` — the owner said so explicitly, twice. Do **not** branch off `main`: `main` does not have Phase 1.

Read this, then [ADR-0186](../decisions/0186-the-map-is-ours-and-it-works-on-a-plane.md) §1–§3 and §Phasing. Do not read the whole `docs/` tree.

---

## The one-paragraph version

Field report #35 (the map intermittently failing to load) survived **seven** rounds of fixes. Session 268 established that every layer this repo owns is healthy by _measurement_, so the fault is inside Google's minified SDK, which we cannot instrument or reset. That is the case for ADR-0186: replace the renderer with MapLibre + PMTiles, which moves the failing component into code we can read **and** ends the per-instantiation billing that made the earlier "fixes" actively harmful. Phase 1 (tile pipeline, style, camera adapter) is merged to `staging` and green. Phase 2 is the swap, and its first piece (`MapCanvas.tsx`) is landed but **not wired and not tested**.

## Decisions the owner has already made — do not re-open these

1. **Replace the Google renderer outright. No flag, no two renderers.** (ADR-0186 §1.) In session 268 I proposed a temporary A/B flag; the owner considered it and chose **"replace outright, but keep the diagnostic"** — i.e. port `MapDiagnostic` onto the MapLibre pane so a failure there is still readable, instead of keeping a second renderer for comparison.
2. **Build the canvas component first, swap in a later session.** Chosen to avoid a half-migrated pane on `staging`. That is done; you are the later session.
3. **`maplibre-gl` directly, no React wrapper.** ADR-0186 §1: the bug that started all this was a wrapper's module-global lifecycle. `react-map-gl` is rejected on the record.
4. Auto-download on wifi when a trip is opened; z0–14; auto-clean after a trip finishes. (Phase 3, not yours.)

## State of play

### Landed and green on `staging`

| Piece                       | Where                                    | Note                                                                                                                               |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Tile pipeline (backend)     | `backend/src/map/`                       | `GET /map/world.pmtiles`, `GET /trips/:id/map/region`, `GET /trips/:id/map/extract.pmtiles`                                        |
| Style as ADR-0125's palette | `frontend/src/lib/map-style.ts`          | `mapStyle(scheme, {world, trip?})`, `mapBackground(scheme)`, `MAP_ATTRIBUTION`                                                     |
| **Camera adapter**          | `frontend/src/lib/map-camera-adapter.ts` | `cameraMapFor(map): CameraMap`. **This is why the swap is cheap** — `useMapCamera`'s ~600 lines of projection maths do not change. |
| Clustering / download areas | `packages/shared/src/geo.ts`             | `mapDownloadAreas`, `clusterLatLngs`, `boundsAroundLatLngs`                                                                        |
| Mockup                      | `mockups/map-basemap-ours-v1.html`       | Owner approved the look: _"Looks great, you can build"_                                                                            |
| **The canvas**              | `frontend/src/ui/domain/MapCanvas.tsx`   | **Landed, typechecks, nothing imports it, NO TEST**                                                                                |

`pnpm typecheck` and the full frontend suite (214 files / 3659 tests) are green as of `a2991778`.

### Do this first, before any swap

**`MapCanvas.tsx` has no test file**, which violates `frontend/CLAUDE.md` ("a new `ui/domain` component ships with its own test file"). MapLibre needs WebGL, so the suite needs the module mocked — follow `MapPane.test.tsx`'s existing pattern for stubbing `@vis.gl/react-google-maps` to plain DOM. Assert the things that are **ours**: that the map is constructed once and not per render, that `remove()` runs on unmount, that `onFirstPaint` fires on the first `idle` after `load` and not before, and that a tile `error` does not by itself mark the map dead.

## Phase 2, concretely

Swap `MapPane.tsx` (1354 lines) from vis.gl to `MapCanvas`. The coupling is ~69 call sites across these names: `APIProvider`, `<Map>`, `AdvancedMarker`, `useMap`, `useApiIsLoaded`, `APILoadingStatus`, `__resetModuleState`, `google.maps.*`.

What makes it smaller than it looks:

- **Pins do not port.** ADR-0121 §6 built them from our own DOM, so `.map-pin` and ADR-0123's `--pin-u` ratio system are untouched CSS on real elements. `new maplibregl.Marker({ element })` takes the same node.
- **The camera does not port.** Wrap the instance in `cameraMapFor` and `useMapCamera` works as-is.
- **Every decision already lives in pure `lib/` functions** with no renderer in the process (`map-pins.ts`, `map-camera.ts`, `place-refs.ts`, `snap-sheet.ts`, `map-config.ts`). None of them change. This is ADR-0121 §13's testing posture paying off.

What gets **deleted** rather than ported:

- The whole loader-failure apparatus: `__resetModuleState`, `APILoadingStatus`, `mapFailed` as a _script_-load signal. There is no page-global loader to poison, which is the entire point.
- `clickableIcons={false}` and `disableDefaultUI` — no vendor POI layer, no vendor chrome. §2 is explicit that these stop being concepts.
- ADR-0121 §10's faked dashed line. MapLibre has `line-dasharray`; the repeating-symbol hack goes.

What must **survive**, and the tests are the check:

- The tiles watchdog (`MAP_LOAD_TIMEOUT_MS.TILES`, 4s) — point it at `onFirstPaint`.
- `markFailure()` and everything session 268 built around it, including **`markFailure` clearing `tilesPainted`** (see the trap below).
- The hidden-moment reload and the manual retry.
- `MapDiagnostic`, **ported** — this was the owner's explicit condition on replacing outright. Its `sdk:` field is Google-specific and needs a MapLibre equivalent (`map.getBounds()`/`getZoom()`/`getCenter()` all exist, so the same three-way split works: no instance / instance with no bounds / has a camera and is not fetching).
- Both day scopes asserted, per `frontend/CLAUDE.md` (the Map is `DAY_SCOPED_TABS`), and the clock pinned with `setSimulatedNow`.

## Traps that have already cost time — do not rediscover these

1. **`markFailure()` must clear `tilesPainted`.** The cue, the retry pill and the diagnostic all render under `!tilesPainted`. A context dying _after_ the first paint therefore shows **nothing at all** — no cue, no button, no diagnostic — which is field report #28 verbatim. The old auto-rebuild was masking it. Preserve this through the swap or you reintroduce the original bug.
2. **MapLibre is `[lng, lat]`; the app is `{lat, lng}`.** Recorded in `MapCanvas.tsx` at the one line where they meet.
3. **MapLibre's `error` event carries `ErrorLike`, not `Error`** — a `message` and no guaranteed `name`, so it will not typecheck against anything expecting `Error`. Normalised inside `MapCanvas`.
4. **A tile 404 arrives as `error`.** Do not read a single `error` as "the map is dead"; decide that from whether anything ever painted.
5. **Sample diagnostics at the tap, never at render.** A second failure changes no state, React bails out, no re-render — so a render-sampled count reported `fails:1` for two dead contexts. `MapDiagnostic` takes a **getter** for this reason.
6. **`vite.config.ts`'s `test.env` pins env vars empty** so the suite reads nothing it did not set. If Phase 2 adds a `VITE_*` var, pin it there **and** add a `Dockerfile` `ARG` — a Railway service variable alone reaches the container and never the JavaScript. This has cost two deploys, most recently the build badge.
7. **A file that fails to _collect_ reports as one red filename and hides every test in it.** Read the file count beside the test count.
8. **Run `pnpm install` before `pnpm format`.** With no `node_modules`, `format` silently uses whatever `prettier` is on `PATH` and rewrites files CI then rejects. If it touches files your change never did, that is the wrong-binary symptom, not drift to commit.
9. **`docs/backlog.md` contains a non-UTF-8 byte** (older PowerShell damage). Python `open(...).read()` on it throws; edit at the byte level or with the Edit tool, and never rewrite it wholesale with `Set-Content -Encoding utf8` (that adds a BOM and rewrites every line).

## What is still genuinely unknown

**The original cause of #35.** Session 268 excluded WebGL, the canvas context, layout, the service worker, the network and the loader — all by measurement from the owner's own device. Quota (97%) explains the Aug 13–14 failures and is _not_ the original cause: 4xx is flat at zero across Aug 7–13 while the bug was reported daily. So Phase 2 is not guaranteed to fix it.

**That makes the swap the experiment.** If the MapLibre pane is healthy on the owner's phone where Google's was not, the fault was in the SDK. If it fails the same way, something above was mis-excluded and the diagnostic on the new pane is what says which. Say this plainly to the owner rather than promising a cure — six sessions promised one.

## Open items not in Phase 2's scope

- **PR #595 is still open against `main`** (`claude/offline-map-tiles-design`). Its content is merged into `staging`; decide with the owner whether to close it or retarget it.
- **Commit `56ce7d2` was mis-pushed directly to `main`** in an earlier session. The rewind force-push was blocked and the owner has not chosen between leaving it and reverting-and-re-landing. Still unresolved.
- **`VITE_BUILD_BADGE=1` needs setting on the Railway staging service**, plus `VITE_BUILD_LABEL = ${{RAILWAY_GIT_BRANCH}} ${{RAILWAY_GIT_COMMIT_SHA}}` if the commit should show. Railway does not forward its `GIT_*` vars into the Docker build, and the build context has no `.git` — see `deployment.md`.
- Phases 3 (download/storage/retention) and 4 (delete the Google renderer and its config vars, the watchdog, the billing invariant, and every comment that exists because of them).
