# 0226 — A derived time carries the instant behind it

_Accepted and built 2026-09-14._

**Corrects nothing and enforces much.** [ADR-0159](0159-the-day-says-what-is-between-two-events.md) §1 — _two elevations may differ in **posture** and may not differ about a **fact**_ — has been the rule since it was written, is restated in [`frontend/CLAUDE.md`](../../frontend/CLAUDE.md), and is the rule every bug listed below breaks. This ADR does not change it. It makes it **testable**.

## 1. The problem, measured rather than felt

Owner, on the §BF fix: _"How can we make sure that all timing related stuff is calculated and used the same way across all surfaces? I don't want to fix bugs like this every other day."_

The frequency is real. Inside [ADR-0206](0206-a-travel-time-belongs-between-two-points.md) alone, in three weeks:

|      | what disagreed                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| §AJ3 | the board said `6 דקות באיחור` beside a day view reading `יציאה 00:30` — the clamp lived only in `dayJourney` |
| §AY  | the offer ran through the departure                                                                           |
| §BB  | only one of the two hooks got §AU1's ladder                                                                   |
| §BD  | the trip's zone came off the leg's clocks and stayed on the slot's                                            |
| #827 | the board read `צאו ב־05:33` where the day view read `יציאה עד 06:08`                                         |
| §BF  | `עד 10:30` over a tile counting `7 דקות ליציאה`                                                               |

Six, weekly, each fixed individually, each with an amendment explaining why that one was structural.

## 2. What the cause is NOT

The obvious hypothesis is duplicated arithmetic, and it is wrong. The derivations are already converged: `leaveBy` (`@waypoint/shared`) ← `heroLeaveBy` (`lib/hero-travel.ts`) ← `dayJourney` (`lib/day-joins.ts`) and `Home`. §AJ3 did that work. `goingCostMinutes` is `travel + TRAVEL_BUFFER_SECONDS` and `leaveByMs` is `arriveBy − travel − buffer` — the same subtraction, checked while writing this.

So "share the function" was already done, and the bugs kept coming. Two things were missing instead.

**A surface can bypass the chain.** §BF's `freeUntil` was one line computing a _derived_ fact from a raw field — `formatTime(nextEvent.startsAt)` — ⁦440 lines⁩ from the correct answer already in scope. `screens/` does raw instant arithmetic **87 times** (`Home.tsx` alone: 43); `ui/domain` does it once. The thick middle layer is where every one of these lived.

**Nothing tested that surfaces agree.** No test in this repo rendered more than one surface. All 5559 tests were green on the morning the board and the day view contradicted each other on a real phone. The property the rule is _about_ was the one property CI could not see.

## 3. The decision

A surface that states a **derived** time tags the element with the instant it derived, the zone it rendered it in, and the event it is about (`lib/time-claim.ts`). One suite then renders every surface against one fixture and compares the answers (`surfaces.agreement.test.tsx`).

**Instants, never words.** Posture freedom is the whole of ADR-0159 §1 and it is mostly a choice between a clock and a duration: `יציאה עד 10:15` on the day row and `7 דקות ליציאה` on the board are one claim said two ways. Comparing rendered strings would fail on posture or pass on nothing.

**The zone rides along**, because §BD is a bug where both surfaces held the same instant and printed different clocks. An instant-only tag reads that as agreement.

**And the subject**, because surfaces do not answer the same questions about the same things: the board states one departure (the next point's), the day states one per leg. Without a subject the suite compares a board's departure for dinner against a day's for the museum and reports two different facts as a contradiction.

### 3a. What gets tagged, and what deliberately does not

A claim is tagged when the app **computes** the moment, so the answer could be wrong. An event's own `startsAt` printed on its own row is the **datum**: there is nothing for two surfaces to disagree about, and tagging it would bury the real claims. Three members today — `leave-by`, `free-until`, `arrive-at` — and adding a fourth is a one-line addition to `TIME_FACT` plus the render sites, with no change to the suite (root rule 8).

## 4. Agreement is necessary and NOT sufficient — the finding that reshaped this ADR

The first build of the suite was pointed at the shipped §BF bug, with the fix reverted, and **passed**.

The reason is the whole value of this section. §BF's overstated `free-until` did not contradict another _surface_. It contradicted the `leave-by` on its own card ⁦100px⁩ below it. Grouping claims by (kind, subject) puts those two in different groups, so nothing compared them — the per-surface blind spot, faithfully reproduced one level up, by a suite written specifically to end it.

So the suite makes three checks, not one:

1. **Agreement** — same kind, same subject, across surfaces → one instant. Catches §AJ3, §BB, #827.
2. **Coherence** — the relations between _different_ kinds about one subject. `free-until` **is** the departure ([ADR-0206](0206-a-travel-time-belongs-between-two-points.md) §AJ4.1: _the free time ends where the journey begins_), and an arrival is after its departure. Catches §BF — **from one surface**, which is better than needing two.
3. **Clock/zone** — a claim rendered as a clock reads as its own instant in its own declared zone. Catches §BD. It binds only where a clock was actually printed, since a duration has no wall to be measured against.

With coherence added, the reverted §BF bug fails three scenarios and names the ⁦15-minute⁩ overstatement in the message. Re-applying the fix returns all nine to green. That round trip is the evidence this ADR rests on; a conformance test that cannot go red is decoration.

## 5. What the build found

**One walk, one answer.** The first draft derived the day row's tags in a second function beside `journeyMetaLine`, which re-walked its six arms — and got one wrong, tagging an arrival on the `PASSED` arm, which prints `זמן היציאה עבר ב־14:17` and states no arrival at all. The suite caught it. `journeyMetaLine` now returns its words **and** its claims from one set of arms, so the row cannot tag one thing and say another. That the mechanism caught its own author is the argument for it; that it was written wrong the first time is the argument for one walk rather than two.

**Five arms state no clock.** `tooFar`, `warming`, `untimed`, `unmeasured` and `declared` replace the line entirely, and each is an absence. A line with no clock makes no claim for anything to contradict.

**The harness is the unlock, and the reason there was none.** Thirty-one test files hand-roll their own `trip-state` mock. That is not untidiness — it is _why_ two surfaces were never fed the same day. `test/agreement-harness.tsx` is one fixture both read. Existing suites keep theirs, which are tuned to the arm each is about; cross-surface work starts from the harness.

## 6. What this does not do

- **It does not replace per-surface tests.** It asks one question they cannot: do these two agree.
- **It does not cover every surface yet.** `Home` (both elevations) and `DayView` render in the suite; `PlanDay` and `SharedItinerary` are tagged through the shared `JourneyRow` but not yet rendered in it — `PlanDay`'s drag machinery is a heavier harness, and the sharing reader deliberately states no free time.
- **It is not a lint rule.** A ban on raw instants in `screens/` was considered and rejected: of the 16 `formatTime(<raw instant>)` sites there, most are correct — a row printing its own event's end. What separates a bug from a correct use is _which question the number answers_, which a linter cannot see. The check has to be at the level of claims.

## 7. The attribute ships in production

A few dozen bytes on a handful of elements, and what it buys is the class of report this repo actually runs on. Every bug in §1 arrived as a photograph of a phone. `data-facts` turns such a screenshot into a readable record of what the screen believed, instead of a clock somebody has to reason backwards from.
