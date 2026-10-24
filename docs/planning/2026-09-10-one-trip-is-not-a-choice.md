# One trip is not a choice

**2026-09-10.** A one-line ask and a one-function change, recorded because it reverses a line
of an accepted ADR. Decision record: the 2026-09-10 amendment to
[ADR-0033](../decisions/0033-all-trips-home.md).

## What was asked

Owner:

> "When a trip is running (and only one is running), or if there's only one active trip
> (unfinished), opening the app should be on the trip and not on the all trips screen."

## What reading the code found

1. **Half of it already held.** `resolveLanding` (`frontend/src/lib/active-trip.ts`) opened a
   live trip on a cold reopen since ADR-0033's 2026-07-16 revision. What it did not do was open
   the one upcoming trip when nothing was live: ADR-0033 §2 said "do not auto-open a future
   trip", written for the case where the list is an overview. With one row it is not one.
2. **The parenthetical resolves a deferred case.** ADR-0021 left overlapping live trips with a
   ponytail, and `resolveActiveTrip` picked the earliest start. "And only one is running" is a
   condition, so with two live and no last-opened tiebreak the load now goes to the list, which
   already draws both as heroes under `עכשיו`.
3. **`resolveActiveTrip` had one consumer.** Counted, not remembered: the landing rule and its
   tests. The All-trips page marks its hero from `tripChip`. So the function is deleted rather
   than left as a second rule beside the new one.

## The second report, the same day

The owner tested the build on the start date of a trip, fifteen hours before the flight:
_"I have a trip that starts today but it still routes to the list."_ `tripChip` read today in
the trip's own zone, and the destination was a day behind, so the trip was still `soon`. The
list's `בעוד` countdown had had exactly this fixed earlier the same day (ADR-0107's 2026-09-10
correction) and the correction had explicitly left the buckets and the landing on the trip
zone. Owner: _"It should use same device day yeah."_ So the chip now counts from
`DEVICE_TIMEZONE`, which moves the list's sections with it.

## The third report: the shared page, at the same hour

Screenshot at 00:50 at home on day one: the public itinerary's masthead read `מתחילים מחר`. Two
causes, both in `SharedItinerary`'s clock. Before day one `shareNowZone` fell back to the trip's
**primary** zone, a day behind for a westward trip; and the share's dawn rule filed 00:50 on the
night before, which is right inside the trip and meaningless before it. The projection now ships
`trip.homeZone` (the first crossing's origin) and the page begins the trip at midnight at home,
the instant the app's own eve clock counts to. Recorded as ADR-0213's 2026-09-10 amendment.

## What shipped

- `trip.homeZone` on the shared projection; `shareNowZone` reads it before day one, and the
  page's dawn boundary starts with the trip. Backend spec, page test and zone unit test added.
- `tripChip` reads the device's day, so the landing and the list's sections agree with the
  `בעוד` countdown about which day it is.
- `resolveLanding` restated as "exactly one candidate opens": the live trips if any, else the
  upcoming ones; two or more, or none, is `/trips`. The manual-pick and last-opened-live
  branches are unchanged.
- Tests for the new branches (one upcoming opens; several upcoming, several live, or all
  finished go to the list); the `resolveActiveTrip` suite removed with the function.
- ADR-0033 amended in place; `app-shell.md`'s routing tree and §5, and the two index rows.

## Not done

- The e2e boot fixtures (`frontend/e2e/boot.ts`) were not touched: every spec that wants the
  list navigates to `/trips` by URL, and `bootIntoTrip` seeds one live trip, which lands in the
  trip under both the old rule and the new one.
