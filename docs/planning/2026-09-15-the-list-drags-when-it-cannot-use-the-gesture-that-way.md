# 2026-09-15 — The list drags when it cannot use the gesture that way

**Outcome:** [ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md)'s 2026-09-15 amendment (built) · `SnapSheet` / `useSnapDrag` · `e2e/snap-sheet-drag.spec.ts` rewritten to drive the real component · one backlog line for the half deliberately left.

## What was asked

The owner, on the Map tab:

> You could also drag the list view to change the mode as well and it works, but only if the list isn't too long that it becomes scrollable. When scrollable, you can't drag the list to change the mode (to list / half half / full map). I want to add support for that. Keep in mind that there could be edge cases and you should cover them so that the behavior stays intuitive and coherent.

## What the code said

ADR-0122's 2026-08-06 amendment built the body drag for a list that fits and wrote the scrollable case off as _"the genuinely hard problem"_, reasoning from `touch-action`: it has to be set before the gesture starts, and the direction that would decide arrives too late. The same file's `e2e` spec asserted that attribute and nothing else.

That premise was retired a month later by a different surface. ADR-0200 §9 measured, for the day swipe, that a non-passive `touchmove` listener calling `preventDefault()` under Chrome's ~8px slop keeps the browser from starting its pan — and that not calling it lets the pan through exactly as if no listener existed. So the choice **can** be deferred to the first move, which is the whole problem.

## The rule

Up is the sheet's while the sheet can still grow. Down is the sheet's while the list is at its top. Everything else is the list's own scroll. From `half` a drag up therefore **opens** the list rather than scrolling it inside a half-height port; at `full` the same drag scrolls; a drag down from a list at its top closes the sheet; a drag down on a scrolled list scrolls it back and moves no sheet, at any stop. A list that fits behaves as before, because for it both directions answer the same. Plus the continuation: a drag up that reaches the top stop hands the rest of its travel to the list's scroll, so one gesture from `half` opens the list and starts reading it.

## What was built

- `useSnapDrag` takes an optional `claim({ dx, dy })`, asked once at the slop, and carries the touch half of the claim (a `touchmove` listener that prevents once — and only once — the gesture is ours). The handle row passes nothing and is unchanged.
- `SnapSheet` mounts a second instance for the body with the rule above as its `claim` and the continuation in its `onDrag`. The `data-drag` attribute, its `touch-action: none` rule and the `ResizeObserver` that maintained it are gone: one mechanism, both cases.
- `snap-sheet.ts` gains `stopsRangePx`, which `clampToStops` now uses — "can the sheet grow" is `max`.

## What the tests found

- jsdom stamps back-to-back events ~0ms apart, so a unit test's last two moves read as a flick whatever the distance; the continuation test waits 250ms before its final move for that reason.
- A test that asserts before it lifts leaks its `window` listeners into the next case. Two cascading failures traced to one such test; the touch cases now lift first and assert after.
- CDP delivers touch moves a frame apart, so 12 steps of 20px is 1.3px/ms — a flick, which commits to the next stop rather than the nearest. The e2e drags state their own clock through `dispatchTouch`'s timestamp.
- The harness had to set `--snap-top-h` as the Map does, or its handle row is 19px tall and a press aimed at it lands on the body.

## What was left, and why

The claim is measured on Chromium (the e2e spec, plus ADR-0200 §9's earlier measurement of the same mechanism). iOS Safari's slop before it commits a pan is undocumented; if it commits on the first unprevented `touchmove`, an up-drag from `half` would sometimes scroll instead of opening — degraded, not broken, and the ADR names the lever (a touch-only decide threshold under the slop) for the device pass.

A drag down on a scrolled list still takes two gestures to close the sheet. In that direction the browser owns the pan and its `touchmove`s are non-cancelable, so a takeover at `scrollTop === 0` would fight the native overscroll. The single-gesture version is a JS-driven scroll for the whole gesture, a trade a device has to weigh — backlog line added.
