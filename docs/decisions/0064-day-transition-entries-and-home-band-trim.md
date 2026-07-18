# 0064 — Per-day transition entries for bracketed bookings; trim the Home ambient band

**Status:** Accepted
**Date:** 2026-07-18
**Refines:** [0059](0059-booking-presentation-on-home-and-index.md) (the booking-presentation grammar this extends to the day timeline + the Home band it trims), [0054](0054-ambient-span-events-off-the-day-schedule.md) (the ambient backdrop strip whose per-day rule this changes), [0063](0063-category-time-behaviour-profile.md) (the `bracketed` / `isMultiDay` profile every rule here reads), [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) (the read-only detail a transition row opens), [0043](0043-day-view-now-line-phases-and-archive-chrome.md) (day presentation is derived from the clock, never stored)

## Context

Two things surfaced in Assaf's on-the-ground review of the shipped booking presentation (ADR-0059/0054):

1. **The ambient "you're mid-stay" band is over-exposed and mistimed.** The `🏨 מלון קליפורניה · לילה 1 מתוך 2` band renders on both the Home glance ("היום במבט") and the day screen. On Home it is the _fourth_ copy of "there is a hotel" (WiFi tile, glance check-in marker, and the band all say it), and it was observed rendering as _mid-stay_ (`לילה 1 מתוך 2`) at 16:51 while the same card showed `צ׳ק-אין 17:00` — i.e. it claimed occupancy ~9 minutes **before** check-in.

2. **A multi-day bracket has no discrete presence in the day timeline.** A hotel or a multi-day flight is `isAmbient` (ADR-0063), so it is excluded from `dayEvents` and shown only as the backdrop strip. On its **start** day it contributes nothing to the timeline list; on its **end** day the event's own `date` no longer matches `activeDate`, so it is not in `dayEvents` at all. The traveller never sees "check-in 15:00" / "check-out 11:00" (or "departure" / "arrival") as an entry at its real time among the day's other events.

Both are refinements of the same domain (how a bracketed booking presents), so they are recorded together.

## Decision

### A. Trim the ambient band on Home; gate the mid-stay treatment to inside the span

- **The persistent ambient stay band does not render on the Home glance.** The hero already surfaces the stay at its **transition moments** (check-in / check-out) and the **in-transit** treatment for a flight (ADR-0059); the glance already draws the uncounted check-in/out **markers** (ADR-0054). The mid-stay identity does not need a fourth, always-on band competing with "what now / next."
- **Any mid-stay treatment is gated strictly to _inside_ the stay span** — after check-in and before check-out. The observed pre-check-in display is a bug against ADR-0059's "inside a booking = where you are": before check-in you are _not_ in the stay, and the amber check-in transition owns that moment alone.

### B. Per-day transition entries for multi-day bracketed bookings (day screen)

A **multi-day** bracketed booking (`isBracketed && isMultiDay`, ADR-0063) contributes discrete **transition entries** to the day timeline:

- On its **start** day, a start-edge entry at `startsAt` (check-in / departure).
- On its **end** day, an end-edge entry at `endsAt` (check-out / arrival).
- On **middle** days, no entry (see the backdrop rule below).

**Same-day brackets are unchanged** — a flight that departs and arrives on one day stays a single spanning row (its two ends are already both visible in one `08:00–11:00` row). Only multi-day brackets split, because they are the ones that today show nothing in the list. (`isMultiDay` is `endDate > date`; an ADR-0037 overnight tail with no `endDate` is not multi-day and is unaffected — it stays an ordinary block.)

**Behaviour of a transition entry:** a compact **read-only reference row** — badge + transition label (from `CATEGORY_TIME_PROFILE[category].transitions`, e.g. `צ׳ק-אין`) + booking title + mono time. Tapping opens the read-only **booking detail** (ADR-0053), where edit/delete live. It carries **no inline settle/delay/on-way verbs** — it is a derived view of one edge of a span, and mutating "half a span" from it would be ambiguous. **Start-edge entries** (check-in, departure) additionally offer the **Navigate** verb — the one on-the-ground action that fits arriving at a hotel / heading to the airport; end-edge entries (check-out, arrival) are plain reference rows (you are already there / leaving). On a read-only past day the row renders read-only, consistent with the archive (ADR-0029).

Amber accent (time + commitment; ADR-0028) — a transition is a hard, time-anchored moment.

### C. Backdrop strip → strictly middle nights

The `.day-ambient` backdrop strip renders **only on strictly-middle days** of a stay (`date < activeDate < endDate`). Edge days show the transition entry instead, so no day shows the stay twice, and the previously-wrong checkout-day strip (`activeDate === endDate`, not a night) disappears for free. A 1-night stay therefore shows only its two edge entries and no strip (no day falls strictly between check-in and checkout); a 2+-night stay shows the strip on its interior night(s) (`לילה N מתוך M`).

## Architecture (derivation + rendering)

- **One shared derivation.** The per-day start/end logic currently lives inline in `glance.ts` (the Home markers). Lift it to a single pure, unit-tested function — `bookingTransitionsOnDate(events, date)` — returning typed descriptors `{ event, edge: 'start' | 'end', atMs, labelKey }`, reading `isBracketed` + `CATEGORY_TIME_PROFILE.transitions` (ADR-0063). **Both** the Home glance markers **and** the day-screen entries derive from this one function, so the two never diverge.
- **A typed day entry, not a synthetic event.** The day timeline consumes a `DayEntry` union — `{ kind: 'event', … } | { kind: 'transition', … }`. We deliberately do **not** fabricate placeholder `TripEvent`s: a fake event would leak into ripple, verbs, conflict detection, and write paths. Transitions are read-only derived points; a distinct type keeps them out of those paths and honours "derive, never store" (ADR-0043/0054/0018).
- **Merge, don't nest.** Multi-day brackets stay excluded from `dayEvents` (still `isAmbient`). The transition point-rows are merged into the **top-level** day timeline sorted by `atMs`, interleaved with the event groups and the now-line. Points have no span, so they do not participate in the concurrency forest (`buildTimeTree`, ADR-0041) — they sort in by time only.
- **No data-model or backend change.** `startsAt` / `endsAt` / `endDate` already exist and are set by the booking-span path. Entirely derived presentation.

## Consequences

- Touches: `lib/glance.ts` (extract the shared derivation), a small new `lib/day-entries.ts` (the `DayEntry` type + merge + tests), `ui/TransitionRow.tsx` (the shared read-only reference row), `screens/DayView.tsx` and `screens/PlanDay.tsx` (render the merge + the shared `TransitionRow`, and the strictly-middle strip condition), `screens/Home.tsx` (drop the persistent band, gate the mid-stay treatment inside-span), `i18n/he.ts`, `screens.css`. Frontend + derivation only.
- §B/§C apply to **both** the Trip-mode day view (`DayView`) **and** the Plan-mode day builder (`PlanDay`) — the design always meant "the day screen." Both consume the one shared `TransitionRow` and the one `dayTransitions`/`mergeDayEntries` derivation, so the two day screens can't diverge. In `PlanDay` a transition row is a read-only reference only: no grip/drag, no ⋯ menu, no edit-on-tap, not a drop target, and **no Navigate** (an on-the-ground Trip verb; Plan has no live "now"); tapping opens the read-only booking detail. Transition points interleave among the builder groups by instant, and gap chips stay computed between consecutive event groups only (a transition neither opens nor closes a plannable gap).
- Generality: keys on the `bracketed` profile and `transitions`, so any future bracketed category (a multi-day rail pass, a car rental) gets per-day entries for free — not hotel/flight-special-cased.
- The Home glance loses a row of always-on chrome; the hero + markers still carry every edge moment, so no visibility is lost.

## Alternatives considered

- **Synthetic point-`TripEvent`s fed through `buildTimeTree`.** Rejected: reuses the render pipeline but risks fake events leaking into verbs/ripple/conflict/write paths; a typed derived entry is the honest model.
- **Split _every_ bracket into two rows, including same-day flights.** Rejected: a 3-hour same-day flight as two point-rows is noise; the value of splitting is only when the ends fall on different days. Confirmed with Assaf.
- **Keep the band additive on edge days (strip _and_ entry).** Rejected: shows the stay twice on the same day; the entry is the richer representation, the strip is for interior nights only.
- **Drop the backdrop strip entirely.** Rejected: interior nights would then show nothing for the hotel, losing the "which hotel / night N of M" mid-stay context that has no other representation on those days.
- **Give transition rows the full hard-event verb strip (delay / on-way).** Rejected for v1: those write back to "half" of a derived span — more surface, more edge cases. Navigate on the start edge is the one verb that fits and writes nothing.
