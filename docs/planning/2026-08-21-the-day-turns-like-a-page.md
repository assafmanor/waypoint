# 2026-08-21 — The day turns like a page

**Built.** Two follow-ups on the swipe that shipped hours earlier, both from the owner using it. [ADR-0200](../decisions/0200-a-day-steps-with-a-swipe-and-the-shell-stops-scrolling.md) §6 and §7.

> _"The swipe should also preview the next day, it look and feel more continuous. Not good enough."_
> _"if you're at the end of the day, swiping keeps you on the bottom. It should be on the top of the day (preview too)"_
> _"BTW this should be true for the day strip as well. Not just for swipes"_

## The screenshot was the whole argument

The shipped gesture moved the current day with the finger and put nothing where it came from. So it was a card being dragged off a hole — and "continuity" turned out not to be a property of the outgoing page at all. Nothing about the follow needed tuning; something had to be **there**.

## The two asks are one decision, and the order matters

They arrived as three messages and read as three tasks. They are not.

A preview has to draw the neighbouring day at **some** scroll position. If a day can be entered at an arbitrary offset, the preview has to guess which one — and guessing wrong is the seam it exists to remove. The moment a day always opens at its **top**, the preview has exactly one view to draw and it is the one the commit lands on.

So the scroll rule is not a nice-to-have beside the preview; it is what makes the preview cheap. Had the preview been built first it would have needed the neighbour rendered at a live scroll offset, which is both expensive and unanswerable.

And the third message is the one that put the rule in the right **place**. A pixel offset is a fact about the day you were reading; carrying it into a different day is indefensible after a pill tap for exactly the reason it is indefensible after a swipe. One action, several triggers → the rule belongs at the surface keyed on `activeDate`, not in the gesture. `useDaySwipe` became `useDaySurface` because its job grew: not "the swipe" but "what both day surfaces do about which day they are showing".

## Rendering the real screen, and why that was the cheap answer

The instinct was a compact preview row — a heading and a few titles. It is the wrong shape twice: it needs a cross-fade to disguise the swap at the commit, and it is a **third** copy of the day's rows, which `frontend/CLAUDE.md` names as the mistake ADR-0159 §1 exists to prevent.

Two facts, checked before writing anything, made the real screen the smaller change:

- **`TripContext` carries `activeDate` in one value.** So a neighbour is a provider re-providing that value with one field swapped — no `date` prop threaded through a 1200-line screen and a 2300-line one.
- **Both day screens have seven effects between them and every one is "an arrival landed on me."** A small, countable gate.

Counting that second one is what found the defect that would have shipped: **`useArrivalParam` deletes the param it reads.** Two mounted day surfaces means the preview eats `?event=` and the day you actually land on never sees it. One option (`active: false`) covers all seven effects, because they all key off that hook.

That is the general lesson and it is the root `CLAUDE.md`'s own: _count the call sites before claiming what a derivation does._ "The preview is inert" was a claim about seven effects, and one `grep` turned it into a fact — including the one place where it was false.

## Three defects the render found that reading could not

1. **The transform applied twice.** `.day-swipe[data-swiping] .day-page` is a descendant selector, and a pane holds a whole day surface — so every pane's own inner page got the offset the pane was already carrying, and the preview's content slid out from under its own frame. `>` fixes it; `data-preview` on a pane's host is what keeps every later selector honest.
2. **The probe measured the wrong element, twice, and the second time it looked plausible.** `document.querySelector('.day-page')` returns whichever pane the DOM lists first. The first reading said the page was at 494 when it was at 136 — and 494 is a real box, so nothing about the number announced itself as wrong. This is the same shape as ADR-0179's note about a collision sweep reading the wrong rect: **when a class exists three times, a bare selector is a coin flip.**
3. **A fixed pane bleeds past the column.** Bounding it to the scroller stops it painting over the header and the tab bar; bounding it to the host's column with `overflow: clip` stops it sliding across the page background on a desktop viewport, where `.app` is centred rather than full width. Both are now measured in `e2e/day-swipe.spec.ts`.

## What "continuous" is, as a number

The claim is asserted as geometry rather than described, because a sign error, a wrong width, or a percentage resolved against the viewport instead of the column all show up here and in none of them does the day look wrong on its own. At a 120px drag on a 390px screen:

| box         |    left |   right |
| ----------- | ------: | ------: |
| `next` pane |    −246 | **112** |
| the page    | **136** |     494 |
| `prev` pane | **518** |     876 |

Three pages on one offset, each **one gutter** (24px) from the next, with the window clipped to the body's strip (132–773, the tab bar at 773). The spec asserts `page.left − next.right === gap` and reads the gutter off the stylesheet, so moving `--swipe-page-gap` cannot leave it pinning the old spacing.

**The gutter was the owner's correction and the first build did not have it.** Flush pages measured perfectly and read as one long sheet sliding past — the cards of tomorrow starting exactly where today's stopped, with nothing saying a boundary had been crossed. 24px because the day's own cards are 11px apart vertically: a page break has to be visibly wider than a card gap or it is one more row. Worth keeping as a lesson about the instrument, not just the number — _contiguous_ was the property I set out to prove, and proving it is what hid that contiguity was the wrong target.

## Deliberately not mocked

`design-mockups` is for falsifying a design before it is built, and its instrument is a drawing plus measurements. This has **no new visual grammar** — the peek is the existing day surface at full width — so there was nothing to draw the app does not already render. What was falsifiable was behavioural, and it was falsified by rendering the app under Playwright: three defects, listed above. The table a mockup would have carried is in the e2e spec, where it re-runs.

## Smaller things

- **The commit moved to the end of the turn.** Easing the offset back to zero read as an arrival only while nothing was drawn beside the page; with a pane there it would slide the preview out again. So the exit finishes the travel and the date changes when it lands, under the arriving pane. Two settle lengths follow, and the attribute carries which (`turn` / `back`) — one duration for both would remove the class mid-animation on the shorter one and the transform would snap.
- **A preview of _today_ shows the top while committing lands on the now-line** (ADR-0027/0043's "land on now" still wins, by declaration order). One day of the trip, and the alternative is a preview guessing where a watch loop will finish.
- **Both panes mount, not just the one being pulled toward** — a finger reverses, and re-deciding which side exists would flicker. At the ends the absent one is the affordance.
