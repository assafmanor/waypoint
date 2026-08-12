# Session 257 — the bound, the wait, and the band (field report #35, workstream M)

**Date:** 2026-08-12
**Workstream:** `M` (#35) — **the three fixes session 256 measured and routed, now built.**
**Touches:** `frontend/src/constants.ts`, `frontend/src/i18n/he.ts`, `frontend/src/ui/domain/MapPane.tsx` (+ its test), `frontend/src/ui/domain/map-pane.css`, `frontend/src/screens/map.css`, `docs/decisions/0121-embedded-map-phase-6-design.md` (amended in place), `docs/backlog.md`.
**No new ADR** — ADR-0121 is amended in place, which is where both the bound and the list-only outcome already live. **No mockup:** the loading cue is one line of muted text in an existing slot, and the layering fix removes a collision rather than designing a surface.

## 0. What this is

Session 256 measured `#35` and deliberately routed three fixes rather than improvising them at the end of a long sitting. The owner asked for all three. This is them, each verified in real Chrome against a real Google canvas — not in jsdom, because two of the three are things jsdom cannot see.

## 1. The bound: 10s → 20s

Session 247 sized `MAP_LOAD_TIMEOUT_MS.TILES` at 10s and said plainly it was unmeasured. Session 256's samples, every one a **successful** first paint: ~650ms warm, 0.9–1.5s cold, ~2.5s Fast 3G, **8.15s Slow 3G** (82% of the bound, three samples inside 15ms), 8.6s Slow 3G + 4× CPU.

**Bandwidth-bound, not CPU-bound** — 4× CPU added ~500ms — so the phone's silicon barely enters into it and the network decides. A bound sized against a good link reports a working map as broken on a real one.

20s doubles the worst measured success. The argument for being generous is the **asymmetry**, and it is now written into the constant's own comment: a failed _script_ load still surfaces immediately via `onError`, so a longer deadline delays only the case Google gives no event for — whereas too short a bound both lies and bills a fresh instantiation per retry tap (ADR-0121 §4).

Every existing assertion referenced the constant symbolically, so nothing needed rewriting to accommodate it — which is the payoff for the no-magic-values rule.

## 2. The wait, stated

The reason a longer bound needs company: before the first tile, the canvas is empty while our own markers already draw on it — **the same picture #28 reported as a failure** — and at 20s a slow link can hold it for real seconds. Twenty seconds of unexplained blank is a worse bug than the one being fixed.

`MapPane` now renders `t.map.loading` (`טוען את המפה…`) until `onTilesLoaded` fires. Four properties, each deliberate:

- **No new mechanism.** `onTilesLoaded` is already the signal the watchdog waits for; this is that boolean rendered. No timer, no second probe, and it resets on `[attempt]` so a retry says "loading" again rather than holding the failed attempt's last word.
- **Outside `<Map>`**, like every other piece of our chrome — the rule the file already states two lines below the insertion point.
- **Over the canvas, not instead of it.** Google needs its own div live to paint into, which is exactly why `ErrorState` _can_ be a branch around the map and this one cannot.
- **`pointer-events: none`.** A cue is a statement, never a target: the pan and the long press belong to the canvas underneath (ADR-0148's gesture seam). **Verified, not assumed** — hit-testing the cue's own centre mid-load returns the element beneath it, not the cue.

No delay or grace period. A ~650ms appearance on a fast load is informative rather than a flicker, and a delay would have meant either a second timer or a CSS animation whose `prefers-reduced-motion` fallback could leave the cue invisible forever. Not worth it.

## 3. The band: a failed pane owns it

The second cause, and a defect in its own right. ADR-0109 §6's near-me card is canvas furniture pinned to the pane's **top** at `z-index: 2`; session 247 put `ErrorState` — which centres in the pane's **full** height — into the same slot without accounting for it. At 360×640 (pane 222px, card 133px) the card covered the error outright and `Retry` was not hittable, `.map-gbtn` winning the tap.

**I built the routed recommendation first and rejected it on looking at it.** Raising the error above the card (`z-index` + `pointer-events` so the tap always lands) worked exactly as designed — `RETRY_HITTABLE: true`, and the card's own Allow button still hittable — and it **read as two cards printed on top of each other**, because a 222px pane genuinely cannot hold both. Screenshot kept, because "the fix worked and was still wrong" is the useful part.

So it is a **room question, not a z-order one, and the card is what goes:**

- The error is the screen's only explanation of why there is no map, and carries the only way out of that state.
- The card is transient, asks a question about a canvas that is not currently drawing, and its feature — near-me sorts the **list** — needs no canvas and returns with the map.
- This is §11's own "ONE floating object over the canvas at a time" applied honestly, so it is **one `:has()` rule** beside the one that already hides `.map-areacount`/`.map-camctl` for that same reason. No prop: `MapPane`'s props stay identity-stable on a screen that re-renders every second.

**Stated rather than hidden:** near-me _by pre-prompt_ is unavailable while the pane is failed — `promptOpen` stays true behind the hidden card, and the chip cannot re-open what is already open. A secondary control degrades during a failure so the primary explanation can be seen, and it lifts the moment the map loads.

## 4. Verification — in a browser, because jsdom cannot see any of this

Two of the three fixes are CSS and geometry. jsdom reports every rect as zero and computes no stacking, so a passing unit test would have proved nothing about either. All three were driven in real Chrome at **360×640**, the geometry that failed:

| Check                             | Before (session 256)           | After                                   |
| --------------------------------- | ------------------------------ | --------------------------------------- |
| `RETRY_HITTABLE`                  | **false**, topmost `.map-gbtn` | **true**, topmost `.fb-error-retry`     |
| Pre-prompt while failed           | covers the error entirely      | `display: none`, error reads clean      |
| Place list beside the failed pane | 8 rows usable                  | 8 rows usable                           |
| Loading cue mid-load              | did not exist                  | `טוען את המפה…`                         |
| Cue passes taps to the canvas     | —                              | **true** (`pointer-events: none` holds) |
| Cue after paint                   | —                              | gone                                    |
| Slow 3G load with the new bound   | borderline at 82%              | loads, **no error state**               |

Screenshots: `assets/session-257-error-owns-the-band-360x640.png`, `assets/session-257-map-loading-cue-slow-3g.png`.

Note the setup detail that cost a first attempt: throttling to Slow 3G **before** load starves the trip fetch too, so the Map screen never renders and there is nothing to observe. Load unthrottled, then throttle, then leave and re-enter the tab — a fresh map instance on a slow link, which isolates the tiles phase. Same isolation session 256 used for its samples.

- Unit: `MapPane.test.tsx` gains two — the cue appears until tiles paint and stops after, and "never loading and failed at once, and says it again on a retry". **64 passing** across the two touched suites.
- `pnpm typecheck` clean, `pnpm --filter @waypoint/frontend build` clean, full frontend suite at the pre-existing baseline (see §5).

## 5. What is still open

- **The owner's own phone on real mobile data** — whether it crosses even 20s. The desktop numbers bound the question; they do not answer it.
- **WebGL is untested, not excluded.** Every session-256 sample read `webgl context lost: n/a`, meaning `DevMapProbe` never observed a canvas to listen on. If #35 survives these three fixes on the owner's phone, that probe is the next thing to make work, because a GPU/context-loss cause has had no evidence brought against it either way.
- **`S` (#36/#38) and `Q` (#32)** are untouched and still need a handset.
