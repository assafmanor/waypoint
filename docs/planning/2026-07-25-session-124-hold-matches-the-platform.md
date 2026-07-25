# Session 124 — the hold matches the platform's own long-press

**Date:** 2026-07-25
**Branch:** `claude/drag-operation-delay-4g8l4l`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-124 amendment)

Owner request: the shelf card's press-and-hold-to-drag felt a beat too quick —
increase it, to roughly how long Android takes to fire its long-press haptic
after you hold an item.

`DRAG_HOLD_MS` (`frontend/src/constants.ts`) was 280 ms, chosen in session 113
purely to be "long enough that a scroll flick never arms a drag" — it had no
outside reference point. Android's `ViewConfiguration.getLongPressTimeout()`
defaults to 500 ms, and that's the delay the platform's own long-press
(and its haptic) fires against — the hold duration a phone's own gestures
already teach the hand to expect. Moved `DRAG_HOLD_MS` to 500 ms so the
shelf's hold arms right where the gesture already reads as confirmed.

`DRAG_DAY_DWELL_MS` (the spring-loaded-folder dwell over a day pill,
session 119) only has one real constraint: stay longer than the hold, since a
drag crosses several pills on its way anywhere and every one it merely passes
over must not open. Bumped it from 450 ms to 700 ms alongside the hold, to
keep that margin rather than let the two collide.

Both are named constants already (`constants.ts`), and the arming logic and
tests (`useHoldToDrag.ts`/`.test.tsx`, `useSpringLoadedDay.test.tsx`) read them
symbolically, so the behavior change is the two constant edits; only the prose
mentions of the old literal "280 ms" in comments/e2e narration needed updating
to stay accurate (`useHoldToDrag.ts`, `shelf-drag.spec.ts`,
`useHoldToDrag.test.tsx`).
