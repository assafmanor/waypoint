# 0161 — A move names a **position**; an event owns its **length**

**Status:** Accepted (owner sign-off 2026-08-04, from four reports read together in session)
**Date:** 2026-08-04
**Design reference:** [`mockups/day-scheduling-grammar-v1.html`](../../mockups/day-scheduling-grammar-v1.html) — the move grammar, the slot picker, the replacement sheet, the row menu and the Trip-mode gap, in both themes. Measurements below are read from that file's live DOM at 390×844 and 360×640.

**Amends [0159](0159-the-day-says-what-is-between-two-events.md) §1 in place** (§8 below): the Trip-mode gap keeps its measurement and gains one tap. Its "a `<span>` where Plan has a `<button>`" becomes "a button that says a measurement, not a control that says `שבץ`".
**Supersedes** `lib/reorder.ts`'s slot-permutation model outright (§1).
**Closes [0116](0116-day-aware-shelf-and-idea-target-day.md) §5's deferred "dropping an idea onto an occupied row (needs ripple semantics)"** — the answer is that displacement is a **decision**, not a drop (§6), which is what §5 suspected when it rejected the drop target.
**Extends** [0036](0036-event-time-setter.md) (the start+duration setter stays, and stops being the only way in), [0063](0063-category-time-behaviour-profile.md) (the profile gains a typical length), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) §8 (the `הזז` step becomes the shared picker), [0151](0151-a-suggestion-has-a-source-and-a-reason.md) (the replacement sheet is ranked and says why), [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md) (the picker is a step, never a second sheet).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (a hard event is never a drag source, never a swap target, and never moved by anything here), [0017](0017-mobile-first-device-targets.md) (44×44 at both widths), [0025](0025-trip-mode-edit-capability-tiers.md) (§8's tap is the Tier-1 verb the tier map already lists), [0028](0028-plan-violet-color-budget-dark-ready.md) + root rule 4 (no new hue), [0041](0041-parallel-overlapping-events.md) (the overlap cluster is the collision's answer, §3), [0103](0103-back-navigation-typed-layer-model.md) (every new surface is a back layer, and the picker is a step so the primitive owns it).

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

`planReorder` goes. Every move — a drop on a row, a drop on a seam, the `הזז` step, a drop on a gap chip, a drop on a day pill — writes a **start**, and carries the existing duration with it. `lib/reorder.ts` becomes `planSwap`/`planInsert` over `{startsAt, endsAt}` only; `sortOrder` is untouched, because the list sorts by start and `sortOrder` breaks ties among untimed rows, which no move here reorders.

An untimed event has no length to carry, so it takes the position's own block (`GAP_FILL_MINUTES`, or §5's category length) — which is exactly what `slotFor` already decided for a gap drop and is now true everywhere.

### 2. Two drop targets, two meanings, both stated on the target itself.

- **A row** means **swap positions.** A takes B's start, B takes A's, each keeps its own length. Symmetric, one sentence to explain, and the thing the report asked for.
- **A seam** — the join between two consecutive rows — means **insert here.** The moved event starts where the row above ends; nothing else moves.

**Seams exist between every pair of rows, not only where free time does.** A seam with ≥ `GAP_MIN_MINUTES` of space is already drawn: it is the gap chip, unchanged. A seam with less (or none) is **drawn only while a drag is live** — a 3px violet hairline that thickens to a drop target on hover, gone the instant the finger lifts. This is the same "chrome that exists only while it's useful" rule the empty-day drop zone and the conjured shelf groups already follow, and it is what makes "right after the flight" expressible for the first time.

**A hard event is not a swap target and not a drag source** (ADR-0011, unchanged) — but **the seams on either side of it are**, and that is the point. Dropping a soft row into the seam before a hard anchor moves the soft row only.

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

| Call site                   | What it asks                | Was                                   |
| --------------------------- | --------------------------- | ------------------------------------- |
| `⋯ → הזז`                   | where does this go          | soft-peer list → slot permutation     |
| Schedule an idea            | where does this go          | `WhenField` prefilled at `nextSlot`   |
| Gap / seam fill → new event | where, then what            | `EventForm` prefilled at the gap      |
| `החלף` (§6)                 | the displaced slot, implied | nothing                               |
| Overlap `הזז`               | where does this go instead  | `ResolveSheet`'s bespoke before/after |

Drag stays the fast path for every one of these decisions. The picker is what makes them reachable **without** a pointer gesture, which is what `הזז` was for and never delivered.

### 5. A duration has a default, and it comes from the category.

`GAP_FILL_MINUTES` (a flat 60) stops being the answer for everything. [ADR-0063](0063-category-time-behaviour-profile.md)'s `CATEGORY_TIME_PROFILE` — already the registry for "how a kind of thing behaves over time" — gains `typicalMinutes`, and the picker and the gap fill read it. Seeds (tunable, and deliberately coarse): `food` 90, `sightseeing` 120, `nature` 180, `activity` 120, `shopping` 90, `services` 60, `transport`/`lodging`/`other` 60. A block is still clamped to the space the position actually has.

No migration, no new field on an entity: it is a lookup over an existing closed enum, which is the whole reason 0063 put the table there.

### 6. `החלף` is one atomic decision, taken **on the slot**.

`החלף` opens the slot's own chooser: the shelf's ideas **ranked against this slot** (`rankIdeas` + `slotStops`, the ranking [ADR-0151](0151-a-suggestion-has-a-source-and-a-reason.md) already defined and `GapFillSheet` already runs), each with its reason, plus `אירוע חדש`.

Picking one is **a single write, a single toast, a single undo**:

- the displaced event **goes to the shelf as an idea** (`park`, not `skip` — the thing you displaced is the thing you are most likely to re-slot, and ADR-0027's shelf is where a parked intention lives), and
- the replacement takes the displaced event's **exact start and length**.

`skip` remains its own verb for "this isn't happening". `החלף` finally means what it says, and the slot is never empty in between.

**It is the same component as the gap fill,** because "which idea fits this slot" is already precisely what that sheet is: `GapFillSheet` becomes `SlotFillSheet` with two headers — `מילוי הפער · 15:00–18:00` and `החלפה · <title>` — and one extra behaviour behind a prop (park the displaced event). This is the app's sixth instance of the rule that collected the settle control: a second sheet here would drift on its ranking, its cap, its search threshold and its empty state.

### 7. The elementary verbs, named and placed.

All five live in the row's existing `⋯` sheet (ADR-0138's one surface) or beside an existing control. None is a new screen.

- **`משך`** — the duration presets from ADR-0036's setter, reached without opening the form. The presets are `TimePicker`'s own `DUR_PRESETS`, unchanged.
- **`הזז`** — becomes §4's picker, and gains **`ליום אחר…`**, so a cross-day move stops being drag-only.
- **`שכפל`** — duplicate to a position, through the same picker (including another day). The one verb that turns a three-morning routine into two taps.
- **`דחה את שאר היום`** — the explicit push, with the delay presets. It writes one patch per later **soft** event through the one atomic multi-patch applier (`applyReorder`, renamed `applyEventPatches` for what it actually is), so it is one undo. Hard events are excluded, by ADR-0011.
- **The delay pair gains steps.** `DELAY_STEP_MINUTES` (30) stays the one-tap default; a long-press opens the same presets.

### 8. Trip mode's gap gains one tap. (Amends 0159 §1.)

0159 made the Trip-mode gap information-only and gave a good reason: Plan's chip is a **control**, and controls belong to the mode that builds the day. But ADR-0025's Tier-1 list already contains _"Schedule-from-shelf onto today"_ — filling a hole on the ground is on-the-ground work, and the shipped surface that states the hole is the one place it cannot be done.

So: **the strip keeps its measurement and becomes tappable.** `פנוי · 2:40 שע׳` through `hoursPhrase` is unchanged (0159 §2's "a statement has to be a measurement" stands), the violet chip and the word `שבץ` do **not** come over, and the strip gains a trailing `+` at the 44px floor. The tap opens §6's `SlotFillSheet` for that slot. What was a `<span>` becomes a `<button>` that still says a measurement.

The two modes now differ in **posture**, which was 0159's actual claim, rather than in capability: Plan offers, Trip answers when asked.

### 9. Deliberately not doing

- **A proportional timeline.** A time-height day at 360px is unreadable, and it is the reason the list is ordinal in the first place (ADR-0017). The whole of §2 exists because the list is an ordering; drawing it as a clock would be the other, worse answer.
- **Drag-to-resize.** The gesture needs the proportional axis it does not have. §7's `משך` is the answer.
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
- **What this does not fix:** an untimed event still has no position of its own (it renders below the day and is not a swap target), and `nextSlot` survives as the foot-of-the-day add button's prefill, where "after everything" is the right answer.

## Alternatives considered

- **Keep the slot model and just preserve duration on the moved event only.** Rejected: the _other_ event still inherits a length it never had. The model is the bug, not one branch of it.
- **Make the row drop an insert (shift the tail) rather than a swap.** Rejected as the default: the report describes a swap, a swap is symmetric and explainable in one sentence, and an insert-with-shift moves rows nobody touched (§3). Insert is still available — it is what a **seam** means, which puts both meanings one thumb-width apart and names each on the target.
- **Refuse a move that would overlap.** Rejected: a refusal that says "no" to a gesture the user just completed is the worst of the three outcomes, and the app already renders overlaps as a first-class state.
- **Put the slot picker in the event form instead of a sheet of its own.** Rejected: four of its five call sites do not open a form, and the two it replaces are not forms either. It is a chooser, so it passes no `errors` and no `validate` (ADR-0155 §5).
- **Make `החלף` a drag** (drop an idea onto an occupied row). This is ADR-0116 §5's rejected target, and the reason it gave — displacing a scheduled event is a decision, not a drop — is the reason §6 is a sheet. Kept rejected.
- **Give Trip mode Plan's violet gap chip.** Rejected: that is the mode confusion 0159 correctly diagnosed. The posture differs; only the tap is shared.
