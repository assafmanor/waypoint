# 2026-08-04 · session 211 — the day's scheduling grammar (design session)

**Outcome:** [ADR-0161](../decisions/0161-a-move-names-a-position-and-an-event-owns-its-length.md) + [`mockups/day-scheduling-grammar-v1.html`](../../mockups/day-scheduling-grammar-v1.html), plus in-place amendments to [0138 §8](../decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md), [0159 §1](../decisions/0159-the-day-says-what-is-between-two-events.md), [0121 §8](../decisions/0121-embedded-map-phase-6-design.md) and [0151](../decisions/0151-a-suggestion-has-a-source-and-a-reason.md). Four slices approved for build; nothing built in this session.

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

## A fourth round: thirty places on the map, and slotting them

_"I'm guessing that a common workflow will be adding lots and lots of places to the map, then people will want to slot these places. Currently added places are automatically added to the shelf, but we want to make it super easy to choose from there."_

The premise checks out in the code: `Map.tsx`'s `landPlace` calls `verbs.addMaybe(title, { placeId })` for every place added outside an errand, so the shelf **is** where map research accumulates — and `SHELF_POOL_CAP` is **5**, so at thirty places the shelf shows five and the rest live behind the Map's `אולי` facet.

**Five gaps, and the second one is sharper than the premise.**

1. **An idea cannot reach its pin.** `MaybeManageSheet` offers `שיבוץ ליום` and `הסר`; `MaybeCard` renders its glyph in a badge-shaped slot but not through `PlaceBadge`. So ADR-0121 §8's rule — every event and booking reaches its pin, in both modes — skips the entity **most likely to be a place**.
2. **The day-scoped map deliberately subordinates exactly the ideas you are trying to place.** A dateless shelf idea is `PIN_TIER.shelf`, which `isAsidePin` groups with ghosts: no row in the list sheet, no camera pull, quiet paint (ADR-0130 §3, ADR-0121 §7). That is _right_ for reading a day and backwards for filling one. Nothing is broken — the Map has one posture and this workflow needs the other. The precedent for withdrawing the flag already exists: search does it (ADR-0131 §4).
3. **Everything is one at a time.** `＋ שיבוץ ליום` slots one place; a drag slots one card. The workflow is plural and spatial.
4. **Nothing suggests which day an idea belongs to.** `near-the-day` ranks against the focused day only, so discovering that eight ideas cluster around Thursday means visiting every day and re-reading the shelf.
5. **No geographic help with order.** `haversineMeters` exists; ADR-0159 §13 refused a crow-flies **duration** claim, which is not the same claim as a **sequence**.

**Owner's call: take 1 and 4 now, design 2/3/5 after ADR-0161 ships.** Both went in as **amendments to the ADRs that own the rules** rather than as sections of 0161, whose subject is moves — 1 to [ADR-0121 §8](../decisions/0121-embedded-map-phase-6-design.md) (its rule reaching a host it always implied, an omission and not a decision) and 4 to [ADR-0151](../decisions/0151-a-suggestion-has-a-source-and-a-reason.md) as `fits-a-day`, the second strategy its registry was built for and had never had.

**The tile priced gap 4, in three attempts, and the first two were wrong in opposite directions.** The question was whether `יום 4 · 300 מ׳ מהמוזיאון` fits the 140×76 tile:

- Measured with a **short title**: 76px, no cost — the `min-height` floor absorbed the wrap.
- Measured with all three cards **in one `.shelf`**: three identical numbers, because a flex row stretches its children to the tallest. That is session 203's amendment #1 read from the other side, and the rule it gives is **a strip is not a neutral place to measure a card**.
- Measured properly (long title, one strip per case): **76px → 84px**. The stop name costs the tile exactly the **8px** ADR-0151's earlier amendment refused when it kept the reason to one line.

So the tile says `יום 4 · 300 מ׳` and the stop name stays in the sheet. And the verb is not on the tile either — session 203 removed the per-card action line, so agreeing lives one tap in, beside `שיבוץ ליום`, wearing **`check`** (agreeing with a proposal) rather than a second calendar. That last detail is the ADR-0161 §7 collision repeating itself within the hour: when two rows reach for one glyph, one of them has not been thought about.

**What is left is one design session, not three items**, and its shape is in the [backlog](../backlog.md): pick a day, the unslotted ideas become the **subject** instead of the context, select several, drop them into the day's free time, the app proposes an order and times, you see it and confirm. Explicitly **not** auto-arranging, which ADR-0161 §10 refuses and which survives intact — you chose the things, you chose the hole, nothing already planned moves, and nothing commits before you look at it.

## A fifth round, one question long, and it found a defect in round four

_"When you mark a maybe for a specific day, does it move to `לְיום הזה` that already exists?"_

Yes — `shelfGroups` puts `targetDate === date` in `forDay`, and both shelves render it under that header. But the question is better than the answer, because **that group belongs to the day on screen** and `fits-a-day` exists precisely to talk about the days you are not on.

Accept a suggestion for day 4 while standing on day 1 and the shelf punishes you for it: the idea is not in `לְיום הזה` (that is day 1's group), it stays in the pool where `near-the-day` **demotes it deliberately** (`TIER.AIMED_ELSEWHERE = 0` against `TIER.DATELESS = 1`, each owning half the score range, so it ranks below every dateless idea however close it is), with `SHELF_POOL_CAP = 5` it can leave the strip entirely, and its reason flips from `NEAR_STOP` to `AIMED_AT_DAY` — so the spatial fact that justified the suggestion disappears the moment you agree with it.

**The demotion is right and stays.** It is ADR-0116 §2's partition, and a thing pencilled for Thursday should not compete for attention while you plan Monday. What was wrong was the **combination** — a correct rule meeting a new feature that encourages marking a day you are not on — so the fix belongs at the seam: **accepting sets the day and goes to it.** Reuse rather than mechanism: `setActiveDate` is already context-aware, and `PlanDay` already encodes the rule that makes it safe (a mid-gesture day switch is scaffolding and reverts; a **committed** one keeps the new day, because you just put something there).

The lesson for the remaining design session is the transferable part: **a feature that speaks about another day has to answer where it leaves you.** Two of the three deferred gaps (the Map's posture, and batch slotting) are about other days by construction, so they inherit the question.
