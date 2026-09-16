# 2026-09-16 — A row with no place, and the drive it was hiding

**Outcome:** [ADR-0232](../decisions/0232-a-journey-is-between-two-placed-stops.md) (**Accepted and built the same day**, on _"Build it with the recommendations"_; build log in its §8) · mockup [`mockups/a-journey-is-between-two-placed-stops-v1.html`](../../mockups/a-journey-is-between-two-placed-stops-v1.html) on the owner's _"Mockup"_ (catalog entry in `docs/design/mockups.md`) · backlog line amended in place (it already existed, under Sharing) · README + INDEX rows.

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

## The mockup (same session, on "Mockup")

Drawn on the shipped CSS (ten sheets inlined), the app's own trees (`EventCard`, `JourneyBlock`, `GapStrip`, `StayRow` + compact `SettleControl`, Plan's `.bld` row and `שבץ` chip), both themes, 360 and 390. §1 is the owner's day before/after with F1 (block position), F2 (origin word) and F5 (strips) as controls; §2 puts the four answers to F3 side by side on a hard-destination hole, the first of them the false overrun that the hole-it-sits-in arithmetic would print; §3 draws the naive chain across a ferry with an unplaced landing on purpose, beside R2's seam; §4 is Plan posture.

**What rendering found that reading had not.** The block's meta line (`.day-trv-meta`) is a `nowrap` flex line with `overflow: hidden`, and ellipsis on a flex container does nothing for its child spans: `מ־Fancy Sheep · חסרות 21 דק׳ לדרך` clipped the digits silently at 360. Today the line has one child and the trap is unarmed. So the proposal's CSS is two rules rather than one — `.day-trv-from` (`--muted`, because the slot's own hue is the clock's amber and a place name may not wear it) and `.day-trv-meta:has(.day-trv-from)` stacking origin and sentence — and the measurement table asks the clip question off the children's boxes rather than trusting `scrollWidth`, which had reported "fits" on a line that did not.

**Measured at 360, both themes:** spanning block with the origin word ⁦40px⁩ against ⁦38px⁩ bare (+2px, the whole cost of F2a under F3a); the day list ⁦371⁩ → ⁦421px⁩; face ⁦40px⁩ with the shipped `::after` overlay at ⁦48px⁩ over the 44px floor; gap strip ⁦20px⁩ and `StayRow` ⁦48px⁩ untouched; §3 naive/seam 2/1 blocks; F1c counts 3 blocks against 2.

## The build (same session, on "Build it with the recommendations")

Two slices, as F6 said. **Slice 1:** `dayRun` (`lib/day-joins.ts`) walks the journey chain beside the join chain — `JoinContext.chain` is required, seeded with the bed — and returns the chain's tail for the leg back into tonight's stay; `DayBlockEntry` carries `legFrom`/`spans`, `DayLeg` carries `spans`, `dayJourney` takes `spannedSeconds` and answers `spansPlaceless`, `dayTravelTotal` takes `{ unplacedLegs, spanningLegs }`. Both surfaces build their legs off the run, look a hole's journey up by the row it leads into, and pass `t.travel.from(autoIsolate(origin))` where the leg spans. **Slice 2:** `travelOrigin({ placed })` walks back to the last placed started stop as a denied claim; Home supplies `placed` from the same endpoint resolution its coordinates use.

**Two things the build corrected in the design.** §4.1 feared ADR-0231's slot walker would miss a spanning leg; it must — asking with the adjacent pair is what keeps the shelf's default slot on the raw hole (R5), and `narrowGapForTravel` refuses a spanning journey besides. And the origin word binds through `bindPrefix` (`מ-Nettó Hofn`, `מארוחת צהריים`), not the mockup's maqaf: the app decided that rule on 2026-08-31.

**One bug the build hit and the tests caught:** Home's `placed` predicate first reached for a `coordOf` helper declared thirty lines below it — a temporal-dead-zone `ReferenceError` that took the whole board down in `Home.lift.test.tsx`. Resolved inline against `places`.

## Next

Field check on a real day with a placeless row (the aurora night is the one to look at), and the backlog's authoring nudge — _"איפה זה?"_ on a placeless row — when it earns a drawing.
