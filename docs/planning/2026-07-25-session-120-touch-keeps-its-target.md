# Session 120 — a touch keeps its target, and every create goes through the form

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-120 amendment)

## 1. The bug: the drag died coming back off the day strip

Reported precisely: lift a row, dwell on another day (switches — fine), then move
**down off the strip into the day view** and the drag cancels, the day snaps back,
nothing happened.

Session 119 already knew the switch unmounts the dragged row, and moved the gesture's
move/up listeners to the **window** for that reason. It got the _touch-scroll guard_
wrong. Rather than reason about it again, I reproduced the exact sequence as an e2e and
logged every pointer/touch event:

```
lostpointercapture  target=document
pointermove         target=header      ← retargeted, reaches the window fine
pointercancel       target=header      ← the browser takes the gesture
```

…and **no `touchmove` reaching the window at all**. That's the mechanism: a touch's
target is fixed at `touchstart`, and touch events keep being dispatched to that node
even once it's detached, where it has no path to `document` or `window`. So session
119's document-level copy of the guard could never fire, nothing called
`preventDefault`, the browser started panning, and it cancelled the pointer.

**Fix: the guard lives on the element and outlives the element.** The ref cleanup
deliberately doesn't remove it when the unmounting element is the one being dragged;
the drag's teardown does. The document-level copy is deleted — it was dead code with a
plausible-sounding comment, which is worse than no code.

The useful generalisation: window listeners are right for **pointer** events (they
retarget and keep arriving) and useless for **touch** events (they don't). Opposite
treatment for the two, which is why fixing only the pointer half looked like it worked.

## 2. Every drop that creates an event opens the form

The owner asked whether a gap drop should open the form, unsure. The line that holds is
**create vs move**:

- **idea → gap, idea → empty day** — a create: nothing existed, and time/length/kind
  are all still open. The form opens, prefilled with the gap's slot when the target had
  one and the day's next opening when it didn't. The old silent path committed a
  60-minute default the user never saw — a smaller version of the "hardcoded 17:30
  dump" that §5 replaced tap-to-schedule to get rid of.
- **everything already existing moves silently**: a skipped event restored into a gap
  (one patch, one undo), a row moved to another day, a row parked, an idea re-aimed.
  They have a title and a duration; a form is a speed bump.

`SHELF_DROP_ACTION.SCHEDULE` is retired — nothing schedules an idea straight from a
drop any more.

**Left alone on purpose:** tapping a gap chip and picking an idea from the gap-fill
sheet still commits into that slot. There the gap is the _premise_ (slot first, then
idea); in a drag you picked the idea and the gap is where your finger landed, so the
slot is the part worth confirming.

## Testing

`format` / `lint` / `typecheck` / `build` green. **1007 unit tests / 93 files** (the
drop-table cases updated to the new create/move split rather than added to). **25 e2e /
3 files**, run through twice (`--repeat-each=2`, 50/50) — two new: the reported
sequence (survives the day switch, then drops in the new day), written failing first,
and an idea dropped on a gap opening the form prefilled at that gap's start.

Backend untouched. **Still wants a real-device pass** (ADR-0017): iOS is where these
reports come from, and its touch retargeting is the exact behaviour this round turned
on.
