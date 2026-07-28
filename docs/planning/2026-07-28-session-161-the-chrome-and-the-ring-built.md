# Session 161 — the chrome and the ring, built

**Date:** 2026-07-28
**Kind:** build, of [ADR-0132](../decisions/0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) (designed in session 160).
**Records:** that ADR's [build log](../decisions/0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md#build-log-2026-07-28-session-161), which carries the reasoning; this note is the session's own account.

## Two tiers, because the first one is worth shipping alone

**Tier 1 (§1–§5), frontend only, spends nothing:** the layout modifier, the safe-area
rule, the disclosure-open predicate, the back layer. That alone clears the ADR-0106 §B
failure at 360×640 — which is the reason this phase is a condition rather than a polish
pass, so it goes first and could have gone alone.

**Tier 2 (§6–§7), and it changes SKU:** `placeResultSchema` + `searchPlacesTextSchema` in
`@waypoint/shared`, `GooglePlacesClient.textSearch` with its own field mask and
`locationBias`, a `search-text` route under the same throttle, the search core
parameterised by corpus, and rings on the canvas.

## What the build changed from the design, and why each is better

- **The back rule turned out to already exist.** §5 specified "one rule in `resolveBack`";
  the mechanism is `useBackLayer`, which is what `resolveBack` consults first. So
  `resolveBack` is untouched and `nav-state` learns nothing about the Map tab — the
  coupling the overlay stack exists to avoid. One line was needed: an `active` flag, for a
  layer whose owner outlives it (every existing caller says "there is something to peel"
  by being mounted; this one is a state of a screen that never unmounts).
- **The place card's third occupant was not built.** §8 made it the condition for
  reopening the map extreme. That stop is still closed while a query is live, so the card
  branch is unreachable — a ring tap selects its ROW and scrolls it into view, which is
  ADR-0122 §7's rule read correctly. Writing the card now would be dead code for a state
  that cannot happen.
- **The add got cheaper, and the design missed it.** §7 costed the search and stopped. The
  add was still paying a Place Details call for the name, address and point the Text Search
  response already carried. `resolvePlaceSchema` gained an optional `details` and the
  service skips Google when it is there: one call for the search, none for the add.
- **`PlaceResearch` became presentational, forced by the SKU** rather than by taste: the
  same results are rings now, and a component inside the sheet cannot hand anything to the
  canvas. Its tests split along the same line.
- **One core, two corpora** (`{ enrichPlaceId, corpus, biasRef }`) instead of a second
  hook — the floor, debounce, abort, dedup and 429 handling are identical, and
  `PlaceResult` is a `PlacePrediction` plus coordinates.
- **The bias is a ref, not a value.** As a value it is an effect dependency, and a camera
  idle would then re-bill the query. It is read when a request fires.

## Two orderings and one seam worth remembering

A result **already in the trip gets no ring** — it already has a pin, and a ring over it
would draw one place twice while saying the opposite thing about it.

The ring sits **below every trip pin**, ghosts included (`MAP_RESULT_Z`, named beside
`TIER_Z`): what you have outranks what you might add.

And `MapPane`'s test stub keeps rings in **their own list**, never in `pins`. A test that
found a ring in `pins` would be asserting the thing §6 refuses.

## What tripped me up

- **`let chrome` at the top of a module-level script cannot shadow `window.chrome`** — that
  one was session 160's mockup, and it cost a debugging round there. Worth remembering
  before naming any global-ish binding `chrome`.
- **The DB-backed backend specs need a seeded database, not just a running one.** Eight
  `places.service.spec.ts` failures in this sandbox were `Trip_createdBy_fkey`, i.e. no
  dev user — `prisma:migrate` then `prisma:seed`. `backend/.env` is what `vitest.config.ts`
  reads, and the repo-root `.env` is only the second place `prisma.config.ts` looks.
- **Fixture leakage between tests in a new describe.** The ring tests share a module-level
  search stub, and the "already in the trip" case left `referenced` set, so two later tests
  saw no rings and no add button. A `beforeEach` reset in the describe, not a global one.
- **One frontend test failed once and did not reproduce** across three subsequent full
  runs (1493 tests, green each time). I could not identify which one from the truncated
  reporter output, so it is recorded here rather than claimed as fixed.

## Still owed

**The map extreme** (ADR-0132 §8): half of session 159's reason for closing it dies now
that results are visible rings, but a coordless match is still invisible there, so
reopening it is a decision to take rather than a consequence to apply. And the **device
pass** owns the ring's legibility over real tiles, the real keyboard heights, whether `＋`
reads inside a 28px ring, whether a chrome-less tab still reads as "in the app", and the
owner's real safe-area insets.
