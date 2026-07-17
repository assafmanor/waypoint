# 0052 — Document lifecycle: mobile-first viewing, manage (delete/rename/replace), and upload/load feedback

**Status:** Proposed
**Date:** 2026-07-17
**Refines:** [0047](0047-booking-event-linkage-and-notes.md) (§4 documents = one row per file, independent of bookings — this adds their lifecycle), [0049](0049-index-tab-mode-and-lifecycle.md) (§3 documents are a user-managed section with an add affordance — this makes "managed" mean editable), [0015](0015-document-encryption-server-side.md) + [0034](0034-document-encryption-trust-model.md) (encrypted-at-rest storage the delete/replace paths must respect), [0017](0017-mobile-first-device-targets.md) (phone-primary — why the PDF path changes)

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
