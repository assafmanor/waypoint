# Session 28 — Index post-build fixes: implementation handoff

**Date:** 2026-07-17
**Follows:** [session 27](2026-07-16-session-25-index-tab-and-booking-model.md) → the triage ([2026-07-17-session-27](2026-07-17-session-27-index-post-build-issues.md), PR #128, merged). This session **implements** the three Proposed ADRs that triage produced, now that Assaf has signed them off.
**Scope:** frontend + backend + `@waypoint/shared`; the three ADRs below. New PR off `main` (the triage PR is merged; this is fresh work — a new PR, not a reopen).

## The issues Assaf raised (verbatim groups)

**Documents**

1. Can't open a PDF (blank on mobile).
2. Can't edit a document at all — rename / delete / replace.
3. No upload animation.
4. No error message on a failed upload.
5. Passport & visa share an icon (forbidden).
6. No document-loading animation.
7. "בתמונה" → clarified: **uploading an _image_ document** (an iPhone HEIC renders blank).

**Bookings**

8. A booking "locks" after creation → it should show a read-only **detail view** + an edit **"⋯"** (3-dots) affordance, like events. Assaf's later refinement: a **visible edit button** too (top-left free corner), not only behind the "⋯".
9. Editing an **event linked to a booking** should behave like editing the booking — times **not limited to one day** (a hotel spans many days), and it **shouldn't be counted in the day glance**.

## The decisions we made (→ ADRs)

| #          | Decision                                                                                                                                                                                                    | ADR                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1, 7       | Viewing is mobile-first: a PDF **or a browser-undecodable image (HEIC)** opens in a new tab / downloads — never a blank embed. Driven by "can the browser render this blob", not MIME family.               | [0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md) §1         |
| 2          | Documents are fully manageable — **rename / change type / replace file / delete**, at both layers (backend `PATCH`/`DELETE`, frontend per-row "⋯"). Delete is guarded (encrypted, irreversible).            | [0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md) §2, §3     |
| 3, 6       | Every async document action has a **motion state** from one shared spinner (upload busy + bar, viewer/list load).                                                                                           | [0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md) §4         |
| 4          | Errors are **cause-aware** (too-large / wrong-type / offline / server) + pre-upload size/type validation; list distinguishes error from offline.                                                            | [0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md) §5         |
| 5          | **Four visually distinct** type badges — passport 📕 · insurance 🛡️ · visa 🎫 · other 📄 (approved); empty-state reads the same constant.                                                                   | [0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md) §6         |
| —          | Document row is **one line** (name · size · lock · "⋯").                                                                                                                                                    | [0052](../decisions/0052-document-lifecycle-view-manage-and-feedback.md) §1a        |
| 8          | Tapping a booking opens a **read-only detail view** with a **visible ✏️ edit button** + a "⋯" menu → edit/delete (parity with the event card; the read-only view is the guard).                             | [0053](../decisions/0053-index-booking-detail-view-and-merged-edit-reach.md) §1     |
| 9 (edit)   | The **merged `BookingSheet`** is reached from **both** the Index and the linked event (day view / plan builder) — `event.bookingId ? BookingSheet : EventForm`. `EventForm` narrows to unlinked events.     | [0053](../decisions/0053-index-booking-detail-view-and-merged-edit-reach.md) §2, §3 |
| —          | The day-view card stays an **event card** (phase verbs + its own "⋯"); its Edit reroutes, its Delete deletes the Event and leaves the Booking unlinked (ADR-0047 §3) — different from deleting the Booking. | [0053](../decisions/0053-index-booking-detail-view-and-merged-edit-reach.md) §4     |
| 9 (glance) | A **hotel / multi-day booking is an ambient span** (`Event.endDate` set) — backdrop, **excluded from the glance rail + `remaining` count**, rendered across every night it covers.                          | [0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md)               |

**Mockup for all of the above:** [`mockups/index-fixes-v1.html`](../../mockups/index-fixes-v1.html) — built on the real app CSS. Demo toggle: מסמכים / הזמנה / לוז.

## Implementation plan (per file)

### ADR-0052 — documents (backend → shared → frontend)

- **`backend/src/documents/documents.controller.ts`** — add `@Patch(':documentId')` (metadata: `title`, `type`; optional multipart `file` → replace) and `@Delete(':documentId')`. Membership-guarded like the existing routes.
- **`backend/src/documents/documents.service.ts`** — `update()` (patch row; if a new file, re-encrypt + swap the blob, keep the id) and `remove()` (delete row + `storage` blob). Reuse the existing encryption/storage helpers.
- **`packages/shared`** — `updateDocumentSchema` (`title?`, `type?`); export it.
- **`frontend/src/lib/api.ts`** — `updateDocument`, `replaceDocumentFile`, `deleteDocument`.
- **`frontend/src/ui/DocumentViewer.tsx`** — non-image → open-in-tab + download; image → inline with `onerror` fallback to open/download; shared spinner while loading.
- **`frontend/src/ui/DocumentsSection.tsx`** — per-row "⋯" → rename / change type / replace / delete; one-line row (name · size · lock · ⋯); spinner on list load; optimistic update/removal.
- **`frontend/src/ui/DocumentUploadSheet.tsx`** — pre-upload size/type validation; busy state (spinner + "מעלה…"); cause-aware error copy.
- **`frontend/src/ui/Spinner.tsx`** (new) — the one shared spinner.
- **`frontend/src/constants.ts`** — `DOCUMENT_TYPE_ICON` = 📕/🛡️/🎫/📄; `DocumentsSection` empty state reads it.
- **`frontend/src/i18n/he.ts`** — manage/rename/replace/delete strings; cause-aware error strings.

### ADR-0053 — booking detail view + merged-edit routing

- **`frontend/src/ui/BookingDetail.tsx`** (new) — read-only detail; ✏️ edit + "⋯" (edit/delete); opens `BookingSheet` / the delete-unlink prompt.
- **`frontend/src/screens/Index.tsx`** — row tap → `BookingDetail` (then edit), not `BookingSheet` directly.
- **`frontend/src/screens/DayView.tsx`, `frontend/src/screens/PlanDay.tsx`** — edit action: `event.bookingId ? open BookingSheet(booking) : EventForm`. Import `BookingSheet`.

### ADR-0054 — ambient-span glance

- **`frontend/src/lib/glance.ts`** — partition `dayEvents`: ambient (`endDate` set, spans this day) vs same-day; feed only same-day to `buildTimeTree` / segments / `remaining`; return the ambient set.
- **`frontend/src/lib/` helper** — `isAmbientOnDate(event, date)` (`date ≤ D ≤ endDate`).
- **`frontend/src/screens/Home.tsx`** — render the ambient backdrop strip above the rail; use the helper for the covered-days set.
- **`frontend/src/screens/DayView.tsx` / `PlanDay.tsx`** — show the ambient strip on every covered day (not settle-able).

## Verification

`pnpm format` → `pnpm typecheck` → `pnpm build` → `pnpm test` all green (backend tests need Postgres; `DEV_AUTH=1` for headless). New unit tests: `glance` ambient exclusion; `documents` update/remove service; the `bookingId`-aware edit routing. Drive the flows where possible before the PR.

## Progress log

**Shipped this session (all three ADRs):**

- **ADR-0052 backend** — `updateDocumentSchema` in shared; `deleteObject` in storage; `DocumentsService.update()` (metadata + blob-swap-on-replace, old blob deleted post-commit) and `remove()` (row + blob), both through `ChangeService`; controller `PATCH`/`DELETE`; four new service specs (rename, replace, delete, metadata-only).
- **ADR-0052 frontend** — `api.updateDocument`/`deleteDocument`; shared `Spinner`; viewer opens/downloads a PDF or an `onError` (undecodable/HEIC) image instead of a blank embed; `DocumentManageSheet` ("⋯" → rename / change type / replace / delete, guarded); one-line doc row; upload pre-validation + busy spinner + cause-aware errors; icons 📕/🛡️/🎫/📄; list-load spinner.
- **ADR-0053** — `BookingDetail` (read-only facts + visible ✏️ edit + "⋯" menu, reusing the exported `DeletePrompt`); `Index` taps open detail-then-edit; `DayView`/`PlanDay` route a `bookingId`-linked event's edit to the merged `BookingSheet`.
- **ADR-0054** — `buildDayGlance` excludes `endDate` (ambient) events from the tree/window/`remaining`; `ambientEventsOnDate` helper; ambient backdrop strip on Home + DayView + PlanDay across every covered night; two new glance specs.

**Verification:** `pnpm typecheck` 4/4, `pnpm build` 3/3, frontend `pnpm test` **283/283**, `pnpm lint` 0 errors (7 pre-existing warnings), `pnpm format:check` clean. **Backend integration tests (documents incl. the new update/remove specs) run in CI only** — this session's sandbox has no Postgres/Docker, so they couldn't be driven locally; likewise the full app couldn't be launched end-to-end here. The mockup (`mockups/index-fixes-v1.html`) is the visual reference the components were built to.
