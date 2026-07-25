# Session 123 — the day's edges accept a drop, and a row lands on another day as an event

**Date:** 2026-07-25
**Branch:** `claude/event-drag-drop-edges-al857p`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-123 amendment)

Two owner requests off the shipped drag, both naming a place the gesture obviously
meant to reach and structurally could not.

## 1. Before the first event, and after the last

> "Like you could drag a maybe to a gap, you should be able to drag before the first
> or last event to add before or after (be careful for edge cases like for example
> when there's no time)."

A gap chip meant "the empty stretch **between** two consecutive events" — which
excludes the two stretches with an event on one side only. `gapBetween` cannot see
them: it takes two events.

So `lib/gaps.ts` gained `gapBeforeFirst` and `gapAfterLast`, returning the same
`{ minutes, fill }` shape, and `PlanDay` renders all three kinds through one new
`GapChip`. That last part is the whole reason the drop side needed **no** changes:
the slot has always travelled on the element (`data-gap-*`), so an edge chip is
already a drop target for both drags, for the gap-fill sheet, and for the highlight,
without a single new branch in either hit-test.

**Each chip hugs the event it is named for.** "Before the 10:00 tour" prefills
09:00–10:00, not 07:00. The day window is a floor on how far the chip reaches, not
what it aims at — and `gapBetween` already works this way, butting its slot against
the event before it.

**The tail chip and the `＋ הוסף אירוע` button offer the same slot** (`nextSlot`,
literally the same call), so they cannot drift. The chip is the one you can drop onto;
the button is the one you can tap without a gap existing.

### "when there's no time" — the four cases

The threshold that already governs every gap (`GAP_MIN_MINUTES`) answers all of them,
which is why the edge functions return `Gap | null` like `gapBetween` rather than
inventing a second vocabulary:

- a first event at or before 07:00 — 07:30 leaves 30 minutes, so nothing;
- a day of **untimed** events only — no timed edge to hang off. (The untimed rows hold
  no clock position, so the tail chip renders **below** them: nothing sits "after the
  last event" but the tail.)
- a last event running **past midnight** (ADR-0037) — the same-day tail is zero, the
  same clamp `nextSlot` already makes for ADR-0036;
- a read-only past trip — no gap chips at all (ADR-0040).

One deliberate asymmetry: an event **before** the day window (a 05:30 flight) measures
its leading gap from midnight instead. The small hours in front of it are exactly when
"add the taxi before this" gets asked.

## 2. An event carried to another day is still an event

> "dragging an event to another day, you should be able to move it as an event and not
> a maybe to the next day (same functionality as a maybe)."

Session 119's mid-drag day switch worked, and the pill accepted a release. But once the
drag had actually **walked** to the new day, the only thing there that accepted a row
was the shelf — and dropping a row on the shelf **parks** it, which turns the event into
an idea. Hence "it becomes a maybe": the day itself had nothing to catch it.

`resolveRowDrop` now reads the two targets the card table already had:

- **a gap chip → `MOVE_INTO`** (the chip carries its own day, so this is the cross-day
  path as well as a same-day reschedule);
- **the empty day → `MOVE_TO_DAY`**, keeping the event's own clock time exactly as the
  pill does. It can only ever be another day — the day the row came off has that row on
  it.

Precedence is now documented once for both tables in `lib/shelf-drop.ts`. Nothing in the
DOM can put two of these under one pointer; writing the order down is about the two
tables never answering the same pointer differently.

Dropping a row on an **occupied** row of another day stays out (ADR-0116 §5: displacing
a scheduled event is a ripple decision, ADR-0041). With free time and the pill both
accepting a row, nothing needs it.

## The write-shape decision this forced

A gap chip's `end` is a **prefill for a create** (`GAP_FILL_MINUTES`, capped at the gap).
Reading it as an instruction would shorten a two-hour visit to an hour every time it was
dragged. So a drop into free time gives an existing event the gap's **start** and its
**own** duration (`slotFor`); an untimed event has no length to keep and takes the
chip's block.

`RESTORE_INTO` — a skipped card dropped on a gap — took the chip's slot outright, so it
had that bug already. It shares `slotFor` now rather than being left divergent, and it
also writes the gap's `date`: latent since session 119 made it possible to carry a
skipped card to another day, where its slot moved and its `date` field didn't.

## Testing

`format` / `lint` / `typecheck` green; unit **1033 / 94 files** (+16: both edge
functions against all four no-room cases, and the row's new targets in the drop table).
**23 e2e / 3 files**, all passing — four new: the day offers a chip on each edge, an
idea dropped on the leading one opens the form at 08:00 rather than 07:00, a row
dropped there moves in front of the first event with no form, and a row carried onto an
empty tomorrow lands as an **event** with `.wp-maybecard` count 0 — which is the reported
bug, asserted from the outside.

Backend untouched. **Still wants a real-device pass** (ADR-0017) — a phone has never
held any of this.
