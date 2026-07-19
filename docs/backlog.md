# Backlog

Work we've decided on but haven't built. One line per item. No statuses, no priorities, no IDs — if it's here it's open, when it ships delete the line.

This is not the record of the project. The **why** lives in [decisions/](decisions/) (find the ADR for your domain via the router in [INDEX.md](INDEX.md)); the **what happened** lives in [planning/](planning/) and the git history. See [ADR-0046](decisions/0046-retire-the-task-board.md) for why it's this small.

## Screens not built

- **`Place`-picker component** — a Google Places search that creates/links a `Place`, used by every place field (event location, booking location, transport origin/destination, maybe-item). Blocked on the Google Cloud setup below; until it ships, place authoring is free-text-only via a name-only `Place`.
- **EventForm place authoring** — the manual `EventForm`'s free-text location input was **removed** (ADR-0051, deferred with the picker); re-add place authoring (name-only `Place` now, the picker later) so a new manual event can be given a place again.
- **Map tab** — Plan-mode research surface: Places search, pins (from `Place`), results → "+ maybe". Blocked on Google Cloud setup below. **Navigate-to-next** (deferred out of ADR-0045; routes to the transport origin `Place`, ADR-0048) lands here too.
- **Archive presentation** — ADR-0044 settled the behavior of a finished trip and explicitly left how the archive _looks_ as a follow-up (the Index's read-only archive state is designed in ADR-0049; other tabs' archive presentation is still open).

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

- **Minor-unit currency** — `lib/money.ts` treats amounts as whole units. Correct for JPY, wrong for ILS/USD. Fix before a non-JPY trip.
- **Admin role permission matrix** — ADR-0005 is admin/peer only; if roles grow, decide the matrix in an ADR first.

## Known shortcuts (each names its own ceiling in a `ponytail:` comment)

- `constants.ts:46` — a scheduled maybe-item lands on a fixed demo slot instead of a real prompt.
- `packages/shared/src/schemas.ts:17` — `entityIdSchema` is a loose charset+length regex, not exact cuid2/uuid grammar.
- `lib/active-trip.ts:57` — overlapping in-progress trips are an explicitly deferred case.
- `lib/time.ts:220` — a wall-clock input this can't resolve correctly.

## Frontend review follow-ups (open findings)

Full write-up + evidence in [reviews/frontend-architecture-review.md](reviews/frontend-architecture-review.md). F-01–F-04 shipped session 35; F-05–F-08 + F-10 shipped session 36; F-09 is a deliberate non-fix (ADR-0062). Only the Low/Informational items remain:

- **SW update prompt (F-13)** — now that code-splitting is in (F-07), pair `skipWaiting`/`clientsClaim` with a "new version, reload" prompt so a mid-session SW swap can't hand a client a stale lazy chunk.
- **Self-host fonts (F-11)** — fonts load from the Google CDN, so they aren't precached (offline first paint uses a fallback) and add an external dependency; self-host the woff2 subset.
- **Minor sync-robustness (F-12, F-14, F-15)** — flush loop for writes enqueued mid-flush; a `crypto.randomUUID` fallback for non-secure test hosts; derive the outbox pending-count from the store rather than a shared counter.

## UI/UX review follow-ups (open findings)

Full write-up + evidence in [reviews/ui-ux-review.md](reviews/ui-ux-review.md) (advisory, 2026-07-19). No production code changed. Ordered roughly by the review's phased roadmap; the design-system consolidations are the point — fix the shared root, not each screen.

- **U-01 `EventForm` outside the modal/focus system** (High) — the most-used form is a bespoke `.event-form-*` overlay with no `useOverlay` (back-gesture won't close it) and no `useDialogFocus` (no focus-in/trap/Escape/restore, unlike F-08's fixes). Fold it into the one shared `Sheet`/`Modal` primitive.
- **U-04 per-item save/sync state** (High) — save confidence is a transient toast + a global header badge; no per-entity `synced/pending/failed` marker or retry (builds on F-03). Add a `SyncStatusModel` + `SyncBadge` + a review/retry surface.
- **U-08 tokenize spacing + type** (Med, foundation) — `tokens.css` has color/motion/font tokens only; the documented spacing 4px-grid and 8-step type ramp are hard-coded px across 6.5k lines of CSS. Add `--space-*`/`--text-*`/`--radius-*`/`--elevation-*`/breakpoint tokens; unblocks dark mode + consistent extraction.
- **U-10 shared feedback family** (Med) — empty/loading/error/offline are ~6 bespoke shells; no skeletons; the snapshot error dead-ends without retry; trip-switch flashes a full-screen `<h1>`. Introduce `EmptyState`/`ErrorState`/`Skeleton`/`StatusBanner` + an `AppShell` that renders load/error inside the chrome.
- **U-02 / U-05 one editing grammar** (Med) — two+ modal families (`Sheet` vs `.confirm-*` vs `.event-form-*`), three confirm impls, divergent Save/Cancel order+labels, native `datetime-local` vs the custom `TimePicker`, and no unsaved-changes guard. Consolidate to one `Modal`/`ConfirmDialog`/`FormActions`/`Field`/`DateTimeField` + a `useUnsavedGuard`.
- **U-03 domain components** (Med) — `PlanDay` 1115 / `DayView` ~800 lines own layout + cards inline; `MaybeCard` and the Index/Documents list-row are duplicated. Extract `ListRow`/`RowManageSheet`, `MaybeCard`, `Board`, `EventCard`, `DayStrip`, `StatTile`.
- **U-09 group change-feed** (Med) — peer edits mutate state silently; PRD 4.2's "Noam moved ramen to 20:00" doesn't exist. Needs a WS-fed recent-changes buffer (attribution depends on F-05) + a quiet `ChangeFeed`.
- **U-06 Map / location gap** (Med, product) — the Map tab is a dead placeholder in a primary nav slot and navigate-to-next is deferred, so "where do we go / when do we leave" has no live answer. Overlaps the "Map tab" item above; prioritization is a product call.
- **U-07 / U-11 / U-12 / U-13 quick wins** (Low) — drop the `maybeMeta` fixture from the live shelf cards (with F-05); add a `settings` glyph to `Icon` for the `⚙` emoji control; point `Spinner`'s aria-label at a `t` key; show the create-trip CTA disabled-with-reason. Do the small ones via the shared primitives once they exist, not as one-offs.

## Backend review follow-ups (open findings)

Full write-up + evidence (incl. a reproduced concurrency probe) in [reviews/backend-architecture-review.md](reviews/backend-architecture-review.md).

B-01–B-06 and B-08–B-13 shipped (ADR-0068–0076); B-07 shipped (ADR-0067). Remaining are the pieces deliberately deferred out of B-12/B-13:

- **Orphan-blob reconciler** (deferred, from B-13/ADR-0076) — a periodic sweep listing storage keys not referenced by any `Document.fileRef`; the upload path still biases toward orphaning a blob over losing a document, with no reconciliation. Acceptable at current scale.
- **Standardize change `after` payloads** (deferred, from B-13/ADR-0076) — several services log the partial `input` as a change's `after` rather than the persisted DTO, so `after`'s shape is inconsistent across entity types (affects feed rendering / any future replay, not correctness today).
- **Google email-change account-link policy** (from B-12/ADR-0076) — account-linking keys on `User.email`, so a changed Google primary email creates a new `User` the identity re-points to, orphaning the old one. Current policy: treat as a new account. Revisit if an identity-merge feature is ever wanted.

## Testing

- **e2e smoke** (Playwright) — conventions call for one; none exists. Boot the app, cross the tabs, assert each renders and the console is clean. Catches white-screen regressions unit tests miss.

## Open question

- **Blank-end events** — `EventForm` allows a blank end time, but the derived now-window and ripple both key off `endsAt` (`lib/time.ts` reads a missing end as zero-length), so an end-less event never reads as "now" and never ripples. Probably: derive a default-duration end for the now-window, leave ripple to real ends.
