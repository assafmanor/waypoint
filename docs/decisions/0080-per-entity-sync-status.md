# 0080 — Per-entity sync status (SyncBadge + review/retry dead-letter)

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates:** [0082](0082-adopt-non-color-design-tokens.md) (the `--sync-synced`/`--sync-pending`/`--sync-failed` status tokens this uses), [0078](0078-feedback-state-family.md) (the feedback family `SyncBadge` joins), [0019](0019-sync-protocol.md) (the change log / optimistic-write path this reads state from), [0042](0042-shared-state-is-offline-syncable.md) (the outbox this derives from). Builds on the frontend-architecture review's **F-03** (the failed-sync store). Implements finding **U-04** of the UI/UX review (`../reviews/ui-ux-review.md`).

## Context

Save/sync confidence today is **transient and global**. An edit shows an optimistic result plus a short toast; global state is a header pending count and, on a hard-fail, a dismissable "N שינויים לא נשמרו" badge that clears on tap or on the next `initOutboxCount`. Two gaps follow (U-04, cross-ref F-03):

- **No per-item marker.** Nothing on a booking / event / document row says _this_ item is queued, failed, or rejected. Once the toast fades and the count clears, the UI reads as fully saved, so "did my restaurant booking actually save?" is unanswerable per item.
- **No dead-letter.** F-03 records a rejected write in a session store, but the only surface is a timed/dismissable global badge. A permanently-rejected write (a validation 400, a lost permission) is dropped from the outbox on flush and, once the badge is dismissed, **silently vanishes** at the next resync with no way to see which change was lost or to retry it.

This violates principle 3: a save isn't done until it's durable and the user can tell. The outbox (ADR-0042) and the F-03 failed store already hold everything needed to answer per item; they just weren't exposed id-keyed.

## Decision

One **`SyncStatus` model per entity**, `synced | pending | failed(reason)`, derived entirely on the frontend from the existing outbox + failed store (no backend contract change).

- **Id-keyed outbox lookup (`lib/outbox.ts`).** A new `outboxOpEntityId(op)` maps any queued op to the entity id it targets (create-family ops carry the client-generated `input.id`; the rest name their target directly; trip-level ops map to `''`). A per-entity **pending index** (`Map<entityId, count>`) is maintained in memory alongside `pendingCount` — so status has a synchronous snapshot for `useSyncExternalStore` without an async IndexedDB read per render. The F-03 `SyncFailure` record gains `entityId` (for the id-keyed `failed` lookup), `id` (a stable key for per-item retry/dismiss), and `op` (the original write, so retry can re-enqueue it). `getSyncStatus(entityId)` derives the model; **`failed` outranks `pending`** on the same entity.
- **`useSyncStatus(entityId)` hook.** Reactive to both the outbox and the failed store via `useSyncExternalStore`; the snapshot is a primitive key (so React compares by value) re-inflated to `{ state, reason? }`. Reads local state only, so it works offline — this is literally the offline-trust surface.
- **`ui/feedback/SyncBadge.tsx`.** A small per-row affordance rendering the three states on the sync tokens. **Legible without color:** each state has a distinct glyph shape (`✓` synced · `↑` pending · `!` failed) plus an accessible name (`role="img"` + `aria-label`/`title`); color only reinforces. It is **not itself a live region** (a list has many badges) — the single polite announcement of a failure lives in the header summary. **`synced` renders a subtle check, not nothing** — the check is the affirmative answer to "did it save?", deliberately quiet but present; pending/failed are louder.
- **Persistent failed-summary → review/retry sheet (`ui/SyncReviewSheet.tsx`).** The timed/dismissable header failed-badge is **replaced** by a persistent summary affordance (kept in the header's existing polite live region, so a new failure is announced) that opens a review sheet built on `Sheet`/`Modal` (ADR-0079). The sheet lists each failed write with its reason and a per-item **retry** (re-enqueue via the outbox, then flush when online) and **discard**, plus a discard-all. It **never clears on a timer** — this is the dead-letter surface, so a rejected write stays recoverable until the user acts. The pending count badge is unchanged.
- **DocumentsSection is the reference wiring.** The least-contended row list adopts `<SyncBadge state={useSyncStatus(doc.id)}>` first, proving the pattern end to end. Booking and event rows migrate in Wave 3.

**Tokens.** Sync states use `--sync-synced`/`--sync-pending`/`--sync-failed` (which track `--ok`/`--muted`/`--miss`, ADR-0082), never the amber/teal/plan budget; the retry button uses the neutral `--cta`. New Hebrew copy lives under a `t.sync.*` namespace; no em dashes.

## Consequences

- **Per-item legibility.** Every editable entity can show its own save state; "did this save?" is answerable per row, not only via a global badge.
- **A rejected write is recoverable, not silently lost.** The dead-letter sheet keeps each failure with its reason and a retry; nothing disappears on a timer. This closes the F-03 data-loss risk at the UX layer.
- **Toasts return to their lane.** With durable per-item + dead-letter state, the toast is for lightweight confirms, not the only failure channel.
- **Status tokens formalized in use.** `SyncBadge` is the first real consumer of the ADR-0082 `--sync-*` mappings, alongside `StatusBanner`.
- **Derived, so it stays in sync for free.** Because status is derived from the outbox + failed store, any write that already routes through the outbox lights up pending/failed with no per-call wiring; new row lists only add the badge.
- **Reference-only wiring now.** Only documents show the badge this wave; bookings/events still rely on the global surfaces until Wave 3. The header summary already covers their failures.

## Alternatives considered

- **Keep a global failed-list only (the review's open Q7).** Rejected: a global list answers "something failed" but not "which item, and is it still queued?" per row — the core U-04 gap. The per-entity model is a thin derivation on top of the same store, so the global summary and the per-row badge share one source.
- **A per-entity server field (`syncState` on the entity).** Rejected: the state is inherently client-local (it describes _this device's_ outbox), fully derivable from data the client already holds, and would need a backend contract change for no gain — contrary to the frontend-only constraint.
- **Make `SyncBadge` its own live region per row.** Rejected: dozens of polite live regions in a list is announcement spam. One header live region announces failures; the per-row badge carries an accessible name for on-demand reading.
- **Auto-clear the failed summary on a timer (status quo).** Rejected: that is exactly the silent-loss mechanism U-04 flags. The dead-letter sheet clears only on explicit retry/discard.
