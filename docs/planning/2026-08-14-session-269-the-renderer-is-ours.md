# Session 269 — the renderer is ours

**Branch: `staging`.** MapLibre Phase 2 ([ADR-0186](../decisions/0186-the-map-is-ours-and-it-works-on-a-plane.md), amended today) plus the test `MapCanvas.tsx` landed without.

## What was asked, and what happened

Two things, in order. **The missing test** for `MapCanvas.tsx` — landed in Phase 1, typechecking,
and with no test file, which `frontend/CLAUDE.md` forbids for a new `ui/domain` component. Then
**Phase 2**: swap `MapPane` (1354 lines, ~69 vis.gl call sites) onto it.

Both are done. `pnpm typecheck`, `pnpm lint` and the full frontend suite (**215 files / 3686
tests**) are green, and `pnpm build` succeeds.

## The headline, said plainly

**This does not fix field report #35, and nothing here should be read as claiming it does.**

Session 268 excluded WebGL, the map's own context, layout, the service worker, the network and the
loader — all by measurement from the owner's own device. Quota (97%) explains the Aug 13–14
failures and is not the original cause: 4xx was **flat at zero across Aug 7–13** while the bug was
reported daily. So the mechanism is still unidentified, and the swap is **the experiment**: if the
MapLibre pane is healthy on the owner's phone where Google's was not, the fault was inside the SDK
we could not instrument. If it fails the same way, something above was mis-excluded, and
`MapDiagnostic` — ported onto the new pane, which was the owner's explicit condition on replacing
outright — is what says which.

Six sessions promised a cure. This one is a change of vendor and a better instrument.

## The one thing the owner will notice immediately

**The map is coarse.** Phase 2 renders the shared **z0–6 world layer** only: coastlines, borders,
major cities, everywhere on earth, and **no street detail**. Zooming into Tokyo gets a correct but
empty-looking ground.

That is deliberate, and the reason is the third of three:

- `GET /trips/:id/map/extract.pmtiles` **cuts the archive synchronously on first request** (~10s
  for two areas), which would make the swap's first impression a "loading is slower than usual"
  notice and confound the very experiment.
- It sits behind `MembershipGuard`, so the `pmtiles` protocol's fetch has to carry credentials —
  fine same-origin, unverified against a cross-origin dev API base.
- **`mapStyle` reads ONE source**, so an extract that fails or 403s renders **nothing at all**.
  Shipping that would be a self-inflicted copy of the bug this migration exists to end.

Phase 3 owns the download, and §6 rule 5 ("survive it being gone") is where that fallback is
specified. Both deferrals are written into the ADR amendment as decisions, not omissions.

## What went right, and it is the part worth trusting

**§2's "the port is small" was true, and it was true for the reason it claimed.**

- `useMapCamera` (~700 lines) and `useCanvasGestures`: **eight type annotations, zero logic
  changes.** Their 76 tests passed on the first run after the retype. Every decision four ADRs
  argued about was about the map's meaning and never about Google, exactly as §2 said.
- **Pins: nothing.** ADR-0121 §6 built them from our own DOM, so `.map-pin` and ADR-0123's
  `--pin-u` ratio system are untouched CSS on real elements.
- Every pure `lib/` function (`map-pins`, `map-camera`, `place-refs`, `snap-sheet`) is unchanged.

This is ADR-0121 §13's testing posture paying off, and it is the strongest evidence that the
decomposition was worth the effort at the time.

## Two defects the swap exposed, and neither was found by reading

Both were in **Phase 1**, both were found by a machine, and both are the kind that do not throw.

1. **`CameraMap` was short by two methods.** `useCanvasGestures` read the drag zoom's limits as
   `map.get('minZoom')` — Google's untyped `MVCObject` accessor, which type-checks against
   _anything_ and therefore hid itself from §2's count of seven. The compiler found it the instant
   the hook was retyped. The counted-the-call-sites rule was right about every method that had a
   name; the lesson is that an untyped string-keyed accessor is not a call site a count can see.
2. **`cameraMapFor().getBounds()` wrapped unconditionally.** It returned a truthy object for a map
   with no bounds, which breaks the contract in two places at once: `readMapBounds`'s opening
   `if (!bounds) return null` became unreachable and then threw on `getNorth()` of `undefined`
   inside a React effect, **and** `useMapCamera` lost the signal it reads as _"this map has not
   rendered, defer the framing to its own `idle`"_. That second half is ADR-0121's session-134
   entry precisely: fitting into an unrendered map resolves to a wild zoom-out, and §7's
   containment guard then makes it permanent because a zoomed-out view contains every pin forever.
   Found only when `MapPane`'s own suite started driving the **real** adapter instead of a
   hand-written Google dialect — which is an argument for stubbing one layer down rather than
   mocking the vendor.

## Four things only building it produced

1. **The pins reach their marker through `createPortal`, which this repo lint-blocks.** A
   `maplibregl.Marker` owns its element and ADR-0121 §6's pins are React. `eslint.config.mjs` has
   the allowlist entry with the reasoning, and it is the one entry that deliberately does **not**
   call `useOverlay`: a marker is content the renderer positions inside the canvas, nothing
   dismisses it, and `frontend/CLAUDE.md`'s own test — "does the gesture dismiss something you are
   IN" — answers no. Registering a layer per pin would flood the back stack with layers that can
   never be popped.
2. **OSM's attribution had to be drawn by us, and nearly shipped absent.** `MapCanvas` passes
   `attributionControl: false`, because MapLibre's own control is vendor chrome that ignores an RTL
   page — and the style's `attribution` field is surfaced **only by that control**. Phase 1's
   comment said our attribution "lives in the style's `attribution`", which was true and useless:
   with the control off, nothing rendered it. That is a licence obligation ADR-0186 calls
   non-optional, and **nothing would have failed.** `.map-attrib` draws it in the band ADR-0121 §5
   already reserved for Google's logo, and there is a test.
3. **`MapCanvas` needed two failure callbacks.** A tile 404 and "the renderer module failed" both
   arrived through `onError`, so the pane could not tell a missing tile at an extract's edge from a
   canvas that cannot exist. Guessing lenient is a blank canvas with no affordance — field report
   #28 verbatim. `onUnavailable` is the terminal channel now; `onError` is recorded for the
   diagnostic and changes nothing else.
4. **The module is handed over with the instance.** Markers need `Marker`; re-entering the loader
   would put every pin one microtask behind the render that asked for it.

## The trap that mattered most, held

**`markFailure()` still clears `tilesPainted`.** The cue, the retry pill and the diagnostic all
render under `!tilesPainted`, so a context dying _after_ the first paint would show nothing at all
— no cue, no button, no diagnostic. Carried through the swap with its test, and the render tree
now says so in a comment where it is easy to delete by accident.

## Measured, because Consequences asked for a measurement

- **Map tab chunk: 1.09 MB raw / 286 kB gzip.** Entry chunk unchanged at 310 kB, so the renderer
  stays out of the first-paint path as §1 requires.
- Against that, the Maps JS script is **no longer fetched at runtime at all**. The bytes move from
  a per-session vendor fetch to a versioned, cached, offline-capable chunk, which is the trade this
  ADR is about.
- **One residual, backlogged rather than fixed quietly:** `lib/maplibre.ts`'s `import()` is not a
  real chunk boundary, because `map-camera-adapter.ts` imports `MercatorCoordinate` statically
  (rolldown says `INEFFECTIVE_DYNAMIC_IMPORT`). Opening the Map tab therefore evaluates the
  renderer even if no canvas is built. The fix is hand-rolling two mercator formulas — provable
  against `MercatorCoordinate` in the adapter's own test, so it is a real option, just not one to
  slip into a swap.

## What the suites had to become

- **`MapPane.test.tsx`** stubs **our own `MapCanvas`** rather than a vendor's four components, and
  the map handed through it is a MapLibre-shaped fake that goes through the **real**
  `cameraMapFor`. That is what caught defect 2 above. Everything that guarded a real bug survives;
  what went is what guarded a vendor's lifecycle — a page-global loading status, a script-load
  rejection, `__resetModuleState`. The `event.detail.placeId` case is deleted rather than ported:
  there is no vendor POI layer to tap, so the outcome three passes argued about cannot arise.
- **`Map.test.tsx`** is still the graceful-absence (list-only) suite `frontend/CLAUDE.md` requires,
  but it now **states** its condition (`mapPaneAvailable` mocked false) instead of inheriting it
  from `vite.config.ts` pinning the Google vars empty. There is no build configuration left to be
  missing, and a suite that states what it depends on is the rule that file's own history argues
  for. `isOffline` stays orthogonal, exactly as absent keys were.

## For the next session

1. **The device pass is the whole point.** Get the owner's phone onto staging, and if the map is
   blank, tap `אבחון` and read the line. `tiles:` and `err:` now describe our own archive.
2. **Phase 3**: download, storage, retention — and with it the two deferrals above (the trip
   extract, and `mapStyle` drawing the world _under_ it so a missing extract degrades to coarse
   rather than to nothing).
3. **Phase 4**: delete `MapsConfig`, the three `VITE_GOOGLE_MAPS_*` vars, `DevMapTuner`'s
   Google-shaped fields, and `@vis.gl/react-google-maps` from `package.json` — it has no live call
   site left, only a dependency entry.
4. Still open from the handoff and untouched here: **PR #595 against `main`**, and commit
   `56ce7d2` mis-pushed to `main`. Both need the owner's call.
