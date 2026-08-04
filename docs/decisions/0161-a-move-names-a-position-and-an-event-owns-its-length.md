# 0161 — A move names a **position**; an event owns its **length**

**Status:** Accepted (owner sign-off 2026-08-04, from four reports read together in session). **Phase 1 built 2026-08-04** — §1, §2, §3 and §8, i.e. every drag-driven path: `planSwap`, seams between every pair of rows, and the drag clone. **Phase 2a built 2026-08-04** — §4, §5 and §7: the picker, the row's time as its way in, and `הזז` out of the `⋯` sheet. **Phase 2b built 2026-08-04** — §4's remaining call sites and §5's readers, so `שבץ` no longer offers "after everything" in either mode. What is left is §6 and §9; the build order is in the [session note](../planning/2026-08-04-session-211-the-day-scheduling-grammar-design-session.md).
**Date:** 2026-08-04
**Design reference:** [`mockups/day-scheduling-grammar-v1.html`](../../mockups/day-scheduling-grammar-v1.html) — the move grammar, the slot picker, the replacement sheet, the row menu and the Trip-mode gap, in both themes. Measurements below are read from that file's live DOM at 390×844 and 360×640.

**Amends [0159](0159-the-day-says-what-is-between-two-events.md) §1 in place** (§9 below): the Trip-mode gap keeps its measurement and gains one tap. Its "a `<span>` where Plan has a `<button>`" becomes "a button that says a measurement, not a control that says `שבץ`".
**Supersedes** `lib/reorder.ts`'s slot-permutation model outright (§1).
**Closes [0116](0116-day-aware-shelf-and-idea-target-day.md) §5's deferred "dropping an idea onto an occupied row (needs ripple semantics)"** — the answer is that displacement is a **decision**, not a drop (§6), which is what §5 suspected when it rejected the drop target.
**Amends [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) §8** (§7 below): `הזז` leaves the `⋯` sheet for the row's own time, which is now a button. §8's rule — reorder is reachable without a drag — is kept; only its placement changes, and the menu ends up one row shorter.
**Extends** [0036](0036-event-time-setter.md) (the start+duration setter stays, and stops being the only way in), [0063](0063-category-time-behaviour-profile.md) (the profile gains a typical length), [0121](0121-embedded-map-phase-6-design.md) §8 (`PlaceBadge`'s "tap the thing to get its other form" is the precedent §7 follows, and now the second row element to do it), [0151](0151-a-suggestion-has-a-source-and-a-reason.md) (the replacement sheet is ranked and says why), [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md) (the picker is a step, never a second sheet).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (a hard event is never a drag source, never a swap target, and never moved by anything here), [0017](0017-mobile-first-device-targets.md) (44×44 at both widths), [0025](0025-trip-mode-edit-capability-tiers.md) (§9's tap is the Tier-1 verb the tier map already lists), [0028](0028-plan-violet-color-budget-dark-ready.md) + root rule 4 (no new hue), [0041](0041-parallel-overlapping-events.md) (the overlap cluster is the collision's answer, §3), [0103](0103-back-navigation-typed-layer-model.md) (every new surface is a back layer, and the picker is a step so the primitive owns it).

## Context

Four reports, read together (owner, 2026-08-04). Each names a different surface; three of them are one defect and the fourth is a stub.

**1. A drag swaps timings, not positions.** _"switching between event A that's 1 hour long and event B that's 2 hours long, A will get B's schedule (same start time, same duration), and B will get A's."_

`lib/reorder.ts`'s `planReorder` models the day as a **fixed set of slots the events permute through**: it reads `{startsAt, endsAt, sortOrder}` off each soft event, keeps those triples in ascending order, and reassigns which event holds each one. A 1-hour visit dropped onto a 2-hour visit therefore becomes two hours long. That is not a reorder; it is a cell swap, and it silently rewrites a datum the user never touched.

**The codebase already disagrees with itself about this, in the same gesture.** Dropping the same row on a **gap chip** goes through `PlanDay`'s `slotFor`, whose docblock is explicit: _"It starts where the gap starts and keeps the length it already had… never a decision to shorten a two-hour visit to an hour."_ One finger, one drag, two opposite duration semantics decided by what happens to be under the pointer. The gap branch is right. The row branch is the bug.

**2. `שבץ` fights you on the time,** for two independent reasons that read as one annoyance.

- **The prefill is usually wrong.** Scheduling from the shelf prefills `nextSlot()` — the end of the day's **last** event, plus an hour — in both modes. So the app's opening offer for every idea is "after everything", including on a day with a three-hour hole at 14:00.
- **The control is clock-first.** `TimeField` is a 96-row 15-minute list you scroll (auto-centred, so 08:00 → 14:30 is a real scroll) plus a native time input; the duration is a **second** panel of presets. Four taps and a scroll is the floor for one event. And it asks the wrong question: nobody plans in absolute clock. They plan **relative** — after breakfast, before the flight, two hours.

**3. `החלף` is confusing because it is a stub.** `verbs.swap` sets the event to `SKIPPED` and raises a toast that says _"נבחר להחלפה · בוחרים תחליף מהמדף"_. It skips the thing and hands you the homework: nothing holds the slot, nothing offers a replacement, nothing links the two, and the undo undoes a skip. [ADR-0025](0025-trip-mode-edit-capability-tiers.md) lists Swap as a **Tier-1, one-tap** verb; this is not that.

**4. "Still missing elementary features."** Named from the code, since the report did not enumerate them:

- **A duration can only be changed by opening the whole edit form.** There is no way to say "make it two hours" from the day.
- **You can only drop _between_ two rows where a ≥ 60-minute gap happens to exist** (`GAP_MIN_MINUTES`). Everywhere else, "put it here" is inexpressible.
- **`הזז` reaches only soft peers.** It cannot reach free time and it cannot reach another day, so a cross-day move is **drag-only**, through a spring-loaded dwell on a day pill.
- **No duplicate.** Breakfast on three mornings is three creations.
- **No "push the rest of the day".** It exists only as a server ripple _suggestion_ after a ±30 delay, and `DELAY_STEP_MINUTES` is the only step available on the ground.
- **Trip mode states a gap and cannot fill it** (0159 §1, deliberately).

The through-line: **the day list is an ordering, and the app keeps asking the user to speak in clock times anyway** — while the one gesture that _is_ ordinal quietly edits the clock behind their back.

## Decision

**A move names a position in the day. The app computes the clock and states it. An event's length is its own, and only an explicit duration edit changes it.**

### 1. An event owns its length. The slot-permutation model is deleted.

`planReorder` goes. Every move — a drop on a row, a drop on a seam, the `הזז` step, a drop on a gap chip, a drop on a day pill — writes a **start**, and carries the existing duration with it. `lib/reorder.ts` becomes `planSwap` over `{startsAt, endsAt}` only; `sortOrder` is untouched, because the list sorts by start and `sortOrder` breaks ties among untimed rows, which no move here reorders.

_Built 2026-08-04: this section said "`planSwap`/`planInsert`" and there is **no `planInsert`**. Inserting at a position is what a gap drop already did — `slotFor` + the `MOVE_INTO` action — and §2 makes a seam the same derivation as a gap, so it arrives at the same place with the same slot. A second implementation of "start here, keep your length" would have been the parallel copy rule 8 exists to prevent. The absence is recorded in the file's own header._

An untimed event has no length to carry, so it takes the position's own block (`GAP_FILL_MINUTES`, or §5's category length) — which is exactly what `slotFor` already decided for a gap drop and is now true everywhere.

### 2. Two drop targets, two meanings, both stated on the target itself.

- **A row** means **swap positions.** A takes B's start, B takes A's, each keeps its own length. Symmetric, one sentence to explain, and the thing the report asked for.
- **A seam** — the join between two consecutive rows — means **insert here.** The moved event starts where the row above ends; nothing else moves.

**Seams exist between every pair of rows, not only where free time does.** A seam with ≥ `GAP_MIN_MINUTES` of space is already drawn: it is the gap chip, unchanged. A seam with less (or none) is **drawn only while a drag is live** — a 3px violet hairline that thickens to a drop target on hover, gone the instant the finger lifts. This is the same "chrome that exists only while it's useful" rule the empty-day drop zone and the conjured shelf groups already follow, and it is what makes "right after the flight" expressible for the first time.

**A hard event is not a swap target and not a drag source** (ADR-0011, unchanged) — but **the seams on either side of it are**, and that is the point. Dropping a soft row into the seam before a hard anchor moves the soft row only.

**Amended while building (2026-08-04), from three reports against phase 1.** All three are the same question — _which positions exist, and which of them mean anything_ — and the section as written answered it only for a day with at least two timed rows.

- **A day with nothing timed to sit beside had no position at all.** Three of them: an **empty** day (whose only target was "move it here, keeping the clock time it already had", which is not what `שבץ` means), a day of **untimed** rows, and one whose only entries are booking **transition** points (ADR-0064 §B). The last two are the reason this is a rule and not an empty-day special case: both render an ordinary list, and both make the edge derivations answer null because neither has a timed event to measure from. So: **with nothing timed to hold a position, the position is the day** (`freeWholeDay`), reading as a chip because an empty day has all of its time free. On an empty day it sits alongside the existing drop zone rather than replacing it, so the coarser "move it to this day, keep its time" stays available — the chip is more specific, and the drop table already prefers a slot over a day.
- **A position touching the row being dragged was still offered.** _"The line for slotting is appearing even for the same slot we're moving from."_ Correct: "insert this immediately above itself" and "…immediately below itself" are the two places it already is. Suppressed — but **only when it is a seam**, and that distinction is the whole of it: a **chip** beside the held row means "into that free afternoon", which is a real move however adjacent, while a **seam** there means "start where you already end" — a nudge by the row's own length, or nothing. Only the row drag has a position in the day; a shelf card has none, so for it every seam stays live.
- **A seam cost layout, and then had no hit area.** Each one had an 18px box, so arming a drag grew a four-event day by ~90px and slid every target below the finger away from it — the list doing what the drag's own comment forbids the auto-scroll from doing. Zero-height now, painting into the 9px the rows already leave between them. Which then removed the target: a box with no area is not returned by `elementFromPoint`, so the seam was reachable only within the 3px of its line. It carries an out-of-flow `::after` reaching into the row gap — ~22px of target for 0px of layout, the same trade §7 makes for the row's time chip.

The day's two edges are seams like any other: the head seam starts the moved event so that it **ends** at the first row's start (floored by `DAY_WINDOW.START_HOUR`, the rule `gapBeforeFirst` already encodes), and the tail seam starts it at the last row's end.

### 3. A collision is answered by the overlap cluster, not by a refusal and not by a silent push.

Two events of different lengths that trade places can collide with a neighbour. **Only the events the user touched move.** When the result overlaps, the day renders what it already renders for that fact: ADR-0041's violet `חופפים` cluster with its `הזז` resolve, plus the ripple bar when the server suggests one.

Rejected: **absorbing the excess into the following free time** (magical when it works, and it silently spends a gap that was left on purpose), and **shifting the whole tail** (predictable, and it moves dinner because you reordered the morning). Both fail the same test — they move rows the user did not touch, which is the habit ADR-0011 exists to break. The overlap is honest, it is already legible, it already has a one-tap way out, and it keeps the undo to a single step.

### 4. The day is the time picker.

One new primitive — `ui/domain/DaySlotPicker` — whose rows are **the day's own entries**, and whose answer is a concrete start:

```
בתחילת היום · 08:00
אחרי ארוחת בוקר · 10:30 · פנוי שעה וחצי
אחרי מוזיאון · 12:30
לפני הטיסה · 14:00
בסוף היום · 20:00
שעה מדויקת…
```

Each row **shows the clock it computes**, so the user reads the time without picking it, and `שעה מדויקת…` is the escape hatch to ADR-0036's setter, which stays exactly as it is. On today's date the list is topped by `עכשיו · 14:20`.

**This is a generalisation, not an addition** (root rule 8). Two one-offs already do half of it and are replaced by it: `ResolveSheet`'s `אחרי`/`לפני <title> · <time>` pair, and `BuilderRow`'s `הזז` step, which lists soft peers with their times and then hands the id to the deleted slot permutation. Five call sites take the one picker:

| Call site                              | What it asks                | Was                                   | Built |
| -------------------------------------- | --------------------------- | ------------------------------------- | ----- |
| **The row's time** (was `⋯ → הזז`, §7) | where does this go          | soft-peer list → slot permutation     | 2a    |
| Overlap `הזז`                          | where does this go instead  | `ResolveSheet`'s bespoke before/after | 2a    |
| Schedule an idea (Plan)                | where does this go          | `WhenField` prefilled at `nextSlot`   | 2b    |
| Schedule an idea (Trip)                | where, defaulted not asked  | `WhenField` prefilled at `nextSlot`   | 2b    |
| Gap / seam fill → an idea              | how long, at this position  | the gap's flat hour                   | 2b    |
| `החלף` (§6)                            | the displaced slot, implied | nothing                               | 3     |

Drag stays the fast path for every one of these decisions. The picker is what makes them reachable **without** a pointer gesture, which is what `הזז` was for and never delivered.

_Built 2026-08-04 (2b) for the two remaining call sites, and the shape differs by mode on purpose. **Plan mode asks**: `שיבוץ ליום` on an idea opens the picker, and the position chosen prefills the form — which is the mode that builds the day. **Trip mode defaults**, because its quick-schedule is a Tier-1 one-tap verb (ADR-0025): its prefill is `firstPositionFitting`, the first position on the day with room for the idea's typical length, instead of `nextSlot`'s end-of-the-last-event. One derivation behind both, so the two modes cannot disagree about where an idea should go._

_Built 2026-08-04 (2a). Both one-offs are deleted, and the second gave more than expected: `ResolveSheet`'s `אחרי`/`לפני` pair computed a minute **delta** from the cluster's own bounds, and the picker replaces it with a **position** — because `freeBetween` over two overlapping rows resolves "after" to the earlier one's end, which is the same answer that pair hand-built, reached by the shared rule instead. `verbs.moveBy` went with it: nothing offsets an event by a delta any more, it is given a position. The positions come from a new `lib/day-positions.ts`, which walks the day flat and asks the same four `lib/gaps.ts` derivations the drag asks — so a sheet and a drag cannot disagree about a slot._

### 5. A duration has a default, and it comes from the category.

`GAP_FILL_MINUTES` (a flat 60) stops being the answer for everything. [ADR-0063](0063-category-time-behaviour-profile.md)'s `CATEGORY_TIME_PROFILE` — already the registry for "how a kind of thing behaves over time" — gains `typicalMinutes`, and the picker and the gap fill read it. Seeds (tunable, and deliberately coarse): `food` 90, `sightseeing` 120, `nature` 180, `activity` 120, `shopping` 90, `services` 60, `transport`/`lodging`/`other` 60. A block is still clamped to the space the position actually has.

No migration, no new field on an entity: it is a lookup over an existing closed enum, which is the whole reason 0063 put the table there.

_Built 2026-08-04: the registry in 2a, its readers in 2b through one function — `blockFor(free, minutes)`, which caps the length asked for by the room actually there, so nothing is ever created longer than the hole it went into. A position with no room (a seam) has nothing to cap against, so the block is offered whole and the create overlaps, which is §3's answer and the same rule `freeBetween` already applies to its own default block. A **new** event still gets the position's flat block rather than a category's: its category is the form's next question, so there is nothing to read one from yet._

_Getting there needed a small consolidation first: `toMin`/`toHHMM` lived twice — exported from `ui/primitives/TimeField` (so `lib/gaps.ts` could not reach them without a lib→ui import) and duplicated character-for-character inside `gaps.ts`. They live in `lib/time.ts` now, which is where a wall clock belongs, and `TimeField` re-exports for its existing callers._

### 6. `החלף` is one atomic decision, taken **on the slot**.

`החלף` opens the slot's own chooser: the shelf's ideas **ranked against this slot** (`rankIdeas` + `slotStops`, the ranking [ADR-0151](0151-a-suggestion-has-a-source-and-a-reason.md) already defined and `GapFillSheet` already runs), each with its reason, plus `אירוע חדש`.

Picking one is **a single write, a single toast, a single undo**:

- the displaced event **goes to the shelf as an idea** (`park`, not `skip` — the thing you displaced is the thing you are most likely to re-slot, and ADR-0027's shelf is where a parked intention lives), and
- the replacement takes the displaced event's **exact start and length**.

`skip` remains its own verb for "this isn't happening". `החלף` finally means what it says, and the slot is never empty in between.

**It is the same component as the gap fill,** because "which idea fits this slot" is already precisely what that sheet is: `GapFillSheet` becomes `SlotFillSheet` with two headers — `מילוי הפער · 15:00–18:00` and `החלפה · <title>` — and one extra behaviour behind a prop (park the displaced event). This is the app's sixth instance of the rule that collected the settle control: a second sheet here would drift on its ranking, its cap, its search threshold and its empty state.

### 7. **The time on the row is a button.** (Amends [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) §8.)

The first draft of this section put all five new verbs in the row's `⋯` sheet, because that sheet is where row verbs live. Drawn, it was eight rows that **scrolled**, with the destructive `מחק` pushed off the bottom and two unrelated verbs (`משך`, `דחה את שאר היום`) wearing the same `clock` glyph — owner, reading §6 of the mockup: _"too much actions and it's becoming overwhelming instead of easy to use."_ Correct, and the icon collision was the tell: a menu is not a place to put things, it is what is left after asking where each verb belongs.

**Where it belongs, for a time, is the time.** The row already renders `10:00–12:00` and `שעתיים` in its trailing slot (`.bld-time`). That span becomes a **button**, and it opens §4's picker — so the whole time question, "when" and "how long", has exactly one entry point and it is the thing the answer is written on. `שעה מדויקת…` inside the picker reaches ADR-0036's start+duration setter, which is where `DUR_PRESETS` already live.

This is not a new idiom. It is `PlaceBadge`'s (ADR-0121 §8): **tap the thing to get that thing's other form.** After this, every element of a builder row does what it depicts — the badge is the place, the body is the event, the time is the time, the `⋯` is the rest:

| Target           | Opens                          | New?                               |
| ---------------- | ------------------------------ | ---------------------------------- |
| `.bld-bd` badge  | the place, on the map          | no (ADR-0121 §8)                   |
| `.bld-main` body | the edit form                  | no                                 |
| **`.bld-time`**  | **§4's picker · where + long** | **yes, and it is the whole of §7** |
| `.bld-icon` `⋯`  | the row's remaining verbs      | no                                 |

**An untimed row gains the affordance it most needed.** With no time there is nothing to render in that slot, so today it holds nothing at all and the only way to give an event a time is the whole edit form. It now holds `＋ שעה`, at the same target size. That is the one case where this section adds a control rather than promoting one.

**A tappable thing has to look tappable**, which is `PlaceBadge`'s own rule and the reason it carries a pin rather than nothing. The mark here is a **hairline chip** — `.tp-field`'s grammar (the app's existing "a time you can change") at its faintest, so no hue is spent and rule 4's amber stays with the now-line and the commitment tags. The untimed variant is the same chip, dashed, because it marks an absence.

**The target grows; the row does not.** `min-height: 44px` on the chip was measured first and took the row from 58px to 75px — a 29% taller list on every row to make one control meet ADR-0017's floor. So the chip keeps its natural **39px** and the target is an inset overlay reaching into the row's own vertical padding, which no other control occupies: **55px**, vertical only, since `.bld-icon` is the horizontal neighbour. Measured cost of the whole section, same event, today against proposed: **+2px** at 360px and **+3px** at 390px of row height, and **16px** off the title's width. Worth stating against the comparison that killed a separate trailing control in ADR-0121 §8 — that one cost the title **58px** and wrapped a place name.

**`הזז` therefore leaves the `⋯` sheet**, which is why this amends ADR-0138 §8. That section put reorder in the menu because it was otherwise pointer-only and the `הקדם`/`אחר` pair it replaced was a blind one-slot swap; a focusable button in the row satisfies the same requirement more directly than a menu row, and a control that says `10:00–12:00` is a better name for "move this" than the word `הזז` ever was. §8's actual rule — reorder must be reachable without a drag — is kept, not weakened.

**So the menu gets SHORTER.** `הזז` leaves for the row's time and nothing arrives, so the sheet goes from four rows to three:

| Today                                | After                        |
| ------------------------------------ | ---------------------------- |
| `ערוך` · `הזז` · `העבר למדף` · `מחק` | `ערוך` · `העבר למדף` · `מחק` |

That is the measure of whether §7 is right: the ADR adds four capabilities to the day and the most-used sheet in the app ends up **one row lighter** than it started.

**`שכפל` is dropped, and the second round is why.** Owner, on the four-row draft: _"Is duplicate event that important to be one of only four actions on the 3 dot menu? How does it work anyway?"_ Both questions answer it. It was **inferred, not reported** — it is the only item in §7 with no complaint behind it, added while enumerating what the code lacked. And "how does it work" had no answer written down, which is the tell: a verb whose interaction was never specified had not earned a permanent row on the app's most-used sheet. Applying this section's own rule to this section's own addition, it goes.

What it would need if it comes back, recorded so the next attempt starts further along: the repeat cases that motivated it (breakfast on three mornings, a daily coffee) are **recurrence**, not copying — and recurrence is a property of an event, expressed once, not a verb you perform N times. A `שכפל` that creates unrelated copies makes three things to edit when the time changes, which is the trap. That is a different and larger decision than a menu row, and it belongs to whichever report actually asks for it. Backlog.

**Three verbs from the first draft are not placed anywhere, and that is the decision:**

- **`החלף` stays a Trip-mode card verb** and does **not** join the Plan row menu. It already lives on the card, where ADR-0025 puts it (Tier 1), and the question it answers — "we're not doing this, what else?" — is an on-the-ground question. In Plan mode the same intent is already faster by dragging an idea off the shelf, which is the mode's fast path. One verb, one mode, no duplication.
- **`דחה את שאר היום` is deferred**, with its reason named rather than its row taken. The mechanism exists: delaying an event raises the ripple bar, which offers exactly this and applies it as one write. What is missing is only a way to ask for it **without** moving a specific event first — "we're running an hour late" — and that is a **day-level** control on an on-the-ground surface, not a property of whichever row you happened to open. Placing it on a row is what made it look like eight verbs fit in one sheet. Backlog.

The delay pair keeps `DELAY_STEP_MINUTES` (30) and gains no long-press: with the card's time tappable in Trip mode too (the same button, Tier-2 scoped sheet), an arbitrary delay is two taps on the number that is wrong, and a hidden long-press on a control that already works is exactly the kind of second path this section exists to refuse.

### 8. The thing you are dragging stops hiding where it would land.

Owner, 2026-08-04: _"when dragging a maybe/event, it should be somewhat transparent — right now it isn't, and because events take the entire row, it's hard to see where you're landing and read the controls."_

Read against the code, this is not one omission but **three** compounding ones, all in `.wp-dragghost`:

| Today                    | Why it occludes                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `opacity: 1`             | Nothing reads through it, and a builder row is the **full width** of the list — so is every drop target it covers.                         |
| `transform: scale(1.04)` | The clone is **larger** than the row it came from, so it covers more than the space it vacated — including the seams above and below it.   |
| positioned at the finger | The finger is _on_ the clone, so the target directly under the pointer is hidden **by construction** — which is the one you are aiming at. |

And the pairing is upside down: `.bld.dragging` fades the source slot to `0.45` and `.wp-maybecard.dragging` to `0.4`, so today the real row looks like a ghost and the ghost looks like the real row.

**Three changes, and the third is the one that actually fixes the report:**

1. **The clone is translucent** — enough that a seam, a gap chip's label and a lit day pill read through it. `--drag-ghost-opacity`, on the host so the ring and shadow fade with it rather than floating over a faded card.
2. **The enlargement goes.** "Picked up" is already said by the violet ring and the drop shadow, which is how the platform says it; the 4% was covering the neighbours to repeat something already stated. §2's seams live in exactly the 18px the scale was eating.
3. **The clone lifts off the finger** by `DRAG_GHOST_LIFT_PX` in the block direction, so the pointer sits just **below** the clone's edge and what you are pointing at is never underneath it. Visual only — every hit-test reads the raw `clientX/clientY` (`elementFromPoint` in both `hitTest*` functions), so nothing about which target is chosen changes.

A **full** displacement (finger at the clone's corner, or beside it) is rejected: `useDragGhost.lift` deliberately clones with the grab offset so the clone starts exactly where the original was, and jumping on pick-up trades this report for a worse one. A small lift keeps that continuity.

**One mechanism, both drags.** All three land in `.wp-dragghost` and `paint()`, which the shelf card and the builder row already share — so the maybe card and the event row are fixed by the same change, which is what the report asked for in one breath.

### 9. Trip mode's gap gains one tap. (Amends 0159 §1.)

0159 made the Trip-mode gap information-only and gave a good reason: Plan's chip is a **control**, and controls belong to the mode that builds the day. But ADR-0025's Tier-1 list already contains _"Schedule-from-shelf onto today"_ — filling a hole on the ground is on-the-ground work, and the shipped surface that states the hole is the one place it cannot be done.

So: **the strip keeps its measurement and becomes tappable.** `פנוי · 2:40 שע׳` through `hoursPhrase` is unchanged (0159 §2's "a statement has to be a measurement" stands), the violet chip and the word `שבץ` do **not** come over, and the strip gains a trailing `+` at the 44px floor. The tap opens §6's `SlotFillSheet` for that slot. What was a `<span>` becomes a `<button>` that still says a measurement.

The two modes now differ in **posture**, which was 0159's actual claim, rather than in capability: Plan offers, Trip answers when asked.

### 10. Deliberately not doing

- **A proportional timeline.** A time-height day at 360px is unreadable, and it is the reason the list is ordinal in the first place (ADR-0017). The whole of §2 exists because the list is an ordering; drawing it as a clock would be the other, worse answer.
- **Drag-to-resize.** The gesture needs the proportional axis it does not have. §7's tappable time is the answer.
- **A day-level "we're running late, push everything".** Real, and deferred with its reasoning in §7 rather than parked on a row. The ripple already performs it; what is missing is a way to ask without moving one event first, and that is a Trip-mode day control.
- **Multi-select / bulk arrange.** Tier 3 with no report behind it.
- **Auto-arranging the day.** No. The app suggests (ADR-0151) and never rearranges.
- **A crow-flies travel-time check between positions.** 0159 §13 refused it for the gap strip and the reasoning is unchanged: the app has no routing (ADR-0109 §7), and a number that looks like an answer is worse than none.

## Consequences

- **One duration semantic across every move**, and the gap-drop branch stops being the only correct one. `lib/reorder.ts`'s tests become tests of position and length rather than of slot triples.
- **A collision is a visible state with a one-tap exit,** and no move ever touches a row the user didn't. The cost is stated: a swap of unequal lengths **can** leave an overlap, and that is the design, not a defect report waiting to happen.
- **Five surfaces stop asking for a clock time** and one primitive answers "where in the day". Two hand-rolled halves of it are deleted.
- **`החלף` becomes a Tier-1 verb for the first time,** and the displaced event lands somewhere recoverable instead of being skipped into the archive.
- **0159's Trip-mode gap is now a control,** which was explicitly not its decision. The amendment is here and in 0159; the read-out, the floor and the derivation are untouched, so the two modes still cannot disagree about what a hole **is**.
- **`CATEGORY_TIME_PROFILE` gains its third behaviour** (bracketed, ambient, typical length). A new category declares one number and every scheduling surface follows.
- **The row menu ends up one row shorter** (four today, three after — `הזז` leaves and nothing arrives), and the row gains one affordance instead of five menu entries. The general rule this session paid for: **a verb goes on the object it changes if that object is on screen, and in the menu only if it is not.** Every row of a `⋯` sheet is a verb that failed that test — which is why `שכפל` is the only new one there.
- **What this does not fix:** an untimed event still has no position of its own (it renders below the day and is not a swap target), and `nextSlot` survives as the foot-of-the-day add button's prefill, where "after everything" is the right answer.

## Alternatives considered

- **Keep the slot model and just preserve duration on the moved event only.** Rejected: the _other_ event still inherits a length it never had. The model is the bug, not one branch of it.
- **Make the row drop an insert (shift the tail) rather than a swap.** Rejected as the default: the report describes a swap, a swap is symmetric and explainable in one sentence, and an insert-with-shift moves rows nobody touched (§3). Insert is still available — it is what a **seam** means, which puts both meanings one thumb-width apart and names each on the target.
- **Refuse a move that would overlap.** Rejected: a refusal that says "no" to a gesture the user just completed is the worst of the three outcomes, and the app already renders overlaps as a first-class state.
- **Put the slot picker in the event form instead of a sheet of its own.** Rejected: four of its five call sites do not open a form, and the two it replaces are not forms either. It is a chooser, so it passes no `errors` and no `validate` (ADR-0155 §5).
- **Make `החלף` a drag** (drop an idea onto an occupied row). This is ADR-0116 §5's rejected target, and the reason it gave — displacing a scheduled event is a decision, not a drop — is the reason §6 is a sheet. Kept rejected.
- **Give Trip mode Plan's violet gap chip.** Rejected: that is the mode confusion 0159 correctly diagnosed. The posture differs; only the tap is shared.
- **Put the five new verbs in the row's `⋯` sheet** — this ADR's own first draft, rejected by the owner off the mockup's §6 render and replaced by §7. Eight rows, a scrolling sheet, `מחק` below the fold, and `משך`/`דחה את שאר היום` colliding on one glyph. Recorded rather than quietly rewritten because the failure mode generalises: a menu is the **residue** of asking where each verb belongs, and reaching for it first is how a surface that already shows the answer ends up with a list of words about it.
- **A long-press for a bigger delay step.** Rejected as a second, hidden path to something §7 already makes two taps: the number that is wrong is on screen and now tappable.
