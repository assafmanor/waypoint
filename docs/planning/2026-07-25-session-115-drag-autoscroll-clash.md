# Session 115 — The drag and the auto-scroll were fighting over the scroller

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-115 amendment)

Reported from the running app right after session 113 shipped: "dragging and auto-scrolling isn't working properly, I think that they're clashing with each other somehow. The dragging stroke isn't right either." Both halves were correct, and the diagnosis is worth keeping because neither cause was in the drag.

## 1. The auto-scroll was scrolling the wrong element

`nearestScroller` walks up for the first ancestor that scrolls vertically. A **horizontally**-scrolling strip reports `overflow-y: auto` — CSS makes the other axis compute to `auto` when one axis is not `visible` — and `.shelf` is typically a pixel or two taller than its content box. So it passed a bare `scrollHeight > clientHeight` test, and every drag from the shelf spent its frames nudging a 2 px strip instead of scrolling the page.

`DRAG_SCROLLER_MIN_OVERFLOW_PX` (24) is the floor. It's load-bearing, not defensive — the comment in the code says so, because it looks exactly like a line someone would "clean up".

## 2. The drop target went stale precisely while the auto-scroll worked

The hit-test ran on pointer **move** only. But a finger parked in the edge band doesn't move — the content moves under it. So the gap that the auto-scroll had just scrolled into view never highlighted and couldn't be dropped on. The drag appeared broken exactly when the auto-scroll was doing its job, which is why the two read as clashing.

The auto-scroll now takes an `onFrame` callback and fires it after every frame that **actually** scrolled (comparing `scrollTop` before/after, so sitting at the end of the scroller costs nothing), and the drag re-runs the same `hitTestDropTarget` the pointer path uses. One hit-test, two triggers.

## 3. The lift was styled backwards

The dragged card rendered at `opacity: 0.55` — borrowed from drag implementations where a **ghost follows the finger** and the source dims to show it left. Nothing follows the finger here, so the card is the only feedback, and fading it (ring included) made the thing being held the faintest thing on screen.

Now: full opacity, a crisp 2 px violet edge, real elevation, `scale(1.03)`, and `z-index` above its neighbours so the ring isn't clipped by the next card.

## Testing

964 tests / 90 files green (`format` / `lint` / `typecheck` / `build` too). Two new `edge-autoscroll` cases pin the scroller choice — a hair-overflowing horizontal strip is skipped, a genuinely scrolling inner container is picked — which is the bug that would otherwise come back the moment someone simplifies the predicate.

## Still unverified from here

The gesture stack (hold to arm → slop to abandon → scroll suppression → click suppression → selection suppression → edge auto-scroll → frame-driven hit-test) is reasoned and unit-tested, but **its feel has still never been on a device**. Three of session 113's fixes were corrections to earlier fixes in the same round, each arriving from a screenshot — that pattern is the signal that the remaining risk here is exactly the part tests can't reach.
