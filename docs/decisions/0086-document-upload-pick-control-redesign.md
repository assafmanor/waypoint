# 0086 — Document upload: a designed pick control (drop-zone, capture, file preview)

**Status:** Proposed
**Date:** 2026-07-19
**Refines:** [0052](0052-document-lifecycle-view-manage-and-feedback.md) (documents lifecycle — this replaces the one part it left as raw browser chrome: the file-pick control §4/§5 sit _around_), [0017](0017-mobile-first-device-targets.md) (phone-primary — why capture is a first-class path), [0028](0028-adopt-design-language.md) (the semantic-color + hard/soft grammar the control must obey)

Mockup: [`mockups/document-upload-v1.html`](../../mockups/document-upload-v1.html).

## Context

The document upload sheet (`ui/DocumentUploadSheet.tsx`) reuses the booking sheet's form chrome for its type selector, title field, actions, progress bar and errors (all designed in ADR-0052). But the **file-pick control itself was never designed** — it is the browser's native `<input type="file">`, rendered as the OS "Choose File · No file chosen" button (`.doc-upload .bs-field input[type='file']`). Walking the live sheet on a phone (2026-07-19, Assaf), that control is the eyesore: it is left-aligned LTR inside an RTL sheet, its label is the browser's English, it gives no hint of what is accepted or how big a file may be, it shows no preview of what you picked, and it looks nothing like the rest of the app. ADR-0052 designed everything that happens _after_ a file is chosen (validate-on-pick, busy Save, determinate bar, cause-aware errors, four badges); it explicitly left the picker as "reuse the upload sheet's chrome," and the chrome it reused was the raw input.

This ADR designs the pick control. Nothing about the upload _pipeline_ changes (outbox flush ADR-0056, encryption ADR-0015/0034, idempotent create) — this is presentation of the pick + picked-file states only.

## Decision

**1. The empty pick target is a designed drop-zone, not the native button.** A full-width tap target: dashed `--soft-line` border, an upload glyph, a primary line (`בחרו קובץ`) and a hint line stating the contract (`תמונה או PDF · עד 10MB`) — the accepted types and the size cap (ADR-0052 §5's limits) are shown _before_ the pick, not only in the error after a bad one. Tapping it opens the OS file picker (the real `<input type="file" accept="image/*,application/pdf">` stays — it is moved off-screen and driven by the zone, so the accept filter and all existing wiring are unchanged). Active/hover tightens the border to `--cta` and tints the fill; the zone is a neutral CTA, so it uses `--cta`/ink — **not** amber or teal, which stay reserved for time/commitment and location (ADR-0028, CLAUDE.md rule 4).

**2. Capture is a first-class second path (phone-primary, ADR-0017).** The most common document is a passport, and on a phone the natural act is to photograph it, not to hunt through Files. Below the drop-zone a distinct `צלמו עכשיו` capture button drives a second hidden input carrying the `capture` attribute (`accept="image/*" capture="environment"`), which opens the camera directly on mobile. On a device with no camera the button is simply absent (feature-detected), so desktop degrades cleanly. Both paths land in the same `pick(file)` → validate → preview flow.

**3. A picked file shows a preview card, replacing the zone.** Once a file is chosen the drop-zone is swapped for a horizontal preview: a **thumbnail** (a rendered `objectURL` for a decodable image; a distinct PDF tile for a PDF or an undecodable image — the same "can the browser render this blob" test ADR-0052 §1 uses for viewing, applied to the thumbnail), the filename (LTR, ellipsized), a `type · size` sub-line, and a single ✕ to clear back to the empty zone. Clearing revokes the objectURL. "Replace file" stays out of scope (ADR-0052 amendment — swap = clear + re-pick).

**4. The sheet gains a title row whose icon tracks the chosen type.** A `titlerow` (icon tile + `העלאת מסמך`) like the booking sheet, where the icon is the selected type's badge (📕/🛡️/🎫/📄, ADR-0052 §6) — so the header reflects the choice made in the type selector directly below it, and the sheet stops opening as an untitled stack of controls.

**5. The picked/uploading/error states layer onto the preview, reusing ADR-0052's pieces unchanged.** Uploading swaps the ✕ for the shared spinner and shows the determinate `.progress` bar under the card; a validation failure (too-large / wrong-type) renders the existing cause-aware `.bs-error` beneath the zone and keeps the sheet open with values intact. No new feedback primitives — this decision is the pick surface those primitives now sit on.

The field order becomes: **title row → type selector → pick zone (or preview) → name → actions**, so the sheet reads top-to-bottom as "what kind → the file → what to call it."

## Consequences

- **Frontend only.** `DocumentUploadSheet.tsx`: the native `.bs-field` file input becomes an off-screen input driven by a designed `.dz` drop-zone + a capture input + a `.dz-file` preview; a `titlerow` is added; `pick()` gains objectURL creation/revocation for the thumbnail. New CSS in `screens.css` (`.dz*`), authored from existing tokens; the `.doc-upload .bs-field input[type='file']` rule is removed.
- **No backend / shared / data-model change.** Same multipart POST, same `create` schema, same outbox op (ADR-0056), same encryption (ADR-0015/0034).
- **Copy:** new `he.ts` strings under `docs.upload` — `pick` (`בחרו קובץ`), `pickHint` (`תמונה או PDF · עד ${mb}MB`), `capture` (`צלמו עכשיו`), `remove` (`הסר`). The existing `fileLabel` is retired (the zone's own copy replaces it).
- **Capture is best-effort.** `capture` is honored on mobile browsers and ignored on desktop; feature-detection hides the button where there is no camera, so it never becomes a dead control.
- **objectURL hygiene.** The thumbnail creates a blob URL that must be revoked on clear/replace/unmount to avoid a leak — a small lifecycle the current raw-input sheet doesn't have.

## Alternatives considered

- **Keep the native input, just restyle its label.** Rejected: `input[type=file]`'s button is only cosmetically styleable across browsers/WebViews, can't show a preview or a thumbnail, and can't host a second capture path — the reliable route is an off-screen input driven by our own element, which every designed uploader uses.
- **One combined "camera or files" button.** Rejected: on iOS the native sheet already offers Photo Library / Take Photo / Choose File, but only when `capture` is absent; forcing everything through one input means either no direct-camera path or no files path. Two explicit affordances (zone = files, button = camera) are clearer and let each carry the right `accept`/`capture`.
- **Drag-and-drop as the primary interaction.** Rejected as the _primary_: phone-first (ADR-0017), where there is no drag. The zone accepts a desktop drop as a bonus, but its designed-for interaction is tap-to-pick / tap-to-capture.
- **Auto-crop / auto-enhance the captured photo (document-scanner style).** Deferred: valuable for passport scans but a much larger surface (edge detection, perspective correction); out of scope for making the pick control not-ugly. Noted in the backlog.
