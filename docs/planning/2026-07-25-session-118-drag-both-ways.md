# Session 118 — the drag goes both ways, and one ghost serves both drags

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-118 amendment)

Two owner requests, and together they close what was left asymmetric about the drag.

## 1. A row can be dragged onto the shelf

The shelf could put a card **onto** the day (a gap chip, §5). The day had no way to
send a row **back**. Since the grip already dragged for reorder, this is a new target
rather than a new gesture.

Dropping a row on a shelf group **parks** it. Which group sets the idea's **day**, not
whether it parks: the day's group keeps it pencilled in for the day it came off (what
`park` already did by default), the pool clears it to "someday". `park` gained a
`targetDate` override for that second case.

**Both groups materialize during a row drag.** §2's amendment conjured the day's group
for a pool idea in flight; a row can aim at either, and on a day with an empty shelf
both would otherwise be missing. Each empty zone names its own outcome
(`ליום הזה` / `מתישהו`) instead of both saying "drop here" — for this drag, which
group you pick _is_ the decision.

`resolveRowDrop` sits beside the card's table in `lib/shelf-drop.ts`: the shelf wins
over a row (it's below the list, so being over it is the more deliberate act), a row
wins over nothing, and a row dropped on itself is a grip nudged and released.

## 2. The ghost became a DOM clone, and the row drag got it

Session 117 gave the shelf card a floating clone and left the row drag with only its
source dimming — the same "correct but uninformative" gap that request was about.

The clone is now `cloneNode` of whatever the finger picked up, not a React re-render.
That's what lets **one** mechanism serve markup as different as a 150 px card and a
full-width row: no per-draggable "draw me while dragging" renderer, and the clone
can't drift from the original because it _is_ the original's markup. Session 117's
`shelfCard(subject, ghosted)` branch went away with it, and the lift styling moved
from the card's CSS to `.wp-dragghost > *`, where a spread `box-shadow` picks up
whatever radius the cloned element has.

Two things a naive copy would get wrong:

- **Size.** Out of its parent, a full-width row (or a flex-sized card) collapses to
  its text, so the host is sized from the source's box.
- **Identity.** Ids and `data-*` are stripped at every depth. `pointer-events: none`
  keeps the clone out of `elementFromPoint`, but a `querySelector` — in app code or in
  a test — would find a second `[data-bld-id="ev-1"]`. The clone is scenery; it must
  not be addressable. (My own e2e locator would have matched two elements.)

`useDragGhost` also stopped depending on mount order: `lift` and the ref both paint,
because the host normally mounts a frame after the lift but a consumer keeping it
mounted is just as valid, and an order-dependent ghost fails silently in exactly one
of the two.

## The flaky e2e, properly fixed

"The drop target keeps up while the page auto-scrolls" used to hold the finger where a
gap chip would **sweep past** and assert the highlight appeared. That races React's
batching — a target under the finger for one or two frames may never be painted — and
it failed under parallel load for a reason unrelated to the behaviour. (Session 117
had already rewritten it once, swapping polling for a `MutationObserver`; that treated
the symptom.)

It now holds in the opposite band, so the scroll **ends** with the shelf at rest under
the still finger: same invariant, stable end state, no race. A swept target isn't a
thing to assert on.

`holdOver()` also scrolls its target into view each round — a target below the fold
has a box outside the viewport, and a CDP touch there lands on nothing.

## Testing

`format` / `lint` / `typecheck` / `build` green. **993 unit tests / 92 files** (+8:
the row-drop table exhaustively, and the ghost's clone/sanitize/size behaviour).
**20 e2e / 3 files**, run through twice (`--repeat-each=2`, 40/40) — three new: the
row lifts a clone of itself that follows the finger and leaves no addressable
duplicate, and a row parks into each of the two groups.

The e2e harness now answers `DELETE /events/:id` and `POST /maybe-items` as well, so
a park (create-idea then delete-event) survives to the assertion instead of rolling
back — the same reason session 117 taught it `PATCH`.

Backend untouched. **Still wants a real-device pass** (ADR-0017).
