---
date: 2026-08-13
session: 261
topic: An edge is a row on the day like any other
adrs: [0184, 0171, 0064]
---

# Session 261 — an edge is a row on the day like any other

Three owner reports off the **shipped device build** of [ADR-0184](../decisions/0184-an-edge-can-be-a-window.md), which had landed the same day. They turned out to be one decision, because §4's split is what made the other two visible. The full reasoning is [ADR-0184 §9](../decisions/0184-an-edge-can-be-a-window.md); this note is what happened.

## The reports, in the order they arrived

1. _"The hotel check in/out times (or ranges) […] don't align the same way as other times are. They should look similar and not stand out from the rest, especially when the title is very long."_
2. _"Also see this check out range, why is the 6 after the 11? It should be the same as every other place, 6-11, not 11-6, right?"_
3. _"Check in/out with a from/to range is placed as a row but not as an ambient like when there's no range, I think that we must align this and display both the row and the ambient line on top."_

## What the reading found before anything was changed

**Report 2 was not a bidi bug, and the left-hand alignment in report 1 is what proved it.** `Math.min`/`Math.max` build the range, so the string is always ascending — `11:00` printing first means the earlier instant _formats_ as 11:00, i.e. the bound is a day away. The tell was that the range sat at the **left** margin of an RTL card: `dir="auto"` over a digits-only run resolves the element to `ltr`, so its inherited `text-align: start` means left — and an `ltr` element renders its content in order. A genuine bidi flip would have needed an RTL box, which would have right-aligned it. Two reports, one attribute.

Confirmed with the owner rather than guessed: check-out `06:00`, then `עד 11:00`. Which is the label's fault — an end edge stores `endWindowStart`, the _earliest_ you may leave, and calling it `עד` invited the one input it cannot mean. `windowBoundIso` then did exactly what ADR-0184 §3 documents (a larger clock on an end edge reads as yesterday) and produced a 19-hour window.

## The one that cost the session

Report 3 is a reversal of §4, and the owner asked the right question about his own request: _"Do you think my choice is the correct one? […] the whole thing that triggered it was a hotel check in being before even arriving to the destination country by flight."_

That is ADR-0171 §10a's original reason for existing, arriving as a bug report. Putting floors back in the list needs a defendable position for them, and §10b had already written the mirror for a ceiling (`deadlineAt`). So the work was generalising that one function rather than inventing a rule — **and the generalisation was wrong twice before it was right:**

- **First draft: journey-arrival only.** Correct for the report, and the owner immediately found the hole — _"it's not necessarily just before or after a flight, it could be any hard event (train or anything really)."_
- **Second draft: overlap only** (any hard event whose span contains the bound), on his round-trip objection — _"what if the train is a two way and doesn't affect anything?"_ Drawn with a table asserting the reported case still worked. **It did not.** In the fixture the flight _departs_ at 15:30, after the 15:00 floor, so nothing overlaps anything. Caught by writing the assertion, not by reading the code.
- **Shipped: both clauses**, and the round trip is an accepted cost rather than a solved problem. Only the place graph knows whether a leg relocated you, and a flight lands at an _airport_ while the hotel is in a _city_ — the ids never match, so the obvious repair is not one.

**The existing suite caught the third mistake.** `does not let a HELD span anchor a deadline` failed on the first run: the overlap clause was dragging an 11:00 check-out to a car hire's 09:00 pickup. Holding a car is not being occupied by it, and `midSpan.kind` already drew that line — no new vocabulary, and the test was written for §10b two sessions ago.

**And one regression the suite could not catch**, found by grepping the consumers of the thing being moved rather than by running anything: `glance.ts` keeps a `not-before` edge in `נותרו היום` until it is `DONE`, and the strip floors were leaving carried the only `SettleControl` that could say so. Moving them without it re-strands the number the owner reported on 2026-08-04. `TransitionRow` settles a floor now — and only a floor.

## Shipped

- `edgeAt` replaces `deadlineAt`, both ends, two clauses; `edgeHoldsPosition` **deleted** (zero consumers, and it answered `false` about something the app places).
- `staysOnDate` — the ambient strip on every day of a stay, edges included. Extracted rather than inlined twice, because a day-surface derivation changed in `DayView` only has cost a release twice (ADR-0171 §10e).
- `TransitionRow`: one `.tr-time` under the title for every edge, no `dir` on the box, every clock `ltrIsolate`d, `SettleControl` on a floor.
- The window token's word is per edge (`＋ עד` / `＋ מ־`).

## Follow-up, same day, after the above merged (#590)

The device pass on the merged build produced a fourth report, and it is §9a's own consequence: the strip was on the edge days now, still saying `ambientSpanLabel`.

> _"edge days should state 'check in from…', 'check out until…', 'car returned until' etc (and also ranges), not day 1/1, that way we can't differentiate between check in and check out."_

Two guesthouses on one day, one being left and one being arrived at, both reading `לילה 1 מתוך 1`. Shipped as [ADR-0184 §9f](../decisions/0184-an-edge-can-be-a-window.md): an edge day states the edge, a middle day keeps the count, and `edgeTimePhrase`/`edgeSentence` are shared with the row so one edge cannot print two clocks.

The owner asked which way to go on repeating the row's clock in the strip, noting _"I prefer consistency"_. Recommended keeping it, on the ground that `${label} · ${phrase}` is not a new shape — it is what `UnplacedCommitment` rendered **in this same box** until §9a emptied it. A bare label would have been the third form.

**And the test caught a bug in what had just merged.** The range was built from `atMs` — the `edgeAt`-bounded instant, which for a windowed edge is not one of the window's ends. A 17:00–20:00 window pushed to a 22:00 landing rendered `20:00–22:00`: a window nobody typed, hiding that the real one had closed. Written as an assertion about "whichever bound it was handed", it failed immediately; read as code it looks fine, which is the second time this pair of sessions that the assertion was the thing that found it.

## Not verified

**The render on a real phone**, again — which is the same line ADR-0184 closed with, and the reason this session exists. Everything here is unit-tested (3606 frontend + 223 shared, green) and the row's new height has been reasoned about, not seen.
