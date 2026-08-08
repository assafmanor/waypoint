# Session 230 — a document attaches to its host (#26, workstream K)

**Date:** 2026-08-08
**Decisions:** [ADR-0173](../decisions/0173-a-document-attaches-and-detaches-never-dies.md) (amended in three places by this build), [ADR-0172](../decisions/0172-a-linked-pair-is-one-context-and-a-place-may-inherit-it.md) (reused whole, unchanged)
**Mockup:** [`notes-and-documents-in-context-v1.html`](../../mockups/notes-and-documents-in-context-v1.html) §1, variant D
**Follows:** [session 225](2026-08-08-session-225-notes-and-documents-share-a-context.md), which decided and drew #26 and said plainly that it was not built.

## 1. What this session was

A **build**, not a decision session. ADR-0173 was Accepted and unbuilt; the mockup was approved; the model was settled. Nothing here re-opened it. The one thing that moved is recorded below in §4, and it is three small corrections the ADR earned by meeting the code, amended in place rather than deferred into a new doc.

Every layer #26 needed now exists: the Prisma model and its migration, the shared entity + schema + `ENTITY_TYPE` member, a backend module with its scope checks, the snapshot field, the sync channel + applier + Dexie cache + outbox verbs, `dropAttachmentsForHostChange`, the undo restore on an event delete, unlink carrying the link rows, and the attach slot on both host forms.

## 2. The shape, in one paragraph

`DocumentAttachment { id, tripId, documentId, eventId? | bookingId?, createdBy, createdAt }` — a join table, so **detach-never-delete is the default cascade rather than a `SetNull` special case**, and so one confirmation PDF can cover a round trip's two bookings. Which hosts share a list is **not stored**: `lib/host-context.ts` from #24 answers it, called and not copied, which is the single most important line of the reuse audit. A place displays and never originates, so there is no `placeId` FK to reason about at all.

## 3. What was actually hard, and it was not the entity

**Three things, none of which the ADR could have known.**

**The upload entrance needs an id the uploader was keeping to itself.** ADR-0173 §5 says `DocumentUploadSheet` is reused "unchanged". It cannot be, quite: the upload is outbox-first (ADR-0056), so a freshly uploaded document is not in `documents` until the flush lands, and the only thing that knows the id it minted is the sheet. It gained one optional `onUploaded` callback. That is the smallest possible extension, the Index's uploader passes nothing and is untouched, and the alternative the ADR was really guarding against — a forked "attach and upload" variant — is still rejected. §5 amended.

**Variant D's one control had to reach both entrances.** Drawn as a single 40px button, the empty slot would be a dead end on a trip with no documents yet — which is exactly the trip where somebody attaches their first one. So the control opens the picker, and the picker's primary action is `העלאה`. The side-by-side split still appears only once something is attached, which is what the 40px measurement was buying. §5 amended.

**The cascade has three arms and §7 reasoned about two.** `document → Cascade` is as silent as the host ones. §6's resolution would have rendered those orphaned links as nothing anyway, so the visible bug was small — but what it would have left is a **count that lies**, which is the same class of defect the notes cascade exists to prevent. `dropAttachmentsForHostChange` handles it, matching on `documentId` rather than through `ATTACHMENT_HOST_FIELD`, which cannot name a document because a document is not a host. §7 amended.

## 4. Three one-offs generalized rather than copied

Recorded because each was a place where the cheap move was a second copy:

- **`assertNoteHostInTrip` → `assertEntityRefsInTrip`.** It already answered "whichever of these references are set, are they in this trip", which is exactly what an attachment needs for its host **and** its `documentId`. One guard, two consumers — and it gained the direct spec `backend/CLAUDE.md` says a shared guard util should carry, which it had never had.
- **`withPendingUploads`.** `DocumentsSection` composed "every document this device can see, queued ones included" inline when it was the only reader. The picker is the second, and it is the case that needs it most.
- **`writeStagedAttachments`.** One helper owns the two facts a form's staged links depend on — write them after the host, and force `{ queue: true }` when the document is itself only queued — so `BookingSheet` and `EventForm` do not each re-derive the ordering rule.

## 5. What the tests pin that a diff would not show

- **The silence itself.** `document-attachments.service.spec.ts` asserts that deleting a booking removes the link, leaves the document alone, **and writes no `Change` for the cascaded row**. That last one is the whole reason the client owes a derivation; it is now a tested fact on the server rather than a claim in an ADR.
- **The two idempotencies, which are different.** A duplicate client id is an outbox replay; a duplicate `(documentId, host)` under a fresh id is a double-tap on the picker. Both answer the row that already exists, by different routes, and both have a test.
- **Visibility, on the surface where it shows.** `DocumentAttach.test.tsx` renders a link whose document the reader does not hold and asserts the slot reads as **empty** — not a stub, not a placeholder.
- **The empty slot is one control.** A regression to the drawn 86px version would look like a nicety rather than a bug, so the test names the header and the two entrances as things that must be absent.
- **The unlink carry**, at provider level, asserting the surviving event ends up holding a link to the booking's document. The equivalent test for #24's note carry does not exist; this one does, and it covers the same code path's ordering discipline.

## 6. Deliberately not done

Everything ADR-0173 §9 reserves, unchanged: no attachment from the Documents side, none to a `MaybeItem` or another document, no auto-attachment by parsing an upload, no change to encryption/download/MIME.

**And one thing §4 implies that this build did not add: an attachment display on the place surface.** A place inherits its single context's attachments by the same derivation, and `attachmentsForContext` already resolves it — but no place surface renders one yet, because the slot this session built is the host FORM's and a place has no form to carry it. Read-only sections on the place card and the booking detail are a small, additive follow-up rather than a model question, and they are the right next K item.

## 7. Green

`pnpm format` / `typecheck` / `build` clean. Suites: frontend **192 files / 3135 tests** (from 189 / 3095), backend **44 / 539** (from 42 / 524), shared **10 / 187** (from 10 / 181). The backend suite needs a live Postgres — the migration was applied and `prisma migrate status` reports no drift, which is what proves the hand-written migration matches the model.
