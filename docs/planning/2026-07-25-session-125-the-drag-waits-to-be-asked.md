# Session 125 — the auto-scroll waits to be asked

**Date:** 2026-07-25
**Branch:** `claude/drag-drop-autoscroll-bug-d3rs6p`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-125 amendment)

Owner report: "when near the top or bottom of the screen, when you start dragging,
it starts scrolling to the direction that you're close to automatically before you
even started moving."

## What was actually happening

Two separate defects, both in the first frames of a drag — the pacing and the band
geometry (sessions 115/116) were fine.

**1. The tracked point started at `0,0`.** `useEdgeAutoScroll().start()` kicked off
the rAF loop but seeded nothing; `track()` only ever ran on a pointer _move_. So
between arming and the first move, the loop compared `0 - scrollerTop` against the
scroller's height — deep in the top band — and scrolled up at `DRAG_EDGE_SCROLL_MAX_PX`
a frame. Every drag did this, wherever it was lifted; near the top it just looked
like "it followed the edge I was near". The `.body` scroll offset in the e2e proof
went 534 → 0 under a finger that never moved.

Interesting in hindsight: the existing e2e case for native-scroll suppression had a
`waitForTimeout(300)` labelled "let any auto-scroll from the lift settle". That was
the bug, sitting in a test comment, masked because the case only cared about what
happened _after_ it.

**2. A drag lifted inside a band could not be told from one that had reached it.**
Once the first move landed, the position was right — and still wrong, because the
shelf sits at the bottom of the list: a shelf card is picked up **inside** the
bottom band by construction, so the smallest movement re-started the runaway. The
two situations are opposite intentions. Reaching an edge asks for what is off-screen;
resting at one is just where the thing you grabbed happens to live.

## The fix

`start(from, at, onFrame)` — the lift point (`onArm` already had it) seeds the
tracked position, and decides the **latch**: the band the drag was lifted in is held
off until the pointer leaves it once, after which it behaves like any other. The
opposite band is never latched. `gateEdgeStep` is the whole rule, pure and
per-frame; `stop()` clears the latch so a drag never inherits the previous one's.

Considered and rejected: a distance gate ("no scrolling until the finger has moved
N px"). It matches the wording of the report and not the behaviour — a card lifted
in the shelf is still in the bottom band 20 px later, so the list would run away a
heartbeat after the gate opened, and it would fight the one direction a shelf drag
actually goes (up, onto the day).

## Tests

- `lib/edge-autoscroll.test.ts` — `gateEdgeStep` as arithmetic, plus the loop itself
  under a hand-cranked `requestAnimationFrame` and a synthetic scroller (jsdom has
  no layout, so height/overflow/`scrollTop` are supplied). Three of the new cases
  fail against the old code, which is the point of them.
- `e2e/shelf-drag.spec.ts` — a new describe on a tall day: a row parked at the top
  of the scroller, held still, with the list not moving; then out of the band and
  back in, to prove the band still works. Plus the far edge still engaging at once.
- One existing case changed: "the drop target keeps up while the page auto-scrolls"
  lifted a card from the shelf (bottom band) and held in the bottom band. It now
  steps clear of the band first — the same thing a finger does, and now part of the
  contract rather than incidental.

## Follow-up in the same session — the latch was too strict

Reported after the first fix shipped: "near an edge, if you want to drag in the
direction of the edge, it doesn't allow you even after starting the move."

Leaving the band was the only release, which is a _position_ test on a problem about
_intent_ — and it made the one edge you could not reach the one you started next to.
A card lifted in the shelf had to be walked a full band's depth up the screen and
back down before the bottom band would answer, which is precisely the gesture "drag
this further down" should have been.

The latch now also releases when the pointer has moved `DRAG_EDGE_SCROLL_RELEASE_PX`
(16 px) **toward** its own edge, which is why it remembers where the drag was lifted
(`{ dir, from }`) rather than just which band. 16 px is above `DRAG_HOLD_SLOP_PX` (8),
so the wobble of a thumb settling on a card never reads as a push, and roughly a
fifth of the band's depth, so asking for the near edge stays one small movement.

Both halves are pinned: `gateEdgeStep` cases for the wobble and the push, hook cases
for each through the real loop, and an e2e that lifts a row inside the top band and
pushes straight on toward the top edge without ever leaving it (verified failing
against the exit-only latch).

## Still open

The real-device pass on the builder's drags (backlog) is unchanged and still wants
doing: this was found on a phone and fixed against Chromium.
