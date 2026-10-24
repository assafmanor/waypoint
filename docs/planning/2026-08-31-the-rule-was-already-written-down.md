# The rule was already written down — ADR-0213's eighth pass

**Date:** 2026-08-31
**Subject:** six owner reports on the shared itinerary; one of them a defect class this repo had documented, guarded, and shipped anyway.

## What came in

1. A merged day card wrote one weekday against a two-day number (`21-22 שני`).
2. A chained flight rendered a whole-journey row **and** a row per leg. _"This is confusing and should be changed."_
3. The download indication was not enough; why no Chrome download overlay; it wants a real downloading animation.
4. The live share still could not pull-to-refresh.
5. `שע׳ 3:30` instead of `3:30 שע׳`, with a screenshot. _"Please do a sweep and find and fix all of these."_
6. The printed QR and its link do not read as aligned.

All six are in [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s eighth amendment, §1–§7 (§3 is a seventh defect found while reproducing §1, not reported). This note records only what the session should be read for afterwards.

## Two of the six were caused by the seventh pass

Report 2 and report 4 are both **my previous round's fixes, working exactly as written and wrong at the next level up.**

Giving a leg its own duration and zone shift was defensible in isolation — the app shows both on every event row, and a shared flight was the one surface without them. What it produced was four durations and three zone shifts on a single card, because the frame already carried the totals. The unit of design was not the leg; it was the journey.

Opting the public reader out of `overscroll-behavior-y` and `touch-action` was likewise correct and likewise insufficient: `overscroll-behavior` governs a scroll **container**, and the page had an inner one while the viewport had `overflow: clip`. There was no overscroll to behave.

The pattern in both: **a fix verified at the level it was written, against a report that lived one level up.** The seventh pass's own headline was the same shape — three rounds proving a download link worked while the report was about feedback. That is now three consecutive rounds of it, which is why it is written here and not only in the ADR.

## The one worth the session: a rule with no missing knowledge

Report 5 is `ltrIsolate` wrapped around a phrase that contains Hebrew. Ten call sites. Nothing about it was unknown:

- `bidi.ts`'s header comment states the rule **and names this exact output**: _"a Hebrew reader meets the unit before the number (`ק״מ 9` for what should read `9 ק״מ`)"_.
- The same file exports `measure()`, which exists to do it correctly.
- ADR-0118 swept **75 sites** for the attribute form of the same defect.
- An ESLint rule blocks the attribute form.
- `place-summary.ts`'s docblock had already recorded that _"the guard reads `dir` attributes, and here the defect is a missing isolate"_ — i.e. someone had noticed the guard was blind to the helper form and written it down next to the code instead of extending the guard.

So the repo held the rule, the correct primitive, the precedent sweep, a lint guard, and a note saying the guard was incomplete. Ten sites violated it anyway, four of them in the app's task rows where every due-label with a time has been reversed on four surfaces.

**A documented rule with an incomplete guard is an undocumented rule.** The lesson is not "know the bidi rules" — the rules were known. It is that the honest response to "the guard cannot see this case" is to extend the guard in that same change, because a docblock observing its own blind spot protects nothing. The two new selectors are ~20 lines and were verified by reintroducing all three shipped shapes.

Corollary for the sweep itself: the screenshot's own card contained the control. The layover line one row above the broken one was correct, and both are `number + Hebrew unit`. When a report says "sometimes", look for the instance that works before looking for the cause.

## What measurement bought, twice

- **Report 3 was a hypothesis I held and it was false.** I expected that intercepting the click and doing `fetch` → blob had displaced Chrome's native download UI. Driving both paths in Chromium: each engages the download manager identically, with the right filename. Had I "fixed" it by reverting to a plain anchor I would have removed the progress affordance the owner actually asked for, in service of a cause that did not exist.
- **Report 6 was measured, not eyeballed.** `.pdf-qr-block` is `text-align: center`; `.pdf-qr` is a `display: block` with `width: 46px`, and a definite-width block ignores `text-align` entirely. Image at `55..101`, caption at `0..101`, centres 27px apart. The owner's own screenshot proportions matched the measurement (229/493 ≈ 46/101), which is what confirmed the reproduction before any change.

Both belong to the same habit the seventh pass wrote down: the audit is usually the deliverable.

## The test that should have caught §6

`the reader scrolls to its last day and its footer` drove `.sh-page.scrollTo()` and passed for a round while refresh was impossible. It asserted that **something** scrolled without asking **who** — and "who scrolls" is the entire question pull-to-refresh depends on. Rewritten to assert the document scrolls and that `.sh-page` is not a scroll container.

Worth generalising: a test that exercises a mechanism through the element it expects to find will keep passing when the right element changes. Where the identity of the actor is the behaviour, assert the identity.
