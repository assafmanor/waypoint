# Planning Session 02 — Plan Mode & Trip Mode

**Date:** 2026-07-09
**Mode:** Product management — defining the two modes and the switch
**Participants:** Assaf + AI assistant

## Purpose

All prior design was Trip mode. Plan mode was undefined. Settle the model before writing tasks.

## Decisions (→ ADR-0016, product/modes.md)

- **One surface, two emphases.** Plan and Trip mode share the same four tabs; each tab shifts emphasis (Home: prep dashboard ↔ departure board; Day-by-day: builder ↔ follow/adjust; Index: entry ↔ reference; Map: research ↔ orientation). No separate plan app.
- **Switch = automatic by date + manual override.** Mode derived from trip dates vs now; a per-user, per-device toggle to peek/work in the other mode. Editing never hard-disabled in Trip mode, only guarded.
- **Plan-mode v1 scope:** trip setup + invites; itinerary building; manual booking entry; research + maybe-shelf.
- **Deferred:** location-based switching (flip on arrival).

## Forward-looking (recorded, not v1) 🔭

Keep the design open to **web/AI enrichment** — auto-pulling hours/photos/details or filling booking fields. Treated as a future _pipe_ (ADR-0004): enrich existing entities, never a new screen. Requirements to stay compatible: preserve `source`/provenance and keep `placeId`/free-text separable. Captured in modes.md + integrations/overview.md + feature-catalog (vNext).

## Tasks created

- **T-018** — Design Plan mode to mockup finish level (design track).
- **T-019** — Mode model & switch (derive from dates + manual override).

## Next

Design track: T-018 (Plan mode) + T-002 (Map/Index) to finish level. Build track continues from T-006 → T-007.
