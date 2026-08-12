# Session 256 — the map-load bound, measured; and a Retry nobody can reach (field report #35, workstream M)

**Date:** 2026-08-12
**Workstreams:** `M` (#35) — **measured and advanced, with a second cause found.** `S` (#36/#38) and `Q` (#32) — **not run; they need hardware this session did not have.**
**Touches:** `frontend/src/lib/dev-tuning.ts`, `frontend/src/ui/domain/MapPane.tsx` (+ its test), `frontend/src/dev/DevMapTuner.tsx` (+ its test), `frontend/src/screens/Map.tsx`, `docs/decisions/0146-the-device-pass-gets-an-instrument.md` (§5 amended in place), `docs/backlog.md`.
**No ADR, no mockup.** Two findings are routed rather than fixed, for the reason §6 gives.

## 0. What this was, and what it is not

This was **not** the device pass `M`/`S`/`Q` are waiting on — there was no phone. It is a **laptop pass in real Chrome against a real Google canvas**, which turned out to answer more of `#35` than expected, because the two questions that mattered are a **number** and a **layout**, and neither needs a handset to establish.

What makes it legitimate rather than the forbidden desktop emulation: **`http://localhost:5173/*` is already in the browser key's referrer allowlist**, so TRAP 1 does not exist here — the key is accepted, the script loads, and real tiles paint. `FRONTEND_URL` was already `http://localhost:5173`, so TRAP 2 does not exist either. **No setup was changed and there is nothing to revert:** no referrer entry was added, no env var edited, no `allowedHosts` line written. Postgres, Redis and both dev servers were already running.

**The control was established before anything was measured:** the trip loaded, and the Map tab painted Google terrain (dark Map ID `a82bd9002d0fe00e65851ce9`, `colorScheme: DARK`). Until that was seen, every failure would have been indistinguishable from setup.

What this **cannot** claim: these are desktop-Chrome numbers over emulated network conditions. **The absolute milliseconds do not transfer to the owner's phone.** Two things do, and §2 and §3 separate them carefully.

## 1. First, the instrument had to be able to answer the question

Two changes, both phone-independent, both prerequisites for a valid reading rather than parts of it.

### 1a. `tilesLoadedMs` — the instrument had no clock

`DevMapReading` carried `tilesLoaded` as a boolean, and `M.3` is a **duration**. Against a boolean the only way to answer it is to stopwatch a canvas by eye against a 10s bound.

It now carries `tilesLoadedMs: number | null`, stamped from a ref in `MapPane`'s `[attempt]`-keyed effect and published in `handleTilesLoaded`. Three properties, each load-bearing:

- **The zero point is the watchdog's own** — the stamp sits on the line before `withDeadline` starts counting, so the reported number and the bound it is judged against cannot drift apart. It also means the **bundle download is excluded**, which is what isolates the tiles phase from app start-up.
- **No second probe.** It rides the existing `publishMapReading` path off production's own `onTilesLoaded`, inside the existing `import.meta.env.DEV` gates (session 247 §2's rule).
- **Production cannot read it.** `mapFailed` is still decided from `tilesLoaded` alone.

Both `diag` and `emit()` show it **against `MAP_LOAD_TIMEOUT_MS.TILES`**, because the question is not "how long" but "how close to failing". A `null` emits as `(never painted)` rather than being omitted.

### 1b. The instrument was misreporting the map

`DevMapTuner` called `mapsConfig()` in render under a comment claiming the value was "build-time and unchanging". The three `VITE_` vars are; **the call is not** — it resolves `mapId`/`colorScheme` through the live `documentTheme()`, while `screens/Map.tsx:593` latches the config at mount. After any theme flip the panel reported the config the map **would** be built from, not the one on screen — and the default pick is `system` with a live `matchMedia` listener, so Android's scheduled dark flips it with no user action.

The panel now takes the latched `config` as a prop from the screen that holds it, as `DayConnector` already did. The live theme is still reported **beside** it, labelled `document theme now`, so a real disagreement stays visible as a finding rather than being hidden. ADR-0146 §5 amended with the general rule.

Each new test was **trap-checked** — the bug reintroduced, the test confirmed to fail (`expected null to be 2500`; the latched-config and emit assertions), then restored and re-verified green.

## 2. The measurement `#35` was waiting on

Every sample is a **successful** first tile paint — `api status: LOADED`, `tiles loaded this attempt: yes` — read off the `diag` tab. Bound: **10 000 ms**.

| Condition                        | Samples (ms)           | Share of bound |
| -------------------------------- | ---------------------- | -------------- |
| Unthrottled, cold (cache bypass) | 1472 · 1044 · 857      | ~9–15%         |
| Unthrottled, warm re-entry       | 647 · 681 · 653 · 657  | ~7%            |
| Fast 3G                          | 2698 · 2476 · 2463     | ~25%           |
| **Slow 3G**                      | **8158 · 8154 · 8169** | **~82%**       |
| **Slow 3G + 4× CPU throttle**    | **8609 · 8652 · 8698** | **~87%**       |

Two readings of this, and the second is the one that matters:

- **The bound has very little headroom on a bad network.** On Slow 3G a map that loads **perfectly** finishes at 82% of the budget. Three samples inside 15 ms of each other — this is not jitter, it is bandwidth.
- **It is bandwidth-bound, not CPU-bound.** A 4× CPU slowdown — roughly a mid-range Android against this desktop — added only ~500 ms. So the phone's silicon is close to irrelevant to this number and **the network decides it**, which is precisely why a laptop on a throttled link is a fair instrument for this one question and a phone's GPU is not the variable to chase.

**This supports reading (b) on the `M` line.** A network worse than Chrome's Slow 3G preset — congested mobile data, packet loss, a cold cache with more tiles to fetch — pushes a **succeeding** load past 10 s, at which point `mapFailed` flips on a map that was going to paint. And _"sometimes there is a map and sometimes there is not"_ is the signature of a threshold sitting just above the real distribution, not of a hard failure.

It does **not** prove the owner's phone crosses it. It proves the margin is ~1.3–1.8 s on a network that is not the worst real case, on a bound `constants.ts` itself labels unmeasured.

## 3. The finding neither reading anticipated: the Retry button is covered

Forcing a genuine script-load failure (the Maps script redirected to a dead host, so `APIProvider.onError` fires for real) answered `M.1` and then turned up something else.

**`M.1`, settled:** the on-screen string is **`לא הצלחנו לטעון את המפה`** — `t.map.loadError`, our own load failure. Not the trip-level error, not offline list-only, not a browser page error. The canvas is gone and the `ErrorState` holds its slot, exactly as the fix designed.

**Then the hit test.** Per this repo's own rule that a rect is not visibility, the Retry button was tested by hit-testing its centre rather than by measuring its box:

| Viewport  | pane height | Retry box | geoprompt band | overlaps | `retryHittable` | topmost element   |
| --------- | ----------- | --------- | -------------- | -------- | --------------- | ----------------- |
| 360 × 640 | 222 px      | y 197–234 | y 118–251      | **yes**  | **false**       | `.map-gbtn`       |
| 504 × 704 | 251 px      | y 211–248 | covers it      | **yes**  | **false**       | `.gbtns`          |
| 390 × 844 | taller      | y 242–279 | clears it      | no       | true            | `.fb-error-retry` |

**`.map-geoprompt` — the near-me reason-first card — is a sibling of `.map-pane` inside `.map-split`, positioned absolutely at `z-index: 2`, and it sits over the pane's band.** Dismissing it flips `retryHittable` from `false` to `true` with topmost becoming `.fb-error-retry`, which closes the causal loop.

At **360 × 640** — the geometry ADR-0126 names and `frontend/CLAUDE.md` cites — it is worse than an unreachable button: the card **covers the error state entirely**, so there is no message and no Retry visible at all (screenshot: `assets/session-256-retry-covered-by-geoprompt-360x640.png`).

**This is a second, independent cause for the exact words of field report #35** — _"an error is shown and the Reload/Retry button does not help"_. The retry is not broken; **the tap never reaches it.** Session 247 put `ErrorState` into the pane's slot without accounting for the card that already lived over that band, and the prompt is up by default on a cold open until it is answered.

Why no test caught it: jsdom reports every rect as zero, so this whole class is invisible to the unit suite by construction — the lesson `frontend/CLAUDE.md` already records twice.

**`M.4`:** the retry machinery itself is sound — it bumps the key, clears the published signals, and constructs a fresh attempt. Against a cause that is persistent by construction it fails again within ~300 ms, which is the correct behaviour, not a defect.

**`M.5`, confirmed:** with the pane showing the error, the place list stays fully usable — 8 rows, scrollable, the controls row and the sheet live. The fallback the fix promised holds.

**Excluded as the brief said, and re-confirmed incidentally:** a Map-ID fault. Terrain painted and pins drew from the same config, which is the mirror image of a Map-ID failure.

## 4. `S` and `Q` — not run

Neither is blocked on cleverness; both need hardware.

- **`S`** needs Samsung's own font at its own scales against the wrapped Hebrew face, and `S.3` is an owner call to be put while the phone is out. A laptop cannot render another vendor's font stack, and this session could not ask.
- **`Q`** is _two physical phones_, which is the whole ask (ADR-0017; two browser contexts are explicitly not two phones). The side glance was made as far as the repo answers it: **`railway.json` sets no replica count** — `deploy` carries only `healthcheckPath`, `healthcheckTimeout`, `preDeployCommand` and the restart policy. A hand-set count on the Railway service is still unverified (no authenticated dashboard session here).

## 5. Corrections to the brief

- The branch was **not** on origin at the start; it is now, and it is exactly `origin/staging`. **Base off `staging`, not `main`** — `main` has neither the `M`/`S`/`Q` lines nor sessions 249–255.
- **`MapPane.tsx` is `frontend/src/ui/domain/MapPane.tsx`**, not `screens/`; the probe and tuner are in `frontend/src/dev/`.
- The brief's claim that the pass is impossible without a LAN is **wrong for the half that mattered**: localhost is an allowlisted referrer, so the instrument runs at full fidelity on this machine for the timing and layering questions. Only the device-specific questions need the phone.

## 6. Two things routed, deliberately not fixed here

Both are certain as **defects**; each **fix** is a decision with consequences, and the brief's own rule is that anything larger than an unambiguous bound becomes a routed line with the evidence attached rather than an improvisation at the end of a long sitting.

- **The bound is too tight, and the number is now evidence-backed rather than a guess.** `MAP_LOAD_TIMEOUT_MS.TILES` at 10 s leaves ~1.3 s over a _successful_ Slow-3G load. Recommend raising it to **20 s**, matching `API_TIMEOUT_MS.FETCH` and staying inside the file's own sizing family. The cost is small and asymmetric: a genuine _script_ failure still surfaces immediately through `onError`, so a longer deadline only delays the silent never-painted case. Not applied because the confirming sample should be the owner's phone on real mobile data, and this is a documented ADR-0121 decision.
- **The pane's error state and the near-me prompt both claim one band, and the newer one renders underneath.** Two candidate fixes with different UX: raise the pane's `ErrorState` above `z-index: 2` (error wins; near-me stays reachable from the chip), or suppress the prompt while the pane has failed. The second is worse — near-me sorting is a _list_ feature that works fine without a canvas. Recommend the first. It is one CSS rule, but which surface wins that band touches ADR-0109 §6 and ADR-0121 §11, so it is the owner's call and it needs an e2e assertion, not a unit test.

## 7. Verification

- `pnpm typecheck` (all three packages) clean.
- `pnpm vitest run` on the two touched suites: `DevMapTuner.test.tsx` + `MapPane.test.tsx`, **62 passing**; both new checks trap-checked against reintroduced bugs.
- The instrument was exercised **against a real Google canvas** for the first time, which is what produced §2's table — no test can do that.
- Real Chrome 150, `390×844` and `360×640` mobile emulation for geometry, Chrome's own network/CPU throttling for §2. Every number in §2 is a `LOADED` + `tiles loaded: yes` reading, never an inferred one.
- The app was confirmed back to normal operation at the end (cold load 857 ms, no alert, canvas present).
- **No phone was involved. Nothing in §4 was measured.**
