# 0128 — The dot tier, and the place card's camera reserve

**Status:** Accepted — authored and built 2026-07-28 (session 152). Closes Phase 3. The rendered canvas has still not been seen (ADR-0121 §13) and nothing below claims otherwise.
**Date:** 2026-07-28
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§6** — the `dot` tier it decided and never built is built here (§1) — and [0122](0122-map-split-controls-over-the-canvas.md) **§7**, whose bottom camera inset was deferred with the phase and lands here **in a different shape than §7 specified** (§2).
Relates [0123](0123-map-pin-size-is-a-share-of-the-canvas.md) (why this tier is keyed on zoom and the pin's _size_ is not), [0127](0127-map-camera-answers-the-tap.md) (the rest of Phase 3), [0122](0122-map-split-controls-over-the-canvas.md) §9 and [0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md)'s build log (where the no-prop-on-a-tap line actually sits).

## Context

Two items were all that stood between Phase 3 and done, and both had been decided on paper and left unbuilt for a specific, stated reason.

- **ADR-0121 §6's `dot` tier**: "below a legibility threshold a pin degrades to a dot — hue kept, number and glyph dropped, since a 9px numeral is noise." §7's table already cites it as the answer for a multi-city all-days fit, and §6 names it as the honest answer to "a pin does not shrink when you zoom out, so at country zoom it covers a city" — the trigger it set for revisiting clustering. ADR-0123 deliberately did not build it: pin **size** is a share of the canvas, and the dot is keyed on **zoom**, which is a different axis.
- **ADR-0122 §7's bottom camera inset**: while the place card is on the canvas, a fit does not reserve the band it occupies, so a chip tapped with a card open can put a pin under it. Deferred because carrying it "needs a `MapPane` prop that changes on a tap, which ADR-0122 §9 forbids".

The third thing the old Phase 3 line carried — `MAP_PIN`'s dials — turned out **not** to be open: session 143 recalibrated them against a real phone, using a measured ratio between two screenshots of the same device. What is left there is a _case_ to look at (a dense day in all-days scope), not a number to pick, and it belongs to the device pass. The backlog line had carried a stale claim forward.

## Decision

### 1. The dot tier is keyed on zoom, and CSS does all of it

**Below `MAP_ZOOM.DOT_BELOW` (11), every pin becomes a dot**: hue kept, glyph and order number dropped, the teardrop's rotation and its tip dropped with them. The tip is a claim about _which building_, and at a 30km-wide view it cannot honestly make one, so it goes rather than shrinking.

**Zoom, not canvas, and the distinction is load-bearing.** ADR-0123 made a pin's size a share of the canvas the sheet's stop leaves, and stated that pin size must not change under a pinch. A pin's **tier** legitimately can — that is exactly what §6 described — so the two live on different axes and neither has to know about the other.

**It is a data attribute on the pane, written imperatively, and that is the design rather than an implementation shortcut.** `.map-pane[data-pins='dot']` and CSS does the whole degradation, so **no marker re-renders for it**. The markers are content inside a live `google.maps.Map`, where a needless re-diff is the cheap failure and a re-instantiation is a billed one (ADR-0121 §4) — the same reasoning that made the pin's size a `clamp()` the browser resolves rather than a prop. There is no new `MapPane` prop at all: the pane already has the map instance, so it reads the zoom itself.

**Keyed on `zoom_changed`, not `idle`**, so the tier flips _during_ a pinch, which is the only time it is answering anything. A dataset write per zoom event costs nothing.

**Ratios, not sizes.** `MAP_PIN.DOT_SCALE` (0.4) is a fraction of the pin, exactly as `GHOST_SCALE` is, so the rung stays a rung as the canvas grows the others — and a ghost at dot zoom compounds both, staying subordinate within the smaller ladder. The amber `עכשיו` / `התחנה הבאה` **tags** drop (they are text), but the amber **ring and pulse** stay: that cue is prominence, not text, and keeping it is what the tier is for.

**Clustering still is not adopted**, and this is why the trigger §6 named has not fired: what made all-days unreadable was a full teardrop per place at country zoom, and a dot spans no categories (so it keeps its hue), carries no glyph or number to lose meaning, and is the same object — so nothing leaves the pin grammar, which is the exact objection §6 raised against a cluster bubble.

### 2. The card's camera reserve is best-effort, and the top inset is not

Two things had to be answered, and only one of them was the one ADR-0122 §7 was worried about.

**The prop question, settled:** the reserve is passed as a boolean (`cardOpen`), and the height lives in `constants.ts` with the rest of the card's geometry. It changes on a tap, and that is allowed for the reason ADR-0126's build log established — §9's subject is re-instantiating the map. But it needs one thing ADR-0126's boolean did not: **the camera reads it through a ref, never as a dependency.** `apply` keeps its `[map]` identity, so the framing effect does not re-run when a card opens, so **a pin tap still moves nothing** — which is ADR-0122 §7's own rule and the thing that would have broken silently if the reserve had been threaded in the obvious way.

**And the finding that changed the shape: the card's full band does not fit.** `fitPaddingFor` drops any padding claiming half an axis, and measured against the real numbers, `top + bottom + the card` exceeds that on **every phone at every stop** — 390×517 wants 330 of an affordable 258. So an unclamped reserve would not have carried the card; it would have thrown away the **top** inset too, trading "a pin can hide under the card" for "a pin can hide under the controls row". That is a worse bug and a silent one, and it is the honest limit ADR-0122 §1 named finally biting.

**So the reserve is clamped to what the axis has left after the top inset.** It degrades instead of switching off: a taller canvas carries more of the card, a short one carries a little, and it can never cost the top. Strictly better than the 0 that shipped, and it is stated as best-effort rather than promised — the card can still cover a fitted pin on a short canvas, and that is now a bounded case rather than an unbounded one.

**One simplification worth recording:** the card only exists at the `map` stop (ADR-0122 §7 — it renders exactly where the sheet cannot show the row), so the reserve is only ever asked for on the tallest canvas the tab has. That is the stop where it is most affordable, which is why clamping leaves something useful rather than nothing.

## Alternatives considered

- **Build the dot tier as a pin prop or React state.** Rejected: it would re-render every marker on a threshold crossing for a purely visual degradation, on a surface where ADR-0121 §4 makes marker churn the thing to avoid. CSS off one attribute costs zero renders.
- **Key the dot tier on the canvas** (like the pin's size). Rejected: it is a _legibility-at-this-zoom_ question, and ADR-0123 already established that size must not change under a pinch. Keying both on the canvas would have made a pinch resize the pins.
- **Shrink the teardrop instead of replacing it with a dot.** Rejected: a small teardrop still points at a building it cannot resolve. Dropping the tip is the honest form.
- **Adopt clustering now** that §6's trigger is in sight. Rejected: the dot answers the density problem _inside_ the pin grammar, where a cluster bubble cannot (no hue, no tier, no number — §6's own argument).
- **Reserve the card's full height and accept that `fitPaddingFor` drops it.** Rejected in §2: dropping the padding costs the top inset, which is the one thing keeping pins out from under the controls row.
- **Raise `MAX_PADDING_SHARE` so the full reserve fits.** Rejected: that guard exists for a diagnosed failure (padding larger than the viewport resolves to a wild zoom-out), and loosening it globally to serve one transient card is trading a permanent protection for a narrow case.
- **Measure the card's real height** instead of naming a constant. Rejected: this screen re-renders every second and `--sheet-h` must never depend on a layout read (ADR-0121 §5). It is stated, sized for a two-reference row, and handed to the device pass.

## Consequences

- **Phase 3 is closed.** With ADR-0127, all four of its camera reports and both of its deferred hand-offs are built.
- **Touched:** `constants.ts` (`MAP_ZOOM.DOT_BELOW`, `MAP_PIN.DOT_SCALE`, `MAP_CARD_BODY_H`/`MAP_CARD_RESERVE_H`), `lib/map-camera.ts` (`mapFitPadding`'s clamped reserve), `lib/useMapCamera.ts` (the reserve ref), `ui/domain/MapPane.tsx` (`PinDensity`, `cardOpen`), `ui/domain/map-pane.css`, `screens/Map.tsx` (one boolean, one CSS var).
- **The clamp is a pure function and is tested as one**, including the property that matters: the top inset is byte-for-byte unchanged whatever the reserve asks for.
- **The `MapPane` test stub's `useMap` is now settable**, defaulting to `null` as before. The fake is deliberately inert for the camera (no bounds, a 0×0 div, no-op movers) so that making the map available for the zoom test cannot start the other tests framing.
- **Two device-pass numbers are added and one claim is corrected.** `DOT_BELOW` and `MAP_CARD_BODY_H` join the cluster; `MAP_PIN`'s dials leave the "open" list, because session 143 already calibrated them on a phone and what remains there is a case to view, not a number to pick.
