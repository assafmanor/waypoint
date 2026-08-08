# Session 222 — Workstream G2: the document read had no end, and now every phase of it does

**Date:** 2026-08-07
**Branch:** `claude/document-loading-hang-diagnosis-chhd8u`
**Scope:** field report #20 from [session 216's triage](2026-08-07-session-216-field-reports-triage.md) — Workstream G2, classified there as Class F (intermittent reliability; diagnosis first, build second). Diagnosis + bounded fix. No mockup, no ADR, no architecture change, frontend only.

## What the diagnosis was looking for, and what it found instead

The triage asked for the phases to be instrumented separately — client cache, network, backend fetch/decrypt, blob creation, image/PDF decode — so the stuck one could be named before anything was prescribed. That was the right question and it has an uncomfortable answer:

**There is no single stuck phase. Every await in the read path was unbounded — all eight of them.** A throwaway harness stubbed each phase in turn with a promise that never settles and asked whether the read still reaches an end. Every one of them wedged it on its own — the first seven inside `fetchDocumentContent`, the eighth in the viewer:

| Phase                               | First open | Cached open | Result |
| ----------------------------------- | ---------- | ----------- | ------ |
| `caches.open()`                     | ✓          | ✓           | wedged |
| `cache.match()`                     | ✓          | ✓           | wedged |
| cached hit's `.blob()`              |            | ✓           | wedged |
| `fetch()`                           | ✓          |             | wedged |
| `res.blob()`                        | ✓          |             | wedged |
| `cache.put()` (write-back)          | ✓          |             | wedged |
| `cache.keys()` (eviction sweep)     | ✓          |             | wedged |
| `img.decode()` (viewer, image only) | ✓          | ✓           | wedged |

And the viewer's half: a hung read leaves `.doc-viewer-loading` up indefinitely for image and PDF alike, with nothing announced and nothing to press.

**The reason none of this could ever fail gracefully is structural, not accidental.** The viewer's only route out of its loading state is the read _rejecting_. A promise that never settles is not an error: `try`/`catch` sees nothing, `.catch()` never runs, `res.ok` is never reached. `doc-cache.ts` made this worse in good faith — every entry point already wrapped its work in `try`/`catch` and answered `null`, so a Cache API that _throws_ was survivable and one that goes _quiet_ was fatal, and the code looked defensive either way.

### Three findings that explain the "only a full restart recovers" part

This was the part of the report worth taking literally, because it rules out most explanations.

1. **The Cache API phases run ahead of the network.** `readCachedBlob` is the first line of `fetchDocumentContent`, so a jammed storage handle wedges the **first** open and the **cached** open identically — which matches a report that does not distinguish them. The handle is per-page, so closing the viewer and reopening the document re-enters the same jam; a new storage connection is exactly what closing and reopening the app gets you.
2. **The write-back was awaited.** The bytes were already in hand and the caller still got nothing, because `await writeCachedBlob(...)` sat between the successful read and its return — and that write runs a full `cache.keys()` eviction sweep first. A cache that was best-effort in _errors_ was blocking in _time_.
3. **`img.decode()` is the only phase where image and PDF differ.** The viewer decodes an image before handing the URL to the DOM (a real optimization — it keeps a multi-megabyte scan off the main thread mid-transform). A decode requested while the document is hidden is dropped and never settles, which is a phone locked or backgrounded mid-load. A PDF never reaches that phase at all.

### What the diagnosis could not do

**Nothing was reproduced on the owner's device.** These are the phases' _reachability_ proved in a harness, not a capture of the one that fired in the field. That is the honest limit of what this session can claim — and it is the argument for bounding all of them rather than picking the most likely one: which phase actually hung stops mattering once none of them can hang.

The backend was read and is not implicated: `getContent` decrypts into a Buffer and `res.send`s it in one go, so headers and body leave together and there is no mid-body stall for the server to cause.

## What shipped

`lib/deadline.ts` — `withDeadline(phase, ms, work)`, one mechanism for both kinds of phase. An **abortable** phase (`fetch`) is handed the signal and actually stops, so a request nobody is waiting for is not left holding a connection; an **unabortable** one (the Cache API, `decode`) is abandoned, its promise staying pending exactly as it was going to anyway. Deliberately not `ws.ts`'s watchdog, which re-arms on every frame because a socket proves itself alive repeatedly — a read is one answer arriving once, so its bound is a plain deadline.

Bounds live in `constants.ts`'s `DOC_READ_TIMEOUT_MS`, **sized as "this is dead", never "this is slow"**: a bound that fires on a working download is a worse bug than the hang it replaces, so the body gets `WS_WATCHDOG_TIMEOUT_MS`'s minute for the same reason that constant has it.

Then, per phase and per what a failure there actually _means_:

- **Cache (3s)** — the bound lives inside `doc-cache.ts`, where it collapsed four hand-written `try`/`catch` blocks into one `bestEffort` helper. Silence is a **miss**, not a failure: the read falls through to the network, so finding 1 becomes a slow open rather than a dead one, and a new cache entry point is one line rather than another `try` block.
- **Fetch (20s) and body (60s)** — reject, and the error body takes the same bound as the success body, since a 500 whose body never arrives hangs in `throwApiError` exactly as a 200's would.
- **Write-back — not bounded, detached.** `void writeCachedBlob(...)`. The bytes are the caller's answer and the write is pure optimization; a timeout here would have been the wrong shape for a thing that should never have been on the critical path.
- **Decode (10s)** — and this is the one branch worth reading twice: **a decode that fails and one that never answers mean opposite things.** Failure is bytes the browser cannot render (a HEIC, a corrupt scan) and the hand-off is right. Silence only means the optimization was unavailable, so the `<img>` gets the URL anyway and its own `onLoad`/`onError` has the last word — the document still arrives.

And the failure state itself: `ErrorState` from `ui/feedback` (ADR-0078) **with a retry**, replacing a bare `<p className="doc-viewer-msg">` that announced nothing and offered nothing. That caption was the dead end the report describes even when the read _did_ fail properly. Retry is a counter in the read effect's deps — which is all a retry needs to be, now that every phase reaches an end.

## Coverage

- `lib/deadline.test.ts` — work passes through, work's own rejection passes through untouched, silence becomes `PhaseTimeoutError`, the bound does not fire early, the signal is actually aborted, and the timer is cleared when work wins.
- `lib/api.test.ts` — a hung fetch and a hung body both **end** (and only after their full bound, so a slow read is still a read); the abandoned request is aborted; a hung cache read falls through to the network; a hung cache **write** does not hold up the blob already fetched; a healthy hit still skips the network. **All five fail against the pre-fix code**, by hanging until vitest kills them — which is the regression they exist for.
- `ui/MediaViewer.test.tsx` — a rejected read reaches `ErrorState` with an announced title and a retry, the retry re-reads and shows the document, a decode that never answers still shows the image, and one that fails still hands off.

One test-ordering trap worth knowing: the new block sits **above** the pinch tests, because a pinch release arms the global click swallow (`lib/click-swallow.ts`) and it eats the retry press. Harmless in the app — a failed read has no picture to pinch.

## Not done here, deliberately

- **No architecture change.** Redis and streaming ingest were never approached; the triage was right that they are unrelated, and nothing in the diagnosis pointed at them.
- **No new loading/error component,** and no change to the loading state at all. `.doc-viewer-loading` is a bespoke shell by the letter of ADR-0078, but replacing it is a visual change to a shipped surface that the bug does not require.
- **The token refresh was left alone,** and it is the sharpest thing found that this session is not fixing. `doRefresh`'s `fetch` has no bound, `refreshInFlight` clears only in `.finally()`, and the `wp-refresh` Web Lock releases only when its callback settles — so one refresh that never answers poisons every later 401 in the tab _and in every other tab_ until the page reloads. That is a genuine "restart the app" mechanism, but it is not document-specific and bounding it makes a slow-but-alive refresh into a **sign-out**. That is the owner's call, not a cleanup. Backlogged.
- **Every other API read still has no bound** — the fix stops at the document path on purpose. Backlogged with the same reasoning: the mechanism exists now, but the per-call bound and what each caller shows when it fires are decisions, not defaults.
- **No device pass.** Whether a bounded failure reads well on a real phone, and whether any of these numbers is wrong against a real connection abroad, has not been seen (ADR-0017).
