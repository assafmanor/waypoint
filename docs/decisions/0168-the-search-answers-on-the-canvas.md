# 0168 — The search answers on the canvas, the result mark stops borrowing the basemap's palette, and a second tap closes what the first opened

**Status:** Accepted — designed and **built 2026-08-06**, from a device pass on the Map tab's search and place card. Five reports from one surface, so they are one ADR. The rendered canvas has not been seen on a phone (ADR-0121 §13); what §2 claims about the two themes was seen in Chromium, against the app's own stylesheets, and is stated as that. **§1 amended 2026-08-07** (session 217) from field report #1 — a placeholder camera is not a view; see the amendment inside §1.
**Date:** 2026-08-06

**Amends** [0131](0131-map-search-is-a-control-not-a-screen.md) **§5** — "the camera does not answer the query" is narrowed, not reversed: a **keystroke** still moves nothing, a **settled response** does (§1).
**Amends** [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) **§6** — the ring keeps its silhouette and loses its palette and its `＋` (§2). Its device pass owed three readings; this takes two of them.
**Amends** [0134](0134-the-map-is-where-a-forms-place-comes-from.md)'s session-171 addendum — "tapping what is already selected commits it" stops being errand-scoped **for a ring** (§5).
**Amends** [0167](0167-the-badge-is-the-thumbnails-frame.md) **§11.1** — the research card's way back is no longer only the `‹ חזרה לפרטי המקום` button (§4).
**Amends** [0135](0135-a-place-becomes-an-event-or-a-booking.md) **§8** — the reveal's scroll animates (§3).
**Relates** [0028](0028-plan-violet-color-budget-dark-ready.md) (the hue budget §2 spends from, and why it is not a new hue), [0125](0125-map-canvas-terrain-vocabulary.md) (the terrain vocabulary whose POI colours §2 turns out to have been colliding with), [0129](0129-map-camera-moves-like-a-camera.md) §1/§2 (the pan-not-zoom rule §1 extends, and the cluster guard it reuses), [0121](0121-embedded-map-phase-6-design.md) §7 (the re-fit guard §1 deliberately does **not** reuse whole), [0147](0147-a-place-is-made-on-the-canvas.md) §4 (the form §5's shortcut skips), [0098](0098-index-motion-and-reveal.md) §4 (reduced motion).

Mockup: [`mockups/map-result-ring-v2.html`](../../mockups/map-result-ring-v2.html) — five candidate marks × two themes, drawn beside the trip's own pins **and beside a synthetic Google POI in the style JSON's exact colours**, which is what turned §2 from a taste argument into a finding. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

## Context

The owner used the shipped search and place card on a phone and filed five things:

1. _"When the map is fully open and the result isn't on the map — you just get no indication that something was found until you zoom out or open the list."_ With a proposal and an open question: pan to the results when they are in a relatively small zone, be careful not to pan too much while someone is still typing, and _"when the results are too spread out maybe we should zoom out and pan? Not sure… What do you think?"_
2. _"The `＋` in a circle sign for the results is not visually pleasing and feels out of place and amateur, especially in light mode. In dark theme it's better but we still need to find one design that looks good on both themes."_ And on the first draft of the redraw, which answered in greys: _"I'm not sure that black/white palette is the best choice for us. It looks out of place."_
3. _"We need an autoscroll animation for the list when selecting something. Right now it goes to the start of the card which is good, but it's a little confusing when it doesn't do the animation."_
4. _"When you select a place card from the list it expands to show more info, I need it to shrink back when clicking again."_ And: _"When you click on a place summary it expands to show more information, but to go back you must click on the little `חזרה לפרטי המקום` button. This is very inconvenient and easy to miss. I think that instead clicking anywhere on the card should go back to the place."_
5. _"Double clicking on a result `＋` should treat it like you've selected `הוסף למדף`, same way that it does when adding a place to an event/booking."_

**Two of the five are corrections to reasoning rather than to pixels, and that is the part worth recording.** Report 1 lands on a rule that was argued carefully and was right about the wrong event (§1). Report 2 lands on a mark that was designed against a full ladder of alternatives and never checked against the **basemap** it sits on (§2).

## Decision

### 1. A settled result set moves the camera — a keystroke still does not

ADR-0131 §5 kept `query` out of `cameraSignal` and gave two reasons. One holds and one does not:

- **"Every camera move is a per-frame ease, so re-fitting per keystroke is an animation restarting per keystroke."** True, and untouched.
- **"A chip is ONE DISCRETE ACT where a query is a STREAM — `ר`, `רמ`, `רמן`, each a legitimate set — so a camera answering it is the camera answering a keystroke."** This is the one that describes the wrong event. The **keystroke** is the stream. A **settled Text Search response** is discrete, and it is already gated by the min-chars floor of 3 and the pause debounce (ADR-0132 §7 made both load-bearing for cost). There are far fewer settled responses than keystrokes, and each one is a fact arriving, not a finger moving.

So the camera answers the **arrival of a result set**, through one pure function (`searchCameraTarget`) with four rules. Each rule is a guard against a specific bad move, and the owner's own worry — _"careful not to pan too much"_ — is the second one:

| State                                   | Decision                                | Why not something else                                                                                                 |
| --------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| No results                              | nothing                                 | The sheet's own state says so                                                                                          |
| **Every result already on canvas**      | **nothing**                             | **This is the anti-jitter rule**: consecutive settled queries in one neighbourhood move the camera not at all          |
| The extent fits at the zoom you are on  | **pan**, zoom untouched                 | Re-fitting would ZOOM for a set you could already have seen — ADR-0129 §1's "no unasked-for zoom", one population over |
| Wider than that, but still **one area** | **fit** (zoom out and pan)              | The owner's own proposal                                                                                               |
| Wider than `SPREAD_CAP_DEG`             | **fit the top-ranked result's cluster** | Fitting `דואומו` across four Italian cities is a country view of four specks — worse than the frame you had            |

**The answer to the open question is the last row, and it is a "no" to zooming out.** Widening until everything fits sounds symmetrical and is not: past a couple of hundred kilometres the set stops being an area, and a frame containing all of it contains nothing legible. Google already ranked the results, so the top one **is** the answer, and framing it among its own neighbours is `focusBoundsFor` (ADR-0129 §2) doing exactly the job its cluster guard was built for. That is also the case where `locationBias` (ADR-0132 §7) is already working for us: from a Milan view, `דואומו` returns Milan's first.

**What this deliberately does not reuse is `boundsFillView`.** ADR-0121 §7's dwarfed row re-fits a set that is on screen but small in it, and that is right for a **filter** — a deliberate act on a set you are curating, where tightening the frame is the point. A query is not that. "They are all on screen" is the whole of what a search is owed, and zooming in on them because they look small is precisely the movement report 1 asks us not to make. Two similar-looking tests, two different questions; the pure function says which is which.

Three smaller things the build settled:

- **Nothing happens before the map has a view.** There is no honest answer to "is this already on screen" without one, and the opening framing owns that moment (the `idle` retry). `framed` is marked when a search moves the camera, exactly as `reframe` does, so an opening fit landing a frame later cannot yank the camera off the answer the search just gave.

**Amended 2026-08-07 (field report #1): a view nobody framed is not a view either.** The owner reported the camera not answering the search _"while picking a place for a booking/event"_, and the errand turned out to be reading the same hook through the same pane — the gap was in what counts as "the view". A map is **constructed** with a camera: `defaultCentre` where there is a pin to prefer, and the whole world at `MAP_ZOOM.WORLD` where there is not. That placeholder is a `getBounds()` like any other, so the anti-jitter rule in the table above read it as a frame — and a world view contains every result, so _"they are all on screen"_ was true and the camera moved nothing, ever. It is session 134's trap one population over: there, a wide-open opening view made the fit's containment guard permanently true; here it makes the search's.

So `showResults` passes the view as `null` until something has actually framed the map, which is the reading `searchCameraTarget` already had for it (`framedSet` — the same one the opening fit makes) and the reading the `framed` ref already tracked. **Why the errand is where it showed** is the part worth keeping: you go to the Map to pick a place for your **first** booking, so the trip has no pins, so `points` is empty — and with no points the framing effect has nothing to fit and does not even register its `idle` retry, leaving the map on the world view for the rest of the visit. Two things follow, and neither narrows the rules above:

- **A rendered-but-unframed map still fits, an unrendered one still does nothing.** Bounds are what separate the two; only the second is the case the `idle` retry owns.
- **The deferred opening fit now stands down once anything has framed the map.** This bullet claimed `framed` already prevented the yank and it did not — nothing re-read the ref — and it is reachable: the search's own move fires the very `idle` a deferred opening framing is waiting on, so the day's pins would be fitted straight over the answer.
- **The effect is keyed on WHICH results these are** — the ids, joined — and not on the `results` array, whose memo key deliberately includes `selected`. Without that split, tapping a ring would re-move the camera.
- **The user still wins.** The ease already stands down when the camera is not where it last wrote (ADR-0129 §4), so a pan or a pinch mid-move is not fought.

### 2. The result mark was borrowing the basemap's palette, which is why no tuning of it worked

ADR-0132 §6 chose the ring against a full ladder of alternatives and got the **silhouette** right: shape is the free axis, "not ours yet" is a difference of kind, and a ring off the prominence ladder cannot collide with the amber cues, the selection outline or the dot tier. All of that stands.

What it never checked is the thing underneath. `design/map-styles/waypoint-map-day.json` styles Google's **own** points of interest — landmarks, entertainment, transit:

```
pinFillColor #c9ccd4 · pinGlyphColor #4b5568 · pinOutlineColor #ffffff
```

a grey disc, a white keyline, a dark slate glyph. **That is the shipped ring's palette.** `.map-result` was a `--card` (#ffffff) disc with an `--ink` (#16233d) keyline and an `--ink` `＋`: the same three colours, redistributed. So the result mark read as one more piece of **basemap furniture** rather than as one of the app's objects — and the owner's second note is exactly right that no re-tuning of greys could fix it, because the basemap owns the greys.

**And the same file explains the half of report 2 that looked like a contradiction.** At night that POI pin is `#414b61` on a `#191e2c` ground: much quieter, barely separated from its terrain. So the ring did not get better in dark mode — **its competition got quieter.** That is why "make the light one look like the dark one" has no answer: the construction is `--card` fill + `--ink` keyline, and that pair means "a chip of app surface" in light and "a hole in the map" in dark. One rule, two different statements, per theme.

**The redraw, three changes:**

- **The canvas's own marker grammar, inverted from the first pass.** A **fill**, a `--card` keyline at `.pin-b`'s own 0.06 ratio, and `.pin-b`'s own shadow — so it reads as an object **on** the map the way every pin does. The hole stays, as an `::after`, because the hole is the silhouette §6 spent its one free axis on; a plain disc would give it away and land next to the dot tier.
- **Teal — which is neither a new hue nor a borrowed one.** ADR-0028 reserves teal for **location and nothing else**, and the design language states the category palette is _"always pastel/muted, never amber or teal"_. Those two rules together are what make teal available here, and the argument is not aesthetic: a Google result is the one object on this canvas that is **only** a location — no day, no time, no commitment, and no category, because the mask does not buy place types (ADR-0115 §2) — and teal is the one hue a category pin is **forbidden from ever reaching**, so a sixth category cannot collide with it later. Nothing in either basemap is teal either (day greens #cfe0c9…#e4e9e1 over #b0c6d7 water; night #1e271b…#1f301c over #08121d).
- **The `＋` goes.** Two reasons, and the second is load-bearing. It was not legible at 28px on a phone — the third reading ADR-0132's device pass owed and could not take. And **it described the wrong gesture**: tapping a ring _selects_ it; the add is a labelled control on the row that tap raises. A `＋` on the mark promised the tap would add.

**Selection keeps the hue, and "it fills" had to be restated.** Session 166's owner call was that the selected result was not prominent enough, and a hollow ring's answer was to fill. The resting mark is now filled, so the fill is spent: selection **closes the hole**, goes to full `--pin-base` (dropping the 0.78 subordination while it is the subject), and takes the `--card` halo plus a teal glow — three changes on three axes, and no fourth colour. A selection that jumped to `--cta` was drawn in the mockup and rejected there: the selected mark then looked like a different kind of object than its own resting state, and the heaviest thing on the canvas besides.

### 3. The scroll animates, and the ring's copy of it is retired

The offset was already right — ADR-0135 §8 plus the 2026-08-05 owner call for the card's **top** — and the arrival was instant. So the list was simply somewhere else the next frame, with nothing saying a row had been brought to you. `behavior: 'smooth'`, and `motionDurationMs`'s own question (`prefersReducedMotion`) decides, because reduced motion keeps the move and drops the easing everywhere else in this app (ADR-0098 §4).

**And the ring tap had a second, quieter copy of that job**, aligning to `center` with its own `requestAnimationFrame` — so a ring tap and a pin tap put the same card in two different places, and only one of them animated. It goes through `showRowInList` now, which is where the deferred frame, the single-flight guard and the `start` alignment already live (rule 8: the one-off gets generalised, not duplicated).

**Amended 2026-08-20 — the animated scroll is CLAMPED, so the landing is WATCHED** (owner: _"when you're referred from a maybe/event/booking to the map, the map list doesn't scroll correctly to the place listing. The listing should be scrolled so that it appears opened on top. It doesn't"_ — and, the same day against the first fix: _"seems to be working except, and this is important cause it's a common case, when the map is not loaded yet"_).

`scrollIntoView` computes its destination **once, against the scroll extent that exists at the call**, and an arrival is exactly when that extent is still growing. Measured at 390×844 on a 4×-throttled cold load, one arrival from a dateless shelf idea: the extent went **303 → 359 → 615 → 641px** over the first second (the selected row opening, the list widening to all-days) and then to **666 a further second later**, when the offline-map notice above the split took 25px off the scrollport. Every aim before the last of those is short by whatever had not arrived yet, and nothing reads as wrong on the way: the row is selected, every rect is healthy, the scroller is simply somewhere else — `frontend/CLAUDE.md`'s _"reading a rect and calling it visibility"_ in its scroll form.

**The first fix waited out the row's own reveal and aimed a second time.** It was right about the mechanism and too narrow about the cause, which the second report is: with the map still loading, EVERYTHING is still arriving — tiles, the archive check's notice, the camera's first settle, a permission answer — and a fix that enumerates the suppliers of late extent will keep missing the next one.

So the aim is watched instead (`lib/land-at-top.ts`, `LANDING_WATCH_MS`), and the whole machine is two rules over a bounded window: **while the scroller is moving, leave it alone** — that is our own eased scroll, and re-aiming into a live one is how a correction becomes a crawl — and **while it is at rest, keep asking.** At rest does not mean landed: a clamped aim leaves no trace, and an aim can move _nothing at all_ while a surface is still sizing itself. An ask with nothing to do costs a layout read and no scroll, so repeating it is cheap; an ask that can finally act is the entire fix.

**The at-rest rule is the second thing this session got wrong, and CI found it.** The first version asked exactly once and then waited for the geometry to change — which is a bet that something will move again, and on a slow machine nothing does: Plan mode's day surface is a lazy chunk that mounts ~5s in under 6× CPU throttling, and its arrival's first two asks left `scrollTop` at 0 while the scrollport was still growing. Asking once was enough on every machine that was fast enough not to notice, which is the same shape as the reveal-only wait it replaced. Reproduce with `Emulation.setCPUThrottlingRate`, not with a faster box.

Two more rules are load-bearing: **a `pointerdown`, touch, wheel or key ends the watch** — past the first aim this is a correction, and a correction that overrules the person scrolling is worse than a landing 30px off — and the window is a **measurement**, not a feel call: 2.5s covers the 1.8s late notice plus the eased corrections themselves, and at 700ms the reveal case alone still fails.

What this retires: `revealsRunning`, the two frame budgets (`ROW_SCROLL_WAIT_FRAMES`'s wait for a row that is not in the DOM yet, and the reveal's own), and the loop that lived in `screens/Map.tsx`. One primitive owns all three questions, which is what made the second host free — the Day surfaces landing an event's card (ADR-0121 §8's amendment) is one line each.

Measured in `e2e/place-arrival-scroll.spec.ts` and `e2e/event-arrival-scroll.spec.ts`, with the state machine itself in `lib/land-at-top.test.ts`: jsdom has no layout and no scrolling, so a unit test can only assert that a scroll was ASKED for — which it always was.

### 4. A second tap closes what the first opened — and "the same thing again" has to mean it

Two reports, one rule. A tap on a row's body now has three readings, and **the order is the rule: the innermost state closes first.**

| Row state | A tap on the body |
| --------- | ----------------- |
| Expanded  | back to the place |
| Selected  | close the row     |
| Neither   | select it         |

- **Expanded → the way back.** `‹ חזרה לפרטי המקום` stays as the block's **named, focusable** control; what grows is the target. That is exactly what `PlaceKnowledge` already does when the whole summary block becomes tappable around `עוד ›` — _"the tap target grows; the accessible control does not move."_ So the expanded body carries **no `role`, no `tabIndex` and no label**: announcing it as a second button with the same name reads the way back out twice, which the first build of this did.
- **This gives the canvas card the same thing for free**, and it is why the handler is derived rather than gated on `onSelect`. The card passes no `onSelect` (its body is inert, ADR-0122 §7) and no close, but it does pass `onCollapse` — so an **expanded** card there becomes tappable to return and a collapsed one stays inert, with no branch about which host we are in.
- **The expansion goes with the selection.** It was already inert once the row was unselected, so nothing showed — but the id survived, and closing a row on purpose makes "re-select the same place, get its research card back" reachable in two taps.

**And the sharp edge, which the first build got wrong: a row can be selected by something that is not the row.** A pin tap and a ring tap only **pan** (ADR-0129 §1), so the row's own tap is the gesture that _frames_ — ADR-0134 §6, the one way to see a place you tapped on the canvas and then went to the list for. Reading that tap as "a second press" deleted it. So a row closes on the next tap **only once its own tap is what opened it** (`openedFromRow`), which also makes the whole sequence read as a sentence: ring → **pan**, row → **frame**, row → **close**.

Rows deselect; canvas marks commit (§5). That is not an inconsistency, it is ADR-0134 §3's own argument: a row carries its verbs in reach, and a mark on the canvas carries none.

**And this is the TRIP row only — a `ResultRow` deliberately does not close on a second tap.** It was built that way first, and an e2e spec refused it: `place-decide.spec.ts`'s _"asks once, for the place you tapped"_ taps the same result row twice and asserts the deciding card is **still there**, because the point of that test is that the enrichment is not re-fetched. Two reasons the spec is right and the extension was wrong, and neither is about the test:

- **A result row is one half of a row↔ring pair, and that pair's second tap is already spoken for** — on the canvas half it is the shelf (§5). Giving the list half a _different_ second-tap verb for the same object is the inconsistency, not the fix.
- **Closing it drops the ring**, which is the mark answering "which of these is it" on the canvas the search exists to draw. A trip row's card is the whole of that place's surface; a result's card is the smaller half of a pair.

Its ways out are unchanged and there are three: a tap on blank canvas, back, and selecting anything else.

### 5. The second tap on a ring is the shelf, because the reason it was errand-scoped was false

ADR-0134's session-171 addendum built exactly this gesture — _"tapping what is already selected"_, no timing window, no gesture machinery, the first tap still only selecting — and scoped it to an errand on the grounds that _"outside an errand there is nothing to commit to."_ **There is: the shelf**, which is where a result's add has always landed (ADR-0131 §11, and ADR-0147 §4's form submits into it as `הוספה למדף`).

So the gesture is one rule and the **context** picks the destination: `בחירה` under an errand, the shelf without one. That is `landPlace`'s existing branch reached by a second route rather than a second rule beside it, and it skips the naming form deliberately — the form is what `＋ אולי` on the row opens, and this is a shortcut through it, which is the whole point.

**Deliberately the already-selected tap and not a `dblclick`.** Session 171 already established that this is the gesture the owner means, and on this canvas a real double tap is taken: it is the step-zoom (ADR-0145 §2). A `dblclick` handler on a ring would fight it.

**And it stays a ring-only change.** A second tap on a trip **pin** outside an errand still does nothing, because a place already in the trip has nothing to commit to — the session-171 premise, which was only wrong about results.

## Alternatives considered

- **Keep the camera out of the query entirely and answer report 1 with a notice** ("3 results, off screen"). Rejected: the tab exists to show you where things are, and a label saying results exist somewhere else is the list's answer given on the canvas. It also leaves the `map` stop — the state the report was made in — as the one place the search cannot be seen.
- **Re-frame on every keystroke.** Rejected in §1; ADR-0131 §5's animation argument is unchanged and this is what it forbids.
- **Reuse `cameraTargetFor` wholesale** (containment **and** `boundsFillView`). Tempting — one function, no new rules — and wrong in one direction that matters: it zooms in on a set that is already on screen, which is the unasked-for move ADR-0129 §1 removed from a pin tap. §1 states the distinction rather than sharing the code.
- **Zoom out until a scattered set fits.** The owner's own tentative suggestion, rejected in §1's last row with the reason stated: four specks on a country view is not an answer.
- **Tune the shipped ring's greys** (lighter keyline, softer shadow, a bolder `＋`). Rejected in §2, and this is the alternative the finding kills: the palette is the basemap's, so every tuning of it lands somewhere in Google's own POI family.
- **A neutral `--muted` donut** — the right shape in the same wrong family. Drawn in the mockup as candidate B and rejected there, beside the synthetic POI, which is what makes the collision visible rather than argued.
- **The dark inversion** (`--ink` fill). ADR-0132 rejected it on paper for out-ranking the trip's own pins; redrawn as candidate E because A-in-dark _is_ a dark inversion and the owner reports that one as better. It out-ranks everything in both themes, so the paper rejection survives contact with the render.
- **A category hue for the ring.** Rejected, unchanged from ADR-0132 §6: the mask does not buy place types, so there is nothing honest to colour it by — and teal is available precisely _because_ it is not one of them.
- **Amber or plan violet.** Rejected by ADR-0028's budget: amber is time and commitment, violet is Plan mode, and a search happens in both modes.
- **Keep the `＋` and enlarge the ring to make it legible.** Rejected: the glyph names a verb the tap does not perform, so making it more legible makes it more wrong.
- **A `dblclick` on the ring for §5.** Rejected: the canvas's double tap is the step-zoom.
- **Toggle the row on ANY second tap**, ignoring what opened it. Simpler by one piece of state, and it deletes ADR-0134 §6's framing gesture (§4). This is what the first build did, and one existing test caught it.
- **`aria-label` on the expanded body** so it stays an announced button. Rejected in §4: two controls with one name.

## Consequences

- **`cameraSignal` is no longer the only thing that moves the camera on this tab**, and the second mover is a settled network response. `MapCamera` has five verbs now (`focus`, `frameOn`, `reframe`, `showResults`, `locate`), all through the one eased driver ADR-0129 §3 requires.
- **Two new numbers join the device-pass cluster** (`MAP_SEARCH_CAMERA.SPREAD_CAP_DEG` / `FITS_AT_ZOOM_SHARE`), and they are the ones this ADR is least able to settle on its own: how much unasked-for movement reads as helpful rather than as a headache is exactly what a phone answers and a mockup cannot.
- **The result mark now spends from the teal budget**, so `design-language.md`'s teal entry names it. The rule that guarantees this is safe — the category palette may never be teal — is now load-bearing in a second place, and is stated as such.
- **The ring's markup is empty.** Its name lives in `aria-label`, where it always did, and the hole is CSS. A future glyph on it would have to answer §2's question about which gesture it describes.
- **`showRowInList` is the only place that scrolls a row into view**, at one alignment, with one animation policy. That is one fewer parallel copy on this screen and the third such collapse here (ADR-0078/0094/0095's shape).
- **The row's tap is a three-way decision**, and it now depends on **how** the selection was made. That is one more piece of screen state (`openedFromRow`) and it is the price of keeping ADR-0134 §6; if a third origin ever needs a different reading, this is the place that has to say so rather than a fourth branch at a call site.
- **The `אין מקומות באזור` readout is untouched, and it is now visibly odd during a search**: it counts _our_ places in view (ADR-0126 §5's area sort depends on that), so it can say "no places in the area" over three teal rings. Named here rather than quietly changed — the readout's meaning is a decision, and the pan is what the report actually asked for.

## The device pass, and what it owns

- **Whether the teal mark reads as ours over real cloud-styled tiles**, and whether N of them among the trip's own pins read as a group or as noise. ADR-0132's first two owed readings, still owed: the mockup draws the style JSON's colours, not Google's render.
- **The two camera numbers**, and the feel of the three branches — especially whether the `pan` case wants the results centred or offset above the sheet.
- **Whether the smooth scroll survives the sheet's own height animation** on a real device, in the one case they overlap (a row tap from `full`, which drops the sheet to `half` and scrolls inside it in the same frame).
- **Whether "tap again to close" is discoverable at all**, or whether the row needs a resting cue that it can be closed.
