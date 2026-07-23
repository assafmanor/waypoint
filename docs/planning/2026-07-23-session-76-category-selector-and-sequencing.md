# Session 76 — explicit category selector + Maps-epic leftover re-sequencing

**Date:** 2026-07-23
**Kind:** Implementation (the ADR-0109 §11 category selector) + backlog housekeeping
**ADRs:** implements [0109](../decisions/0109-map-tab-design.md) §11 / the [0038](../decisions/0038-icons-and-canonical-category.md) 2026-07-23 amendment (already recorded there — no new ADR).

## Context

A "what's still pending?" review surfaced real leftovers from the picker work, not just forward phases. Two outcomes: a backlog re-sequencing, and building the clearest standalone leftover (the category selector).

## 1. Backlog re-sequencing — transport-as-places moves to the timezone track

Transport origin/destination (flights/trains) was parked at **Phase 6**. Corrected: it's a **prerequisite for the multi-zone model (ADR-0107)** — a TLV→NRT flight only renders departure in Tel-Aviv time + arrival in Tokyo time if `fromPlace`/`toPlace` are enriched places with timezones, and ADR-0107 derives the **origin/home zone** from the outbound flight's `fromPlace`. Today those endpoints are free-text name-only Place-lites (no coords/zone). So it's re-filed into the **timezone track** (ADR-0113 → transport-as-places → the ADR-0107 display layer), reshaping the ADR-0059 §3 route row then. Phase-6 route pins/ETAs still benefit but aren't the driver.

## 2. Explicit event/idea category selector (shipped)

Category used to be inferred from the picked icon; now that category drives the map pin colour (ADR-0109 §3) it must be a deliberate field.

- **`EventForm`** and the maybe-shelf **`AddIdea`** flow get an explicit category selector — the **same `ChoiceGrid`** the booking-type picker uses (`layout="pills"`, horizontally-scrollable, no colour swatch), over a shared `EVENT_CATEGORY_OPTIONS` list (`lib/category-options.ts` — one options array, reused by both hosts, glyph = `iconForCategory`, label = `t.iconPicker.categories`).
- **`IconPicker` is now glyph-only** — its `onChange` dropped the `category` argument, the icon-derived category readout is gone, and `categoryForIcon`-as-a-category-source is retired (the shared function stays, only unused as a source). All five call sites updated (three were already single-arg).
- **Category defaults the badge glyph** via `iconForCategory` on pick, unless the user chose a glyph (`iconTouched`) — editing an event that already has a glyph counts as chosen, so a later category change won't clobber it.
- A **booking-linked event hides the selector** (category is owned by the booking type, edited in `BookingSheet`, which already shows the "✨ derived" readout).
- **`ChoiceGrid.value` is now optional** — a single-select that can start unset (a fresh event has no category); no option is highlighted until one matches. Backward-compatible (existing callers pass a value).
- No schema change (`Event.category`/`MaybeItem.category` already exist).

## Leftover ledger (for the record)

- **Done now:** category selector.
- **Timezone track (sequenced):** ADR-0113 (trip destination + `ZonePicker`) → transport-as-places → ADR-0107 multi-zone display layer.
- **Phased:** maybe-item place authoring → Phase 5; ratings (★) → Phase 2/3 (ADR-0111); cross-trip cache → deferred scale opt.
- **Recommended next build:** Phase 2 (places on existing surfaces + Maps deep-links).

## Verification

`pnpm format` + `pnpm typecheck` + `pnpm build` green; frontend suite 650/650 (+1 EventForm category case). Backend unaffected.
