# Session 211 — The orphan sweep, the long press stops opening two things, and a warning that named nothing

**Date:** 2026-08-02
**Kind:** Two owner reports (both with screenshots) + the deferred item from the session before → build.
**Outcome:** [ADR-0157](../decisions/0157-a-place-can-be-removed.md) §6–§9, an in-place amendment to [ADR-0112](../decisions/0112-place-in-trip-is-referenced-not-cached.md), and one backlog line pruned.

## Three things, and only one of them was new work

1. **The orphan sweep** — the line session 210 backlogged rather than built.
2. **The long press opened two surfaces at once** — reported with a screenshot: the pin menu up, and the place card raised behind it.
3. **The menu's first verb was a lie** — it said `שינוי שם`; what it opens edits the name, the glyph, the category and takes a note on the way.

## The bug, and why the guard it needed already existed one target over

A marker is a DOM overlay, so the finger's release produces a DOM click — but the handler that selects a place is wired to **Google's own marker click**, a subscription. ADR-0148's build log had already learned this for the canvas: _"a subscription is not a stream to stop propagating"_, which is why the pane carries `gestureTapRef` alongside the recogniser's DOM swallow. The canvas tap consulted it. The marker did not.

So the fix is four lines, and the interesting part is the **test**. The first version passed without the fix, which is the failure mode worth recording: the `AdvancedMarker` stub wires its `onClick` as a DOM `onClick`, so `fireEvent.click` was travelling the one channel the DOM swallow already covers — proving the guard that was not broken. The stub now also hangs the callback on the node (`gmpClick`), the same trick `googleTap` already uses for the canvas, and the test fires it as a **call**. It fails without the fix and passes with it, which is the only version worth keeping.

## The sweep: four decisions, and one exclusion that matters more than the rest

- **What is spared.** Anything referenced (the definition) — and anything **carrying notes**. `Note.placeId` cascades, and a place's notes are not invisible: the notes screen lists them under its name. A sweep that destroyed them would be the one silent loss this feature has been careful to avoid at every other turn.
- **A week's grace, doing two jobs at once.** The row is a **paid cache** (`resolvePlace` dedups on `googlePlaceId`, so deleting an enriched orphan means buying Place Details again), and an **undo** of the delete that orphaned a place has to find it there to re-link. Both want the same thing: generous, not tight.
- **It runs on a mint.** A create is the only moment the table grows, it is already a write with a transaction and a change stream, and it bounds the work to one trip. The repo has no scheduler and a GC is not a good enough reason to add one. The cost is stated rather than hidden: a trip where nobody adds places is never swept — which is also a trip that is not growing.
- **Its deletions are real `Change`s, and are marked as not-your-edit.** The caches need the change; the change feed does not need to say _"דנה removed <place>"_ against whoever happened to pick a place that minute, for a row with no list entry and no pin. `HOUSEKEEPING_CHANGE` rides the delete's otherwise-unused `after` — no applier reads it — and `describeChange` skips it. The precedent is one ADR old: a note's edits stopped narrating for the same ring-pressure reason.

## What the sweep does NOT solve, and why that is the right shape

An orphan is still unreachable by hand. That was the gap; the answer is that nothing reaches it — the server collects it a week later. The rejected alternative is worth keeping written down: a UI listing orphans so they can be deleted is a second, uglier place list on a tab that already has one, showing rows whose defining property is that they mean nothing to the trip.

## Then the same evening, one report read twice (§8, §9)

> _"I created this place and then immediately tried to delete it. There are no linked entities here. Also I would really prefer if it mentioned what would be deleted."_

There **was** one linked entity, and the confirm had said so — `פריט אחד בטיול יישאר בלי מיקום`. It was the shelf idea `landPlace` creates behind every add, because a place with no reference would not list at all. So the sentence was correct, unactionable, and hiding the only fact worth knowing. The owner then got to the consequence before I did: _"it's probably the maybe that's gonna stay orphaned, right?"_

Two changes, and the order matters — the second was only visible once the first made the sentence honest:

- **§8, the line names its subjects.** `האירוע "ארוחת ערב" יישאר בלי מיקום`, up to two of them, counted by kind past that. The cost is Hebrew agreement, which is why the nouns are a table with a verb each: אירוע is masculine, הזמנה feminine, and no neutral singular verb serves both. It has its own unit test, because what can break here is the grammar between the words rather than the words.
- **§9, the sole idea goes with the place.** ADR-0135 §5 already ruled that scheduling a place consumes its **sole** idea — same helper, same reasoning, from the other end — and two or more are still two intentions, untouched. The confirm gains a clause that says the idea is deleted rather than promising it survives, and the undo re-creates it with its notes, after the place.

One implementation note worth keeping: the idea's removal rides the **same reducer action** as the place's. Two dispatches would take two undo snapshots, and the second would capture a state the first had already changed — the undo would then restore the moment _after_ the cascade rather than before it.

## Verified

`pnpm typecheck`, `lint`, `build`; 2336 frontend + 231 backend tests. Five new backend tests pin the sweep — including one per FK as a table, so a sixth reference added to the schema and not to the sweep is a failure rather than a data loss — plus the change-feed pair (a swept place is silent, a person's delete of the same place still speaks) and the marker-channel test above.

Driven against the running app: a backdated orphan disappeared on the next mint, its change row carrying `after: {"swept": true}`, and no other row moved.
