# Session 113 — Shelf polish from the running app

**Date:** 2026-07-25
**Branch:** `claude/maps-places-phase-5-hykm8z`
**ADR:** [0116](../decisions/0116-day-aware-shelf-and-idea-target-day.md) (session-113 amendment)

Three defects in the session-112 build, reported from screenshots of the real app on a phone. Recorded as an ADR-0116 amendment rather than a new ADR — each one is a consequence of a decision that ADR already made.

## 1. The two shelf groups were different heights

**Not a component fork** (the owner's first question): both groups render the same `MaybeCard`. The cause is that `.shelf` is a flex row, so cards stretch to match **within** a strip — and ADR-0116 §2 split the shelf into **two** strips, each with its own stretch context. One long place name (`ספא וילג׳ מלון בוטיק בצפון~Spa Village boutique hotel`, three lines) made the first strip tall while the second stayed one-line short.

Fixed at the card, not the container: a `min-height` floor sized to the tallest possible card (icon + 2-line title + meta + action), a **2-line title clamp** so nothing exceeds it (the `-webkit-line-clamp` treatment `.wp-event-title-txt` already uses, session 93), and `margin-top: auto` on the action so the `＋ שבץ ליום` line sits on the floor and aligns across cards. One height in every group.

## 2. Dragging didn't auto-scroll

ADR-0116 §5 designed the drag's **target** (a gap chip) and never addressed its **reach**. Since the shelf sits below the day's list and the list is taller than the viewport, the gap you're aiming for is usually off-screen — so the feature only worked for gaps that happened to be visible.

`lib/edge-autoscroll.ts`: while the pointer is held within an edge band, the scroller keeps moving, the step ramping with depth into the band (easing toward the edge crawls, pinning against it runs at full speed). It walks up to the **nearest scrolling ancestor** rather than assuming the window — this app scrolls `.body`. Wired into **both** builder drags, because the reorder grip had exactly the same reach limit; that made it one mechanism instead of the second copy rule 8 exists to prevent. `edgeScrollStep` is pure, so the pacing has unit tests (6) without needing layout.

## 3. The purple stroke was choppy

Two geometry bugs, not colour:

- `.dragging` used `outline` + `outline-offset`, which paints its own corner radius over the card's dashed border.
- The inner `.wp-maybecard-body` focus ring was a `radius-8` outline **inside** a `radius-15` card, so its corners cut across the card's.

Both became a spread `box-shadow` ring on the card itself — follows the card's own radius, anti-aliased, and it's the idiom the Map's next-stop ring already uses. Focus stays teal, drag stays violet, and the inner ring is gone (`:has(.wp-maybecard-body:focus-visible)` puts one ring on the card for both variants).

## Testing

`format` / `lint` / `typecheck` / `build` green; **945 tests / 89 files** (up 6: `edge-autoscroll.test.ts`).

Sizing and stroke are CSS-only, so they're verified by reading against the reported screenshots, not by a test — the shelf has no visual-regression harness. **The auto-scroll still wants a real-device pass** (ADR-0017): the pacing is tested, the touch feel isn't.
