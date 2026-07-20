# Session 49 — One pluggable change-applier registry

**Date:** 2026-07-20
**Branch:** `claude/sync-badge-cloud-glyphs-uc5d32`
**ADR:** [0094](../decisions/0094-one-pluggable-change-applier-registry.md)

## What prompted it

After ADR-0093 the maintainer wanted the offline sync handling **fully unified** — "one that works for everything so we don't maintain 4 in parallel" — and, on refining, that each entity type be **pluggable**: "generic enough so one entity could move from one to the other easily, nothing coupled to a specific entity type."

## What changed

The apply logic was a per-type `if/else` (memory) and `switch` (cache), duplicated across the reducer, `applyControlChangeToList` + `setState`, `applyChangeToCache`, and `applyOutboxOpToCache`. Made both appliers **table-driven registries**:

- **`state/trip-state.tsx`** — `memoryChannels: Record<entityType, (change) => void>`; `applyEntityChange` = cache mirror + channel lookup. No per-type branching.
- **`lib/cache.ts`** — `CACHE_CHANNELS: Record<entityType, { table } | { metaList } | { metaTrip }>`; `applyChangeToCache` reads the channel and applies uniformly (`applyToRow`). Added `applyChangeToMetaList` for the snapshot-embedded lists.

Adding a syncable, or moving one between stores, is now one entry per registry; the two registries mirror each other (memory vs. persistence).

## Offline cache mirror collapsed onto the registry

`applyOutboxOpToCache` no longer re-implements persistence: `outboxOpToCacheChanges(op)` maps a queued op to the `Change[]` it implies, each applied through the one `applyChangeToCache`. Resolved the two blockers the maintainer asked about:

- **Membership keying → membership id.** The offline mirror resolves `userId → membership.id` from the cached roster, matching the WS echo (op stays userId-based for the REST call). One key.
- **Per-op quirks encoded** in `outboxOpToCacheChanges` (new event → `status: planned`; new maybe-item → `consumed: false`).
- Bonus: `applyChangeToCache`'s trip channel now updates the all-trips `tripList` too, so a rename stays coherent on the WS path (previously only the offline path did).

## Entity-type strings → shared constant

`ENTITY_TYPE` (`@waypoint/shared`, with a matching `entityTypeSchema` / tightened `changeSchema.entityType`) is the single source the backend Change log, the frontend registries, and the change-builders key off — ~29 backend literals + the frontend registries converted.

## Deliberately not collapsed

- **Event + maybe-item verbs keep the undo-aware reducer** (one-slot undo, ADR-0019) — folding them into the plain applier would drop undo. They're a channel entry too.
- **Each verb still does its own optimistic in-memory `setState`/dispatch** — that's the write action itself (undo-bearing for events), distinct from the change-application the registry unifies. Routing it through `applyEntityChange` would rewrite every verb's rollback into an inverse-change; real risk for little further dedup. Left as an optional low-priority backlog item.

## Verification

- `pnpm --filter @waypoint/frontend test` — 567 pass (registry + collapse behavior-preserving; added cache tests: booking table, place metaList, trip scalar, event status default, member userId→id resolution).
- Shared 33; frontend `typecheck` + `build` + `format` clean, `lint` 0 errors. Backend `typecheck` clean (after `prisma generate`); backend integration tests need a DB (CI).

## Scope / not touched

Frontend + shared + backend (the ENTITY_TYPE constant + emit sites; no schema/contract change beyond tightening `changeSchema.entityType` to the enum it already matched). Model, outbox flush/ordering, undo, ripple unchanged. The offline booking→event coherence (ADR-0093) rides the same `applyEntityChange`, now registry-backed.
