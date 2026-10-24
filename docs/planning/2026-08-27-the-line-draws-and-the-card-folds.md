# The line draws, and the card folds (2026-08-27)

**Branch:** `claude/map-polyline-rendering-ux-su4lqo`.
**Decisions:** amended in place into [ADR-0206 §AC7/§AC8](../decisions/0206-a-travel-time-belongs-between-two-points.md) (the two rendering bugs, and framing the leg) and [ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md)'s 2026-08-27 amendment (the card folds).
**Source:** three owner reports off the shipped full-map canvas, with screenshots.
**No mockup.** Argued below rather than skipped.

## The three reports, and the fact that two of them were one mistake

1. _"Sometimes the lines simply don't appear … you click on a stop, the route to it should become amber, instead it sometimes doesn't render at all."_
2. _"When zoomed out the lines render at edges I guess and it could look totally different … when zoomed out it simply erases the last turn"_ — then, with a third screenshot, _"sometimes symptom (2) looks really bad, it's nowhere near the actual pin."_
3. _"Clicking on a stop highlights the route to it, but the place details pops up and hides most of the path … sometimes you want to get the details but sometimes you only want to see the path."_

(1) and (2) are both **a screen-space idea allowed to decide something it does not get to decide**, which is the sentence worth keeping:

- **(1) was the readiness gate.** `DayConnector` drew when `map.isStyleLoaded()` said so and otherwise deferred to `map.once('load')`. `isStyleLoaded()` is false while **any tile is in flight** — the state tapping a stop creates, because the tap moves the camera — and `load` fires **once per map instance** and had long since fired. So every draw asked for during a camera move was deferred for ever, on layers this effect's own teardown had already removed. Adding a layer needs the style **spec**, not loaded tiles.
- **(2) was the collar.** §AC3's ⁦9px⁩ setback spent its pixels by **popping vertices**. At street zoom that is a setback; at trip zoom ⁦9px⁩ is hundreds of metres of road, so it ate the last turn — and on a leg shorter than two collars it returned fewer than two points and ate the leg.

**The third screenshot is the same collar with `builtAt` recorded in the wrong place**, and it is the one worth reading before touching this file again: the zoom the geometry was built at was written _beside_ the draw call rather than inside it, so a draw the style refused was remembered as one that happened. That leaves the collar measured at a camera the map has left — and the redraw threshold is measured **off that same stale number**, so nothing corrects it. A ⁦9px⁩ collar baked three zoom levels out is a ~⁦120px⁩ gap between a route and its pin, which is exactly what the screenshot shows.

## What the collar's new rule is, and why it is a rule rather than a number

**The collar may shorten a straight; it may never delete a turn.** The trim now moves only the final segment's own endpoint and stops at the vertex behind it, so the point count out is the point count in. `COLLAR_MAX_SEGMENT` (a half) keeps a very short leg from collapsing to a dot.

The reason to state it as a rule: the collar is **cosmetic** and the path is a **claim**. Any future tuning of the number is free; trading the claim for the cosmetic is not. Two smaller things fall out of the same reading and are in §AC7 — `tolerance: 0` on the sources (MapLibre's default straightens more the further out the camera is) and `beforeId` on the incremental layer add.

## Report (3): the card was where you noticed it and not what caused it

The tempting fix is a smaller card. **The camera was framing the wrong object.** A pin tap centred the selected stop in the band above the card (`bottomReserve`, ADR-0128 §2) — so the camera has always known the card is there, and never knew that §AC2 makes the amber leg the leg **arriving at** that stop. Centre one end of a line and the other half goes under whatever is at the bottom of the screen.

That split the report into two halves, and both shipped because each covers what the other cannot:

- **`framePath` frames the leg** (§AC8), through the ordinary fit path so it inherits the inset, the reserve, the cap and the ease. This is where the report goes away for a stop that has a leg, with no gesture to learn.
- **The card folds** (ADR-0122's amendment). This is the only half that serves the report's second sentence — a shelf idea or a maybe has **no leg**; there is nothing to frame and only a card in the way.

Two details worth carrying forward:

- **The folded card is the row every list already draws.** `renderRow` passes `revealed: !collapsed`, so folding reuses the density axis ADR-0182 already added rather than building a one-line bar beside it. A folded card keeps the ring, the amber leg and the selection; only the content goes, and the Hebrew says `כיווץ`/`פתיחה`, never `הסתרה`.
- **`keepCentred` had to move with it.** ADR-0122 §7's 2026-08-06 amendment re-centres a selection when the band changes underneath it — which is now also what a **fold** does. Left reading the stop, it would have undone the leg framing one commit after the fold made room for it. It takes the leg's extent-centre, which is what the fit centred.

## Sticky for the session, and why that needed no mechanism

The one question the owner was asked: does the next stop you tap open folded or full? **Folded.** The argument that holds it up is the contrast with `expandedId` three lines above it in the same component: the research expansion is a state of a **place** (so carrying it to a new selection would leave a card open on something you are no longer looking at), and folding is a state of the **reader**. So a plain screen-level boolean — and the Map screen unmounts with the tab, so `useState` **is** the session. Nothing clears it, nothing persists it, and the reset is free.

## No mockup, stated rather than skipped

The backlog line written at the start of this session said this wanted a mockup. It did not, and the reason is specific rather than a shortcut: a mockup exists to settle a contested design before it is built, and the design was settled **with the owner, in the thread**, including the one question a mockup would have been drawn to answer (sticky or not). What remains genuinely unanswerable on this machine is a **device** pass, not a drawing one — whether a 16px caret is findable by a thumb, whether the whole track folding reads as one choice, and whether `DOT_BELOW` is the right floor for framing a leg. Those are on the backlog, and the ADR names the fallback (a swipe-down) it deliberately did not build.
