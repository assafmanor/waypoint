# 2026-07-18 · Session 35 — Frontend architecture review + Critical/High fixes

**What happened:** a full senior-architect review of the React PWA frontend, followed by fixing the Critical and both High findings it surfaced.

## The review

Deliverable: `docs/reviews/frontend-architecture-review.md` — an advisory review across all 18 requested areas (correctness, offline/sync/persistence, state ownership, routing, temporal logic, RTL/a11y, performance, testing, security). Method: read the source + docs + contracts, trace the representative flows, run the quality gates (typecheck / test / build / lint). The app was **not** run in a browser (no backend booted), so findings are code/contract/test-based, not runtime-observed.

Overall verdict: unusually mature, product-shaped frontend (strong temporal discipline, a coherent offline read/write stack, careful auth, a testable pure-function core). Not yet ready for broader use pending the top findings below. After PR #162 merged (ADR-0065, docs-only), the review's readiness framing was recalibrated to the corrected scope (many trips / many users, grow-later — "~5" sizes one trip's group); no code finding changed, and F-01 was reinforced (see below).

## Fixes shipped (F-01–F-04)

Three worktree-isolated agents, disjoint file ownership, integrated together on `claude/waypoint-frontend-review-kovleu`. Combined gate green: typecheck clean, **353 tests** (up from 341), build + lint pass (0 errors).

- **F-01 (Critical) — local caches not torn down on logout.** New `wipeLocalData()` (`lib/cache.ts`) clears all Dexie tables + the active-trip id + the decrypted document blob cache (`clearAllCachedDocuments()` in `lib/doc-cache.ts`) and re-primes the outbox badge; called from `logout()` and the genuine online-401 `onSessionExpired` path. Offline cold-boot fallback deliberately preserved. **Recorded as [ADR-0066](../decisions/0066-client-local-data-teardown-on-signout.md).**
- **F-02 (High) — fixture `+09:00` in the quick-schedule verb.** Now builds instants via `zonedIso(activeDate, slot, trip.timezone)`; derivation extracted to a pure `buildScheduleEvent` and regression-tested for `Europe/London` (DST) + `America/New_York`. (Aligns the last stray path with ADR-0018/0026's time discipline; no new ADR.)
- **F-03 (High) — offline writes hard-failing on flush were dropped silently.** Non-allowlisted 4xx now record a failed-sync entry (`useSyncFailures` store), surface a dismissable Header badge, and trigger a snapshot resync so the phantom optimistic entity is reconciled; only `MOVE_INTO_PAST`/`MOVE_CROSSES_DAY` still drop quietly. (Fills the failed-sync-visibility gap under ADR-0042; no new ADR.)
- **F-04 (High) — no WebSocket reconnect/heartbeat.** `openTripStream` gained bounded exponential-backoff reconnect (pure `reconnectDelay`), a ping heartbeat, and a no-frames watchdog; `trip-state` runs catch-up on reconnect via a shared `catchUp()`. (Hardens the sync-and-offline realtime path; no new ADR.)

## Not addressed (open)

F-05 onward (Medium/Low/Informational) remain open — see the review §5 and the backlog "Frontend review follow-ups" line. Notable Mediums: F-05 (real-user attribution vs. the `activeUserId` fixture), F-06 (`activeDate` clamps against stale snapshot dates), F-07 (no route-level code-splitting; single ~620 KB bundle), F-08 (dialog focus-trap/Escape), F-10 (offline/sync status not announced to AT).

## Notes

- No em-dash rule and Conventional Commits held throughout; each fix carries its own regression tests.
- Runtime/browser verification of the behavioral fixes (logout wipe, WS reconnect) was not performed — coverage is the unit/integration suite + the combined build.
