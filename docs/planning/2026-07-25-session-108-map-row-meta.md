# Session 108 — The row says when and what, and the address stops being the headline

**Date:** 2026-07-25
**Kind:** Feature (Map-tab deferred follow-up (c), now unblocked).
**ADRs:** [0109](../decisions/0109-map-tab-design.md) **session-108 amendment** (§1's meta line, built, and what `<what>` actually is), [0063](../decisions/0063-booking-transition-profiles.md) (the per-mode transition vocabulary reused), [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) (each end's own zone).

## Why

The last deferred Map-tab follow-up. §1 has always specified the meta line as **`<time> · <what>`** ("18:40 · רכבת לקיוטו"), but Phase 3 shipped `address ?? category` and parked the rest: the per-day time overlapped the then-unbuilt ADR-0107 display track. That track finished in session 103, and session 107 gave it a second reason — with rows carrying no time, the `כבר היינו` partition had nothing on screen to corroborate it.

The shipped row read `Dimitras, Nicosia, Lefkosia 2058, קפריסין`: true, long, and silent about why the place is on the list at all.

## What `<what>` is

§1 gave an example, not a rule, so this session decided it:

- **A bracketed booking's end says which end it is**, in the vocabulary the hero and glance markers already use — take-off/landing for a flight, departure/arrival for surface transport, check-in/out for a stay (`eventTransitionKeys` + `t.glance.transition.*`). A row reads `07:15 · המראה`.

  That is deliberately _not_ the "bare transition word out of context" §1 forbids. The row names the place, the badge gives the category, the time sits beside it — the context §1 wanted is already on the row. I considered composing "המראה לקפלאוויק" and rejected it: Hebrew preposition assembly per place name, for information the row already carries.

- **Everything else says its title**, through `shortTitleText` so a stored route title shortens rather than printing two full official names.
- **The address is demoted, not deleted.** It still carries a row with nothing scheduled — an unlinked booking, a shelf idea — where nothing happens there _yet_. Category label stays the last resort.
- **A strictly-middle stay night says nothing about the event**: echoing the hotel's name back on the hotel's row is pure repetition, so it falls through to the address.

## The time

Rendered in that event's own zone, **per end** (ADR-0107): a departure in its origin, an arrival in its destination. A flight's two rows read `09:15 · המראה` and `13:00 · נחיתה` — each end's real local clock, never one zone imposed on both. That is the whole reason (c) waited for the zone track.

## Two knock-on simplifications

- **The navigate-to-next tag dropped its time.** It read `היעד הבא · 17:00`; with the row stating its own time that was a repeat, so the tag now says only _which_ row is next. Revises the session-104 amendment's tag content, not its rule.
- **Session 107's `כבר היינו` header stops carrying the whole explanation.** Each row now states its own time, so the partition is self-evident and the header is a label rather than the only evidence for it.

## Mechanics

`DayUsage` gains `eventId` + `edge`. The derivation only **points** at the reference owning the day's moment — following whichever reference won `at` when several merge on one date, so what the row says matches the time it shows — which keeps `place-usage.ts` clock- and zone-free and leaves the screen to resolve wording and zone. `eventEdgeTransition` went into the existing `lib/transitions.ts` (which already owned `transitionLabel`) rather than resolving profile keys at the call site.

## Verification

- `screens/Map.test.tsx` (+4, 2 updated): a scheduled place reads its time and title and **not** its address; a flight's ends read take-off/landing each in its own zone (`09:15` / `13:00` from one 00:15Z→04:00Z span, so the per-end zone is what's under test); an unscheduled shelf idea keeps the address fallback with no time; a mid-stay night shows the address and **not** the hotel's own name. The navigate-to-next test now asserts the tag is exactly `היעד הבא` with the time in the row's own `.map-tag.time`.
- One fixture fix: the `event` helper titled every event after its place, which made `getByText(placeName)` ambiguous the moment the meta line started rendering titles. Titles are now distinct, with a comment saying why.
- `typecheck` + `lint` (0 errors) + `build` + `format:check` green; frontend suite **899** passes (895 → +4).

## Next

**All of ADR-0109's deferred follow-ups are now done** — (a) day-strip all-scope suppression, (b) coordless enrich-from-map, (c) this, (d) `מפה`/view → in-app focus, which is the one that genuinely needs Phase 6's rendered map. Remaining epic work is unchanged: **Phase 5** (Plan-mode research) is unblocked and needs no human step; **Phase 6** waits on the Google Cloud slice (Maps JS + Routes enabled, Routes on the server key, the referrer-locked browser key, the daily quota caps, and current Maps pricing re-confirmed).
