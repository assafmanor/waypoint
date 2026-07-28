# 0132 — Search reclaims the app chrome, and an unsaved Google result is a **ring, not a pin**

**Status:** Accepted — designed 2026-07-28 (session 160) and **built the same day (session 161)**; see the [Build log](#build-log-2026-07-28-session-161). Two reports from ADR-0131's device pass (session 159), designed together because the second changes the surface the first is laying out. **§8's map extreme is still a decision owed, not built.** The rendered canvas has not been seen on a phone (ADR-0121 §13) and nothing below claims otherwise.
**Date:** 2026-07-28

**Amends** [0131](0131-map-search-is-a-control-not-a-screen.md) **§2** — its keyboard measurement was taken against an iOS model and does not describe Android, which is the platform the owner is on. §2's conclusion is scoped to iOS and its consequence is replaced by §1–§4 below.
**Amends** [0101](0101-index-search-mode-and-header-titles.md)'s Alternatives — "thread a search-mode flag up through `AppShell`/`Shell`" was rejected in July because no such pattern existed. [ADR-0121](0121-embedded-map-phase-6-design.md) §5 created one for this very tab; the rejection is **reframed, not contradicted** (§2).
**Amends** [0115](0115-plan-mode-place-research.md) **§2** — "a prediction carries no coordinates, so there is nothing to draw" stops being the end of the argument: the half switches SKU (§7). ADR-0115 §6's demanded "own ADR and own cost line" is §7.
**Relates** [0078](0078-feedback-state-family.md) (the layout layer this modifier belongs to), [0106](0106-maps-and-places-epic-scope-and-phasing.md) §B (Google's attribution, which is what turns §4 from a preference into a condition), [0108](0108-maps-and-places-backend-architecture-key-model-and-cost.md) §3/§6 (the cost envelope and the budget alert), [0111](0111-places-field-mask-tier-and-rating-deferral.md) (the mask tier the new SKU has to be priced against), [0090](0090-back-is-computed-from-nav-state.md) (the one rule §5 adds), [0122](0122-map-split-controls-over-the-canvas.md) §5/§7 (`visibility` vs absence, and the card as a third occupant), [0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) §1 (silhouette already carrying meaning on this canvas), [0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §1 + [0130](0130-a-maybe-is-not-a-past-place.md) §3 (the ladder a new population has to avoid colliding with), [0017](0017-mobile-first-device-targets.md) (the 360×640 screen that decides §4).

Mockup: [`mockups/map-google-pins-v1.html`](../../mockups/map-google-pins-v1.html) — the frame is **spliced out of the built `map-search-v1.html`**, so the row being measured is the one that shipped rather than a re-typing of it. It draws the keyboard under **both** platform models, models a notched device, and prints every number in this ADR from the live DOM. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

## Context

The owner used ADR-0131's shipped search on an Android phone and filed four things. Two were fixed in session 159. These are the other two:

1. _"Search with keyboard looks awful, the top bar shouldn't be visible and also the bottom buttons."_
2. _"I want to be able to see unsaved Google results on our map, not on the Google Maps app (it should have a different pin design)."_

**And the first one is a correction of my own reasoning, not just of the surface.** ADR-0131 §2 argued that the keyboard "eats the sheet and the pins survive" — the inversion of the failure ADR-0101 documented. That measurement was taken against an **iOS** model, where the layout viewport does not shrink and the keyboard overlays it. **Android resizes the layout viewport.** The shell then compresses into what is left above the keyboard, the header and the nav keep their sizes because they are fixed content, and the split — the only flexible region — absorbs the **entire** loss.

**ADR-0131's own device-pass note flagged this risk in writing** ("the real keyboard height, and what iOS does with focus inside a `100dvh` PWA — the file cannot answer, and it is the only number §2 depends on") and shipped the optimistic reading anyway. Naming a risk is not the same as not leaning on it. The honest form of §2 was _"this holds on iOS and is unknown on Android"_, and a mockup can draw both — which is what this one does.

## Decision

### 1. The trigger is the **disclosure being open**, not a live query

ADR-0131 shipped one three-valued state (`MAP_ROW_DISCLOSURE`) plus a derived `searching = disclosure === query && query.trim() !== ''`. `searching` drives the list, the pins and the sheet's stop order, and that is right: an empty query filters nothing, so there is nothing to filter by.

**The chrome cannot key off it.** The keyboard opens on **focus** — before a character exists — so the state that has to survive is "the field is open and empty", which is exactly the state ADR-0131 never drew. The mockup therefore draws that state and nothing else.

So the reclaim keys off the weaker predicate: **the query disclosure is open**, whatever is or is not typed. One boolean, derived beside `searching` from the same state, no new state.

### 2. One modifier in the **layout layer** — the second consumer of a pattern, not a new hole in the shell

`AppShell` already takes a surface-driven layout modifier: `bodyClassName={BODY_FULLBLEED}`, which the Map tab passes to make the shell stop scrolling and stop padding (ADR-0121 §5). ADR-0078 put shell structure in the layout layer for exactly this reason. This is the **second** such modifier, so:

```css
.app[data-chrome='reclaimed'] > .header,
.app[data-chrome='reclaimed'] > .nav {
  display: none;
}
```

**Which reframes ADR-0101's rejection rather than contradicting it.** It refused "a search-mode flag through `AppShell`" in July, when threading one would have meant inventing the mechanism for a single screen. The mechanism now exists, for this tab, with a consumer already shipped. What is refused stays refused: this is **not** a search flag — the shell is told the surface wants the chrome back, not what the surface is doing.

**`display: none`, deliberately, and not `visibility: hidden`.** ADR-0122 §5 drew that distinction for the sort chip, where the point was to **keep** the space and animate into it. Here the space is the entire point: `visibility` would reserve the 276px being reclaimed. It also takes the chrome out of the tab order, which is correct — while you are typing, the mode bar and the tab bar are not part of this surface.

**The nodes stay mounted** (ADR-0078's one-frame invariant), so the day strip keeps its scroll position and its all-days state, and nothing re-mounts when the query closes.

**No transition.** Animating it would relayout the split mid-animation, the one thing ADR-0121 §5 shaped the stops to avoid — and App.css kills transitions under reduced motion anyway, so the resting states have to carry the whole meaning. They do: chrome, or no chrome.

### 3. The safe area has to move with them, and nothing announces that it didn't

**The insets are not on the shell. They are on the two nodes being hidden.** `.header` pays `calc(14px + var(--safe-top))` and `.nav` pays `calc(9px + var(--safe-bottom))` (App.css). Hide both and the query field goes **under the notch** while the sheet's last row goes under the home indicator — on a device with insets only, which is precisely the class of defect this phase exists to stop shipping.

So the modifier pays them, on the shell's own body:

```css
.app[data-chrome='reclaimed'] > .body {
  padding-block: var(--safe-top) var(--safe-bottom);
}
```

That is the layer that already owns shell padding (ADR-0078), and it is what ADR-0101's own overlay did for itself — `search-overlay.css` pays `--safe-top` in its header. It also corrects the arithmetic everywhere else in this ADR: **the reclaim returns `276 − (top + bottom)`**, not 276. Modelled at 24/24 on a 390×844 Android frame, the chrome costs 324px and the reclaim gives back 276 of it, taking the canvas from 22px to 143px.

### 4. What it is worth, measured — and the reason it is a **condition** rather than an improvement

Every number below is read from the live DOM of the mockup's frame at the `half` stop, with the app's real stylesheets. `canvas` is what is actually on screen: the pane, minus the controls row floating over it, minus Google's attribution, clipped by an iOS keyboard if one is up.

| Screen  | Keyboard model         | Chrome kept — pane / canvas | Reclaimed — pane / canvas | Attribution, chrome kept |
| ------- | ---------------------- | --------------------------- | ------------------------- | ------------------------ |
| 390×844 | none                   | 250 / 191                   | —                         | fits                     |
| 390×844 | Android (336, resizes) | 102 / **43**                | 224 / **165**             | fits                     |
| 411×914 | Android (365, resizes) | 120 / **61**                | 242 / **183**             | fits                     |
| 360×640 | Android (300, resizes) | 28 / **0**                  | 150 / **91**              | **does not fit**         |
| 360×640 | iOS (300, overlays)    | 160 / **74**                | 282 / **223**             | **covered**              |

**43px of canvas at 390×844 is the owner's screenshot, reproduced from the shipped CSS.** 61px is that number on the owner's own 411×914 device. Both are a map tab with no map.

**And the small screen fails a rule, not a taste test.** ADR-0106 §B: Google's attribution may not be obscured. It has two independent failure modes here, one per platform, and the reclaim is what fixes both:

- **Android, 360×640:** the pane shrinks to **28px** while the controls row (46) plus the attribution (22) need 68. The attribution cannot be laid out at all. That screen is in ADR-0017's targets.
- **iOS, 360×640:** the pane does **not** shrink — so every number looks fine — and the keyboard, which overlays, **covers** the attribution where it sits at the pane's bottom edge. This is the harder of the two to notice and it was invisible to ADR-0131's model entirely.

**So this is not "the canvas is cramped".** On a small phone the shipped surface cannot legally render while you are typing. That is what makes the reclaim non-optional, and it is why this ADR is a condition on ADR-0131 rather than a polish pass over it.

### 5. A surface that hid the app chrome changed "where am I", so `back` has to undo it first

ADR-0131 kept the query as **view state** with no back registration, deliberately, and that was right while the chrome was still on screen: the tab was visibly the tab. A surface that has hidden the header and the tab bar is not visibly anything, and the platform back gesture is then the obvious way out of it.

**One rule in `resolveBack`** (ADR-0090's named extension point, and the same shape ADR-0131 §10's errand needs): while the query disclosure is open, back **closes the disclosure** and stays on the tab; only then does back leave the tab. Additive, computed from nav state, no history traversal, and it does **not** make the query an overlay — `SnapSheet`'s precedent stands (a pane of a screen registers nothing), and this is one rule about one boolean rather than a `Modal`.

### 6. An unsaved Google result is a **different kind** of object, so it gets a different **silhouette**

The prominence ladder is full: six tiers, two amber cues as `box-shadow`, selection as `outline`, a zoom-keyed dot degradation, hue = category, solid/hatched fill = commitment, grey = behind you, hollow = another day, size ratio = subordinate. **So the question is not "which rung" — it is "which axis is still free".**

**Shape is free.** Every pin on this canvas is a teardrop. And "not ours yet" is a difference of **kind**, not of degree — which is what a different silhouette says and what a seventh rung structurally cannot. ADR-0126 §1 already leaned on silhouette to separate the two camera controls.

**The decision: a ring.** No tip, because a tip is a claim about _which building_ and a result is a candidate. No hue, because we do not buy place types (ADR-0115 §2 — the mask does not carry them). A `＋` inside it, because the only verb available on it is add. It **sits on** the coordinate instead of pointing at it, which is the honest geometry for something that is not in the trip yet.

What falls out for free: it is not on the prominence ladder at all, so it cannot collide with the amber cues, the selection outline or the dot tier, and there is nothing to compose.

**A result the trip already owns gets no ring**: it already has a pin, and a ring over it would draw one place twice while saying the opposite thing about it. Its row states `כבר בטיול` instead.

> **AMENDED 2026-07-28 (session 167, owner: _"you can't see results that are already on the trip on the map"_).** The rule stands; **its premise had to be made true.** "It already has a pin" holds only while both halves of the search agree about what matches, and they never did — ours is a normalised substring over name + address (`matchesAnyTerm`, deliberately dumb and free), Google's handles transliteration, aliases and misspellings. So `מון` finds `Moon Sushi Bar Pinsker` in Google's half and **cannot** find it in ours: the place we own was filtered off the canvas by our own predicate, while its row sat in the sheet saying `כבר בטיול` and pointing at nothing. The canvas read `אין מקומות באזור` over the exact spot.
>
> **A result the trip owns now counts as a match**, so its pin is drawn — as **our pin, not a ring**, because the ring's silhouette means "not yours yet" and this one is yours. One object per place either way, which is what this rule was protecting.
>
> Two consequences, both of them the pin↔row rule (ADR-0121 §8) rather than new behaviour: the result row and the pin **select together**, since with the trip half not matching, that row _is_ this place's row on this screen; and at the map extreme the **place** card wins over the result card, being the richer of the two and the honest answer to "what is this".

> **EXTENDED 2026-07-28 (session 168, the same report a second time: _"still don't see existing places on search"_).** Session 167 fixed the **canvas** half and left the **list** half untouched, so the pin appeared and the row still did not: the only row for a place you already own was **Google's**, saying `כבר בטיול`. Half a fix reads as no fix, and rightly.
>
> So the rule is now stated once and applied to both halves: **a place the trip owns is shown as ours — pin not ring, row not result.** The list's predicate gains the same `ownedResults` clause the pin filter has, and Google's half **drops** a result the trip owns instead of rendering it. That retires the `כבר בטיול` / `על המדף` row state entirely (its copy and CSS are deleted, not orphaned), because the trip's own row says all of it better: the day, the time, what happens there, `על המדף` for a pure idea, and the way in to every reference.
>
> It also removes a duplication that shipped and was never noticed: a place we own whose name **did** match our own text was listed **twice**, once as ours and once as Google's.

Two candidates are drawn in the mockup and rejected there so the choice is seen rather than asserted: a **dashed teardrop** (which reuses `.map-badge.result`'s "listed, not yet ours" grammar and reads as _a pin that has not finished loading_ — and collides with the ghost rung, which is also a hollow teardrop), and a **dark inversion** (distinct, but it reads as **more** important than the trip's own pins, which inverts the whole point).

### 7. Text Search: what it buys, and what it actually costs

**Why the SKU has to change at all.** ADR-0115 §2's fact is unchanged: an Autocomplete prediction carries **no coordinates**, so it cannot be drawn. Text Search returns the place **with** its location, so N results cost **one call** instead of N — which is what makes pins possible rather than merely affordable. Owner's call, from three costed shapes; the two rejected ones (Details-per-tap, Details-per-result) are recorded in ADR-0131's device-pass section and are not re-derived here.

**And it is cheap only against the right alternative — said plainly so the trade is located rather than discovered later.** Against Autocomplete + Details-per-result, one call beats N. Against **what ships today** (Autocomplete + one Details on the pick) it may be **more expensive**: the session token folds the requests inside a session into a single billing event _when that session ends in a pick_, and Text Search has no concept of a session — every query is billed. **What is being bought here is results on the map, at that price.**

Which makes the controls that already exist more important, not less:

- **The min-chars floor of 3** (ADR-0131 §8b) and the pause-gated debounce are now the only things between a keystroke and a billed call.
- **The free half answers first.** A query the trip can answer never reaches Google at all.
- **`locationBias` to the canvas's current bounds is free relevance.** If the map is on Shinjuku and you type "coffee", you mean Shinjuku.
- ADR-0108 §6's budget alert and daily cap apply unchanged, and this SKU is what they were shaped for.

**Deliberately not fixed here: the per-1000 numbers.** ADR-0108 §3's rule — the field→tier mapping is _"verified against Google's current list at implementation, never coded from a remembered mapping"_ — applies to this SKU exactly as it applies to Details. What this ADR fixes is the **shape**: one call per query, not one plus N.

### 8. What this reopens, named rather than reopened quietly: the map extreme

Session 159 closed the `map` stop while a query is live, because at that stop the sheet shows **no rows**, so a coordless match had no pin and no row, and every Google result was a row with no pin. **The first half of that reason still holds. The second half dies here** — a Google result that is a ring **is** visible at the map extreme.

So the stop can come back, under a condition: a tap on a result ring must raise the place card with the add action, i.e. `.map-placecard` gaining a **third** occupant (ADR-0122 §7 built it for exactly "the row, wherever the sheet cannot show one"). What stays invisible there is a **coordless match**, which is a real gap and not a smaller one than before.

**This is therefore a decision that is still owed, not a consequence of this ADR.** It is named so the next session does not either re-derive it or silently undo session 159's fix.

> **TAKEN, 2026-07-28 (session 166, owner: _"from the map search view you can't maximize the map"_).** The stop is **back**, with the condition above built: a ring tap at the map extreme raises `ResultRow` inside `.map-placecard` — the same row the sheet would show, in the second host ADR-0122 §7 created — carrying `＋ אולי` (or `בחירה` under an errand) and the way out to Google. Its body is **inert**, exactly as the trip card's is: there is nothing to frame about the place you are already looking at.
>
> Three consequences of taking it, all of them small and all of them things the code now states:
>
> - **Only `full` normalises on opening search.** `map` no longer does, which is what "maximize" means here. The `SnapSheet` axis goes back to all three stops, so the drag and the arrow keys recover the stop with the toggle rather than through a separate guard.
> - **Each selection clears the other.** A ring and a pin could otherwise both be selected, which at this stop is two cards stacked — the same defect `MapPane`'s "do NOT skip on `event.detail.placeId`" comment records for Google's own card.
> - **The gap §8 named is unchanged and still real:** a **coordless** match has no ring, so at this stop it has neither pin nor row. Text Search returns a location for practically everything, so it is rarer than it was under Autocomplete — but it is the same hole, not a closed one.

### 9. What this phase does not do

- It does not touch `SearchOverlay`, which keeps the Index (ADR-0131 §7 stands).
- It does not change the list, the pins, the reveal, the camera or `cameraSignal`.
- It does not reopen the map extreme (§8).
- It does not build ADR-0131 §9 (the long press, blocked on Phase 6b) or §10's errand.
- It does not touch the day-scoped-grammar defect, which is still its own branch.

## Alternatives considered

**Hide only the header, keep the nav.** The header is 207 of the 276, so most of the win with less disruption. Rejected: the nav is 69px of a 28px-pane problem, and leaving it means the tab bar is live while the surface has no tabs — you can navigate away mid-query by accident. The two nodes are one decision.

**`visibility: hidden` instead of `display: none`.** Reserves the space, which is the entire thing being reclaimed. It would also keep the chrome in the tab order (§2).

**Reclaim on `searching` (a non-blank query) instead of on the disclosure.** Simpler — one predicate instead of two — and wrong: the keyboard is already up while the field is empty, so the worst frame of the whole interaction would keep the chrome. Rejected on the mockup's drawn state (§1).

**Go back to a `Modal`.** It reclaims the chrome for free via z-index, which is ADR-0101's original virtue, and it covers the canvas, which is the defect ADR-0131 exists to remove. The whole point is the virtue without the defect.

**Animate the reclaim.** Rejected in §2: it relayouts the split mid-animation, and reduced motion would leave the resting states carrying the meaning anyway.

**A seventh rung on the pin ladder for Google results.** Rejected in §6: degree cannot say kind, and the axes that express degree are all taken.

**The dashed teardrop, and the dark inversion.** Both drawn in the mockup and rejected there (§6), the first because it collides with the ghost rung and reads as "loading", the second because it out-ranks the trip's own places.

**Keep Autocomplete and resolve coordinates per tap.** Already rejected in ADR-0131's device pass (one pin at a time answers a different question). Recorded here only so the new cost note in §7 is not mistaken for a reason to revisit it: it is cheaper _and_ it does not put results on the map.

## Consequences

- **A second `AppShell` layout modifier exists**, so the pattern is now plural and the next surface that needs one has two precedents rather than one. The flip side: the shell has two ways to be told about a surface's layout, and a third should be a deliberate decision rather than a habit.
- **The safe-area insets are now paid in two places** (the chrome, and the body when the chrome is gone). That is a duplication with a reason, and it is stated in §3 so nobody consolidates it into a single rule that breaks one of the two states.
- **`back` gains a rule**, so the query's "not a back layer" status becomes "not an overlay, but back-aware". Worth watching if a third such state appears.
- **The Google half changes SKU**, which means a new relay endpoint, a new cost line, and a cost profile that is _worse_ than today's for a query that ends in a pick (§7). That is the price of pins and it is recorded as such.
- **`.map-badge.result`'s dashed grammar keeps its meaning in the list** and does **not** become the canvas's vocabulary — two different marks for the same population, in two places where they mean different things (the row says "listed, not yet ours"; the ring says "this is a candidate, and it is here").
- **The map extreme's status is explicitly unresolved** (§8) rather than implicitly reopened.

## The device pass, and what it owns

This ADR exists because a device corrected a measurement, so its own numbers are stated as models and the pass owns them:

- **The real keyboard heights**, per platform and per screen. The mockup uses 336/365/300px approximations at 390/411/360 wide; the _shape_ of the two models is what is settled, not the numbers.
- **Whether a ring reads as "not yours yet" over real cloud-styled tiles**, and whether N rings among the trip's own pins read as a **group** or as noise. Three at 28px is what was drawn; a busy query returns more.
- **Whether `＋` inside a 28px ring is legible at all** on a real screen, or whether the ring has to carry the glyph and the ring alone has to carry the meaning.
- **Whether a chrome-less map tab reads as "still in the app"** or as a modal that lost its way out — which is what §5's back rule is trying to answer in advance.
- **The real safe-area insets** on the owner's device, since §3's arithmetic is modelled at 24/24.

Everything above joins the existing tuning cluster on the backlog rather than being tuned separately, which is how these numbers drifted apart before.

## Build log (2026-07-28, session 161)

Built in two tiers, because tier 1 clears the ToS failure on its own and spends nothing:
**tier 1** is §1–§5 (frontend only), **tier 2** is §6–§7 (a new SKU, a new relay route,
rings on the canvas). Six things the build settled or changed from the design.

### The back rule already existed, and it is better than the one §5 specified

§5 said "one rule in `resolveBack`". There is no new rule: `useBackLayer` is the
mechanism, and `resolveBack` **consults it first** (`hasOverlay` → `close-overlay`). So
`resolveBack` is untouched and `nav-state` learns nothing about the Map tab — which is
strictly better than threading a `queryOpen` field into `NavSnapshot`, the coupling the
overlay stack exists to avoid.

One extension was needed and it is one line: `useBackLayer(handle, active)`. Every
existing caller is a component that expresses "there is something to peel" **by being
mounted**; the query field is a STATE of a screen that is always mounted, so registering
unconditionally would make `hasOverlay` permanently true and back would never leave the
tab. The flag gates the registration, not the handler.

### The place card's third occupant was NOT built, and that is §8 being honest

§8 said reopening the map extreme is conditional on a result tap raising the card. The
stop is still closed while a query is live (ADR-0131's session-159 reversal), so **the
card branch cannot be reached** — a ring tap instead selects its ROW and scrolls it into
view, which is ADR-0122 §7's rule read correctly ("the card exists exactly where the list
cannot show the row"). Building the card occupant now would have been dead code written
for a state that cannot happen. When the stop reopens, it is the work that reopens it.

**And that is what happened, two sessions later** (session 166): the owner asked for the
stop back, so the card occupant was built in the same change that reopened it — which is
the sequencing this entry was arguing for rather than a reversal of it. See §8's amendment.

### One search core with a corpus parameter, not a second hook

`usePlaceSearch` gained `{ enrichPlaceId, corpus, biasRef }`. The floor, the pause
debounce, the abort-on-keystroke, the `alreadyInTrip` dedup and the soft 429 are identical
across the two SKUs; what differs is the fetcher and whether a session token exists. A
second hook would have been the parallel copy ADR-0096 is about, and `PlaceResult` is a
`PlacePrediction` plus coordinates, so one result type serves both.

**The bias is a ref, deliberately.** As a value it would be an effect dependency, and a
camera idle would then **re-bill the query**. It is read when a request actually fires.

### `PlaceResearch` had to become presentational, and the SKU is what forced it

It owned the search. It cannot: the same results are now rings, and a component rendered
inside the sheet has no way to hand anything to the canvas. So the screen owns the search
and the add, and the file renders rows — which is what `ui/domain`'s own no-state rule
would have asked for anyway. Its test file split with it: the rows are asserted against a
stub `search`, and the moved behaviour (feeding the query, retiring it, the add) is
asserted in `Map.embedded.test.tsx`, where it now lives.

### The add got CHEAPER, which the design did not notice

§7 costed the search and stopped there. The **add** was still going through
`resolvePlace`, which spends a Place Details call to fetch the name, the address and the
point — all three of which the Text Search response already carried. `resolvePlaceSchema`
gained an optional `details`, and the service skips Google entirely when it is present:
one call for the search, **none** for the add. Dedup-before-spend, the trip scoping and
the server-side zone resolution are all unchanged. It is client-supplied data, at exactly
the trust level `createPlace` has always had for `lat`/`lng`.

### Two orderings worth naming

A result **already in the trip gets no ring** — it already has a pin, and a ring over it
would draw one place twice while saying the opposite thing about it. Its row says
`כבר בטיול`, which is the rule the picker has always run.

And the ring sits **below every trip pin**, ghosts included (`MAP_RESULT_Z`, named beside
`TIER_Z` because it is the same ordering question): what you already have outranks what
you might add.

### The test seam that keeps the design honest

`MapPane`'s stub keeps rings in **their own list**, not in `pins`. A test that found a
ring in `pins` would be asserting the thing §6 refuses — that "not ours yet" is a rung on
the prominence ladder.
