# Backlog

Work we've decided on but haven't built. One line per item. No statuses, no priorities, no IDs — if it's here it's open, when it ships delete the line.

This is not the record of the project. The **why** lives in [decisions/](decisions/) (find the ADR for your domain via the router in [INDEX.md](INDEX.md)); the **what happened** lives in [planning/](planning/) and the git history. See [ADR-0046](decisions/0046-retire-the-task-board.md) for why it's this small.

## Screens not built

- **`Place`-picker component** — a Google Places search that creates/links a `Place`, used by every place field (event location, booking location, transport origin/destination, maybe-item). Blocked on the Google Cloud setup below; until it ships, place authoring is free-text-only via a name-only `Place`.
- **EventForm place authoring** — the manual `EventForm`'s free-text location input was **removed** (ADR-0051, deferred with the picker); re-add place authoring (name-only `Place` now, the picker later) so a new manual event can be given a place again.
- **Board hero booking presentation** — the now/next hero already shows a booking-backed hard event's time + code by inheritance; the richer transport-route / hotel check-in-out / gate presentation on the hero is an unstarted follow-up (deferred out of session 25; no ADR yet).
- **Map tab** — Plan-mode research surface: Places search, pins (from `Place`), results → "+ maybe". Blocked on Google Cloud setup below. **Navigate-to-next** (deferred out of ADR-0045; routes to the transport origin `Place`, ADR-0048) lands here too.
- **Archive presentation** — ADR-0044 settled the behavior of a finished trip and explicitly left how the archive _looks_ as a follow-up (the Index's read-only archive state is designed in ADR-0049; other tabs' archive presentation is still open).

## Index post-build fixes (build after Assaf signs off ADR-0052/0053/0054 — all Proposed)

Triaged from the shipped Index (#122–#127) in `planning/2026-07-17-session-27-index-post-build-issues.md`; mockup `mockups/index-fixes-v1.html`.

- **Documents: manage + mobile viewing (ADR-0052)** — backend `DELETE :id` (row + encrypted blob) and `PATCH :id` (metadata + replace-file, blob-aware) on the documents controller; a per-row "⋯" menu → rename / change type / replace / delete (guarded delete); PDF **opens in-tab / downloads** on a phone instead of a blank iframe; a **shared spinner** for upload/list/viewer; **cause-aware** upload errors + pre-upload size/type validation; **four visually distinct** document-type badges (passport/insurance/visa/other), the empty-state illustration reading from the same constant.
- **Bookings: detail view + "⋯" parity (ADR-0053)** — tapping a booking opens a **read-only detail view** (full record: code, provider, route, room, wifi, notes, timing) with a "⋯" menu → edit / delete, like the event card — not the edit sheet directly.
- **Merged edit reachable from the linked event (ADR-0053, completes ADR-0047 §2)** — editing a booking-linked event from the day view / plan builder opens the merged span-capable `BookingSheet`, not the same-day `EventForm`; `EventForm` stays for unlinked events only.
- **Ambient-span events off the day schedule (ADR-0054)** — a lodging / multi-day booking (`endDate` set) is excluded from `buildTimeTree`, the glance rail and the `remaining` count, and rendered as a **backdrop strip across every day it covers** (fixes the check-in-day rail distortion and the blank nights 2…N).

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
