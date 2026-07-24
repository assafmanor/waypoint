# Session 96 — Slice 3: the live "now" tracks the itinerary segment's zone

**Date:** 2026-07-24
**Kind:** Implementation slice.
**ADRs:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) §4 (slice 3, **session-96 amendment**), refines [0029](../decisions/0029-trip-mode-day-scope-gating.md) (the read-only gate).

## What this closes

ADR-0107 separates three roles of "timezone": authoring default, sticky **event display zone** (slices 1–2, 4a), and the **live "now"**. This is the third one — the last of the display layer.

Until now every "what day is it" question in the app was answered in `trip.timezone`. On a multi-zone trip that is wrong in the direction that matters most: land in Tokyo at 07:00 local and the app still thinks it's yesterday evening, because it is asking Jerusalem. Now the live clock follows the **segment of the itinerary you're in**, derived from the trip's zone crossings (the itinerary, never GPS — §4).

## What shipped

**1. `currentZone(nowMs, crossings, primaryZone)`** (`lib/places.ts`) — `segmentZoneAt` with the trip primary as fallback. Pure and clock-free like the rest of the resolver: the caller passes the instant, so it stays testable and `getNow()` (ADR-0026) keeps its single ownership at the call site.

**2. The crossings are derived once, in `trip-state`.** `zoneCrossings` is a memo over events + bookings + places, exposed on `TripContextValue`. Before this, `DayView` derived its own. Two reasons it belongs in state: the surfaces must agree (a day-strip anchored to one zone and a now-line to another is a visible bug), and the live zone is read on a **per-minute clock tick** — re-deriving crossings from every event, booking and place on each tick, on every surface, is work the memo does once. The memo also had to move **above** `defaultDay`, which now frames its "today" through it.

**3. Trip mode reads the live zone where it framed the day in `trip.timezone`:** `defaultDay` (trip-state), `today` + `dayScope` + the now-line's clock (`DayView`), the board (`Home`), and the day-strip anchor (`App`, mode-aware). **Plan mode stays on the trip primary** — you plan from wherever you are, you aren't standing in the segment (§4).

**4. The read-only gate moved off the live zone.** This is the case the ADR didn't cover, and the reason slice 3 needed an ADR note rather than just a wiring commit.

`readOnly` had been a pure alias of `dayScope === 'past'` (ADR-0029: a past day is a read-only archive). Once "today" advances on the live zone, that alias breaks mid-flight: fly east overnight, cross the departure instant, and the destination's clock rolls the date forward **while your travel day is still happening** — the day you are living becomes an archive, and you can't touch it. So:

```
dayScope  ← live zone      (the label: is this day past / today / future to me, now)
readOnly  ← the day's own ambient zone   (the gate: is this day over where it happened)
```

`readOnly = todayInTz(dayAmbientZone, now) > activeDate`, where the day's ambient zone is its segment zone at noon — the **same** ambient the slice-2 delta pill already computes, so no new concept. **A day ends when that day's clock says so.**

(The two agree on every single-zone trip and on every day that isn't a crossing day, which is why this only surfaces in flight.)

## Verification

- `lib/places.test.ts` — a `currentZone` describe block: origin zone before the crossing instant, destination at/after it, trip primary when there are no crossings, and the composed case that motivates the slice — `todayInTz(currentZone(…))` returns **2026-07-07** before the crossing and **2026-07-08** after, i.e. the calendar day genuinely rolls with the segment.
- Full frontend suite **768** passes (80 files); `typecheck` + `lint` (0 errors) + `build` green; `pnpm format` clean.

## Still open

- **The board hero's per-event zones + shift pill.** The hero's _framing_ zone is correct now, but `GlanceCard` takes a single `tz`, so rendering each now/next event in **its own** zone (and its shift pill) is a further change — the remainder of the hero inconsistency, tracked on the slice-3 backlog line.
- **Slice 4b** — the editable zone chip + the `displayTimezone` override writer (ADR-0107 §6).
