# Session 47 — Unsynced treatment + change-group counting

**Date:** 2026-07-20
**Branch:** `claude/sync-badge-cloud-glyphs-uc5d32`
**ADR:** [0092](../decisions/0092-unsynced-treatment-and-change-groups.md) (extends [0080](0080-per-entity-sync-status.md)/[0091](0091-sync-badge-cloud-and-silent-when-synced.md))

## What prompted it

Three issues reported against the shipped ADR-0091 cloud marker (#198), looking at the Index and Day view in use:

1. The per-entity marker was the _only_ signal a write hadn't landed — an unsynced item looked identical to a synced one. The maintainer wanted the item itself to read as provisional (transparency).
2. Saving one booking with a route (a flight) showed **"3 changes waiting to sync"** — the two route `Place` writes + the booking. A first pass excluded place ops from the count by verb; the maintainer flagged that as **fundamentally wrong** ("places will be visible to the user soon") and asked for a robust approach that **groups changes that happen together**.
3. A queued document upload showed an active "מעלה…" spinner and no sync marker even while offline, where nothing is uploading.

## What changed

- **`ui/EntitySyncBadge.tsx`** — new `useUnsynced(id)` hook beside the badge (both derive from `useSyncStatus`): `true` while `pending`, so the container can dim. `failed` is deliberately excluded (stays prominent).
- **`ui/domain/ListRow.tsx` + `list-row.css`, `ui/domain/EventCard.tsx` + `event-card.css`** — a presentational `unsynced?` flag → `.is-unsynced` / `.unsynced` opacity (~0.6). Connected screens (`Index`, `DayView`, `DocumentsSection`) pass `useUnsynced(id)`.
- **`lib/outbox.ts`** — change groups. `withChangeGroup(fn)` sets an active `groupId` that every `enqueueOutbox` inside joins; the entry persists its `groupId`; the header count is now **pending groups** (`getPendingChangeCount`/`usePendingChangeCount` = distinct pending group ids), not raw ops. `pendingCount` (true op total) is untouched and still drives the flush. Legacy entries without a `groupId` fall back to per-op. Replaced the earlier verb-classification (`isUserVisibleOp`/`visiblePendingCount`) entirely.
- **`ui/BookingSheet.tsx`** — `save` wraps its place + booking writes in `withChangeGroup`, so a flight is one change.
- **`App.tsx`** — the header summary reads `usePendingChangeCount()`; the flush loop keeps `useOutboxCount()` (true total).
- **`ui/DocumentsSection.tsx` + `i18n/he.ts`** — the queued-upload row carries the connected `cloud-up` marker and dims; offline it shows a static **"ממתין להעלאה"** (`t.docs.upload.queued`) instead of the active spinner, which stays only while genuinely in flight (online).
- **Docs** — ADR-0092, design-language SyncBadge note extended (provisional dim), README index (added the missing 0091 row + 0092).

## Why change groups, not verb-classification

Classifying ops as user-visible vs. internal (exclude places) bakes in "places aren't shown", which is about to stop being true — the count would regress silently the day places surface. Grouping by **action** needs no such assumption: a place authored for a booking belongs to that booking's group regardless of whether places later get their own rows. It's also the reusable seam for any future multi-write action (batch edits, imports).

## Verification

- `pnpm --filter @waypoint/frontend test` — 556 pass (new: outbox change-group count/drain, ListRow/EventCard `unsynced` class, `useUnsynced` policy).
- `typecheck` + `build` clean; `lint` 0 errors (only pre-existing `_seed`/`_old*` warnings).

## Scope / not touched

Frontend + docs. No new sync states (offline-first, ADR-0058); the `SyncStatus` model, outbox flush + ordering, and backend are unchanged; the day-view **done ✓** is untouched.

## Follow-ups

- `withChangeGroup` assumes user actions are sequential (one modal save at a time) — true today; revisit if concurrent multi-write actions ever overlap.
- Tune the 0.6 dim if it reads too heavy/light on-device (aesthetic, not model).
