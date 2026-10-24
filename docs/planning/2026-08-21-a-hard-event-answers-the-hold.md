# 2026-08-21 — A hard event answers the hold

**Designed and built, same day.** [ADR-0199](../decisions/0199-a-hard-event-answers-the-hold.md) + [`mockups/a-hard-event-answers-the-hold-v1.html`](../../mockups/a-hard-event-answers-the-hold-v1.html). The design was put to the owner first and approved unchanged, so what shipped is the mockup's defaults.

## The ask, and the thing that turned it into one question

Owner, verbatim: _"Plan day soft events are draggable, and the text is non selectable. Hard events are (rightfully so) non draggable, and the text is selectable. I want hard events to stay non draggable but it should do some animation for letting the user know that it's not. And hard events text should be non selectable like soft events. In trip day the text should also be non selectable."_

Read as written that is two changes: add an animation, add a CSS property in two places. Reading `PlanDay.tsx` and `useHoldToDrag.ts` first collapses it.

`user-select: none` is not a property someone forgot on the hard row. It is one of **three** things that arrive together with `dragProps` — the CSS rule (`.bld.draggable`), the `selectstart` cancel in `selection.suppress()`, and the `contextmenu` prevent — and `PlanDay` hands `dragProps` out on `soft && !ctx.readOnly`. A hard row gets none of the three because it gets none of the mechanism. So the app **is** answering a press-and-hold on a commitment today: with the platform's text-selection handles. The animation being asked for and the selection being complained about are the same hole from two sides, and the fix for one is the natural home of the fix for the other.

Second finding, from the same read: the shipped rule is keyed on the wrong thing. Both copies (`.bld.draggable`, `.wp-maybecard.draggable`) key on _draggable_, and what makes selection wrong on a day row is that a press on it is a **gesture** — which is why the two rows that never drag (a hard `.bld`, every `.wp-event`) were left selecting. Re-keying it turns three declarations into one.

## The one real fork, and it was not put to the owner

Which beat. `lib/one-shot.ts` already ships two candidates and the honest question is whether either fits:

- **`NUDGE`** — free, zero new CSS, and its own comment defines it as _something is wrong_. ADR-0011 guards a hard event on edit; it does not forbid moving one, and the event genuinely does move through the time chip. So the cheap option is the one that teaches a false thing about the core primitive.
- **`REBUFF`** — means _nothing to open_, which a hard row is not, and its arc **completes** (7px up and back), which is the opposite of what needs saying.

Not asked, because the file's own comment answers it: the axis and the meaning are explicitly the per-case part, keyframes live beside the surface, and `frontend/CLAUDE.md` calls the family "four members and counting". A fifth member is the one-line addition the infra was shaped for, not a second mechanism. The mockup plays all three on identical rows so the argument is watchable rather than asserted.

What _was_ left open, deliberately, is the pair of numbers a desktop screenshot cannot settle: the amplitude and the duration. Both are controls, the defaults are the recommendation, and every row on the page takes the real 500 ms hold with the 8px slop cancel so a phone can decide.

## The find that pays for having rendered it

The control §3 points at misses ADR-0017's floor. `button.bld-time` renders 27px tall and its touch target is the `::after` overlay at `inset: -8px 0` — **43px against a 44px floor**. ADR-0161 §7 picked the overlay deliberately and documented the trade it was avoiding (`min-height: 44px` on the chip took the row from 58px to 75px), but never wrote down what the overlay came to, so nothing has disagreed with it since. `-8.5px` closes it for free. Backlogged; the mockup only found it.

Worth noting how it surfaced: the measurement row was first written as "chip height vs 44px floor" and reported 27px, which reads as a gross violation the app does not have. Measuring the thing the finger actually hits is what produced the real number — and the real number happens to be a one-pixel miss, which is exactly the kind that survives being eyeballed.

## What is deliberately not in scope

Trip mode gets §4 only. `EventCard` is not draggable in any mode, so there is no drag attempt to answer there — the beat is surface-agnostic and joins by playing if a Trip-mode reorder ever ships. Folding `.wp-maybecard` into the one selection rule is a small widening of the ask and is strictly more correct (a read-only shelf card should not select either); it also removes the copy that would otherwise have been the fourth.

## What the build changed about the design

Two things, and both are corrections to the ADR rather than to the decision.

**The click swallow is not an e2e-only fact.** The draft said it was invisible to jsdom and belonged in `e2e/`. It is not: `fireEvent.click` after the release asserts it directly. Writing it as a unit test is also what surfaced the part that mattered more than the assertion — **when** the swallow is armed. Arming it at the refusal would have reproduced the bug `frontend/CLAUDE.md` already records once (the canvas's swallow armed at the drop, with the finger still down, expiring in `DRAG_CLICK_SWALLOW_MS` before the release's click arrived). It is armed at the release instead, and there is a test that rests the finger for three times that window.

What is genuinely browser-only turned out to be narrower and different: whether the beat **runs** — jsdom has no CSS engine, so `motionDurationMs` answers 0 there and every unit assertion takes the no-animation branch by construction — and whether text **selects**, `user-select` being a rendering property with no jsdom selection model behind it. `e2e/hard-row-hold.spec.ts` asks exactly those two, through CDP touch because `page.touchscreen` can only tap and this is entirely about the 500 ms in between.

**Three guards were checked by mutation, and one test was a lie until it was.** Deleting `move`'s `if (refused.current) return;` fails one unit test; deleting the `.is-pinned` animation fails one e2e; deleting the `user-select` rule fails two. Worth the five minutes: the repo has paid before for assertions that stayed green after the thing they were about was removed.

The lie was in the screen-level spec. `document.querySelector('.bld')` was answering with a **leftover row from an earlier describe in the same file** — a soft row `A` — so an assertion about a hard row's beat was reading an element that had nothing to do with it. It failed for the right reason eventually, but it would just as easily have passed for the wrong one. Queries there are scoped to the render's own container now. The general form is worth keeping: **in a file with more than one describe, a document-wide query is a query against whatever ran last.**
