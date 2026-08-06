# 0128 — The dot tier, and the place card's camera reserve

**Status:** Accepted — authored and built 2026-07-28 (session 152), **§1 amended the same day (session 154)** after the owner questioned who the tier should apply to. Closes Phase 3. The rendered canvas has still not been seen (ADR-0121 §13) and nothing below claims otherwise.
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

**Ratios, not sizes.** `MAP_PIN.DOT_SCALE` (0.4) is a fraction of the pin, exactly as `GHOST_SCALE` is (renamed `ASIDE_SCALE` by [ADR-0130](0130-a-maybe-is-not-a-past-place.md) §3), so the rung stays a rung as the canvas grows the others — and a ghost at dot zoom compounds both, staying subordinate within the smaller ladder.

> **Amended twice on 2026-07-28 — the tier applies to what you are NOT looking at, and the number never goes.**
>
> As first built the degradation was blanket: every pin became a dot and the amber tags dropped. Two rounds of owner feedback, both from using it:
>
> **Session 154 — the time anchors are exempt.** The rule worth naming is **demote what claims precision, keep what claims priority.** The glyph, the order number and the tip answer _which one_ and _where exactly_ — claims a 30km view cannot support. Hue answers _what kind_; the amber cue answers _what matters right now_. Neither is invalidated by zoom, so `nowStop` / `nextStop` are not degraded at all. It costs nothing in density terms (there is exactly one of each) and it makes the degradation a **promotion by contrast**: a wide view becomes dots plus one or two real teardrops, the most direct answer to "where am I / where next".
>
> **Session 155 — the tier is scoped to all-days, and day scope keeps its pins.** The owner's case: _you open the app in the morning and look at the map to see what today holds and in what order._ Numberless dots make that unanswerable without zooming in and hunting. §6 itself made the number the order cue — "the number is free" — so the tier was trading away the canvas's one contribution over the list, in the view where that contribution is the point. **A travel day is the sharpest form:** Tokyo→Kyoto fits well below the threshold, so the day whose order you most need is the day that lost it.
>
> **So there are TWO rules, because there are two situations.** One selector covering both was tried twice and kept leaving something behind — first the time anchors, then, when keyed on the number, today's **ambient stay night** and today's **ideas**, which carry no number _by design_ (ADR-0109's amendment: "what marks a night as ambient is that it has no number and no clock") and are exactly the collateral damage of a clever rule.
>
> - **Day scope — only GHOSTS degrade.** A ghost is by definition not this day (§6), the one population that is not what you are looking at. A day holds three to six stops, so there is no density problem here worth paying for.
> - **All-days — everything degrades except the time anchors.** Nothing is numbered without a scoped day (`buildPinOrderIndex` returns an empty map), so there is no order to lose, and this is the multi-city density §6 invented the tier for.
>
> Both key on `data-scope`, which the pane already sits inside, so the tier still costs no prop and no marker re-render. **`MAP_PIN.DOT_SCALE` is unchanged; what changed is who it reaches.**
>
> **Extended 2026-07-28 ([ADR-0130](0130-a-maybe-is-not-a-past-place.md) §3): "only ghosts" in day scope becomes "only the ASIDE pins",** because the ghost tier split in two and the dayless shelf maybe is on the same rung. That is what the day-scope rule was always reaching for — _what you are not looking at_ — and it is now the population with the numbers behind it: a trip carries tens of general maybes against a handful earmarked for today, so at wide zoom the tens degrade and the handful stay full pins. One selector, not two, because the shared ratio has its own class.
>
> **Two consequences to state rather than discover.** In **Plan mode** the default scope is all-days, so its default wide view is dots — legible the moment a day is picked, which is what Plan's day strip is for, and there are no numbers in all-days to lose either way. And a dot is roughly 14–22px, which is **under ADR-0017's 44×44 touch floor** for a tappable pin; that is open, recorded on the backlog, and belongs with the device pass rather than being guessed at here.

### 2. The card's camera reserve is best-effort, and the top inset is not

Two things had to be answered, and only one of them was the one ADR-0122 §7 was worried about.

**The prop question, settled:** the reserve is passed as a boolean (`cardOpen`), and the height lives in `constants.ts` with the rest of the card's geometry. It changes on a tap, and that is allowed for the reason ADR-0126's build log established — §9's subject is re-instantiating the map. But it needs one thing ADR-0126's boolean did not: **the camera reads it through a ref, never as a dependency.** `apply` keeps its `[map]` identity, so the framing effect does not re-run when a card opens, so **a pin tap still moves nothing** — which is ADR-0122 §7's own rule and the thing that would have broken silently if the reserve had been threaded in the obvious way.

**And the finding that changed the shape: the card's full band does not fit.** `fitPaddingFor` drops any padding claiming half an axis, and measured against the real numbers, `top + bottom + the card` exceeds that on **every phone at every stop** — 390×517 wants 330 of an affordable 258. So an unclamped reserve would not have carried the card; it would have thrown away the **top** inset too, trading "a pin can hide under the card" for "a pin can hide under the controls row". That is a worse bug and a silent one, and it is the honest limit ADR-0122 §1 named finally biting.

**So the reserve is clamped to what the axis has left after the top inset.** It degrades instead of switching off: a taller canvas carries more of the card, a short one carries a little, and it can never cost the top. Strictly better than the 0 that shipped, and it is stated as best-effort rather than promised — the card can still cover a fitted pin on a short canvas, and that is now a bounded case rather than an unbounded one.

**One simplification worth recording:** the card only exists at the `map` stop (ADR-0122 §7 — it renders exactly where the sheet cannot show the row), so the reserve is only ever asked for on the tallest canvas the tab has. That is the stop where it is most affordable, which is why clamping leaves something useful rather than nothing.

### 3. Amendment (2026-08-06) — the PAN reads the reserve too, and it was the pan that needed it most

> _"Selecting a place on the map (or search) opens the place card with the info (or the various add
> forms) and sometimes the card covers the place and the pin. I'd like for the existing pan to be
> smarter and pan to where the card/form doesn't cover the place and pin."_ — owner, 2026-08-06

**§2 gave the reserve to the FIT's padding and stopped there**, so the pan — which is what a pin
tap, a row tap, an arrival and a locate all do (ADR-0129 §1) — kept centring the place in the whole
canvas as though nothing were over it. And the omission is worst exactly where §2's own clamp was
most careful: the fit at least degrades, where the pan did not know there was anything to degrade
against.

**Measured, the form is the case that fails outright.** ADR-0148 §C put it at **243px of a 372px
canvas** at the `map` stop, so a centred point sits 57px **inside** it — the place you long-pressed,
under the form you opened by long-pressing it. The place card is more forgiving at ~180px, and the
enriched result card (hero, credit, summary) is not.

**The rule: the pan centres the place in the part of the canvas you can SEE.** The band runs from
the controls row's inset down to `H − reserve`, and its centre is `(reserve − top) / 2` above the
canvas's own — so the camera's centre goes that far **south** of the place. `panShiftForReserve` is
that one line, pure and tested; the shift is applied through Google's own projection
(`worldPointAtOffset`, ADR-0129 §3's rule that every nonlinear step stays inside Google's maths)
**at the target zoom**, because a pixel is a different distance at every zoom and `locate` moves the
two together.

**The first build of this used only the BOTTOM inset, and that breaks in exactly the case the whole
thing is for.** The argument for ignoring the top was that a pan CENTRES, so the place cannot end up
near the top edge — true only while the band is big. It is not: the form leaves a 129px band whose
centre is y≈64, inside the ~88px the controls row and a pin's own upward reach take. **Correcting for
one occupant by moving the place under the other is not a fix**, and it would have been invisible in
the common case and wrong in the reported one. `topInsetPx` is `mapFitPadding`'s own `top`, passed in
rather than re-derived, so the pan and the fit cannot disagree about where the row ends.

Two things it deliberately does not do:

- **It never pushes the place DOWN.** A small card on a tall canvas leaves a band whose centre sits
  below the canvas's, and the raw arithmetic answers "move the place toward the card" — for a place
  already clear of everything. Clamped at 0: nothing owed, nothing moved, which is the re-fit
  guard's own rule one level down.
- **It does nothing at all with no card up.** The shift is 0, the projection round trip is skipped,
  and a pin tap with nothing raised behaves exactly as it always did.

**And one ordering fact had to change, or the whole thing would have been silently dead on the
gesture it exists for.** The reserve is measured in `Map.tsx` and the pan runs in `MapPane`'s own
effect — and passive effects run in tree order, **child first**. So the pan fired while the
measurement still described whatever card was up _before_ this tap: usually none, i.e. a reserve of 0. The measurement is a `useLayoutEffect` now, because layout effects all run before any passive
effect, so the reserve is committed by the time the child pans. That is what `useLayoutEffect` is
for — a measurement another effect reads — and it costs nothing new: one `getBoundingClientRect` on
one element, in an effect that already ran on every render.

**§2's "read it through a ref, never as a dependency" is unchanged and now load-bearing twice.** The
pan reads the reserve at the moment it runs, so `apply` and the framing effect keep their `[map]`
identity and **a pin tap still moves nothing it was not asked to move** — ADR-0122 §7's rule, which
threading the reserve in the obvious way would have broken here exactly as it would have there.

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
