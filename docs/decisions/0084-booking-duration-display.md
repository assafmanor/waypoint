# 0084 — Booking duration display: one per-category unit, derived

**Status:** Accepted (2026-07-19) — the `auto` rounding is superseded by [0114](0114-elapsed-duration-ladder.md) (2026-07-24)
**Date:** 2026-07-19

> **Note (2026-07-24, ADR-0114):** the `auto` unit's "hours on one calendar day, days when it spans days" rule below rounded on a **calendar-date crossing**, so a 23:00→00:00 booking read "יומיים". [ADR-0114](0114-elapsed-duration-ladder.md) replaces that with one **elapsed-time** ladder (minutes → hours → days → weeks → months → years). The per-kind units this ADR established (**nights** for lodging, **hours** for transport) stand unchanged.

**Relates:** [0063](0063-category-time-behaviour-profile.md) (the per-`category` time-behaviour profile this extends — same closed lookup, same derive-don't-store discipline), [0059](0059-booking-presentation-on-home-and-index.md) (the booking row/detail/hero grammar the read-out lands in), [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) (the Index detail view), [0038](0038-icons-and-canonical-category.md) (`category` is the semantic axis this keys on).

## Context

Booking previews — the Index list rows and the read-only detail view (ADR-0053/0059) — showed only a transition **moment** (a check-in day, a departure time), never **how long** the booking lasts. "3 nights", "a 5-hour flight", "a 2-day hike" are exactly the at-a-glance facts a traveller wants, and they read differently per type: a flight is naturally **hours** (even a red-eye that crosses midnight), a hotel is **nights**, an activity is **hours** when it's same-day but **days** when it spans days.

The wrong fix is a `switch (booking.type)` in every surface — the exact per-type scattering ADR-0063 replaced for bracketed/ambient. Duration should be one more **derived behaviour declared once per category**.

## Decision

**Add a `durationUnit` to the ADR-0063 `CategoryTimeProfile` (the closed lookup beside the icon registry), and format duration through one shared helper every preview reads.**

- **Profile field** (`@waypoint/shared`): `durationUnit: 'hours' | 'nights' | 'auto'`.
  - `transport` → `hours` (a flight/train reads in hours, regardless of a day crossing).
  - `lodging` → `nights` (check-in → check-out).
  - every other category (the ordinary profile) → `auto`: **hours** on one calendar day, **days** when it spans days.
- **Derived accessor** `eventDurationUnit(event)` keys on `category` (null → the ordinary `auto`), exactly like `eventTransitionKeys`. Nothing stored.
- **One formatter** `formatBookingDuration(event, timeZone)` (frontend `lib/booking-timing.ts`) turns the unit + the event's own timing into words, reusing the event picker's hour phrasing (so "5:45 שע׳"/"שעתיים" never drift) and Hebrew `nightPhrase`/`dayPhrase`. Returns `null` when there's nothing to measure (no schedule, or a same-day point with no end).
- **Surfaces read the one helper:** the detail view adds a `משך` fact; each Index row appends the duration to its schedule line. A new category (or a new bracketed type) gets a correct read-out for free — no per-surface branching.

## Consequences

- Previews now answer "how long", not just "when": a hotel shows "3 לילות", a flight "5:45 שע׳", a multi-day activity "יומיים", a lunch "שעתיים".
- The per-type logic lives in one lookup + one formatter; the four surfaces (and any future one) call `formatBookingDuration` and stay dumb. This is the "standardize so we don't re-do it per type" the change was asked for.
- It's derived and keys on `category`, so it applies to any event, not only Bookings (a manual `lodging` event with an `endDate` reads in nights too), matching ADR-0063 §4.
- Hebrew nights take a plain numeral from two up ("2 לילות"), **not** a dual word — unlike days/months ("יומיים"/"חודשיים"). `nightCount` encodes that exception.

### Amendment (2026-07-19) — a booking's duration keys on its type, and the edit form reads nights

Two follow-ups after the first build:

- **Key the unit on `booking.type`, not the linked event's `category`.** A booked event's category is icon-overridable (ADR-0038 amendment), so a hotel badged with a ⭐ read in days. `bookingDurationUnit(type)` resolves the unit from the type — matching `timingLabels`, which already keys the check-in/out wording on the type — and the Index row + detail view pass it. `formatBookingDuration` takes the unit as an optional third arg (defaulting to the event's category) so it stays reusable.
- **The edit form's span read-out reads nights too.** The `WhenField` `span` variant is elapsed-time by default ("משך: יום" for a 43h stay); it now takes a `durationUnit` and, for `nights`, phrases the two calendar days as לילות with no "crosses a day" note (a stay always does). `BookingSheet` passes `bookingDurationUnit(type)`.

## Alternatives considered

- **A `switch (booking.type)` per surface.** Rejected — the per-type scattering ADR-0063 exists to prevent; three-plus copies that drift.
- **Reuse `formatCountdown` (lib/time) directly.** It steps minutes → "H:MM שעות" → day-count, but has no `nights` and no per-category unit — it's a countdown, not a typed duration. The new formatter delegates hour phrasing to shared i18n keys instead of duplicating, but owns the unit selection.
- **A single "auto everywhere" unit** (hours < a day, else days). Rejected — a hotel in "hours"/"days" reads wrong; nights is the traveller's unit for lodging. The per-category unit is the point.
