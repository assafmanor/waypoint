# Session 262 — a `key` bump is not a retry, and a deadline is not a verdict (field report #35, workstream M, rounds three and four)

**Date:** 2026-08-13
**Workstream:** `M` (#35) — **two more causes found, reproduced and fixed**, in two rounds the same day (§1–§5, then §6). The three previous rounds each fixed a real defect and none of them was either of these.
**Touches:** `frontend/src/ui/domain/MapPane.tsx` (+ its test), `frontend/src/ui/domain/map-pane.css`, `frontend/src/constants.ts`, `frontend/src/i18n/he.ts`, `docs/decisions/0121-embedded-map-phase-6-design.md` (two amendments, in place), `docs/backlog.md`.
**No new ADR, no mockup.** ADR-0121 already owns both the retry rule and the bound, and this corrects them rather than adding a surface.

## 0. What the owner brought that the two previous rounds did not have

Two things, and the second is what made this findable.

1. **It is no longer only one device.** Sessions 247/256/257 worked from a report about one other person's phone. It now happens on the owner's phone too.
2. **A trigger.** It started **once a second person began adding places to the shared trip.** Reported shape: the app is already running, the owner comes back to it after some time during which another device was active, the pane says `טוען את המפה…` until the timeout, **the retry gives the same result**, and only restarting the app recovers it.

The retry detail is the one that matters, because session 257 had already found a reason for those exact words — the near-me card covering the tap — fixed it, and the words came back.

## 1. Reproduced in real Chrome, and the reproduction is the whole finding

Control first: real Chrome at 390×844 against the real Google canvas, dev servers and the Japan trip — the Map tab paints terrain, one canvas, no cue.

Then session 256's own technique, narrowed to a single event: **fail the very first Maps-script fetch once** (an init script redirects `maps.googleapis.com/maps/api/js` to a dead host on attempt 1 only), then tap Retry with the network healthy.

| Step                            | Result                                              |
| ------------------------------- | --------------------------------------------------- |
| First load, poisoned            | `ErrorState`, `לא הצלחנו לטעון את המפה` — correct   |
| Retry → script re-fetched       | **succeeds**; `google.maps.Map` present in the page |
| …and the map                    | **0 canvases**, cue up, 20s later the error again   |
| Leave + re-enter the tab, ×2    | **0 canvases**, cue up, every time                  |
| Page reload ("restart the app") | canvas paints immediately                           |

**A successfully loaded Maps API, and no map.** That is not a network fault, a bound, a layer, a Map ID or a GPU — every one of which the previous rounds were arguing about.

## 2. The cause: the loader's status is module state, and it is written once

`@vis.gl/react-google-maps@1.9.0`, `components/api-provider.tsx`:

- `let loadingStatus` and `let serializedApiParams` are **module-level** — the file says so in a comment, because loading the API can only happen once per runtime.
- The first attempt stamps `serializedApiParams` **before** the awaits that can fail, then on failure sets `FAILED`.
- Every later mount finds `window.google.maps.importLibrary` already defined (Google's bootstrap defines it synchronously, on the very first try, even when the script then fails) and takes the **"already loaded externally"** branch. That branch computes `shouldUpdateLoadingStatus = !serializedApiParams` → **false**, re-imports `core`/`maps` — successfully — and **never calls `updateLoadingStatus(LOADED)`**.

So the global stays `FAILED`. `useApiIsLoaded()` is `status === LOADED`, and `components/map/use-map-instance.ts` opens with `if (!container || !apiIsLoaded) return;` — **`new google.maps.Map()` is never reached.** The pane renders, our markers draw (they are DOM overlays), `onTilesLoaded` never fires, and the 20s watchdog reports a failure on an API that is sitting there loaded.

**A status left at `LOADING` is worse, and it is the variant that matches the report's own wording.** A script that hangs rather than errors never resolves the bootstrap promise, so the status stays `LOADING`; the loader's next line is `if (loadingStatus === LOADING || LOADED) return;` — an early return with **no error at all**. That is why the symptom **opens on the loading cue** rather than on an error, which no reading of the previous two rounds explained.

**This corrects `M.4` and ADR-0121 §4.** "The retry machinery is sound — it bumps the key, clears the published signals, and constructs a fresh attempt" was true of the component and irrelevant to the failure: **a `key` bump builds a fresh component over a dead loader.** One transient failure poisons the map for the life of the page. Session 256 verified the retry against a cause that was _"persistent by construction"_ and read the immediate re-failure as correct behaviour; it was the bug.

## 3. The fix

`retryMap` calls the library's `__resetModuleState()` before bumping the key. Three lines and a comment naming the ceiling.

Verified in Chrome against **both** entry paths, same reproduction harness:

| First-load failure mode           | Global left at | Before                               | After                            |
| --------------------------------- | -------------- | ------------------------------------ | -------------------------------- |
| Script **errors** (dead host)     | `FAILED`       | 0 canvases, forever                  | canvas within ~1.5s of the tap   |
| Script **hangs** (black-holed IP) | `LOADING`      | cue for 20s, then error, retry inert | canvas within ~2s of the tap     |
| Clean load + 3 tab revisits       | `LOADED`       | 1 canvas each                        | **1 canvas each** — §4 unchanged |

Google's own bootstrap was never the broken link: it clears its promise in `script.onerror` and re-fetches happily. The library's global was the only thing in the chain that could not recover.

**Unit:** `MapPane.test.tsx` gains one — the retry clears the library-level status, not just its own subtree — with `__resetModuleState` added to the existing vis.gl stub as a call counter. **Trap-checked**: the reset removed, the test fails (`expected +0 to be 1`), restored, green. **54 passing** in that file.

## 4. Why a peer's edits are the trigger — a window, not a cause

The mechanism needs exactly one failed-or-stalled first load. Remote activity is what makes that likely, and the path is in our code, not Google's:

- `screens/Map.tsx` reads `offline = useIsOffline() || usingCachedSnapshot`, and `mapPaneAvailable` makes the pane **absent** while that holds (ADR-0121 §11). On a warm resume that flag flaps, so **the pane unmounts and remounts**.
- It remounts straight into the resume burst `trip-state.tsx` fires at that same moment: `flushOutbox`, a **paged** `changes?sinceSeq=` replay, and a full snapshot refetch on a hello-ahead. **That burst only has real work to do when a peer has written** — which is precisely the correlation the owner noticed, and why the other person saw it first, back when the owner was the only one adding places.
- And if the pane unmounts **mid-load**, `onError` lands on an unmounted component: the global is poisoned with **nothing on screen to report it**. The next visit then opens straight on the cue with no preceding error — the reported sequence, exactly.

## 5. What is still open

- **The silently-poisoned case still costs one bound's wait** before the now-working retry is offered. Nothing outside an `APIProvider` can read that status, and auto-retrying was rejected on §4's billing arithmetic — a human tap stays the throttle. (§6 then cut that wait from 20s to 4s.)
- **`__resetModuleState` is vis.gl's own test-only hook** (exported and typed; the alternative was `location.reload()`, which throws away the trip state to fix a canvas). Safe at this one call site because `retryMap` is reachable only from `ErrorState`, so no mounted `APIProvider` listener is orphaned by its `listeners.clear()`. A second call site would have to re-check that. Drop it if upstream makes the status recoverable.
- **WebGL is still untested rather than excluded**, unchanged from session 257.
- **Not confirmed on the owner's phone.** The mechanism is device-independent and the reproduction is deterministic, but the confirming tap is the owner's.

## 6. Second round the same day — the deadline was killing the load it was measuring

The fix above shipped and the owner reported the map **still** failing sometimes, with retry now working _sometimes_ — consistent with §2's fix landing and something else remaining. Their instinct was the bound: _"first thing I would do is shorten the map load timeout by a lot. When the map loads successfully, in most cases it's a few seconds tops. So when the map has a problem loading, we're waiting for 20 seconds for nothing."_

Acting on it found why the bound could never be sized well. **`mapFailed` fed the ternary that chooses between `ErrorState` and the `<APIProvider>` subtree**, so the tiles watchdog firing unmounted the live, mid-load `google.maps.Map` together with the `onTilesLoaded` listener about to resolve it. Every retry restarted from zero, so **a load genuinely needing longer than the bound could never finish** — and _"reloading the map solves the problem sometimes"_ is exactly what that looks like: each attempt re-rolls a dice requiring the whole load to fit inside the bound, with only the HTTP cache tilting it. The teardown is also what forced 20s: sessions 256/257 sized the bound so a working Slow-3G load could not be killed by its own deadline, which was correct reasoning about the wrong mechanism.

So §11's two signals stop collapsing into one outcome:

- **`onError`** (failed _script_ load) — unchanged, hard `ErrorState`, canvas gone. `mapFailed` is now this signal alone.
- **Tiles deadline** — a new `tilesLate`. Our markers on screen prove the script loaded and the map constructed, so the honest claim is slowness. The canvas stays live; the wait's own slot says `t.map.loadingSlow` (`הטעינה איטית מהרגיל`) and gains a `נסו שוב` pill; a late `onTilesLoaded` retires it unaided.

One slot rather than a second surface, so §11's one-floating-object rule holds by construction. And **it is the cheaper branch under §4** — which counts instantiations, not seconds: teardown-then-retry is what buys the second billed load.

With expiry no longer a verdict the asymmetry inverts, so the bound drops **20s → 4s**, above every session-256 success but the Slow-3G edge, which now resolves itself.

**Verified in real Chrome on Chrome's Slow 3G**, entering the tab for a fresh instance (session 257's isolation recipe: load unthrottled, then throttle, then re-enter):

| Elapsed    | State                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| 1.5s, 3.0s | `טוען את המפה…`, canvas constructing                                   |
| 5.0s       | **`הטעינה איטית מהרגיל` + `נסו שוב`**, canvas alive, **no hard error** |
| 7.0s       | still slow, way out still offered                                      |
| 10.0s      | **cue gone — tiles landed and cleared it**, canvas alive               |

That exact load was a hard failure and a destroyed map before the change. Retry **hit-tested rather than measured**: topmost at its centre is `.map-loading-retry`, topmost over the cue's text is the map div beneath (so `pointer-events: none` still holds for the cue), 26px box with a 44px target via `ValueToken`'s `::after` overlay idiom.

Three new unit tests, all trap-checked by reverting the timeout handler to `setMapFailed(true)` — three fail, restored, green. **56 passing** in the file; full frontend suite **209 files / 3609 tests**.

**What it does not claim:** that this is the last cause. It fixes a defect certain from the code and reproducible on demand, and it is **simultaneously the experiment** — if the map still fails, the merely-slow reading is ruled out, and the next step is a channel for `DevMapTuner`'s `diag` reading off the owner's own phone. That needs designing rather than improvising: `dev-tuning.ts` is deliberately tree-shaken out of production, and shipping the constant-override layer just to reach the panel is the wrong trade.

## 7. Correction to the environment notes

`pnpm --filter @waypoint/backend dev` failed on this machine with `Cannot find module 'ajv/dist/compile/codegen'` — a broken store link that `pnpm install` reports as _"Already up to date"_ and does not repair. `pnpm install --force` fixes it. Worth knowing before reading that stack as a code fault.
