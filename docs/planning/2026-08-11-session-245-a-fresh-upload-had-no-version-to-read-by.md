# Session 245 — a just-uploaded document had no version to read by (field report #33, workstream R)

**Date:** 2026-08-11
**Workstream:** `R` — post-upload document availability. Diagnosis first, then a targeted fix.
**Touches:** `backend/src/sync/change.service.ts`, `backend/src/documents/documents.service.ts`, `frontend/src/ui/MediaViewer.tsx`, `frontend/src/lib/api.ts`, `docs/architecture/sync-and-offline.md`.
**No ADR.** See §6 for why, and for what would have forced one. **The upload bound was not touched, and did not need to be** (§4).

## 0. The report

> After an upload appears to complete, opening the document sometimes stays on a spinner — on the uploading device and on another device receiving it.

Owner's decision, already settled: a new document must become loadable on the uploader and on peers without a restart.

## 1. The answer, before the evidence

The document's `updatedAt` never reached either client, and the viewer refused to fetch content without one.

Two halves, one on each side of the wire:

- **The server published the request, not the row.** `documents.service.ts` recorded `after: { ...input, mimeType, sizeBytes }` — exactly the fields the uploading client already had. A `Change`'s `after` is what every receiving client merges into its list (`applyControlChangeToList`), so a fresh upload landed as a row with **no `createdAt`, no `updatedAt`, no `updatedBy`** and, when the client sent no id, no id either.
- **The client treated a missing version as "no document".** `MediaViewer`'s read was gated on `blobTripId && blobDocId && blobVersion`, and the else-arm was a bare `return`. No request, no cache read, no rejection — and the viewer's only route out of its loading state is a rejection. So the spinner had nothing behind it and nothing to end it, and the `ErrorState` + retry that field report #20 built was unreachable.

**Both devices, for the same reason.** The uploader is not a special case: uploads go through the offline outbox (ADR-0056), the flush **discards** `uploadDocument`'s response, and the row arrives on the uploader's own screen through the WS self-echo — the same payload the peer gets. That is why a report about a peer-visible failure also reproduces on the device that did the upload.

**And it explains "restart recovers".** A tab round-trip refetches nothing and `changes?sinceSeq=` replays the same deficient payload; only a fresh `fetchSnapshot` — a route remount, a reconnect gap, or relaunching the app — replaces the row with the complete one from `GET /trips/:id/snapshot`.

## 2. The phases, in the brief's order, each answered by running it

A real stack was stood up for this: Postgres 16 on a socket, `DEV_AUTH=1`, the seeded trip, backend on `:3000`, Vite on `:5173`, and Chromium driving two independent browser contexts — an **uploader** and a **peer** with the documents list open the whole time.

| #   | Phase                                              | Answer                                                                                                                                                                | How                                                                  |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Upload in flight vs response complete              | **Complete.** The POST returns the full `TripDocument`, the outbox entry is deleted, the pending row retires. Not stuck, and not the unbounded multipart case.        | `curl` against the running server; the outbox row gone in the app.   |
| 2   | Metadata created and broadcast, attachment visible | **Created and broadcast — and incomplete.** The `Change.after` on a real upload read `{"type","title","mimeType","sizeBytes"}`. Nothing else. The row IS in the list. | Read straight out of Postgres: `select after from "Change" …`.       |
| 3   | Blob committed and readable from storage           | **Yes, before the row exists.** `putObject` runs ahead of the transaction, so metadata can never be visible before bytes are.                                         | Code trace + `GET /content` by curl on a fresh upload: `200`.        |
| 4   | Cache API hit or miss, and does a miss wedge       | **Never reached.** Bounded since #20 regardless (`LOCAL_READ_TIMEOUT_MS.HANDLE`, answers a miss on silence).                                                          | `fetchDocumentContent` recorded zero calls in the failing render.    |
| 5   | Content fetch headers / body                       | **Never reached.** No request is made at all, so neither `API_TIMEOUT_MS.FETCH` nor `.BODY` can fire — which is the point: a bound only helps a read that started.    | Same probe.                                                          |
| 6   | Decrypt / decode / object URL                      | **Never reached.** `DOC_DECODE_TIMEOUT_MS` is downstream of bytes that never arrive.                                                                                  | Same probe.                                                          |
| 7   | Viewer loading-state transition and retry          | **This is where it is stuck.** `url` stays `null`, `failed` stays `false`, forever.                                                                                   | Two browser contexts: `spinner=1 image=0 error=0 handoff=0` on both. |

**The end-to-end proof, both directions.** On the pre-fix tree, the uploader and the peer each opened the fresh upload and sat on `spinner=1`. On the fixed tree, the same script reports `image=1` on both.

## 3. The lead in the brief was real and was not the cause

The brief's lead — `trip-state.tsx` evicting the client blob cache only on `UPDATE`/`DELETE`, so a `CREATE` evicts nothing — is accurately described and is **not** this defect. Nothing is cached under a brand-new document's key, so there is nothing for a CREATE to evict; the cache is never consulted in the failing case because no read starts. The rule as written is correct and is unchanged.

What the lead was pointing at, correctly, is the **arm** — the metadata-available → content-available transition on a new upload. That arm was broken one layer earlier than the eviction rule.

## 4. The upload bound was not the stuck phase, and stays unbounded

`uploadDocument` is still the one caller `boundedFetch` waves through (`init.body instanceof FormData`), on purpose: a multipart response's headers only arrive once the bytes have gone up, so "slow" and "dead" are the same picture from the client and the cost of guessing wrong is a lost upload. Steps 1–2 above show the request settles and the metadata lands, so nothing here reopens that trade. It was not touched.

## 5. The fix, and why it is in two places

**Root cause, server side.** `ChangeService.mutate` now accepts `after` as a **mapper over the entity `apply` returned**, and the documents service passes `toDocumentSummaryDto` for both `create` and `update`. `mutateMany` could already build a payload from the written entity (that is how a booking's linked event gets a full one); this gives the single-entity path the same reach without restructuring the call. `before` on those two writes was already a summary DTO, so the two sides are now symmetric — and the payload is still a summary, so `fileRef` remains server-only.

The rule this encodes is not documents-specific, so it went into the architecture doc rather than a comment: **`after` is the row, not the request** — a third invariant beside atomic-write and the monotonic cursor in `sync-and-offline.md`. Session 244's own diagnosis had already noticed the same omission on events at its step 3 (`Missing: createdAt, updatedAt, updatedBy`) and had no reason to chase it; this is what it costs when a consumer needs one of those fields.

**The dead end, client side.** `MediaViewer` now reads by `docId` with the version as an optional cache key, and the unreachable-source arm sets `failed` instead of returning silently. Two things follow: a row whose version has not arrived is **read** rather than refused, and no shape of source can end in a spinner with no exit — which is the acceptance line the brief drew.

**One guard rides with it.** An unversioned read is served but **not written back** to the blob cache: its key would be the bare `/content` path, which no later version can supersede, and version-keying is exactly what ADR-0055 exists to guarantee. Skipping the write costs such a read its offline copy and keeps every stored entry version-keyed. ADR-0055's immutable-content policy is otherwise untouched — it is not the faulty assumption here.

**The client half is not redundant with the server half**, and this is the second live instance of the same dead end: `withPendingUploads` stamps a queued upload `updatedAt: ''` by design ("not stamped yet"), and while the documents list disables those rows, `HostDocuments` → `DocumentChips` renders them as **tappable** chips on a booking or event. Opening one now fails answerably — the content genuinely is not on the server yet — and the retry succeeds once the flush lands. Before, it was the endless spinner again.

## 6. Why no ADR

Nothing here revises a decision an ADR owns. ADR-0055's keying rule is upheld rather than changed (the unversioned read declines to store, rather than storing under a weaker key); ADR-0056's outbox-first upload is unchanged; ADR-0019's choke point gained a parameter, not a different contract. What **would** have forced one is the opposite finding — that content is not immutable by `fileRef`, or that the upload bound had to be revisited — and neither is what the evidence says.

## 7. Regression coverage, and what each one proves

All four fail on pre-fix `main`; verified by stashing the fix and re-running.

- `documents.service.spec.ts` — the `create` and `update` change payloads each parse as a complete `DocumentSummary` and still carry no `fileRef`. Asserted through the schema the receiving client parses snapshots with, so a future field cannot go missing quietly.
- `change.service.spec.ts` — the mapper form reads its payload off the row the transaction just wrote.
- `MediaViewer.test.tsx` — a document with no version reads by id (`fetchDocumentContent('t1','d1',undefined)`, never an empty `?v=`), and when that read fails it lands in `ErrorState` with a retry that succeeds once the bytes exist.
- `api.test.ts` — an unversioned read is served and stores nothing.

## 8. Noticed, not fixed

- **The change feed cannot name a document.** `state/change-feed.tsx`'s `subjectOf` picks `filename` ?? `name` for `entityType: 'document'`; a `Document` has neither, so every document line reads as the generic noun. It is a one-word change (`title`) and it is not this report — recorded here rather than smuggled in.
- **The same payload shape is used by every other service** (`after: input` in notes, events, maybe-items, attachments). Only documents had a consumer that needed a server-minted field, so only documents are fixed. The invariant is now written down; the next consumer that needs one has somewhere to point.
