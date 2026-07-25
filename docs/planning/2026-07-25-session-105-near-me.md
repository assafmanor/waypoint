# Session 105 — Near me now: a re-sort and a distance, asked for only when you ask

**Date:** 2026-07-25
**Kind:** Feature (Maps & Places epic, **Phase 4a** — closes Phase 4).
**ADRs:** [0109](../decisions/0109-map-tab-design.md) §6–7 (the design this implements) + a **session-105 amendment** (the OS-settings deep-link is not a thing on the web), [0006](0006-no-live-location-v1.md) (own-device IN, group sharing OUT — the promise the pre-prompt makes in words).

## Why

Phase 4's other half. 4b gave the map its time anchor ("when do I leave for the next stop"); 4a gives it the spatial one ("what is near me right now") — the U-06 question the tab exists to answer. It ships before the rendered map (Phase 6) on purpose, so proximity is expressed **numerically and by order**, with no spatial "me" dot to place.

## Change

**`lib/distance.ts`** — a haversine plus one formatter, and that is the entire spatial maths of Phase 4: no routing, no Google call, no tiles, correct offline. `formatDistance` drops precision as the number grows (10 m steps below a kilometre, one decimal to 10 km, whole kilometres past it) because the extra digit stops meaning anything — nobody navigates by "11.6 ק״מ". It also never rounds a place you are standing on down to zero.

**`lib/useGeolocation.ts`** — the permission/position state machine: `idle → locating → granted | denied | unavailable`, plus a **`blocked`** flag read from the Permissions API. The position lives in React state for the life of the screen and is never persisted, never sent to the backend, never put on the wire (ADR-0006). Two deliberate calls:

- **One shot per request, not `watchPosition`.** "Near me now" answers a question the user just asked; a fix plus a re-tap to refresh costs far less battery than a live stream, and nothing on screen needs metre-by-metre updates.
- **`blocked` is what separates a retry from a lie.** If the browser has hard-denied us, tapping "retry" cannot re-prompt — so the UI must not offer one. This is the distinction the ADR amendment below turns on.

**The Map tab.** Everything is additive; the whole surface above still renders with zero location:

- **The chip asks for nothing on open.** Tapping it opens an **inline reason-first card** ("המיקום נשאר במכשיר ואינו משותף עם הקבוצה") and only its "אפשר מיקום" reaches the device. A card, not an overlay — it explains rather than interrupts, and the list stays usable behind it (so no `Modal`/`useOverlay`, which govern overlays).
- **Granted** → nearest-first order under a `לפי קרבה אליך` header, teal distance chips per measured row, coordless Place-lites sinking last with no distance (they can't be measured until the picker enriches them). Ties and unmeasured rows fall back to the default day/name order, so the list is never arbitrary.
- **Refused** → the list keeps its own order, no chips, and a dismissable `StatusBanner` says what it is sorted by instead. The trailing affordance is a **retry** when asking again can still succeed, and a **settings hint** when it can't.
- **Offline** → the chip is **removed, not disabled** (you cannot re-locate, so there is nothing to offer), any showing distance becomes `מרחק לא זמין` rather than a stale number, and the rows desaturate under the existing "last saved" banner — the offline grammar design-language already prescribes for this surface.

Teal carries all of it (near-me, distances, `נווט`), which is exactly its budget role. The only amber on the tab remains 4b's single navigate-to-next tag.

## One design decision the ADR couldn't have made

ADR-0109 §6 asked for a re-enable affordance that "deep-links to the OS location settings when the permission is hard-denied." **The web has no such API** — a page cannot open OS or browser location settings, and no permission prompt can be re-triggered once a site is hard-denied. Rather than ship a button that looks like it does something, the affordance splits by what is actually possible: a real **retry** while the permission is still promptable, and an **instruction** ("אפשרו מיקום בהגדרות הדפדפן") once it isn't. Recorded as the ADR-0109 session-105 amendment, since it revises a stated design decision rather than merely implementing it.

## A smaller deviation, recorded

The mockup shows `מרחק לא זמין` on **every** coord row when offline. Shipped: only rows that were **already showing a distance** get it — i.e. near-me was on. Telling someone a distance is unavailable when they never asked for one is noise, and the ADR's wording ("**any** distance reads…") supports the narrower reading.

## Verification

- `lib/distance.test.ts` (new, 8): haversine zero/symmetry and two known distances (TLV→Tokyo ≈ 9200 km, a 1.1 km block) to within a percent; the formatter's three precision bands, the 999 m→1000 m boundary, and the never-round-to-zero floor.
- `lib/useGeolocation.test.ts` (new, 8): idle asks for nothing; locating→granted exposes the fix; `PERMISSION_DENIED` is denied **and** blocked while a failed fix is unavailable and **not** blocked; no geolocation API at all; a hard-denied site setting read up front while still `idle`; a second request refreshes; a fix landing after unmount is ignored.
- `screens/Map.test.tsx` (+9): nothing requested on open; the pre-prompt gates the device call; "לא עכשיו" asks nothing; granted re-sorts nearest-first with the header and chips (`10 מ׳` / `1.1 ק״מ`, none on the coordless row); toggling off restores the default order; denied shows the hint and **no** retry; unavailable shows a retry that works; offline hides the chip and swaps both distances for the unavailable label.
- `typecheck` + `lint` (0 errors) + `build` green; frontend suite **878** passes (853 → +25); `pnpm format` clean.

## Next

**Phase 4 is closed.** Remaining epic work: **Phase 5** (Plan-mode research — search Google on the tab → pin results → "+ maybe" onto the shelf, reusing the picker's search core) and **Phase 6** (the rendered map), the latter still gated on the human Phase-0 slice: enable Maps JS + Routes, add Routes to the server key, mint the referrer-locked browser key, set the Dynamic Maps/Routes daily quota caps — and re-confirm current Maps pricing before building. Phase 6 also unblocks the two deferred Map-tab follow-ups: the `מפה`/view → in-app focus (`TODO(phase-3)` on `mapsPlaceUrl`) and the near-me "me" dot, which this session's sort gains for free.
