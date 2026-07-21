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
- **(Optional) Route verb optimistic in-memory writes through the applier (ADR-0094 tail)** — the cache mirror + member keying are unified (`applyOutboxOpToCache` → `applyChangeToCache`); the one remaining parallel path is each verb's own optimistic `setState`/dispatch. Routing it through `applyEntityChange` too would need each verb's rollback rewritten as an inverse-change and entangles the event one-slot undo (ADR-0019) — real risk for little further dedup. Low priority.

## UI/UX review follow-ups (open findings)

Full write-up + evidence in [reviews/ui-ux-review.md](reviews/ui-ux-review.md) (advisory, 2026-07-19). No production code changed. Ordered roughly by the review's phased roadmap; the design-system consolidations are the point — fix the shared root, not each screen.

- ~~**U-01 `EventForm` outside the modal/focus system**~~ (High) — **shipped** (Wave 2 E): `EventForm` now renders inside `Modal variant="sheet"` (ADR-0079), so system-back/Escape/backdrop close it and focus moves in/restores; `.event-form-*` deleted.
- ~~**U-04 per-item save/sync state**~~ (High) — **shipped** (ADR-0080, Waves 2–3): the `SyncStatus` model (`synced/pending/failed(reason)`) derived frontend-only from the outbox (id-keyed) + the F-03 failed store, `useSyncStatus(entityId)` + a non-color-coded `SyncBadge`, and a persistent review/retry (dead-letter) sheet replacing the timed failed-badge; `SyncBadge` now on document rows (Wave 2) + booking rows (Wave 3 D-index) + event-timeline cards (session-35: `EventCard` gained a `sync` prop, DayView wires `useSyncStatus(event.id)`; the card shows ↑/! for a queued/failed edit and nothing when synced, so a settled day stays uncluttered).
- **U-08 tokenize spacing + type** (Med, foundation) — token layer **landed** (ADR-0082): `--space-*`/`--text-*`/`--leading-*`/`--radius-*`/`--elevation-*`/`--bp-*`/safe-area/sync tokens now in `tokens.css`, matching the documented ramps. _Remaining:_ opportunistic migration of `App.css`/`screens.css` raw px onto the tokens (rides the U-03 extractions + screen migrations); plus a CI lint budget on raw px in `ui/` CSS (review §15). The Phase-4 dark-mode **color** hex sweep is **done** — `App.css`/`screens.css` colors now read tokens, `--faint`/`--amber-ink` added, dark remap complete; dark mode is shippable behind the `data-theme` toggle (design-language "Dark mode readiness"). _Left for dark mode:_ live in-browser contrast confirmation + wiring the theme toggle/persistence.
- **U-10 shared feedback family** (Med) — empty/loading/error/offline were ~6 bespoke shells; no skeletons; retry-less snapshot dead-end; full-screen trip-switch flash. _Landed:_ the feedback family (ADR-0078: `EmptyState`/`ErrorState`/`LoadingState`+`Skeleton`/`StatusBanner`) + the `AppShell`/layout primitives; **and** (Wave 3 D-route) the snapshot loading/error migrated onto a chrome-preserving `LoadingState` + `ErrorState` with a working retry (no more full-screen `<h1>` flash / dead-end). _Remaining (opportunistic / Phase-4):_ fold the ~6 bespoke empty shells (`board-off`, `glance-day.empty`, index/plan empties) onto `EmptyState` and the stacked `.offline-badge` onto `StatusBanner` as each screen is next touched.
- ~~**U-02 / U-05 one editing grammar**~~ (Med) — **shipped** (Wave 2 E): one variant-driven `ConfirmDialog` (tone `neutral`/`danger`/`hard`, on `Modal variant="dialog"`) replaces all three confirm impls (hard-edit gate, booking `DeletePrompt`, TripSettings `Confirm`); `FormActions` (canonical order: primary then cancel, destructive on its own row) + `Field` + `DateTimeField` (no native `datetime-local`) + `useUnsavedGuard` wired into both forms; the superseded `.confirm-*`/`.event-form-*`/`.bs-modal-overlay` CSS deleted. _Follow-up (ADR-0083):_ `DateTimeField` was later superseded by the `WhenField` date/time standard (`day` + multi-day `span` variants) after its cramped `datetime` mode clipped the date on spans; `DateTimeField` removed.
- **WhenField unified-duration span** (Low, refinement of ADR-0083) — the span variant's two endpoints could later collapse into a single control where the end is entered as a multi-day **duration** ("2 days 3h") with the end-date derived, matching the single-day TimePicker's start+duration feel. Deferred alternative from ADR-0083; layers onto the same `WhenField` span value contract without touching call sites.
- ~~**U-03 domain components**~~ (Med) — **shipped** (Wave 3): the `ui/domain/` layer (D0 — `ListRow`+`RowManageSheet`, `MaybeCard`, `Board`, `EventCard`, `DayStrip`, `GlanceCard`, `StatTile`, all presentational + unit-tested) **and** the screen migrations onto it: Home → `Board`/`GlanceCard`/`StatTile` (D-home), DayView/PlanDay → `EventCard`/`MaybeCard` (D-day), Index/DocumentsSection + both manage menus → `ListRow`/`RowManageSheet` (D-index), App.tsx header → `DayStrip` (D-route). The inline copies + superseded `screens.css` rules were deleted in each migration (screens shed ~2.6k lines net). The shared `.row-action`/`.kebab` rules stay (still used by TripSettings).
- **Captured-scan auto-crop / enhance** (Low, deferred from ADR-0086) — the upload `FilePicker` now has a first-class camera-capture path; a document-scanner pass (edge detection + perspective correction + contrast) on a captured passport photo is a larger surface left for later. The pick control ships without it.
- **Nested-overlay Escape refinement** (Low, from Wave 2 E) — `useDialogFocus` attaches a document-level Escape listener per overlay, so a single Escape over a sheet with a nested prompt (delete/discard) can close both at once. Backdrop-tap and button paths are correct. Fix by making the overlay stack (ADR-0035) own Escape so only the topmost overlay consumes it.
- ~~**U-09 group change-feed**~~ (Med) — **shipped** (Wave 4 C, ADR-0081): a bounded (last 20) WS-fed recent-changes buffer (`state/change-feed.tsx`) narrating attributed peer edits off the same `change` stream in `applyRemoteChange` (narrate, not re-apply), plus a quiet dismissable `ui/domain/ChangeFeed` strip on the Trip-mode Home below the board. Own edits filtered out; polite live region; auto-collapses when empty; attribution via F-05's `actorUserId` + roster.
- **U-06 Map / location gap** (Med, product) — the Map tab is a dead placeholder in a primary nav slot and navigate-to-next is deferred, so "where do we go / when do we leave" has no live answer. Overlaps the "Map tab" item above; prioritization is a product call.
- ~~**U-07 / U-11 / U-12 / U-13 quick wins**~~ (Low) — **all shipped**: U-11 (`settings` glyph in `Icon`, `⚙` control swapped) + U-12 (`Spinner` aria-label → `t.common.loading`) in Wave 1; U-07 (the `maybeMeta`/`fixtures` import removed from DayView/PlanDay, real derived `MaybeCard` meta) in Wave 3 D-day; U-13 (create-trip CTA always visible, disabled-with-reason via `t.shell.newTrip.ctaReason`) in Wave 3.

## Backend review follow-ups (open findings)

Full write-up + evidence (incl. a reproduced concurrency probe) in [reviews/backend-architecture-review.md](reviews/backend-architecture-review.md).

B-01–B-06 and B-08–B-13 shipped (ADR-0068–0076); B-07 shipped (ADR-0067). Remaining are the pieces deliberately deferred out of B-12/B-13:

- **Orphan-blob reconciler** (deferred, from B-13/ADR-0076) — a periodic sweep listing storage keys not referenced by any `Document.fileRef`; the upload path still biases toward orphaning a blob over losing a document, with no reconciliation. Acceptable at current scale.
- **Standardize change `after` payloads** (deferred, from B-13/ADR-0076) — several services log the partial `input` as a change's `after` rather than the persisted DTO, so `after`'s shape is inconsistent across entity types (affects feed rendering / any future replay, not correctness today).
- **Google email-change account-link policy** (from B-12/ADR-0076) — account-linking keys on `User.email`, so a changed Google primary email creates a new `User` the identity re-points to, orphaning the old one. Current policy: treat as a new account. Revisit if an identity-merge feature is ever wanted.

## Copy & voice

- **Hebrew voice/gender consistency** (from session 42, ADR-0085's item-4 pass) — most of the app speaks plural-neutral ("נסו", "בדקו", "הוסיפו"), but the zero-state and join screens switch to singular-masculine ("אתה זה שמארגן", "הצטרף", "פתח אותו", "מחובר"). Pick one voice (likely plural-neutral, matching the toast/settings copy) and sweep `i18n/he.ts`. A tone decision, not a bug — worth an ADR if the choice isn't obvious.

## Testing

- **e2e smoke** (Playwright) — conventions call for one; none exists. Boot the app, cross the tabs, assert each renders and the console is clean. Catches white-screen regressions unit tests miss.

## Open question

- **Blank-end events** — `EventForm` allows a blank end time, but the derived now-window and ripple both key off `endsAt` (`lib/time.ts` reads a missing end as zero-length), so an end-less event never reads as "now" and never ripples. Probably: derive a default-duration end for the now-window, leave ripple to real ends.
- **General back-navigation inconsistency** (from session 63) — diagnosed session 65: the reported "sometimes not as expected" back traces to a **layer-lifecycle** defect, not the ADR-0090 resolver. `runBack('close-overlay')` destructively `pop()`s the overlay stack, but `IndexBookingsView`'s callback resets the category filter and stays mounted — so it's popped-yet-visible and the next system-back leaks past it (system-back then diverges from the visible arrow). Root causes + the recommended fix (a typed, non-destructive `BackLayer` registry over the same resolver, trigger-aware `resolveBack`, a replace-written URL-param restoration mirror for Index subviews, fragments rejected) are written up in **Proposed [ADR-0103](decisions/0103-back-navigation-typed-layer-model.md)** + `planning/2026-07-21-session-65-back-navigation-overhaul-plan.md`. **Shipped so far:** real-traversal repro e2e (`e2e/back-index.spec.ts`), and the core of the fix — the destructive overlay `pop()` is replaced by a non-destructive `BackResult { remainsActive }` registry (`useBackLayer`, `useOverlay` now a shim), so the Index filter reset stays registered and the reproduced divergence is closed. **Still open (later phases, some gated on the two ADR-0103 decisions):** trigger-aware `resolveBack` + Escape unification (Escape is still a separate close path), URL-param durability for Index subviews, `arm-exit` cross-surface clear, and physical-Android validation.

## Reusable UI follow-ups

- **`SearchOverlay` beyond bookings** (from session 63, ADR-0101) — the full-screen search-mode primitive (`ui/primitives/SearchOverlay.tsx`) is wired up for the Index bookings screen only. A documents search (or any other "type to filter, on a full screen" need) should adopt it directly rather than growing a second one-off, whenever one is actually needed.
- **Search bookings by linked place** (from session 64, ADR-0102) — the Index bookings search matches title/confirmation code/category vocabulary via an extensible term array (`lib/index-bookings.ts`'s `searchTerms`); a linked place's name was explicitly named as the next facet to add, once wanted — a one-line push into that array, not a new mechanism.
