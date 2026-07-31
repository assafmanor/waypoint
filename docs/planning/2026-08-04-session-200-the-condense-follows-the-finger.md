# Session 200 — the condense follows the finger

**Date:** 2026-08-04
**Scope:** Device pass on [ADR-0149](../decisions/0149-the-top-bar-is-two-rows.md) §7. Frontend only.
**Build session:** [session 199](2026-08-03-session-199-the-top-bar-is-built.md)
**Shipped in four PRs:** #391 (the oscillation), #392 (the timing), #393 (scroll-linked — **reverted**), #394 (the revert), and this one.

## Why there is a revert in the history

Four builds of one behaviour, each fixing what the phone reported and each producing a
new device-visible failure. The sequence matters more than any of them:

1. **It oscillated** (#391). The slack test ran in both states against the _live_ slack,
   which shrinks by the 52px the condense frees — so a 15px band of page heights never
   settled. Fixed by asking the question of the expanded height. Correct, and it stayed.
2. **It still read as jumpy** (#392). Retimed: one clock, one easing, the gap moved onto
   the box that collapses. Better, still jumpy.
3. **Linked to the scroll offset** (#393). Oscillated _again_, rested half open, **and
   took the Map's collapse away entirely** — the hook wrote `--chrome-open` inline and an
   inline value outranks the selector carrying a surface's declaration.
4. **Reverted** (#394), rather than a fourth fix-forward on top of three.

Three consecutive fix-forwards each shipped a new failure, which is the signal to stop
fixing forward. **The revert is the useful artifact here** — it put `main` back on a
known-good behaviour while the model was rethought, instead of leaving it carrying the
worst of the four.

## What the owner's third report actually said

> "Collapsing when going to the map screen is smooth and expanding going out is smooth too."

Those are the same 52px, on a timer, on the one path with **no finger in it**. That is the
whole diagnosis: the header is in flow, so collapsing it moves the content by its own
height change — 52px the content travels _on its own_, on top of the movement the finger
is already producing. Two things move, you asked for one. No duration fixes it, and the
hysteresis made it worse by turning a gradual gesture into a step.

The model that replaces it is the owner's, and it is Facebook's bar: **scroll-linked while
the finger is down, snapped once it stops.** Written up in ADR-0149's 2026-08-04 amendment
("the condense is scroll-linked, and it snaps") with the two constraints it turned out to
carry — the floor (`open` may never exceed what the offset accounts for) and the doubled
slack threshold that the floor forces.

## The three things worth carrying to the next scroll-driven effect

- **An animation is only a problem while something else is moving.** The declared path
  (a tab change) and the gesture path are the same 52px and want opposite treatments. If a
  surface transition and a gesture share a mechanism, they will not share a clock.
- **An inline write beats a declaration, silently.** The scroll path and the surface path
  both spoke through `data-chrome`, and the scroll path won a fight nobody knew was
  happening. They are separate attributes now (`data-chrome` / `data-chrome-row`), and
  the hook writes **nothing at all** when a declaration is in force — pinned by a test,
  because nothing else could have caught it.
- **This container cannot reproduce the failure.** No touch, no momentum, no notch — and
  `--safe-top` is 0 in a desktop browser, which is systematically off on the exact
  quantity a scroll-threshold behaviour is measured by (session 199's amendment made the
  same mistake). Every one of the four builds passed here. **The device is the test.**
