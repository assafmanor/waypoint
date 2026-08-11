# 0182 — A day is a **sequence you can step through**, and the card is where you step

**Status:** Accepted (2026-08-10) — **built 2026-08-11**, §9's prerequisite discharged first in the same change. The real-device pass (peek width, and whether a horizontal snap over a pannable canvas feels right) is still owed.
**Date:** 2026-08-10
**Session note:** [`planning/2026-08-10-session-240-stepping-through-a-day-of-stops.md`](../planning/2026-08-10-session-240-stepping-through-a-day-of-stops.md)
**Mockups:** [`map-stop-traversal-v1.html`](../../mockups/map-stop-traversal-v1.html) (§1–§7, the rail) · [`map-stop-traversal-v2.html`](../../mockups/map-stop-traversal-v2.html) (§1–§5, **the peek that replaced it — see the 2026-08-10 amendment**)
**Backlog:** **J**, from field report **#25 / ADD-04** ([`planning/2026-08-08-…-addendum`](../planning/2026-08-08-session-224-incremental-field-reports-addendum.md) §5). The addendum's **#22–#26** is its own numbering and is unrelated to the Map epic's internal **#1–#23**; this is addendum #25.

**Amends in place:**

- [0121](0121-embedded-map-phase-6-design.md) §6 — the stop sequence `buildPinOrderIndex` builds internally becomes a **named export with its own name**, because it now has a second reader. §6 defined the number; it never named the list the number indexes into.

**Relates:** [0011](0011-hard-soft-event-model.md) (why `placeDayEntries` is not the tail primitive it looks like) · [0017](0017-mobile-first-device-targets.md) (the 44px floor the arrows are measured against) · [0028](0028-plan-violet-color-budget-dark-ready.md) (this spends nothing from the budget) · [0096](0096-per-domain-claude-md-guides.md) / rule 8 (why the sequence is extracted and the rail is a line inside an existing card) · [0122](0122-map-split-controls-over-the-canvas.md) §7 (the card is "the row wherever the sheet cannot show it") · [0129](0129-map-camera-moves-like-a-camera.md) §1 (selecting frames, which is why traversal pans) · [0145](0145-the-canvas-takes-a-one-finger-zoom.md) §A2 (the capture-at-drag-start arbitration this reuses) · [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §8 (the card can hold a scroller, which is why `touch-action` is `pan-y`) · [0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) §7/§10b (one connection is one stop; a number is only ever a known moment's index)

## Context

The Map's selected place card can only be **replaced**. You tap a place, read it, and to see the next one you go back to the list and tap again — on the tab whose whole point is that the list and the canvas are one selection (ADR-0121 §8). The owner asked for the day's stops to be **steppable from the card itself**, by swipe and by explicit arrows.

`nextStopId` exists in `screens/Map.tsx` but is not a sequence — it drives one amber tag on one pin. Nothing on this tab traverses anything.

Decided by the owner before the design session and **not reopened here**: the full-map view with a day selected; **both** gestures rather than one; the unit is a logical map stop per the one-connection-one-stop rule; selection pans; ~~navigation wraps~~ (**reversed by the 2026-08-10 amendment**, once the peek made the ends legible on their own); and the consecutive-same-Place consolidation is the confirmed **minimum**, with broader grouping left to a future session.

## Decision

### 1. The sequence is **extracted**, not written. It already exists.

`lib/map-pins.ts`'s `buildPinOrderIndex` does this today: build `stops` from each day usage's moments → sort (timed by instant, untimed after, then `sortOrder`, then name) → collapse adjacent same-Place moments **when that place is a connection stop on this day** into `merged` → filter to the moments the app _knows_ into `numbered` → return `Map<placeId, number>`.

**`merged` is the traversable sequence and it already carries exactly the rule the owner decided.** It is a local `const` that never leaves the function.

So the data work is `buildDayStopSequence(usages, ctx) → DayStop[]`, exported from the same module, **consumed by `buildPinOrderIndex` itself** so there is one derivation and not two. This is rule 8's "generalise the one-off", and the pressure for it predates this feature: **three** call sites already want the day in order and each rebuilds it differently — `buildPinOrderIndex` internally, `screens/Map.tsx`'s `orderedStops` (which re-derives from `pin.order` and discards place identity, keeping `{lat, lng}` for the connector), and `mapsDayRouteUrl` downstream of that.

The sequence stays **clock-free**, which is the property §6 was built to protect: a tick must never renumber a pin, and it must not reorder a traversal either.

### 2. `placeDayEntries` is **not** read for the tail. It is not a tail primitive.

This is the one premise the brief got wrong, and it is worth writing down because the name invites the mistake. `DayPlacement` is a three-way split on the **hard/soft** axis (ADR-0011), not on timed/untimed: unpositioned **commitments** go to a strip **above** the day list, unpositioned **ideas** to the tail **below** it. Concatenating "its tail" after the Map's timed stops would put an unpositioned hard commitment **last**, where the day view deliberately puts it **first**. It is also event-shaped — `UnplacedRow` carries a `TripEvent` — where a map stop is place-shaped (`{usage, day, moment}`).

The tail the Map needs is a population `buildPinOrderIndex` filters out in its first step: `hasScheduleSlot` requires `prominence === 'edge'` **and** an `eventId`, while the list asks only `inDayScope`. The populations nest — numbered ⊂ merged ⊂ `hasScheduleSlot` ⊂ `inDayScope` — and the gap between the last two is exactly the day's slotless ideas.

**So the sequence is `merged`, then the `idea`-tier places**, and both halves are named by rules that already exist rather than by a new predicate. `ambient` is excluded for the same reason: `PIN_TIER.ambient` is already _"a strictly-middle night of an ambient stay: backdrop, not a stop."_ A night you are asleep somewhere is not somewhere you step to.

### 3. A flexible time traverses **at its instant**, interleaved — not in the tail.

The two primitives disagree here on purpose, and both are right about their own surface. `placeDayEntries` parks a floor (`מ-15:00`) out of the sequence entirely (ADR-0171 §10a: a floor is open on the side you act, so it holds no position). `buildPinOrderIndex` keeps it **in** the list at its floor instant and only takes its number away (§10b: _"The unknown ones keep their place in the list and lose the mark"_).

Traversal follows `buildPinOrderIndex`, and the reason is not symmetry — it is that **the numbers are on screen**. Every pin on the canvas and the badge on the card itself carry them, so a traversal order that disagreed with them would be the screen contradicting itself, which is precisely the defect §6's 2026-08-06 amendment was written to close (_"the numbering is weird"_ — an airport reading `1 · 18:00` above a place reading `2 · 09:00`).

The owner's rule — "untimed/flexible items appear after the timed portion" — is honoured by the part of it that has no instant to be placed at: **clockless** items are the tail. A floor has an instant, and on a map that instant is still where you will be.

Owner, on the fork: **interleaved**.

**REVERSED 2026-08-11, and the reason is that the section above was answering the wrong question.** Owner: _"I prefer that unnumbered events will be at the end, so a hotel check in/out, a place with an untimed event, a maybe place, etc. should be at the end of the list — and same thing for the map sequential cards."_

The argument for interleaving was that the numbers are on screen and a traversal order contradicting them is the screen contradicting itself. That is true, and it only ever applied to **numbered** stops. An unnumbered one carries nothing to contradict — so sinking it costs the invariant nothing, and it buys agreement with the Day view, which has parked floors out of its sequence since ADR-0171 §10a.

**What the build then found is that the defect was never really about interleaving.** The list and the number were asking two different questions:

|                                       | asks                                       | so a hotel check-in…                     |
| ------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| the number (`buildPinOrderIndex`)     | is this moment **exact**? (`isExactEdge`)  | **unnumbered** — "from 15:00" is a floor |
| the order (`comparePlacesBySchedule`) | does it have a **clock**? (`d.at == null`) | sorted at 15:00, among the numbered      |

A check-in has a time and no defensible position; a check-out is the same with a ceiling. Both were unnumbered _and_ sorted as timed — so the owner's two examples that "already worked" (an untimed event, a maybe place) were the ones whose clock happened to be absent, and the two that did not were the ones carrying a clock they could not defend.

So the fix is not a new ordering rule. **The order asks the same question the number asks**, and the predicate that answers it is one function with two readers: `knowsMoment`, lifted out of `buildDayStopSequence` where it was a local `knows` with a single caller (root rule 8 — generalise the one-off rather than write a second beside it). `PlaceOrderContext` gains an optional `eventById` in the shape ADR-0171 already uses: absent, every clocked moment counts as known and the order is exactly what it was.

Deliberately **not** generalised: the two `rank` functions. They sort different units — places against moments — and the sequence excludes `ambient` outright, so a shared rank would be half-inert in one caller. The predicate is the shared unit; the ranks stay local.

### 4. The gesture: capture on recognition, `pan-y`, and no new arbitration.

The fifth gesture does not join the canvas's four-way arbitration, and the reason is structural rather than careful design: **`.map-placecard` is a sibling of `<MapPane>` inside `.map-split`, not a descendant** (wrapping the pane remounts it, and a remount is a billed map load — ADR-0121 §4). `useCanvasGestures` attaches its capture-phase listeners to the **pane**, so a `pointerdown` on the card never reaches the canvas recogniser at all.

What is real is the boundary, measured off the rendered frames at 360×640:

|                                                           |           |                                                                       |
| --------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| the card's inline gutter of bare canvas, each side        | **8px**   | why arrows on the canvas are refused (§5)                             |
| the seam from the card's bottom edge to `SnapSheet`'s top | **30px**  | `--map-attr-h` 22 + 8; the sheet's top region is `touch-action: none` |
| free canvas above the card                                | **126px** | what pan, pinch and the long press are left                           |

The 30px seam decides the mechanism. It is under the 44px floor, but it is a _margin_ and not a control, so the conclusion inverts: a finger starting there is already on a region carrying `touch-action: none`, and the browser does not hand a native pan back once it has started one. So the swipe **takes the pointer (`setPointerCapture`) the moment it is recognised** — which is not a new rule but the one ADR-0145 §A2 already settled between the two existing drags: _"Both drags take capture at drag start, which is the whole of the arbitration between them."_

Two more things it inherits rather than invents:

- **`touch-action: pan-y`** on the card, never `none` and never `pan-x`. The card can hold a note list that scrolls (ADR-0153 §8), and `maybe-card.css`'s session-114 note is the scar: _"`none` killed the strip's swipe; `pan-x` then killed the page's."_ Horizontal is ours, vertical stays the content's.
- **`armClickSwallow` on release** (`lib/click-swallow.ts`). The card is full of controls — `נווט`, the rename pencil, the badge, the way-in rows — and a swipe that begins on one must not fire it. Armed at the **release**, which is the event before the `click` being guarded; arming it at the decision is ADR-0148's amendment written the wrong way round, and `frontend/CLAUDE.md` lists it as a scar for exactly this canvas.

The **slop threshold** ships as a recommendation of ⁦36px⁩ and is the device pass's to settle. `SNAP_DRAG_SLOP_PX` is 4px, but that guards a vertical drag on a region that owns its axis outright; a horizontal swipe on a card sitting on a pannable canvas needs more room to declare itself.

### 5. The arrows are a **line inside the card**, not a footer under it.

The card already has a grammar for "a full-width line inside itself", written three times: `.map-refs`, `.place > .note-sec` and `.place > .docr-sec` are the same five declarations, and `.place` is `flex-wrap: wrap` _precisely_ so such a line can exist. The rail is that grammar's fourth tenant.

**This replaced the first draft, and the owner's words are the reason:** _"the bottom rail is rounded but the place card itself is rounded as well · that makes it look awkward and not related."_ The rail had been a **sibling** of `.place`, and `.place` is a self-contained card — its own ground, `border-radius: 16px`, hairline, floating shadow, and `.selected`'s 2px ring, which stopped halfway down and made the fault visible. Nothing outside that box can read as part of it. Moving it inside meant the proposed CSS **lost** declarations: ground, radius, shadow, clip and the selection ring are all inherited.

Two things the move surfaced, both invisible in the source:

- Those five declarations now appear **four** times in `map.css`. One `.place > .place-line` class is the obvious collapse (rule 8). **Not this feature's job** — flagged, not taken.
- Their `margin-top: 8px` is spend nobody can see: `.place` is `gap: 11px`, and flex gap applies between **wrapped lines**, so those blocks are already separated by 19px. The rail drops the margin and reads identically.

The two rejected placements died on the render, not the argument:

- **Inside the name row.** `.map-t` already holds the name, the lock mark and the rename pencil, and the name is the row's one flexible column — two 30px arrows truncate `שוק צ׳אטוצ׳אק` to `שוק צ׳אטו…`.
- **Floating on the canvas beside the card.** The gutter is **8px**. A control meeting the 44px floor there either covers the card or eats the strip where a pan starts; the frame shows it over `2.6 ק״מ` and the way-in block.

The arrows are the shared **`NavArrow`**, not new glyphs: `forward` = the next stop, `back` = the previous, already drawn for RTL and mirrored for LTR by `.nav-arrow`'s own rules, so direction needs no decision here. 30px of visible box with a 44px `::after` target (ADR-0161 §7's shape, as `.map-rename` already does), so meeting ADR-0017's floor costs the card no height.

**The rail costs 50px** — a 39px box plus the 11px wrapped-line gap — of a card whose free canvas above it is ~126px at 360×640, **on the minimum card**. On a loaded one it costs nothing, because there is nothing left to cost and the rail is not drawn at all: see §9, which is a prerequisite rather than a caveat.

**A seat that costs 0px exists and is not chosen outright.** `.map-refs-foot` is already the card's pinned bottom row, already present on every selected place, and its children are already 44px — so arrows inside it add no height, and pushed to the row's outer edges they measure **16.9px** from the nearest verb, clearing the 16px ADR-0157 §2 set for this row. Two things hold it back: it only reduces §9's overrun (83px → 44px) rather than removing it, and the foot holds **`שיבוץ ליום` and the delete** — a stop-to-stop arrow is not a verb about this place, and ADR-0157 §2's spacing rule exists precisely because a mis-press there is destructive. Drawn in §7 with both numbers; the seat is the one open question this ADR hands forward.

### 6. The position indicator is a **dot rail** — because it is the only one that cannot lie.

One dot per stop, the current one filled, and a wider gap where the timed run ends and the tail begins.

A numeric readout was drawn and rejected on evidence. Numbers are dense over **known** moments only (§2 above, ADR-0171 §10b), so on a day holding one floor the airport you return a car to is pin **5** and the **6th** thing you traverse. `6 · 8` beside a badge stamped `5` is the same self-contradiction §3 refuses. A dot claims **order and nothing else**, which is all that can be claimed here truthfully.

The tail's boundary is a **gap**, not a different kind of dot. Two marks were tried and dropped: a hollow ring (reasoned correctly from the `idea` tier's dashed pin — but a 1px ring inside a 5px circle is not a distinction at phone scale) and a hairline tick beside it (invisible for the same reason). The gap is legible at any size and says the right thing anyway: the tail is not a different kind of stop, it is a different part of the sequence.

Owner, on the fork: **dot rail**.

### 7. Wrap is a **nudge**, and its ceiling is the card's own gutter.

At either end the card overshoots by a hair and returns, from `--t-base`. No new copy, no toast: the motion says "there was nothing further that way, so we came round", which is a thing a body does rather than a thing a sentence has to say.

**The amplitude is bounded at 8px and the render is what said so.** The card is `inset-inline: 8px` inside a `.map-split` carrying `overflow: hidden`, so a translate past that gutter is not an overshoot — it is a clipped corner, and what reads as motion is the card losing its radius. The mockup's own first draft shipped 10px and clipped by 2px.

**⁦6px⁩** is the shipped value (measured overhang −2px, safely inside the gutter), and the device pass owns the final number.

Under `prefers-reduced-motion` the nudge is dropped, which is correct here rather than a concession: the dot rail's jump from the last position to the first is the whole signal, and it is a state change rather than an animation.

Owner, on the fork: **nudge at 6px**.

### 8. Only the selection card, and only at the `map` stop.

`.map-placecard` has three occupants (ADR-0122 §7, ADR-0132 §8, ADR-0147 §4): the selected place's row, the make/rename form, and a tapped Google ring. **Traversal belongs to the first only.** A form is about one point you are naming, and an unsaved search result is not a stop on the day — neither has a sequence to be in. Building the swipe on `.map-placecard` rather than on its selection occupant would catch all three.

And it exists only at the `map` snap, because that is the only place the card does. At `half` and `full` the row is in the list and stepping through the day is **scrolling**, which already works — so there is nothing to add there and nothing to keep in step.

## AMENDED 2026-08-10, same day: the peek replaces the rail, and §5–§7 go with it

The owner read §9's numbers and drew the conclusion they invite: _"do we even want the rail if it adds that much pixels. Maybe we should do the wanderlog approach, show just a little of the next card. And lose the circularity, maybe it's not that important."_

**§7 above already drew this and rejected it, on one argument: wrap.** A snap scroller is a line with two ends, and wrapping it means jumping `scrollLeft` while momentum is still running. Wrap was the only blocker. Give it up and the carousel wins outright — so this is not a change of taste, it is the same reasoning with one input changed. Drawn in `map-stop-traversal-v2.html`.

**What it deletes rather than restyles.** §5's rail (50px → **0px**; the affordance is the neighbouring card's edge). §4's entire gesture apparatus — `scroll-snap-type: x mandatory` is the browser's, so no pointer recogniser, no `setPointerCapture`, no slop threshold for a device pass to tune, no `touch-action` puzzle, no `armClickSwallow`. §6's indicator **and its contradiction**: a peek asserts no number, so it cannot disagree with the badge. §7's wrap nudge and its 8px ceiling: no peek on a side **is** the end.

**Why it is cheap, and this is the code's own doing.** A peek slide is the **collapsed** 73px `.place` row, because every heavy block on the card — the way-in list, the summary, the notes, the documents, the foot — is revealed by selection and absent otherwise. Only the centred slide is the tall card. And the selection↔scroll coupling is `lib/useCenterSelected.ts` on the `inline` axis, already built, already carrying the trap this needs (under mandatory snap the selected child needs `scroll-snap-align: center`, or the browser re-snaps a centred offset back to a start boundary). The snap precedent is `.map-facetstrip` in the same stylesheet.

**Two things the render forced, and both are corrections to this amendment's own first draft.**

- **The bound must move from the card to the slide.** `overflow-x: auto` with `overflow-y: visible` is not available: the used value becomes `auto`, so a track scrolls on both axes. Measured, that was **worse than the rail** — the slide came out 422px inside a 315px track, its top **53px above the split**, the identity row **82px behind the controls row**, i.e. exactly §9's second failure mode. `align-self: stretch` on the selected slide is what binds it (a percentage `max-height` computes to `none` against an indefinite-height parent), which is the pair `map.css` already writes one element out. **So this design does not remove §9's prerequisite — it needs it.**
- **The 0px arrow seat is not 0px.** `.map-refs-foot` is `flex-wrap: wrap` with a 16px gap and two 44px verbs; at the card's full width two arrows fit on one line, but the **slide is narrower than the card by the peek**, and the foot breaks to two lines: **44px → 82px, i.e. 38px** against the rail's 50px. Not cheaper in any way that justifies putting a navigation control in the row that holds delete.

**Revised decision.** §5 and §6 are superseded: there is no rail and no indicator. **Wrap is dropped** — owner, once the trade was spelled out: _"no — the ends are ends."_ This reverses one of the ADR's own Context bullets ("navigation wraps"), which was decided before the mechanism was, and it is the input that made this whole amendment possible: a snap scroller is physically a line with two ends, and wrapping means teleporting `scrollLeft` under live momentum. With it gone, **the absent peek on one side is what says you are at the end** — no animation to time, nothing for `prefers-reduced-motion` to drop, and no amplitude to bound against the card's gutter. §1–§3 (the sequence) and §8 (selection card only, `map` stop only) stand unchanged. §4's arbitration is deleted, not replaced.

**The arrows are dropped.** The original scope was swipe **and** explicit arrows; the peek carries the swipe and carries no arrows, the only seat that looked free costs 38px, and it sits beside the delete. Owner: _"no arrows, only peek."_ So this amendment revises the scope of the ADR's own Context paragraph, and the proposal's whole surface is now a track and a slide — there is no `.map-stopnav`, no `NavArrow` on this card, and nothing added to `.map-refs-foot`.

**Every slide renders at the same density, and `expanded` splits from `selected`.** Owner, on the first draft: _"I want them all to be expanded the same way (as if you clicked on the place pin), that makes it look more balanced."_ Correct, and it also fixes something that draft asserted: with collapsed neighbours the peek showed the edge of a **64px** row floating at the bottom of a **209px** card — a short sliver, not a card edge. Equal density measured: neighbour 209px against the selected slide's 209px.

That needs one real change in the code. Today `expanded` and `selected` are the same fact — `Map.tsx` passes the notes, the references and the summary only for the selected row, and `.map-rename` is revealed by `.place.selected` in CSS. A track is the first surface that wants **one density across all slides with exactly one selection**, so they become two props. What is deliberately _not_ done is making them all look selected: the border and the ring stay on one, because otherwise the peek stops saying which card you are on — the imbalance would be traded for an ambiguity.

**And it costs the amendment its own cheapness argument, which is worth stating plainly.** "The peek is cheap because neighbours are collapsed rows" is no longer true: three **full** cards are mounted at once. Three, not N — a peek can only ever show one neighbour either side, so that is what the window holds. The cost is mounting on a screen that re-renders every second (`frontend/CLAUDE.md`'s memoisation note), not pixels: the proposal still adds **0px** of pinned height.

### 10. Swiping is a selection, so the pin and the camera follow — and the mechanism already exists

Confirmed with the owner: stepping to another slide **changes which pin is selected and moves the map to it**. Nothing new is needed for either half.

- **The pin.** `MapPin.selected` reads `screens/Map.tsx`'s `selectedId`, so the highlight moves the moment the selection does. The swipe sets the selection; it does not touch pins.
- **The camera.** `MapPane`'s focus effect is keyed on `[selectedId, cardReserve, canvasH]` and calls `keepCentred` — and `selectedId` alone re-runs it. This matters because with every slide at one density (§ the density amendment) `cardReserve` no longer changes between stops, so a pan keyed on the card's height would silently never fire. **The selection is the key, not the card.**

Three specifics that are decisions rather than details:

- **It commits on snap-settle, never during the scroll.** `google.maps.Map` is a live, billed object and the screen re-renders every second; driving the camera on every scroll frame would thrash it. The selection changes when the track settles on a slide.
- **The swipe calls `select(placeId)` bare** — no `fromRow`, no `land`. Those options normalise the sheet to `half` and scroll the list row into view, and raising the sheet would take away the map you are swiping on, which is ADR-0122 §7's own rule. So the swipe copies the **pin tap**, which already calls `select(placeId)` with nothing, and not the row tap.
- **It pans and does not zoom.** `keepCentred` pans _and_ zooms in when the view is too far out to read the place (ADR-0127 §1) — a default written for a selection arriving from a row whose pin you cannot see. A sequence is a different surface: re-zooming at each of eight stops reads as busy and takes away the sense of the area you are moving through. **Owner: pan only.** ADR-0148's amendment is explicit that the fix for a wrong-for-this-surface default belongs _inside_ the component, as intent in the value, rather than as an override at the new caller — or the next caller inherits the same wrong default.

### 11. In **all-days** there is no traversal, because there is no sequence

Raised by the owner (_"this should be disabled when the all-days button is toggled on"_), and it resolves harder than "disabled": with the `כל הימים` scope chip on, the sequence is **empty by construction**, not suppressed by a rule this ADR adds.

`buildPinOrderIndex` opens with `if (!onDate) return new Map()`, and its own comment says why: _"No day, no sequence to be an index in — and renumbering per day is worse than nothing: two pins both reading `1` on one canvas, with nothing on either saying which day it belongs to."_ ADR-0121 §6 settled the same point from the other side: _"all-days has nothing for it to be an index of: the comparator would sequence the whole trip and a pin would read `27`."_ So `buildDayStopSequence` (§1) returns `[]` there and there is nothing to step through. An all-days row states its day in words instead, which is what already fills that gap.

**What that means for the surface, and it is not "grey out a control".** There is no control to grey out — the affordance _is_ the peek, so the peek simply has no neighbours to show. The card renders as it does today: **one full-width card, no track.** Concretely the track is **conditional on a day scope**, not always-on with a single slide: a lone slide inside `data-track` would size itself to `calc(100% - 2 × peek - 2 × gap)` and sit narrower than the card with empty gutters either side — a worse all-days card than the one that ships now.

Which is the tab's own derived-affordance rule, already running for `קרוב עכשיו`, `אולי`, `מה נשאר` and `באזור` at zero: **a control appears only where it has something to do.** Here it is not even a control, it is a layout that exists only when the day gives it members.

## Consequences

- One new exported derivation, `buildDayStopSequence`, with `buildPinOrderIndex` as its first consumer — so the numbering and the traversal cannot drift. `orderedStops` and `mapsDayRouteUrl` should move onto it too; that is cleanup the extraction makes available, not a precondition.
- It is pure and clock-free, so it is testable with no Google in the process — the posture ADR-0121 §13 sets for everything on this tab that decides what a pin looks like. Both day scopes must be asserted (`frontend/CLAUDE.md`: an ordering bug that only showed in all-days survived three sessions), and here all-days is the **no sequence at all** case: §6 numbers nothing without a day, so traversal is absent rather than trip-wide.
- The proposed CSS is one rail and two buttons. Anything more would have meant a primitive went unused.
- `map.css` gains a fourth copy of the full-width-line declarations. Named as a rule-8 cleanup with no owner yet, deliberately not taken here.
- **A real-device pass is owed and this ADR is not complete without it.** The report was a mobile-ergonomics report, and the two questions that decide whether the feature is any good — does the swipe fight the map's own pan, and does wrap read as coming round or as a glitch — cannot be answered from a desktop render. The slop (⁦36px⁩) and the nudge (⁦6px⁩) ship as that pass's inputs. Precedents: ADR-0126, ADR-0171.
- Broader grouping than the consecutive-same-Place minimum stays open, by the owner's own scoping. This ADR assumes nothing about it, and §1's extraction is the seam a later rule would change behind.

### 9. Prerequisite: the loaded card clips its own content, in both directions

The owner asked the question that found this: _"there could be cards with enrichment data or multiple bookings of events so they could be much higher, did you take that into account?"_ §2–§8 above were all reasoned on the **minimum** card — one reference, no enrichment, no notes. The loaded card breaks two ways, **neither caused by this feature**, and one of them makes this feature invisible.

**The bounded card clips its pinned rows.** With notes or a hero present, `map.css` caps the card (`100%` minus the controls row, the sheet, Google's attribution and the gaps) and `.place` becomes a grid in which only `.note-sec-list` scrolls. At 360×640 with three references plus enrichment, the **pinned rows alone** overrun that cap by **83px**. Measured on the frame, intersected with the card's clip box:

|                                              |                            |
| -------------------------------------------- | -------------------------- |
| `.note-sec-list` (the one scrolling track)   | **0px**                    |
| `.map-refs-foot` — `שיבוץ ליום`, `עוד בגוגל` | **10 of 44px**             |
| the traversal rail                           | **39px tall, 0px visible** |

ADR-0148 §1 promised _"the shortfall becomes a SCROLL instead of a clip"_. It holds only while the shortfall is in the note list. **Nothing bounds the pinned rows**, so past a certain load the card silently drops them from the bottom — and the selected row's primary actions are the first to go.

**The unbounded card clips the other end.** The `max-height` fires only on `:has(> .map-draft)`, `:has(.note-sec)` and `:has(.map-hero)`. A place with several bookings and **no** notes and **no** enrichment is bounded by nothing: it is anchored to the split's bottom and grows **up**, past the floating controls row — which paints after it in the JSX and therefore over it. **~15px of the identity row ends up behind the chips.** ADR-0148 §1's own words for that shape: _"what survived was the actions row and what died was the title, which is the worst way round."_

**Consequence for this ADR.** §5's rail is a pinned row on a card that already cannot fit its pinned rows, so the build order is fixed: **the card's bound is fixed first, then the rail is added.** Shipping in the other order puts a navigation control on a card where it is not drawn at all. Both gaps are filed as their own backlog lines; neither is this feature's to design.

**And a lesson for this file's own method.** Six of its seven sections measured heights, and a height is the wrong instrument for a clip: `.place` carries `overflow: hidden` on the bounded variants, so every rect reads healthy while content is gone. `frontend/CLAUDE.md` names it — _"Reading a rect and calling it visibility"_ — and lists two evenings where it bit this exact card. §7 now intersects each section's rect with the card's clipping box and draws the cut line on the frame.

### Found on the way, and not part of this

Rendering the mockup caught a shipped defect with nothing to do with traversal. `screens/map.css:88` opens a selector list and puts a 17-line comment **inside** it, so the list parses as `.map-controls > .map-search-btn, .map-controls > .map-controls > .map-querystrip`. The second matches nothing. The first — which the rule was never about; the comment above it says search _"sits at the row's fixed end"_ — collects `flex: 1 1 auto; min-width: 0`, outranks the button's own `flex: 0 0 auto; width: 34px` on specificity, and stretches a 34px square to **178px**. The query strip escapes only because the whole block is **duplicated** at line 216 and that copy is well-formed, which is also the fingerprint of how it happened. One-line fix, filed as its own backlog line, with a control in the mockup showing the break against the repair.
