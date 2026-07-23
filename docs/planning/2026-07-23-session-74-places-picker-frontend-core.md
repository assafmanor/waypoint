# Session 74 — Places picker frontend: the shared core + EventForm (implementation)

**Date:** 2026-07-23
**Kind:** Implementation (frontend slice of the Maps & Places picker keystone; consumes the merged backend proxy, session 73 / PR #231)
**ADRs:** implements [0110](../decisions/0110-maps-and-places-frontend-architecture.md) Decision 1 (the shared search core + `PlacePicker`); honours [0108](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md) §1/§5 (pause-gated debounce, soft 429) and [0111](../decisions/0111-places-field-mask-tier-and-rating-deferral.md) (no ★ rendered — ratings unpopulated).

## What shipped

The reusable search core (ADR-0110 §1) plus its first host. Scoped deliberately to keep the PR reviewable; the remaining hosts + the category selector are tracked follow-ups.

- **`lib/api.ts`** — `searchPlaces(tripId, { input, sessionToken, signal })` and `resolvePlace(tripId, { googlePlaceId, sessionToken?, enrichPlaceId? })` beside the existing `createPlace`/`updatePlace`; `isRateLimitedError` predicate off `ERROR_CODE.RATE_LIMITED`. Both online-only (never outboxed).
- **`state/trip-state.tsx`** — a `resolvePlace` `indexVerbs` verb: calls the proxy, then adopts the canonical row into `places` (replace-if-present for a dedup hit / enriched Place-lite, else append). No optimistic row and no outbox — the FE can't produce coords/zone, and it needs Google; errors propagate to the picker.
- **`lib/usePlaceSearch.ts`** (net-new hook) — owns the whole lifecycle so both shells reuse it: the FE-minted session token (lazy on first keystroke, threaded through every search + the terminating `resolvePlace`, retired on pick/reset), the **mandatory pause-gated debounce** (`PLACE_SEARCH_DEBOUNCE_MS` 350 / `PLACE_SEARCH_MIN_CHARS` 2 in `constants.ts`, with per-keystroke abort — a cost control, ADR-0108 §1), snapshot-derived `alreadyInTrip` (a match links to the existing row with **zero** Google spend), soft `rateLimited`/`failed` states, and the `saveNameOnly` offline fallback via the existing `CREATE_PLACE` outbox verb.
- **`ui/primitives/PlacePicker.tsx`** (net-new) — a trigger + a search sheet, every overlay through `Modal`/`useOverlay` (no hand-rolled portal). Prediction list (primary + secondary), the "כבר בטיול" dedup chip, the name-only fallback, and Google's required "מופעל על ידי Google" attribution footer. `enrichPlaceId` is passed automatically when the current field holds a coordless Place-lite.
- **`EventForm`** — re-adds place authoring (the free-text input ADR-0051 removed) via the `PlacePicker`, in a `Field` shown for standalone events only (a booking-linked event's place lives on the booking, ADR-0051). A picked place threads through the shelf-`schedule` path too (`ScheduleFields.placeId` → `buildScheduleEvent`).
- **Tests:** `usePlaceSearch.test.ts` (min-chars gating, one debounced search, dedup-link-without-spend, resolve-with-token+enrichId, soft 429) and `PlacePicker.test.tsx` (placeholder↔name, open→debounce→resolve, name-only fallback).

## Not in this slice (tracked in backlog)

- **Remaining hosts:** BookingSheet location + transport origin/destination (two-place), the maybe-item add flow.
- **Explicit category selector** (ADR-0109 §11 / ADR-0038 §4 amendment) — icon glyph-only, `categoryForIcon` retired as a category source, category via `ChoiceGrid`. A separable presentation change (already its own backlog item), not bundled here.
- Decisions 2–4 of ADR-0110 (place-usage derivation, per-event zone threading, context-aware `setActiveDate`) — Phase 3 / the timezone workstream.

## Verification

`pnpm format` + `pnpm typecheck` + `pnpm build` green; frontend suite 646/646 (8 new). Lint clean (only pre-existing warnings in unrelated files).
