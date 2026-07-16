# Backlog

Work we've decided on but haven't built. One line per item. No statuses, no priorities, no IDs — if it's here it's open, when it ships delete the line.

This is not the record of the project. The **why** lives in [decisions/](decisions/) (find the ADR for your domain via the router in [INDEX.md](INDEX.md)); the **what happened** lives in [planning/](planning/) and the git history. See [ADR-0046](decisions/0046-retire-the-task-board.md) for why it's this small.

## Screens not built

- **Index tab** — still a `Placeholder` in `App.tsx`. Bookings list + create/edit/delete; the form is designed in `mockups/plan-mode-v1.html` (Index / "הוסף הזמנה"), needs the notes + hotel-wifi fields added (ADR-0047). Backend CRUD exists; the delete 409 (a hard event depends on the booking) becomes an explicit delete-both/unlink prompt, not a raw error (ADR-0047).
- **Documents UI** — upload + viewer, in the Index tab, one row per file grouped by type (ADR-0047). Backend storage/encryption is done (ADR-0015, ADR-0034); nothing on the frontend reaches it, and Home's documents shortcut (ADR-0045) points at it.
- **Home WiFi source migration** — Home's WiFi quick-access (ADR-0045) currently reads a `TripNote`; ADR-0047 moves it to the active/next hotel `Booking.details.wifi` instead. `TripNoteCategory` narrows to `note`-only once this ships.
- **Map tab** — Plan-mode research surface: Places search, pins, results → "+ maybe". Blocked on Google Cloud setup below. **Navigate-to-next** (deferred out of ADR-0045) lands here too.
- **Archive presentation** — ADR-0044 settled the behavior of a finished trip and explicitly left how the archive _looks_ as a follow-up.

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
