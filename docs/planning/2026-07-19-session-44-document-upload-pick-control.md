# Session 44 — Document upload pick-control redesign (ADR-0086)

**Date:** 2026-07-19
**Outcome:** Shipped. ADR-0086 Accepted; mockup `mockups/document-upload-v1.html` merged (PR #189, mockup + ADR only) and then implemented.

## Problem

Walking the live document upload sheet on a phone, the file-pick control was the browser's raw `<input type="file">` — the LTR "Choose File · No file chosen" button, English, no preview, no accepted-types/size hint, nothing like the app. ADR-0052 had designed everything _around_ the picker (validate-on-pick, busy save, progress bar, cause-aware errors, four badges) but left the picker itself as raw chrome.

## What shipped

The redesign (ADR-0086), built as **reusable primitives** rather than sheet-local markup:

- **`ui/primitives/FilePicker.tsx`** (+ `file-picker.css`) — controlled pick control: two equal-weight tiles (`העלאת קובץ` + `צלמו עכשיו`) when empty, a preview card (thumbnail / decode-fallback file tile + name + size + clear) once picked. Owns the objectURL lifecycle and the image-decode fallback (ADR-0052 §1 applied to the thumbnail). Serves any attachment surface.
- **`ui/primitives/ChoiceGrid.tsx`** (+ `choice-grid.css`) — the icon/label single-select grid that was copy-pasted in **three** places. Now shared by `DocumentUploadSheet`, `DocumentManageSheet` (edit), and `BookingSheet` (create); the legacy `.bs-typesel`/`.bs-typecard` CSS is deleted.
- **`lib/bytes.ts` `formatBytes`** — promoted out of `lib/documents.ts` so `DocumentsSection` and `FilePicker` share one formatter (no documents coupling).
- **`FormActions` `busy`** — optional flag that shows the shared `Spinner` and blocks re-taps, so awaited submits stop hand-rolling a busy button (used by the manage-sheet edit).
- **`DocumentUploadSheet`** recomposed onto `Field` + `ChoiceGrid` + `FilePicker` + `FormActions`, field order **type → name → file**, a `titlerow` whose icon tracks the chosen type. Only the small `.du-head-*` header text stayed bespoke. The name is **not** derived from the filename; empty → the type label.

## Review feedback folded in (from the mockup + the impl walk)

1. **Name before file** (reading order type → name → file).
2. **Drop the person-name placeholder** (`למשל: דרכון · אסף` → neutral `שם לזיהוי המסמך`).
3. **Camera at equal weight** to upload (two peer tiles, not a secondary link).
4. **Capture visibility gate** switched from async `enumerateDevices` (can false-negative on a real phone and silently drop the camera path) to a synchronous `(pointer: coarse)` media query — shown on touch devices, hidden on desktop.

## Verified

`pnpm typecheck` + full frontend suite (543 → +tests for `ChoiceGrid`, `FilePicker`, `bytes`) + `lint` + `build` all green. Rendered the real sheet in an isolated harness (NavProvider + ToastProvider) and screenshotted: empty (desktop → single tile; touch → two tiles), picked (auto-filled name, decode-fallback tile, enabled CTA). No backend / shared / data-model change.

## Deferred

Captured-scan auto-crop / enhance (document-scanner pass) — backlog.
