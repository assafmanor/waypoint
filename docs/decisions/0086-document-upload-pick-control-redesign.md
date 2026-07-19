# 0086 — Document upload: a designed pick control (drop-zone, capture, file preview)

**Status:** Accepted
**Date:** 2026-07-19
**Refines:** [0052](0052-document-lifecycle-view-manage-and-feedback.md) (documents lifecycle — this replaces the one part it left as raw browser chrome: the file-pick control §4/§5 sit _around_), [0017](0017-mobile-first-device-targets.md) (phone-primary — why capture is a first-class path), [0028](0028-adopt-design-language.md) (the semantic-color + hard/soft grammar the control must obey)

Mockup: [`mockups/document-upload-v1.html`](../../mockups/document-upload-v1.html).

## Context

The document upload sheet (`ui/DocumentUploadSheet.tsx`) reuses the booking sheet's form chrome for its type selector, title field, actions, progress bar and errors (all designed in ADR-0052). But the **file-pick control itself was never designed** — it is the browser's native `<input type="file">`, rendered as the OS "Choose File · No file chosen" button (`.doc-upload .bs-field input[type='file']`). Walking the live sheet on a phone (2026-07-19, Assaf), that control is the eyesore: it is left-aligned LTR inside an RTL sheet, its label is the browser's English, it gives no hint of what is accepted or how big a file may be, it shows no preview of what you picked, and it looks nothing like the rest of the app. ADR-0052 designed everything that happens _after_ a file is chosen (validate-on-pick, busy Save, determinate bar, cause-aware errors, four badges); it explicitly left the picker as "reuse the upload sheet's chrome," and the chrome it reused was the raw input.

This ADR designs the pick control. Nothing about the upload _pipeline_ changes (outbox flush ADR-0056, encryption ADR-0015/0034, idempotent create) — this is presentation of the pick + picked-file states only.

## Decision

**1. The empty pick target is two designed tap-tiles, not the native button.** Two equal-weight tiles side by side — **`העלאת קובץ`** (upload) and **`צלמו עכשיו`** (capture) — each a dashed `--soft-line` tile with an icon + label, with the accept + size contract (`תמונה או PDF · עד 10MB`, ADR-0052 §5's limits) stated once beneath both, _before_ the pick rather than only in the error after a bad one. Each tile drives its own off-screen real `<input>` (so the accept filter and all existing wiring are unchanged — see §2). Active/hover tightens the border to `--cta` and tints the fill; the tiles are neutral CTAs, so they use `--cta`/ink — **not** amber or teal, which stay reserved for time/commitment and location (ADR-0028, CLAUDE.md rule 4). A desktop drag-drop onto the upload tile is accepted as a bonus, but tap-to-pick / tap-to-capture is the designed-for interaction (phone-first, ADR-0017).

**2. Capture is a first-class peer of upload, not a secondary link (phone-primary, ADR-0017).** The most common document is a passport, and on a phone the natural act is to photograph it, not to hunt through Files — so capture gets **equal visual weight** to file-upload, the two tiles as peers. Upload drives an `<input type="file" accept="image/*,application/pdf">`; capture drives a second input carrying the `capture` attribute (`accept="image/*" capture="environment"`), which opens the camera directly on mobile. The capture tile shows on a **touch / coarse-pointer device** (phone or tablet — `matchMedia('(pointer: coarse)')`) and is absent on desktop, where the upload tile spans the row. That media-query proxy is deliberately chosen over async camera enumeration (`enumerateDevices`): enumeration is asynchronous and can false-negative on a real phone before camera permission is granted, silently dropping the very path the redesign exists to promote — a synchronous pointer check never does. Both paths land in the same `pick(file)` → validate → preview flow.

**3. A picked file shows a preview card, replacing the zone.** Once a file is chosen the drop-zone is swapped for a horizontal preview: a **thumbnail** (a rendered `objectURL` for a decodable image; a distinct PDF tile for a PDF or an undecodable image — the same "can the browser render this blob" test ADR-0052 §1 uses for viewing, applied to the thumbnail), the filename (LTR, ellipsized), a `type · size` sub-line, and a single ✕ to clear back to the empty zone. Clearing revokes the objectURL. "Replace file" stays out of scope (ADR-0052 amendment — swap = clear + re-pick).

**4. The sheet gains a title row whose icon tracks the chosen type.** A `titlerow` (icon tile + `העלאת מסמך`) like the booking sheet, where the icon is the selected type's badge (📕/🛡️/🎫/📄, ADR-0052 §6) — so the header reflects the choice made in the type selector directly below it, and the sheet stops opening as an untitled stack of controls.

**5. The picked/uploading/error states layer onto the preview, reusing ADR-0052's pieces unchanged.** Uploading swaps the ✕ for the shared spinner and shows the determinate `.progress` bar under the card; a validation failure (too-large / wrong-type) renders the existing cause-aware `.bs-error` beneath the zone and keeps the sheet open with values intact. No new feedback primitives — this decision is the pick surface those primitives now sit on.

The field order becomes: **title row → type selector → name → pick tiles (or preview) → actions**, so the sheet reads top-to-bottom as "what kind → what to call it → the file it attaches to." The name is **not** derived from the filename (an imported filename is noise, not a title the group would recognize); left empty it falls back to the document **type label** (e.g. `דרכון`), which the schema's non-empty `title` requires and which never leaks the raw filename.

## Consequences

- **Frontend only, and factored into reusable primitives** (the implementation went further than one sheet, to avoid single-use copies):
  - `ui/primitives/FilePicker.tsx` (+ `file-picker.css`) — the controlled pick control (tiles → preview), objectURL lifecycle + image-decode fallback owned internally; serves any attachment surface.
  - `ui/primitives/ChoiceGrid.tsx` (+ `choice-grid.css`) — the icon/label single-select grid, now shared by **all three** selectors that were copy-pasted markup: `DocumentUploadSheet`, `DocumentManageSheet` (edit), and `BookingSheet` (create). The legacy `.bs-typesel`/`.bs-typecard` rules in `screens.css` are deleted.
  - `lib/bytes.ts` `formatBytes` — the byte formatter promoted out of `lib/documents.ts` so `DocumentsSection` and `FilePicker` share one, no documents coupling.
  - `FormActions` gained an optional `busy` (shows the shared `Spinner`, blocks re-taps) so awaited submits don't hand-roll a busy button — used by the manage-sheet edit.
  - `DocumentUploadSheet` now composes `Field` + `ChoiceGrid` + `FilePicker` + `FormActions` under `.booking-sheet` with a `titlerow` whose `.bs-icon` tracks the type; only the small `.du-head-*` header text is bespoke CSS.
- **No backend / shared / data-model change.** Same multipart POST, same `create` schema, same outbox op (ADR-0056), same encryption (ADR-0015/0034).
- **Copy:** a shared `filePicker` namespace in `he.ts` — `upload` (`העלאת קובץ`), `capture` (`צלמו עכשיו`), `remove` (`הסר`) — plus `docs.upload.pickHint` (`תמונה או PDF · עד ${mb}MB`), `typeLabel`, and `subtitle`. The old `fileLabel` copy is repurposed to the section label `קובץ`, and `titlePlaceholder` drops its person-name example (`למשל: דרכון · אסף`) for a neutral `שם לזיהוי המסמך` — the sheet shouldn't seed a real-looking name.
- **Capture is best-effort but reliably visible on phones.** The `capture` attribute is honored on mobile browsers and ignored on desktop; the capture tile's visibility gates on `(pointer: coarse)` (touch device), not camera enumeration, so a phone always shows it and a desktop never gets a tile that would just reopen the file dialog.
- **objectURL hygiene.** The thumbnail creates a blob URL that must be revoked on clear/replace/unmount to avoid a leak — a small lifecycle the current raw-input sheet doesn't have.

## Alternatives considered

- **Keep the native input, just restyle its label.** Rejected: `input[type=file]`'s button is only cosmetically styleable across browsers/WebViews, can't show a preview or a thumbnail, and can't host a second capture path — the reliable route is an off-screen input driven by our own element, which every designed uploader uses.
- **One combined "camera or files" button.** Rejected: on iOS the native sheet already offers Photo Library / Take Photo / Choose File, but only when `capture` is absent; forcing everything through one input means either no direct-camera path or no files path. Two explicit affordances (zone = files, button = camera) are clearer and let each carry the right `accept`/`capture`.
- **Drag-and-drop as the primary interaction.** Rejected as the _primary_: phone-first (ADR-0017), where there is no drag. The zone accepts a desktop drop as a bonus, but its designed-for interaction is tap-to-pick / tap-to-capture.
- **Auto-crop / auto-enhance the captured photo (document-scanner style).** Deferred: valuable for passport scans but a much larger surface (edge detection, perspective correction); out of scope for making the pick control not-ugly. Noted in the backlog.
