# 2026-08-22 — the swipe gets its feel

Second report of the day against the day turn, both halves about feel:

> _"Merged, it works but: 1. It doesn't feel smooth enough. 2. Quick swipes don't always register."_

Fixed in [ADR-0200 §9](../decisions/0200-a-day-steps-with-a-swipe-and-the-shell-stops-scrolling.md). Four changes, and the point of the session is that each one was **measured first** — "feel" is the word for a defect nobody has taken a number off yet.

## Two thresholds were doing one job

The whole of _"not smooth enough"_ started here, and the code said it plainly once the two numbers were read together: `touchMove` takes the axis at `DECIDE_PX` (6px) by calling `preventDefault`, and the follow waited for `SLOP_PX` (24px). Between them the surface has stopped scrolling and has not started moving. Measured in the browser, page transform per 6px of finger: `0, 0, 0, 0, 0, 24, 28` — twenty px of nothing, then a **24px jump in one frame**, at the start of every swipe.

Nothing was protecting anything in that gap: the pan is gone at 6px whatever we do. So the claim moved to wherever the axis is decided, and the offset is measured from there — the page leaves level at 0 and tracks 1:1.

**The generalisable bit:** two thresholds that look like defence in depth, where the first one already spends the thing the second one is guarding. Worth checking whenever a gesture has both a "decide" and a "claim".

## The turn was wearing the refusal's easing

`--ease-arrive` is `cubic-bezier(0.22, 1.16, 0.36, 1)`. The `1.16` is an overshoot, and on a rebuff it is the entire sentence — strain, arrest, recoil. The same curve over a ~382px page turn is ~15px of the arriving day sliding past level and coming back. One token had been chosen for one of its two callers; §2 had already given them separate attribute values, so telling them apart cost nothing.

## "Quick swipes don't register" had already been reported once, about something else

`SNAP_FLICK_PX_PER_MS` exists, is 0.5px/ms, is sampled from the last two moves, and its docblock says: _"a real flick that travels little used to spring back to where it started"_ — the owner's complaint about the **sheet**, one release earlier. The pager just never asked about speed.

So this was a reuse, not a design: same threshold, same sampling rule, second surface. Two guards were added because two gestures are real — a flick must go the way the drag went (a flick back from a half-open page means "no", not "the other way"), and it must clear `SLOP_PX` (a thumb rolling off a tap is fast and is not a swipe).

Looking for the existing constant before writing a threshold turned a judgement call into a citation, and one already validated on the owner's own phone.

## What the measurements refused

- **`will-change` is not a style-recalc fix.** Four matched arms (30 moves each, same day, 241 nodes, alternating): recalc 36.0/35.7ms bare vs 32.4/31.0ms promoted — noise. Total main-thread work, though, fell 2.3 → 1.9ms per move with every bare arm worse than every promoted one. So it ships, on the number it actually moves, and the repo already carries that declaration for two other JS-driven fixed boxes.
- **The real per-frame cost is the inherited custom property**, invalidating the day plus both peeks every move: ~1.1–1.6ms of recalc for 241 nodes, 0.43ms for a 29-node day. Fixing it means not inheriting it — a registered `@property` written per mover, or the panes' geometry computed in JS. Both have a cost worth naming; neither is worth guessing at. Left as the named next lever with its numbers.
- **The settle ignores how far is left.** 240ms whether 20px or 380px remain. Real, and it interacts with §8's wait for the arriving render, so it is a device question rather than an obvious win. Named, not shipped.

## One claim I made and then withdrew, inside an hour

CDP's `Input.dispatchTouchEvent` takes a `timestamp`, and a probe on a static page showed it landing on `event.timeStamp` **exactly** (asked 573/673, got 573/673). I wrote that up as "stating the clock removes the machine from the question" and built a flick e2e on it.

The flick e2e failed. Instrumenting the running app showed why: moves dispatched 4ms apart were delivered **33ms** apart, and two moves through CDP round trips arrived **83ms** apart — input is coalesced to frame delivery, and the delivered event carries the frame's time. The timestamp is honoured only for gestures _slower_ than a frame.

Which means a gesture short enough that distance cannot commit it cannot be thrown fast enough to clear 0.5px/ms in that environment — the two conditions have no overlap. So the flick is pinned in the unit suite, where the clock is the test's own, and the e2e keeps the half the environment can state honestly: a slow short drag refusing, where a loaded machine can only refuse harder.

The comment in `e2e/touch.ts` now says what was measured instead of what I hoped. A probe on a page with no compositor activity is not a measurement of the app.

## What shipped

- `lib/useSwipePager.ts` — one `claim(atDx)` seam, an `origin` the offset and the commit distance are both measured from, and the flick (velocity from the last two moves, two guards, and the settle's travel derived from the committed step rather than from the sign of the drag).
- `constants.ts` — `SLOP_PX` and `COMMIT_SHARE` re-documented for the roles they now have; no new numbers.
- `screens.css` — `--ease-standard` for the turn, `will-change: transform` while swiping.
- `e2e/touch.ts` — an optional stated `timestamp`, with its measured limit written down.
- `e2e/day-swipe.spec.ts` — 16 now: the page leaves level at zero and never takes a step the finger did not, and a short unthrown drag still refuses.
- `lib/useSwipePager.test.tsx` — 24: the flick commits under the distance, the same distance dragged slowly refuses (the pair is what makes the first one non-vacuous), a flick against the drag refuses, a fast sub-slop twitch refuses, and the follow leaves level at zero.
