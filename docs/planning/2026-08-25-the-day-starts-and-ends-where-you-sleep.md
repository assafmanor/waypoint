# The day starts and ends where you sleep — the day's bookends (M7c)

**Date:** 2026-08-25
**Kind:** implementation, on the M7b PR at the owner's instruction
**Decides:** [ADR-0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md) (2026-08-25 amendment) · [ADR-0182](../decisions/0182-a-day-is-a-sequence-you-can-step-through.md) §3 (amended) · [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) §AD
**Board:** [routes epic](2026-08-24-routes-epic-milestone-board.md) — M7c
**PR:** [#709](https://github.com/assafmanor/waypoint/pull/709)

## What prompted it

> Now that we have real paths, I'm starting to feel the absence of some stops from the day schedule
> (the numbered stops), mostly the hotels, flights. Basically on most days you can infer for certain
> that you're gonna start the day in a hotel and end in a hotel, so you can add poly lines to them
> and place them first/last on the schedule.

The report is a **consequence of M7b shipping**, not a defect M7b introduced. While the day's stop
list was a numbered schedule, leaving the hotel out of it was ADR-0054 working correctly: you do not
_perform_ a hotel, so it earns no block, no rail width and no place in `נותרו היום`. The moment the
same list became the spine of a **drawn route**, the exclusion started answering a question nobody
had asked it — because a route is not a schedule. A schedule is what you committed to; a route is
where your feet went, and the stay is the one point on it that is certain without anyone scheduling
anything.

## Three forks, put before any code

Each of these changes what gets built, so all three were asked rather than assumed:

| asked                             | answered                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| what does a bookend get?          | **sequence + route, no number**                                                              |
| does the day timeline grow a row? | **sequence only, no new rows**                                                               |
| which other class did you mean?   | _"other non hard times like car rentals etc. that are from time X or until Y"_ — not flights |

The first answer is the expensive one, and it was named as such before building: ADR-0182 §3 as it
stood **forbade exactly this**. Its 2026-08-11 unification made the order ask the numbering's own
question so that _"a stop cannot sort as timed and read as unnumbered"_ — which is precisely what a
bookend is. It is amended in place rather than quietly contradicted, and the amendment is narrow: the
**list** keeps `knowsMoment`, the **sequence** does not, because a position means a different thing
on each. That distinction is the whole session in one line.

The third answer moved the target usefully. Flights were named in the report and turned out to be
**already present**: `isExactEdge` is true at both ends of a flight, so its airports have always
numbered and always drawn. What was actually missing was the class the owner named on being asked —
soft-timed bookings — and hotels, which are a different case again.

## Two gaps, and why one fix could not have found both

They read as one report and are not:

- **A check-in / check-out day** carries a floor or a ceiling — `at` is set and undefendable — so it
  was **in** the sequence and sunk to its tail by §3.
- **A strictly middle night** is `prominence: 'ambient'` with **no edge and no clock at all**, so it
  never entered the sequence in the first place. No amount of re-sorting reaches it.

Hence two changes: the sort asks `moment.at` again, and a separate pass injects the nights. Which end
each takes needs no third rule — the stay covered last night → you woke there; it covers tonight →
you end there. Check-in day is last only, check-out day first only, a middle night is both, and a day
you change hotels comes out as _A's check-out … B's check-in_ for free, because each span only
answers about itself.

## The crux was in neither derivation

`buildDayStopSequence` could have been perfect and nothing would have changed on the canvas.
`screens/Map.tsx` built the route with:

```ts
pins
  .filter((pin) => pin.order != null && !isAsidePin(pin.tier))
  .sort((a, b) => a.order! - b.order!);
```

— which makes the **visible number** the gate on the line. That is a reasonable thing to have written
when the line was drawing a numbered schedule, and it is why the two stops you can be surest of were
the two the route could never reach. It reads `dayStops` now: the same derivation one step earlier,
before the numbering, where a stop holds a position whether or not it can defend a number.

The lesson generalises past this file: **when a derivation acquires a second consumer with a different
question, check what the consumer is keying on, not just what the derivation returns.** The number was
never meant to be a route filter; it became one by being the only thing in the array that looked
ordered.

## `countsNights`, not `isAmbient` — reusing the distinction that already existed

Root rule 8's easy half. The predicate separating "a hotel bookends your day" from "a car hire does
not" already existed as `countsNights` (ADR-0163 §4, read off ADR-0162's profile), exported with a
docblock that says it exists for a second shape. You sleep in a hotel; you merely _hold_ a car — so a
hire's pick-up and return are ordinary stops at their own instants (which the sort change gives them)
and its middle days stay pure backdrop. Both of the owner's classes fall out of one existing
predicate and one existing sort, with no new vocabulary.

`map-pins.ts` importing `glance.ts` was checked for a cycle before it was written (`glance.ts` has
zero references to `map-pins`), which is cheaper than discovering it in a build.

## What it cost

Two files of derivation, five new specs and one inverted. The full unit suite (⁦263⁩ files, ⁦4510⁩
tests) is green.

**The one spec that changed sides** is worth naming because it is now on its **third** answer:
`gives a ceiling no number once it can ask what the time means` first asserted a check-out sorted at
its 11:00 ceiling _between two flights_ (ADR-0171's Iceland defect), then asserted it sunk to the
day's tail (§3's reversal — after the landing in Tel Aviv, which is worse), and now asserts the hotel
**leading** the day. Each answer was right about the question it was asked. The `order` column is
identical in all three, which is exactly the invariant this change had to leave alone.
