# Session 128 — the shelf types in the day's zone

**Date:** 2026-07-26
**Branch:** `claude/places-epic-next-cyms6c`
**ADR:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) (session-128 amendment)

Started as a question about the Map-tab mockup: the `צ׳יפ אזור־הזמן על שדה השעה` panel
reads as unbuilt in the app — is it a later phase? It isn't. The chip shipped in slices
4b/4c (sessions 98-99), and a flight really does get the mockup's two chips. Three
things make it look absent, and reading them apart is what found the bug:

1. it is **read-only whenever a place answers the zone** (ADR-0107 §3), which is now the
   common case — the mockup draws both examples with the tappable caret;
2. its label is `Tokyo · GMT+9`, not the mockup's Hebrew `טוקיו`;
3. one surface that types times **has no chip at all** — the real gap.

## The bug

The Trip-mode shelf's schedule sheet (`ScheduleSheet` in `DayView`, ADR-0116 §5) has a
`WhenField` and builds instants from what you type — in `trip.timezone`. The day view
then renders the created row in the event's **resolved** zone. On a multi-zone trip
those differ, so an idea slotted at 19:00 on a pre-departure day came back at 16:00.

Its own comment claimed the sheet "gains the zone chip's grammar for free" from
`WhenField`. It doesn't: the chip is opt-in per call site (`zone` / `zones`), so the
sentence was true of the primitive and false of the caller. Worth naming as a class —
**a shared primitive doesn't confer a behaviour its props gate.** Same shape as the
session-102 finding (shared resolver, per-screen inputs), one layer down.

## What shipped

**`authoringZone(base, {date, time}, evidence)`** (`lib/places.ts`) — `EventForm`'s
local two-pass `derivedZone` generalized out rather than copied (rule 8). It returns
what `eventDisplayZones` will return for the saved event, which is the whole point: the
form and the view print the same clock. It takes the one `ZoneEvidence`, so `EventForm`
stopped hand-assembling its own context.

**No time typed yet → the day's noon stands in.** Previously an undated draft fell back
to the trip primary, so the chip stated one zone and the first typed digit could change
it. A fresh draft now starts in its day's zone (ADR-0107 §3 step 2). This is a small
behaviour change in `EventForm` too, in the same direction.

**The sheet gained the chip** — editable only when no place answers, writing the same
`displayTimezone` override every other form writes (`ScheduleFields.displayTimezone`
already existed and was never sent).

**Two smaller corrections in the same flow:** `nextSlot`'s prefill is read on the clock
it will be typed on (a default in another zone is a lie), and the schedule toast
confirms the time in the event's own zone instead of the primary.

## What was deliberately left

**Plan mode's gap machinery.** `PlanDay` computes gaps, their labels, the gap-fill
create and the drag-to-another-day round-trip in one base zone. It is internally
consistent that way, and fixing only the authoring half would create events outside the
gap the user tapped. It moves to per-day zones as one change — including the
wall-clock-vs-instant question on a cross-day drag — and is on the backlog.

**The chip's English city label** (`Tokyo · GMT+9`). It is `zoneLabel`'s shape
everywhere the shared `ZonePicker` is used (ADR-0113), so it is a picker-wide copy
decision, not a chip fix.

## Tests

`places.test.ts` — a new `authoringZone` block on ADR-0107's own worked example (a Tokyo
trip with a TLV→NRT outbound): a pre-departure time typed on the origin clock, a
post-arrival one on the destination, a picked place winning over the segment while a
coordless Place-lite doesn't, the noon stand-in for an untyped time, and the round-trip
property — the instant it builds reads back as the time that was typed, where the trip
primary shifts it six hours.

`EventForm.test.tsx` — its trip-state mock now exposes `zoneEvidence` instead of a loose
`zoneCrossings`, matching the real context.

No render test for the sheet: `DayView` has no test harness (same gap noted in session
104 for Home), and the zone decision it makes is unit-tested at `authoringZone`.
