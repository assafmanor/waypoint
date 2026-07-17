# 0054 — Ambient-span events (lodging / multi-day bookings) are backdrop, not counted schedule blocks

**Status:** Proposed
**Date:** 2026-07-17
**Refines:** [0045](0045-trip-home-real-data-only.md) (the day-at-a-glance card this fixes), [0041](0041-parallel-overlapping-events.md) (`buildTimeTree` / the block model an ambient span must sit outside of), [0018](0018-timeline-data-model-shape.md) (the `endDate` ambient-span field that becomes the discriminator), [0047](0047-booking-event-linkage-and-notes.md) (a hotel = one Booking backing one Event with an `endDate` span), [0037](0037-overnight-events.md) (distinguishes a true multi-day span from a single overnight tail), [0011](0011-hard-soft-event-model.md) (hard/soft is orthogonal; ambient is a third, presentational axis)

## Context

A hotel is one Event with `startsAt` = check-in and `endsAt` = check-out **days later**, plus `endDate` set (ADR-0047 §1 / `buildSpanSeed`). The day-at-a-glance rail (`lib/glance.ts`, ADR-0045) was built for same-day blocks and mishandles this on both ends (session 2026-07-17, `docs/planning/2026-07-17-session-27-index-post-build-issues.md`):

- **Check-in day:** the window stretches to `Math.max(day23, endsAt)` (`glance.ts:106`, `endMsOf` reads `endsAt` `:54`), so a multi-night stay blows the rail out to *days*, crushing every real event into a sliver — and the hotel is counted in `remaining` (`glance.ts:148-151`), inflating "what's left today" with a thing you don't *do*.
- **Every other night:** the day filters are a strict `e.date === activeDate` (`Home.tsx:47`, same in `DayView`/`PlanDay`); nothing expands an event across `endDate`, so nights 2…checkout are blank.

Assaf named the fix from the user side: "וזה לא צריך להיספר בלוז ב-glance" — a hotel shouldn't be *counted* in the day's schedule. The underlying model error: a lodging span is being treated as an ordinary timed block. It isn't. You don't perform a hotel at a point in the day; it's the **backdrop the day happens inside**.

## Decision

**1. Define an "ambient-span event": an event with `endDate` set** (a multi-day span — today only lodging / multi-day bookings produce it, via `buildSpanSeed`). This reuses the existing discriminator; no new field. It is distinct from an ADR-0037 **overnight tail** (a single night's event ending before the 07:00 cutoff, no `endDate`), which stays an ordinary block and keeps its current treatment.

**2. Ambient-span events are excluded from the counted day schedule.** They do not enter `buildTimeTree`, do not become glance rail segments, and are **not** in the `remaining` count. Consequently the glance window (`day07…day23`, stretched only by genuine same-day blocks + the overnight tail) is correct again — a hotel can no longer distort the rail, and "3 עוד" counts only things you actually have to do.

**3. Ambient-span events render as a backdrop across every day they cover.** On each day from check-in through check-out, the day surfaces a thin ambient strip/header — e.g. "🏨 <hotel>" with check-in / middle-night / check-out framing — above the day's blocks, not inside the proportional rail. This fixes the "blank on nights 2…N" gap (§Context) with the *same* mechanism that removes the distortion: the span is shown as context on all its days, counted on none.

**4. The rule is presentational and orthogonal to hard/soft.** A hotel stays a **hard** commitment (ADR-0011) — guarded on edit, in the Index, feeding "next code" on Home. "Ambient" only changes how it appears **on the day timeline/glance**: as backdrop, not a block. Hard/soft (commitment) and ambient/point (day-presentation) are independent axes, the way `category` and `kind` already are (ADR-0038).

## Consequences

- **`lib/glance.ts`:** partition `dayEvents` into ambient (has `endDate`, spans past this day) vs. same-day; feed only same-day to `buildTimeTree`/segments/`remaining`; the window math then only sees same-day extents. Add the ambient set to the returned model for the backdrop.
- **Day expansion:** a small helper — "is this ambient event active on date D?" (`date ≤ D ≤ endDate`) — lets `Home` / `DayView` / `PlanDay` show the backdrop on every covered day, replacing the bare `e.date === activeDate` match *for ambient events only*. Same-day events keep the existing filter untouched.
- **Day view (`DayView`/`PlanDay`):** the ambient strip appears there too, so a hotel is visible (and openable → its detail view, ADR-0053) on nights 2…N, not just check-in. It is not a settle-able block (ADR-0043/0044) — nothing to Done/Skip about where you're sleeping.
- **No data-model or backend change.** `endDate` already exists and is already set by the booking span path; this is entirely derived presentation, consistent with "phases/now are derived, never stored" (ADR-0018/0043).
- **Board hero (Home now/next):** unaffected here — the hero already shows the next *event*; whether a hotel check-in/out should appear on the hero is the separate "board hero booking presentation" backlog item, not this ADR.
- **Generality:** the rule keys on `endDate`, so any future multi-day ambient booking (a multi-day rail pass, a car rental spanning the trip) gets the same correct treatment for free — it's not hotel-special-cased.

## Alternatives considered

- **Cap the glance window to the day (clamp `endsAt` to `day23`) but keep counting the hotel.** Rejected: fixes the rail distortion but not the wrong `remaining` count, and still renders a hotel as a full-width block competing with real events — the category error remains.
- **Expand a hotel into one block per day and show it in the rail each day.** Rejected: it still counts as a block and still eats rail width every day; the point is that lodging isn't a scheduled block at all.
- **Special-case `BookingType === 'hotel'`.** Rejected: keys on the wrong thing. `endDate` (the actual multi-day property) is the honest discriminator and generalizes to other ambient spans; a car rental across the trip is ambient too, and it isn't a hotel.
- **Introduce a stored `ambient`/`allDay` flag on Event.** Rejected: `endDate` already encodes exactly "this spans days"; a second field is redundant and drift-prone (the thing ADR-0047/0048/0051 kept removing). Derive, don't store.
- **Leave it; document that hotels look odd on the glance.** Rejected: it actively breaks the glance on check-in day (real events unreadable) and hides the stay on other days — not a cosmetic edge case.
