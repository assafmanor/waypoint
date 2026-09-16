# 2026-09-16 — A row with no place, and the drive it was hiding

**Outcome:** [ADR-0232](../decisions/0232-a-journey-is-between-two-placed-stops.md) (**Proposed**, six forks with recommendations, nothing built) · backlog line amended in place (it already existed, under Sharing) · README + INDEX rows.

## What was asked

The owner, with two screenshots of the shipped Trip-mode day at ⁦18:22⁩ (the Map tab's list, and the day list):

> Events/bookings/etc. with no place, i.e. don't appear on the map, shouldn't also count on the driving times, so for example on the screenshots I would've liked if it would navigate from the last stop to the hotel… Let's try to map all possible scenarios, pitfalls and edge cases and see how we make the best UX and usability.

A mapping session, not a build: the deliverable is the scenario map and a decision the owner can pick forks on.

## What reading found

**The mechanism, in three files.** `dayBlocks` (`frontend/src/lib/day-joins.ts`) records the adjacent row as every leg's origin; `DayView` and `PlanDay` turn adjacent pairs plus ADR-0209's three bookend legs into `DayLeg[]`; `useDayTravelReads` (`lib/day-travel.ts`) drops any leg whose end resolves to no place or no coordinates and counts it in `unplacedLegs`. A placeless row therefore deletes the leg into it _and_ the leg out of it, and the journey across it is never a leg. On the screenshot the aurora watch (⁦22:45–00:45⁩, no place) sits between `Nettó Hofn` and the `Setberg` stay row, so the `home` leg into tonight's hotel is dropped and the day's total reads `לפחות` with nothing on screen saying why.

**Two precedents already decided the rule, in other layers.**

- ADR-0213's fourteenth amendment §3 (2026-08-31): the shared page's `journeyLookup` chains the last **placed** row to the next placed row and prints the leg above the row it leads into. Its own text names the app's `planLegs` as having "the identical gap" and backlogs it.
- `nextDestination` (`lib/places.ts`, the `ניווט` tile) already looks past a placeless soft event.

**One refusal points the other way.** `travelOrigin` (`lib/hero-travel.ts`) will not walk back past an unplaced origin: _"offering it would invent a position."_ Written before ADR-0208 gave a shape (`denied`) to a claim the plan cannot back; the ADR resolves it by walking back **as an unbacked claim**, which is the shape ADR-0208 built.

**The map already agrees with the proposal.** `buildDayStopSequence` is built from place usages, so a placeless row is not a stop and the polyline runs placed → placed. The list and the map disagree about a fact today, which ADR-0159 §1 forbids between modes and the same reasoning forbids between tabs.

**Counted, not remembered.** `journeyFor(from, to)` has five readers in `DayView` — the block loop, the `wake`/`arrive`/`home` bookends, and ADR-0231's `livePositions` walker, which asks with the **adjacent** pair (`afterEvent → beforeEvent`). That fifth reader is the one that would silently miss a spanning leg keyed on the placed pair, and it is why the ADR insists the placed origin ride `DayBlockEntry` beside the adjacent one rather than be re-derived at a screen. The same count found the transport case: a flight with one unplaced end resolves that end to `undefined` exactly like a placeless stop, and only `isJourney` / `spendsSpanInMotion` tells the two apart — hence the **seam** rule (R2).

## What the ADR decides, in one breath

The journey chain is between placed stops while gaps and connections stay adjacent; a placeless row that _moves_ you is a seam, not transparent; the spanning leg draws once, under the hole before its destination, and names its origin; across a placeless stop the duration/distance/mode stand and the leave-by, arrive-at and late marks are withheld, with fit measured on the combined slack; the free-time strips stay raw and the total stays `לפחות` because the detour is unknown; the board's origin walks back as an unbacked claim once the placeless row has started. Eighteen scenarios in §3, eight build pitfalls in §4, six forks in §6.

## Next

The owner picks the forks (or says "build it" for the recommendations). Then slice 1: `dayBlocks` grows the placed origin, `DayLeg` grows `spans`, both day surfaces and the five readers move to it, `dayTravelTotal` keeps its floor for the new reason, tests for the eighteen rows. Slice 2: `travelOrigin` and the board.
