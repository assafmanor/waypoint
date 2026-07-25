# Session 111 — Maps & Places Phase 5: Plan-mode place research

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0115](../decisions/0115-plan-mode-place-research.md) (Accepted — design + build)
**Mockup:** [`mockups/map-research-v1.html`](../../mockups/map-research-v1.html)

## What this session picked up

Phase 5 of the Maps & Places epic ([ADR-0106](../decisions/0106-maps-and-places-epic-scope-and-phasing.md)): search Google from the Map tab, pin the results, `＋ אולי` onto the shelf. [ADR-0109](../decisions/0109-map-tab-design.md) deliberately deferred the detailed design to this build session and left one instruction — **mock it against the real picker**, reusing the shared search core and the result-card grammar sketched in `plan-mode-v1.html`. So the session was a design pass (mockup + ADR) and then the build, in that order.

Phase 6 was **not** started: it is still blocked on the human Google Cloud step (enable Maps JS + Routes, add Routes to the server key, mint the referrer-locked browser key, set the Dynamic Maps/Routes daily caps, re-confirm current Maps pricing).

## The one thing that made this phase different

Phases 3–4 were pure client-side derivation over the snapshot — free, offline-safe, unmetered. **Phase 5 is the first feature in the app that spends money per user keystroke.** Everything below follows from that, and the first question was what already exists rather than what to add:

- **Frontend (already there, unchanged by this session):** `lib/usePlaceSearch.ts` owns the FE-minted session token (lazy, threaded through every search + the terminating pick, retired on pick or reset), the pause-gated debounce (`PLACE_SEARCH_DEBOUNCE_MS` / `PLACE_SEARCH_MIN_CHARS` — a cost control, not polish), the snapshot-derived `alreadyInTrip` dedup that links without spend, soft 429, and abort-on-supersede.
- **Backend (already there):** `PlacesThrottlerGuard` per member·trip (per-minute + per-day, `${userId}:${tripId}`), dedup-before-spend on `(tripId, googlePlaceId)`, the Pro-tier field mask (ADR-0111), all behind `MembershipGuard`, under the Phase-0 budget alert + daily quota cap.

Nothing was added to that machinery. What the session decided is **where the first paid call comes from.**

## What was decided (detail in ADR-0115)

1. **The paid half is armed by intent.** ADR-0109 §2 read as "in Plan mode the search icon opens Google research". Taken literally, that deletes the free filter in the mode with the longest list, and makes tapping a magnifier a purchase. So the overlay opens on the **free half in both modes** (the trip's own places, the same rows the list renders) and Plan mode adds a `חיפוש בגוגל` card. After arming, typing is the picker's behaviour verbatim until the overlay closes — the session token is the billing unit, so mid-session keystrokes are the cheap part. Same posture the tab already takes with the device: the geolocation permission is asked on intent, never on open.
2. **A result card says only what the relay returns.** Mocking against the real picker is what surfaced this: `plan-mode-v1.html`'s card draws `4.5★`, `1.2 ק״מ`, and a category glyph — the ★ is an Enterprise field ADR-0111 deliberately defers, a prediction carries **no coordinates** (so no distance is computable), and `types` aren't in the mask. All three are dropped, and the catalog records the sketch as superseded on exactly those points.
3. **`＋ אולי` _is_ the pin.** No rendered map until Phase 6, so pinning is the write: one `pick` (enrich-or-link, zero spend on a dedup hit) then an **uncategorised** unconsumed `MaybeItem` referencing the place. The reference is what makes it in-trip (ADR-0112), so the place shows up on the Map list with `על המדף` and on the Plan shelf. The existing toast + undo covers it; an undone add keeps the cached `Place` row, so re-adding is free.
4. **Already in the trip is stated, not re-addable** (`על המדף` / `כבר בטיול`), both from free derivations.
5. **Offline the Google half is absent, not disabled** (the near-me rule from session 105), and a 429 is a soft banner over a working free half.
6. **Plan mode only.** Trip-mode discovery is a different query shape and SKU; it gets its own ADR if we ever want it.

## What was built

- **`screens/PlaceResearch.tsx`** (net-new) — the second thin shell ADR-0110 §1 pre-shaped, over the **same** `usePlaceSearch`. Arming is expressed by _not feeding the hook a query_ until armed, so the core needed no change and there is no second search path. Rows reuse the shipped `.place`/`.map-badge`/`.map-main`/`.map-right` grammar and the `.map-grouphead` header; the new CSS is only the arm card, the violet `＋ אולי`, the "already ours" statement, and the neutral result badge.
- **`screens/Map.tsx`** — Plan mode threads the plan copy through the search button/overlay and renders `בטיול` + the list + `<PlaceResearch>`; Trip mode is byte-identical to before.
- **`state/verbs.ts`** — `addMaybe(title, { icon, category, placeId })`: the options bag replaces three positional optionals, and `applyAddMaybe` now sends `placeId` on the `CREATE_MAYBE_ITEM` op (the field `applyPark` already sent — a gap, not a new path). No schema change: `MaybeItem.placeId` and `createMaybeItemSchema.placeId` already existed.
- **`lib/places.ts`** — the Google Maps place-URL query building is generalised into one helper so a prediction (name + `googlePlaceId`, no coords) yields the same free deep-link the list rows use (`mapsPredictionUrl`), rather than a second URL builder.
- **Copy** in `i18n/he.ts` (`t.map.search.plan*` + `t.map.research.*`), no magic strings.

## Testing

`PlaceResearch.test.tsx` (11 tests) mocks the search core to assert the one thing this shell owns — **nothing reaches the paid core before arming** — plus the card's content (name + address, no ★, no distance, the free deep-link), the add flow (`pick` once → `addMaybe` with the `placeId`, uncategorised), both "already ours" statements, the offline absence, the soft 429, and token retirement on close. `Map.test.tsx` covers the wiring: Plan mode offers the trip group **and** the arm, Trip mode offers neither.

Two harness notes, both from the session-110 lesson:

- The new screen tests **pin `now`** (`setSimulatedNow`) rather than reading the real system clock against fixed-date fixtures.
- Research is asserted in **both day scopes** (Plan's default all-days and a narrowed day), because those are separate render paths on this screen.

`pnpm format` / `lint` / `typecheck` / `build` green; the full frontend suite is 919 tests across 87 files.

## Not done, deliberately

- **No live run against Google.** The sandbox has no `GOOGLE_MAPS_SERVER_KEY`, so the proxy can't answer; the surface is covered at the component level and the core it calls was already exercised in Phase 1. Worth one manual pass on staging when a key is present — specifically the arm → type → pick → shelf round-trip and the `על המדף` flip.
- **Phase 6** (rendered map) — still gated on the human Google Cloud step.
- **ADR-0109 follow-up (d)** — `מפה`/view → in-app map focus — still waits for Phase 6's rendered map.
- **An explicit per-query submit inside an armed session** (cheaper still, worse to use) — recorded in ADR-0115's consequences as the next lever if the bill ever argues for it.

## Repo hygiene notes recorded this session

Two things that cost time and weren't written down anywhere, now added to the durable docs rather than left in a session note: the clock/scope testing rule (`frontend/CLAUDE.md` → Testing) and the squash-merge re-baseline recipe (`docs/engineering/conventions.md`).
