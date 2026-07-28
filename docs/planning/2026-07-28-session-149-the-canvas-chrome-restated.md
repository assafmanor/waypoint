# Session 149 — the canvas's own chrome, restated (Phase 8, design)

**Date:** 2026-07-28
**Kind:** design session. Paper only — a mockup, an ADR, this note. No feature code.
**Output:** [ADR-0126](../decisions/0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md), [`mockups/map-chrome-v1.html`](../../mockups/map-chrome-v1.html), its entry in [`design/mockups.md`](../design/mockups.md), backlog updated (Phase 8 points at both and stays open for its build; Phase 3's dependency is marked satisfied).

## What was already decided coming in

Three things, by the owner, and none of them re-opened here: **#19 is two controls** (locate becomes locate-only; "frame the filtered set" becomes its own control); **#23's area is a SORT, not a filter** (a tap raises the sheet and orders the in-view places first, hiding nothing); and **the viewport-scoped list is rejected** on the reasoning ADR-0126's alternatives now carry verbatim, so ADR-0106 §4 stands unamended.

What was delegated: placement, the mechanics of a readout that is also a control, and the ghost-count prerequisite.

## What the mockup changed, and it changed twice

Both are the same lesson the epic keeps re-learning: **ask what is on screen, not what the props say.**

1. **The vertical stack — the placement every desktop map uses — does not fit.** It was the working assumption for most of the session and reads as obviously right from the code. Rendered against the real tree at 360×640 `half`, the pane is 160px, the controls row floats over 46 of them and Google's attribution takes 22: a 44+8+44 column leaves **−3px**. It does not crowd the canvas, it **overlaps the attribution**, which the ToS forbids. The same band laid out horizontally costs 164px of an inline axis with 172 spare. So the generalisable finding is not "put them side by side" but **the scarce axis on this surface is height, so canvas furniture grows sideways** — which is ADR-0122's own conclusion applied to furniture rather than to layout. The rejected column is left drawn in the file under a toggle.

2. **The 44px floor is already broken by what shipped, twice.** #23 flagged the readout at ~24px. Measuring the band caught `.map-recenter` at **38×38** as well. Making the floor real also forced a small repaint: `min-height: 44px` on the live region plus its own hairline is 46px outer, and the box that must clear the floor is the tappable one — so the pill moves off the region and onto its child.

Two defects in the file itself, both worth recording because the second is a mockup-authoring trap:

- **The shipped `:has(> .map-geoprompt)` rule hid both controls in every state.** Phase 2 is _built_, so that rule now arrives through the `APP-CSS:` manifest as app css — and this file keeps the pre-prompt mounted and toggles `[hidden]`, which the selector still matches. `map-split-v2.html` hit the same thing and could solve it inside its own delta; here it has to be **undone** by a mockup-only override. Any future mockup of a built surface inherits this: `[hidden]` is not absence, and a shipped `:has()` cannot tell the difference.
- **The first fixture made the sort a no-op.** All four pinned places were also the first four rows in schedule order, so "in-view first" produced the order it started in and the file proved nothing. Fixed by moving the hotel's pin out of the viewport and the station's into it, so the sort visibly lifts the station from last to fourth.

## The three answers

**Placement.** One horizontal band under the controls row: the camera pair at the inline start, the readout at the inline end. Both camera controls are children of `.map-pane`, which buys three things without designing them — they vanish with the pane at `full`, ADR-0122 §6's one-floating-object rule extends by one selector rather than a new mechanism, and no new host floats. **Locate keeps the corner it shipped in**: the control whose behaviour changes is the one that does not move.

**`באזור`.** The live region **wraps** the control instead of becoming it — `StatusBanner`'s own shape, already in this repo. `role`/`aria-live` stay exactly where they shipped; a `<button>` sits inside. The count text then exists once in the DOM, so the region announces the button's own words rather than a copy. The action is the button's `title` (a description); the visible text stays the accessible **name**, because a name that rewrites itself on every camera idle is its own churn and a voice-control user has to be able to say what they see. Zero renders no button.

**The ghost count.** The count stays spatial and the **list** says what it could not bring, in session 144's grammar (how many are outside this day, plus `הצגת כל מקומות הטיול`). Coupling the count to the list was the other precedented answer and it is worse: you would see seven pins and read `4 באזור` — the two-halves-disagreeing defect pointing the other way, with the two halves two centimetres apart. What changes is the button's **promise**, not the number. And the offered way out genuinely resolves it: with all-days on there are no ghosts, the two agree exactly, and the banner removes itself.

## One rule that fell out, covering three cases

**A canvas control whose answer lives in the list normalises the sheet to `half`.** A row tap already does it. The area sort does it, because its order is invisible at the `map` stop. And a **refused locate** does it — which is what lets #19's refusal case need no new card and no second copy of the refusal sentence, since ADR-0122 §6 deliberately left that notice in the list's scroll region.

## Why session 138's split is what made #19 cheap

Locate sets `nearMe` (the fact, and your dot) and never touches `sortByDistance` (the intent). So granting the permission through the locate button lights the me-dot and the distance chips and leaves the list in schedule order — which is exactly the regression session 138 fixed. Had those two still been one flag, "the canvas can now ask for location" would have silently re-sorted the day.

## What is still open

Nothing blocking Phase 3, which now knows it is writing two controls. Three things go to the device pass, listed in the ADR: whether a crosshair and a corner-bracket frame read as distinct over real tiles, whether 44px is right or heavy at `half` on a 360×640 phone (49px of clear canvas), and whether a pill among two circles reads as tappable at all — the one question a mockup structurally cannot answer, because it is "does a reader try it".
