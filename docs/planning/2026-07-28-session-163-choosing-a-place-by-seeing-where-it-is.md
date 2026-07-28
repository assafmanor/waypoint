# Session 163 — choosing a place by seeing where it is

**Date:** 2026-07-28
**Kind:** design (paper only — mockup + ADR + this note; no feature code).
**Records:** [ADR-0134](../decisions/0134-the-map-is-where-a-forms-place-comes-from.md), which amends [ADR-0131](../decisions/0131-map-search-is-a-control-not-a-screen.md) §10 (reversed by the owner), [ADR-0129](../decisions/0129-map-camera-moves-like-a-camera.md) §1 (split in half) and [ADR-0115](../decisions/0115-plan-mode-place-research.md) §2.
**Mockup:** [`mockups/map-errand-v1.html`](../../mockups/map-errand-v1.html) — catalogued in [`design/mockups.md`](../design/mockups.md).

## Three requests, one idea

"Refer to the map instead of the place picker"; "clicking a result pans you instead of
opening Google Maps, though we should have a button for that"; "same from list-only mode —
open half and pan, dynamic zoom on both". **You choose a place by seeing where it is.**

That framing is what made the session tractable: (2) and (3) are not extras, they are what
makes (1) worth doing. Moving the choice to the map before the map was better at choosing
would have been a lateral move.

## What I checked before designing anything, and it halved the work

- **"Dynamic zoom" already exists.** ADR-0129 §2 built `focusBoundsFor` + `MAP_FOCUS`: the
  span comes from the distance to the nearest three pins, ×1.6 headroom, clamped
  0.0025–0.03°. It ships for the place card's frame badge. Nothing new was needed — only
  two more callers, and a decision about what "neighbours" means for a ring.
- **A row tap at `full` already drops to `half`** (ADR-0121 §8), for this exact reason.
- **The errand contract was already specified** (ADR-0131 §10).

So the ADR claims three new things, not six.

## The reversal, said plainly

ADR-0131 §10 landed on "the picker answers **in place**; the canvas is the exception path",
after four owner corrections including _"don't refer me to the map if I want a place that
already exists"_. This reverses it. **That is a change of mind, not a re-reading**, and the
ADR says so rather than retrofitting consistency.

What reconciles the two is a fact rather than a compromise: the map's search answers
**both halves** — the trip's own places filter from the first character, free and offline,
before Google is touched. What the earlier correction protected is kept; what moves is
where it happens.

**And the owner's reason is better than my recommendation was.** I recommended keeping both
routes (picker for existing, map for new). A place is confused with another place _by
location_, and that is the one thing a list cannot show.

## What the mockup found that the prose would not have

**The row's constraint is HEIGHT, not width — and I measured the wrong axis first.**
`.map-right` is a `flex-direction: column`, so a second control buys no width at all; it
makes every result row taller. Stacked: 106px per row, **3 rows** visible at 390×844 and
**2** at 360×640. Side by side: 68px, **6** and **4**. Stacking halves the results you can
see, on the axis ADR-0126 already declared scarce.

**And the measurement I built to decide icon-vs-label does not decide it.** A labelled
Google button fits too — 237px remain for name + address at 360. So the ADR says the icon
wins on a different argument (the row already has one labelled verb; two compete), rather
than pretending a number settled it.

**`בחירה` replacing `נווט` pays for itself.** Navigating somewhere is not the task while
you are picking a place for a form, so the slot is free — and the trip row stays **73px in
both states** instead of growing.

**The draft is the real cost, and promoting the errand to the route is what exposed it.**
As an exception path, losing a form's unsaved state was a corner. As the route it is every
place choice, so `{ target, returnTo }` becomes `{ target, returnTo, draft }` and the forms
become a third consumer of the hand-over-and-consume-once pattern. `target.field` is not
optional either: a transport booking has two place fields, and without naming one a
successful return can assign the right place to the wrong side.

## Two fixture bugs in my own panel, both worth the line

- **`[hidden]` lost to `display: grid`.** The new Google control had its own `display`, so
  the ⟨as shipped⟩ comparison hid nothing and both states measured identically. Same trap
  `map-split-v2` and `map-chrome-v1` both recorded, one layer down — and this time it made
  a comparison silently meaningless rather than a control invisible.
- **The panel measured the PIN, not the row.** `[data-place="ramen"]` matches both, and the
  pin comes first in the DOM, so "the trip row is 34px" was `MAP_PIN.MIN_H`. A mockup that
  measures the wrong node is worse than one that measures nothing, because the number looks
  like evidence. (`:not(.result)` was wrong too — it matched a row the reveal had collapsed
  to zero, ADR-0120.)

## What I deliberately did not decide

The map extreme (ADR-0132 §8) stays owed. Pin and ring taps still pan. No cost control
moves. And the build order is stated rather than left to preference: **the draft
serialise/rehydrate pair goes first**, because everything else in this phase is inert if a
half-typed event can be lost.
