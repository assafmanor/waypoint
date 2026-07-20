# 0092 — Unsynced treatment: dim pending items, honest queued uploads, change-group counting

**Status:** Accepted (2026-07-20)
**Date:** 2026-07-20
**Relates:** [0080](0080-per-entity-sync-status.md) (the per-entity `SyncStatus` model this reads), [0091](0091-sync-badge-cloud-and-silent-when-synced.md) (the cloud `SyncBadge` + `EntitySyncBadge` this extends), [0056](0056-faster-document-uploads.md) (the queued-upload row this makes honest offline), [0042](0042-shared-state-is-offline-syncable.md) (the outbox the change count derives from). Builds on ADR-0091 in use; the `SyncStatus` model (`synced | pending | failed`) and the outbox/flush machinery are unchanged.

## Context

Three gaps surfaced once the ADR-0091 cloud marker was on real Index / Day-view screens:

1. **No provisional treatment.** A pending row/card showed a `cloud-up` marker but otherwise looked identical to a synced one — the marker was the _only_ signal a write hadn't landed. A `.pending` class existed on the document row but had no CSS behind it.
2. **The header over-counted.** Saving one booking with a route (a flight) enqueues two `Place` writes (origin + destination) plus the booking — three outbox ops — so the header read **"3 changes waiting to sync"** for one user action. A first pass classified ops as user-visible vs. internal (places excluded), but that's brittle: **places are becoming first-class**, and the count would silently regress the moment they surface on their own.
3. **A queued upload lied offline.** The optimistic document row showed an active "מעלה…" (uploading) spinner and **no** sync marker even while offline — where nothing is uploading; the file is queued until reconnect.

## Decision

1. **Pending items read as provisional — a dim (~0.6 opacity).** A row/card with a write **in transit** fades, so "not saved yet" is _felt_, not only badged. Driven by one connected hook, `useUnsynced(id)` (in `ui/EntitySyncBadge.tsx`, beside the badge — both derive from `useSyncStatus`, one source). `ListRow` and `EventCard` gain a presentational `unsynced?` flag (a `.is-unsynced` / `.unsynced` opacity class); the connected screens pass `useUnsynced(id)`. **Pending only** — a `failed` item stays full-opacity so its `cloud-bang` (and the header review sheet) keep calling for action rather than receding.

2. **The header counts change _groups_, not raw ops.** Ops enqueued within one user action share a `groupId`; the "N changes waiting to sync" summary counts pending **groups** (`getPendingChangeCount`), so a booking + the places backing its route is **one** change. The action boundary marks the group: `withChangeGroup(fn)` (in `lib/outbox.ts`) sets an active id that every `enqueueOutbox` inside `fn` joins; `BookingSheet.save` wraps its place + booking writes in it. Ops enqueued outside any group get their own id, so a standalone edit is one change. This is **robust to which entities are user-visible** — a place authored for a booking belongs to that booking's group regardless of whether places later get their own rows. `pendingCount` (the true op total) is untouched and still drives the FIFO flush + ordering; grouping is a display layer on top. The `groupId` rides the persisted outbox entry, so the count is correct after a reopen-while-offline; legacy entries without one fall back to counting per-op.

3. **A queued upload is honest offline.** The optimistic document row now carries the connected `cloud-up` marker like every other pending item, and dims. Its trailing progress affordance is truthful: the "מעלה…" spinner only while the flush is genuinely in flight (online); a static **"ממתין להעלאה"** (waiting to upload) while offline, since nothing is uploading until the network returns.

**Invariants kept (ADR-0080/0082/0091).** Sync color still comes only from `--sync-*`; the badge is still legible without color (distinct cloud shapes) and silent when synced; it's still not a live region. The dim is opacity only — no new color. The day-view **done ✓** is untouched.

## Consequences

- Every syncable (booking, document, event) shares one provisional treatment: dim + `cloud-up` while pending, crisp + `cloud-bang` while failed, silent + full-opacity when synced.
- The header count tracks user intent, not plumbing, and won't regress when places (or any future dependent entity) become visible — the grouping is by _action_, not by _type_.
- `withChangeGroup` is the reusable seam for any future multi-write action (batch edits, an itinerary import) to count as one change.

## Alternatives considered

- **Classify ops as user-visible vs. internal (exclude places).** Rejected: brittle. It bakes in "places aren't shown", which is about to stop being true, and would under-count silently the day they surface. Grouping by action needs no such assumption.
- **Dim failed items too.** Rejected: a failed write must stay prominent; fading it works against the dead-letter surface (ADR-0080).
- **Group by enqueue burst (same tick/microtask).** Rejected: fragile across the `await`s inside a save; an explicit action scope is intentional and legible.
- **Keep the "מעלה…" spinner offline.** Rejected: it asserts active work that isn't happening; the static "waiting" + the shared pending marker tell the truth.
