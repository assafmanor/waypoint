# Session 160 — the chrome goes, and a Google result is a ring

**Date:** 2026-07-28
**Kind:** design (paper only — mockup + ADR + this note; no feature code).
**Records:** [ADR-0132](../decisions/0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md), which amends [ADR-0131](../decisions/0131-map-search-is-a-control-not-a-screen.md) §2, [ADR-0101](../decisions/0101-index-search-mode-and-header-titles.md)'s Alternatives and [ADR-0115](../decisions/0115-plan-mode-place-research.md) §2.
**Mockup:** [`mockups/map-google-pins-v1.html`](../../mockups/map-google-pins-v1.html) — catalogued in [`design/mockups.md`](../design/mockups.md).

## The two reports, and why they are one session

Session 159's device pass left two things that were a design job rather than a fix:

1. _"Search with keyboard looks awful, the top bar shouldn't be visible and also the bottom buttons."_
2. _"I want to be able to see unsaved Google results on our map, not on the Google Maps app (it should have a different pin design)."_

They are one session because **(2) changes the surface (1) is laying out**: a canvas that has to hold N result rings is not the same design problem as a canvas that holds the trip's own pins, and answering the chrome first and the pins later would have measured the wrong surface twice.

## What I did differently, and it is the point of the session

**The mockup draws the keyboard under both platform models.** Assuming there was only one is exactly what produced the owner's screenshot: ADR-0131 §2 argued the keyboard "eats the sheet and the pins survive", which is true on iOS (the layout viewport does not shrink) and false on Android (it does — the shell compresses above the keyboard and the split, the only flexible region, absorbs the whole loss).

Android is modelled as **`.app` losing height while the frame keeps it**, because that is what resizing the layout viewport means: the device is the same size, the viewport is smaller. iOS is the default, with the keyboard overlaying.

**And the frame is spliced out of the built `map-search-v1.html`** rather than hand-carried from `map-chrome-v1.html` like every previous file in this epic. Phase 10 is shipped, so its query row is app CSS now, and re-typing it would have been session 135's fidelity slip one level up: not "the CSS without the layout tree" but "the layout tree without the shipped delta". The splice script drops the nodes this file is not about (the retired overlay, the errand banner, the drop-pin card, the §8b sentinel, the Google half's rows) and opens the query disclosure. Two stylesheets fall out of the manifest with the overlay.

## What the mockup found that the prose did not have

**1. The trigger is the field being OPEN, not a query being live.** The keyboard appears on **focus**, before a character exists. ADR-0131's `searching` predicate requires a non-blank query — correct for the list and the pins, since an empty query filters nothing — so keying the chrome off it would leave the chrome up during the worst frame of the whole interaction. The mockup draws the open-and-empty state and nothing else, which is how this surfaced at all.

**2. The safe-area insets would have fallen on the floor, silently.** They are not on the shell: `.header` pays `calc(14px + var(--safe-top))` and `.nav` pays `calc(9px + var(--safe-bottom))` (App.css). Hide both and the query field goes under the notch while the sheet's last row goes under the home indicator — **only on a device with insets**, which is precisely the class of bug this phase exists to stop shipping. So the modifier pays them on the shell's body, which is also what ADR-0101's own overlay did for itself (`search-overlay.css` pays `--safe-top`). It corrects the arithmetic too: the reclaim returns `276 − (top + bottom)`, not 276.

**3. The small screen breaks a rule, not a taste test — and it breaks it twice, differently per platform.** Measured at `half`, chrome kept → reclaimed:

| Screen  | Keyboard        | Canvas kept | Canvas reclaimed | Attribution, kept       |
| ------- | --------------- | ----------- | ---------------- | ----------------------- |
| 390×844 | Android         | **43px**    | 165px            | fits                    |
| 411×914 | Android (owner) | **61px**    | 183px            | fits                    |
| 360×640 | Android         | **0px**     | 91px             | **cannot be laid out**  |
| 360×640 | iOS             | 74px        | 223px            | **covered by keyboard** |

At 360×640 on Android the pane is 28px where the controls row (46) plus Google's attribution (22) need 68. On iOS the pane does not shrink — every number looks fine — and the keyboard covers the attribution where it sits at the pane's bottom edge. Both are ADR-0106 §B violations. **That is what makes the reclaim a condition on ADR-0131 rather than a polish pass over it**, and it is the sentence I would not have been able to write from the code.

**4. `back` has to gain a rule.** ADR-0131 kept the query as view state with no back registration, deliberately, and that held while the chrome was on screen: the tab was visibly the tab. A surface that has hidden the header and the tab bar is not visibly anything, so back closes the disclosure before leaving the tab — one additive rule in `resolveBack`, ADR-0090's named extension point, and not a `Modal`.

## The ring, and why the question was "which axis", not "which rung"

The prominence ladder is full: six tiers, two amber cues (`box-shadow`), selection (`outline`), a zoom-keyed dot tier, hue = category, solid/hatched = commitment, grey = behind you, hollow = another day, size ratio = subordinate. Nothing is left that expresses **degree**.

**And "not ours yet" is not a degree.** It is a difference of kind, which is what a different **silhouette** says and what a seventh rung structurally cannot — every pin on this canvas is a teardrop, so shape is the one free axis. ADR-0126 §1 already leaned on silhouette for the two camera controls.

Three candidates are drawn over the resting canvas beside the trip's own pins — the real reading environment, since a query keeps the trip's matches on screen too — with the same glyph in the same place, so the comparison is of the shape and nothing else:

- **⟨ב⟩ a ring** — no tip (a tip is a claim about _which building_, and a result is a candidate), no hue (we do not buy place types, ADR-0115 §2), a `＋` (the only verb available), sitting **on** the coordinate rather than pointing at it. Off the prominence ladder entirely, so it cannot collide with amber, selection or the dot tier. **Promoted.**
- **⟨א⟩ the dashed teardrop** — my own default, and drawn so its rejection is visible: it collides with the **ghost rung**, which is also a hollow teardrop, and reads as a pin that has not finished loading.
- **⟨ג⟩ the dark inversion** — distinct, and it reads as **more** important than the trip's own places, which inverts the whole point.

Drawing A was worth it: on screen the dashed teardrops sit among the ghosts and the difference the mark is supposed to carry disappears.

## Text Search: what it buys, and the cost sentence I made sure to write

The owner chose Text Search from three costed shapes, and it is the right tool — one call returns N results **with** coordinates, which is what makes pins possible rather than merely cheap.

**But it is cheap only against the right alternative, and the ADR says so plainly.** Against Autocomplete + Details-per-result, one call beats N. Against **what ships today** (Autocomplete + one Details on the pick) it may be **more expensive**: the session token folds a session's requests into a single billing event when that session ends in a pick, and Text Search has no session — every query is billed. What is being bought is results on the map, at that price. I wrote it that way so the trade is located here rather than discovered in a billing dashboard.

Per-1000 numbers are deliberately not fixed: ADR-0108 §3's rule (verified against Google's current list **at implementation**, never coded from a remembered mapping) applies to this SKU exactly as to Details. What is fixed is the shape — one call per query, not one plus N. `locationBias` to the canvas's current bounds is free relevance.

## What this reopens, named rather than reopened

Session 159 closed the `map` stop while a query is live because the sheet shows no rows there, so a coordless match had no pin **and** no row, and every Google result was a row with no pin. **The first half still holds; the second dies here** — a result ring is visible at the map extreme.

So the stop can come back, under a condition (a tap on a ring raises `.map-placecard` with the add action, a third occupant of the card ADR-0122 §7 built for "the row, wherever the sheet cannot show one"), and with a remaining gap (a coordless match is still invisible there). **ADR-0132 §8 states this as a decision still owed**, so the next session neither re-derives it nor silently undoes session 159's fix.

## What went wrong on the way, worth one line each

- **`let chrome` at the top of a mockup script throws** — it cannot shadow the global `window.chrome`, so the whole script died at evaluation and every toggle was inert while the page looked fine. Renamed.
- **The splice script matched multi-line Prettier-formatted markup by exact string**, which broke the moment the built file was formatted. Rewritten to find an element by its `id` and remove it by indentation-matched depth, which is stable under formatting.
- **The `＋` glyph rendered rotated** in two of the three pin candidates: `transform` on an **inline** element does nothing, so the counter-rotation inside the rotated teardrop silently did not apply. Only candidate B had `display: grid`. The shared box properties now sit on `.mk-gpin .gp`.

## Not done here, deliberately

Nothing is built. ADR-0131 §9 (the long press, blocked on Phase 6b) and §10's errand are untouched, `SearchOverlay` keeps the Index, and the day-scoped-grammar defect is still its own branch.
