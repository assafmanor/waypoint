# 2026-08-22 — a day turns under a held card

Third report in two days against one gesture:

> _"I think that we need some kind of an animation or something for dragging between pages. Something that looks polished."_

Drawn in [`mockups/a-day-turns-under-a-held-card-v1.html`](../../mockups/a-day-turns-under-a-held-card-v1.html), promoted into [ADR-0116 §2c](../decisions/0116-day-aware-shelf-and-idea-target-day.md). Nothing is built; the file is the deliverable and the owner's verdict is what turns it into code.

## The brief was "add an animation" and the answer was "stop being the exception"

The app already owns a page turn: ADR-0200 §7 draws both neighbours as real day surfaces one page plus a gutter away, rides them on `--swipe-dx`, and lands them with §9b's `--t-base`/`--ease-standard`. The edge-drag day step, shipped the same morning, is **the only day change that does not use it** — it changes `activeDate` and lets React repaint.

That reframing is the whole session. The proposal's hand-written CSS is **12 lines**, and one of them is a term added to a shipped `transform`. A design session that had started from "what should the animation look like" would have drawn a progress ring and grown a component.

## Three numbers decided the design, and none of them was guessable

- **The gutter has to be crossed before any of tomorrow is visible.** `.day-peek` parks `--swipe-page-gap` (24px) _outside_ the window, so a 12px lean reveals 12px of page background and **0px** of the day it is promising. Every "small hint" design dies here.
- **Row displacement: 48px against 0px.** Leaning the whole strip moves the drop target under the finger; leaning only the incoming pane moves nothing. A drag is a targeting gesture, so that is the whole argument — and it is the one place this feature departs from §7's "the strip moves as one thing", deliberately, because during a swipe the finger _is_ dragging the strip and here nothing is.
- **The dwell is 700ms**, longer than every motion token but `--t-cinematic` (600ms), which `design-language.md` budgets to exactly one moment in the product. So the duration cannot be a token — and it should not be, because the motion must end when the day changes or it promises the wrong time. It reads `DRAG_DAY_DWELL_MS`.

`linear` then earns its place twice: it keeps the remaining time readable, and it makes the motion **samplable** — a sampled position is a sampled time, which is why the filmstrip is the real motion at 0 · 233 · 467 · 700ms rather than an artist's impression. `beats.css` had already written the same sentence for the beats.

## The render answered the one question that could have killed it

The dragged clone is a full-width row under the finger, so it covers the revealed strip **completely** across — 24 of 24px, nothing left clear. Written up like that, the design is dead.

Then the measurement was taken in the dimension that decides it: the reveal is the body's whole visible height (24 × 638px) and the clone is **one row** (68px of it). **89% of the reveal is never covered**, and the covered part still reads through `--drag-ghost-opacity` 0.78. `frontend/CLAUDE.md` warns that "a height cannot see a clip"; this is the same error mirrored, and I made it before I caught it.

## Three defects the file had while being built

Each was found by rendering, and each is recorded in the file rather than quietly fixed:

1. **The lean was added to the parked offset instead of subtracted**, so the "hint" pushed tomorrow _further_ off screen — `translateX(-400px)` where −304 was wanted. Now written as one multiplication where everything inside the bracket is a distance and only `--dir * --peek-side` carries a sign, so it cannot be got wrong again.
2. **A displacement of 378px** that was a fact about `justify-content: center`: I compared rects across frames living in different flex containers. Measured inside each frame it is 48 and 0.
3. **The striped band I drew to explain the edge was painted over the 24px reveal the file is about** — `z-index: 14` on top of the thing being proposed. A mockup hiding its own subject, and it took a screenshot to see. It is a dashed boundary now.

## A shipped defect, unrelated to the subject

`screens.css`'s `.day-peek` declares `--peek-dir: -1` (RTL) / `1` (LTR). That is `tokens.css`'s **`--dir`**, a shipped token with the same two values for the same job, documented in `design-language.md` as "the inline axis's PHYSICAL sign", already spent by `modal.css`, `form-steps.css` and `App.css` twice. I introduced the duplicate in ADR-0200 §7 the day before, in a session that reached for a new variable without looking for the existing one. The proposal's rule spends `--dir`; the duplicate goes with it when this is built.

Worth noting how it surfaced: not by reading the code again, but because the mockup's proposal had to _spend_ a direction, and the skill's rule-8 pass asks "what already does this job" about every line you are about to draw. The design stage caught a code duplicate.

## What is still open

Whether the 36px band wants any mark of its own. After §1 the question changes shape — the arriving neighbour _is_ the mark — but only a phone can say whether a first-time user finds the band at all. Same pass owns `DRAG_DAY_EDGE_PX` (36) and how much of tomorrow should show (16 · 24 · 32 · 44px, shipped at 24 as a recommendation and wired as a control).
