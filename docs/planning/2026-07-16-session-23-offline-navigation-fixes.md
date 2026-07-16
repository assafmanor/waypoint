# 2026-07-16 · Session 23 — Offline-mode navigation & sync fixes

**Participants:** Assaf + Claude
**Branch:** `claude/offline-mode-navigation-lezl56` (from `main`).
**Fixes:** the offline read cache (T-058) + outbox (T-013) not covering the navigation surfaces and the trip list — implementation catching up to [sync-and-offline.md](../architecture/sync-and-offline.md)'s "everything works offline for reads".

## The report

Offline you can keep editing inside a trip, but: reopening the app drops you to a
"homescreen"; going back to all-trips shows nothing; returning from settings
loses the trip; and trip-settings edits neither show as pending nor obviously
sync. Nothing offline-navigational worked as expected.

## Root causes (four distinct bugs)

1. **Cold reopen → `/login` (the "homescreen").** `AuthProvider`'s boot ran
   `refreshAccessToken()` then `GET /me`; offline **both** fail, so status went
   `anon` → `AuthGate` redirects to `/login`, which can't complete offline.
   Identity was never cached, so a signed-in user looked signed-out with no
   network.
2. **All-trips / boot resolution → empty → ZeroState.** `RootSurface` and
   `AllTrips` both called `fetchTrips()` and, on failure, `setTrips([])`. The
   **trip list was never cached** (only per-trip snapshots were), so offline the
   list collapsed to empty — ZeroState on reopen, empty all-trips, and no back
   button into the live trip. "Back from settings" lands on one of these, so it
   inherited the same failure.
3. **Offline edits vanished from the read cache.** Offline writes updated the
   in-memory reducer + the outbox but **never the Dexie read cache**
   (`applyChangeToCache` only ran for WS _remote_ changes; `cacheSnapshot` only
   on fetch). So a cold reopen offline rendered the pre-edit snapshot — added
   events / renamed trips appeared to disappear until reconnect.
4. **Settings changes not visibly pending.** The pending-sync badge lived only in
   the trip shell header; the settings screen showed just an offline badge. (The
   writes _were_ queued and do sync via the trip's reconnect flush — but with
   bugs 1–2 you never got back to the header to see the count.)

## What shipped (frontend-only)

- **Offline identity** (`state/auth-state.tsx`, `constants.ts`): cache `me` in
  `localStorage` on a successful `/me`; on a boot failure that's a network error /
  offline, fall back to the cached identity and render `authed`. A real 401 (or
  session-expired / logout) still goes anon and clears it. Identity, not the
  token — consistent with ADR-0020.
- **Trip-list cache** (`db.ts` `tripList` table v4, `lib/cache.ts`
  `cacheTripList` / `readCachedTripList` / `loadTripList`): `RootSurface` and
  `AllTrips` now load through `loadTripList()`, which mirrors on success and reads
  cache on failure.
- **Offline write-through** (`lib/cache.ts` `applyOutboxOpToCache`, called from
  `enqueueOutbox`): every queued op is mirrored into the read cache (events,
  maybe-item consume, trip/roster settings, and the trip-list row for trip
  edits), best-effort so it never blocks queueing.
- **Pending badge on settings** (`screens/TripSettings.tsx`): the shell's
  `pendingSync` badge, now also on the mode-neutral settings header.

## Verification

Local: frontend `typecheck`, `build`, `test` (220, +8 new in `cache.test.ts`
covering the trip-list cache, `loadTripList` online/offline, and the
write-through), `lint`, `prettier --check`. Backend untouched (its local
typecheck needs a generated Prisma client / `DATABASE_URL`, an env artifact of a
fresh clone). End-to-end offline driving (service worker + real reopen) deferred
to manual QA.

## Open questions / follow-ups

- **Global background flush.** The outbox flush is still tied to a trip's realtime
  effect being mounted, so a write queued offline flushes when you're next in that
  trip online — not the instant connectivity returns from ZeroState/all-trips. A
  device-level flush-on-`online` (across all trips' outboxes) would close this,
  but "background sync push" is explicitly deferred in sync-and-offline.md.
- **Maybe-shelf add/remove/park are online-only** (not routed through the outbox,
  by prior design) — they still fail with a toast offline. Out of scope here.
- **"Saved" toast on a queued settings edit** reads as done even when only
  queued; kept for consistency with the event verbs (which also toast optimistically).
  The pending badge now carries the honest state.
- The first-ever load of a trip while **offline with nothing cached** still shows
  ZeroState / the snapshot error — unavoidable without a prior online fetch.
