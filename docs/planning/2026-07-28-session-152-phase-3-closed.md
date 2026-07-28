# Session 152 — the dot tier, the card's camera reserve, and Phase 3 closed

**Date:** 2026-07-28
**Kind:** design + build. Part two of Phase 3 (part one was session 151).
**Output:** [ADR-0128](../decisions/0128-map-dot-tier-and-the-cards-camera-reserve.md), amending ADR-0121 §6 and ADR-0122 §7. Phase 3's backlog line is now **done**.

## A correction before anything else

The Phase 3 line said `MAP_PIN`'s dials were open legibility work. **They are not** — session 143 recalibrated them against a real phone, measuring the ratio between two screenshots of the same device to turn "it feels small" into "your canvas is 501px, and here is the number that follows". What remains there is a **case to view** (a dense day in all-days scope), not a number to pick.

I carried that stale claim forward myself when I rewrote the Phase 3 line in session 151, and repeated it when describing what part two would be. Both are corrected now. Worth noting because it is the second time this epic that a backlog line outlived its own facts.

So part two was two items, not three.

## The dot tier: the interesting decision is which axis it lives on

ADR-0121 §6 decided it and ADR-0123 pointedly did not build it, and the reason is the whole design: **pin SIZE is a share of the canvas and must not change under a pinch; a pin's TIER may.** Two different axes, so neither has to know about the other.

What made it cheap is that it needs no prop and no state: the pane already holds the map instance, so it reads the zoom itself and writes one data attribute, and **CSS does the entire degradation**. No marker re-renders for a purely visual change — the same reasoning that made the pin's size a `clamp()` the browser resolves rather than a number threaded through props (ADR-0121 §4: a needless re-diff is the cheap failure, a re-instantiation is the billed one).

It also quietly answers §6's own clustering trigger without adopting clustering. §6's objection to a cluster bubble was that it spans categories so it can take no hue, spans tiers so it is neither solid nor dashed, and has no day position so it can take no number — "the only object on the canvas outside the system". A dot has none of those problems: it _is_ the pin, with the claims it cannot support at that zoom removed.

## The card's reserve: the prop was the easy part

ADR-0122 §7 deferred this because it "needs a `MapPane` prop that changes on a tap". ADR-0126's build log had already established where that line actually sits, so I expected the prop to be the whole job. It wasn't, twice over.

**First**, a boolean alone would have broken §7's own rule. The padding is computed inside `apply`, which the framing effect depends on — so threading the reserve in the obvious way makes the effect re-run when a card opens, and the camera moves on a pin tap. That is exactly "a tap never takes away the surface it was made on", broken by the fix for a lesser version of itself. It reads through a **ref**, so `apply` keeps its identity and the effect never re-runs.

**Second, and this is the finding: the card's full band does not fit.** `fitPaddingFor` drops padding claiming half an axis, and top + bottom + the card exceeds that on **every phone at every stop** — 390×517 wants 330 of an affordable 258. An unclamped reserve would not have carried the card at all; it would have thrown away the **top** inset too, trading a pin under the card for a pin under the controls row. Worse, and silent.

My first test asserted the padding survived at both phone sizes, and it failed. That failure is the finding — I had written the test expecting to confirm the design and it refuted it instead, which is the useful direction.

So the reserve is **clamped to what the axis has left after the top inset**: it degrades rather than switching off (a taller canvas carries more of the card), and it can never cost the top. Best-effort, stated as such, and bounded where it used to be absent.

## One process note

Prettier had reflowed the `useMapCamera` test's `mount` helper onto one line since I last read it, so a multi-line patch silently missed — and the test then passed `bottomReserve` into a hook that never read it, failing with a number I could have "fixed" by adjusting the assertion. Reading the file rather than trusting the patch is what caught it. Patching by exact-match against a formatter-owned file is worth doing as an `Edit` on freshly-read content, not a scripted replace.

## Phase 3 is closed, and the bill is now explicit

Both of Phase 3's deferred hand-offs and all four of its camera reports are built. What is **not** done is seeing any of it: the device pass now owns **seven numbers plus three look questions** across ADR-0122/0123/0126/0127/0128, and the backlog says plainly that they want one sitting on a phone with a browser key. Every one of them is currently a reasoned default. That is the honest state of the map epic, and it is the highest-value next session — higher than any remaining code.
