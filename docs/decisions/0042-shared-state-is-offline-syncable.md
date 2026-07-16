# 0042 — Everything shared between people is offline-syncable

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** ADR-0019 (the `Change`/outbox mechanism), ADR-0022 (control plane vs. data plane — this makes "syncable" the test for which side an entity belongs on), ADR-0039 (which already moved trip settings onto the data plane for exactly this reason).
**Relates to:** [sync-and-offline.md](../architecture/sync-and-offline.md).

## Context

The offline story was built mechanism-first (ADR-0019: `Change`, optimistic dispatch, the outbox) and surface-by-surface (T-058 read cache, T-013 write outbox, ADR-0039 settings). That left gaps that only showed up in use: a cold reopen offline bounced to `/login`, the trip list wasn't cached, offline edits weren't written to the read cache, and the outbox only flushed while the trip that owns it was mounted. Each was fixed as found, but there was no single rule saying _which_ state must work offline — so the next surface could regress the same way.

We need a principle, not just a pile of fixes. The owner stated it directly: **anything shared between people should be syncable.**

## Decision

**The shared, collaborative surface must be fully offline-capable; per-device/personal state need not be.** "Shared between people" is the test that decides both plane membership (ADR-0022) and offline obligations:

1. **Shared state ⇒ data plane ⇒ offline-syncable.** Any entity two or more members collaborate on — the timeline (events, bookings, notes), the maybe-shelf, trip details and roster (ADR-0039) — routes through `ChangeService` (atomic write + `Change` + WS broadcast, ADR-0019) **and** owes the full offline contract:
   - **Readable offline** — mirrored into the Dexie cache on every fetch/broadcast, including the list surfaces needed to navigate to it (the trip list, cached identity) so the app never dead-ends offline.
   - **Writable offline** — every mutation goes through the outbox (`restOrQueue`), is **written through to the read cache at enqueue time** so a reopen shows it, and is reconciled/rolled-back on the server's echo.
   - **Flushed on reconnect, device-wide** — queued writes flush as soon as connectivity returns, across **all** trips, not only whichever trip is currently mounted.
2. **Per-device / personal state is exempt.** The active-trip pick (ADR-0021), the mode override, and the access token (in-memory only, ADR-0020) are not shared, so they carry no sync obligation. Cached _identity_ is a read convenience (renders signed-in offline), never a credential.
3. **Operations that inherently require the server are the only allowed offline dead-ends, and they must say so.** Joining a trip (needs the server to validate the invite and create the membership), creating a trip, and generating an invite link cannot be queued — there is no local identity for the not-yet-joined entity to reconcile against. These disable their controls offline with a clear note, rather than failing silently or pretending to work.

## Consequences

- **A new shared surface inherits a checklist, not a guess:** cache-on-read (incl. its navigation entry point), queue-on-write, write-through, and it flushes with the global reconnect. Adding a collaborative entity without all four is the bug.
- The data-plane/control-plane line (ADR-0022) is now decided by one question — _do people share it?_ — which is why ADR-0039 was right to move settings across, and why the maybe-shelf (previously online-only) is brought under the outbox.
- Genuinely server-only actions (join/create/invite) are explicitly _not_ held to the offline-write contract; blocking them offline is correct behaviour, not a gap.
- Deferred, consistent with sync-and-offline.md's "what we do NOT build": peer-to-peer sync, CRDTs, and background sync push (waking a closed app to flush). "Flush on reconnect" here means **while the app is open**.

## Deferred: background sync (evaluated 2026-07-16)

Waking a **closed** app to flush the outbox (the Background Sync API in the service worker) was considered and **deferred**, for two reasons:

1. **Platform gap.** Background Sync is Chromium-only — **no iOS Safari** — so for a ~5-friends group where some carry iPhones it would cover only part of the party, while the device-wide **flush-on-reconnect-while-open** shipped here covers everyone. In practice you open the app when you regain signal, and that flush fires immediately.
2. **Auth cost.** The flush uses an in-memory access token (ADR-0020) the service worker can't see, so a SW-resident flush would need its own `/auth/refresh` → replay path (a second copy of the flush + refresh logic). Not worth it for the partial coverage above.

Revisit only on a concrete "phone was closed in my pocket and never synced" need. **Also deferred, same round:** an in-app "paste an invite link" field — joining is by _opening_ the `/join/:token` link for now (the zero-state join card points you there).
