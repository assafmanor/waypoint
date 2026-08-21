# 0200 — A day steps with a swipe, and the document stops scrolling under the shell

**Status:** Accepted — **built 2026-08-21**
**Date:** 2026-08-21
**From:** two owner reports in one message. _"When swiping down from the bottom buttons when on home, it goes down to where there's empty space that shouldn't be there"_ (with a screenshot), and _"When on the trip day / plan day, swiping left or right should move to the next / prev day, and get a rebuff or something on the edges."_

**Narrows:** [0099](0099-retire-the-custom-edge-swipe-gesture.md) — its rule reads "no custom gesture surfaces in this app at all", and §3 below states what that rule was actually about and what it now says.
**Builds on:** [0182](0182-a-day-is-a-sequence-you-can-step-through.md) §4 + its 2026-08-13 device pass (the swipe contract this codebase already settled: capture on recognition, click-swallow on release, and the `touch-action` scar) · [0035](0035-in-app-back-and-return-gesture.md) §4 / [0090](0090-back-is-computed-from-nav-state.md) (the single-source day, and why a day change is a `replace`) · [0110](0110-maps-and-places-frontend-architecture.md) §4 (`useSelectDay` — one day action, however it is triggered) · [0159](0159-the-day-says-what-is-between-two-events.md) §1 (the two day surfaces may differ in posture, never about a fact) · [0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) §5 (a state that exists only during an animation must resolve when there is no animation) · [0199](0199-a-hard-event-answers-the-hold.md) §2 (`BEAT.PINNED`: strain, arrest, return — the statement this makes continuously instead)
**Amends:** [0121](0121-embedded-map-phase-6-design.md) §5's premise in passing — nothing about the Map changes, but the shell invariant that section relies on ("the body is the only scroller") is now enforced rather than assumed.

## Context

### The empty band

The screenshot shows the Home tab with the trip hero at the top of the body, the tab bar sitting 124 CSS px above the bottom of the screen, and a band of `--screen` under it. It is reachable only by a gesture that starts on the chrome, because `.body` contains its own overscroll — which is why it took this long to find.

Reading it off the frame at 3× on a 360×800 device: the nav's hairline is at 592.7 and its ground ends at 654.3; the system bar starts at 779. So the app frame is ~124 px short of the viewport, with the day-1 header (~128 px) scrolled off the top. The document itself had been scrolled.

**And the cause is one line that reads as boilerplate.** `tokens.css` sized the root chain `html, body, #root { height: 100% }` while `.app` is `height: 100dvh`. A percentage height on the root resolves against the **initial containing block**, which a mobile browser sizes to the viewport with its toolbars _hidden_ — the large viewport. `100dvh` is the viewport _as it is right now_. With browser chrome showing, the two disagree by exactly its height, so the document is taller than the frame it contains and the surplus is `body`'s own background below the tab bar.

The comment three lines down already said what should have been true: _"App-shell scrolls inside .body, not the document."_ Nothing enforced it.

### The day, and what the codebase already decided about swipes

Stepping day to day today means aiming at a 44 px pill in the header strip — fine for jumping four days out, and the wrong instrument for "and then?", which is the single most common thing a day surface is asked.

Two prior decisions point in opposite directions and both have to be answered:

- **ADR-0099 retired the edge-swipe and wrote "no custom gesture surfaces at all."**
- **ADR-0182 then shipped one** — the Map card's stop track — and its device pass reported the mechanism question as settled in favour of native scroll-snap: _"This one declaration replaces a pointer recogniser, a capture handshake and a click swallow."_

## Decision

### 1. The document does not scroll. Both halves of that are load-bearing

`html, body, #root` are sized in `dvh` (with `100%` kept as the fallback line, the same two-line idiom `.app` already uses), and `html, body` are `overflow: hidden`.

The unit fixes the cause: the document now tracks the same viewport the frame does, so the band does not exist. The `overflow` makes the invariant **true** rather than intended — on the root it propagates to the viewport, so no future disagreement between a frame's unit and the document's is scrollable, on either axis. Safe for every overlay in the app: `Modal`, `MediaViewer` and the toast are all `position: fixed` with their own inner scroller, and the app's one other scroll is `.body`'s.

**Not repaired by making `.app` `height: 100%`.** That trades the band for the tab bar sitting under the browser's toolbar, which is what `100dvh` was chosen for.

**What is deliberately NOT changed is `.body`'s 92 px of tail padding**, which is the other thing at the bottom of Home that looks like dead space. It is not dead: `.toast` is `position: fixed; bottom: 78px`, so it floats over the body's last ~56 px, and trimming the tail means a confirmation covering the row that produced it. That reason was nowhere in the code and is now a comment on the declaration.

### 2. A day surface steps one day per swipe, and the ends refuse by straining

`lib/useSwipePager.ts` — a horizontal recogniser on the day surface's root. Rightward is the **next** day and leftward the **previous**, expressed as "toward inline-start" and read off the host's computed `direction`, so the mirror (`[dir='ltr']`) reverses both without a second decision. Committed on release past `COMMIT_SHARE` (22%) of the surface's width — a share, so a 360 px phone and a 640 px desktop column ask the same effort of the finger.

**The rebuff is the gesture, not a beat.** At the first or last day of the trip the surface still follows the finger, at `EDGE_RESIST` (28%) of it and no further than `EDGE_MAX_PX` (40 px), then returns to level on release. That is `BEAT.PINNED`'s statement — strain, arrest, return to the anchor (ADR-0199 §2) — made _continuously by the thing the finger is on_ rather than played at it afterwards. `BEAT.REBUFF` was considered and is the wrong member anyway: it means "there is nothing to open" and rises vertically. Nothing new joins the beat family.

**The arriving day is free, and that is why there is no keyframe.** The follow is a `transform` behind a `[data-swiping]` attribute; on release the attribute for the settle goes on and the offset goes to `0`. The new day renders into the _same element_, still displaced by the finger's travel, and eases to level — so a committed step reads as the next day coming in from the side it was pulled from, at the cost of one `transition`. `--ease-arrive` on both halves: a page returning to level is an object settling, and on a refused swipe that easing's mild overshoot _is_ the recoil. The timer that takes the attributes off reads the same token the transition does and answers 0 under reduced motion, so neither can outlive an animation that did not play (ADR-0140 §5).

The transform lives behind the attribute rather than on the class because it establishes a containing block for `position: fixed` descendants and `PlanDay` renders `.wp-dragghost` inside this very element. The pager is also `enabled: false` while a drag is in flight, so the two states cannot overlap.

**Both surfaces, one hook.** `lib/useDaySwipe.ts` holds the day half — the neighbour exists or it does not, and selecting it goes through the same `useSelectDay` the header pills go through — and `DayView` and `PlanDay` each call it and wear the same class. Which day is next is a **fact**, and ADR-0159 §1 allows the two day surfaces to differ only in posture; `frontend/CLAUDE.md` records twice that a day-surface change made in `DayView` alone shipped broken in Plan.

**Nothing is lost by not having the gesture.** The header strip still selects any day directly and the anchor still returns to today, so this adds a second trigger for an action that already has an explicit one — which is also why it owes no new keyboard or screen-reader affordance.

### 3. So ADR-0099's rule is narrowed to what it was about: **back**

That ADR removed a gesture that _navigated the stack_ — it triggered `resolveBack` from anywhere on the screen, and the defect that killed it was that "anywhere" swallowed a chip row's scroll. Its own alternatives are all about the edge-swipe. ADR-0182 already shipped a swipe without reopening it, on a card, for stepping a sequence.

The rule that survives, and it is the one both of those cases actually obey: **no custom gesture may navigate, and no custom gesture may take an axis another element owns.** A swipe that steps a peer within one surface is not navigation in ADR-0099's sense — it writes `?day=` with `replace`, exactly as tapping a pill does — and §4 is how the second half is honoured.

### 4. The axis is claimed in JS, at the press and at the first real move — not with `touch-action`

This is the part that was decided by measurement, twice, and both measurements are worth keeping because each looks like the obvious answer to the other.

**First: without claiming the axis, the gesture never happens.** A touch starting on a bare stretch of the day got exactly **one** `pointermove` — 15 px of it — and then a `pointercancel`. Chrome claims a touch for scrolling at ~8 px of travel in _whatever_ direction, wherever panning is allowed, so a recogniser whose threshold is 24 px never reaches 24 px. The failure looked intermittent because the day **cards** worked the whole time: they already declare a `touch-action` of their own for the hold-drag (ADR-0199 §1).

**Second: `touch-action: pan-y` on the host is not available.** It is the standard answer and it was tried: the maybe shelf stopped scrolling horizontally at all. `touch-action` intersects down the ancestor chain and no descendant can widen it back — ADR-0182's device pass found the same thing from the other side, and this is that scar re-measured on this surface. As a _declaration_ it cannot tell "a bare stretch of the day" from "a strip that owns this axis", and a day surface contains both.

So the axis is claimed where that question can be asked:

- **At the press**, `lib/scrollable.ts`'s `scrollerWithin(target, host, 'inline')` — if a strip between the finger and the surface scrolls horizontally _right now_, the gesture is that strip's and the pager never arms. This is why a swipe across the shelf scrolls the shelf and nothing else needs to know that the shelf exists.
- **At the first move that means anything**, a non-passive `touchmove` decides the axis at `DECIDE_PX` (6 px — under Chrome's slop on purpose) and `preventDefault`s only when the travel is horizontal past `AXIS_RATIO`. A vertical start is never prevented, so the body scrolls as it always did.

The pointer path is unchanged for a mouse, which has no browser pan to lose.

**And the distance is read from the moves, never from the release event.** A `pointercancel` carries no meaningful coordinates, and a `pointerup` can arrive at the origin when the platform has no point left to report against — measured here, where a `touchEnd` lifting every finger produced `clientX: 0` and turned a rightward swipe into a large leftward one. A cancel commits nothing at all: it is the browser saying it took the gesture, not a short release.

### 5. Why a third pointer recogniser, and what makes it the shared one

`useHoldToDrag` is hold-gated and takes no capture (its element can unmount mid-gesture); `useSnapDrag` speaks px of sheet height on one axis in one direction, and its own header already records that it is "a PARTIAL convergence" with the hold "and still not an extraction". Neither answers "which way did the finger go, and is there a page that way", and generalising the sheet's would mean rewriting the sheet's drag — which root rule 8 says to ask about rather than take on silently.

So this one is written as the shared answer to its own question: axis-aware, direction-aware, page-shaped, `{ canStep, onStep }`. A second surface that pages is a hook call and a class.

## Consequences

- The document is no longer scrollable anywhere in the app. Any future surface that wants a scroll gets one on an element, which is what every existing one already does.
- `SWIPE_PAGER`'s six numbers are a device-pass debt in the same sense ADR-0182's peek width is: `SLOP_PX`, `AXIS_RATIO`, `DECIDE_PX` and `COMMIT_SHARE` are settled enough to ship and `DECIDE_PX` in particular is pinned against one engine's slop. If Safari's differs, that is the number to move.
- A gesture that begins horizontally and turns vertical will not scroll for the rest of that touch. Inherent to claiming an axis at 6 px, and the alternative is the gesture not existing.
- `lib/useSwipePager.test.tsx` owns the arithmetic, the mirror, the refusal and the axis decision; `e2e/day-swipe.spec.ts` owns what only an engine can answer — that the browser lets us have the axis, that a swipe over the shelf scrolls the shelf, and that **both** day surfaces step.
- The empty band itself has no automated guard, and this is stated rather than papered over: the condition is a disagreement between the initial containing block and the dynamic viewport, which no desktop engine and no jsdom run can produce. What is testable is the invariant, and `overflow: hidden` is now that assertion in the stylesheet rather than in a comment.

## Alternatives considered

- **Three mounted days in a scroll-snap track**, the shape ADR-0182's device pass endorsed. Rejected on cost and on correctness: a day surface is the heaviest screen in the app (time tree, zone contexts, verbs, drag targets, arrival scroll), and mounting the neighbours puts two more of them behind a peek nobody has looked at — while the peek itself would have to render a whole day to be a peek at all.
- **Arrows beside the day heading.** Refused for the same reason ADR-0182 §5 refused them on the card: the strip already answers "which day", and a second control saying the same thing costs height on the surface whose scarce axis it is. If the swipe proves undiscoverable on a device, this is where to look again.
- **Wrapping at the trip's ends.** The owner asked for a rebuff, which is the opposite decision, and it is the right one: the first and last day of a trip are facts about the trip, and a gesture that silently teleports across it hides one.
- **A `BEAT` for the edge.** Covered in §2 — the beat family gains no member, because the gesture can say it while it is happening.
