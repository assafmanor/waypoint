# 0091 — SyncBadge cloud iconography, silent-when-synced, and full adoption

**Status:** Accepted (2026-07-20)
**Date:** 2026-07-20
**Relates:** [0080](0080-per-entity-sync-status.md) (the per-entity `SyncStatus` model + `SyncBadge` this restyles), [0082](0082-adopt-non-color-design-tokens.md) (the `--sync-*` status tokens it uses), [0078](0078-feedback-state-family.md) (the feedback family), [0043](0043-day-view-now-line-phases-and-archive-chrome.md) (the day-view `done ✓` this deliberately stays distinct from). Amends the glyph choice in ADR-0080; the model (`synced | pending | failed`) and derivation are unchanged.

## Context

ADR-0080 shipped `SyncBadge` with typographic glyphs (`✓ / ↑ / !`) in a tinted round chip, and adopted it on documents, bookings, and (silent-when-synced) day-view events. Three issues surfaced in use:

1. **Glyph collision.** The synced `✓` reads like the day-view "done / היינו" mark (`.wp-event-check`, a green circle ✓). Two green checks with different meanings on adjacent surfaces.
2. **Inconsistent alignment.** Bookings and documents share `ListRow`, but each hand-ordered its trailing `right` slot differently (`[code][badge]` vs `[badge][size][lock]`), so the marker sat in a different column per row type.
3. **Inconsistent visibility.** The timeline hid the synced state (to stay uncluttered) while lists showed a persistent ✓ on every row — ambient noise that carries no information in the steady state.

## Decision

1. **Cloud iconography.** `SyncBadge` renders a cloud SVG via the shared `Icon` primitive: `cloud-check` (synced) · `cloud-up` (pending/uploading) · `cloud-bang` (failed). Chip-less outline glyphs. This keeps ADR-0080's invariants: **shape carries the state** (accessibility, legible without color), color comes **only** from `--sync-*` (never the amber/teal/plan budget), and the `aria-label`/`title` are unchanged. Because it's a cloud, it no longer collides with the `done ✓` circle, which is untouched.

2. **Silent when synced — everywhere.** The badge is an **exception indicator**: it appears only for `pending`/`failed`, on lists and the timeline alike. The steady state shows nothing; the `pending → (gone)` transition is itself the "it saved" signal, and a permanent failure still surfaces here and in the header summary. This policy lives in one place — a new connected **`EntitySyncBadge({ id, showSynced? })`** (`ui/EntitySyncBadge.tsx`) that reads `useSyncStatus` and renders `SyncBadge`, returning `null` when synced. `showSynced` is the escape hatch. `SyncBadge` itself stays a pure presentational mapping. Trade-off: lists lose the persistent positive ✓; accepted per the reasoning above.

3. **One aligned sync column.** `ListRow` gains a fixed `sync?` slot rendered immediately before the kebab, with a reserved width (`.wp-listrow-sync`) so the marker lands in the same column on every row even when silent. Screens pass `<EntitySyncBadge id=… />` into `sync` and keep only row-specific chips (code · size + lock) in `right`.

4. **Placement by surface.** List rows use the aligned trailing sync column. The dense day-view card places the marker on the **meta line** (`wp-event-m`, `align-items: flex-start`) so a long title can never be reflowed by it; `EventCard.sync` becomes a `ReactNode` slot and the screen passes the connected badge. Same glyph/state system on both; only the mount point adapts.

## Consequences

- Documents, bookings, and events share one connected marker; future syncables drop in `<EntitySyncBadge id=… />`. No new sync states (everything reads offline, ADR-0058), no backend change (per-entity status already generic, ADR-0080).
- `design/design-language.md`'s SyncBadge note should be updated to the cloud family (follow-up).
- Cloud + inner mark is denser than a flat glyph at ~19px; if legibility needs it, bump size or simplify the inner mark — tuning, not a model change.
