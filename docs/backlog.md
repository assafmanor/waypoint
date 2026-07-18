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

- **Revocable invite tokens** — `trips.service.ts` signs stateless `base64url(tripId.expiresAt) + HMAC` tokens with no DB row. If `JWT_SECRET` leaks, anyone with it can forge a peer membership for any trip ID with any expiry, and no invite can be revoked early. A short `Invite` row fixes that and reads as a normal link instead of a phishing blob (the token becomes the row id). Revisit the invite-link copy/expiry messaging while in there.
- **Minor-unit currency** — `lib/money.ts` treats amounts as whole units. Correct for JPY, wrong for ILS/USD. Fix before a non-JPY trip.
- **Admin role permission matrix** — ADR-0005 is admin/peer only; if roles grow, decide the matrix in an ADR first.

## Known shortcuts (each names its own ceiling in a `ponytail:` comment)

- `constants.ts:46` — a scheduled maybe-item lands on a fixed demo slot instead of a real prompt.
- `packages/shared/src/schemas.ts:17` — `entityIdSchema` is a loose charset+length regex, not exact cuid2/uuid grammar.
- `lib/active-trip.ts:57` — overlapping in-progress trips are an explicitly deferred case.
- `lib/time.ts:220` — a wall-clock input this can't resolve correctly.

## Frontend review follow-ups (open findings)

Full write-up + evidence in [reviews/frontend-architecture-review.md](reviews/frontend-architecture-review.md) (F-01–F-04 shipped session 35; the below remain). Most relevant Mediums:

- **Real-user write attribution (F-05)** — optimistic `createdBy`/`updatedBy` use the `activeUserId` fixture (`u-assaf`), not the signed-in user; wrong until a resync for non-reconciled entities. Thread `me.user.id` through the verbs / index verbs and drop the dead `glance`/`activeUserId` from `TripContext`; move `fixtures.ts` off the production import graph.
- **`activeDate` clamps against stale trip dates (F-06)** — `TripReady` clamps to the original snapshot's `startDate`/`endDate`, so after an admin edits the dates live the day-strip and the selectable range disagree. Clamp against the reactive `trip`.
- **Route-level code-splitting (F-07)** — single ~620 KB JS bundle; lazy-load heavy non-first-paint surfaces (DocumentViewer, TripSettings, PlanDay, CreateTrip). Pair an SW update prompt with it (F-13).
- **Dialog focus management (F-08)** + **status live-region (F-10)** — sheets/dialogs lack focus-trap/Escape; offline & pending-sync badges aren't announced to assistive tech.

## Testing

- **e2e smoke** (Playwright) — conventions call for one; none exists. Boot the app, cross the tabs, assert each renders and the console is clean. Catches white-screen regressions unit tests miss.

## Open question

- **Blank-end events** — `EventForm` allows a blank end time, but the derived now-window and ripple both key off `endsAt` (`lib/time.ts` reads a missing end as zero-length), so an end-less event never reads as "now" and never ripples. Probably: derive a default-duration end for the now-window, leave ripple to real ends.
