# 2026-08-21 — A hard event answers the hold

**Designed, not built.** [ADR-0199](../decisions/0199-a-hard-event-answers-the-hold.md) + [`mockups/a-hard-event-answers-the-hold-v1.html`](../../mockups/a-hard-event-answers-the-hold-v1.html). The build is on the backlog with its four pieces itemised.

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
