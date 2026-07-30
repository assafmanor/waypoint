# Session 198 — the place form has the room it needs (ADR-0148)

**Date:** 2026-07-30
**Branch:** `claude/maps-place-naming-renaming-r8sln9`
**ADR:** [0148](../decisions/0148-the-place-form-has-the-room-it-needs.md) — new, Accepted, designed and built in this session.
**Mockup:** [`mockups/map-form-visibility-v1.html`](../../mockups/map-form-visibility-v1.html) — the decision surface, drawn first and measured from the live DOM before anything was changed.

Session 197 shipped the place form. This session is the phone answering, three times:

1. _"We must have total visibility. See how it's handled for search etc."_ — with a screenshot of the form's top half off screen and its buttons still tappable.
2. _"While on the form, clicking outside of it should close it and deselect."_
3. _"Opening a create place form for every hit on a Google suggestion is very annoying. I prefer if we removed this one."_

## 1. The first report looked like one bug. Measuring it made it three.

This is the session's whole shape, and it is why the mockup came before the fix. The card is anchored to the split's **bottom** and grows **upward**, so a split that shrinks for a keyboard clips it at the **top**: the actions row survives and the title and the field die. You can commit a form you cannot read.

The obvious reading of the report is "give the form the chrome reclaim that search gets". That is **half a fix** — the reclaim buys 122px against a card that wanted 243, so at the `half` stop under an Android keyboard the room goes 76 → 140 and is still **103px short**, with the missing part being the field being typed into. That failure is drawn in the mockup as the middle of three panels, because seeing it fail is the argument for everything after it.

**Two findings neither report contained, both from the live DOM:**

- **At the `full` stop the room is −38px, constant, keyboard or not.** So the pencil ADR-0147 added opens a form that cannot be drawn, in a state that same ADR argued could not arise. "The gesture can only start on visible canvas" is true of the two canvas gestures and **false of the pencil**, which sits on a sheet row. A rule stated about two of three affordances.
- **On iOS every layout number is healthy and the card is invisible.** The viewport does not shrink, so the card lays out with a full 564px and the keyboard is drawn over it. Same shape as ADR-0132 §4's iOS attribution failure, and the harder of the two to notice, because nothing we measure is wrong. The mockup's table reports _what is seen_ beside _what was laid out_ for exactly this: the two columns separate only on iOS.

## 2. The owner refused the scroll, and was right

The first pass offered a bounded card with a scrolling middle and called a 39px overflow at 360×640 acceptable degradation. _"Some of the form is cut off, this shouldn't happen and I don't want to allow this."_

A scroll inside a 204px card is not total visibility, it is permission to cut. So the pixels were found instead, and both levers are things the card is better for regardless of any keyboard:

- **−20px: one quiet line, never two.** The card carried a hint _and_ a coordinates/address row — 44px of 243 spent on two competing muted clauses that were **never both load-bearing**: a dropped pin has no address at all, and where a hint existed, a marker under the finger had already said where the point was. One line in `Field`'s existing hint slot. The card is **223px for every source** now, which is one number to design against instead of a function of the source.
- **+52px: the sheet is not shown at all.** At `map` the sheet is nothing but its own 52px strip over a list you cannot see — and its **view toggle actively contradicts a form that just moved you to the canvas**. `display: none`, for the same reason ADR-0132 §2 chose it for the chrome: the space is the point, and it takes those controls out of the tab order too.

The bound stays, as the **floor** for a device nobody measured, not as the answer.

## 3. What the owner's own two levers turned out to be

Both arrived as suggestions and both got sharper on contact:

**"Switch to map pane from any origin."** Because it is unconditional, standing the sheet down stops being a special behaviour of the form and becomes **the same act as tapping `רשימה / מפה`** — no third sheet position, no threshold to calibrate, no new motion. It also reverses ADR-0147's rejection of exactly this rather than overriding it: the sheet **returns to the stop it came from**, so the list you were reading is deferred, not taken — and it was already behind a keyboard.

**"When the keyboard is up we should lose the top bar and bottom buttons."** Built on the **form being open**, which is a superset. Keyed literally on the keyboard, a category pill tap — which blurs the field — pops the header and tab bar back in and re-lays out the card, then loses them again on the next touch of the field. That is the "form breathes" failure already rejected for the pills themselves, moved up to the shell where it is worse. Holding it for the form's life costs nothing when the keyboard is down: 223 needed against 372 available.

And it forced a naming fix that ADR-0132 §2 had already asked for and not got: the reclaim's state was `queryOpen`, which names the **cause**, where §2 said the shell should be told the **want**. It is `chromeReclaimed` now, and the Map screen **ORs its two states and pushes one boolean** — not `queryOpen || formOpen` read at the shell, which would be the second parallel copy of a composition in the one place that must not know which surface is asking.

## 4. The fourth landing position written as a constant

_"Not just that the map pans to the pin, but the pin is visible, i.e. not under the form."_

Framing was missing from two of the sources — the pencil and a search result — so a rename could start from a row whose pin was off screen, or from `full`, where there is no canvas. Every source frames now, deferred one `requestAnimationFrame` because the split has just been given the sheet's height back and the card has not been laid out yet (the screen's existing idiom for that wait).

But the part worth recording is the reserve. `mapFitPadding`'s `bottomReservePx` is exactly the mechanism for keeping a pin out from under the card, and its own comment says it must be "a live number rather than a constant because the card comes and goes on a tap" — and the caller passed `MAP_CARD_RESERVE_H`, sized for a **selected row**. The form is nearly twice that, so **the pin you had just dropped landed behind the form naming it.**

That is the **fourth** time this repo has written a landing position as a constant, after the three already in `frontend/CLAUDE.md`. It is measured now, from the element that is actually there, for **both** cards rather than special-cased for the form — safe here specifically because it reaches the camera through a latest-**ref** and never `--sheet-h`, so no layout read joins the per-second render, which is the constraint `MAP_CARD_BODY_H`'s comment was actually about. `MapPane`'s `cardOpen: boolean` became `cardReserve: number`: one prop carrying strictly more than the boolean did, rather than a second one beside it.

## 5. One new mechanism, and it is small

`lib/useKeyboardInset.ts` reads `window.innerHeight − visualViewport.height − visualViewport.offsetTop`. **The difference between the two platform models IS that number**, which is why one hook covers both instead of a per-platform branch: on a viewport that resized, the two moved together and it is 0; on iOS it is the keyboard's height. Nothing in it asks which platform it is. Below an 80px floor the gap is a collapsing URL bar or a rounding artefact; with no `visualViewport` the answer is 0, which is the safe reading — a platform we cannot ask is treated as having resized, which is what shipped.

The card's `bottom` becomes `max(sheet + attribution + gap, keyboard + gap)` — `max` because the two are alternative floors and never additive. Only the card's `bottom` reads it, so it cannot relayout the canvas.

## 6. 6c was deleted, not flagged

ADR-0147 §4 designed the act and not the **frequency**, and Google's sight icons are scattered across the whole canvas: a form on every one of them is noise rather than an offer. **This is what a device pass finds and a mockup structurally cannot — frequency is not a drawing.**

So ADR-0125 §6 stands **unamended** (Google's own card answers the tap, and its Maps link is most of the point of making it), and the `event.stop()` that suppressed it is removed rather than commented out. What went with it, because dead code is worse than a removed feature: the `sight` draft kind, **the phase's only paid gesture**, the ring draft marker, `mapsPlaceIdUrl`, `nameOptional`, and the free "a sight the trip already owns → rename" path. Renaming is the pencil and only the pencil.

Three sources now, and the claim is sharper for it: all three are something the user **asked for**, rather than something that happened to them while panning a map.

## 7. The outside tap was never a feature request

`frontend/CLAUDE.md` is explicit that a cancel control, a backdrop or outside tap, Escape and the Android gesture all run the same function. The shipped form bound three of the four, so report 2 is a rule the app already states.

The **canvas tap IS the outside tap** — it already means "I am done with what was selected" and is already the place card's own dismissal — so there is no backdrop to add and **no scrim**, because a scrim says the map is disabled and the map is the thing you are naming a point on. A **row** tap is a different intent, so it is neither swallowed nor trapped: the form closes and the tap does what it came to do.

## 8. How the geometry was verified, stated precisely

The shipped card was rendered in the **shipped split geometry** across twelve states — 360×640, 390×844, 411×914, 430×932 × {no keyboard, Android, iOS}, with safe insets on every frame that has them — and in all twelve it is at its full 223px with the head and the actions on screen and **no scrolling**.

**That is a measurement pass, not a canvas pass, and the difference matters.** jsdom reports every rect as zero and the e2e harness gets this tab without a pane (no browser key), so this class of check has nowhere else to live — and the render itself still has not been seen on a phone. Saying which pass covered what is the point.

One thing the harness taught: the first run reported two failures that were the **harness** carrying stale inlined CSS, not the app. Re-running the inliner before measuring is part of the procedure, not a detail.

## 9. Tests, and the one that passed for the wrong reason

Each new test was verified against the un-fixed code: the sheet standing down and being restored, the chrome held across a form closing over a still-open query, the single quiet line per source, framing from every source, and the cancel / outside-tap / back triple landing in one state. Two tests pin **absences** left by 6c's removal — including that a POI tap spends nothing, which is the part that would otherwise come back invisibly and arrive as a bill.

**The framing test initially passed for the wrong reason.** The pencil case selected via its **row**, and a row tap frames on its own, so the assertion held while the pencil framed nothing. Selecting via the **pin** — which deliberately does not frame (ADR-0129 §1) — is what made it real, and mutation then caught it. A test that cannot fail is worse than no test, and the only thing that finds one is trying to break it.

## 10. Two things left open, deliberately

- **A discard guard.** Closing a dirty form loses what you typed. The recommendation on the table is a **toast with an undo** — the grammar every write here already uses — rather than a confirm dialog, which on a one-field card is the nag ADR-0109 §6 refuses. Not built: the report was about closing the form, not about protecting it.
- **Two questions for ADR-0146's device-pass sitting:** the real keyboard heights (approximated per width here), and whether iOS's `100dvh` in an installed PWA behaves as the overlay model predicts — the single assumption the whole iOS column rests on.

## 11. Also cut: CSS I wrote and then could not justify

A `data-atstart` scroll mask (nothing set the attribute) and a `[hidden]` re-assert carried over from the mockup's own gotcha — React renders the form conditionally, so that state cannot arise, and the app has no `[hidden]` rule anywhere. Both were dead on arrival. The mockup's lessons transfer; its **workarounds for being static HTML** do not.

## 12. And one more from the phone, an hour later

_"When I long click the form opens (keyboard too), then when I lift my finger it closes immediately."_

§7's outside tap was right; its guard was not, in two independent ways.

**The swallow was anchored to the wrong moment.** A completed gesture fires one `click`, and the pipeline armed the swallow for it at the **drop** — which happens with the finger still **down**. The window is 400ms. So any lift more than that after the form appeared arrived with the guard expired, and the click landed on `onCanvasTap`. It is armed by the **release** now, which is the event the click actually follows.

**It was latent before §7, and only §7 could show it.** `onCanvasTap` used to only clear the selection — and a drop clears the selection itself, so the stray tap landed on an already-empty state and cost nothing anybody could see. Giving that one function a second job is what turned a dormant mis-anchoring into a form that closes when you let go. Worth remembering the next time "one function for every way out" adds a job to a handler: the handler's _old_ callers become the regression surface.

**And swallowing a DOM event was never going to be enough.** What reaches `onCanvasTap` is a callback Google **dispatches**, not an event we can stop propagating. That is this file's own rule one step further: `stopPropagation` on one stream says nothing to another, and nothing at all to a subscription. So the pane refuses a canvas tap while the same guard is armed — one arm, one disarm, one timeout, two channels.

**Every existing test for the swallow lifted the finger instantly**, so the one number that mattered was the one nothing exercised. That is §9's lesson twice in two days: the tests were green, thorough-looking, and blind in the same direction. The regression case holds the press for three windows, and the second channel is covered at the **seam** in `MapPane` rather than beside the recogniser — the hook can prove it armed the guard, and Google's channel does not exist from inside it.
