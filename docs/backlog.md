# Backlog

Work we've decided on but haven't built. One line per item. No statuses, no priorities, no IDs — if it's here it's open, when it ships delete the line.

This is not the record of the project. The **why** lives in [decisions/](decisions/) (find the ADR for your domain via the router in [INDEX.md](INDEX.md)); the **what happened** lives in [planning/](planning/) and the git history. See [ADR-0046](decisions/0046-retire-the-task-board.md) for why it's this small.

## Screens not built

- **Index tab** — still a `Placeholder` in `App.tsx`. Full design in `mockups/trip-index-v1.html` (the screen: linked/unlinked bookings, merged edit sheet, delete/unlink prompt, past/upcoming split, read-only archive) + `mockups/plan-mode-v1.html` (the booking-entry form). Behavior: ADR-0047 (linkage / delete / notes+wifi), ADR-0048 (schema), ADR-0049 (mode + lifecycle). Backend booking CRUD exists; the delete 409 becomes the explicit delete-both/unlink prompt.
- **Booking/Place data-model migration (ADR-0048)** — gates the Index build: drop `Booking.startsAt`/`endsAt` (Event owns time); add the `Place` entity; make `Event.placeId`/`Booking.placeId`/`MaybeItem.placeId` FK → Place; add `Booking.fromPlaceId`/`toPlaceId` (transport origin/destination); drop `TripNote` + `TripNoteCategory`; add ADR-0047's `notes`/`wifi` to `Booking.details`. Mirror all in `@waypoint/shared`.
- **Booking-entry form** — one form for both modes (`mockups/plan-mode-v1.html`): all 6 `BookingType`s, `IconPicker` chip + derived category (ADR-0038), the shared `TimePicker` for dates (ADR-0036/0037), per-type notes, hotel WiFi fields, transport origin/destination place fields (ADR-0047/0048). Auto-creates the linked Event on save with a time.
- **`Place`-picker component** — a Google Places search that creates/links a `Place`, used by every place field (event location, booking location, transport origin/destination, maybe-item). Blocked on the Google Cloud setup below; without it the place fields fall back to free text (`address`/`location`).
- **Documents UI** — upload + viewer, in the Index tab, one row per file grouped by type with a matched "＋ הוסף מסמך" affordance (ADR-0047/0049; `mockups/trip-index-v1.html`). Backend storage/encryption is done (ADR-0015, ADR-0034); nothing on the frontend reaches it, and Home's documents shortcut (ADR-0045) points at it.
- **Home quick-access wiring (ADR-0050)** — the three tiles deep-link into the Index; derived tiles (next code, WiFi) are absent when there's no source and the grid reflows; the managed documents tile is always present with a ＋ invite. WiFi now reads the active/next hotel `Booking.details.wifi` (ADR-0047), not a `TripNote` (removed by ADR-0048).
- **Board hero booking presentation** — the now/next hero already shows a booking-backed hard event's time + code by inheritance; the richer transport-route / hotel check-in-out / gate presentation on the hero is an unstarted follow-up (deferred out of session 25; no ADR yet).
- **Map tab** — Plan-mode research surface: Places search, pins (from `Place`), results → "+ maybe". Blocked on Google Cloud setup below. **Navigate-to-next** (deferred out of ADR-0045; routes to the transport origin `Place`, ADR-0048) lands here too.
- **Archive presentation** — ADR-0044 settled the behavior of a finished trip and explicitly left how the archive _looks_ as a follow-up (the Index's read-only archive state is designed in ADR-0049; other tabs' archive presentation is still open).

## Integrations

- **Google Cloud project setup** (human) — OAuth consent, Maps/Places, Calendar. Gates the Map tab and calendar sync.
- **Calendar one-way sync** (trip → personal, ADR-0003) — the feature itself; nothing reads `Membership.calendarSyncEnabled` today.
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
