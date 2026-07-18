# Backlog

Work we've decided on but haven't built. One line per item. No statuses, no priorities, no IDs — if it's here it's open, when it ships delete the line.

This is not the record of the project. The **why** lives in [decisions/](decisions/) (find the ADR for your domain via the router in [INDEX.md](INDEX.md)); the **what happened** lives in [planning/](planning/) and the git history. See [ADR-0046](decisions/0046-retire-the-task-board.md) for why it's this small.

## Screens not built

- **`Place`-picker component** — a Google Places search that creates/links a `Place`, used by every place field (event location, booking location, transport origin/destination, maybe-item). Blocked on the Google Cloud setup below; until it ships, place authoring is free-text-only via a name-only `Place`.
- **EventForm place authoring** — the manual `EventForm`'s free-text location input was **removed** (ADR-0051, deferred with the picker); re-add place authoring (name-only `Place` now, the picker later) so a new manual event can be given a place again.
- **Board hero booking presentation** — the now/next hero already shows a booking-backed hard event's time + code by inheritance; the richer transport-route / hotel check-in-out / gate presentation is now specced by **ADR-0059 §1** (hero surfaces a booking at its transition moments) and tracked in the "Home & bookings triage" section below.
- **Map tab** — Plan-mode research surface: Places search, pins (from `Place`), results → "+ maybe". Blocked on Google Cloud setup below. **Navigate-to-next** (deferred out of ADR-0045; routes to the transport origin `Place`, ADR-0048) lands here too.
- **Archive presentation** — ADR-0044 settled the behavior of a finished trip and explicitly left how the archive _looks_ as a follow-up (the Index's read-only archive state is designed in ADR-0049; other tabs' archive presentation is still open).

## Index post-build fixes (build after Assaf signs off ADR-0052/0053/0054 — all Proposed)

Triaged from the shipped Index (#122–#127) in `planning/2026-07-17-session-27-index-post-build-issues.md`; mockup `mockups/index-fixes-v1.html`.

- **Documents: manage + mobile viewing (ADR-0052, amended 2026-07-18)** — backend `DELETE :id` (row + encrypted blob) and `PATCH :id` (metadata, blob-aware; the replace-file multipart variant is **deferred**) on the documents controller; a per-row "⋯" menu trimmed to **Edit · Delete** (Edit = one sheet renaming + changing type; **no** replace-file; guarded delete); PDF **opens in-tab / downloads** on a phone instead of a blank iframe; a **shared spinner** for upload/list/viewer; **cause-aware** upload errors + pre-upload size/type validation; **four visually distinct** document-type badges (passport/insurance/visa/other), the empty-state illustration reading from the same constant.
- **Bookings: detail view + "⋯" parity (ADR-0053)** — tapping a booking opens a **read-only detail view** (full record: code, provider, route, room, wifi, notes, timing) with a "⋯" menu → edit / delete, like the event card — not the edit sheet directly.
- **Merged edit reachable from the linked event (ADR-0053, completes ADR-0047 §2)** — editing a booking-linked event from the day view / plan builder opens the merged span-capable `BookingSheet`, not the same-day `EventForm`; `EventForm` stays for unlinked events only.
- **Ambient-span events off the day schedule (ADR-0054, amended 2026-07-18)** — a lodging / multi-day booking (`endDate` set) is excluded from `buildTimeTree`, the glance rail and the `remaining` count, and rendered as a **backdrop strip across every day it covers** (fixes the check-in-day rail distortion and the blank nights 2…N); the glance additionally shows **uncounted check-in/check-out point markers** on the rail at their true clock position (2026-07-18 amendment).

## Home & bookings triage (2026-07-18 — see `planning/2026-07-18-session-32-home-and-booking-issue-triage.md` for the task breakdown + file-ownership map)

Triaged from Assaf's on-the-ground review. Each item is an independently deployable task; the session note maps file ownership so several can run in parallel. Design-exploration items (ADR-0059, ADR-0061) start with a mockup + ADR sign-off before implementation.

- **Category time-behaviour profile (ADR-0063, the foundation — do first)** — add `CategoryTimeProfile` + `CATEGORY_TIME_PROFILE` (a closed 9-row lookup) beside the icon registry in `packages/shared/src/icons.ts`, plus `isBracketed`/`isAmbient`/`isMultiDay` helpers (+ tests). Seed `transport`/`lodging` as bracketed + ambient-when-multi-day, the rest ordinary. No schema/DB change. **Gates the ambient (ADR-0054) and booking-presentation (ADR-0059) builds** — they read this profile instead of ad-hoc `endDate`/type checks.
- **Booking presentation across Home & Index (ADR-0059, applies ADR-0063; mockup built, awaiting sign-off)** — mockup `mockups/booking-presentation-v1.html` (session 32) is done; on sign-off: the board hero renders a **bracketed** event by its profile (`isBracketed`) at its **transition moments** (check-in/out, departure/arrival with padding windows) instead of across its whole span; a distinct **"inside a booking now"** treatment (bracketed event whose span contains the clock) replacing the generic chip; and a **shared appearance grammar** applied to the hero, the Index row (`BookingLi`), and the read-only detail view (`BookingDetail`), all reading the profile. Frontend + derivation only; subsumes the old "board hero booking presentation" item.
- **Ambient rendering + glance check-in/out markers (ADR-0054, rebased on ADR-0063)** — ambient is now `isAmbient(e)` (profile + multi-day), not a bare `endDate` check: exclude from `buildTimeTree`/rail/`remaining`, render the backdrop across covered days, and emit **uncounted point markers** for the profile's `transitions` (check-in/out) at their clock position in `glance.ts`. (Depends on ADR-0063; same files across `glance.ts`/`Home.tsx` — do the ambient + markers together.)
- **Swipe-back returns to Home + today (ADR-0035 refinement)** — the structural back-to-Home step also resets `activeDate` to today in Trip mode (the gesture path, `useTripTab`/`goToTab('home')`, currently doesn't; only the nav-bar Home-tap does, `App.tsx:351-354`). Plan mode preserves the day. Verify back lands correctly Home←tab and `/trips`←Home end-to-end.
- **Reopen after idle → trip Home/today (ADR-0060)** — a `visibilitychange` nav-reset: if hidden ≥ `RESET_TO_HOME_AFTER_HIDDEN_MS` (~30 min) and `mode==='trip'`, navigate to Home, `setActiveDate(today)`, clear overlays. Distinct from the 30-**second** data-resync (`trip-state.tsx:551-561`). Frontend only.
- **Plan-mode Home "what's missing" rework (ADR-0061, Accepted — build-ready)** — mockup `mockups/plan-home-readiness-v1.html`. Build: `readiness.ts` (keep the four checks; add one new per-traveller **documents/passports** check reading the snapshot docs list, ADR-0058; + tests), `PlanHome.tsx` (CTAs that do-the-thing: add-booking sheet / seed the day builder on the first empty day / settings invite; collapse completed checks into a summary with a show-completed toggle; readiness stays advisory), `he.ts` copy. Code-completeness check dropped (too minor); Google/Gmail/WhatsApp stay out.
- **Documents "⋯" trimmed to Edit · Delete (ADR-0052 amendment)** — collapse `DocumentManageSheet` (`:86-123`) to Edit · Delete; Edit = one rename+type sheet; remove the replace-file row (`:100-105`,`:112-121`). Part of the ADR-0052 documents task.
- **Zoom disabled except image preview (ADR-0062)** — `touch-action: manipulation` on the root + multi-touch gesture suppression (iOS ignores the viewport meta), excluding `.doc-viewer`; the viewer's image gains pinch-zoom + pan. **Must be verified on iOS Safari / installed PWA.** Frontend only.

## Documents: performance & caching (two parallel tasks — see `planning/2026-07-17-session-29-document-caching-and-fast-uploads.md`)

Decomposed to run simultaneously; disjoint file ownership (map in the session-29 note). Both **Proposed**.

- **Document blob read caching (ADR-0055)** — a read-through, ciphertext-only cache: server two-tier (in-memory LRU bounded by bytes + local-FS tier) wired into `storage.ts` `getObject`/`putObject`/`deleteObject`, keyed by the immutable `fileRef`; plus a client Cache-API read cache in `fetchDocumentContent`. Skips the repeat S3 GET + network fetch and closes the offline-document-reads gap (CLAUDE.md rule 5 / ADR-0042). New env: `DOC_CACHE_DIR` / `DOC_CACHE_MAX_BYTES` / `DOC_CACHE_DISABLED`.
- **Faster document uploads (ADR-0056)** — move uploads onto the offline outbox: close the upload sheet instantly, queue a `uploadDocument` op carrying the file `Blob`, flush in the background (offline-capable); make `documents.service.create` idempotent on a duplicate client `id` (no 500, no orphaned second blob on retry).
- **Streaming server ingest** (deferred follow-up) — stream multipart → encrypt → S3 multipart upload, dropping the full in-memory buffer + base64 inflation. Touches `storage.ts`/`putObject`, so sequence it _after_ the read-cache task to avoid a merge fight.
- **Redis for documents** (deferred) — a shared cross-instance read cache and/or upload write-buffer only matter past one backend instance (ADR-0031); Redis stays reserved for its earmarked BullMQ role until then.

## Integrations

- **Google Cloud project setup** (human) — OAuth consent, Maps/Places, Calendar. Gates the Map tab and calendar sync.
- **Calendar one-way sync** (trip → personal, ADR-0003) — the feature itself; nothing reads `Membership.calendarSyncEnabled` today. When built, a linked event's location must resolve via its booking/`Place` — there is no `Event.location` anymore (ADR-0051).
- **Lazy incremental OAuth consent** — before calendar sync first fires for a member, check `AuthIdentity.scopes` and run Google's incremental-consent redirect if the calendar scope is missing. Per `auth-and-google.md`, scopes are never front-loaded at sign-in. Needed by the item above, not before it.

## Security & correctness

- **Revocable invite tokens** — `trips.service.ts` signs stateless `base64url(tripId.expiresAt) + HMAC` tokens with no DB row. If `JWT_SECRET` leaks, anyone with it can forge a peer membership for any trip ID with any expiry, and no invite can be revoked early. A short `Invite` row fixes that and reads as a normal link instead of a phishing blob (the token becomes the row id). Revisit the invite-link copy/expiry messaging while in there.
- **Minor-unit currency** — `lib/money.ts` treats amounts as whole units. Correct for JPY, wrong for ILS/USD. Fix before a non-JPY trip.
- **Admin role permission matrix** — ADR-0005 is admin/peer only; if roles grow, decide the matrix in an ADR first.

## Known shortcuts (each names its own ceiling in a `ponytail:` comment)

- `constants.ts:46` — a scheduled maybe-item lands on a fixed demo slot instead of a real prompt.
- `packages/shared/src/schemas.ts:17` — `entityIdSchema` is a loose charset+length regex, not exact cuid2/uuid grammar.
- `lib/active-trip.ts:57` — overlapping in-progress trips are an explicitly deferred case.
- `lib/time.ts:220` — a wall-clock input this can't resolve correctly.

## Testing

- **e2e smoke** (Playwright) — conventions call for one; none exists. Boot the app, cross the tabs, assert each renders and the console is clean. Catches white-screen regressions unit tests miss.

## Open question

- **Blank-end events** — `EventForm` allows a blank end time, but the derived now-window and ripple both key off `endsAt` (`lib/time.ts` reads a missing end as zero-length), so an end-less event never reads as "now" and never ripples. Probably: derive a default-duration end for the now-window, leave ripple to real ends.
