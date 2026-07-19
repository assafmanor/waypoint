# 0083 — WhenField: one date/time entry standard (single-day + multi-day span)

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates:** [0036](0036-event-time-setter.md) (the amber TimePicker grammar this reuses and generalizes), [0037](0037-overnight-events.md) (overnight is the single-day cap the span variant lifts), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber = time & commitment, the accent the time field wears), [0017](0017-mobile-first-device-targets.md) (phone-primary, touch-first — the keyboard-never-covers-a-field rule), [0047](0047-booking-event-linkage-and-notes.md) / [0048](0048-index-build-data-model-refinements.md) (the booking↔event seed the span/day values feed). Supersedes the `DateTimeField` `datetime` mode introduced under review finding **U-05**.

## Context

Two rival grammars collected a date/time, and the forms mixed them:

- **Events** (and single-day bookings): a full-width native date field + the amber `TimePicker` (quantized quick-pick + exact-time fallback, overnight-aware; ADR-0036/0037). Clean, liked.
- **Multi-day bookings** (flight / hotel / activity): `DateTimeField mode="datetime"` — a native `<input type="date">` and a native `<input type="time">` **crammed side-by-side in one bordered box**. On a narrow phone (RTL) the date got `flex: 1; min-width: 0` inside `overflow: hidden` while the intrinsically-wide native time held its width, so **the date was clipped to nothing**, and the native time rendered **AM/PM** on some OSes despite `lang="he"`. A user screenshot showed exactly this: a span field reading ":23 PM" with no visible date.

Three further problems compounded it: the when-block sat at the **bottom** of the booking form (after code + notes); the booking sheet had **no keyboard-reveal** (the on-screen keyboard covered the fields — `EventForm` had `onFocusCapture` scroll-into-view, `BookingSheet` did not); and because two primitives existed, any **new** entity or form type could pick the broken one again. The ask was explicitly to make the fix a **standard** so bad date/time layout can't recur.

## Decision

One canonical primitive — **`WhenField`** (`frontend/src/ui/primitives/WhenField.tsx`) — is the only sanctioned way any form collects a date/time. It has two variants covering every case:

- **`variant="day"`** — a single day + a same-day start→end range. The date is the full-width native date field; the time is the amber `TimePicker` unchanged. Value: `{ date, start, end }`. Used by `EventForm` and single-day bookings (restaurant/other).
- **`variant="span"`** — two endpoints (departure→arrival, check-in→check-out, start→end) that may fall on **any two trip days**, NOT capped to one calendar day. Each endpoint is the same grammar: a full-width native date field beside a **compact** tap-to-open amber time field, with a derived **`+N` days** badge and a **duration read-out** between the legs. Value per endpoint: `"YYYY-MM-DDTHH:MM"` — exactly what `buildSpanSeed` already consumes, so the save path is unchanged. **Bounds:** the start is bounded to the trip range `[tripStart, tripEnd]`; the end is bounded to `[start, tripEnd]` — its date picker's earliest day is the start's day, and `BookingSheet` rejects a same-day end at/before the start time on save (a time-less end stays intentionally open-ended). Time-of-day is unbounded (a trip is bounded by days, not hours).

**One shared time atom.** Both pickers are built on a single `TimeField` primitive — the tap-to-open amber time control (exact `<input type="time">` fallback + 15-minute scroll list + nearest-round suggestion + auto-close-on-pick). The event composes it as the _start_ alongside a duration field (single day, overnight-capped); the span composes it per endpoint alongside a native date (two days, uncapped). So the event and booking time pickers behave and look identically — they differ only in what they compose around the atom (duration vs. a second date).

The standard bakes in four rules so the bug is structurally impossible:

1. **No native control in a squeezed horizontal row.** Every date/time part is either a full-width native field or a tap-to-open field owning its own full-width panel. The date is native (a real OS calendar, can't be clipped, renders in the device convention); the time beside it is a _compact custom_ field, so the date always keeps its room. This is what fixes the crop + AM/PM.
2. **One time grammar everywhere.** The amber scroll-list time picker (with an exact native fallback, always 24h) drives single-day and span alike. The span simply drops the overnight cap; the crossed day is shown, not rejected.
3. **Placement is part of the standard.** "When" sits **first** in the form body, directly under the identity row (title, or route origin→destination) — not after the incidental fields.
4. **Panels auto-close on pick, and the keyboard never covers a field.** Picking a time row commits and closes the panel (matching the `TimePicker`); the scroll-into-view focus reveal lives in the shared sheet container, so every form — present and future — inherits it.

`DateTimeField` (the `datetime`/`date`/`time` primitive from U-05) is **removed** — `WhenField` is self-contained and replaces it, so no overlapping primitive remains to misuse.

## Consequences

- The two screenshot bugs (clipped date, AM/PM) are structurally impossible: the date is full-width native, the time is our own 24h control.
- Multi-day spans are now first-class: a flight can depart Sunday 23:20 and arrive Monday 17:05 with a clear `+1` badge and a "17:45 שעות" duration read-out, entered in the same grammar as a single-day event.
- Every form routes date/time through one component, so a **new** entity/form type gets the correct layout, placement, and keyboard behaviour for free — the "never again" the change was asked for.
- The span endpoint's arrival day defaults to the departure day, so a same-day trip needs only its time picked; a later day stays freely selectable.
- `mode="datetime"` and its tests/CSS are deleted; the value contracts (`{date,start,end}` and `"YYYY-MM-DDTHH:MM"`) are preserved, so `buildEventSeed` / `buildSpanSeed` / `dateOutOfTripRange` are untouched.

## Alternatives considered

- **A single unified control with a multi-day duration** (end entered as "2 days 3h", end-date derived). More elegant and closest to "just like the event picker", but a bigger build and fiddly multi-day duration phrasing. Deferrable: it can later be layered onto the same `WhenField` span variant without changing its value contract or call sites.
- **Fix only the datetime CSS** (stack the native inputs, force 24h). Cheapest, but still leans on per-OS native `datetime`/`time` rendering — the exact source of the AM/PM + clip variance — and leaves two primitives, so a new form could still reach for the wrong one. Rejected: it isn't a standard we control.
- **A custom date scroll-list** (both date and time as tap-to-open panels, fully symmetric faces). Rejected: a native `<input type="date">` gives a real calendar (better for far dates), matches the event date grammar the user pointed to as the model, and — being full-width beside a compact time field — cannot clip. The asymmetry (native date, custom time) is the same one the shipped event form already uses.

## Reference

Design mock: `mockups/when-field-v1.html` (before/after, the auto-closing time panel, the `+N` badge + duration read-out).
