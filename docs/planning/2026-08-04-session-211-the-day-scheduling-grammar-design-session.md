# 2026-08-04 · session 211 — the day's scheduling grammar (design session)

**Outcome:** [ADR-0161](../decisions/0161-a-move-names-a-position-and-an-event-owns-its-length.md) + [`mockups/day-scheduling-grammar-v1.html`](../../mockups/day-scheduling-grammar-v1.html). Four slices approved for build; nothing built in this session.

## What the owner brought

A "hard conversation about ease of usage and how clear the actions are for the day view events, both in plan mode and in day mode", with four leads and an explicit instruction not to stop at them:

1. Drag-and-drop replacing two events "also replaces their timing" — A (1h) and B (2h) exchange start **and** duration.
2. `שבץ` is inconvenient with regards to getting the right time.
3. `החלף` is confusing and hard to understand how to use.
4. Elementary day-scheduling features are still missing.

Stated priorities: **ease of use, how fast users get what they wanted, intuitiveness.**

## What reading the code changed

Each report resolved to something more specific than it arrived as, and one of them turned out not to be a design question at all.

- **(1) is a bug with a witness inside the same gesture.** `planReorder` treats the day as slots that events permute through; `slotFor` — the gap-drop branch of the _same drag_ — documents the opposite rule in as many words. Nothing had to be decided about which is right; the app had already written it down.
- **(2) is two frictions wearing one complaint.** The prefill (`nextSlot`, "after everything") and the control (a 96-row clock list plus a second panel for duration). They needed different answers, and only the second one needed a new surface.
- **(3) is not confusing, it is unbuilt.** `verbs.swap` is a `skip` plus a toast telling you to go find a replacement. ADR-0025 has listed Swap as a Tier-1 verb since July.
- **(4) had to be enumerated from the code**, since the report named nothing: duration only editable through the whole form, drop-between only where 60 free minutes exist, `הזז` unable to reach free time or another day, no duplicate, no explicit push, and the Trip-mode gap inert by ADR-0159's decision.

## The decision, in one line

**A move names a position; the app computes the clock and states it; an event's length is its own.** Everything in the ADR is that rule applied to a surface — which is why the four "separate" reports collapse into one build.

## Forks put to the owner, and the answers

| Fork                                                         | Answer                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| What happens when an unequal swap collides                   | **Overlap stands**; ADR-0041's cluster is the answer. Not absorb, not push-tail. |
| ADR-0159 made the Trip-mode gap information-only, on purpose | **Amend it** — measurement stays, one tap is added                               |
| Mockup first, or build straight in                           | **ADR + mockup, then build**                                                     |
| Scope                                                        | **All four slices**                                                              |

The collision answer is the one worth remembering: both rejected alternatives move rows the user never touched, which is the habit ADR-0011 exists to break. The overlap is honest, already legible, already has a one-tap exit, and keeps undo to one step.

## What the mockup found by being rendered

Two things, and the second is a shipped defect:

- **The seam's real cost, measured rather than guessed.** 18px live, 0px at rest, 31% of an event row; five seams add 90px to a four-event day and only while a finger is down. That number is what makes "a seam between _every_ pair" affordable, and it could not be argued from the CSS.
- **`t.planDay.gapFillTitle` reverses its own range.** It builds `מילוי הפער · ${start}–${end}` with no ltr isolate, so the shipped gap-fill header reads `18:00–15:00` for a 15:00–18:00 gap. ADR-0118 already forbids this; its lint guard reads `dir="ltr"` attributes and cannot see a template string in `he.ts`. Fixed with slice 3, since it is the same line. (Also noticed in passing: `btn-primary` on `.gapfill-new` has no rule anywhere in the app's CSS — a dead class, dropped when that button is touched.)

## Build order

1. **The move grammar** — `planSwap`/`planInsert` over starts, seams between every pair, drop-on-row = swap.
2. **The picker** — `DaySlotPicker`, five call sites, `CATEGORY_TIME_PROFILE.typicalMinutes`.
3. **`החלף`** — `GapFillSheet` → `SlotFillSheet`, park-and-replace as one write.
4. **The elementary verbs** — `משך`, `הזז → ליום אחר…`, `שכפל`, `דחה את שאר היום`, delay presets, and §8's Trip-mode tap.

Slices 1 and 2 are the ones the reports are actually about; 3 and 4 are cheap once 1 and 2 exist, because both consume the picker.

## Deliberately left for the device pass

Whether an 18px seam is findable under a thumb, and whether the seam labels read as promises or as noise mid-drag. Both are ADR-0017 questions and neither is answerable from a desktop render — the mockup says so rather than implying it was checked.
