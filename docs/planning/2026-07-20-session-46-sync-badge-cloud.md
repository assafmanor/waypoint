# Session 46 — SyncBadge cloud iconography + silent-when-synced

**Date:** 2026-07-20
**Branch:** `feat/sync-badge-cloud`
**ADR:** [0091](../decisions/0091-sync-badge-cloud-and-silent-when-synced.md) (amends [0080](../decisions/0080-per-entity-sync-status.md))

## What prompted it

An iteration on the per-entity sync marker from screenshots of the Index and Day view. Three things surfaced while looking at it in place:

1. The synced `✓` reads like the day-view **done** mark (`.wp-event-check`, a green circle ✓) — two green checks, different meanings, adjacent surfaces.
2. Bookings and documents share `ListRow` but ordered their trailing slot differently, so the marker sat in a different column per row type (the original "align the doc badge with the booking badge" ask).
3. The timeline hid the synced state while lists showed a persistent ✓ on every row — ambient noise that carries no information in the steady state.

Preference landed on a **cloud** glyph family and on making the badge consistent across every syncable.

## What changed

- **`ui/Icon.tsx`** — `cloud-check` / `cloud-up` / `cloud-bang`: a shared cloud base + a distinct inner mark per state (check / up-arrow / `!`), so shape carries the state.
- **`ui/feedback/SyncBadge.tsx` + `feedback.css`** — renders the cloud `Icon` (chip-less); color from `--sync-*` only. Invariants from ADR-0080 preserved (shape-legible, accessible name, no amber). Now a pure presentational mapping.
- **`ui/EntitySyncBadge.tsx`** (new) — the connected marker (`useSyncStatus` → `SyncBadge`). Owns the one cross-surface policy: **silent when synced everywhere**, exception-only; `showSynced` escape hatch.
- **`ui/domain/ListRow.tsx` + `list-row.css`** — a fixed `sync` slot before the kebab with reserved width, so the marker lands in the same column on every row (alignment fix).
- **`screens/Index.tsx` + `ui/DocumentsSection.tsx`** — badge moved into the aligned `sync` slot; `right` keeps only the code / size + lock.
- **`ui/domain/EventCard.tsx` + `event-card.css` + `screens/DayView.tsx`** — `sync` is now a `ReactNode` slot rendered on the **meta line** (`align-items: flex-start`), so a long title can never be reflowed; DayView passes `<EntitySyncBadge>`.
- **Tests** — `SyncBadge` asserts SVG shape + aria (not text glyph); `EventCard` tests the slot on the meta line; new `EntitySyncBadge` test for the silent policy. `Index.test.tsx` unchanged (its `useSyncStatus` mock flows through `EntitySyncBadge`).

## Verification

- Static: no dangling `SyncBadge`/`useSyncStatus` imports or usages; `EntitySyncBadge` wired at all three call sites; Icon names + sync column present.
- **Not yet run in-sandbox** (no `node_modules`): run `pnpm --filter @waypoint/frontend test` + `typecheck` + `build` before merge.

## Scope / not touched

Frontend + docs only. No new sync states (everything reads offline, ADR-0058); no backend/outbox change (per-entity status already generic, ADR-0080); the day-view **done ✓** control is untouched.

## Follow-ups

- Tune cloud size / inner-mark weight if 19px reads dense on-device (aesthetic, not model).
- `showSynced` escape hatch exists if any surface later wants the persistent ✓.
