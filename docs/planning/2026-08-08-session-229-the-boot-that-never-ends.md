# Session 229 — the boot that never ends, and the phase nobody had looked at

**Date:** 2026-08-08
**Branch:** `claude/bounded-api-reads-fr22`
**Scope:** field report **#22** from [session 224's incremental addendum](2026-08-08-session-224-incremental-field-reports-addendum.md) §2 — classified there as Class F (diagnosis first, bounded fix second). Frontend only. No ADR, no mockup, no schema change, no architecture change.

> Offline does not work correctly... Reopening the app leads to never-ending loading instead of loading the offline data. This is not airplane mode; the device simply has no reception/connectivity.

## 1. The lead was right about the mechanism and wrong about the phase

The addendum traced `fetchSnapshot` → `apiFetch` with no bound, and `TripProvider`'s boot effect falling back to the cached snapshot only on a **rejection**. All of that is true. What it could not know without running the boot is that **the app never gets that far.**

`AuthProvider`'s bootstrap effect is the first await of the entire application, and it runs two unbounded network reads before any trip exists:

```
await refreshAccessToken()   ← hangs here, first
const who = await fetchMe()  ← would hang here, second
… TripProvider → fetchSnapshot(tripId)   ← the reported skeleton, third
```

So the screen the report describes as "never-ending loading" is reached **one screen later than the actual hang**: with no upstream, the user sits on `BootScreen` (`status === 'loading'`), not on `טוען את הטיול…`. Both are a spinner with no end, which is why the distinction never surfaced in the report — and it matters entirely for the fix, because bounding `fetchSnapshot` alone would have changed nothing at all on the reported device.

### What was actually reproduced

A harness, not a phone — the same honest limit G2 carried. `fetch` was stubbed with a promise that never settles (**not** a rejection: airplane mode fails fast and this app already survived it; a connected radio with no upstream is the case that goes quiet), and every phase was asked whether it reaches an end:

| Phase                                          | Ten minutes of simulated clock | Result                    |
| ---------------------------------------------- | ------------------------------ | ------------------------- |
| `refreshAccessToken()` (boot)                  | ✓                              | wedged                    |
| `fetchMe()`                                    | ✓                              | wedged                    |
| `fetchMe()` with headers but a silent **body** | ✓                              | wedged                    |
| `fetchSnapshot()`                              | ✓                              | wedged                    |
| `TripProvider` boot, real `lib/api`            | ✓                              | still on `טוען את הטיול…` |

The last row is the field report itself, reproduced end-to-end: real `lib/api`, `isOffline()` false (the radios are on — `navigator.onLine` is `true`, which is exactly why the app's own `'offline'` event never fires), a snapshot sitting in the Dexie cache the whole time, and the app rendering its skeleton forever with the offline data one unreachable branch away.

**Why none of it could fail gracefully is the same structural reason as #20:** a promise that never settles is not an error. Every offline fallback this app has — the cached identity, the cached snapshot, the outbox's queue-instead-of-fail — keys on a **rejection**. Code that cannot reject cannot reach any of them, and the fallbacks looked correct the entire time.

### The domain-migration hypothesis did not pan out

The owner flagged it as a hypothesis and explicitly not as evidence; that was the right call, and it stays a hypothesis. Two findings against it:

1. **The reproduction involves no domain change at all.** The hang is reachable on any origin, from an unbounded `fetch` alone. Nothing needs the migration to explain the report.
2. **An orphaned pre-migration origin produces a different symptom.** IndexedDB and the host-only session cookie are origin-scoped (ADR-0020/0170), so a PWA still pointing at an old origin would find an **empty** cache and **no** session — and empty resolves instantly. That is a signed-out screen or a "nothing cached" error, not an endless spinner. The reported symptom is specifically the one that comes from silence, not from absence.

This rules the migration out **as this report's cause**, not out of existence — if a stale-origin install is out there it is its own (visibly different) problem.

## 2. What shipped

One mechanism, extended rather than duplicated (rule 8): `lib/deadline.ts`, built for G2.

- **`withDeadline` takes a caller's signal.** A bound must not cost a caller the cancellation it already had — `fetch` accepts exactly one signal, and the place searches pass their own so a superseded keystroke aborts (ADR-0108's session tokens depend on it). The caller's abort is relayed to the signal `work` actually holds, and the listener is removed when the phase ends. Deliberately not `AbortSignal.any`: jsdom 25 does not implement it, so the test environment would diverge from the browser.
- **`bestEffort` moved up out of `doc-cache.ts`.** It was already the right shape for "a local store that goes quiet is a miss, not a failure"; it is now shared by the blob cache and the Dexie snapshot read rather than copied beside it.
- **`apiFetch` bounds every request.** The headers phase (`API_TIMEOUT_MS.FETCH`) and every JSON body read (`API_TIMEOUT_MS.BODY`) — so the snapshot, `/me`, `/trips`, `/changes`, the invite preview, both place searches, the destination search, the enrichment lookup and `throwApiError`'s **error** body are bounded by one change instead of thirty-six. `fetchDocumentContent` dropped its own copy of those two bounds and now inherits them; #20's numbers are unchanged, they just stopped being document-specific (`DOC_READ_*` split into `API_*`, `LOCAL_READ_*` and `DOC_DECODE_*` accordingly).
- **The Dexie snapshot read is bounded too** (`LOCAL_READ_TIMEOUT_MS.SNAPSHOT`), because it **is** the offline fallback: it runs only after the network had nothing to say, so a jammed IndexedDB handle there is the boot's last chance to end. Silence answers "nothing cached", which the boot already renders as a retryable error rather than a spinner.
- **`isNetworkError` counts a `PhaseTimeoutError`.** This is the line that decides whether the fix is a fix. A `TypeError` is a request that never left; a timeout is a request that left and was never answered. Both are the network failing, neither is the server refusing — and had a timeout fallen through as an ordinary error, the cure for a hang would have been a **forced sign-out with the cached identity wiped**, which is worse than the bug. It also means a write that goes quiet now queues in the outbox instead of spinning.
- **The boot's wait on the refresh is bounded — the refresh is not.** `AuthProvider` gives up waiting after `API_TIMEOUT_MS.FETCH` and carries on to `/me` and the cached identity. `doRefresh`, `refreshInFlight` and the `wp-refresh` Web Lock are untouched: bounding _those_ turns a slow-but-alive refresh into a sign-out, which is the owner's call and stays backlogged. Giving up on the **wait** costs nothing by comparison — it is exactly what a _failed_ refresh already did here, and a late refresh still installs its token for the next call.

### Deliberately left unbounded

- **Multipart uploads** (`uploadDocument`, `uploadAvatar`). Their response headers only arrive once the bytes have gone **up**, so on a slow link "still uploading" and "dead" are the same picture from inside `fetch` — and the cost of guessing wrong is a lost upload, which is worse than the wait. The exemption keys on a `FormData` body, so it needs no call-site opt-out.
- **`doRefresh` itself**, per above and per the backlog line that owns it.
- **`apiFetch`'s internal wait on a 401 refresh.** Same wedge, same reason. It is also not reachable in #22's condition: with no upstream the request times out long before any 401 can arrive.

## 3. Coverage

All of it fails against the pre-fix code by hanging until vitest kills it, which is the regression it exists for.

- `state/trip-state.offline-boot.test.tsx` (new) — the field report itself, at provider level with the real `lib/api`: a boot with a never-answering `fetch` renders the **cached** snapshot, not the skeleton; it does not fall back early (a slow boot is still a boot); and with nothing ever cached it lands on the retryable error rather than a spinner.
- `state/auth-state.test.tsx` (new) — the phase the diagnosis actually found. The boot **reaches a decision**; it renders signed-in from the cached identity and does not clear it; a server that genuinely answers 401 still signs the user out; a healthy network still signs in. Each case mounts a fresh module graph, because `lib/api`'s in-flight refresh is module-level and one silent refresh poisons the next call — the wedge this session did not touch, leaking into the tests.
- `lib/api.test.ts` — the snapshot read ends, and so do `/me`, `/trips`, `/changes`, the invite preview, both searches and the enrichment lookup; the abandoned request is actually aborted; a silent **body** ends; a silent **error** body still produces an `ApiError`; a search still aborts on its caller's own signal; a multipart upload is still unbounded after ten times the body bound; a healthy read is untouched.
- `lib/deadline.test.ts` — the linked signal is relayed, an already-aborted caller starts aborted, the listener is removed when the phase ends; `bestEffort` answers its fallback on silence and on a throw, and passes a healthy answer through.
- `lib/cache.test.ts` — `readCachedSnapshot` answers null when the store never replies, and not before its bound.

`pnpm format`, `pnpm typecheck`, `pnpm build` and the full frontend suite (3081 tests) are green.

## 4. Not done here, deliberately

- **No ADR.** Nothing here revises a decision an ADR owns; `sync-and-offline.md`'s "Read" section already prescribed this fallback, and the fix is what finally lets it run. That doc's own sentence — the `'offline'` event that "some environments never fire even with no connectivity" — turned out to describe the reported device precisely, and is amended in place with the second half of the same lesson.
- **No device pass** (ADR-0017). The reproduction is a harness with a stubbed `fetch`, not a phone with no reception, and none of the numbers (20s to headers, 60s to a body, 10s to a cached snapshot) has been checked against a real connection abroad. If a bound ever fires on a working read, it is worse than the hang it replaced — that is the thing a device pass is for.
- **No change to any loading or error surface.** The boot skeleton, `BootScreen` and the snapshot `ErrorState` are all as they were; the fix is that they can now be left.
- **The token-refresh wedge**, per the backlog line that owns it and the owner's explicit instruction. It remains the sharpest "only a restart recovers" mechanism in the app.
