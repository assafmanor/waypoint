# 0052 — Document lifecycle: mobile-first viewing, manage (delete/rename/replace), and upload/load feedback

**Status:** Proposed
**Date:** 2026-07-17
**Refines:** [0047](0047-booking-event-linkage-and-notes.md) (§4 documents = one row per file, independent of bookings — this adds their lifecycle), [0049](0049-index-tab-mode-and-lifecycle.md) (§3 documents are a user-managed section with an add affordance — this makes "managed" mean editable), [0015](0015-document-encryption-server-side.md) + [0034](0034-document-encryption-trust-model.md) (encrypted-at-rest storage the delete/replace paths must respect), [0017](0017-mobile-first-device-targets.md) (phone-primary — why the PDF path changes)

## Amendment (2026-07-18, Assaf triage) — the "⋯" menu is trimmed to Edit · Delete

Walking the shipped documents section, Assaf found §2's four-row "⋯" (rename / change type / replace file / delete) to be more control than a small-group app needs: "לא צריך כל כך הרבה אפשרויות בשלוש נקודות, רק עריכה בסיסית מחיקה." The menu is trimmed:

- **The "⋯" menu becomes exactly two rows: Edit · Delete** — matching the booking row's "⋯" (ADR-0053) so the two managed lists in the Index read the same.
- **"Edit" opens one small edit sheet** that **renames and changes the type** together (metadata), rather than "rename" and "change type" as two separate menu steps.
- **"Replace file" is dropped** from the UI. To swap the underlying file, delete and re-upload. The backend `PATCH :documentId` for **metadata** (title/type) and `DELETE :documentId` (§2) stand; the **replace-file (multipart PATCH) variant is deferred** — not built unless delete-and-re-upload proves insufficient in practice.
- Everything else in this ADR is **unchanged**: mobile-first viewing (§1), the one-line row (§1a), the guarded delete confirm (§3), the shared spinner (§4), cause-aware errors + pre-upload validation (§5), and the four distinct type badges (§6).

Implementation note: `ui/DocumentManageSheet.tsx` currently implements all four as separate steps (`mode === 'menu'`, lines 86-123). The change is to collapse the menu to Edit · Delete and make the Edit step a single rename+type sheet, removing the replace-file row (`:100-105`, `:112-121`) and its `updateDocument({}, file)` call.

The rest of this ADR (below) stands.

## Context

The documents section shipped (#127) with **upload + view only**. Walking the live screen (session 2026-07-17, `docs/planning/2026-07-17-session-27-index-post-build-issues.md`) surfaced that "managed list" was only half-true: you can add and open a document, but you cannot open a PDF on a phone, cannot rename / delete / replace anything, get no motion while uploading or loading, get one generic failure message, and passport vs. visa share a pictogram. ADR-0047 §4 settled the _shape_ of documents (one row per file, grouped by type) and ADR-0049 §3 called them a section "the user fills directly" — neither settled what you can _do_ to a document after it lands. This ADR does.

The constraint that shapes everything here: documents are **encrypted at rest** (ADR-0015/0034) and served only through the auth-guarded `/content` route as a blob — there is no public URL, so viewing and managing both go through fetched blobs, and deletion must remove the blob, not just the row.

## Decision

**1. Viewing is mobile-first: never make an embedded preview the only way to open a file.** A PDF `<iframe src=blob:>` does not render on mobile Safari / installed-PWA WebViews (the primary target, ADR-0017), so the current viewer is blank for the most common document type. The contract becomes:

- **Images** — shown inline when the browser can decode them. But a browser-**undecodable** image is treated exactly like a PDF (below), never left as a blank `<img>`. The live case that surfaced this (Assaf's "בתמונה", clarified 2026-07-17 as _uploading an image document_): an iPhone photo of a passport is usually **HEIC**, which `accept="image/*"` lets you pick and `mimeType.startsWith('image/')` routes to `<img src=blob:…heic>`, which most browsers render blank — the image twin of the PDF-iframe bug. So the viewer must (a) detect a decode failure (`img.onerror`) and fall back to open/download, and (b) render the image sized to fit + EXIF-oriented (`image-orientation: from-image`, already the browser default) so a portrait phone scan isn't cut off or sideways. Client-side pre-upload conversion of HEIC→JPEG is a possible enhancement, not required by this decision.
- **PDFs and everything else** — the primary actions are **open in a new tab** (hand the blob URL to the browser/OS, which routes it to the right app) and **download/share**. An inline `<iframe>` PDF preview may be layered on _as a desktop enhancement only_, gated on a capability/viewport check — never the sole path.

This generalizes the viewer's existing "unknown type → download link" branch: the fallback is driven by _can the browser actually render this blob_, not by MIME family — so a HEIC image and a PDF land in the same open/download path.

**1a. The document row is one line.** Name, size, lock, and the "⋯" trigger share a single vertically-centered row (`mockups/index-fixes-v1.html`), rather than dropping the size to a muted second line under the name — once the row gains a "⋯", a mid-row-centered trigger floating between two text lines reads as misaligned. Size moves beside the lock/⋯ on the name's line.

**2. Documents are fully manageable: rename, change type, replace the file, delete — at both layers.** The backend gains the missing routes on `documents.controller.ts` (today only `GET` list / `POST` upload / `GET :id/content`):

- `PATCH :documentId` — edit metadata (`title`, `type`).
- `PATCH :documentId` with a new multipart file — **replace**: re-encrypt and swap the blob, keeping the same row id (so the optimistic list entry, and any future reference, survives).
- `DELETE :documentId` — remove the row **and** the encrypted blob (ADR-0015/0034 — no orphaned ciphertext).

The frontend surfaces these as a **"⋯" menu per document row** (and in the viewer header): rename / change type / replace file / delete.

**3. Deleting an encrypted document is guarded.** It is irreversible (the blob is gone, and documents are the durable record you keep _after_ the trip — ADR-0049 §2), so delete requires an explicit confirm, consistent with the guarded posture hard commitments get (ADR-0011). This is a plain confirm, not the booking delete/unlink two-choice prompt — a document has no linked entity to unlink from (ADR-0047 §4).

**4. Every async document action has a motion state, from one shared spinner.** Upload shows a busy Save button ("מעלה…" + spinner, sheet held open and dimmed) and, where the transport allows it, a determinate bar; the viewer and the list show a spinner/skeleton while the blob/list loads. A single small spinner/skeleton component is introduced (the app has none today) and reused across all three call sites.

**5. Errors are cause-aware and pre-emptive.** Replace the single generic "ההעלאה נכשלה" with messages keyed to cause — too-large (state the limit), unsupported type (state the accepted types), offline (the offline copy), otherwise a generic retry. Validate **size and MIME on pick**, before the upload round-trip, so an oversized file fails instantly rather than after a long transfer. A failed upload keeps its sheet open with values intact for a one-tap retry. On the **list**, distinguish a real fetch error from offline rather than showing the offline copy for both.

**6. The four document types get four visually distinct badges.** `passport` and `visa` currently map to 🛂 / 🛃 — the same signage pictogram, indistinguishable at badge size, which the design language forbids for peer categories (distinct meaning, distinctly encoded — ADR-0028 applied to glyphs). Pick four glyphs distinct at ~17px; the empty-state illustration reads from the same `DOCUMENT_TYPE_ICON` constant instead of a hardcoded literal. Approved set (Assaf, 2026-07-17): **passport 📕 · insurance 🛡️ · visa 🎫 · other 📄**. The invariant is "four unmistakable badges, one source."

## Consequences

- **Backend:** two new routes (`PATCH`, `DELETE`) on the documents controller + service, both blob-aware (replace re-encrypts; delete removes ciphertext). Mirrors the CRUD completeness bookings already have.
- **`@waypoint/shared`:** an `updateDocumentSchema` (title/type, optional file) alongside the existing create schema.
- **Frontend:** the viewer's PDF branch changes to open/download; a per-row "⋯" menu + a manage/rename sheet (can reuse the upload sheet's chrome); the shared spinner; pre-upload validation; cause-aware error copy in `he.ts`; the icon-set fix.
- **Progress bars need `XMLHttpRequest`.** `fetch` (used by `uploadDocument`) can't report upload progress; a determinate bar requires XHR (or chunked upload). The busy state (spinner + label) works with `fetch` today and is the floor; the bar is the target where XHR is wired.
- **Offline:** documents are not in the trip snapshot and not offline-syncable today (they fetch their own list); this ADR does not change that — delete/rename/replace are online actions like upload. (A future pass could bring them under the outbox, ADR-0042, but that's out of scope here.)
- **No data-model change.** `Document` is unchanged (ADR-0047 §4); this is operations + presentation only.

## Alternatives considered

- **Keep the inline PDF `<iframe>` and just add a "download" fallback link.** Rejected: on the primary target the iframe is blank, so the "fallback" is actually the only working path — better to make open/download primary and treat inline preview as the desktop extra.
- **A dedicated in-app PDF renderer (e.g. pdf.js).** Rejected for now: a heavy dependency for a small-group app when the OS already has capable PDF viewers; open-in-new-tab hands off to them for free. Revisit only if hand-off proves inadequate.
- **Delete without a confirm (like a soft event's quick actions).** Rejected: an encrypted document is irreversible and kept as the post-trip record; it warrants the same guard a hard commitment gets (ADR-0011).
- **A two-choice delete prompt like bookings (ADR-0047 §3).** Rejected: that prompt exists to unlink a _linked event_; a document has no linked entity (ADR-0047 §4), so a plain confirm is the honest shape.
- **Leave 🛂/🛃 (they are different codepoints).** Rejected: different codepoint, identical pictogram at badge size — the confusion is real and the fix is a one-line constant change.
- **Per-type animated illustrations / richer feedback.** Deferred: one shared spinner clears the "looks frozen" problem; bespoke motion is polish for later.

## Amendment (2026-08-13, session 259) — eight types, and the form opens on none of them

Reported from use: _"document creation should not auto select its category, as currently it defaults to passport while most documents aren't"_, and _"we're still missing some basic document categories such as tickets (flight, train, rsvps, various activities)"_. Both halves are the same defect seen from two ends — §6 settled what four badges should look like and never asked whether four was the right number, and the upload form answered the question for you with the least likely answer.

**1. The set is eight: passport · visa · license · ticket · reservation · insurance · health · other.** `DOCUMENT_TYPE` (`@waypoint/shared`) declares them in that order — identity, then what you present on the way, then cover, then the leftover — and that order IS the display order for the picker grids and the Index's groups, so it is stated once rather than beside a second display list. The four new ones each name something the old set filed as "אחר":

- **`ticket` (כרטיס)** — the boarding pass, the rail ticket, the museum entry. The most common attachment a booking has (ADR-0173) and the one the report named.
- **`reservation` (הזמנה)** — the confirmation, which is not a ticket: a hotel booking, a restaurant table, an RSVP. Its label is the app's own word for a booking, so the document and the row it hangs off read the same.
- **`license` (רישיון)** — a driving licence / IDP. `passport` already covers the identity document you cross a border with; what it does not cover is the one a car hire asks for (ADR-0162).
- **`health` (בריאות)** — vaccination records and prescriptions.

Not added: `receipt`. Expenses are a domain of their own and a receipt filed as a document is a guess about a feature that does not exist yet.

**2. §6's invariant costs `visa` its glyph.** "Four unmistakable badges, one source" becomes eight, and `🎫` — which §6 gave the visa — is what a ticket obviously is. So `visa` takes **🛂**, which §6 could not use while the passport was also a signage pictogram and can now, because the passport is 📕. New: `license 🪪 · ticket 🎫 · reservation 🧾 · health 💉`.

**3. The upload form opens with nothing selected, and unanswered means `other`.** `ChoiceGrid` has taken an optional value since ADR-0109 §11, so an unanswered single-select is the primitive's own documented state. It is deliberately **not** a refusal (ADR-0150): a document you have not classified is exactly what `other` has always meant, and stopping a save to make someone name it would be the app asking a question it can live without. The manage sheet's edit step still opens on the document's current type — that one is an answer, not a default.

**4. One picker, not two.** With eight cards the grid needs `columns={3}` (the booking type picker's answer to the same count) and both sheets need the same one — so the options list, the column count and the label are `ui/DocumentTypeGrid.tsx`, rendered by the upload sheet and the manage sheet's edit step. Two copies of an eight-card grid is how two modes start disagreeing about what a type picker is.

**5. No backfill.** Additive enum values (Postgres cannot remove one without rewriting the type), and nothing stored distinguishes an existing `other` that is really a ticket. Existing rows keep their type; re-typing one is one tap in the edit sheet.

## Amendment (2026-08-13, session 260) — one row, a badge that is not a page, and a search

Three reports against the session-259 amendment above, from the owner, on the built surface:

> "הזמנה and אחר use the same emoji - big no no"

> "There used to be only one line of categories to select from, now there's 3. It looks ugly and is hard to use. See how the app handles this and what fits best for the documents."

> "Also add search like bookings and notes have (where category titles are also shown)"

The first two are the same failure from two ends, and it is a failure of **scaling what was already there** rather than asking whether the shape survives the new count: §4 above went from a 4-up card grid to `columns={3}` without asking what three rows cost, and §2 above added a fifth paper glyph to a set whose stated invariant is that the badges are unmistakable. Both were settled by drawing them — [`mockups/document-types-in-one-row-v1.html`](../../mockups/document-types-in-one-row-v1.html) — and every number below is read off that page's rendered DOM.

**6. `reservation` is 🛎️, and §2's 🧾 is withdrawn.** 🧾 and 📄 are different codepoints and **one silhouette** — two white pages — which is invisible in `DOCUMENT_TYPE_ICON`'s source and unmissable at the **36px** a `.wp-listrow-badge` actually is. The pair was not even novel: `packages/shared/src/icons.ts` offers both in its _services_ group as two options for one idea, which is where the collision came from. 🛎️ is used by no other table in the app, has no silhouette twin in this set, and covers all three things `הזמנה` means: a hotel, a table, an RSVP. `other` keeps 📄, because a blank page is the right mark for a document nobody classified and it is `BOOKING_TYPE_ICON`'s fallback too. **📅 was the runner-up and is refused on sight**, because `Icon.tsx` already retired it from its two jobs and re-introducing it as a third meaning is what that change undid. The mockup's §2 renders all eight badges at 36px in one strip, because a badge is never read beside its own label; it is read beside the other seven.

**7. The picker is a pill ROW, and §4's grid is withdrawn.** The app already runs this control at a **larger** count: `CategoryField` (ADR-0109 §11) puts **nine** `EventCategory` options in one horizontally-scrollable row, and `ChoiceGrid`'s own doc comment names the reason ("too many options for a fixed grid on a narrow phone"). So `ui/DocumentTypePills.tsx` is that mechanism's third host — one `layout="pills"` inside the shipped `.category-pills` density wrapper — and the whole change carries **no CSS**.

The report said "ugly and hard to use", which sounds like taste. Measured at 360×640 it is arithmetic: `.booking-sheet` caps at `80vh` with `overflow-y: auto`, the grid made the upload body **652px against a 488px cap**, and the sheet therefore opened with **140px to scroll before `העלה`** — with the file tiles, the one field the form cannot be saved without, below the fold. The row is **38px** against the grid's **202px**, and needs **0px** of scroll. Two things arrive with it: the selected pill centres itself (`useCenterSelected`), which is what makes the manage sheet open **on** the document's current type instead of three rows down, and the eight Hebrew document labels are the _shorter_ set — **713px** of scroll against the nine shipped category pills' **806px**.

**Known and deliberately unresolved:** `.category-pills .choice-pill` measures **36px** against ADR-0017's 44px floor, here _and_ on the shipped event-category selector. Room is not the obstacle (at 44px the document row is 46px and still needs no scrolling); the obstacle is scope, since raising the shared wrapper moves `EventForm`, `NoteSheet` and `MapPlaceForm`, whose card height is arithmetic (ADR-0148 §1). Left as a control in the mockup and a line in the backlog rather than decided in passing.

**`disclosure` is not offered on the upload form**, and ADR-0183's own 2026-08-13 amendment is why: it made `NoteSheet`'s `disclosure` exactly `note !== undefined`, because the collapse was built for **re-filing something already saved**. An upload form is a create by definition, and after §3 above it opens on nothing, so collapsing it would be a tap to open, a tap to close, and no earlier answer to show.

**8. The section gets a type-chip row and a search.** Both shapes are the ones the two sibling Index screens already ship, and the brief's parenthetical settles the one thing they disagree about: the chip **density**. `IndexBookingsView` renders worded pills, `IndexNotesView` renders them `compact` (glyph + count, the word surviving only as `aria-label`, ADR-0122 §2) — "where category titles are also shown" is the bookings one. So: `.filter-row` with worded `ChoiceGrid layout="pills"` chips (`הכל` + total, then one chip per type that **has** a document, ADR-0101) and the shared `.search-icon-btn`, then `SearchOverlay` — whose own header comment has named a document search as its next consumer since ADR-0101.

**The type-grouped list stays** (owner's call, against a recommendation to let the chips replace it). Its price is measured and accepted: **195px** on twelve documents, in six group headings and six card frames, and the type stated twice while a chip is lit. Its dividend was not forecast — because the screen keeps `.doc-group`, the **search results reuse the screen's own grouped renderer** rather than growing a shape of their own, so the category title the search was asked to show is the heading that already exists, and the whole search ships **zero new CSS**. ADR-0098 §2 ("the documents screen keeps its present type-grouped list as-is") therefore stands.

**What a query matches** is the shape `index-bookings.ts` established: the title, **the type label singular and plural**, and a synonym list (`docs.typeSynonyms`). The type label is the half the report asked for by name — typing `כרטיס` finds every ticket — and it matters more here than for a booking, because a document's title is very often just its type and the thing being hunted is "the boarding pass", not a name anybody chose.

**The synonym table is generous, and two rules govern what may join it** (widened on the owner's call the same day, from a first sparse pass — _"add more synonyms, like רכב אוטו for car rental, ביטוח בריאות for health"_):

- **The match is `term.includes(query)`, not the reverse.** That asymmetry is what makes partial typing work and it is what makes the table cheap: a LONGER, more specific term is nearly free (`ביטוח בריאות` on `health` is reached by `ביטוח`, by `בריאות`, and by nothing it does not contain), while a SHORT term is the one to think about, because every prefix of it now matches. It also means a word already in the label or its plural does not belong here — both are already search terms.
- **A word belongs to a type only if someone typing it wants THAT type's documents.** Bookings learned this the expensive way (leaving the car words on `transit` made every bus answer a search for `השכרת רכב`), so `other` carries none by definition. Note what this test is NOT: uniqueness. `ביטוח` legitimately reaches both the travel policy and the health cover, because both answers are wanted.

One consequence is recorded rather than fixed: **`רכב` is a prefix of `רכבת`**, so the car hire and the rail ticket answer the same query. Exact-word matching would fix it and break partial typing on everything else, so it is pinned in `lib/documents.test.ts` as known behaviour instead.

**Two mechanisms, and neither is new:**

- **Nothing is filtered out of an array.** `visibleDocumentGroups` marks rows through the app's one reveal (ADR-0120) and — the part that is easy to get wrong — **keeps a group whose rows all fail the predicate**, with `visible: 0`, so the caller can _collapse_ it. `groups.filter((g) => g.docs.length > 0)` would pop a heading and a card frame out with no animation while the rows beside them collapse, which is the one-off ADR-0120 exists to end. The group rides `RevealRow`, exported since ADR-0120 and until now used only by its own test; its rows ride `RevealList`. The stagger is continuous across groups via `revealRows`'s `startIndex`/`nextIndex`, so eight groups reveal as one list rather than eight lists each restarting the delay at zero.
- **Back peels the filter before it leaves** (ADR-0102), and that handler is shared with the header's back arrow (ADR-0103's "one dismissal, one path"). This is why the filter's state lives in `IndexDocumentsView` and not in `DocumentsSection`: the screen's single `useBackLayer` replaces the plain `useOverlay(onClose)` it had while it had nothing to peel, and the section is told the filter and reports changes. The section keeps the chips, because it is the half that knows the counts. **Search spans every type regardless of the chip** (ADR-0102): it is an escape hatch from the filter, not a continuation of it.

**Test harness note:** `wrapNav` gained an opt-in `mode` flag rather than a fourth open-coded provider stack — a `SearchOverlay` host needs `ModeProvider` for the overlay's chrome tint, and `IndexNotesView.test.tsx` already had that four-provider `wrap` copied locally. Opt-in rather than default because `ModeProvider` itself calls `useTrip()`, so only a test with a trip can mount it.
