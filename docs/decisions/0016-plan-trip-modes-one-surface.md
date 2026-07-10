# 0016 — Plan/Trip modes are one surface, re-emphasized; auto-by-date switch with manual override

**Status:** Accepted
**Date:** 2026-07-09

## Context

The product has two equally-important modes: **Plan** (before/between days — build the itinerary, enter bookings, research) and **Trip** (on the ground — now/next, follow, adjust). Only Trip mode had been designed. We had to decide whether these are separate UIs and how the app moves between them.

## Decision

- **One surface, two emphases.** Both modes use the **same four tabs**; each tab shifts what it foregrounds (Home: prep dashboard ↔ departure board; Day-by-day: builder ↔ follow/adjust; Index: entry ↔ reference; Map: research ↔ orientation). No separate plan app. Consistent with "the trip is the only surface" (ADR-0004).
- **Switch = automatic by date + manual override.** Mode is **derived** from the trip dates vs. now (Trip mode from `startDate`, Plan mode otherwise). A **manual toggle** lets any user peek at / work in the other mode; the override is per-user, per-device UI state and doesn't change the trip for others.
- **Editing is never hard-disabled** in Trip mode — only de-emphasized and guarded (hard-event warnings, undo).
- **Location-based switching deferred** (flip on arrival via geolocation) — future, not v1.

## Consequences

- One coherent UI to design and build; tabs get a mode-aware presentation layer rather than duplicated screens.
- Mode is not persisted on the `Trip` entity (stays derived); only the personal override is client state.
- Plan mode gets real v1 scope: trip setup + invites, itinerary building, manual booking entry, research/maybe-shelf.

## Alternatives considered

- **Distinct plan vs. trip UIs:** rejected — two surfaces to build/maintain; contradicts the single-surface principle.
- **Auto-by-date only (no override):** rejected — can't preview the other mode or comfortably edit mid-trip.
- **Date + location switching now:** deferred — more moving parts than v1 needs.
