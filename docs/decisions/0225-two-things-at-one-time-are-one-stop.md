# 0225 — Two things at one time are **one stop**

**Status:** **Accepted and built 2026-09-13**, in one session with the design. Owner, on the mockup: _"Let's build this"_ — the recommendation on every fork in §9 stands as decided. Build log in §10.
**Date:** 2026-09-13
**Mockup:** [`mockups/two-things-at-one-time-are-one-stop-v1.html`](../../mockups/two-things-at-one-time-are-one-stop-v1.html)
**Session note:** [`planning/2026-09-13-two-things-at-one-time-are-one-stop.md`](../planning/2026-09-13-two-things-at-one-time-are-one-stop.md)

**Refines:** [0041](0041-parallel-overlapping-events.md) — the containment forest and its clusters stand; this says what a cluster IS to the three surfaces that never read that ADR as a rule: it is one stop in the day, with one position, one number and no journey inside it.
**Amends in place:** [0121](0121-embedded-map-phase-6-design.md) §6 (a pin's number is the index of a **stop**, and two peers are one stop), [0160](0160-the-hero-lifts-and-shows-a-horizon.md) §6/§12 (`הבא בתור` carries its peers as equals, the way `עכשיו` already does), [0206](0206-a-travel-time-belongs-between-two-points.md) §D2 (a journey belongs between two **stops**; there is none between two peers).
**Applies unchanged:** [0011](0011-hard-soft-event-model.md) (soft overlap is sanctioned; the ⚠ line is the only flag), [0028](0028-plan-violet-color-budget-dark-ready.md) / root rule 4 (no new hue; the peer cue is neutral ink), [0214](0214-the-night-board-has-one-subject-and-it-is-tomorrow.md) §8 (the strip already draws a cluster as one block), [0017](0017-mobile-first-device-targets.md).

## Context

The owner, with four screenshots of one Iceland morning — Seljalandsfoss and Gljúfrabúi both `08:30–10:00`, Faxi Bakery Cafe at `10:15`:

> Overlapping events are not handled correctly with regards to timing and order. Let's discuss and mockup how everything should be handled in the map, the day view and the hero (+lifted hero).

What the four surfaces said about one stop:

- **Map:** Gljúfrabúi `1`, Seljalandsfoss `2`, an amber leg drawn between them, `היעד הבא` on Seljalandsfoss alone.
- **Day:** `בו-זמנית · 08:30–10:00`, Seljalandsfoss listed **first**. The map and the day disagree about which peer is first.
- **Hero (night board):** `מחר · Seljalandsfoss · 08:30`. Gljúfrabúi is not mentioned.
- **Lifted hero:** `הבא בתור Seljalandsfoss`, then `אחר כך 10:15 Faxi Bakery Cafe`. The peer is skipped as if it were not tomorrow's plan.

**Reading the code turned four symptoms into one cause.** ADR-0041 decided that two overlapping events are one cluster — and then four consumers each broke the tie between the cluster's members their own way. Counted (root `CLAUDE.md`, "count the call sites"):

1. `lib/time.ts` `buildTimeTree` (the day's brace): start, then `sortOrder`, then a **stable** sort — the order the API returned, `date, sortOrder` and then storage order.
2. `lib/map-pins.ts` `buildDayStopSequence` (the pin's number and the route): the moment, then `sortOrder`, then `nameOf(...).localeCompare` — **alphabetical**. Then `++counted` gives the two peers `1` and `2`, and `Map.tsx`'s `dayLegs` draws a leg between every consecutive pair.
3. `lib/time.ts` `byPrimaryNow` (the hero's title): hard, ends-soonest, starts-first, `sortOrder`, stable. Right for choosing the loud one, and then `Board`/`HeroLift` print `nextAll[0]` and drop `nextAll[1..]`.
4. `lib/places.ts` `nextDestination` (the map's `היעד הבא`): earliest upcoming start, first-in-array on a tie.

Both waterfalls carry `sortOrder: 0` — every new event's default (`events.service.ts`, `input.sortOrder ?? 0`) — so on this day the **tail** of each comparator was the whole decision, and the tails differ.

**And one defect the screenshots could not show, because the spans were equal.** `deriveNow.nextAll` is "everything sharing the earliest upcoming _start_", while ADR-0041's cluster is "everything that _overlaps_". For `08:30–10:00` beside `09:00–10:30`, the day braces them and the lifted hero says `הבא בתור Seljalandsfoss` then `אחר כך 09:00 Gljúfrabúi` (`hero-horizon.ts` `thenAfter`: first start strictly after the next start). The mockup's `חופפים חלקית` toggle draws it.

**Three surfaces already had the rule and nobody had written it down.** The day's journey rows measure into the cluster's earliest start and out of its latest end (`lib/day-entries.ts` `groupStartEvent` / `groupEndEvent`); `dayBlocks` refuses a join _inside_ a cluster ("a cluster is two things at once"); the tomorrow strip draws a cluster as one block (0214 §8). The map and the hero never inherited any of it because it lived in three call sites and no ADR.

## Decision

**A cluster is one stop.** It has one position in the day, one number on the map, one journey in and one journey out, and no journey inside it. Its members are **peers**: the app may order them, but it may never claim you go from one to the other.

### 1. One comparator for peers, and its tail is `createdAt`

`byPeer(a, b)`: hard first (the anchor, 0011) → start → `sortOrder` (the user's own choice, when they made one) → `createdAt` → `id`. It lives in `lib/time.ts` beside `byPrimaryNow`, and **every** consumer that orders or picks among a cluster's members ends in it: `buildTimeTree`'s sibling layout, `buildDayStopSequence`'s tie, `byPrimaryNow`'s tail, `nextDestination`'s tie. Four tails become one.

Why `createdAt` and not the two tails in use today: "the one you added first" is an order a person can reconstruct; alphabetical over names that mix Hebrew and Latin is not, and storage order is not guaranteed to agree between two devices.

### 2. One number for every peer

The number claims "this is the N-th stop of the day", and both places _are_ the N-th stop. So `buildDayStopSequence` counts a cluster **once** and every peer wears that count; the stop after it is `N+1`. This narrows 0121 §6's "a place you go to twice is two stops" to what it was reasoning about — a revisit — exactly as 0171 §7 narrowed it for a connection.

Rejected: `1a`/`1b` (an order inside the stop, which is the one thing not known); a number on the first peer only (a bare pin already means "an edge with no known moment", 0171 §10b — the hotel bookend — and a second meaning for the same emptiness is the one that breaks); one pin for the cluster (0121 §6 already refused clustering, and the places are genuinely apart).

### 3. No leg inside a stop

`Map.tsx`'s `dayLegs` walks consecutive **stops**, not consecutive pins: the route enters the cluster at its entry peer, leaves from its exit peer, and draws **no amber leg between peers** — the day has no join there (`dayBlocks`), so there is no duration to give it, and 0206 D1 spent solid amber on a real routed leg only. Between peers the map draws a short **dashed neutral tether**, `DayConnector`'s own reserved grammar ("dashed because a straight segment is not the route you will walk"), saying only "these belong to one stop". It carries no time. It is a fork (§9 F2) and the mockup's control turns it off.

### 4. The amber ring on every peer, the word once

`היעד הבא` is a claim about time, and it is true of every peer: each gets the `nextstop` ring. The **word** is printed once, on the entry peer, because two amber tags on one stop are noise and the ring already spends the budget. `nextDestination` therefore answers a **set** (the cluster) and the pin decides the word by `entry`. Same for `nowStop` when the cluster is in progress.

### 5. Entry = first start, exit = last end — named and shared

`clusterEntry(peers)` = the peer that starts first, ties by `byPeer`; `clusterExit(peers)` = the peer that ends last, ties by `byPeer` reversed. They live in `lib/day-entries.ts` where `groupStartEvent`/`groupEndEvent` already are (those two are them, with their tie-breaks made deterministic), and **three readers** take them: the day's journey rows (unchanged in behaviour), the map's route (`buildDayStopSequence` orders peers so the entry is first and the exit last inside the stop), the hero's leg (`hero-travel.ts` measures into the entry peer). The list order inside the brace is `byPeer`, so on the day list the entry peer is the first card under the journey row above, and the exit peer is the last card above the journey row below — the same picture as the map, by construction.

Rejected: the geographically nearest peer as entry — it makes the list's order depend on coordinates the list does not have, overrides a user's drag, and on the reported day would have moved a 22-minute leg by 600 metres. Kept as a possible later refinement for the case where neither `sortOrder` nor time says anything.

### 6. The board names the peer; the lift lists it

- **Collapsed board:** the title stays the primary (`byPrimaryNow`; one loud element, 0028). The meta line gains, in its own ink, `בו-זמנית · Gljúfrabúi` — the day's word for the brace and the peer's name when there is one; `בו-זמנית · ועוד 2` when there are more. Measured: the line does not wrap at 360 (`17px → 17px`), and the board does not grow (`138px → 138px`).
- **Lifted hero:** under the `הבא בתור` block, a `בו-זמנית` label and one `.hero-equal-hd` row per peer — the row 0160 already draws for a group-split `עכשיו`, at a second host. Measured cost at 360: `+59px` for one peer (label + `32px` row). `Where`/`Note`/`Tasks`/`Settle` stay on the primary.

Rejected: `ועוד 1` (0160 retired that expander because it hides what it counts; the name is what was asked for); a second title (one loud element).

### 7. `nextAll` is the cluster, and `אחר כך` is the next group

`deriveNow` returns as `nextAll` the **cluster** (0041's forest, built over the upcoming events) that holds the earliest upcoming start — not "everything sharing that start". `thenAfter` returns the first event **not in that cluster**. For equal spans nothing changes; for `08:30–10:00` + `09:00–10:30`, `אחר כך` stops naming a peer the day has already braced.

### 8. What does not change

The tomorrow strip and the Home glance rail (a cluster is one block already, 0214 §8 / 0215); the ⚠ conflict line for hard-vs-soft overlap (0011); Plan's `הזז` (0041 §5) and its `.bld-cluster`, which iterates the same `g.items` as the day and so inherits the order; the countdown (to the cluster's first start, as today); `knowsMoment`'s refusal to number a floor or a ceiling.

### 9. Forks for the owner — decided 2026-09-13 as recommended

- **F1 — the comparator's tail.** `createdAt` (recommended) vs. alphabetical (the map's today) vs. storage order (the day's today).
- **F2 — the tether.** A dashed neutral line between peers (recommended, off by control) vs. nothing.
- **F3 — the number.** The same number on every peer (recommended) vs. on the entry peer only.

### 10. Build log (2026-09-13)

What the build did, and where it departed from the drawing above:

- **`byPeer`, `peerEntry`, `peerExit`, `clusterAround`** live in `lib/time.ts` beside `byPrimaryNow`. `buildTimeTree`'s sibling layout and `byPrimaryNow` end in `byPeer`; `deriveNow.nextAll` is `clusterAround` the earliest upcoming start, primary-first; `nextDestination` sorts by start then `byPeer`. Four tails are one.
- **`groupStartEvent`/`groupEndEvent` kept their names.** §5 said "`clusterEntry`/`clusterExit`… those two are them"; renaming a function two surfaces already read for a third to adopt is a second name for one thing, so the day's helpers now call `peerEntry`/`peerExit` and the map calls the same two directly.
- **The map's clusters are the day's own.** `buildDayStopSequence` reads `buildTimeTree` over its stops' events (`peerKeysOf`) rather than re-deriving overlap, and only a start-edge moment can be a peer — a same-day hire's return is a second visit to the counter, not a second place you are at during the pickup. Peers carry `DayStop.peerKey`, sit together at the earliest peer's slot in entry-first/exit-last order, and the count increments once per key. `amberLegIndex` walks back to the entry peer, so asking about the second place never spends the amber on the tether.
- **The tether is `MapDayLeg.tether`**, drawn by its own MapLibre layer (`wp-route-tether`, under everything in `PAINT_ORDER`) with `MAP_CONNECTOR.TETHER` — the connector's neutral ink at weight 1.6 and dash `[1.2, 2.4]`, so in Plan mode, where every leg is already a neutral dash, it still reads as a different kind of line. No end dots, no stub. Drawn in **both** modes: Trip mode's `paneLegs` keeps the amber leg and the tethers. The `near` emphasis skips a tether to land on the first real leg after the amber one. `useDayTravel` on the Map still asks for the pair's estimate (it decides modes, not journeys); the day list never did.
- **`nextDestination` answers the stop**: `NextDestination.peers` is every mappable member of the cluster around the lead, and the lead is the entry peer by construction (earliest start, `byPeer` ties). `Map.tsx` rings `nextStopIds` and prints the word on `nextStopId`; the pin carries `MapPin.nextPeer` ("ring, no word") and `PinMarker` reads it for both the tag and the accessible name. The list row keeps the word on the lead only. Home's quick tile reads the lead, unchanged.
- **The hero.** `HeroHorizon.nextPeers` is `nextAll` past its primary as points, and `canLift` counts a peer as depth. `Home` hands the horizon the whole cluster only when the board's `shownNext` is `deriveNow`'s own next — a check-out standing in for next is one moment and goes in alone, as before. `thenAfter` excludes every member of `nextAll` (the §7 defect). The lift takes `nextPeers: HeroLiftPeer[]` (key · icon · title · pre-isolated range) and draws the `בו-זמנית` block between the next row and `Where`; the board takes `BoardNext.peers` (titles) for the meta line. Times are formatted in each peer's own zone (`eventZones`), like every other clock on the card.
- **Two CSS rules** (`.hero-peers .hero-lbl`, `.hero-peers .hero-equal-hd`) and one string (`board.peersMore`). The `.wp-board-next-meta .peer` rule the mockup drew is not needed: the meta line already renders in that ink. §Consequences' "four rules, one empty" is therefore two.
- **Tests:** `time.test.ts` (byPeer's tail and precedence, entry/exit on equal and partial spans, `clusterAround`, `nextAll` as the cluster, back-to-back is not overlap, a chain), `hero-horizon.test.ts` (`אחר כך` skips a later-starting peer, a peer lifts), `day-entries.test.ts` (entry/exit ties), `map-pins.test.ts` (shared number, entry-first order, partial overlap, the amber leg's walk-back, no resolver → no clustering), `places.test.ts` (peers ride along, entry leads), `Board.test.tsx` and `HeroLift.test.tsx` (the peer line and the peers block). Frontend: 304 files, 5,555 tests green; typecheck and build clean.
- **Not built, by §8:** nothing on the strip, the rail, the ⚠ line, Plan's `הזז`, or the countdown.

## Consequences

- **One derivation, three readers, no new stored state.** `byPeer`, `clusterEntry`/`clusterExit` and a cluster-shaped `nextAll` are pure and unit-testable beside `buildTimeTree`'s existing cases (equal spans, partial overlap, hard-in-cluster, three peers).
- **The map's stop traversal (0182) steps by stop**, so a stop with two places frames both in one step. Not drawn; a build consequence to verify on a device.
- **`buildPinOrderIndex` maps two places to one number**, which its `Map<placeId, order>` already allows; the `pinZIndex` spread by order gives peers equal z, and the tier order decides between them as it does for coincident pins.
- **Shipped defect found by counting, fixed by §7:** `thenAfter` names a cluster peer as `אחר כך` whenever peers start at different times.
- **Proposal CSS was four rules, one of them empty; the build needed two** — the honest size of what the surfaces grow. The rest is derivation.

## Alternatives considered

- **Patch each surface.** Rejected — it is how the four tails happened; the fifth consumer would write a fifth.
- **Make the day view follow the map's alphabetical order.** Rejected — it "fixes" the disagreement by adopting the tail with the least meaning.
- **Draw the peers as one pin.** Rejected in 0121 §6 for density reasons that hold here; and a stop with two places _is_ two places.
