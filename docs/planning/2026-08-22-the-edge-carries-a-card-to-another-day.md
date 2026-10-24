# 2026-08-22 — the edge carries a card to another day

> _"Regarding event/shelf drag, it should behave differently now. Swipe should be disabled when dragging and you could drag from the edge to a different day."_

Two asks. The first was already fixed an hour earlier in a different PR — and not by coincidence.

## The first half was found by matching arms on someone else's flake

While attributing an unrelated e2e failure (`shelf-drag.spec.ts:453`, 8/10 on the branch and 8/10 on untouched main — the known flake, not my diff), I read the pager's `enabled` path and found it was consulted **only at pointerdown**. The hold-drag arms on a press and fires on a **timer**, so a drag that started after the press left the day surface free to translate under the dragged card's ghost — against `useSwipePager`'s own docblock, which had been claiming the opposite since the day it shipped.

So the owner asked for something that was already on its way, and the reason it was on its way is that the flake investigation was done properly instead of being waved at the backlog. Worth remembering the next time the cheap move is to attribute a red test and move on.

## The second half was mostly already built, in two places at once

The instinct is to write an edge-dwell mechanism. The repo had every piece of one:

- `useSpringLoadedDay` — resting on a named day switches to it, on `DRAG_DAY_DWELL_MS`. It takes a **date**, not a pill, so the edge feeds it by composition: `overDate ?? edgeDay.date`. No second dwell exists.
- `edgeScrollStep`/`gateEdgeStep` — the band arithmetic and the **latch**, from the vertical auto-scroll. `edgeDepth` came out of the first as a small extraction; the latch went axis-agnostic by renaming its directions `low`/`high` and changing one comparison.
- `useDaySurface`'s peek pair — the neighbouring dates, already derived for the swipe. Reusing them is what stops two ways of reaching tomorrow from disagreeing about which day that is, and `null` at the trip's ends is the rebuff with no label.

What was actually left to write was a mapping from a side of the screen to a date, and one wrinkle nobody would guess (below). The hook is ~120 lines and half of it is comment.

**The latch is the part I would have shipped broken.** Its docblock says the vertical version exists because _"you pressed, held, and the list took off"_. An event row spans the whole surface, so a card lifted by its trailing end starts inside an inline band — the days would have started flipping under a finger that had not moved. That is not an edge case; it is how you pick up a row.

## The wrinkle: holding still has to keep stepping

The edge's target is computed from a pointer position. Once the day switches, a finger that does not move produces no further move event — and the day it named is now the day you are standing on, which `useSpringLoadedDay` correctly refuses as "not a switch". So the edge would step exactly once and then look broken.

Recomputing when the **neighbours** change is what turns one step into a queue of them, 700ms apart, ending itself where the neighbour is `null`. It is four lines and it is the only part of this that could not be composed.

## The one-character defect I didn't ship

Feeding the edge's date into `overDate` would have made the header pill light up for free — good feedback, no new pixels. It would also have been a real bug: `resolveShelfDrop` checks `overDate` **before** the gap chip. That precedence is safe today only because a pill and a chip can never be under one pointer — and an edge band and a chip can, since a chip spans the surface and its last 36px lie inside one. A drop meant for that slot would have silently become "aim at another day".

So the edge navigates and nothing else, and the pill keeps its `drop-over` mark: marking the edge's target the same way would promise a landing that releasing there does not deliver. Which leaves the feature with **no pre-dwell affordance** — the honest cost, written into the ADR with the candidate answer (§7's peek at the edge) rather than guessed at now.

## Two tests that passed for no reason at all

Both in the e2e, both caught by measuring instead of assuming:

- I lifted a card 9px from **its own** leading edge, on the theory that this was near the screen's. In RTL the first pool card sits at x 234–374 — that point was 100px clear of any band, so the "does not step" half of the latch test was asserting nothing. The card's _trailing_ edge is the one flush with the surface's. Fixed by measuring the host box, deriving the lift point from it, and **asserting the premise** (`host.right - lift.x < DRAG_DAY_EDGE_PX`) so it cannot rot back.
- I asserted the parked row was the pool's only card. This describe seeds three ideas. `toHaveCount(1)` → filter by title.

## What shipped

- `lib/useEdgeDayStep.ts` (+ tests) — the side→date mapping, the latch, the repeat.
- `lib/edge-autoscroll.ts` — `edgeDepth` extracted; the latch's directions renamed `low`/`high` so both axes can use it.
- `constants.ts` — `DRAG_DAY_EDGE_PX` (36). The dwell is the pill's.
- `screens/PlanDay.tsx` — armed and tracked from both drags; fed to the existing dwell beside the pill's own target.
- `e2e/shelf-drag.spec.ts` — four cases: the step and the repeat, a row surviving the day it was dragged out of, an abandoned drag putting the day back, and the latch.

Trip mode has no drag at all, so this is Plan-only — an existing posture difference (ADR-0159 §1), not a new one.
