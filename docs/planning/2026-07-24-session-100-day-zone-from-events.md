# Session 100 — Bug: a day's zone (and "now") followed the last flight instead of the day

**Date:** 2026-07-24
**Kind:** Bug fix, from a report against the shipped multi-zone build. Corrects the sessions-89/90 ambient rule and session 96's live zone.
**ADRs:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) **session-100 amendment**, [0029](../decisions/0029-trip-mode-day-scope-gating.md) (its gate rides the corrected ambient).

## The report

A real trip with one outbound `בן גוריון → קפלאוויק` flight (07:15, `−3 ש׳`):

- the now-line read **21:31** while the phone read **00:31**;
- on a later day, a **Nicosia** taverna and an **Israeli** restaurant — the same offset as each other — each showed a `+3 ש׳` pill, where the expectation was nothing at all.

## Diagnosis

One rule caused both. The day's ambient zone (sessions 89-90) and the live zone (session 96) were the **itinerary segment**: the destination of the last crossing. With a single outbound flight and no return, that is Iceland for the rest of the trip. So:

- 21:31 was **correct Reykjavik time** — the app believed the traveler was in Iceland;
- both bookings were `+3` against an **Iceland** ambient. Nicosia (+3) and Jerusalem (+3) each differ from Iceland (0) by three hours, so each earned a pill — against a zone nothing on that day was in. The pill is supposed to mean "this event is somewhere other than the rest of this day," and it was measuring against the wrong "rest of this day."

The segment is the right answer when nothing better is known. It is the wrong answer when the day itself says otherwise — and a day full of Cyprus bookings says so plainly.

## The fix

**1. A day's ambient zone is evidenced by that day** (`dayAmbientZone`): the zone its own events agree on, when the ones with a **known** zone share a UTC offset at that day's noon; else the segment at noon; else the trip primary.

Three details that make it sound rather than clever:

- **Offsets, not zone ids.** Nicosia and Jerusalem always agree about the time; a day split between them is one ambient, not a mixed day.
- **Only known zones vote** — a pin or a place with coordinates. A placeless event's zone _is_ the segment zone, so letting it vote would only ever confirm the segment and make the rule a no-op.
- **A zone-crossing event never votes.** It is the thing that moves you between zones; it can't testify about where a day sits. (A same-zone hop can.) A multi-day stay does vote on its middle nights — that's where you're sleeping.

**2. The live "now" is where the plan says you are** (`liveZone`): an event **in progress** (a crossing in progress reads its destination, §8), else the **nearest** known-zone event within `LIVE_ZONE_WINDOW_MS` (12h either side — a booking an hour away places you; one five days out says nothing), else the ambient zone of the day the segment puts you in.

The window is the load-bearing bit: without it, "nearest event" would drag the clock to next week's flight on a quiet evening.

**3. `ZoneEvidence`** bundles what these questions resolve against (events, bookings, places, crossings, primary zone), derived once in `trip-state` and read by `DayView`, `Home`, `App` and `defaultDay` — so the surfaces cannot drift on what they resolve from. It replaces the `(crossings, primaryZone)` pairs those call sites passed.

Still **itinerary-driven, never GPS** (§4) — a better reading of the same evidence, not a new signal.

## Verified against the reported data

Reconstructed the trip from the screenshots (Stokksnes, the TLV→KEF flight, Copenhagen, TGI Fridays on day 24; the Nicosia taverna + the Israeli restaurant on day 25) and ran the real resolvers at 00:31 local:

|                   | before                       | after                                                             |
| ----------------- | ---------------------------- | ----------------------------------------------------------------- |
| live zone → clock | `Atlantic/Reykjavik` → 21:31 | **`Asia/Nicosia` → 00:31**                                        |
| day-25 ambient    | `Atlantic/Reykjavik`         | **`Asia/Nicosia`**                                                |
| taverna pill      | `+3 ש׳`                      | **none** (reads 00:00)                                            |
| הנכד של אברם pill | `+3 ש׳`                      | **none** (reads 07:00)                                            |
| day-24 ambient    | `Atlantic/Reykjavik`         | `Atlantic/Reykjavik` (unchanged — a real travel day, mixed zones) |

## Tests

`lib/places.test.ts` — the `dayAmbientZone` block rewritten for the new signature plus a `the day's own events` group (consensus beats the segment; agreement by offset; abstain on a mixed day; placeless events don't vote; a crossing doesn't vote; a stay votes on its middle nights), and a `liveZone` group (the reported case end to end; an in-progress event's own zone; the destination mid-crossing; an event days away ignored; the segment fallback). Full suite **822** passes; `typecheck` + `lint` (0 errors) + `build` green.

## Note on what was _not_ changed

The premise that the itinerary — not the device — decides where you are stands (§4 rejected GPS deliberately). If a traveler's phone zone and their plan ever need reconciling, that's a confirmation nudge, not a new authority, and it isn't built.
