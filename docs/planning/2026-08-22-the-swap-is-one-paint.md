# 2026-08-22 — the swap is one paint

One owner report against the day turn shipped the day before (#667):

> _"There's a bug where after you swipe to the next/last day, there's like a stutter where you briefly (for a really short time, like a few ms) see the last day after swiping to the next (or previous) day."_

Fixed in [ADR-0200 §8](../decisions/0200-a-day-steps-with-a-swipe-and-the-shell-stops-scrolling.md). What is worth keeping from the session is not the fix — it is three things that were nearly got wrong.

## "A few ms" was a description of a wrong state, not of a fast animation

The instinct on reading _"a few ms"_ is to look for a duration to shorten. There was none. §7's commit called `onStep` and reset the offset in the same task, but only one of those two lands in that task: the reset is a DOM write, and dropping `data-swiping` drops the only rule that translates the page, so the page returns to level **immediately** — while the day change is a React update that commits later. In between, the surface draws the day you left, at level, at full opacity. Nothing about it is a transition. The report's "few ms" was the render's latency, which is why it read as a stutter rather than as a slide.

The lesson that generalises: **when two things must appear together and one of them is a DOM write and the other is a React update, they are not together.** The gap has no fixed size, so it will look fine on the machine that built it.

## The obvious fix was measured, not assumed — and it did nothing

`flushSync(() => onStep(step))` is exactly the tool for "make this update land in this task", and it left the probe just as red. `BrowserRouter` (react-router 7) wraps its location update in `React.startTransition` (`chunk-KS7C4IRE.mjs:10411`, read rather than recalled), and `flushSync` does not flush a transition. Since `?day=` is the day's single source (ADR-0110 §4), **every** day change in this app is a location change, so this is a property of the app and not of this gesture: nothing that navigates can be made synchronous, short of `useTransitions={false}` on the router — which buys a few pixels with every lazy route's Suspense behaviour.

Half an hour was spent writing a fix, running the test, and finding it unchanged. That is the cheap version of this discovery; the expensive version is shipping the `flushSync` and believing the comment above it.

## The probe was chosen to not be the fourth flake

`docs/backlog.md` already carries three e2e specs sharing one shape — a value sampled mid-animation, racing the machine that runs it — and the entry says the fix is a sampling strategy, not tolerance bumps. A `requestAnimationFrame` sampler hunting the flash would have been the fourth.

What the defect actually is, though, is an **ordering**, and the DOM can be asked about orderings: a `MutationObserver` log of states, and an assertion that a forbidden combination (page at level, old day drawn) never appears in it. No tolerance, no sampling rate, nothing to tune — and a browser cannot paint mid-task, so "one mutation batch" is a proof of unobservability rather than a measurement of speed. It went red across two batches before the fix and is green after.

The same probe found the second half nobody reported: the arriving day was drawn once at the scroll offset the day you left was reading at. §6's landing became a layout effect for it.

## One claim that had to be walked back

The layout-effect change is **not** what that second assertion proves. With the pager's reset deferred, the spec passes with the landing as an ordinary effect too — React flushes it before the observer's own microtask. Checked by reverting it and re-running, in the spirit of the root `CLAUDE.md`'s "count the call sites before claiming what a derivation does". The change stays, on the argument that a scroll write is geometry and belongs in the commit that changed the day; the spec's comment says exactly that, rather than implying coverage it does not have.

## What shipped

- `lib/useSwipePager.ts` — a `pageKey` option, a committed turn marking its reset **owed**, and a `useLayoutEffect` keyed on the page paying it. A refusal still clears at its own settle; a second swipe inside the wait takes the surface over.
- `lib/useDaySurface.ts` — passes `activeDate`; the landing is a layout effect.
- `e2e/day-swipe.spec.ts` — three cases (Trip, Plan, and a scrolled day) over one `watchSwap` probe.
- `lib/useSwipePager.test.tsx` — the contract as three unit cases, including the second-swipe guard, which was confirmed load-bearing by removing the line and watching it fail.
