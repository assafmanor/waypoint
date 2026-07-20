# 0094 — One pluggable change-applier registry (entity channels)

**Status:** Accepted (2026-07-20)
**Date:** 2026-07-20
**Relates:** [0093](0093-offline-booking-linked-event-coherence.md) (introduced the shared `applyEntityChange` this generalizes), [0042](0042-shared-state-is-offline-syncable.md) (the outbox + read-cache), [0019](0019-sync-protocol.md) (the Change log / one-slot undo), [0039](0039-trip-settings-admin-governed-data-plane.md) (control-plane changes), [0058](0058-documents-in-the-trip-snapshot.md) (documents ride the snapshot).

## Context

Applying an entity change had grown several **parallel handlers**, each with a per-entity-type `if/else` or `switch`:

- the event reducer (`applyRemoteEventChange`), for the timeline;
- `applyControlChangeToList` + per-store `setState` calls, for bookings / places / documents / members in memory;
- `applyChangeToCache`, a `switch` over entity types, for the Dexie read cache;
- `applyOutboxOpToCache`, a second `switch` that **re-implemented** the same cache-persistence logic for offline optimistic writes.

Adding an entity type — or moving one between stores — meant editing several of these in lockstep, and they had already drifted (e.g. memberships keyed by `id` in the WS path but by `userId` in the offline mirror). ADR-0093 took the first step (one `applyEntityChange` the WS echo and the offline booking→event mirror share), but its body was still a per-type `if/else`.

## Decision

**Each entity type declares how its changes apply, once, in a registry; the appliers are table lookups with no per-type branching.**

- **Memory channels (`state/trip-state.tsx`).** `memoryChannels: Record<entityType, (change) => void>` — `event` → the reducer dispatch (which keeps the one-slot undo, ADR-0019), `trip` → the trip scalar, `membership` → the roster, `booking`/`place`/`document` → their reactive lists (all via the generic `applyControlChangeToList`). `applyEntityChange` = mirror to cache + `memoryChannels[type]?.(change)`.
- **Cache channels (`lib/cache.ts`).** `CACHE_CHANNELS: Record<entityType, { table } | { metaList } | { metaTrip }>` — an own Dexie table (events/bookings/documents), a `snapshotMeta` list (places/members/maybeItems), or the meta trip scalar. `applyChangeToCache` reads the channel and applies uniformly (`applyToRow` upsert/delete).

Adding a syncable is now **one entry in each registry**; moving one between stores is a one-line change; nothing else branches on the type. The registries are the mirror of each other — memory vs. persistence — so they read as one model.

**The offline cache mirror is collapsed onto the registry.** `applyOutboxOpToCache` no longer re-implements persistence: `outboxOpToCacheChanges(op)` maps a queued op to the `Change[]` it implies, and each runs through the one `applyChangeToCache`. So the offline mirror and the WS echo write the cache through the **same** applier. Two drifts this closed:

- **Membership keying unified on membership `id`.** The offline mirror resolves `userId → membership.id` from the cached roster, so it keys members the way the WS echo already does (the op stays `userId`-based for the REST call).
- **Trip edits now update the all-trips list on the WS path too**, not only offline — `applyChangeToCache`'s trip channel keeps both `snapshotMeta.trip` and the `tripList` row coherent.

Per-op cache quirks (a new event defaults `status: planned`; a new maybe-item `consumed: false`) live in `outboxOpToCacheChanges`.

**Entity-type strings are a shared constant.** `ENTITY_TYPE` (`@waypoint/shared`) is the single source the backend Change log, the frontend registries, and the change-builders all key off — no layer hardcodes `'booking'`/`'event'`/… `changeSchema.entityType` is the matching `z.enum`.

**Not collapsed (deliberately):** the **event + maybe-item verbs keep their undo-aware reducer path** — the one-slot undo (ADR-0019) snapshots state in the reducer actions, which the plain change-applier doesn't, so folding them in would lose undo. Likewise each verb still does its own optimistic in-memory write (`setState`/dispatch) — that's the write action itself (and, for events, undo-bearing), distinct from the change-application the registry unifies. The verb memory path is a candidate for a later pass, but it carries real rollback/undo risk for little further dedup.

## Consequences

- One applier per layer: the WS echo, reconnect catch-up, and the offline optimistic write all persist through `applyChangeToCache` and apply to memory through `applyEntityChange`, both table-driven.
- A future syncable (or moving an existing one) is a registry entry + (if it queues offline) an `outboxOpToCacheChanges` case, not a sweep across four hand-written handlers.
- The membership-keying drift is gone, and a trip rename now stays coherent in the all-trips list whether it arrived online or offline.

## Alternatives considered

- **Keep the per-type `if/else`/`switch` appliers (status quo).** Rejected: they drift (the member-keying bug) and every entity change touches several of them.
- **One unified registry object for memory + cache.** Rejected: memory channels close over React setters (component scope); cache channels are module-scope Dexie. Two mirror registries is the honest split; forcing one object would leak React into the persistence layer.
- **Also route every verb's optimistic in-memory write through `applyEntityChange`.** Deferred: it rewrites each verb's rollback into an inverse-change and entangles the event one-slot undo — real regression risk on the most-used surface, for little dedup beyond what the cache collapse already bought.
