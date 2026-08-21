# The two booking read surfaces were painting the trip's primary zone

**Date:** 2026-08-21
**Trigger:** owner field report — two screenshots of the same TLV → VIE flight, the day card reading `15:30–18:15` and the booking detail one tap away reading `12:30` / `16:15`.
**Outcome:** [ADR-0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) amended (session-258 amendment) and the fix built.

## What the two screenshots actually said

The report named the detail sheet's times as the correct ones. They aren't, and the arithmetic on the screenshots is what settles it — worth writing down, because the wrong pair looks right.

The trip's primary zone is `Atlantic/Reykjavik` (UTC+0). The stored instants are `12:30Z → 16:15Z`.

- **Day card:** `15:30–18:15`, `3:45 שע׳`, `−1 ש׳`. Read as zone-aware times that is Tel Aviv (+3) → Vienna (+2): 2h45 of wall clock plus the hour lost = **3h45 elapsed**, which is the duration it prints. Self-consistent, and a plausible block time for the route.
- **Detail sheet:** `12:30` / `16:15`, `3:45 שע׳`. Read as zone-aware times those are 4h45 apart — contradicting its own duration row. They are only consistent as **two times in one zone**, and that zone is the trip primary: the raw instants, rendered in Reykjavik, for a flight that never goes near Iceland.

So the data was fine and the detail sheet was the defect. Three further checks confirmed it before anything was changed:

1. **`BookingSheet` — the form that sheet's own `✏️ עריכה` opens — has read each end in its endpoint's zone since slice 4a.** The read said `12:30` and the edit said `15:30` about one booking, one tap apart.
2. **`EventDetail`, this sheet's peer, was zone-aware from birth** and its docblock states the rule: _a read cannot state a different time than the row it opened_.
3. A grep over every `formatTime`/`formatDayTime` call site: every other surface already threads `startZone`/`endZone` or `zones?.startZone ?? tz`. The outliers were `BookingDetail` and `scheduleParts`.

The plausible way the data got typed as it did — authoring in the primary zone before slice 4a — changes none of this: after the fix, all four surfaces agree, so re-entering `12:30` (if that is the real departure) now yields `12:30` everywhere. That is a one-tap data edit, not a code change.

## Why it survived nine slices of ADR-0107

Slice 3b's own closing line was "no read surface is left painting one zone", and it was written after wiring the board hero and the glance rail. The two it missed were both about a **booking**, and the reason is the duration: `formatBookingDuration` measures the **instants**, so it prints `3:45` regardless of which zone the clocks beside it are rendered in. A wrong zone with a right duration reads as a coherent screen. It is only visible with two surfaces open at once — which is exactly the report we got, and why the fix ships with the arithmetic written down rather than just the diff.

## What changed

Nothing new was derived; `eventDisplayZones` already answers this. See the ADR amendment for the per-surface detail. The shape worth repeating here: `scheduleParts` took the `ZoneEvidence` **in place of** the `Trip` rather than beside it — `primaryZone` is `trip.timezone` and nothing else on the trip was read, so the narrower dependency is also the one that makes the zone question unskippable at the next call site. `IndexBookingsView`'s row prop went the same way.

Both regression tests were run against the pre-fix code and confirmed failing before being kept.

## Left undone, on purpose

- **`today` / `isEventPast` inside `scheduleParts` stay on the primary zone.** They answer "is this behind me", which is the day-rollover rule (§4), not the display rule.
- **`PlanDay`'s gap machinery** — untouched for the reason the session-128 amendment already records.
- **The change feed** still narrates "moved X to 12:30" in the primary zone. On the backlog with the two questions that make it its own change.
