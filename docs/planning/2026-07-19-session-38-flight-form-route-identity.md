# Session 38 — A flight has no name field: the booking form reads by route

**Date:** 2026-07-19
**Branch:** `claude/glance-timeline-layout-guv3ao` (restarted from the merged `main` after #167)
**Touches:** ADR-0059 §3 (route grammar → the entry form), ADR-0047/0048 (the booking form)

## What prompted it

Follow-up to session 37 (#167). That PR made every _presentation_ surface read a flight as its origin→destination, but Assaf pointed out the corollary: "flights don't need a name" also means the **add/edit form shouldn't ask for one**, and neither should the preview. The form was the one place a flight name was still authored — a free-text title input, `required` on save — and the booking detail ("preview") only reads route-first because a name was still stored behind it.

## What changed (frontend + derivation only)

- **`ui/BookingSheet.tsx`** — for a transport type (`isTransportType`), the `titlerow` name input is replaced by a **live route preview** (`RouteLabel` from origin/dest, or a muted `מוצא ← יעד` ghost). The origin/destination fields **move up** to lead the form (where the name sits for other types) and feed the preview. Save derives the title from the route and requires a route (`routeRequired`) instead of a name; non-transport types keep the name field + `titleRequired`.
- **`lib/booking-edit.ts` `routeTitle(origin, dest, arrow)`** — pure, unit-tested derivation of the stored title (`origin ← dest`, either side may be blank; `''` → route required). `Booking.title` stays populated so it still backs the linked event's title (the backend mirrors booking→event title, `bookings.service.ts`) and any place-less fallback — a flight simply never carries a _typed_ name.
- **`i18n/he.ts`** — `form.routeGhost` (`מוצא ← יעד`) + `form.routeRequired`.
- **`screens.css`** — `.bs-route-preview` (matches `.bs-title` weight/size; muted `.ghost`).

## Why this shape

- **Derive, don't store a name.** Consistent with ADR-0018 (derive presentation) and ADR-0059 §3 (route is the transport identity). The one durable field, `Booking.title`, is derived from the route rather than typed, so nothing downstream (the linked event's title, the day view, any fallback) has to special-case a missing name.
- **Not flight-special-cased.** Keys on `isTransportType` (flight + train), so any route-shaped type gets the same treatment.
- **Backend untouched.** `booking.title` is still sent and still mirrored to the event; only its _source_ (route vs keyboard) changed.

## Verification

- `typecheck` + `build` green; **373 tests pass**, incl. new `routeTitle` cases (join, trim, drop-blank-endpoint, empty→required).
- Rendered the real `screens.css` against the form DOM (headless Chromium): empty flight form shows the muted `מוצא ← יעד` ghost with no name field; entering a route shows the live `נתב״ג ← נריטה` preview; a hotel keeps its name input.

## Git note

PR #167 was squash-merged to `main` as `03ba01a` while this work was in progress. Per the merged-PR rule, the branch was restarted from the latest `main` and this session's form work re-applied on top, so its PR is a **new** PR (not a reopen of #167).
