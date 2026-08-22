# 0200 — A day steps with a swipe, and the document stops scrolling under the shell

**Status:** Accepted — **built 2026-08-21**, **amended and extended the same day** (§6, §7 — the page turn previews the day it is turning to, and a day opens at its top)
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

### 1. The document does not scroll — one declaration, and it is `clip` rather than `hidden`

`html, body` take `overflow: clip`. Nothing else changes: the root chain stays `height: 100%`, and `.app` stays `100dvh`.

**The mismatch is left in place on purpose, because it can only ever fall one way.** `dvh` is never larger than `lvh`, and the ICB **is** `lvh` — so the frame can never overflow the document, and the surplus is always **below the fold**. Make the root unscrollable and the band is unreachable and never painted, which is the entirety of what was reported. On the root, `overflow` propagates to the viewport, so this is the enforcement of the comment that was already there rather than a second opinion about it. Safe for every overlay in the app: `Modal`, `MediaViewer` and the toast are all `position: fixed` with their own inner scroller, and the app's one other scroll is `.body`'s.

**`clip`, not `hidden`, and the reason is a principle rather than a measurement.** `hidden` makes an element a scroll **container** that merely refuses the user: it still has a scrollport, and `scrollIntoView` walks every scroll container between an element and the viewport. `hidden` on the root would therefore put a second, empty scroll target in front of `.body` on the one path in this app that aims a smooth scroll at a surface still settling — `lib/land-at-top.ts`. `clip` is not a scroll container at all: nothing to scroll, nothing to walk, identical propagation to the viewport, so it says only what is meant. `map.css` draws the same distinction for its own track.

**And the wrong turn is recorded because it is the more useful half.** `hidden` shipped first, the full e2e run came back with `e2e/event-arrival-scroll.spec.ts`'s Plan-day landing failing (the row unmoved at `top: 883` in an 844-high viewport), it passed in isolation, and the mechanism above was written up as the cause. It is not. Repeating each arm ~24–52 times on the same box:

| root style                 | Plan-day landing |
| -------------------------- | ---------------- |
| base — neither declaration | **51/52**        |
| `overflow: hidden`         | 46/48            |
| `overflow: clip`           | 47/48            |

**The base fails at the same rate. It is a pre-existing flake in that spec** (backlogged beside the one `shelf-drag.spec.ts` already carries), and the first two bisect rounds — 12/12 here, 8/8 there — were under-powered enough to look like clean separation while being noise. Two lessons worth more than the fix: **a bisect arm needs enough runs to distinguish the rate you are claiming**, and "it passes in isolation" is a statement about parallelism, not a diagnosis. `clip` stays because the reasoning above stands on its own; the numbers say only that neither spelling made anything worse.

**Also tried and dropped: sizing the root chain in `dvh` too.** It reads like the tidier fix (make the document track the same viewport the frame does, so the band never exists) and it is redundant given the first paragraph — `overflow` already makes the surplus unreachable. It also churns: `dvh` is re-resolved whenever the dynamic viewport is, and on the **root** that is a relayout of the whole document at an unpredictable moment during load, landing on the same `requestAnimationFrame` watch. A length that does not need to be dynamic should not be.

**Not repaired by making `.app` `height: 100%` either.** That trades the band for the tab bar sitting under the browser's toolbar, which is what `100dvh` was chosen for.

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

### 6. A day opens at its TOP, whichever way you got there

Owner, on the shipped swipe: _"if you're at the end of the day, swiping keeps you on the bottom. It should be on the top of the day"_ — and then, unprompted: _"this should be true for the day strip as well. Not just for swipes."_

That second sentence is the decision. A scroll offset is a fact about the day you were **reading**; carrying it into a different day is carrying the answer to a question nobody asked, and it is no more defensible after a pill tap than after a swipe. So the reset lives at the surface, keyed on `activeDate`, and every trigger inherits it: the swipe, a header pill, the anchor's way back to today, a deep link that lands on `?day=`. `lib/useDaySurface.ts` — the hook both day screens already call for the gesture, because none of this is a posture (ADR-0159 §1).

Two things it deliberately does not do.

**It does not fight the two landings that already exist.** An arrival named a card (`?event=` → `landAtTop`) and today opens on its now-line (ADR-0027/0043); both key on the same day change and both mean to win. Effects run in **declaration order**, so the hook is called early in both screens and those land on top of it. Called late it would erase them — the same trap `DayView`'s own `aimedAtCard` comment documents one layer in. The one visible consequence: a peek of **today** shows the day's top while committing to it lands on the now-line. One day of the trip, and the alternative is a preview that has to guess where a watch loop will end up.

**It is instant, never smooth.** The page turn has just supplied the motion; a second animation chasing it reads as the surface settling twice.

### 7. The page turn shows the page it is turning to

Owner, on the shipped version, with a screenshot of the void: _"The swipe should also preview the next day, it look and feel more continuous. Not good enough."_

The screenshot is the argument. §2's follow moved the current day with the finger and put **nothing** where it came from, so the gesture was a card being dragged off a hole. Continuity is not a property of the outgoing page.

**So both neighbours are drawn, one page **plus a gutter** away on the inline axis, riding the same offset — and they are the REAL day surface, not a summary of it.** `ui/domain/DayPeek.tsx` is a measured window over the body's visible strip; `state/day-preview.tsx` puts the same `<DayView>` / `<PlanDay>` inside it with one field of the trip context swapped.

**Rendering the real screen is the decision, and it is what removes the seam rather than hiding it.** When the turn lands, the arriving pane is at rest exactly where the committed day will be, drawn by the same components with the same props off the same derivation — so the swap is a pane unmounting and nothing moving. A compact preview row would have needed a cross-fade to disguise the difference, and would have drifted from the real row the first time either changed: `frontend/CLAUDE.md` records a third copy of the day's rows as the mistake ADR-0159 §1 exists to prevent. The peek inherits every future change to the day for free.

It is affordable because of §6. A day that always opens at its top means the peek only ever has to draw the day **from its top** — the one view it can produce without knowing where a scroll will end up. The two decisions are not independent; the second is what makes the first cheap.

Five things that make it hold, each of which was a defect first:

- **`activeDate` is shadowed, not threaded.** `TripContext` carries it in one value, so the pane re-provides that value with one field changed. A `date` prop would have to reach every child of a ~1200-line screen and a ~2300-line one that asks what day it is.
- **A preview must not spend the arrival.** `useArrivalParam` **deletes** the param it reads, so two mounted surfaces means the preview eats `?event=` and the day you land on never sees it. Found by counting the effects before writing anything: all seven across both screens are "an arrival landed on me", so **one** option (`active: false`) covers all of them. Same reason the now-line scroll is gated — the pane is not a scroller, so `scrollIntoView` inside it would walk out and move the real body under the finger.
- **The transform is on the host's inner PAGE, never on the host.** A transform makes its element the containing block for `position: fixed` inside it, and the panes are fixed. Host holds the offset variable, page and panes both read it, nobody's positioning is captured.
- **`>` and not a descendant space.** A pane holds a whole day surface, so `.day-page` and `.day-swipe` exist three times over while a gesture is live — the first render translated every pane's own inner page by the offset the pane already carried, and its content slid out from under its frame. `data-preview` on a pane's host is what keeps a selector honest afterwards; anything asking about the day you are on wants `.day-swipe:not([data-preview])`, and the e2e says so in a comment because it is a trap and not a style point.
- **The window is measured, and bounded twice.** To the scroller's visible strip, or a fixed layer paints over the header and the tab bar; and to the host's column with `overflow: clip`, or a pane mid-flight slides across the page background on a desktop viewport where `.app` is a centred column. Percentages cannot say "one page" here for the same reason — a fixed pane's percentages resolve against the **viewport**, which is wider than the column.

**The pages are a gutter apart, not flush.** Owner, on the first build of this section: _"there should be some gap between the days. They shouldn't look sticked together."_ Flush was the tidy answer and the wrong one — two days whose cards begin exactly where the previous day's end read as **one long sheet** sliding past, with nothing saying a boundary had been crossed. `--swipe-page-gap` is `--space-6` (24px), and the size is an argument rather than a preference: the day's own cards sit 11px apart vertically, so a page break has to be visibly wider than a card gap or it reads as one more row. It is still a feel number, and the device pass owns it.

The gutter is declared in the stylesheet and **read back by the pager** for the commit distance, the same discipline `motionDurationMs` follows for durations. A literal in the recogniser would be a second opinion about a spacing value, and the two would drift the first time either moved — the page would then stop a gutter short of level and the arriving day would sit visibly off. Nothing is drawn _in_ the gutter: the cards stopping is what marks the edge, and a divider there would be new grammar for a boundary the layout already states.

**The commit moved to the end of the turn.** §2 committed on release and eased the offset back to zero, which read as the new day arriving because nothing was drawn beside it. With a pane there, easing back to zero would slide the preview out and put the new content in the middle. So the exit finishes the travel — a full page out — and the date changes when it lands, with the arriving pane covering the screen. Two settle lengths follow, and the attribute carries which (`turn` / `back`) so the CSS and the timer that clears it cannot disagree: one duration for both would remove the class mid-animation on the shorter one and the transform would snap.

**Both panes mount, not only the one being pulled toward.** A finger reverses mid-gesture and re-deciding which side exists would flicker. At the trip's ends the absent one is doing real work — nothing arrives — which is ADR-0182's argument for the Map track's missing peek, and the second half of why the rebuff needs no label.

**Deliberately not mocked, and this is the reason rather than an omission.** `design-mockups` exists so a design decision can be falsified before it is built, and its instrument is a drawing plus measurements. This introduces **no new visual grammar at all** — the peek is the existing day surface at full width — so there was nothing to draw that the app does not already render, and no new geometry to measure that is not read off the real thing at runtime. What was actually falsifiable here was behavioural (does the preview steal the arrival, does the transform apply twice, is the pane bounded to the body) and it was falsified by rendering the app under Playwright and by counting effects, both of which found real defects. The measurements that would have gone in a mockup's table are in `e2e/day-swipe.spec.ts` instead, where they re-run.

## Consequences

- The document is no longer scrollable anywhere in the app. Any future surface that wants a scroll gets one on an element, which is what every existing one already does.
- **Two spellings in §1 are deliberate and both look like tidiness to change**: the root's `overflow` is `clip` and not `hidden`, and its `height` is `100%` and not `100dvh`. `e2e/shell-does-not-scroll.spec.ts` asserts the first (a computed value and a refused scroll are both real in an engine); the second is guarded only by the note there.
- **A peek costs two extra day renders per gesture, once**, at the moment the axis is claimed — not per frame: everything between the claim and the settle is a CSS custom property, and the only React state in the gesture is `live`, which flips twice. A day surface is the heaviest screen in the app, so this is the number to watch if a swipe ever feels like it hitches on a loaded day; the lever is what the pane renders, not how often.
- **`.day-swipe`, `.day-page` and every row class exist three times over while a gesture is live.** Any future test, style rule or query about the day you are ON has to say `:not([data-preview])` or scope to a direct child. Two rules and one spec already got this wrong before it was named.
- **`e2e/event-arrival-scroll.spec.ts` is a known flake at roughly 1 run in 25**, in both of its cases, established here at 51/52 on an untouched base while trying to pin it on this change. Backlogged rather than diagnosed — it is a measured-geometry assertion behind a lazy chunk, the same class as the `shelf-drag.spec.ts` entry already there.
- `SWIPE_PAGER`'s six numbers are a device-pass debt in the same sense ADR-0182's peek width is: `SLOP_PX`, `AXIS_RATIO`, `DECIDE_PX` and `COMMIT_SHARE` are settled enough to ship and `DECIDE_PX` in particular is pinned against one engine's slop. If Safari's differs, that is the number to move.
- A gesture that begins horizontally and turns vertical will not scroll for the rest of that touch. Inherent to claiming an axis at 6 px, and the alternative is the gesture not existing.
- `lib/useSwipePager.test.tsx` owns the arithmetic, the mirror, the refusal and the axis decision; `e2e/day-swipe.spec.ts` owns what only an engine can answer — that the browser lets us have the axis, that a swipe over the shelf scrolls the shelf, and that **both** day surfaces step.
- **The empty band itself has no automated guard, and the invariant behind it does.** The band needs a browser with retractable chrome — no desktop engine and no jsdom run can produce the disagreement between the ICB and the dynamic viewport. What an engine _can_ answer is the rule that makes it unreachable, so `e2e/shell-does-not-scroll.spec.ts` asks the three questions worth asking: the document refuses to scroll however it is asked, the root is not a scroll container, and the thing that _is_ supposed to scroll still does.

## Alternatives considered

- **Three mounted days in a scroll-snap track**, the shape ADR-0182's device pass endorsed. Rejected on cost and on correctness: a day surface is the heaviest screen in the app (time tree, zone contexts, verbs, drag targets, arrival scroll), and mounting the neighbours puts two more of them behind a peek nobody has looked at — while the peek itself would have to render a whole day to be a peek at all.
- **Arrows beside the day heading.** Refused for the same reason ADR-0182 §5 refused them on the card: the strip already answers "which day", and a second control saying the same thing costs height on the surface whose scarce axis it is. If the swipe proves undiscoverable on a device, this is where to look again.
- **Flush pages, no gutter.** The first build of §7; refused by the owner on the render — see above.
- **A divider drawn in the gutter** (a hairline page edge). Would remove all doubt, and it is new grammar for a boundary two stacks of cards already state by stopping. Held as the next lever if 24px of ground reads as too quiet on glass.
- **A compact preview row instead of the real surface** — cheap to render, and rejected on the seam: it needs a cross-fade to disguise the difference at the commit, and a second row grammar beside the one both day screens share. §7 above.
- **Committing the day at the drag's threshold**, so the "preview" is simply the real day being dragged back to centre. No pane, no providers. Rejected because it swaps the content _under the finger_ mid-gesture, which is the opposite of continuous, and it writes `?day=` several times for one wavering drag.
- **Rendering the neighbour at the CURRENT scroll offset** instead of from its top, so the preview matches where you would land. It is what the shipped behaviour required, and §6 removed the requirement instead — which is cheaper and, per the owner, what the day should do anyway.
- **Wrapping at the trip's ends.** The owner asked for a rebuff, which is the opposite decision, and it is the right one: the first and last day of a trip are facts about the trip, and a gesture that silently teleports across it hides one.
- **A `BEAT` for the edge.** Covered in §2 — the beat family gains no member, because the gesture can say it while it is happening.
