# 2026-09-03 — The shared page was on the destination's clock

**Task:** the owner, against the public reader page — _"the live sharing page uses the current time
in the destination as 'now', instead of deriving the time dynamically by the events, the same way
that the app does everywhere else"_.

**Shipped:** `SharedDay.timezone` on the projection contract, `shareNowZone` in the reader,
`dayAmbientZone` + `ZoneEvidence` + `zoneOffsetMinutes` + `DAY_NOON`/`DAY_MIDNIGHT` promoted into
`@waypoint/shared`, one duplicate offset probe deleted from the backend, and amendments to
[ADR-0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) (the zone model) and
[ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)
(the surface). No mockup: nothing about the layout changes.

## What the report was, precisely

The page asked `trip.timezone` — the trip's **primary** zone, which is the destination's — for
both halves of _now_: which card wears `עכשיו` (`shareToday(now, trip.timezone)`) and what the
marker's clock reads (`shareTimeLabel(now, trip.timezone)`). The labels it compares that clock
against are resolved **per event**, in each event's own display zone. So on any day the trip is
not standing in its destination — the trip's first morning, most obviously — the page marked a
card and drew a marker hours off every number beside it.

## The sentence that was wrong, and it was ours

ADR-0213's eleventh amendment §6 defended shipping `trip.timezone` as _"the client runs
`@waypoint/shared`'s own `todayInTz`, the same function every day surface in the app runs"_. That
is true of the function and false of the zone: every day surface in the app runs it over a zone
the itinerary answers (`liveToday` = `todayInTz(liveZone(…))`). A claim about "the same
derivation" that names only the outer function is the shape of mistake to watch for — the
argument was checked at one level and the defect was one level in.

## Why this is the sixteenth amendment happening again

That pass (2026-09-01) promoted `eventDisplayZones` because ADR-0197 §5 had moved the zone
**primitives** to the shared package and left the **composer** behind: the server had every part
of the answer and not the answer, so it reached for `currentZone`, a different question. Its
lesson was written as _"a promotion that stops at the primitives leaves open the door it was
closing"_.

The same promotion stopped one **rung** short. This model answers four questions — where are you
standing now (`liveZone`), where is this day lived (`dayAmbientZone`), what does this clock mean
(`eventDisplayZones`), what does a typed time mean (`authoringZone`) — and after the sixteenth
pass the server could reach the third and not the second. So sharing did what the server did
before: took the nearest thing that type-checked. **The test for a promotion is not "did the
parts move" but "can every consumer reach the rung its question is on."**

## The rung a shared page is on is the DAY, not the moment

Worth writing down because the obvious lift is `liveZone` and it is the wrong one.

The page is a stack of day cards shipping pre-formatted labels, so the zone it needs is the zone
those labels were resolved in — the day's. And on every day the marker is actually drawn the two
coincide by construction: `shareNowLine` refuses a day carrying `zoneShiftMinutes`, so the day it
accepts is a day whose every label resolved in that day's own ambient zone.

Per-moment would also have cost something real. `liveZone`'s first two rungs are piecewise
constant in the clock, so shipping them means shipping the **instants** at which the zone
changes — which are event edges and flight departures — on a contract whose Summary level exists
to carry no exact times. A day's zone leaks nothing the route strip does not already imply.

## The two seams, which per-day zones create and which had to be answered

Consecutive days in different zones do not tile, so `shareNowZone` states both rather than
letting an array order decide:

- **Overlap** (flying east): the day you are standing in and the destination's next day both
  claim the same hours. First card wins — the same generous reading `isDayOver` already takes
  (ADR-0029's session-96/103 amendments).
- **Gap** (flying west): a Tokyo day ends six hours before the following Israel day begins, and
  no card claims those hours. They take the clock of the last day behind us, which is the one
  you are still flying out of.

It walks with `dayPhase` rather than a fourth spelling of the comparison — §7 lifted that helper
out of two surfaces for exactly this reason, and it is also what keeps a card that swallowed two
days (`SharedDay.endDate`) today while either of them is.

## Three near-misses, all of the same kind

None is a type error, and each would have shipped something broken with all the machinery
built:

1. **`Event.endDate` was not in `SHARE_EVENT_SELECT`.** `eventsOnDate` reads it so a multi-night
   stay votes on every night it covers. A column absent from a `select` is not a compile failure;
   it is a middle night with no voter, falling through to the trip primary. Pinned by a spec that
   reads a night nothing else sits on, with the span deleted and re-asserted inside the same test.
2. **Prisma spells `date`/`endDate` as `Date`, and `eventsOnDate` compares day keys as strings.**
   A `Date` there matches nothing and reads as "no event is on this day". Every other array in
   `ShareZoneContext` crosses the shared-resolver seam with `as never` because the runtime shapes
   already agree; the event rows now go through a named adapter, `zoneEventEvidence`, whose
   docblock is entirely about why it is a translation and not a cast.
3. **`frontend/e2e/` is not type-checked at all**, and `e2e/shared-itinerary.spec.ts` stubs a
   whole `SharedItinerary` through `page.route` — annotated with the real type. Adding a
   required field left the stub short of it, `tsc` stayed green, and the signal was a zod
   parse failure in a real browser: eleven tests red at once, none pointing at the fixture.
   Caught here by reading the e2e specs before CI reported rather than by CI, then verified
   both ways locally. `frontend/tsconfig.json` is `include: ["src", "vite.config.ts"]`; a probe
   program over `e2e/` reports ~20 errors (no `@types/node`, `window.navigation`,
   `Animation.animationName`, some genuine `null` fixes), so closing it is its own change and
   is a backlog line under **Testing** rather than this PR.

**What the three have in common** is worth naming: every one is a place where a type says a
shape is right and the runtime disagrees — a Prisma column not selected, a `Date` where a
string was meant, a program the checker never sees. Adding a required field to a shared
contract is exactly the change that finds them all at once, and none of them fails at the
boundary you edited.

## What was verified

- The projection spec's zone fixture (built from the owner's own outbound, 2026-09-01) now starts
  the day **before** the flight with one placed dinner in Tel Aviv. Three assertions, one per
  rung of `dayAmbientZone`: the home day is `Asia/Jerusalem`, the travel day resolves to the
  hotel because both legs abstain, the empty day after resolves to the segment.
- Two screen tests that change **only** `SharedDay.timezone` against a fixture whose primary zone
  stays Iceland's: the marker reads `12:00` rather than `09:00` and lands on the other side of a
  `09:30` row, and at 02:30Z the card marked `עכשיו` is the 30th rather than the 29th. Both were
  run against the old `trip.timezone` derivation and both fail there — the negative check, not
  assumed.
- `shareNowZone`'s own unit tests: the claim, the overlap, the gap, both ends of the trip, an
  empty spine, and a two-day card.
- `frontend/src/lib/places.test.ts`'s existing `dayAmbientZone` coverage now runs against the
  shared implementation through the re-export, unchanged — the same evidence of a
  behaviour-preserving lift the sixteenth pass used.
- Full `pnpm typecheck` + all three suites green (`535` shared, `5273` frontend, `1256` backend).

## Still open

- **The change feed still narrates in the trip's primary zone** (`docs/backlog.md`, found session
  258). Untouched, and now the last surface doing it. It is a different problem — a change row
  carries a payload rather than an entity — and the backlog line already scopes why.
- **Plan mode's day machinery is single-zone** (backlog, session 128). Also untouched, also
  deliberately: it is internally consistent, and moving it is one change covering four
  derivations.
