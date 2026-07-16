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

## Follow-up round — owner directives (same branch/PR)

Assaf reviewed the open questions and asked to close most of them. Second commit:

- **ADR-0042 — "everything shared between people is offline-syncable."** The guiding
  principle behind all of this, written down: shared/collaborative state owes the
  full offline contract (read-cache incl. its navigation entry point + outbox +
  write-through + device-wide reconnect flush); per-device state is exempt;
  genuinely server-only actions (join/create/invite) are the only allowed offline
  dead-ends and must say so. Makes "do people share it?" the test for the
  data-plane/control-plane line (refines ADR-0019/0022/0039).
- **Device-wide flush** (`lib/outbox.ts` `flushAllOutbox`, `App.tsx`
  `OutboxAutoFlush`): flush **every** trip's queue on `online` + on mount, not
  just the mounted trip. `flushOutbox` now coalesces per-trip so the global flush
  and a mounted trip's reconnect can't double-POST.
- **Maybe-shelf offline** (`verbs.ts`, `outbox.ts`, `cache.ts`): add/remove/park
  (and their undos) now route through the outbox with cache write-through, instead
  of being online-only.
- **Honest offline toast** (`state/trip-state.tsx`): a queued settings edit toasts
  "יסונכרן כשנחזור לרשת" (will sync) instead of "נשמר" (saved) — discriminated on
  `restOrQueue` returning `undefined`.
- **Block join offline in the empty-state cards** (`ui/CreateJoinActions.tsx`,
  i18n): the zero-state join card is disabled offline like create (the `/join`
  screen already blocked it); the offline note now says both creation and joining
  need a connection.

Tests now 223 (+3 more: maybe-shelf write-through, `flushAllOutbox` multi-trip +
one-stuck-queue-doesn't-block-others). Docs: ADR-0042 + README/INDEX rows,
sync-and-offline.md "Write offline" rewritten.

## Original open questions (from the first round)

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
