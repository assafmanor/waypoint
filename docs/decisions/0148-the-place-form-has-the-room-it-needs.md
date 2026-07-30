# 0148 — The place form has the room it needs, one way out of it, and one source fewer

**Status:** Accepted — designed and built 2026-07-30 (session 198), from three reports off a real phone against the form [ADR-0147](0147-a-place-is-made-on-the-canvas.md) shipped the same day.

> **Date:** 2026-07-30
> **Mockup:** [`mockups/map-form-visibility-v1.html`](../../mockups/map-form-visibility-v1.html) — the decision surface, which measured all of this from the live DOM before any of it was built.
> **Amends** [0147](0147-a-place-is-made-on-the-canvas.md) in four places: §4's **fourth source is removed** (§6 below); its rejected "normalise the sheet to `map`" alternative is **reversed** — both halves of that bullet, the list you were reading and "the card renders at every stop", on a fact it was argued without (§2); §3's coordinates row and §4's hint become **one** quiet line (§1); and §7's pencil gains the framing and the `map` stop it needs in order to work from a sheet row at all (§2, §3).
> **Amends** [0125](0125-map-canvas-terrain-vocabulary.md) §6 — **unamended again.** ADR-0147 §4 had this ADR's predecessor suppress Google's POI card so ours could answer; §6 now stands exactly as written, which is where it started.
> **Amends** [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) §1 — the reclaim's trigger was `queryOpen`, which names the cause; §2 of that same ADR asked for the **want**. It is now one state two surfaces write (§5).
> **Amends** [0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §2 / [0122](0122-map-split-controls-over-the-canvas.md) §7 — the camera's card reserve was a constant sized for a selected row. It is **measured** (§3).
> **Relates** [0017](0017-mobile-first-device-targets.md) (the 360×640 floor every number here is checked against), [0106](0106-maps-and-places-epic-scope-and-phasing.md) §B (Google's attribution, which is the card's bottom boundary and a rule rather than a taste), [0134](0134-the-map-is-where-a-forms-place-comes-from.md) §4 (the derived-affordance rule §1 and §2 both lean on), [0103](0103-back-is-one-action.md) (one dismissal, every way in to it), [0121](0121-embedded-map-phase-6-design.md) §5 (the split is the only flexible region).

## Context

Three reports, in the order they arrived:

1. **_"We must have total visibility. See how it's handled for search etc."_** — with a screenshot of the form's top half off screen while its `ביטול` and `הוספה למדף` were still tappable.
2. **_"While on the form, clicking outside of it should close it and deselect."_**
3. **_"Opening a create place form for every hit on a Google suggestion is very annoying. I prefer if we removed this one."_**

**The first looked like one bug and measuring it made it three**, which is the whole reason a mockup was drawn before anything was changed. The card is anchored to the split's **bottom** and grows **upward**, so when the split shrinks for a keyboard, a card taller than its container overflows the **top** and is clipped there. What survives is the actions row and what dies is the title and the field — the worst way round, because you can commit a form you cannot read.

And the obvious fix is half a fix. Search does get this right (ADR-0132 §2 takes the header and tab bar off screen while the query field is open), but the reclaim buys 122px and the card wanted 243: at the `half` stop under an Android keyboard the room went 76 → 140, still 103px short, **and the missing part was the field being typed into**.

Two things neither report contained, both found by measuring:

- **At the `full` stop the card's room is −38px, constant, keyboard or not.** So the pencil ADR-0147 added opens a form that cannot be drawn — in a state that same ADR argued could not arise. "The gesture can only start on visible canvas" is true of the two canvas gestures and false of the pencil, which sits on a **sheet row**.
- **On iOS every layout number is healthy and the card is invisible.** The viewport does not shrink, so the card lays out with a full 564px of room and the keyboard is drawn over it. Same shape as ADR-0132 §4's iOS attribution failure, and the harder of the two to notice because nothing we measure is wrong.

## Decision

### 1. The card is bounded by the room it has, and one quiet line replaces two

**The bound is the floor, not the answer.** `.map-placecard:has(> .map-draft)` gets a `max-height` that is arithmetic over the numbers the card's own `bottom` already uses — the split, minus the controls row it must clear, minus the sheet, minus Google's attribution and its gap — so there is nothing to measure and nothing to keep in step. The card becomes three rows: **pinned head** (the title, which is also the field's `<label>`, plus the name row and its hint or error), **scrolling middle**, **pinned foot** (the actions).

Which three are pinned is not arbitrary. While you are typing, the questions on screen are _what am I naming_, _what have I typed_ and _how do I get out_. The categories and the point are the two things you cannot act on while typing anyway — the same derived-affordance reasoning that takes `נווט` off a row under an errand (ADR-0134 §4).

**And this is not a new pattern.** `EventForm` and `BookingSheet` are both a scrolling body with pinned `FormActions` and a `scrollIntoView` on focus. The place form was the only form in the app without it, because it was drawn as a **card** — and it can be both.

**Then the owner refused the scroll**, and was right to: _"some of the form is cut off, this shouldn't happen and I don't want to allow this."_ A scroll inside a 204px card is not total visibility, it is permission to cut. So the pixels were found instead, and the bound stays as the floor for a device nobody measured.

**−20px: one quiet line, never two.** The card carried a hint _and_ a coordinates/address row — two short muted clauses, each a full row plus a gap, 44px of 243. **They were never both load-bearing at once:** a dropped pin has no address at all, and for the source that had a hint, a marker under the finger had already said where it was. So one line, in `Field`'s existing hint slot: the point for a drop, the address for a result or a rename. The card became **223px for every source**, which is one number to design against instead of two.

That is a better card regardless of any keyboard — two competing quiet lines is worse than one.

### 2. The form implies the `map` stop, and the sheet stands down entirely

**From every origin, always — not "when the room is short".** Plain map, `half`, the full list, or the search view: opening the form normalises the sheet. So standing it down stops being a special behaviour of the form and becomes **the same act as tapping `רשימה / מפה`** — no third position to negotiate, no condition to calibrate, no new motion.

**ADR-0147 rejected exactly this**, in its Alternatives ("it takes away the list you were reading"). The rejection was argued **without a keyboard in the room**, and the list you were reading is already behind one. It is also answered rather than overridden: the sheet **returns to the stop it came from** when the form closes, so nothing is taken, only deferred.

**And at `full` it is a correction, not an optimisation** — the room there is negative by construction, so this is what makes the pencil work at all up there.

**+52px: the sheet is not shown at all, not merely normalised.** At `map` the sheet is nothing but its own 52px strip — a grab handle, the view toggle and `קרוב עכשיו` — over a list you cannot see. None of that is the task while you are naming a point, and the **view toggle in it actively contradicts a form that just moved you to the canvas**. `display: none` rather than a 0px sliver, for the same reason ADR-0132 §2 chose it for the chrome: the space is the point, and it takes those controls out of the tab order too.

**Together, the whole form fits with no scrolling on every target**: 223px needed against 256 in the worst case (360×640, Android keyboard), and 372–577 elsewhere. See the build log for the twelve-state table.

### 3. The pin comes into view, and it is not under the form

_"Not just that the map pans to the pin, but the pin is visible, i.e. not under the form."_

**Framing was missing from two of the sources.** The two canvas gestures framed; the pencil and a search result did not — so a rename could be started from a row whose pin was off screen, or from `full` where there is no canvas at all. Every source frames now.

**The frame is deferred one animation frame**, because two things have to settle first: the split has just been given the sheet's height back, and the card has not been laid out. `requestAnimationFrame` is this screen's existing idiom for that wait (`onResultTap`'s scroll into view).

**And the reserve that keeps a pin out from under the card was a constant.** `mapFitPadding`'s `bottomReservePx` is exactly the mechanism for this, and its own comment says it must be "a live number rather than a constant because the card comes and goes on a tap" — but the caller passed `MAP_CARD_RESERVE_H`, sized for a selected `.place` row. The form is nearly twice that, so **the pin you had just dropped landed behind the form naming it.**

**That is the fourth time this repo has written a landing position as a constant** (the three in `frontend/CLAUDE.md`: ADR-0142's card top, ADR-0143's stamp offset, the trip handoff's target). So it is measured, from the element that is actually there, and measured for **both** cards rather than special-cased for the form. Safe to measure here specifically because it feeds the camera through a latest-**ref** and never `--sheet-h`, so it cannot put a layout read on the per-second render — which is the constraint `MAP_CARD_BODY_H`'s comment was about.

`MapPane`'s `cardOpen: boolean` became `cardReserve: number`: one prop carrying strictly more than the boolean did, rather than a second one beside it.

### 4. The card clears the keyboard, not only the sheet

The iOS half, and the only genuinely new mechanism here. `useKeyboardInset` reads `window.innerHeight − visualViewport.height − visualViewport.offsetTop`: **the difference between the two platform models IS that number**, which is why one hook covers both instead of a per-platform branch. On a viewport that resized, the two moved together and it is 0; on iOS it is the keyboard's height. Nothing in it asks which platform it is.

The card's `bottom` becomes `max(sheet + attribution + gap, keyboard + gap)` — `max` because the two are alternative floors and never additive — fed by `--map-kb-h`. Only the card's `bottom` reads it, so it never touches the pane's size and cannot relayout the canvas.

Below an 80px floor the gap is a collapsing URL bar or a rounding artefact rather than a keyboard; without `visualViewport` the answer is 0, which is the safe reading (a platform we cannot ask is treated as having resized, which is what shipped).

### 5. The chrome comes down for the FORM's life, not the keyboard's

_"When the keyboard is up we should lose the top bar and bottom buttons."_ Yes — and **the trigger is the form being open**, which is a superset and the only one that does not flicker.

Tapping a category pill takes focus off the name field, so the keyboard drops. Key the chrome literally on the keyboard and the header and tab bar pop back in, the card re-lays out, and they leave again on the next touch of the field. That is the "form breathes" failure already rejected for the pills themselves, moved up to the shell where it is worse. Holding it for the form's whole life costs nothing when the keyboard is down: at `map` the form needs 223px and has 372 with the chrome off.

**One state, named for the want, with one writer.** `queryOpen` named the _cause_, and ADR-0132 §2 explicitly asked for the want — _"the shell is told the surface wants the chrome back, not what the surface is doing"_ — so the name contradicted its own ADR. It is now `chromeReclaimed`, and **the Map screen ORs its two states and pushes one boolean**. Not `queryOpen || formOpen` at the shell's read site: that is the second parallel copy of a composition, in the one place that must not know which surface is asking. It also means neither surface can take the chrome back while the other still wants it.

The safe-area insets come along for free, which is the half with no visible symptom on a phone without a notch (ADR-0132 §3).

### 6. A tap on one of Google's own sights opens nothing of ours

_"Opening a create place form for every hit on a Google suggestion is very annoying. I prefer if we removed this one."_

**ADR-0147 §4 designed the act and not the frequency.** Its reasoning about a POI tap is sound in the case it imagined — a deliberate tap on a sight you mean to add — and Google's sight icons are scattered across the whole canvas, so that tap also happens when you meant nothing at all. A form on every one of them is noise rather than an offer. **This is what a device pass finds and a mockup structurally cannot: frequency is not a drawing.**

So ADR-0125 §6 stands **unamended**: Google's own card answers the tap, and its Maps link is most of the point of making it. The `event.stop()` that suppressed that card is removed rather than commented out.

**And what went with it, because dead code is worse than a removed feature:** the `sight` draft kind; **the phase's only paid gesture** (`resolvePlace` on the confirm); the ring draft marker; `mapsPlaceIdUrl`; `nameOptional` (which existed only because that confirm bought Google's name); and the free "a sight the trip already owns → rename" path. **Renaming is the pencil, and only the pencil.**

The form is **three** sources now, and the claim is not weaker for it — it is sharper. All three remaining are something the user _asked for_, rather than something that happened to them while panning a map.

### 7. One function for every way out

`frontend/CLAUDE.md` is explicit: a cancel control, a backdrop or **outside tap**, Escape and the Android gesture must all run the same handler. The shipped form bound three of the four.

**The canvas tap IS the outside tap**, so there is no backdrop to add: it already means "I am done with what was selected" and it is already the place card's own dismissal (ADR-0122 §7). **No scrim** — a scrim would say the map is disabled, and the map is the thing you are naming a point on.

A **row tap** is a different intent, so it is not swallowed and not trapped: the form closes and the tap does what it came to do. One gesture, one intent. (Re-selecting the row a rename is _about_ does not close its own form, since that is the pencil's own two-step.)

## Alternatives considered

- **Only the chrome reclaim.** The obvious reading of the first report, and 103px short at `half` — with the missing part being the field. It is in the mockup as the middle of three panels, because seeing it fail is the argument for everything else.
- **Let the form scroll on the smallest screen.** Proposed, and **refused by the owner**: a scroll inside a 204px card is permission to cut, not total visibility. The bound survives as a floor for an unmeasured device, not as the answer.
- **Hide the categories while the keyboard is up** (43px, cheaper than either lever). Rejected on its own merits and not just as unnecessary: it moves content under the finger on every focus and blur, and iOS opens and closes a keyboard constantly — the same reason §5's trigger is the form and not the keyboard. A stable state beats an exact one that flickers.
- **Normalise the sheet only when the room is short.** Keeps the list on big screens, at the cost of making the sheet's movement unpredictable and of a threshold to calibrate. "Always" is the same act as the view toggle and needs no number.
- **A confirm dialog before discarding a dirty form.** Rejected: on a card with one field that is the nag ADR-0109 §6 refuses, and `Modal` is not what this surface is. The recommendation on the table instead is a toast with an undo — the grammar every write here already uses — and it is **not built**, because the report was about closing the form, not about protecting it.
- **A `queryOpen || formOpen` at the shell.** §5 — the second parallel copy, in the place that must not know.
- **`clickableIcons: false`**, to stop Google answering POI taps at all. Rejected in ADR-0147 and still rejected: it suppresses the _tap_, not a card, so the label stops being tappable — and Google's own card is now the thing we want. **Reversed 2026-07-30, two days later, by the owner seeing it in use** ([ADR-0125](0125-map-canvas-terrain-vocabulary.md) §6's amendment): the card is not the thing we want. It opens on the band our own place card owns, it is un-styleable and LTR, and §6 above is exactly what made it cheap to drop — with the `sight` source gone, the tap had no reader left on our side.
- **Keeping the `sight` source behind a longer press or a second tap.** Rejected: it answers the frequency complaint with a gesture nobody would discover, and the pencil already covers the case that has value (renaming something already in the trip).

## Consequences

- **The Maps & Places epic's Phase 6 no longer spends.** 6c was its only paid gesture; the search half's Text Search (ADR-0132 §7) is now the only Google spend on this tab, unchanged.
- **`Place.icon`, the form, the pencil and the three remaining sources are unaffected** — ADR-0147's core claim, that a place's name is the user's, is what all of this was protecting.
- **`useKeyboardInset` is a new, small mechanism**, and the only one. If a second surface ever needs the keyboard's overlap, it is a hook away rather than a per-screen listener.
- **`MapPane` takes `cardReserve: number` instead of `cardOpen: boolean`**, and `MAP_CARD_RESERVE_H` has no callers left.
- **The reclaim's state is `chromeReclaimed` with one writer.** A third surface on this tab that pops a keyboard writes to the same boolean; it does not add a condition at the shell.
- **The `full` stop can no longer host a form** — because the form leaves it. Anything else that ever wants to render in `.map-placecard` from a sheet row has the same −38px problem and should read §2 first.
- **Touched:** `state/map-scope-state.tsx`, `App.tsx`, `screens/Map.tsx`, `screens/map.css`, `ui/domain/MapPane.tsx`, `ui/domain/map-pane.css`, `ui/domain/MapPlaceForm.tsx`, `lib/useKeyboardInset.ts` (new), `lib/places.ts` (`mapsPlaceIdUrl` removed), `i18n/he.ts`.

## Build log

**2026-07-30 (session 198).** Four things worth keeping.

1. **The measurement is what turned one report into a design.** Every number above came from the mockup's live DOM before anything was built, and two of the four findings were invisible to both reports — the `full` stop's negative room, and iOS's healthy-numbers-invisible-card. A file that only drew the screenshotted state would have produced the half fix.
2. **The geometry is verified by a measurement pass, and that is not a canvas pass.** The shipped card was rendered in the shipped split geometry across twelve states — 360×640, 390×844, 411×914, 430×932 × {no keyboard, Android, iOS}, with safe insets on every frame that has them — and in all twelve the card is at its full 223px with the head and the actions on screen and **no scrolling**. jsdom reports every rect as zero and the e2e harness gets the tab without a pane (no browser key), so this class of check has nowhere else to live; saying which pass covered it is the point.
3. **The tests pin mechanisms, and each was verified against the un-fixed code**: the sheet standing down and being restored, the chrome held across a form closing over a still-open query, the single quiet line per source, framing from **every** source, and the cancel/outside-tap/back triple landing in one state. The framing test initially passed for the wrong reason — the pencil case selected via its **row**, which frames on its own, so the assertion held with the pencil framing nothing. Selecting via the **pin** (which deliberately does not frame, ADR-0129 §1) is what made it real.
4. **6c's removal was a deletion, not a flag.** The source, the paid call, the ring marker, `mapsPlaceIdUrl`, `nameOptional` and the owned-sight rename path are gone, and the tests that covered them were replaced by two that pin the **absence** — including that a POI tap spends nothing, which is the part that would otherwise come back invisibly and arrive as a bill.

**Amended 2026-07-30, same day, on the phone again:** _"When I long click the form opens (keyboard too), then when I lift my finger it closes immediately."_ §7's outside tap was right and its guard was not, in two independent ways — this is an amendment rather than a new ADR because nothing decided above changed.

- **The click swallow was anchored to the wrong moment.** A completed gesture fires one `click` that must not read as a tap, and the pipeline armed that swallow at the **drop** — which happens with the finger still **down**, `DRAG_HOLD_MS` into the press. The window is `DRAG_CLICK_SWALLOW_MS` (400ms) long, so any lift more than that after the form appeared arrived with the guard already expired: the click reached `onCanvasTap`, which since §7 dismisses the form. It is armed by the **release** now, which is the event the click actually follows. A cancel arms it too — that also ends a press, and whether a click follows is exactly what the timeout is for.
- **The bug was latent before §7 and only §7 could show it.** `onCanvasTap` used to do one thing: clear the selection. A drop clears the selection on its own, so the stray tap landed on an already-empty state and cost nothing visible. Giving that one function a second job is what turned a dormant mis-anchoring into "the form closes when I let go".
- **And a swallowed DOM event was never going to be enough.** What reaches `onCanvasTap` is a callback **Google dispatches**, not an event we can stop propagating — this file's own rule ("`stopPropagation` on one stream says nothing to another") one step further: it says nothing at all to a subscription. So the pane refuses a canvas tap while the same guard is armed, through one ref the recogniser writes. **One arm, one disarm, one timeout, two channels** — a second flag with its own lifetime is what would drift.
- **Every existing test for the swallow lifted the finger instantly**, so the one number that mattered was the one nothing exercised — the same "passed for the wrong reason" shape as the framing test above, twice in two days. The regression case holds the press for `DRAG_CLICK_SWALLOW_MS * 3`, and the second channel is covered where it lives: at the **seam** in `MapPane`, since the hook can only prove it armed the guard and Google's channel does not exist from inside it.

**Amended again 2026-07-30, three more from the phone.** All three are the same class as the amendment above — the form is right and the things it borrows were tuned for somewhere else — so they land here rather than in a new ADR.

- **The icon picker opened off the bottom of the screen.** `IconPicker`'s panel is anchored `top: calc(100% + 6px)`, which is correct in every other host it has (a form that scrolls under a header) and wrong in the one surface anchored to the canvas's **bottom**. So the side is **measured** and the panel is **capped to the room it has there**: `place = { up, room }` from the trigger's own rect, the panel's natural height, and `useKeyboardInset` — the second consumer of that hook, which is what this ADR's §4 said the next one would cost. A per-host CSS override was the alternative and is the one-off this repo keeps having to undo (rule 8): the fix belongs in the panel, which now has it for `EventForm`, `BookingSheet`, `CreateTrip` and `TripSettings` too. Capped, the panel keeps its head and tabs and its **grid** scrolls — a scroll inside a region that already scrolls, which is not the form-cut §1 refuses. **The first pass floored the cap at a usable 180px and that reproduced the bug**: on 360×640 with an Android keyboard neither side has 180, so the floor drew the panel taller than the space and cut its own title. There is no floor. Verified in a browser against the real stylesheets, in the shipped card, across twelve device/keyboard states: fits, head and tabs visible, in all twelve.
- **A long press panned _and zoomed_, and the zoom was wrong.** _"When long clicking to add a new place it zooms in and pans to it — in these cases I don't want a zoom."_ §3 routed every source through the camera's **framing** arrival, which is the fit. But a drop names a **pixel you are looking at**, so zooming for it is exactly the "inconvenient" ADR-0129 §1 removed from a pin tap — the rule existed and this was the case it had not reached. The pan stays, because that is what clears the pin from under the form; the pencil and a search result still frame, because a row's place may be off screen or not drawn at all. The intent now rides **in** the value (`MapArrival = { at, frame }`) rather than beside it as a second prop, so the pair cannot drift, and `framePlace` was renamed to `arrival` because in this codebase "frame" means _with a zoom_ (`frameOn`) and the value no longer always does.
- **The form opened a keyboard and immediately closed it.** `autoFocus` on the name field, removed. The gesture that opens this form ends with a finger **lifting**, so a field focused during the press loses the focus to the release: the keyboard arrived and left in one motion, which reads as a glitch. It is also the wrong default on its own terms — the card is landing, the camera is moving and the sheet is standing down, and taking half the screen during that is the "form breathes" failure §5 refuses one layer up. Tapping the field is one tap, and it is the tap that means it.

**What the three have in common is worth more than any of them:** none is a defect in the form, and all three are a **default that was correct where it was written**. A panel that opens downward, an arrival that zooms, a field that takes the focus — each is right in the surface it was built for, and this card is bottom-anchored, opens on a point you chose, and arrives on the end of a gesture. Borrowing a component means inheriting its assumptions about where it is.

**Amended a third time 2026-07-30, on the same picker:** _"Now the icon picker is too small. It should be the same size as in all other places and not cut off."_ Right, and the previous amendment had fixed the wrong layer.

**The card was clipping it.** §1 gave `.map-draft` an `overflow: hidden` — the obvious companion to a bounded three-row card, and wrong: `IconPicker`'s panel is an **anchored** panel (ADR-0144) that leaves its host's box by design, so the card cut it to a **50px sliver**. That is the whole report, from the start: measuring the _side_ and capping to the _room_ were both real improvements and neither could help, because the panel was never short — it was **painted short**. The middle row owns its own scrolling and the corners are the card's own `border-radius`, so the clip had nothing to do but that. Removed.

**And the measurement pass missed it, which is the part to keep.** The twelve-state check reported "fits, head OK, cats OK" while the panel was being cut in all twelve — because a clipped element **still lays out exactly where it always did**. Every rect was honest and the thing was invisible: ADR-0132 §4's iOS lesson, on a new surface and against our own CSS this time. A geometry harness has to walk the ancestor chain and intersect with every `overflow != visible` box, or it is measuring layout and reporting visibility. Re-run that way: the panel paints at its **full 311px** in ten of the twelve states, and only 360×640 with a keyboard up caps it (151/173) — where the screen has no more to give, and which the removed `autoFocus` makes rare anyway, since opening the picker blurs the field and drops the keyboard first.

**The cap and the flip both stay, and are now doing what they were written for.** The flip is what keeps a bottom-anchored card's panel on screen at all; the cap is the guarantee that it is never cut where even the better side is short. Neither is what was wrong.

**No suite covers this.** A CSS clip has no layout consequence and jsdom has no layout at all, so the unit tests could not have caught it and cannot now hold it — the guard is the comment beside the rule and this entry. Said out loud rather than implied, which is this repo's standard for what a pass did and did not cover.
