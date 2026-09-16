# 2026-09-16 — Three hosts ADR-0224 did not count

**Outcome:** [ADR-0224](../decisions/0224-a-transition-is-settled-on-its-own.md) **amended in place and extended** (§A1–A4), built the same session. No new ADR, no new mockup, no new string: the decision was already made and three surfaces had not been told.

## What was asked

The owner, four days after ADR-0224 shipped:

> When you check in or out, you can mark `היינו`. Marking that makes it `היינו` for both check in and out. I want to be able to mark as "checked in" / "checked out" separately (same for other similar stuff like "picked up / dropped off" etc.)
>
> עשינו צ׳ק אין / עשינו צ׳ק אאוט / אספנו / החזרנו

Which reads as a feature request for something the repo decided four days ago — and the two words the owner picked for the car (`אספנו`, `החזרנו`) are, verbatim, two rows of ADR-0224 §3's table. So the question was never "what should it say". It was "why is it not saying it".

## The counting, which is the whole finding

Root `CLAUDE.md`: _"Count the call sites before claiming what a derivation does."_ One `grep` for `verbs.done(` answered the report in full:

| call site                            | passes the edge? |
| ------------------------------------ | ---------------- |
| `Home.tsx` → `HeroLift`              | ✅ ADR-0224 §4   |
| `DayView` → `TransitionRow` (×2)     | ✅ ADR-0224 §4   |
| `DayView` → `StayRow` (`staySettle`) | ❌               |
| `DayView` → `UnplacedCommitment`     | ❌               |
| `Map.tsx` → the reference row        | ❌               |

ADR-0224 §4 is titled **"Two hosts, both already built"**. `SettleControl` has six, and the ADR wired the two the screenshot in its Context happened to show. The other three each had `edge` in hand already — `StayRow`'s caller resolves it for the row's own sentence one line above, `UnplacedCommitment` uses `row.edge` for the word above the title, the Map uses `ref.edge` for the label and the zone — and then spent it on presentation and dropped it before the verb.

**A fourth site, one layer down.** `place-usage.ts`'s `spanDays` read the outcome once off `status` and stamped it on every day of the span, while computing that day's own `edge` two lines below. That is what puts a green pin on the hotel the morning you have not yet left, and what would have made the fixed reference row show the right mark under the wrong `asking` wash.

## What the fix actually is

Not a feature. The store, the sync, the undo and the words all shipped on 2026-09-12; `endStatus`, `edgeStatusOf`, `isEdgeSettled`, `edgeSettleWords` and an `edge` on the verb, the outbox op, the reducer and the REST call were all already there. Three hosts and one derivation now read them.

The one new thing is a **shared resolution**: "this edge's words" paired with "this edge's answer" existed only inside `TransitionRow`, written out by hand, and that is precisely how the other three drifted. `edgeSettleProps(event, edge)` in `lib/transitions.ts`; a host spreads it (rule 8).

## Two things the fix removed that nobody reported

- **A control on a middle night.** `StayRow`'s gate was `edgeOutlivesItsInstant(stay, 'start')` — a predicate about the _other_ edge — so night 2 of 4 offered an answer to a transition that day does not have. The gate is the day's own edge now (`placement.stayEdges`, which the row's `bound` was already reading), so a day that is neither end of the stay asks nothing.
- **The ghost of ADR-0224 §4's own finding.** That ADR removed `TransitionRow`'s `NOT_BEFORE` gate because it was "a rule about a count applied to a control". The identical mistake was sitting on the bookend row and was not seen, because §4 never opened that file.

## What this says about the last four days

ADR-0224's §9 is a worked example of counting call sites — it is how the cheap `status`-for-both option was killed. The same ADR then shipped without counting the **hosts** of the control it was changing. The audit was done on the read side and skipped on the write side, and the report is exactly the gap between them.

`frontend/CLAUDE.md` already warns that a shared widget's copies drift on **vocabulary** while every test stays green, and this is that again one level up: the three unwired hosts had passing tests throughout, because their tests asserted that a pair renders and a handler fires — never _which fact_ it answers.

## Verification

`pnpm typecheck`, `pnpm build`, and the full frontend suite (**5758 tests, 317 files**). Four existing specs changed and each recorded a real behaviour change rather than an accommodation:

- `DayView.stay.test.tsx` — `done` is called with `'start'`; a new block asserts the check-out day writes `'end'`, asks `יצאנו`, does not wear the check-in's answer, and that a middle night offers no pair.
- `place-usage.test.ts` — the hire's fixture settles both ends; a new case asserts that collecting the car does not return it.
- `map-pins.test.ts` — a checked-in stay reports nothing on its check-out day.
- `Map.test.tsx` — a place's reference answers for the end of the stay that day **is**.
