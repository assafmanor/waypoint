# 0173 — A document **attaches**, it **detaches**, and it never dies with its host

**Status:** Accepted and **built** (owner sign-off 2026-08-08; shipped session 230, same day)
**Date:** 2026-08-08
**Session note:** [`planning/2026-08-08-session-225-notes-and-documents-share-a-context.md`](../planning/2026-08-08-session-225-notes-and-documents-share-a-context.md)

**Reverses:** [0047](0047-booking-event-linkage-and-notes.md) §4 — "**Documents stay independent of Bookings/Events — no linkage field added**", and its Alternatives entry "Document↔Booking linkage (e.g. a boarding pass tied to its flight). **Rejected for now:** out of scope, keeps Documents simple and independent." Stated as a reversal rather than an extension because that ADR made the call deliberately and a reader who finds an attachment table needs to know it was reopened on purpose, by field report #26, and not overlooked.
**Builds on:** [0172](0172-a-linked-pair-is-one-context-and-a-place-may-inherit-it.md) (the context derivation this reuses whole and does not re-derive), [0058](0058-documents-in-the-trip-snapshot.md) (the worked example of a document list joining `TripSnapshot` as a first-class reactive entity), [0056](0056-faster-document-uploads.md) (the outbox-first upload whose client-generated id §5 depends on), [0094](0094-one-pluggable-change-applier-registry.md), [0042](0042-shared-state-is-offline-syncable.md), [0023](0023-zod-first-entities-and-openapi.md)
**Relates:** [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6b (the on-the-way authoring principle §5 applies to a second content type), [0015](0015-document-encryption-server-side.md) / [0034](0034-document-encryption-trust-model.md) (§6's visibility rule), [0069](0069-document-download-only-and-mime-allowlist.md), [0157](0157-a-place-can-be-removed.md) §3 (the `SetNull`/`Cascade` client-derivation rule §7 is a third instance of)

## Context

Field report #26 (`planning/2026-08-08-session-224-incremental-field-reports-addendum.md` §6): a document cannot be attached to anything. `tripDocumentSchema` carries `tripId` and nothing else — there is no host FK of any kind, not even ADR-0152's single-host pattern. A boarding pass, a hotel voucher and a car-hire agreement all live in one flat trip-scoped list, and the booking they belong to cannot point at them.

The owner's rules, confirmed in this session:

1. A directly linked Booking + Event may surface the same document.
2. A Place may surface those documents only while it has exactly one relevant Booking/Event context.
3. A reused Place's contextual documents stay with their original context, never leaking into the new use.
4. **Explicitly rejected at this stage:** authoring a document attachment directly on a Place. A Place may **display** an inherited document; it may not **originate** one.

Rules 1–3 are ADR-0172's rules word for word, and this ADR does not restate or re-derive them: §2 below reuses that derivation as a library. Rule 4 is the one genuine difference, and it turns out to be the _same_ asymmetry ADR-0172 §3 independently arrived at for notes — a place inherits one-way — which is worth noting because it means the two features share a grammar even though §1 gives them different storage.

## Decision

### 1. The link is its own row, and that is what makes "detach, never delete" free

A new `DocumentAttachment` entity, **not** a host FK on `Document`:

```
DocumentAttachment { id, tripId, documentId, eventId? | bookingId?, createdBy, createdAt }
```

Exactly one host FK is set, enforced by the shared zod schema at both edges — the same closed-union discipline `Note` uses (ADR-0152 §2), for the same reason and with the same accepted cost (a third hostable entity is a migration).

**Three cascades, and the middle one is the whole point:**

- `document` → `onDelete: Cascade`. Deleting the file takes its links.
- `event` / `booking` → `onDelete: Cascade` **on the link row**. Deleting the host takes the _link_. It cannot take the document, because the document is not on the other end of that FK — it is a separate row, still owned by the trip.

That last line is why the join table beats the cheaper shape. **A note is born owned by its host; a document is not.** A `TripDocument` already exists as a first-class trip entity with its own screen, its own upload flow, its own encryption and its own list — it gets _attached_ after the fact. Putting `bookingId?` on the document row would make the natural cascade `Cascade` (wrong: a cancelled hotel deletes your voucher) and the correct one `SetNull` (a special case someone will "fix" later). With a link row, the correct behavior is the _default_ behavior, and nobody has to remember why.

**And the link table is many-to-many, which is a real requirement rather than generality for its own sake.** ADR-0154 fixes a round trip as **two** `Booking`s. One confirmation PDF covers both. Under a single host FK that document has to be uploaded twice — two encrypted blobs, two rows, two things to keep in step — to express one fact.

### 2. The context rules are ADR-0172's, imported whole

A linked Booking + Event is one context; the **anchor is the Booking**; a Place with exactly one relevant Booking/Event context inherits it one-way; "relevant" is counted through ADR-0048's place-authority rule, excludes ideas, and is not date-scoped. All of it is ADR-0172 §1–§3, and **the derivation is one module both features call** (`lib/host-context.ts`), not a second copy keyed to attachments.

This is the answer to the question session 224 explicitly left open — whether Notes and Documents share an internal abstraction. They share **the derivation and the grammar**; they do not share **the storage**. Sharing storage would have forced Notes into a migration it does not need (ADR-0172 §1) and forced Documents into a cascade that destroys files. Sharing the derivation is what stops the "exactly one relevant context" test from existing twice and drifting — which is the failure root `CLAUDE.md` rule 8 is actually about.

**So an attachment written from any surface in a context lands on the anchor**, exactly as a note does, and rule 3 costs nothing for the same reason it costs nothing there (ADR-0172 §4): the link row never moves.

### 3. Unlink carries the attachments, and it is the same fourth conversion

ADR-0047 §3's unlink branch keeps the event and deletes the booking, so the booking's link rows would cascade away. They move to the surviving event first, queued **before** the delete on the FIFO outbox — ADR-0172 §5's rule, applied to a second entity through the same ordering discipline.

Note what is _not_ lost either way: the documents. Even a delete-both takes only the links. This is the one destructive path in the app where the confirm does not need a consequence line, and that is worth saying out loud, because ADR-0152 §2 taught the opposite reflex for notes.

### 4. A Place displays, never originates

The place surface lists its single context's attachments and carries **no attach control**. This is the owner's explicit rule 4, and it is also what ADR-0172 §3 concluded for notes on its own reasoning, so the two surfaces read the same way rather than one being an exception.

Because a place cannot originate one, `placeId` is **not** a host FK on `DocumentAttachment` at all — the union is two members, not three. A place's inheritance is entirely a read-time resolution, so there is no row that could be mis-hosted, and no cascade to reason about when a place is removed (ADR-0157).

### 5. Attaching happens **on the way**, in the host's own form

Owner's call, and it is ADR-0152 §6b's principle applied to a second content type: adding a document to a booking or an event **never sends the user to another screen first**. The host's form carries an attach slot with two entrances:

- **Pick an existing trip document** — the common case once a passport or insurance PDF is already uploaded.
- **Upload a new one** — reusing `DocumentUploadSheet` unchanged rather than growing a second uploader.

**Offline this is already solved twice and needs no new machinery.** ADR-0056 makes an upload outbox-first with a **client-generated id**, so the document's id is known before the file leaves; `withChangeGroup` + `restOrQueue`'s `{ queue: true }` is the existing answer to "a write whose host is itself only queued", built for the note-on-an-upload-form case (`outbox.ts`'s own comment). The attachment queues behind its document and FIFO does the rest.

The `＋` / commit grammar is the notes composer's, deliberately: two content types on one form should not have two idioms for "add another".

**Amended same day (session 225) — the slot pays NOTHING until it holds something, and the mockup is why.** The paragraph above describes both entrances as present, and drawn that way the empty slot measured **86px** ([`notes-and-documents-in-context-v1.html`](../../mockups/notes-and-documents-in-context-v1.html) §1) — a header, an empty-state line and two buttons, on the form ADR-0155 already measures at ~1565px against ~675px of visible phone. That is a fixed toll on every booking, paid for a capability most bookings will never use.

So the empty state is **one control** (`📎 צירוף מסמך`, 40px). The header, the chip list and the split into pick-vs-upload appear only once something is attached. **Saves 46px on the common case**, and the attached case is unchanged: a chip is ~34px and the cost stays linear (143px at two, 223px at four).

This is the same measurement ADR-0152 §6b made for notes and the same conclusion — it rejected a held-open `textarea` per note at ~62px each, for a slot whose common case is nought or one. Two content types on one form, one rule: **the composer is small until there is something to compose with.**

**Amended on contact with the code (session 230, the build) — two things this section got slightly wrong, both small and both worth stating rather than leaving for a reader to rediscover.**

- **The uploader is reused with ONE added prop, not literally "unchanged".** `DocumentUploadSheet` now takes an optional `onUploaded?: (documentId: string) => void`. The reason is the ADR's own §5: the upload is outbox-first, so the new document is not in `documents` until the flush lands, and the sheet was the only thing that knew the id it minted. A callback is the smallest possible extension and the Index's uploader passes nothing, so its behaviour is untouched — but "unchanged" was the wrong word, and the alternative it was guarding against (a forked "attach and upload" variant) is still correctly rejected.
- **Variant D's single control opens the PICKER, and the picker carries the upload entrance too.** Drawn as one control, the empty state has to reach both entrances or it is a dead end on a trip that has no documents yet — which is exactly the trip where someone attaches their first one. So the picker sheet's primary action is `העלאה`. The split into two side-by-side entrances still appears only once something is attached, which is what the 40px measurement was actually buying.

### 6. An attachment never widens visibility

A `Document` may be owned (`ownerUserId`, "absent = group doc"). Attaching it must not turn a private document into a group one. The host surface resolves its attachments **through the document list the reader already has**, so an attachment whose document the reader cannot see resolves to nothing and renders nothing — an absence, not a stub or a placeholder, which is the same truthful degradation `noteHost` chose for an unresolvable host (ADR-0152's `lib/notes.ts`). The picker likewise offers only documents the reader can see. Nothing about ADR-0015/0034's trust model changes; this ADR adds a pointer, not a permission.

### 7. The client owes a detach derivation, because the cascade is silent

Third instance of a rule this repo has now written twice: a database cascade removes rows **without writing `Change` rows** (ADR-0152 §2), so a peer holding the trip in memory or Dexie never hears that a deleted booking's links are gone. `dropAttachmentsForHostChange` joins `dropNotesForHostChange` and `clearPlaceRefsForChange`, registered in the same two places a change is mirrored — the memory channels in `state/trip-state.tsx` and `CACHE_CHANNELS` in `lib/cache.ts` (ADR-0094).

ADR-0157 §3 already generalized this: **when a schema says `Cascade` or `SetNull`, the client owes a local derivation off the parent's change.** This is that rule's third consumer, and it needed no new thinking — which is the evidence the rule was worth writing down.

The undo half transfers too: an event delete captures its link rows at the delete (there is nowhere to read them from afterwards) and re-creates them under their original ids on the undo, exactly as ADR-0152 §2's amendment does for notes. A **booking** delete still has no undo, so nothing is owed there.

**Amended in the build (session 230): the derivation owes the DOCUMENT half too, and this section only asked for the host half.** §1 declares three cascades and this section reasons about two of them. `document → Cascade` is exactly as silent as the host ones, so `dropAttachmentsForHostChange` handles a deleted document as well — matching on `documentId` rather than through `ATTACHMENT_HOST_FIELD`, which cannot name it because a document is not a host. §6's resolution would already render those links as nothing, so the visible bug was small; what it would have left is a **count that lies**, which is the same class of defect the notes cascade exists to prevent.

### 8. Nothing to migrate

Purely additive: no document has a host today, so there is no existing data to interpret. The new table starts empty and every existing document keeps behaving exactly as it does now — trip-scoped, in the documents list, attached to nothing.

### 9. What this does NOT do

No attachment from the Documents side ("attach this to…" on a document's manage sheet) — one entrance for now, and a second one later must reach the same link rather than becoming a second mechanism. No attachment to a `MaybeItem` or to another document. No auto-attachment (a boarding-pass PDF is not parsed and matched to a flight — that would be a strategy under ADR-0151/ADR-0152 §8, and none is registered). No change to encryption, download, MIME allowlist, or the pre-save preview and read-reliability work of workstreams G1/G2, which own document _viewing_ and are untouched here.

## Reuse audit (ADR-0096 / root `CLAUDE.md` rule 8)

- **The context derivation** — `lib/host-context.ts` from ADR-0172, called, not copied. This is the single most important line of this audit.
- **The uploader** — `DocumentUploadSheet`, reused as-is from a second call site rather than an "attach and upload" variant of it.
- **The queue-behind-a-queued-host discipline** — `withChangeGroup` + `restOrQueue`'s `{ queue: true }` (`lib/outbox.ts`), which exists for precisely this shape.
- **The silent-cascade family** — `dropNotesForHostChange` / `clearPlaceRefsForChange` (§7), extended by a third member rather than a per-entity branch.
- **The sync substrate** — one `ENTITY_TYPE` constant, one field in `tripSnapshotSchema`, one memory channel, one `CACHE_CHANNELS` entry, outbox verbs through the existing `outboxOpToCacheChanges` path. ADR-0058 is the template; nothing new is invented.
- **The rows and sections** — `ListRow`/`RowManageSheet` and the existing document row presentation, not a bespoke attachment row.
- **Net-new**: the `DocumentAttachment` model, its schema, its service/controller module, `lib/attachments.ts`, and the host-form attach slot.

**Three more, found while building (session 230) — all of them one-offs generalized rather than copied, which is what rule 8 actually asks for:**

- **The scope guard.** `assertNoteHostInTrip` checked "whichever of these five references are set, are they in this trip", which is precisely what an attachment needs for its host **and** its `documentId`. It is now `assertEntityRefsInTrip` (`common/trip-scope.util.ts`), one guard with two consumers rather than a near-copy in a second service — and it gained the direct spec `backend/CLAUDE.md` asks a shared guard util to carry.
- **The pending-upload merge.** `DocumentsSection` composed "the documents this device can see, queued ones included" inline when it was the only reader. The picker is the second, and it is the case that needs it most — a document you just uploaded from a booking's own form is the one you want to attach — so it moved to `lib/documents.ts`'s `withPendingUploads`.
- **The two unique constraints**, which are a schema detail worth writing down because they look redundant: `@@unique([documentId, eventId])` and `@@unique([documentId, bookingId])` rather than one over three columns. Postgres treats NULLs as distinct, so each binds only the rows where its host is actually set and between them every row is covered. What they buy is that a double-tap on the picker is a duplicate-key hit the service reads as **already attached** — the same answer a replayed outbox op gets from the client-generated id, by a different route.

## Consequences

- **One schema migration** (the `DocumentAttachment` table, its two host FKs and its indexes). No data migration (§8).
- **A new syncable entity**, which is the real cost of this ADR against ADR-0172's zero: a snapshot field, a memory channel, a cache channel, outbox verbs and appliers. ADR-0058 sized this shape once already.
- **ADR-0047 §4 is reversed** (§header), and `docs/architecture/data-model.md` gains the relationship it explicitly said did not exist.
- **`BookingSheet` and `EventForm` each gain a slot**, on forms that ADR-0155 already notes are tall (`BookingSheet` reaches ~1565px with a round trip). The slot is a chip list plus one control, the same compact shape the notes composer settled on, for the same reason.
- **Deleting a booking no longer needs to warn about documents** (§3) — and does still need to warn about notes, which is a distinction the two confirms now have to keep straight.
- **A document may now be attached in several places**, so the documents screen's rows can no longer be read as "belongs to the trip and nothing else". Surfacing _where_ a document is attached, from the document's own side, is deliberately deferred (§9).
- **A place surface can show documents nobody can attach there** (§4). Accepted: it is the owner's explicit rule, and the alternative — hiding inherited documents because the surface has no attach control — throws away the read the feature exists for.

## Alternatives considered

- **Nullable host FKs on `TripDocument`**, mirroring `Note`'s shape. Cheapest possible change: one migration, no new entity, no sync channel. Rejected (§1): the correct cascade becomes a special case (`SetNull`, remembered by hand) instead of the default, and one confirmation PDF covering a round trip's two bookings has to be uploaded twice.
- **One shared host/attachment abstraction for Notes and Documents.** The most consistent-looking answer, and the one session 224 flagged as genuinely open. Rejected (§2): it forces Notes into a migration ADR-0172 proves unnecessary, and it forces Documents onto a cascade that destroys files. The thing worth sharing is the derivation, and that _is_ shared.
- **Attaching from the Documents side** ("attach to…" on the document's manage sheet). Much cheaper — the shipped upload flow is untouched and it is one picker in one place. Rejected as the _primary_ entrance (§5): the common case is uploading a boarding pass while adding the flight, and that becomes two journeys. Kept as a later second entrance into the same link (§9).
- **A `placeId` host on the attachment**, so a place could originate one. Rejected on the owner's explicit rule 4 — and independently by ADR-0172 §3's leak argument, which applies unchanged.
- **Auto-attaching by parsing uploads** (a boarding pass finds its flight). Out of scope (§9) and the wrong layer: that is a strategy under ADR-0152 §8's reserved contract, not a property of the link.
