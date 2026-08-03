# Session 210 — the Hero 2.0 design session

**Date:** 2026-08-03
**Outcome:** [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md) — Accepted, design only.
**Mockups:** [`hero-lift-v1.html`](../../mockups/hero-lift-v1.html) (motion), [`hero-horizon-v1.html`](../../mockups/hero-horizon-v1.html) (content).
**Closes:** the [Hero 2.0 brief](2026-07-28-hero-2-0-design-brief.md) (raised session 148), ADR-0121's 2026-07-28 amendment §4, the [notes brief](2026-08-01-notes-design-brief.md) §C3.

The brief had been open since 2026-07-28 and named its own blocker: it should not answer sub-question 1 before notes existed, or it would answer with a reflow and get re-opened. Notes shipped 2026-08-02, so this session was the one the sequence pointed at.

## The one thing worth reading if you read nothing else

**The brief's "load-bearing" question was a false binary, and the owner's answer was a word neither option had.** The brief asked: expansion (a pane of Home, no back registration) or overlay (a `Modal`, a back layer)? Both are wrong. An expansion reflows the page under your thumb. An overlay as the brief drew it renders the same facts a second time, abandoning the glance value the board exists for. What the owner described was:

> _"the hero is expanding 'towards' the eyes of the user … instead the hero becomes the overlay 'lifting' from the screen."_

One object, one identity, gaining elevation — a **promotion**. Naming it settled four downstream questions at once, because a promotion is architecturally an overlay (it registers a back layer) and perceptually not one (it never draws twice).

## What the measurement changed, and it was two of three characters

This is the session's methodological finding and it belongs in any future motion brief: **both of the characters written from reasoning were wrong, and neither was recoverable without the numbers.**

- **"Rise to just under the chrome" measured 4px.** The board is the first thing on Home, so it already sits there. The character was A with extra steps, and there is nowhere to rise to that is not *over* the chrome — which promoted a tuning value into a real decision about the mode-identity band (72px).
- **"Approach as a scale-up" measured ×1.045.** The board is already near-full-width (358 → 374px), so a width-keyed FLIP has no scale to spend. The lift's entire visible budget is **height (×2.01) and elevation**. A literal "toward the eyes" therefore had to become a 3D swing, which is the only channel that reads as depth when width does not change.

A third fell out of the same panel: at 360×640 the **anchored** character needs a scroller and the risen one does not, purely because it does not spend the chrome's 72px. Three arguments for the same choice, none of them available from a static drawing.

## Three defects the mockups found in themselves

Worth recording because all three are the same root cause — **a mockup that inlines the app's real CSS was still hand-writing the app's other assets.**

1. **A closed layer painted.** The lifted hero rendered over Home permanently, `✕` and all. The measuring pass writes a box and clears its own `visibility`, so **measurement left the thing it measured on screen.** Fixed with `visibility: hidden` on the closed layer — not `display`, because the hero must stay measurable while closed, which is how its landing box is read off real content instead of written as a constant.
2. **The plane flew backwards.** The hand-written `flight` path pointed right; the app's real one points **left**, correct for RTL, where `.tp-fill` grows from `inset-inline-start`. And the route arrow was a hardcoded `←` where the app has `ui/NavArrow.tsx` — an SVG for optical centring, keyed to a *logical* direction and mirrored by `[dir='ltr'] .nav-arrow-forward`.
3. **Filled icons were drawn as outlines.** `Icon.tsx` renders a FILLED set (`caret`, `flight`, `star`) as `fill: currentColor; stroke: none`; both files stroked everything, which turns a silhouette into an outline (visible on the `ועוד N` chevron).

**The rule this suggests:** icons and copy should be read from source the way stylesheets already are. Copy was the same story — `הבא` for the shipped `הבא בתור`, and a sentence where the app says `פנוי` / `זמן חופשי`. Recorded on the backlog as a possible extension to `inline-app-css.mjs`.

## The finding that changed a decision from "tidy" to "forced"

The brief guessed the board's two expanding things "most likely become one". It is stronger than that: a tappable board is a `<button>`, and `.wp-board-also-toggle` is a `<button>` inside it. Drawn once, **Chrome closed `.wp-board` at the nested button** and reparented the divider, `הבא בתור` and the day rail onto the page background in dark ink — half the board torn off. A detached-tree probe reports it as **1 of 4 children left inside the board**.

So the horizon file's "before" frame is now the board exactly as shipped, and the claim is *measured* rather than drawn — drawing it made the section unreadable, which is its own small lesson about demonstrating breakage inside a document.

## Owner calls, in the order they were made

1. **The lift is a promotion**, described in the owner's own words rather than chosen from the brief's two options.
2. **Reads, hand-offs and settles; no time edits.** Which is what keeps ADR-0011 out of scope entirely — settling records an outcome, it does not edit a commitment.
3. **ההטיה (the swing)** as the character, carrying with it that the lifted hero covers the chrome.
4. **A landing beat on the return** — "some small animation of going back to normal when closing".
5. **The rebuff is the motion alone, no text.** Revised in session from the recommended one-shot line: text that flashes on the app's loudest surface reads as a scolding. It also kills the frequency question, the string and its translation.
6. **`אחר כך` earns its 28px** — kept, on the condition recorded in ADR-0160 §12.
7. **Content-sized, not screen-sized.**

## Deliberately not answered

- **A note on the NEXT event.** Sometimes exactly what you want before leaving; also the part that turns the typical case into the heavy one. Named in ADR-0160 §13 so it cannot arrive quietly during the build.
- **The rebuff's first-encounter problem.** A lift that returns reads as "nothing here" mainly to someone who has seen a real lift. If it bites on a device the answer is a one-time hint, not permanent copy.
- **Every pixel number.** Measured in a sandbox with no network, so on a fallback font. Re-measure on a device before treating any as a build constant — the same caveat already sitting on ADR-0152/0153.
