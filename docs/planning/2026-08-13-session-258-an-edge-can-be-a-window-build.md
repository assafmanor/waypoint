---
date: 2026-08-13
session: 258
kind: build
adr: docs/decisions/0184-an-edge-can-be-a-window.md
design: docs/planning/2026-08-13-session-257-an-edge-can-be-a-window.md
---

# Session 258 — building the edge window

The build of [ADR-0184](../decisions/0184-an-edge-can-be-a-window.md), from the
design settled in [session 257](2026-08-13-session-257-an-edge-can-be-a-window.md)
and its mockup. One pass over `packages/shared`, `backend` and `frontend`.

## What shipped

- **Schema + shared.** `Event.startWindowEnd` / `endWindowStart`, two nullable
  instants and one migration with nothing to backfill. `TimeMeaning` gains
  `window`; `edgeMeaning` reads an authored bound before the profile; two
  predicates ride with it — `windowBoundOf` (one accessor, because pairing an
  edge to its field is the kind of thing that reads fine and inverts silently)
  and `edgeHoldsPosition` (ADR-0171 §10a's width test, named once so the day's
  split and the map's numbering cannot drift apart on it).
- **Backend.** The window rides `bookingEventFields`, so the client's optimistic
  mirror and the server's persistence cannot diverge (ADR-0093). `null` clears on
  the event patch, matching `displayTimezone`; **absent** clears in the booking
  seed, matching `endDate` in the same object — the client rebuilds that seed
  whole, so a window that is gone was removed.
- **Form.** `WhenField`'s span leg takes an optional `windows` prop per end, and
  the affordance is just another `TimeField` — already dashed while empty,
  already panelled, already removable through `onClear`. `TimeField` gains
  `maxTime` as `minTime`'s mirror, so the impossible bound is never offered.
  `BookingSheet` gates the offer on `edgeMeaning(…) !== 'exact'`.
- **Day surfaces.** `placeDayEntries` splits on `edgeHoldsPosition`, so a closed
  window rejoins the list — **in Trip and Plan, from the one derivation**.
  `TransitionRow` renders the range under the title, isolated.
- **Hero + count.** `hero-booking.ts` consults the authored ceiling instead of
  `CHECKIN_GRACE_MIN`, exposes `closing`/`missed`, and promotes a shutting window
  above a departure through one `rankOf`. `glance.ts` stops counting at the
  ceiling. One CSS rule for the miss, three declarations for the placement.

## Three things the code taught

- **`edgeMeaning`'s signature widening is what found every call site.** Adding
  `startWindowEnd`/`endWindowStart` to its `Pick` made the compiler walk the six
  consumers for us. Five of them tested `=== 'exact'` and needed nothing;
  `glance.ts` named a flexible value and was the one real defect the audit
  predicted.
- **`null` versus `undefined` is a real seam here, and it has two answers.** The
  wire needs `null` to mean "clear this"; a rendered `TripEvent` just has no
  window. `eventFromBookingSeed` and `EventForm` both normalise at the boundary —
  and `EventForm` already did exactly that for `displayTimezone` one line above,
  which is where the shape came from.
- **One shipped spec was rewritten rather than relaxed.** `buildSpanSeed`'s
  assertion of the whole seed object now states two explicit `null`s. That is not
  noise: the nulls are what make removing a window expressible, and the spec still
  asserts the shape whole.

## Verification

`pnpm typecheck`, `pnpm build` and `pnpm lint` green. Backend 609 passed.
Frontend **3521 passed**, +24 new — against a pre-existing local baseline of 10
failures in seven files (an `API_BASE_URL` env difference in `Avatar`, the Map
suites and `PlaceKnowledge`, all untouched by this change and failing identically
before it).

New tests, one per piece of logic that can be wrong:

- `icons.test.ts` — a window wins over the profile on its own edge only, reaches
  an ordinary event, is not an exact moment, and holds a position where a floor
  does not.
- `booking-edit.test.ts` — the day a window bound lands on, including the
  after-midnight roll and the end window that must **not** roll forward; and that
  a removed window emits `null`.
- `day-entries.test.ts` — the same stay parks with a bare floor and takes a
  position with a closed window, at its floor rather than its ceiling.
- `glance.test.ts` — counts past the floor, stops at the ceiling, and a windowless
  stay still counts at 21:30.
- `hero-booking.test.ts` — holds past the grace, marks closing only inside the
  window, outranks a departure, says missed, and leaves a windowless check-in on
  the old behaviour exactly.
- `TransitionRow.test.tsx` — the range, its placement under the title, and the
  **bidi isolate characters** rather than the eye.
- `BookingSheet.test.tsx` — mostly assertions of ABSENCE, which is the brief: one
  dashed token per held edge, nothing filled, no prose words, and no offer at all
  on a flight or a restaurant.

**Not verified: the render on a real phone.** The two new pieces of CSS
(`.tr-time.wnd-under`, `.tlabel.missed`) have been seen in the mockup only. That
is ADR-0017's device pass, and it is the one thing this session cannot close.
