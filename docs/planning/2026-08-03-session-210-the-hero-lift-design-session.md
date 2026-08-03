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

- **"Rise to just under the chrome" measured 4px.** The board is the first thing on Home, so it already sits there. The character was A with extra steps, and there is nowhere to rise to that is not _over_ the chrome — which promoted a tuning value into a real decision about the mode-identity band (72px).
- **"Approach as a scale-up" measured ×1.045.** The board is already near-full-width (358 → 374px), so a width-keyed FLIP has no scale to spend. The lift's entire visible budget is **height (×2.01) and elevation**. A literal "toward the eyes" therefore had to become a 3D swing, which is the only channel that reads as depth when width does not change.

A third fell out of the same panel: at 360×640 the **anchored** character needs a scroller and the risen one does not, purely because it does not spend the chrome's 72px. Three arguments for the same choice, none of them available from a static drawing.

## Three defects the mockups found in themselves

Worth recording because all three are the same root cause — **a mockup that inlines the app's real CSS was still hand-writing the app's other assets.**

1. **A closed layer painted.** The lifted hero rendered over Home permanently, `✕` and all. The measuring pass writes a box and clears its own `visibility`, so **measurement left the thing it measured on screen.** Fixed with `visibility: hidden` on the closed layer — not `display`, because the hero must stay measurable while closed, which is how its landing box is read off real content instead of written as a constant.
2. **The plane flew backwards.** The hand-written `flight` path pointed right; the app's real one points **left**, correct for RTL, where `.tp-fill` grows from `inset-inline-start`. And the route arrow was a hardcoded `←` where the app has `ui/NavArrow.tsx` — an SVG for optical centring, keyed to a _logical_ direction and mirrored by `[dir='ltr'] .nav-arrow-forward`.
3. **Filled icons were drawn as outlines.** `Icon.tsx` renders a FILLED set (`caret`, `flight`, `star`) as `fill: currentColor; stroke: none`; both files stroked everything, which turns a silhouette into an outline (visible on the `ועוד N` chevron).

**The rule this suggests:** icons and copy should be read from source the way stylesheets already are. Copy was the same story — `הבא` for the shipped `הבא בתור`, and a sentence where the app says `פנוי` / `זמן חופשי`. Recorded on the backlog as a possible extension to `inline-app-css.mjs`.

## The finding that changed a decision from "tidy" to "forced"

The brief guessed the board's two expanding things "most likely become one". It is stronger than that: a tappable board is a `<button>`, and `.wp-board-also-toggle` is a `<button>` inside it. Drawn once, **Chrome closed `.wp-board` at the nested button** and reparented the divider, `הבא בתור` and the day rail onto the page background in dark ink — half the board torn off. A detached-tree probe reports it as **1 of 4 children left inside the board**.

So the horizon file's "before" frame is now the board exactly as shipped, and the claim is _measured_ rather than drawn — drawing it made the section unreadable, which is its own small lesson about demonstrating breakage inside a document.

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

## Phase 4 — the motion (same session, after the round-one amendment merged)

The trigger was a screenshot and one sentence: _"now it became a simple overlay rendering the hero twice instead of lifting up"_. Worth recording that the complaint was **correct about the grammar and not about the code** — phases 1-3 built exactly what ADR-0160 §1 designed, and the result was still an overlay, because two of §1's own clauses had not been built yet. A design can be right and its half-built state can contradict it.

**What actually fixed the report was not the FLIP.** It was `.wp-board.is-lifted` — one CSS rule hiding the collapsed board — plus deleting the placeholder fade. The flight is what makes it _good_; hiding the board is what makes it _not an overlay_. Ordering those correctly took a screenshot, because from the code the fade looked like the whole problem.

### The three defects the browser found, and why nothing else could

Every one of these was invisible to 2508 passing unit tests, and two were invisible to a standalone harness of the same components as well.

1. **The lifted hero was replaying the app's one cinematic moment.** `.app[data-mode='trip'] .wp-board` matches the lifted hero, because the hero _is_ a `.wp-board` — that is what a promotion means. So every open ran the Plan→Trip going-live climax: 600ms from `brightness(0.55) saturate(0.55)`. The visible symptom was in the owner's screenshot all along (the lifted card looks flat and dim beside the board above it) and I read it as a scrim artefact.

2. **That same rule silently ate the landing beat.** It is more specific than `.wp-board.is-landing`, so §7's beat never played. The first fix — excluding `.is-landing` — was **measured and rejected**: leaving and re-entering the rule restarts the power-on, so the board flashed dim and ramped up over 600ms after every close. The beat now fills a second animation slot the power-on rule leaves open, which keeps `animation-name` in position 0 unchanged.

3. **A flight's own `position: fixed` corrupts the next measurement.** An element out of flow reports its _static_ position, so the second of React StrictMode's two effect invocations measured 422 instead of 273.5 and flew there. A standalone Vite harness of the real `Board` + `HeroLift` against the real stylesheets measured **perfectly** — because I had not wrapped it in StrictMode. That is the sharpest lesson of the phase: **a harness that omits the app's own dev wrappers can certify a bug as fixed.** The e2e in the real app is what caught it.

### Two tests that passed for the wrong reason first

Both were written, seen green, then broken on purpose — and only one of them actually bit.

- The settled-box assertion compared the **last sampled frame** to the settled box. Those are the same box by construction once the flight releases its borrowed `position`, so it passed happily with the landing box hardcoded to `{8, 120, 374, 560}`. It now compares the last frame that still carries `position: fixed`, and fails by 153px on that same hardcode.
- Reading the aim from `effect.getKeyframes()` — the technique ADR-0140's handoff spec uses — reads back the element's resolved `auto` offsets here (`top: 422px` for a keyframe passed `273.5px`), because this card has no `top`/`left` in CSS at all. The spec measures observed geometry instead, which is both honest and closer to what a user sees.

The habit that produced all four findings is the same one: **break the code and check the test goes red.** Two of the four guards did not, and would have shipped as decoration.

### Left undone, deliberately

`in-transit` liftability. §10 asks that variant for new **content** — the seat, the landing zone shift, what is first on the ground — plus the transit progress standing in for the day rail. That is phase-3-shaped work, and folding it into the motion PR is exactly what splitting 3 from 4 was meant to prevent. It is now its own phase in the build plan rather than a line item nobody owns.

## Plan mode, and the last variant (same session)

Two small closes, and both turned on the same question: **what does this surface actually summarise, and where does that live?**

**Plan mode does not lift** (ADR-0160 §H). Asked directly, and the answer is structural: the lift exists to close a distance to depth that lives elsewhere, and Plan's `.prep` hero has none — its depth is the checklist rendered directly beneath it. A lifted Plan hero would show the checklist to someone looking at the checklist. What it gets instead is §9's **rebuff**, which had been designed for the Trip board, retired when the board started lifting in gaps, and now returns for the surface that actually has the condition it described. Not the form-refusal `NUDGE`, whose lateral shake means _something is wrong_; and not a `<button>`, because announcing a control that does nothing on activation is ADR-0150 §8 read backwards.

**`in-transit` lifts** (§I), and the interesting part is how little it needed. §10 listed four content items and three were already in the horizon — the booking is the `Reach` part any point with one gets, "what is first on the ground" is literally `הבא בתור` (the flight is `now`, so the next IS the first thing after landing), and the landing zone shift rides with the transit progress. Reading a spec as four features when it is one gate plus three things you already built is a cheap mistake to make and an expensive one to act on.

The fourth item is the one worth recording: **§10 asked for "the seat" and this app does not store a seat.** No schema field, no form input. What the app actually does is in its own test fixtures — `מושב ליד החלון בשתי הטיסות` is a _note on the flight booking_, which the lifted hero already reads. So the choice was to invent a field to fill a designed slot, or to notice that the need is already met in the app's idiom and say so. ADR-0045 makes that easy: a fixture for an unbuilt feature is not allowed on Home, and a seat field added to satisfy a hero slot is exactly that.

### One duplication found while wiring the foot

Phase 3's `rail` prop said: _"the same node the collapsed board renders, passed in rather than rebuilt so the two cannot drift."_ `Home` hand-wrote a copy of `.wp-board-progress` beside it. The comment described the intent and enforced nothing, and nothing failed for two phases.

The generalisation that fixes it is small — `DayRail` and `TransitProgress` exported from `Board.tsx`, both hosts rendering the same components — but the lesson is about the comment, not the CSS: **a claim that two surfaces share a node is documentation, not a constraint.** If sharing matters, the shared thing has to be a single importable unit, or the copy will be written and no test will notice.
