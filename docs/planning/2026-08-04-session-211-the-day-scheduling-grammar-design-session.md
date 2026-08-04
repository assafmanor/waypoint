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

## The round the owner sent back, and what it changed

§7's first draft put all five new verbs in the row's `⋯` sheet, on the reasoning that the sheet is where row verbs live. Rendered, it was **eight rows that scroll** (543px of a 640px screen), `מחק` below the fold, and `משך` and `דחה את שאר היום` wearing the same `clock` glyph. Owner: _"Isn't your suggestion for the 3 dot menu too much? … Do we need everything there? Could anything be replaced by an intuitive gesture or another UI way to do it?"_

Both halves of that were right, and the icon collision was the tell — two unrelated verbs reaching for one glyph means neither had been placed, only filed. The rule that came out of it, and the thing worth carrying past this ADR:

> **A verb goes on the object it changes, if that object is on screen. The menu is what is left over.**

Applied, the five collapse to one affordance and one menu row:

| Verb              | First draft | Where it went                                                                |
| ----------------- | ----------- | ---------------------------------------------------------------------------- |
| `משך`             | menu row    | **the time on the row**, which is a button now                               |
| `הזז`             | menu row    | same button (amends ADR-0138 §8; its rule is kept, its placement is not)     |
| `החלף`            | menu row    | stays a **Trip-mode card** verb; Plan already has the shelf drag             |
| `דחה את שאר היום` | menu row    | **deferred** — it is a day-level control, and the ripple already performs it |
| `שכפל`            | menu row    | **dropped** in round three, and the two questions that did it are below      |

The row's time was already the answer written down; it just wasn't tappable.

## The round after that, which took one more row out

_"Is duplicate event that important to be one of only four actions on the 3 dot menu? How does it work anyway?"_

Both questions answered it, and the second is the sharper one. `שכפל` was the only item in §7 with **no report behind it** — I inferred it while enumerating what the code lacked — and "how does it work" had no answer written down anywhere. A verb whose interaction was never specified had not earned a permanent row on the app's most-used sheet. That is this session's own rule applied to this session's own addition, which is the test it should have passed first.

What it left behind, so a future attempt starts further along: the cases that motivated it (breakfast on three mornings) are **recurrence**, not copying. Recurrence is a property of an event stated once; copies are N things to edit when the time changes. Different and larger decision, and it belongs to whoever actually reports it.

**So the menu shrinks.** Four rows today (`ערוך` · `הזז` · `העבר למדף` · `מחק`), three after — `הזז` leaves for the row's time and nothing arrives. Measured at 322px → 267px. The ADR adds four capabilities to the day and the sheet comes out **one row lighter** than it started, which is the only real check on whether §7 is placement or hoarding.

## And the drag clone, which was a third report in the same message

_"when dragging a maybe/event, it should be somewhat transparent — right now it isn't, and because events take the entire row, it's hard to see where you're landing and read the controls."_

Read against `.wp-dragghost` this is three separate omissions, not one: `opacity: 1` (nothing reads through, and a builder row is the full width of every target it covers), `transform: scale(1.04)` (the clone is **larger** than the row it vacated, so it eats the seams above and below — the exact 18px §2 puts them in), and it is positioned **on** the finger, so the target under the pointer is hidden by construction. The pairing is also backwards today: the source slot fades to 0.45 while the clone sits at 1.0, so the real row looks like the ghost.

The lift is the fix that actually answers the report — transparency alone still leaves a 10.5px seam label under the clone's own text. It is visual only: every hit-test reads the raw `clientX/clientY`, so which target is chosen does not change. A **full** displacement was rejected: `lift()` clones with the grab offset on purpose so the clone starts exactly where the original was, and jumping on pick-up trades this report for a worse one.

Both numbers — the opacity and the lift — are **controls in the mockup, not decisions**. "Somewhat transparent" is judged with a finger, and this is the second thing in the file a desktop render cannot settle.

Two measurements decided its shape, and neither could be argued from the CSS: `min-height: 44px` on the chip took the row from **58px to 75px**, so the target became a 55px inset overlay over a 39px chip (**+2px** at 360, **+3px** at 390); and the chip takes **16px** off the title, against the **58px** that killed a separate trailing control in ADR-0121 §8 — which is why that ADR's answer was the badge and this one's is the time.

## Build order

1. **The move grammar** — `planSwap`/`planInsert` over starts, seams between every pair, drop-on-row = swap.
2. **The picker** — `DaySlotPicker`, five call sites, `CATEGORY_TIME_PROFILE.typicalMinutes`.
3. **`החלף`** — `GapFillSheet` → `SlotFillSheet`, park-and-replace as one write, plus the `gapFillTitle` isolate.
4. **The row's time is a button** (§7), the drag clone's three fixes (§8), and §9's Trip-mode gap tap.

Slices 1 and 2 are the ones the reports are actually about; 3 and 4 are cheap once 1 and 2 exist, because all of them consume the picker.

## Deliberately left for the device pass

Three things, all ADR-0017 questions and none answerable from a desktop render — the mockup says so rather than implying they were checked:

- Whether an 18px seam is findable under a thumb, and whether the seam labels read as promises or as noise mid-drag.
- **The drag clone's opacity and lift.** Defaults are 0.78 and 12px; the mockup carries both as toggles (0.85 · 0.78 · 0.65 and 0 · 12 · 20) precisely so the pair is chosen on a phone, with a finger actually covering the thing.
