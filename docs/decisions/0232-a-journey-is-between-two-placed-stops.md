# 0232 — A journey is between two **placed** stops, and a row with no place is transparent to it

**Status:** **Proposed 2026-09-16.** Nothing built. The forks in §6 carry a recommendation each and wait for the owner's pick.
**Date:** 2026-09-16
**Reported:** the owner, with two screenshots of the shipped day (Trip mode, 2026-09-16 ⁦18:22⁩): _"Events/bookings/etc. with no place, i.e. don't appear on the map, shouldn't also count on the driving times, so for example on the screenshots I would've liked if it would navigate from the last stop to the hotel… Let's try to map all possible scenarios, pitfalls and edge cases and see how we make the best UX and usability."_
**Session note:** [`planning/2026-09-16-a-row-with-no-place-and-the-drive-it-was-hiding.md`](../planning/2026-09-16-a-row-with-no-place-and-the-drive-it-was-hiding.md)

**Refines:** [0206](0206-a-travel-time-belongs-between-two-points.md) §AT2 (`unplacedLegs` and the `לפחות` floor), §AZ1 (_"a leg between two placed rows always draws"_ — this ADR decides which two rows those are), §AD (the map's route is the day's sequence of **placed** stops — the list now agrees with it); [0208](0208-a-claim-needs-something-to-stand-on.md) §2 (a claim the plan cannot make is reported as such — extended from a _skipped_ origin to an _unplaced_ one); [0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s fourteenth amendment §3 (the shared page already chains placed rows — the app adopts the same rule and the same drawing position); [0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) (the bookend legs are the case the report is about).
**Applies unchanged:** [0011](0011-hard-soft-event-model.md) (a journey is a read; it moves nothing), [0207](0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md) (a fix may back a claim the plan cannot make, never create a leg), [0159](0159-the-day-says-what-is-between-two-events.md) (gaps and connections keep their **adjacent** pairing — only the _journey_ chain changes), [0225](0225-two-things-at-one-time-are-one-stop.md) (a cluster is one stop; its exit member is still where the chain reads the place from).

## Context

### What the screenshot shows, and what the code does

The day: `ארוחת צהריים` ⁦17:00⁩ → drive ⁦~51⁩ → `Nettó Hofn` ⁦18:15–19:15⁩ → `3:30 שע׳ פנויות` → `צפייה בזוהר הצפוני` ⁦22:45–00:45⁩ (no place) → `Setberg Guesthouse` (tonight's stay, the ADR-0209 row). The one leg the traveller is certain to make tonight, the drive from the supermarket to the hotel, is drawn nowhere — while the Map tab, on the same data, already draws its line straight from `Nettó Hofn` to `Setberg` because the aurora watch has no pin to route through.

The mechanics, read rather than remembered:

- **The list pairs journeys by adjacency.** `dayBlocks` (`lib/day-joins.ts`) records `from` = the previous event row for every row; `DayView` and `PlanDay` turn each adjacent pair into a `DayLeg`, plus the three bookend legs of ADR-0209 (`arrive` → `woke`, `woke` → first row, last row → `sleeps`). `Home` builds one leg, `travelOrigin` → `horizon.next`.
- **A leg with an unresolvable end is dropped.** `useDayTravelReads` (`lib/day-travel.ts`) resolves each end through `endpointPlaceId`; where either end has no place or no coordinates the leg is counted in `unplacedLegs` and never asked. `dayJourney` then has neither duration nor distance and answers `null` — §AZ1's _one_ legitimate silence.
- **So one placeless row deletes two legs**, the one into it and the one out of it, and the journey across it is never a leg at all. On the screenshot: `Nettó` → aurora (dropped), aurora → `Setberg` (the `home` leg, dropped). The total reads `לפחות` and the reader cannot tell why.

### Two precedents already in the codebase, and one refusal

- **Sharing chains placed rows** (ADR-0213 §3, `sharing-projection.service.ts` `journeyLookup`): _"carrying the last placed row forward leaves the placeless row where it is and joins the two points that actually exist"_, drawn _"above the row it leads into"_. The app's `planLegs` was named there as having _"the identical gap"_ and left alone because a read-only projection was not the place to decide it. Backlog line: _"A journey between two points with an unplaced stop between them is understated on both surfaces"_.
- **Navigate-to-next looks past a placeless row** (`nextDestination`, `lib/places.ts`): _"a placeless soft event is nothing to navigate to, so the derivation looks past it."_
- **`travelOrigin` refuses to walk back** (`lib/hero-travel.ts`): _"the stop before it is somewhere you have already left, and offering it would invent a position."_ Written before ADR-0208 gave a shape to a claim the plan cannot back. §2 R6 below is where that tension is resolved.

### The map and the list disagree today

`buildDayStopSequence` is built from **place usages**, so a row with no place is not a stop, the polyline runs placed → placed, and the pin numbers skip the row. The list, pairing by row, has no journey where the map has a line. ADR-0159 §1 forbids the two modes disagreeing about a fact; the same rule reaches two surfaces.

## 1. What a row with no place _is_

**A claim about time, and only time.** `צפייה בזוהר הצפוני 22:45–00:45` says when; it says nothing about where — not _"at the previous place"_, not _"on the way"_, not _"at the hotel"_. Every design below follows from refusing to invent the missing half.

Three things count as "no place" for a journey, and they already resolve identically in `useDayTravelReads`:

- an event with no `placeId` (the aurora watch, `לארוז`, a phone call);
- a Place-lite row with no coordinates (ADR-0147 — enriched later, and the chain starts applying the moment it is);
- a transport end that resolves to neither (`endpointPlaceId` answers `undefined`).

**Not** in the set: a **skipped** row (it has a place; the group denied being there — ADR-0208 §2, and it has already left the list for the shelf, ADR-0228), a **clockless** row (it is in the commitments strip or the ideas tail, never in `positioned`, so adjacency never sees it), a **cancelled** booking (off the day).

## 2. Decision

### R1. The journey chain is between placed stops; the join chain stays adjacent

A **join** (gap or connection, ADR-0159) is still measured between adjacent rows: `3:30 שע׳ פנויות` between `Nettó` and the aurora is a true statement about the clock, and a placeless row still opens and closes free time. A **journey** is measured between the last placed stop behind a row and the next placed stop ahead of it, however many placeless rows lie between. One leg per placed pair, never one per hole.

The map, the shared page and both day surfaces then describe the same object. This is what ADR-0206 §AZ1 already says in words — _"a leg between two placed rows always draws"_ — read literally.

### R2. A row that **moves** you and has an unplaced end is a seam, not transparent

A placeless _stop_ is transparent because you are still wherever the plan last put you. A placeless **journey row** (a flight, a train, a ferry — `isJourney` / `spendsSpanInMotion`, `@waypoint/shared`) is the opposite: it relocated you, to somewhere the plan cannot name. Chaining across it would draw a road route beside a train ride the row already states — the false-path claim ADR-0206 §AA4 refuses.

So the chain **restarts** after such a row: from its placed end where it has one (a flight from `TLV` to nowhere-known still has a departure airport the leg _into_ it can reach), otherwise from the next placed stop. A **held** span (a car hire, ADR-0063's profile) does not move you and is not a seam — it never was a leg's endpoint.

### R3. The journey draws once, in the hole before its destination

Where a leg spans placeless rows, its block renders in the hole directly above the row it leads into — the same position ADR-0213 §3 chose for the shared page (_"the most fitting part of the day"_, in the owner's words), and the position the day already keys every journey by (`journeyFor(from, to)` hangs off the destination entry's join; the map's amber leg is _the leg arriving at_ the selected stop, §AC2).

On the screenshot that puts `נסיעה · ~51 דק׳ · 65 ק״מ` between the aurora row and the `Setberg` row — exactly where the owner asked to see it.

**The block names its origin when the row above is not it**: `מ־Nettó Hofn`. A word in an existing slot, no new axis — §AE's precedent for skipping the mockup gate; fork F2 decides whether it is wanted at all.

### R4. Across a placeless stop, the measurement stands and the clock advice is withdrawn

The leg's **duration, distance, mode and mode control** render as on any leg. What does not: `יציאה עד`, `הגעה ~`, the `--miss` paint and the `OVERRUNS` sentence measured from the hole the block sits in.

The reason is R1's premise. A leave-by is _"the last moment you may leave the origin"_ and it assumes you are at the origin until then. With the aurora between, you may make the drive at ⁦19:15⁩ or at ⁦00:45⁩, and the plan cannot say which; a leave-by counted back from the hotel's clock is advice about a departure from a place you may have left five hours earlier. ADR-0208's shape, one case wider: the measurement is a fact about the plan; the advice is a claim about a person, and here there is nothing for it to stand on.

**Fit is measured against the combined slack**, not the hole the block is drawn in: `(destination start − origin end) − Σ(placeless rows' durations)`. A ⁦15⁩-minute hole under the block holding a ⁦51⁩-minute drive is _not_ an overrun when the ⁦3:30⁩ above the aurora would have held it; a plan that does not fit even when the placeless rows are counted is the only one that may say so, and it says it with the existing `TOO_TIGHT` / `OVERRUNS` arms.

### R5. The free-time strips stay raw, and the total stays a floor

Neither hole is narrowed by the spanning journey (`narrowGapForTravel` is not applied to it): narrowing the ⁦3:30⁩ says the drive is before the aurora, narrowing the hole below says after, and both invent a position. Each strip is therefore a **ceiling**, which is the same claim a free-time strip already makes wherever the app has no estimate (§D4).

`dayTravelTotal` keeps `לפחות` for a day with a spanning leg — not because the leg is unmeasured (it is), but because the direct route _does not count the stop between_ (ADR-0213 §3's cost, stated there in as many words): the aurora may be a ⁦60⁩ km detour. §AT2's word, §AT2's reason, one sentence wider. `unplacedLegs` shrinks to what remains genuinely unmeasurable after chaining (a seam with no placed end, a day whose only rows are placeless and whose two stays are one place) and a second count, **spanning legs**, joins it as the floor's other cause.

### R6. The live leg and the board: the origin claim is _unbacked_ once a placeless row has started

Before the aurora starts, the plan says you are at `Nettó` and the spanning leg is backed like any other — the day row may say `בדרך`, a fix may say `עדיין כאן`. Once the aurora has started, the plan's last claim about where you are is _"somewhere"_. That is the shape ADR-0208 §2 built for a skipped origin — the leg's first point is still returned so a fix can test it, and **nothing is asserted on it alone** — applied to a second cause.

So `travelOrigin` walks back to the last **placed** started stop and reports the claim as not standing (the `denied` flag today; fork F4 asks whether it earns a second name), the board makes the read only where a device fix puts the traveller at that stop or on the leg (`originStands`, already there), and the day row's `claimDenied` covers the spanning leg from the moment the placeless row starts. The docblock's refusal (_"would invent a position"_) is answered rather than overruled: the walk-back invents nothing once the claim it carries is marked as one the plan cannot make.

### R7. What does **not** change

- **The board's `הבא בתור` is the next commitment in time**, placed or not. A placeless next stop earns a countdown and no travel line — there is nowhere to route to, and `nextDestination` already looks past it for the `ניווט` tile. Two questions, two answers, as today.
- **`travelEstimateSchema` and the route cache.** The span is a fact about the **leg** (`DayLeg.spans`, the rows it crosses), never about the estimate, which is still A → B direct and still one cache key. The backlog's _"no shape for a leg that knows it spans an unplaced stop"_ was looking in the wrong layer.
- **The map.** It already chains. The change is a contract test that the list's placed pairs and `buildDayStopSequence`'s consecutive stops are the same pairs on the same day.

## 3. The scenario map

`A`, `B` are placed rows; `X`, `Y` placeless; `H1`/`H2` stays. "Today" is the shipped build; "R" is the rule above.

| #   | Scenario                                                         | Today                                              | Proposed                                                                                                                                              |
| --- | ---------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `A → X → B`, `B` hard and timed                                  | no leg either side; total `לפחות`                  | one leg `A→B` under the hole before `B` (R3), `מ־A`, no leave-by (R4), fit on combined slack, total `לפחות` (R5)                                      |
| 2   | `A → X → H2` — **the screenshot**                                | `home` leg dropped                                 | `A→H2` between `X` and the stay row; `הגעה ~` withheld (R4; a stay is a floor anyway, §AI1); `ניווט` on the row unchanged                             |
| 3   | `H1 → X → A` — placeless first row                               | `wake` leg dropped                                 | `H1→A` above `A`; the morning's `יציאה עד` withheld once `X` has started (R6)                                                                         |
| 4   | `A → X → Y → B` — two or more placeless rows                     | three legs dropped                                 | one leg `A→B`; both rows' durations come off the slack (R4)                                                                                           |
| 5   | `A → X → A` — same place both sides                              | two legs dropped                                   | no journey (same-place pair is already skipped, not counted); no `לפחות` for it                                                                       |
| 6   | `H1 → X → … → H2`, nothing placed all day, hotels differ         | every leg dropped                                  | one leg `H1→H2`, the hotel change — a drive nobody could see before                                                                                   |
| 7   | Same as 6, one stay                                              | every leg dropped, `לפחות` over nothing            | no journey, no total (same-place pair)                                                                                                                |
| 8   | `A → [flight, destination unplaced] → B`                         | both legs dropped                                  | `A→flight-origin` draws; the flight is a **seam** (R2); `flight→B` stays unmeasurable and counts in `unplacedLegs`                                    |
| 9   | `A → [car hire pickup, held] → B`                                | as any placed pair                                 | unchanged — a held span is not a leg endpoint and not a seam                                                                                          |
| 10  | `X` is **hard** (a video call ⁦20:00–21:00⁩, no place)           | as any placeless row                               | identical to 1 — hardness is about editing (ADR-0011), not about where                                                                                |
| 11  | `X` crosses midnight (the aurora ends ⁦00:45+1⁩)                 | —                                                  | the `home` leg into tonight's stay is unaffected; tomorrow's `wake` leg starts from the bed as today (`sleepsIn`, `travelOrigin`)                     |
| 12  | `A → X → B` with `now` inside `X`, board open                    | origin `X`, no read                                | origin walks back to `A` as **unbacked** (R6); a fix at `A` or en route backs it, else silent — no late mark either way                               |
| 13  | `A → X → B` with `now` in the hole after `A`, before `X`         | origin `A`, dest `X` → no read; `ניווט` tile → `B` | unchanged on the board (R7): the countdown is to `X`; the day row for `A→B` is backed and live                                                        |
| 14  | Plan mode, same days                                             | `planLegs` identical gap                           | same chain, same block position; the slot note `מתוך … · … מהם דרך` rides the hole before `B`; the picker's offer in the hole above is a ceiling (R5) |
| 15  | Cluster (ADR-0225) whose exit member is placeless, a peer placed | leg out of the cluster dropped                     | the chain reads the place from the **exit member**, so it walks back into the cluster's placed peer; one stop, one place, as §4 says                  |
| 16  | Place-lite origin or destination (ADR-0147)                      | dropped, `unplacedLegs`                            | transparent like any placeless row; starts applying on enrichment, with `legsKey` picking the change up                                               |
| 17  | Skipped `A` between placed rows (`A` on the shelf)               | already adjacent-chained by removal                | unchanged; ADR-0208's `denied` still governs the board's origin claim                                                                                 |
| 18  | Map tab, Plan mode, day scope                                    | polyline already `A→B`                             | unchanged; gains the agreement test (R7)                                                                                                              |

## 4. Pitfalls the build must not fall into

Counted at the call sites, not remembered.

1. **Keying the journey by the adjacent pair.** `journeyFor(from, to)` has **five** readers in `DayView` — the block loop, `wake`, `arrive`, `home`, and ADR-0231's `livePositions` walker (which asks with `afterEvent → beforeEvent`, i.e. the adjacent pair). A spanning leg keyed `Nettó>Setberg` is invisible to a walker asking `aurora>Setberg`. `DayBlockEntry` therefore carries the **placed** origin (`legFrom`) beside the adjacent `from`, both surfaces build legs from `legFrom`, and every reader asks with it. One derivation in `dayBlocks`, as its docblock already insists.
2. **Counting one journey twice.** A leg spanning `X` must not also appear as `A→X` or `X→B` in `dayLegs`, `dayFeasibility` or `dayTravelTotal`. The chain replaces the adjacent legs; it does not add to them.
3. **Narrowing a hole by a journey that may not be in it** (R5). `narrowGapForTravel` and ADR-0231's position walker must skip spanning legs, or the shelf's default slot and the `+` land on time the drive may be eating — silently, the failure ADR-0231 §1 was written against.
4. **Letting a seam be transparent** (R2). A transport row with one unplaced end resolves that end to `undefined` exactly like a placeless stop; only the predicate tells them apart. Test both.
5. **Redefining `unplacedLegs` without moving `לפחות`** (R5). After chaining, `unplacedLegs` alone would clear the floor on the screenshot day and the total would read as complete over a detour of unknown length. `dayTravelTotal`'s required argument grows to cover spanning legs, and the argument stays required.
6. **Forgetting the fingerprint.** `useDayTravelReads` re-resolves on `legsKey`; a leg's spanned rows are part of what it reads (their durations feed the slack), so they belong in the key or an enrichment never re-fires.
7. **Leaving `travelOrigin`'s docblock as it stands** (R6). The refusal is quoted and reasoned; a build that walks back without rewriting the reason leaves the next reader "fixing" it back.
8. **Drawing the leave-by anyway because the arm allows it.** `dayJourney` cannot see rows; the caller passes `flexibleArrival` today for the same reason. A `spansPlaceless` input (or reusing `claimDenied`'s withdrawal) has to reach it explicitly — nothing in the arithmetic knows on its own.

## 5. Consequences, stated

- **The screenshot day gains the one leg it was missing**, in the place the owner pointed at, with the fact (`~51 דק׳ · 65 ק״מ`, `נסיעה`) and without an ETA it cannot honestly give.
- **Fewer `לפחות` totals for the wrong reason, the same `לפחות` for the right one.** A day with a placeless stop still says its total is a floor — now because the detour is unknown, not because a leg was thrown away.
- **List, map and shared page describe one set of legs.** The map's cache already holds every pair the list will now ask for (same coordinates, same `routeLegKey`), so the change costs no route requests.
- **The known cost is a real one**: a placeless row that is in fact a ⁦60⁩ km detour reads as a ⁦65⁩ km day. R5 says so with `לפחות`; nothing can say how much more. The honest fix for _that_ is a place on the row, and the authoring nudge for it belongs to ADR-0134/0147's surfaces, not here.
- **§M's mockup gate**: the arithmetic and the position draw no new axis; `מ־X` is a word in the block's existing sentence (§AE precedent). If F2 grows past a word, draw first.

## 6. Forks for the owner

Recommendation first on each.

- **F1 · Where the spanning block draws.** **(a) Under the hole before its destination** (R3, matches sharing and the `journeyFor` key) · (b) in the hole after its origin · (c) once in each hole, one measurement. — _(a)._ (b) puts the drive to the hotel above the aurora, which reads as "drive, then watch, then arrive" — a claim; (c) double-draws a single fact.
- **F2 · Whether it names its origin.** **(a) `מ־Nettó Hofn` when the row above is not the origin** · (b) no word; the reader infers. — _(a)._ Without it the block under the aurora reads as the drive _from the aurora_, which is the invented position R1 refuses.
- **F3 · Clock advice across the span.** **(a) Withhold `יציאה עד` / `הגעה ~` / late marks; fit on combined slack** (R4) · (b) a conservative leave-by assuming the placeless rows happen at the destination (`B.start − Σ X − travel − buffer`) · (c) `הגעה ~` only, from the origin's end. — _(a)._ (b) is right when the aurora is at the hotel and wrong by hours when it is at the supermarket; (c) claims you leave at ⁦19:15⁩.
- **F4 · The board's origin across a started placeless row.** **(a) Walk back to the last placed stop as an unbacked claim** (R6; reuses ADR-0208's gate and ADR-0207's fix) · (b) leave `travelOrigin` silent. — _(a), as a second slice_ after the day surfaces; (b) is today's behaviour and is honest, just less useful with a fix in hand.
- **F5 · The free-time strips beside a spanning leg.** **(a) Raw, each a ceiling, `לפחות` on the total** (R5) · (b) narrow the hole the block is drawn in. — _(a)._ (b) invents the position (a) refuses and can push the ⁦15⁩-minute hole under the block negative.
- **F6 · Build order.** **(a) Day list + Plan in one slice (`dayBlocks` → `DayLeg.spans` → the five readers → totals), the board second** · (b) all at once. — _(a)._ The board's half touches ADR-0208's gate and deserves its own field check.

## 7. Alternatives considered

- **Assume the placeless row is at the previous place.** The cheapest rule and the most common truth (you watch the aurora from the car park) — and the one the owner's own example breaks: watching from the hotel is at least as common, and the ⁦51⁩-minute drive would then be drawn on the wrong side of a ⁦2⁩-hour event, with a leave-by to match. R1's whole premise is that this half-fact is not ours to fill in.
- **Assume it is at the next place.** Symmetric, and symmetric in its failure.
- **Ask, at journey time, where the row is.** Right instinct, wrong surface: a nudge on the row (_"איפה זה?"_ with the place picker) is ADR-0134/0147's authoring question and makes the row placed, after which nothing here applies. Worth a backlog line of its own; not this ADR.
- **A new estimate shape carrying the span** (the backlog's framing). The span is about the leg, not the route — R7. Putting it in `travelEstimateSchema` would put a plan fact into a cache keyed on coordinates, which ADR-0205 §4 forbids by design.
- **Leave the app as it is and fix the data.** Every placeless row is a row somebody chose not to place, often because the place is unknowable (the aurora) or trivial (a call). The app owes the journey around it either way.
