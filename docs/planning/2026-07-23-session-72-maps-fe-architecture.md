# Session 72 — Maps & Places frontend architecture (ADR-0110)

**Date:** 2026-07-23
**Type:** Frontend-architecture session (paper only, no feature code). Session #3 of ADR-0106's follow-on roadmap ("FE-architecture"), the last of the three (design / BE-arch / FE-arch) before implementation.
**Output:** [ADR-0110](../decisions/0110-maps-and-places-frontend-architecture.md) (Accepted).
**Read first (handoff set):** ADR-0109 (surface + §12 picker flow + reuse audit), the "FE-architecture handoff" section of [session-70](2026-07-23-session-70-maps-backend-architecture.md) (ADR-0108's hard FE requirements), ADR-0106/0107, `frontend/CLAUDE.md`, and the reused code (`lib/time.ts`, `lib/places.ts`, `lib/index-bookings.ts`, `state/nav-state.tsx`/`trip-state.tsx`, `ChoiceGrid`/`WhenField`/`DayStrip`/`ListRow`/`Modal`+`useOverlay`).

## Frame (inherited, not re-opened)

Scope/phasing (ADR-0106), time model (ADR-0107), backend/cost/key shape (ADR-0108), and the whole surface + reuse audit (ADR-0109) were already merged. This session decided only the **client-side code structure** behind that settled surface — module layout, the derivations, state, and zone threading — and produced the FE-architecture ADR. No feature code.

## What was decided (the four genuinely-open structural calls)

1. **One shared search core, two shells.** A net-new **hook** `lib/usePlaceSearch.ts` owns the FE-minted session-token lifecycle, the mandatory pause-gated debounce (`PLACE_SEARCH_DEBOUNCE_MS ≈ 350`, `PLACE_SEARCH_MIN_CHARS ≈ 2`), the `alreadyInTrip` dedup match (a client-side derivation over the snapshot, _not_ a proxy field), soft 429 handling, and the offline name-only fallback. Two proxy calls extend `lib/api.ts` (`searchPlaces`, `resolvePlace` — with `enrichPlaceId?` for enriching an existing Place-lite). `ui/primitives/PlacePicker.tsx` is the net-new single-select shell (overlays via `Modal`/`useOverlay`); the Phase-5 research surface will be a second thin shell over the same hook (deferred). **Hard boundary drawn:** the outbox carries offline-capable writes (name-only Place-lite via the existing `CREATE_PLACE` verb); the proxy search/resolve are online-only enrichment and are _not_ outboxed. Online resolve reuses the existing `place` sync registry (ADR-0094) — nothing new to register.

2. **The place-usage derivation → `lib/place-usage.ts`.** One `buildPlaceUsageIndex` builds on the existing linked/unlinked resolver (`lib/places.ts` `eventPlaceId`/`eventRoute` — not re-derived, ADR-0106 pt 4) and **feeds both the filter chips and the pin colour**. Union semantics + colour-by-most-committed (`hard > soft > idea`), multi-day edge-loud/middle-ambient via the shared `isMultiDay`/`isAmbient`, coordless flagging. Category→hue is a `CATEGORY_PIN_HUE: Record<EventCategory, PinHue>` (9→5, uncategorised→leisure) in `constants.ts` with hue tokens in `tokens.css`. Filters reuse the `ChoiceGrid` pills + `SearchOverlay` + `--idx-accent` primitive; the counting is map-specific new logic in the same idiom (explicitly **not** generalizing `index-bookings.ts`'s booking-specific helpers — a substantial refactor for little gain, flagged per rule 8). Type = single-select like the Index; maybes = an independent toggle chip; day scope is on the strip, not a chip.

3. **Per-event zone threading through `lib/places.ts` + `lib/time.ts`.** `eventDisplayZones(...) → { start, end }` sticky resolver (place > segment > trip primary; transport asymmetric start/end), reading cached `Place.timezone` only (never computing, ADR-0108 §2). A `partitionZoneSegments(...)` helper keyed off zone-crossing transport. Zone chip added to `WhenField`/`TimeField` (one chip day-variant, two for transport span, real SVG caret) opening a minimal `ZonePicker` overlay. **Resolved ADR-0107 §7's store-vs-derive sub-question: `Event.displayTimezone` is a manual override, derived by default** — null = trust the derivation (so "add the outbound flight → placeless times reorient" still works, §3), non-null = the user pinned it via the chip (true stickiness where §2 demands it). Field shape unchanged from ADR-0107's proposal; only its semantics are pinned ("override," not "resolved-zone cache"). Data-model session confirms the field.

4. **Context-aware `setActiveDate`.** Add a named `DAY_SCOPED_TABS` set (`days`, `map`) in `nav-state.tsx`; `daySelectTarget(date, today, currentTab)` preserves a day-scoped current tab instead of always landing on `days`, so tapping a strip day _on the Map_ focuses in place (the Day view's existing rule, now literally true for two surfaces). `resolveBack` untouched (pure structural function, ADR-0090/0102). "All days" is Map-screen-local state defaulting by mode (Trip→today, Plan→all), not a second URL source of truth; one minor `DayStrip` `allScope?` prop suppresses selection styling when active.

Two model touches confirmed for the FE (both ADR-0109's, no new structure): `Place.rating`/`userRatingsTotal` + a shared `placePredictionSchema` in `@waypoint/shared`; the explicit `category` selector as the same `ChoiceGrid` (no schema change).

## Notable call — `Event.displayTimezone` as override, not cache

ADR-0107 §7 leaned "store on placeless events" but flagged store-vs-derive as _the_ open sub-question. Storing at author time freezes a pre-departure home event in the destination zone so it never flips to the origin zone when the outbound flight is added later — contradicting §3's explicitly-wanted reorientation. Re-deriving with no store leaves a user's manual zone correction (§6) with nowhere to live. The resolution — **derive by default, store only the user's manual override** — unifies §6 and §7: the editable chip is the sole writer, most events stay null and reorient with the itinerary, and a deliberately-pinned zone is truly sticky. Recorded in ADR-0110 Decision 3; the data-model session confirms the (unchanged-shape) field.

## Explicitly left for follow-on / implementation

- **Phase-1 implementation** carries the shared core + picker, `lib/place-usage.ts`, the zone threading, and the nav change — plus the schema/shared additions (`Place.timezone` [ADR-0108], `Place.rating`/`userRatingsTotal`, `placePredictionSchema`).
- **Phase 5 (research results)** and the **full Phase 6 rendered map** stay deferred (ADR-0109 "Scope … deferred"); this ADR only ensures the shared core + derivation extend into them without a rewrite. Reconfirm current Maps API + pricing before Phase 6.
- **`ZonePicker` overlay detail** and the exact debounce/min-char integers are implementation calls (the mechanism + keying is the decision).
- **Google Cloud setup (roadmap #0, human)** still gates all real work.

## Files touched

- New: `docs/decisions/0110-maps-and-places-frontend-architecture.md`, this note.
- Updated: `docs/decisions/README.md` (0110 row), `docs/INDEX.md` (design/nav domain routers + planning row), `docs/backlog.md` (FE-arch marked done; the Phase-3 pin line corrected to the ADR-0109 category-coloured pin, superseding the stale teal-body description; module-layout pointers added).
