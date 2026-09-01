# 0216 — A suggestion you cannot reach is not a suggestion

**Status:** Accepted
**Date:** 2026-09-01
**Refines:** [0151](0151-a-suggestion-has-a-source-and-a-reason.md) (the suggestion contract and its LOCAL strategy registry — this adds no strategy and no source; it removes candidates before one runs), [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §6 (the slot sheet, whose list this shortens), [0206](0206-a-travel-time-belongs-between-two-points.md) §AY (the free window this measures against, and §D4, whose rule about inventing a travel time this has to survive), [0159](0159-the-day-says-what-is-between-two-events.md) §1 (one fact, two postures)

## Context

Reported off the shipped fill sheet, in the same breath as §AY's fix:

> _"Maybe unfeasible suggestions should be dropped entirely (too far, not enough time)."_

The owner's screenshot is a ⁦one-hour⁩ hole on an Iceland driving day, and the sheet offers five
ideas: two restaurants at ⁦26 ק״מ⁩, a waterfall at ⁦106 ק״מ⁩, a glacier lagoon at **⁦182 ק״מ⁩**, and a
supermarket at ⁦60 ק״מ⁩. Every one of those distances is printed on its own row, so the sheet is not
hiding anything — it is offering, in a window of ⁦65⁩ free minutes, a place four hours away and
saying so in the same line.

**The ranking is not broken. It is silent.** `nearTheDay` scores proximity as
`1 - meters / FAR_M` with `FAR_M = 5 km`, so on a driving day **every** idea scores exactly zero,
the tier collapses, and `createdAt` decides the order. The list in that screenshot is the shelf in
the order it was typed. Two separate things are missing, and only one of them is this ADR's:

- a **road-trip rung** on a constant chosen for a city — a ranking question, left open below;
- a **feasibility** question that nothing in the app has ever asked. The slot knows what is free
  (§AY), every place carries coordinates, and no code compares the two.

## Decision

### 1. Unreachable is dropped, not demoted

The owner's call, and the reason it is the right one is what a suggestion IS: ADR-0151 §8 gives
every row a **reason** so that a wrong order is arguable rather than magic. A row that cannot be
acted on has no arguable order — it is not badly ranked, it is not a candidate. Demoting it would
keep the whole failure mode the report is about, one scroll further down, and would still hand the
`＋` of a ⁦182 ק״מ⁩ lagoon to a thumb.

So the sheet lists what fits and nothing else.

### 2. What "unreachable" means: the round trip, plus being there

An idea occupies a hole between two stops the day already commits to, so its cost is **the detour,
not the distance**: out from the stop before the slot, and back to the stop after it. Both legs,
because one is how a ⁦60 ק״מ⁩ supermarket looks affordable at ⁦36⁩ minutes and is in fact ⁦72⁩.

The slot's two neighbours are `slotStops`' own answer — the same pair the ranking already measures
against, so the filter and the order cannot disagree about which stops a slot sits between. At a
day edge there is one neighbour; it serves as both ends, which is the honest reading of "leave from
here and come back here".

And **there has to be time to be there**, which is the second half of the owner's parenthesis. That
number is not a new one: `FREE_TIME_MIN_MINUTES` already says that under ⁦15⁩ minutes is not free
time but the transition (ADR-0206 §Z5). If ⁦15⁩ minutes is not worth calling free, arriving somewhere
with less than ⁦15⁩ minutes there is not a visit. One number, one judgement, asked twice — deliberately
not a third threshold beside the two that exist.

### 3. Why dropping survives §D4, which forbids inventing a travel time

ADR-0206 §D4 is explicit: the reader must not be able to tell "we have not computed this" from
"this is not computable", and inventing a walk we did not measure fails that in the direction that
costs somebody their afternoon. This ADR does not have a routed estimate for an idea — an idea is
not on the day, so no leg exists for it and nothing has been asked of the router.

**The asymmetry is the whole argument.** Crow-flies distance is a **lower bound** on road distance,
and a speed ceiling is an **upper bound** on how fast that distance can be covered — so
`crow / ceiling` is a lower bound on the journey. A lower bound can prove that something is
**impossible**. It can never prove that something is possible.

So the bound is allowed exactly one power: to **drop**. It never promotes, never re-orders, never
prints a duration, and never appears as a reason. Nothing the reader sees claims a travel time we
did not measure — the row is simply not there, which is the one statement the arithmetic supports.

### 4. The ceiling is deliberately absurd

`MAX_GROUND_SPEED_KMH = 130` — above the highest motorway limit anywhere this app is used, on a
crow line no road follows. It is not an estimate of how fast anybody drives; it is the speed past
which a claim stops being about roads and starts being about physics. A leg this refuses is refused
because **no ground journey of that length fits that window**, whatever route exists.

Erring generous is the safe direction here and it costs almost nothing: at ⁦130 km/h⁩ the reported
⁦182 ק״מ⁩ lagoon still needs ⁦2:35⁩ round trip against ⁦65⁩ free minutes. The absurd cases are absurd by
orders of magnitude, so a ceiling nobody can argue with drops them all and drops nothing else.

### 5. It lives in `packages/shared`, beside the other travel arithmetic

`reachableWithin` joins `travel-time.ts`, for that file's own stated reason: Plan mode and Trip mode
must not be able to disagree about whether a day fits, and the sweep that will one day fire a
"leave now" reminder has to read these numbers the same way the sheet does. Milliseconds and
seconds in, a boolean out; no zone, no copy, no clock.

The **application** is one place: `shelfForSlot`, which is already the one call both hosts make to
turn the shelf into a slot's list (ADR-0161 §6 exists because two copies of that would rank a
replacement differently from a gap fill). The filter runs before `rankIdeas`, so the ranking never
sees a candidate it would have to order.

### 6. The sheet says how many it dropped, and that is a statement

An empty sheet under a shelf of fourteen ideas is a bug report waiting to be filed, and
`t.slotFill.empty` currently reads `אין רעיונות במדף` — which would be a lie. So the sheet carries
a quiet foot line naming the count that did not fit, and a different empty state when the filter
took everything.

It is a **statement**, not an offer: no row, no `＋`, no name, nothing to tap. That is what keeps it
consistent with §1 — the count explains a short list without re-offering what the list refused.

### 7. What this does not touch

- **`FAR_M` and the ranking order.** Feasibility is a floor on what may be offered; how the
  survivors are ordered is a different question with a different answer (ranking by TIME rather
  than metres), and it stays on the backlog rather than riding in here.
- **The shelf strip** (`poolStrip`), which is about a DAY and not a slot, so there is no window to
  measure against.
- **Trip's one-tap quick-schedule**, which picks a POSITION for an idea rather than an idea for a
  position. §AY made it read corrected room; whether it should also refuse an unreachable idea is
  the same question asked from the other end, and it wants the ranking answer first.
- **A drag onto a gap**, which is a person aiming at a slot deliberately (ADR-0161 §2). A filter
  belongs on what the app OFFERS, never on what a finger asks for.

## Consequences

- The sheet can be short, or empty, on a day where the shelf is full — and that is the feature. The
  count line is what stops it reading as a fault.
- A place with no coordinates, an idea whose place is a Place-lite (ADR-0048), and a slot whose
  neighbours are unlocated are all **unmeasurable and therefore kept**. §D4's rule cuts this way
  too: nothing may be dropped on an absence.
- The filter is pure and offline, like every LOCAL strategy: no network, no spend, no router.
- **No mockup is drawn.** The design-mockups rule asks for one when a surface is being designed or
  when a change is contested enough to want measuring; this removes rows from a row list that
  `day-scheduling-grammar-v1.html` §5 already measured, and adds one foot line in the sub-line slot
  that `replaceSub` already occupies. What is new here is arithmetic, and arithmetic is tested
  rather than drawn.

## The reported screenshot, run through it

⁦65⁩ free minutes; ⁦15⁩ of them owed to being there; so ⁦50⁩ minutes of driving, which at ⁦130 km/h⁩ is
⁦108 ק״מ⁩ of crow **round trip**. Against the distances the sheet itself printed (from the stop after
the slot; the leg out of the hotel is the second half of each round trip):

| idea                 | one leg   | round trip ≥ | verdict |
| -------------------- | --------- | ------------ | ------- |
| Mia's Country Van    | ⁦26 ק״מ⁩  | ⁦52 ק״מ⁩     | offered |
| Skogafoss Bistro Bar | ⁦26 ק״מ⁩  | ⁦52 ק״מ⁩     | offered |
| Bónus                | ⁦60 ק״מ⁩  | ⁦120 ק״מ⁩    | dropped |
| Glymur Waterfall     | ⁦106 ק״מ⁩ | ⁦212 ק״מ⁩    | dropped |
| Fjallsárlón          | ⁦182 ק״מ⁩ | ⁦364 ק״מ⁩    | dropped |

Two rows and a line saying three did not fit, where the shipped sheet offered five in the order
they were typed.

## Alternatives rejected

- **Demote with a reason** (`רחוק מדי לפער הזה` on a greyed row). Rejected by the owner, and it
  fails §1's test on its own: the sheet's rows are offers, and an offer nobody can take is noise
  wherever it sits in the list.
- **Route every idea against the slot.** Fourteen ideas × two legs is ⁦28⁩ route requests per sheet
  open, on a surface that opens with a tap and must work offline (root rule 5). The bound needs no
  network and answers the only question being asked.
- **Raise `FAR_M` until the far ideas rank last.** It is the wrong instrument twice over: a ranking
  constant cannot express "impossible", and moving it changes every other consumer of the score.
- **Filter on the ONE leg the reason line already prints.** Cheaper, and it keeps the case that
  prompted the ADR: a ⁦60 ק״מ⁩ supermarket reads as ⁦36⁩ minutes of driving and costs ⁦72⁩.
