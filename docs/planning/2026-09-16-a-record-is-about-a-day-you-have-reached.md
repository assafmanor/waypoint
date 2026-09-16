# 2026-09-16 — The rule was written; one host had it

**Outcome:** [ADR-0228](../decisions/0228-the-quick-actions-are-one-list-and-a-commitment-can-be-settled.md) **extended in place** (§7a–§7e) and [ADR-0139](../decisions/0139-settling-an-event-from-the-map.md) §2 **narrowed in place**. Built the same session. No new ADR, no new string, no new component.

## What was asked

The owner, on the build that shipped an hour earlier, with a day-21 screenshot taken at ⁦21:37⁩ — a `היום` jump button on screen, so the day is **not** today — showing `Grundargata 30 · צ׳ק-אאוט · עד 11:00` and `Iceland Car Rental · החזרת הרכב` each carrying a ✓/✕ pair:

> I think that it's only relevant for the current day, not for future days.

## The finding, which is the same shape as yesterday's

This is the **second report in two days** against `SettleControl`, and the second time the answer was a rule the repo had already written and applied to a subset of the hosts.

ADR-0228 §5a — one day old — ends its table with:

| the row is                      | verbs |
| ------------------------------- | ----- |
| **another day**, past or future | —     |

and §5c restates it in ADR-0117 §2's own words: _"a human outranks the clock" is about marking **tonight's** dinner done at ⁦11:00⁩, which is a claim about today, not about Thursday._

So the rule was decided, written down, and shipped — into `eventQuickActions`, which governs the card's verb **band** and nothing else.

## Why the rows were missed, and it is worth writing down

**The list's rows have no band.** `TransitionRow`, `StayRow` and `UnplacedCommitment` hang the pair directly on the row (ADR-0139's `compact` density), so there was no `when` clause to add a `today` to and nothing in §5's diff went near them. What gated them instead was `readOnly` — the past-day archive (ADR-0029) — which answers nothing about the future.

The result was the card and the rows disagreeing in **opposite directions on one screen**, which no test could see because each host's tests assert its own contract:

| on a future day | the card                        | the rows |
| --------------- | ------------------------------- | -------- |
| settle offered? | no (`eventPhase` is `upcoming`) | **yes**  |

This is `frontend/CLAUDE.md`'s "a shared widget's copies drift on **vocabulary** while every test stays green", one level up: not the widget's copies this time, but its **hosts' gates**.

## Two judgement calls worth keeping

**The gate is FUTURE, not `onToday`.** Reusing §5's axis is the obvious repair and is wrong by one case: ADR-0029's session-103 amendment makes `isDayOver` deliberately generous so a **travel day stays live until it is over in every zone it touched**. `onToday` would take the control off a day you are still inside, in exactly the case that amendment exists for. `dayScope !== FUTURE` removes only what nobody has reached and leaves past-day posture entirely to `readOnly`.

**An answered edge keeps its control.** ADR-0139 §2's decisive argument is that gating on "passed and unanswered" **deletes the undo** — a settled row stops matching the gate, so the control that takes it back vanishes the instant it is earned. `|| isEdgeSettled(event, edge)` pays that argument rather than re-introducing the defect: with `outcome` set, `SettleControl` renders the record plus `ביטול סימון` and never the pair, so handing the verbs back on a settled future edge cannot ask anything.

## The Map, and why it is in scope

ADR-0139 §2's "every event is settleable here" was argued **entirely against the clock inside a day** — the dinner it protects is tonight's — while that row has always carried references from every day of the trip. Same nonsense, same rule, narrowed in place. Asked per **reference** (`ref.date`) rather than per screen, because all-days puts several days' references in one block and the row already knows its own date; the amber `asking` wash, which is the mirror question about a day behind you, is untouched.

## One reuse, and it was overdue

The four day-surface call sites each wrote their own gate, three lines apiece — which is how `readOnly` ended up on both `TransitionRow`s and on `StayRow` and **not** on the `UnplacedCommitment` rendered between them. `canSettle` is on `DayCtx` now and `transitionSettle(entry, ctx)` collapses the two identical `TransitionRow` wirings.

## Verification

`pnpm typecheck`, `pnpm build`, `pnpm format:check`, `pnpm lint`, full frontend suite (**5764 tests, 317 files**, +6). Every new test was run against the unfixed code first and fails there — the two day-surface ones by flipping `canSettle` to `true`, the Map one by flipping `unreached` to `false` — so none of them is vacuous.

- `DayView.stay.test.tsx` — a future day offers no pair on the bookend row **or** on a car hire's return row; an answered edge keeps its record and undo.
- `Map.test.tsx` — a reference the trip has not reached offers no pair, and an answered one keeps the record and the undo.

No existing test changed, which is the honest signal here: nothing had ever asserted the old behaviour, in either direction.
