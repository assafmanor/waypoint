# Session 263 — the map becomes ours (design session, ADR-0186)

**Date:** 2026-08-13
**Output:** [ADR-0186](../decisions/0186-the-map-is-ours-and-it-works-on-a-plane.md) — accepted as a design, **not built**.
**Touches:** `docs/decisions/0186-…md` (new), `docs/decisions/README.md`, `docs/INDEX.md`, `docs/backlog.md`, and in-place pointers on `0106` §7 and `0121` §3/§11/§14.
**No code, no mockup yet.** The style JSON gets one in Phase 2; there is nothing to draw before the renderer exists.

## 0. Why a design session followed two bug fixes on the same day

Sessions 262 and 262b found and fixed field report #35's third and fourth causes. Both were real, both verified in a browser, and neither addressed the shape of the thing. The owner's summary after the third fix shipped was the prompt: _"map loading is still failing sometimes for unknown reasons … so not all issues were resolved"_, followed by the question that reframed the problem — _"if it's possible it would be the best solution, is it possible to add offline maps? It would both solve the map not loading issue I think, and also it would give us a map that is available offline (on the flight etc)."_

The answer is yes, and the ADR is why. What made it worth a design session rather than a spike is that **the reason the repo had ruled it out is wrong**: ADR-0106 §7 records offline tiles as _"a PWA limitation the PRD already accepts."_ A browser renders a map with no network perfectly well. It is a **Google** limitation, twice — the JS API has no offline mode, and the platform terms forbid storing tiles. A limitation of the vendor is answered by changing the vendor.

## 1. The measurement that made it tractable

Before proposing anything, the actual coupling was counted rather than estimated. Two greps:

- **The Google JS API appears in eight non-test files, all rendering.** Place search, autocomplete, photos and enrichment never touch it — they already go through the ADR-0108/0110 backend proxies.
- **The live-map API surface is seven methods**: `getZoom`, `moveCamera`, `getCenter`, `getDiv`, `getProjection`, `addListener`, `fitBounds`.

That is the whole reason this is a port and not a rewrite, and it is a payoff the repo arranged on purpose: ADR-0121 §13 put every _decision_ about the map in pure `lib/` functions, and §6 kept the pins as our own DOM. So the pin ladder, the camera rules, the tier system and the filters are untouched, and `.map-pin` transfers to a `maplibregl.Marker` unchanged.

Three pieces get **simpler**, not harder: a real `line-dasharray` for the day connector (ADR-0121 §10 had to fake one along a transparent stroke), and `clickableIcons`/`disableDefaultUI` stop being concepts at all.

## 2. The four decisions the owner made, and the two they corrected

Asked as a single set, because they are interdependent:

| Question                                            | Answer                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Bug hunt vs. offline project                        | **Both** — quick fix first, then design                                                              |
| Replace the renderer or keep Google with a fallback | **Replace entirely**                                                                                 |
| How the download happens                            | **Automatic on wifi when a trip is opened** (over my recommendation of an explicit per-trip control) |
| Zoom depth                                          | **z0–14**, city-level streets                                                                        |

Then two corrections that changed the design rather than decorating it:

- **_"perhaps we should think about auto cleaning after a trip is finished or something."_** Right, and load-bearing: automatic download without automatic eviction fills the phone. It produced §6's principle — **an extract is a cache, never data** — which is what licenses aggressive eviction and therefore what earns the right to download without asking. There is no budget/LRU layer in the app today (`doc-cache.ts` evicts dead versions only, i.e. for correctness), so this is new infrastructure, shaped for document blobs to adopt later but deliberately not migrating them.
- **_"what if the trip consists of a cross country trip? What about the layovers? Places outside of the trip countries?"_** This killed the per-trip-bbox model outright. Tokyo→Kyoto→Osaka is a tolerable box; Iceland's ring road is mostly ocean; Paris **and** Tokyo is the northern hemisphere. The replacement is §4: a **coarse z0–6 world layer** downloaded once so nowhere is ever blank, plus **one z7–14 extract per geographic cluster** of the trip's coordinates. Layovers then need no special case at all, because a flight booking's endpoints are already `Place` rows with coordinates (ADR-0166 §18). Countries never enter into it.

## 3. Two things I recommended against and recorded anyway

- **Automatic download.** I recommended an explicit control with a size estimate; the owner chose automatic. Built as chosen, with the four obligations in §5 that make automatic safe by construction rather than by asking — and with one honest limit surfaced rather than swallowed: **`navigator.connection` is Chrome-only, so on iOS wifi-vs-cellular is undetectable.** Since the app's whole point is being abroad, automatic there would risk a roaming bill, so it degrades to a one-time per-trip prompt on that platform only.
- **No React wrapper.** `react-map-gl` would shorten the port, and it is refused because the bug that started all of this was a wrapper's module-global lifecycle state. Seven methods do not need a wrapper; ADR-0121 §3's first bullet ("the loader is a singleton problem") was the correct diagnosis with the wrong remedy — adopting a binding did not remove the singleton, it inherited one we do not own.

## 4. What the ADR deletes

Worth listing, because it is most of the complexity the Map tab has accumulated: ADR-0121 §4's entire per-instantiation billing invariant (which shaped `MapPane`'s memoisation, its retry, its teardown and half its comments), `MAP_LOAD_TIMEOUT_MS.TILES` and the watchdog, `mapFailed`/`tilesLate`/`__resetModuleState`, all four causes of #35, the three `VITE_GOOGLE_MAPS_*` vars, and §11's "offline the map is absent" — the Map tab stops being the one screen that needs a network.

## 5. What is deliberately not asserted

The ADR's §Still-open and Phase 0 carry these rather than the prose pretending to them:

- **MapLibre requires WebGL, and so does Google's renderer.** If #35's residue is a GPU or context-loss fault — untested rather than excluded since session 257 — this does not fix it. That is why Phase 0's first item is the fourth fix on the owner's real phone, and why Leaflet + raster stays a named standing answer rather than a dismissed alternative.
- **Whether a bbox can be extracted from a remote planet archive over range requests**, or whether the planet has to be hosted. Believed yes; not verified, and it changes the backend's cost.
- **Actual extract size at z0–14 for a dense city**, and **iOS storage headroom** on the owner's device.

The cluster radius, the box padding, the world-layer floor, the grace window and the byte budget are all named as numbers to measure or for the owner to set, not picked here.
