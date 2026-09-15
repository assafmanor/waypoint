# 2026-09-15 — The list scrolls first, and the sheet moves once it has nothing left to scroll

**Outcome:** [ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md)'s 2026-09-15 amendment (built, corrected the same day, rebuilt) · `SnapSheet` / `useSnapDrag` · `e2e/snap-sheet-drag.spec.ts` drives the real component in Chromium.

## What was asked

The owner, on the Map tab:

> You could also drag the list view to change the mode as well and it works, but only if the list isn't too long that it becomes scrollable. When scrollable, you can't drag the list to change the mode (to list / half half / full map). I want to add support for that. Keep in mind that there could be edge cases and you should cover them so that the behavior stays intuitive and coherent.

## What the code said

ADR-0122's 2026-08-06 amendment built the body drag for a list that fits and wrote the scrollable case off as _"the genuinely hard problem"_, reasoning from `touch-action`: it has to be set before the gesture starts, and the direction that would decide arrives too late. The same file's `e2e` spec asserted that attribute and nothing else.

That premise was retired a month later by a different surface. ADR-0200 §9 measured, for the day swipe, that a non-passive `touchmove` listener calling `preventDefault()` under Chrome's ~8px slop keeps the browser from starting its pan — and that not calling it lets the pan through exactly as if no listener existed. So the choice **can** be deferred to the first move.

## The first build, and the correction

The first build (PR #839, merged and deployed) chose the Google Maps order for an upward finger: the sheet grows first, and only once it is as tall as it gets does the rest of the travel scroll the list. The owner refused it off the deployed build:

> first it switches from half to full list and only then it scrolls. I want it to scroll first and only when there's nothing more to scroll then it goes to switch to full list.

The refusal is right for this product. At `half` the list is the thing being read and the map above it is context the user chose to keep; a gesture that takes the map away before the list has asked for the room is the mode switch arriving uninvited. So the rule is now asked of the **list**: can it still scroll the way the finger is going? If yes, the browser pans it, and when it runs out the same finger moves the sheet. If no, the sheet moves from the first pixel. A list that fits is at both ends at once and behaves as before.

## What the first build had called impossible, and how it is built

The same-gesture hand-off from a browser-owned pan. It is impossible as a `preventDefault` — once the pan is under way the `touchmove`s are non-cancelable — but the `touchmove`s keep arriving, so the hand-off is a second phase read off the touch stream: the hook watches each move while the list owns the gesture, and the move on which the list reports itself at its end becomes the origin of a sheet drag. `pointercancel` (the browser starting its pan) is not treated as the gesture's end while the list owns it; `touchend` releases. The sheet never crosses the height it had at the hand-off (a reversing finger is scrolling the list again, and the browser is already doing that), a hand-off walked back releases with zero velocity, and the scroller carries `overscroll-behavior: none` so the browser paints no bounce under the sheet's motion.

## What the tests found

- jsdom stamps back-to-back events ~0ms apart, so a unit test's last two moves read as a flick whatever the distance; the reversal case is what surfaced the walked-back-release rule.
- A hand-dispatched `touchmove` is not wrapped in React's `act`, so a state update it causes has not flushed when the next line reads the DOM — the hand-off looked like it never happened until the dispatch was wrapped.
- A test that asserts before it lifts leaks its `window` listeners into the next case; the touch cases lift first and assert after. And a scroll-metric stub written onto the prototype outlives `restoreAllMocks`, so it is deleted in `afterEach`.
- CDP delivers touch moves a frame apart, so 12 steps of 20px is 1.3px/ms — a flick. The e2e drags state their own clock through `dispatchTouch`'s timestamp.
- The harness had to set `--snap-top-h` as the Map does, or its handle row is 19px tall and a press aimed at it lands on the body.

## What is unmeasured

The claim and the hand-off are measured on Chromium (the e2e spec, plus ADR-0200 §9's earlier measurement of the same claim mechanism). iOS Safari's slop before it commits a pan is undocumented; the ADR names the lever (a touch-only decide threshold under the slop) for the device pass.
