# Session 153 — the camera moves like a camera (Phase 3, corrected off a real map)

**Date:** 2026-07-28
**Kind:** design + build, from field feedback.
**Output:** [ADR-0129](../decisions/0129-map-camera-moves-like-a-camera.md), amending [ADR-0127](../decisions/0127-map-camera-answers-the-tap.md) §1 and §2 — the same day ADR-0127 shipped.

## The thing worth keeping from this session

**This is the first Phase-3 feedback taken from a rendered canvas, and two of its three points are corrections to a decision I had reasoned carefully and shipped hours earlier.**

ADR-0127 derived the zoom ladder from the code, from measurements, and from a defensible reading of what ADR-0121 §7 was protecting. It named one constant for three paths, argued the reversal was one-directional, and tested all of it. It was still wrong about the case that gets used most — tapping a pin — because "how close is close enough to read a place in context" is not a question that can be answered without looking at a map.

The device pass was already the epic's largest outstanding debt. It is now also the only thing that has caught a real defect in it.

## What the three reports were

1. **Zooming on a pin tap is inconvenient.** You tapped a thing you can already see; you asked which one it was, not to be taken somewhere. Refined a moment later: it should still **pan**, like Google's map does — which is exactly right, and is what ADR-0121 §7 said before I changed it.
2. **How far to zoom should depend on what is around the place** — dense cluster versus isolated pin want different frames.
3. **Reframing should be smooth movement, not portaling.**

## What each turned into

**#1 — the diagnosis was more useful than the fix.** ADR-0127's error was not zoom-to-at-least; it was applying it to _selection_. So selection pans, and zooming becomes an **intent** with two callers: an arrival, and a new explicit control. For that control I did not add a button: session 148 had already made the row's category badge _the way to the pin_ on every other place-bearing surface, and had **measured and rejected** a trailing-slot control for breaking dense rows at 360px. The card's badge means the same verb one step further in. One subtraction worth stating — the badge's corner already carries the order number, so the way-in's corner marker stands down and only the ring signals the control.

**#2 — the constant becomes a fallback.** The span now comes from the distance to the nearest neighbours, fed through the existing fit path so it inherits the padding, the card reserve and the `MAX_FIT` cap for free. Both clamps prevent something real, and a coincident pin is deliberately not a neighbour.

**#3 — the cause was not a choice we made.** Read off the API's own typings: `fitBounds` "may cause a smooth animation… depending on an internal heuristic", `panTo` animates only within one viewport, `moveCamera` never. There is no documented way to ask for a transition, so the portaling was never something the app requested — and ADR-0127 §1 made it worse by choosing the jump on purpose. The ease is ours now: `moveCamera` once per frame, one duration for every move, collapsing to a single step under `prefers-reduced-motion`.

## Three things building #3 taught that paper did not

- **`fitBounds` is now a probe.** It owns Google's projection maths, so it is called to _learn_ the destination, the camera is put back, and the ease runs across. Re-deriving zoom-for-bounds ourselves would be a thing to get subtly wrong for no gain.
- **The first framing must land, not travel.** My first guard was "is there a camera to ease from" — which is never false, because a map is constructed with `defaultCenter`. Easing out of a placeholder would animate a long sweep on every tab open. Easing a fact is not movement.
- **Longitude interpolates the short way.** `boundsOfPoints` ignores the antimeridian on purpose (ADR-0121 §14's spirit). A visible sweep the long way round the world is a different question, and it is the one this function exists to avoid.

## On the tests

Every "where does the camera end up" assertion moved to the reduced-motion path, which is a real shipped behaviour rather than a test shortcut, and keeps those tests about the decision instead of frame timing. The animation has its own describe: it steps, it lands, a new move cancels the one in flight, and the opening frame does not ease.

The arrival tests changed shape rather than value — an arrival now goes through the fit, so what says it won is **which bounds were fitted** (a frame around one place, not the day's extent), not whether a fit happened at all.

## Still not seen

Whether the ease _feels_ right — duration, curve, whether a long reframe should take longer than a short one — needs a device more than any number in the cluster does. The cluster is now thirteen numbers, and this session is the argument for spending it.
