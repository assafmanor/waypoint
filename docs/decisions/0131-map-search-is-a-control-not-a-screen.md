# 0131 — The Map tab's search is a control, not a screen: the query takes the row, and the tab becomes where a place is found **or made**

**Status:** Accepted (design) — authored 2026-07-28 (session 157). **Paper only: the build is pending.** The rendered canvas has still not been seen (ADR-0121 §13) and nothing below claims otherwise; the closing sections name what was measured against a renderer and what was not.
**Date:** 2026-07-28

**Amends** [0101](0101-index-search-mode-and-header-titles.md) — the Map tab stops using `SearchOverlay` **in both modes** (§1, §8). The primitive is unchanged, gains no variant, and keeps the Index.
**Amends** [0122](0122-map-split-controls-over-the-canvas.md) **§1/§2** (the controls row's disclosure slot gains a second occupant) and **§7** (its sheet-normalisation rule runs in a fourth case, and for the first time in both directions).
**Amends** [0115](0115-plan-mode-place-research.md) **§6** — "Plan mode only" is withdrawn: the Google half is available in **both** modes, behind the arm §1 of that ADR already designed. This is the "own ADR and own cost line" §6 demanded (§8).
**Amends** [0121](0121-embedded-map-phase-6-design.md)'s session-148 **§5** (`＋ הוספת מקום` becomes an errand to this tab with a return path, §10) and **§8**'s canvas-tap grammar (a long press is a second canvas gesture, §9).
**Relates** [0120](0120-filter-reveal-is-shared-infrastructure.md) (the reveal the query rides), [0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) §5/§6/§7, [0129](0129-map-camera-moves-like-a-camera.md) §3 (the ease that decides the camera call), [0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §1 + [0130](0130-a-maybe-is-not-a-past-place.md) §3 (the ladder the matches compose with), [0090](0090-back-is-computed-from-nav-state.md) (the sanctioned nav-state extension §10 takes), [0112](0112-place-in-trip-is-referenced-not-cached.md) (why a dropped pin must also create a reference), [0125](0125-map-canvas-terrain-vocabulary.md) §6 (the POI tap a long press must not collide with), [0119](0119-map-maybes-facet-is-the-shelf.md) (a filter must not hide that it is filtering).

Mockup: [`mockups/map-search-v1.html`](../../mockups/map-search-v1.html) — the real layout tree, the shipped stylesheets, **both** surfaces drawn (the one being retired and the one replacing it), and the first mockup in this epic to draw the on-screen keyboard. Its entry in [`design/mockups.md`](../design/mockups.md) carries the detail.

## Context

Report #18, third pass: **search should overlay the map, not replace it.** The Map tab's search is `SearchOverlay` — ADR-0101's full-screen `Modal` `'full'` variant, shared with the Index — so it **covers the canvas completely**. On the one tab whose question is _"where is this?"_, the answer renders as a list with the map hidden.

**Session 145 traced this wrong, and the wrong trace is why the phase looked cheap.** It reported the defect as "`query` reaches `searchRows` only; `pinsNow` never sees it and `cameraSignal` omits it, so typing changes the list and the canvas does not move." Every clause is true, and it describes a symptom **nobody can observe** — the canvas is not on screen while you are typing. Pin-syncing is a consequence of the real job. The real job is the **surface**.

Three things were newer than the phasing note and each moved the arithmetic:

- **The chrome budget has been spent since** ([ADR-0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md)). The note's best candidate was "make the query just another list-changing control in the row", written when the row held three controls at rest. It now holds `כל הימים`, the facets button, a conditional `מסלול היום בגוגל` link and the search button — plus a separate 44×44 furniture band carrying two camera controls and the `באזור` sort pill.
- **Camera motion is ours** ([ADR-0129](0129-map-camera-moves-like-a-camera.md) §3). Every move is a hand-rolled ease, `moveCamera` once per frame, one duration. Re-fitting per keystroke is a per-frame animation restarting per keystroke.
- **The pin ladder grew** ([ADR-0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §1, [ADR-0130](0130-a-maybe-is-not-a-past-place.md) §3). Six tiers, two amber cues, selection, and a zoom-keyed dot degradation. There is no free axis for a "this one matched" mark.

### The owner's correction, and why it doubled the phase

A first draft of this ADR answered the report and stopped — it moved the query onto the canvas and **scoped the paid Google half away as a Plan-mode concern**. The owner rejected that in three sentences, and each one names something the draft had turned into a scoping decision instead of designing:

1. **"There are actually two modes of searching: places on the map and places from Google Maps."**
2. **"How does adding places from events/bookings work with this?"**
3. **"Adding a place by long clicking on the map."**

**All three are about _adding_ a place, not finding one, and together they say the draft had the wrong subject.** The draft asked _which mode gets which search surface_. The real question is _where does a place come from_, and the answer is three sources with one destination — which is a property of the **tab**, not of a mode. §8, §9 and §10 are the three answers, and §11 is the composition they make.

The draft's Plan-only scoping was wrong on its own terms, too. `＋ הוספת מקום` is reachable from a placeless booking **in Trip mode** (ADR-0121's session-148 amendment), so "adding a place is Plan mode's business" was never true of the app as shipped.

### What the mockup measured, and what it killed

The controls row's spare inline width **at rest**, read off the real tree:

| Screen · mode          | Resting occupants                       | Spare       |
| ---------------------- | --------------------------------------- | ----------- |
| 390 · Trip · day scope | scope · facets · search                 | **163.5px** |
| 390 · Plan · day scope | scope · facets · **day route** · search | **12.8px**  |
| 360 · Trip · day scope | scope · facets · search                 | **133.5px** |
| 360 · Plan · day scope | scope · facets · **day route** · search | **−17.2px** |

A usable text field wants ~150px. **So the phasing note's leading candidate is dead, and only a measurement says so** — in Plan mode + day scope, where the free whole-day directions link rides along (ADR-0122 §2), the row has 13px at 390 and **already overflows at 360**. A permanent query field was never available there.

But the row's own shape answers it anyway, and that is the design.

## Decision

### 1. The query does not join the row. It **takes** the row — the second occupant of a disclosure slot that already exists

`סינון` already replaces the row's contents in place with a pinned `✕` at the fixed end (ADR-0122 §2). **The query is the second occupant of that same slot, not a second mechanism.** One state with three values — nothing open / facets / query — so the row can never hold both, and the `✕` is one control whose label names whichever is open.

- **The field is 44px inside a 46px row** (`calc(var(--map-controls-h) - 2px)`). That is design-language's touch floor met **by geometry** — the point ADR-0126 §3 had to make about the furniture band — and the split pays **nothing**: the row is already there and already floats over the canvas. `MAP_CONTROLS_H` stays 46 and `MAP_FIT_PADDING.top` stays derived from it at 118, so the camera reads the same number it reads today.
- **It is the one member of this row that carries a fill.** ADR-0122 rejected "a scrim or a card background" for the row and that stands: the row **at rest** is unchanged and still shows the map between its chips. A text field with no ground is not a text field, and this one is transient. Its fill is the Index's own field treatment, so search reads the same wherever it happens.
- **The `✕` clears and closes in one act**, so there is never an active filter you cannot see — the defect ADR-0119 exists to prevent. While the field is open **its own text states the filter**, which is why it needs no collapsed summary the way `סינון` does. Closing it also ends the Google half's session (§8).
- **The scope chip is not in the row while the query is open, and that is coherence rather than loss.** Search is scope-blind **by rule** (the Index's rule, ADR-0102), so `כל הימים` is precisely the control that has nothing to say here. It is the same reachability trade ADR-0122's build log recorded for the facet strip, with a reason this time.
- **The query is view state of the tab**, like the day scope and the sheet's height — so it survives a selection, a drag, and the screen you read after the keyboard closes. It does not persist to storage.

### 2. The keyboard is why ADR-0101 killed search-in-place, and here it is the argument **for** it

ADR-0101 §1, verbatim: _"once the on-screen keyboard opens it covers most of the remaining screen, hiding almost every result. There was no room in that design for the keyboard at all."_ That is true, and it stays true — **there**.

**The difference is where the results sit relative to the field.** On the Index they are **below** it, so the keyboard eats them. Here the field is at the top of the split and the canvas is **directly under it**: the keyboard eats from the bottom, so what it takes is the **sheet**, and what survives is the **pins** — which is exactly what this phase exists to put on screen. That is the inversion of ADR-0101's failure, not a repeat of it.

**Measured in the mockup**, 390×844 at `half` with an approximated 336px iOS keyboard: the keyboard's top edge sits at 945 against a pane bottom of 894, so **the whole 250px canvas is still on screen**, plus ~51px of the sheet's top row. Against **0px** today, at every stop and every screen.

This is the first mockup in this epic to draw the keyboard at all, which is worth stating: the element that overturned ADR-0100 §3 had never been on a page.

**And it is the one place §8's Google half pays for this layout**, honestly: its results are rows in the sheet, so they are exactly what the keyboard covers. That is stated rather than hidden — dismissing the keyboard is one tap on the canvas, the query survives it (§1), and a paid result you cannot see is at least a paid result that is still there.

### 3. The matches are not marked. They are **what is left**

The prominence ladder is full: six tiers, two amber cues as `box-shadow` on `.pin-b`, selection as an `outline` deliberately shaped to compose with them, and a zoom-keyed dot degradation. A third spread axis would collide with both of the first two.

**So there is no match cue, because a query is a filter** — like every other control in that row — and the matches are the pins that **remain**. Zero new pin vocabulary, zero new rung, zero collision. It is also what the canvas already does: `pinsNow` runs `matchesPlaceFilter` over `allUsages` and drops what fails, ghosts included, on ADR-0121 §9's own reasoning that "a type chip means the same thing on both halves".

One consequence to state rather than discover: **a query can remove the `עכשיו` pin.** That is already true of every category chip, so it is consistent rather than new.

### 4. A match the day scope did not choose keeps its paint and loses the subordinate ratio

**The trap, and it is real.** `searchRows` filters `allUsages` — the whole trip, because search is scope-blind — so in day scope a match from another day is already `ghost`, hence also `aside`: smaller, excluded from the camera by `isFramedByCamera`, and degraded to a numberless dot at wide zoom. The thing you searched for arrives on the canvas **wearing the paint that means "not what you are looking at"**.

**The answer is ADR-0130 §3's own split, one axis over:** _"the paint says what it is and the size says how much it is claiming."_ Under a live query:

- **The paint stays.** A ghost stays hollow, which reads _another day_ — true, and the answer to the question you need answered when your search found something from Friday. Promoting it to a full category pin would make it claim to be part of this day and would throw that away, which is why it is rejected outright.
- **The `aside` ratio comes off.** `aside` is the subordinate size both out-of-scope populations take, and the reason it is subordinate is that _the day scope did not choose this place_ (ADR-0130 §3's own words). Under a query the day scope is **not** what chose the set. So the ratio is wrong even though the paint is right.

**That one clause reaches three things, because all three read the same predicate:** the ratio itself, the **dot tier** (keyed on `.aside` in day scope, ADR-0128 §1's session-155 amendment), and the **camera** — `isFramedByCamera` is `!isAsidePin`, so the `frame` control frames the matches including the out-of-day one **with no change to the control**.

**And it deliberately does not reach two others.** ADR-0130 §3 named that predicate for five call sites and said naming the reason is what kept the split from being five silent behaviour changes; this phase reaches three of them and says which:

| Call site               | Query-aware? | Why                                                                                                      |
| ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| the `aside` ratio       | **yes**      | the query chose this set, not the day scope                                                              |
| the dot tier            | **yes**      | it keys on `.aside`; falls out                                                                           |
| the camera's fit        | **yes**      | so `frame` frames what you searched for                                                                  |
| the **amber-cue guard** | **no**       | `עכשיו`/`היעד הבא` are claims about **time**. A pin from a day you are not looking at must not make one. |
| the **day connector**   | **no**       | the shape of the day is the shape of the day. A Friday match is not on Wednesday's route.                |

**So `isAsidePin` is the wrong hinge and the obvious build is the wrong build.** Writing this as "make `isAsidePin` query-aware" would change five behaviours silently, two of them wrongly. `PinContext` takes one more optional flag the way it took `planning` (ADR-0130 §1: the screen decides, the lib takes the answer), `PIN_TIER_CLASS` splits into the paint it already is plus an `aside` the caller appends, and the amber guard and the connector keep reading the tier alone.

**One thing follows for free and should be stated so it is not read as a bug:** `X באזור` follows the query, because `areaCount` counts `pins` and the query filters `pins`. The readout keeps its exact promise — how many of our places are around here — over the set the controls actually left.

### 5. `query` is **not** in `cameraSignal`, and the reason is not ADR-0126's reason

ADR-0126 left `areaSorted` out of `cameraSignal` because a list-ordering intent does not move the camera. A query is not that: it is a **filter**, and every other filter in that row **is** in the signal. So it needs its own reason, and it has two.

- **The ease is ours** (ADR-0129 §3). Every camera move is a hand-rolled per-frame interpolation with one duration. Re-fitting per keystroke is an animation restarting per keystroke.
- **And that is a definition, not just a cost.** A chip is **one discrete act**. A query is a **stream**: `ר`, `רמ`, `רמן`, each a legitimate set. A camera answering a stream is not "the camera answers a control" (ADR-0121 §7) — it is the camera answering a keystroke. That is what distinguishes the query from every other control in the row, and it is why it stays out of the array. **Deliberately out, not accidentally out**, which is what the phasing note asked for.

**Two existing controls already reach a match, and neither is new:** `frame` frames what the filters left, so it frames the matches by way of §4; and the card's badge frames one place with its surroundings (ADR-0129 §1). No debounce, no submit, no second timing mechanism on a surface that has one.

**Three arrivals DO move the camera, and all three are discrete acts rather than keystrokes** — a Google pick (§8), a dropped pin (§9), and an assignment errand's own landing (§10). Each goes through `framePlace`, the spend-once path ADR-0129 §1 already built for an arrival from `מפה`. So the rule is cleaner than "the query never moves the camera": **typing never moves it; committing to a place always does.**

**The honest limit, stated because it rests on how this reads rather than on how it computes:** if every match is off-screen, the canvas does not move and that can read as "the map does not answer". **The lever if it does** is named in advance — add `query` to `cameraSignal` behind a debounce — and the question goes to the device pass rather than being asserted here.

### 6. Opening search normalises the sheet to `half`, from **either** extreme

- **From `full`**, because the canvas is the half the report is about.
- **From `map`**, because the list holds **what the canvas cannot pin** and **what a pin cannot say**: a coordless Place-lite match has no pin at all (`pinsNow` skips it, which is one of ADR-0121 §5's reasons the sheet always peeks), a ghost's _day_ is stated in its row rather than on its teardrop, and — after §8 — **every Google result is a row with no pin until it is picked.**

**This is ADR-0126 §7's rule in its fourth case** — a canvas control whose answer lives in the list normalises the sheet — and the first time it runs in both directions. Its three existing cases are a row tap (ADR-0122 §7), the area sort, and a locate that cannot deliver; ADR-0122 §6 ran the mirror image for the pre-prompt, dropping the sheet from `full` because "a question about a map you cannot see lowers the sheet enough to see it". Here the answer is in both halves, so both extremes move to the one stop that shows both.

**It fires on the open tap, never per keystroke.** A sheet that moved while you typed would relayout the canvas under a typing finger — the one thing ADR-0121 §5 shaped the stops to avoid. A drag to `map` **while** a query is live is left alone, because it is deliberate; the field's match count is then what says four matches exist where two pins are visible.

**At `full` the query field is the list's search field**, which is right rather than a gap: ADR-0122 §1 already makes the row read as the list's own header at that stop, and a user at `full` asked for a list. Nothing about §6 sends them there — it only brings them back.

### 7. Reuse or fork: the Map **withdraws**, and nothing new is overlay-shaped

Root `CLAUDE.md` rule 8 forces the question, and the answer is neither of the two it names.

- **`SearchOverlay` gains no variant and loses no line.** It keeps the Index.
- **The Map tab simply stops using it**, because what replaces it **is not an overlay at all** — it is the controls row's own in-place disclosure plus the sheet that was already a list over a map. That is a **withdrawal**, not a fork, and there is no second overlay beside the first.
- **What is generalised is the slot**, not copied: one boolean becomes one three-valued state (ADR-0095's named-constant rule), so the next thing that needs to take that row is a value rather than a mechanism.

**The CSS delta is two text fields and two re-coloured controls.** `.map-querystrip` (§1) and the dropped pin's name field (§9); `.map-arm`/`.map-addmaybe` move off `--plan` (§8). No new component and no new host: §8's Google half is the shipped `PlaceResearch` re-parented, §9's naming step is the shipped `.map-placecard`, §10's banner is the shipped `StatusBanner`, the `✕` is the shipped `.map-facets-close`, and the list's motion is the shipped `revealRows` + `RevealList` (ADR-0120) — the two-line adoption that ADR promised.

### 8. Two corpora, one control, two surfaces — and the Google half moves into the **sheet**

The owner's first correction. There genuinely are **two searches** on this tab, and the difference between them is not a mode — it is **whether the thing you are looking for has coordinates yet**:

|                    | The trip's own places                     | Google                                |
| ------------------ | ----------------------------------------- | ------------------------------------- |
| Corpus             | places already referenced by this trip    | places not in the trip                |
| Coordinates        | **already held** (it is what pinned them) | **none** until the pick (ADR-0115 §2) |
| Cost               | **zero** — pure derivation                | **paid**, per session + per pick      |
| Live per keystroke | yes                                       | only once armed, pause-gated          |
| Can be pins        | **yes**                                   | **no** — nothing to draw              |
| Surface            | pins on the canvas **and** rows           | **rows in the sheet**                 |

**So the free half goes on the canvas and the paid half goes in the sheet, and the reason is the coordinates rather than the money.** That is the whole shape, and it makes ADR-0115 §1's _"one control, two halves"_ true for the first time on a surface that has a map: one query field feeds both, the trip half filters live, and the Google half is armed by intent underneath.

- **`PlaceResearch` is re-parented, not rewritten.** It already takes only `query`/`usageIndex`/`offline` and renders `.map-research` — a `מגוגל` group header, the arm card, skeletons, `StatusBanner`s, result rows with `＋ אולי`. It was surface-agnostic by construction (ADR-0115 §7's reuse audit), so moving it from `SearchOverlay`'s children into `.map-sheet-scroll` is **a host change and nothing else**.
- **The sheet is where a list belongs**, and it is on screen: §6 normalises to `half` when search opens, so the trip's matching rows, the arm, and the Google results share one scroll region under one query. The `מגוגל` header is the boundary, and `בטיול` already exists as its peer (`t.map.research.tripGroup`).
- **The arm is unchanged and it is the whole cost control.** No paid call fires until an explicit tap, the session is per **search session** rather than per overlay (closing the disclosure retires the token, exactly as closing the overlay does today), and once armed the behaviour is the picker's — min-chars floor, pause-gated debounce, one session token, dedup-before-spend. `usePlaceSearch` is untouched.
- **A picked result becomes a pin immediately**, because the pick is what resolves coordinates: `＋ אולי` creates the uncategorised idea (ADR-0115 §3), the reference is what makes the place "in the trip" (ADR-0112), so the row flips state and a pin appears on the canvas in the same pass. The camera frames it once through `framePlace` (§5). **That is "see where it is" without a single extra call** — which is the part of Phase 6a's problem this ADR can honestly close, and §12 says which part it cannot.

**Two things drawing this in Trip mode produced, neither of which was in the reasoning:**

- **`.map-arm` and `.map-addmaybe` are painted in `--plan`, and that becomes a rule violation the moment they render in Trip mode.** `tokens.css` says it outright — `--plan` is the "plan-mode accent, plan/builder actions only" and `--cta` is the "neutral primary button; amber/teal/plan are semantic, never CTAs" — which is root `CLAUDE.md` rule 4. The violet was **legitimate** while ADR-0115 §6 kept research Plan-only; on a Trip-blue surface it is mode identity used as a button colour. **Both move to the neutral `--cta`**, so Plan mode loses a violet it should not have had on a control and nothing else about either changes. This is the whole reason to draw a surface against the shipped stylesheets: a colour-budget violation shows up as a colour rather than as a claim.
- **The `מגוגל` group sits _below_ the trip matches, and the ordering works for the case that needs it.** At `half` the sheet's viewport is ~266px against ~82px a row, so with several trip matches the arm is below the fold. That is the case where you have probably already found what you wanted. When there are **no** trip matches — which is exactly the state you are in when adding a place that is not in the trip — the arm card is the first thing on screen. Stated so the scroll is a consequence rather than a discovery.

**ADR-0115 §6's "Plan mode only" is withdrawn, and this is the ADR it asked for.** §6's reason was that Trip-mode research "would put a paid call on the one surface people use while walking around", and that it "earns its own ADR and its own cost line". Three things answer it:

1. **The arm is exactly the control that makes the worry not bite.** Walking around and typing costs nothing; the first paid call is a deliberate tap, and the same rule the tab already applies to the geolocation permission (ADR-0109 §6).
2. **The app already contradicts the scoping.** `＋ הוספת מקום` on a placeless booking is reachable in Trip mode (ADR-0121's session-148 amendment) and it opens a **paid** Autocomplete picker there today. Trip mode has had a paid place search since that shipped; what it lacked was a map.
3. **The SKU worry is unchanged and untouched.** §6's "different query shape on a different SKU" was about **nearby / open-now** discovery ("what's open near me right now"). This ADR does not add that. It is the same Autocomplete relay in both modes, which is why it needs no new cost line beyond the wider surface.

**What genuinely widens, stated plainly for the owner rather than buried:** the number of surfaces from which a member can arm a paid session goes from one to two. The bounds do not change — `PlacesThrottlerGuard` per member·trip, the Phase-0 budget alert and the daily quota cap (ADR-0108 §5/§6) are all per-member and per-trip, not per-surface. **If this is not wanted, the lever is one boolean** (`research = mode === 'plan'` as it reads today), and everything else in this ADR is unaffected.

### 9. A place can be **made**, not only found: a long press on the canvas drops one

The owner's third correction, and it is the only add-a-place route that **spends nothing at all**.

- **The gesture is a press-and-hold on the canvas background** — not on a pin, and not on one of Google's own POI icons, which already arrive as clicks carrying a `place_id` and are a different act (ADR-0125 §6). ADR-0122 §7's canvas tap keeps its job (clear the selection), so the two gestures are distinguished by hold rather than by target, which is what a map affords.
- **It yields a `LatLng` and nothing else** — no name, no `googlePlaceId`, and **no reverse geocode**, which is paid and deliberately skipped (the phasing note's own call). So the place arrives **nameless**, and naming it is the confirm.
- **The naming step is the place card, which already exists.** ADR-0122 §7 made `.map-placecard` the host for "the row, wherever the sheet cannot show it"; a pin that does not exist yet is the sharpest case of that. The card renders with a name field in place of the name, the coordinates as its meta, and two buttons. Nothing new floats — and ADR-0126 §1's one-floating-object rule already governs the slot.
- **Dropping must also create a reference**, because ADR-0112 makes a `Place` with no reference cache-only and unlistable: the write is one pick-shaped act ending in the uncategorised `MaybeItem` that `＋ אולי` already creates (ADR-0115 §3), so the new place lands on the shelf and in the list with its `על המדף` tag. Unless an assignment errand is pending, in which case it lands there instead (§10).
- **The camera frames it once** through `framePlace` (§5), so the pin you just made is the pin you are looking at.
- **Offline it is absent, not disabled** (ADR-0121 §11's rule): there is no canvas offline, so the gesture has nowhere to happen.

**Two things the build must not take for granted, both of them rule 8's escape hatch:** ADR-0121 §5 already set the policy for exactly this question — the shelf's `useHoldToDrag` is a hold-gated pointer-capture hook, and whether it extracts cleanly for a canvas long press is a **build-time check, and if it would mean a substantial refactor of the shelf's drag, ask first** rather than silently taking it on or silently writing a second one. And a long press over Google's own tiles competes with the map's built-in gestures (pan starts on move, and some platforms raise their own context menu), which is a **device-pass** question, not a paper one.

**What this ADR does _not_ settle, and Phase 6b still owns:** the `@@unique([tripId, googlePlaceId])` nullable assumption (several coordinate-only places must coexist — verify), and whether the write reuses `saveNameOnly`'s path with coordinates attached. Those are data-model questions with no design content, and they are on the backlog with the phase.

### 10. `＋ הוספת מקום` is an **errand to this tab**, and the return is one sanctioned rule

The owner's second correction, and the place where a first draft of this ADR reached for a reason not to build.

The ask (session 148, recorded on ADR-0121 §5): _"`＋ הוספת מקום` should open THIS overlay and return to where it was invoked from. Adding a place is a spatial act and deserves the map, not a list sheet."_

**The draft's answer was that a navigation would need a remembered return target, which ADR-0090 forbids. That overstated the constraint.** ADR-0090 bans reading the browser history stack and `navigate(-1)`; its own Alternatives explicitly names the extension point: _"If a future behavior ever needs remembered history … that memory is added as explicit app state feeding the snapshot — a localized, additive change to the provider + one rule in `resolveBack`, still never touching the triggers, the executor, or the browser history stack."_ An errand is that, exactly.

**And the mechanism already exists, one field narrower.** `MapScopeProvider` sits just above the trip Shell precisely so "the surfaces that need to talk to the tab can", and `useShowPlaceOnMap` already hands over a `focusPlaceId` and lands on the tab through `tabTarget('map')` with `{ replace: true }`, consumed once so a later visit cannot re-fire a stale intent. **An assignment errand is the same hand-over with a return address**, so it extends that provider rather than adding a second cross-surface channel.

- **The errand:** `{ target: booking | event | the coordless place itself, returnTo }`, set by the invoking affordance, consumed once by the Map tab.
- **The Map tab says what it is doing.** A `StatusBanner` at the head of the sheet's scroll region, naming the target **in the reference's own words** — `eventEdgeTransition` / `shortTitleText`, the same vocabulary ADR-0121 §8's way-in entries use — with `ביטול` beside it. `ui/feedback`, never a bespoke shell (ADR-0078).
- **The destination of a pick changes, and nothing else does.** While the errand is live, choosing a place — a trip row, a Google result, or a dropped pin — assigns it to the target instead of shelving it, then runs the return. **Three sources, one destination**, which is §11.
- **The return is a navigation to `returnTo`**, `{ replace: true }` through `tabTarget`, and `ביטול` and back both run it too, so there is exactly one way out. Cancelling clears the errand and assigns nothing.

**Why the map comes to the tab rather than the tab's map coming to the picker.** A canvas inside `PlacePickerSheet` was the alternative that needs no nav change at all, and it loses on two counts: a second live `google.maps.Map` is a **billed** map load (ADR-0121 §4 — one instance per tab visit), and it would be a small canvas over a small sheet, which is the exact failure ADR-0122 spent a session undoing. Reusing the tab's single instance costs nothing and gives the full canvas, the pin ladder, the camera and both corpora.

**One cost this ADR will not hide.** `BookingDetail` is a `Modal` opened from `IndexBookingsView`'s local state, not addressable by URL — so returning to it needs the same hand-over-and-consume-once pattern in the other direction (the Index opening a detail on arrival). That is a **third** consumer of a pattern the app already runs twice (`focusPlaceId`, and `BookingSheet`'s `seed`), and generalising the pair into one named errand channel is the right build (rule 8), not three copies. It is the largest single piece of work in this phase and it is named as such rather than discovered.

**So ADR-0121 §5's interim ends with an answer rather than an expiry:** `PlacePickerSheet` stays the picker for **in-form** use, where there is no map and none is wanted; `＋ הוספת מקום` on a placeless row becomes the errand above.

### 11. Three sources, two destinations — one table, so the composition is not re-derived

|                    | Trip's own places | Google (armed)            | Long press on the canvas |
| ------------------ | ----------------- | ------------------------- | ------------------------ |
| Cost               | free              | **paid** (session + pick) | **free**                 |
| Where it renders   | pins **and** rows | rows in the sheet         | a card on the canvas     |
| Has coordinates    | already           | on the pick               | immediately              |
| Needs a name typed | no                | no                        | **yes**                  |
| Offline            | works             | absent (ADR-0115 §5)      | absent (no canvas)       |
| Camera             | `frame` / badge   | `framePlace` on the pick  | `framePlace` on the drop |

**Destination, and it is the errand that decides it, not the source:** with no errand live, a new place goes to the **shelf** as an uncategorised `MaybeItem` (ADR-0115 §3, unchanged, including its toast and undo). With an errand live (§10), it is **assigned to the target** and the tab returns.

That single rule is what keeps three sources from growing three flows.

### 12. What this phase does not do, and to whom it belongs

- **Phase 6a's cost decision is untouched.** §8 closes the part of "search needs a map" that costs nothing extra: a **picked** place is on the canvas immediately, because the pick already pays for coordinates. What 6a still owns is whether a prediction can be **previewed** on the map before the pick — which needs a Details call against a Pro-tier mask **before** you commit (ADR-0111), and is the fact that blocked it. That is a cost call and it is not made here.
- **Phase 6b's data-model questions are untouched** (§9): the nullable `@@unique` assumption, and the exact write path for a coordinate-only place.
- **Phase 6c is unaffected.** A tap on one of Google's own POI icons stays its own item, and §9 is deliberately a different gesture so the two do not collide.

## Out of scope, named so it is not designed around

**The Map tab's own search renders in day-scoped grammar** — `searchRows` reads `allUsages` but `renderList` blocks it with the **day's** `orderCtx` and renders rows without `forceDay`, so a hit from another day resolves no `placeDay` and is filed under `ללא יום`: a claim about the place, when it is a fact about the scope. It is on this exact surface and `renderRow` already accepts the `forceDay` that fixes it, which is what makes it look like a freebie.

**It ships on its own branch.** It is a wrong context object with no design content, the backlog says in as many words not to let it become the excuse to reshape the overlay in one session, and it waits on nothing here. **This ADR neither fixes it nor designs around it:** the mockup draws the rows **as the corrected renderer renders them** (the Friday match carries `שישי`), and correct rows are what §4 and §6 assume.

## Alternatives considered

- **A permanent query field in the controls row** (the phasing note's leading candidate, and this session's first draft). **Rejected on measurement:** 12.8px spare in Plan mode + day scope at 390, −17.2px at 360, against ~150 needed. Its _intent_ survives completely — the query is a list-changing control — but it takes the row rather than joining it.
- **A floating query panel over the canvas.** Rejected before it was drawn: it is a fourth floating object on a canvas ADR-0126 §1 just ruled grows along the inline axis only, and the row already has a disclosure slot doing this job.
- **Keep `SearchOverlay` and give it a variant that leaves the canvas visible** (a half-height `'over'` variant). Rejected: a `Modal` that deliberately does not cover is a sheet, the tab already has one, and it would put a back-stack layer (ADR-0090) on a control that must stay visible while you watch the pins change — ADR-0122 §2's own reason for the facet strip.
- **Scope the phase to Trip mode and leave Plan mode's overlay alone** — this ADR's own first draft, and the thing the owner's first correction overturned. Rejected: it answered "which mode gets which surface" when the question is "where does a place come from", it left the paid half on a surface that covers its own canvas in Plan mode, and it was already false about the app, since `＋ הוספת מקום` arms a paid picker in **Trip** mode today.
- **Lift only the free half out of the overlay and leave research inside it.** Rejected: two search affordances on a surface ADR-0122 spent a session decluttering, and it breaks ADR-0115 §1's "one control, two halves" by forcing the user to choose an intent before typing.
- **Put the Google results on the canvas too.** Not a trade-off, an impossibility: a prediction carries no coordinates (ADR-0115 §2). That fact is what shapes §8 rather than a preference.
- **A dedicated match cue on the pin** (a ring, a badge, a tag). Rejected in §3: `.pin-b`'s spread axes are spent on the two amber cues and selection, the tag slot is spoken for and Phase 11 wants it, and ADR-0130 already refused a corner mark for a distinction the grammar could carry. A filter needs no cue.
- **Dim the non-matches instead of removing them.** Rejected: desaturation on this canvas means **behind you** (ADR-0109's 2026-07-27 amendment, applied twice by ADR-0130). A second meaning on that axis is the collision ADR-0130 §2 exists to undo.
- **Promote an out-of-day match all the way out of `ghost`** (full category paint and glyph). Rejected in §4: it would claim the match is part of this day and throw away the one thing the reader needs, which is _which_ day it is.
- **Make `isAsidePin` itself query-aware.** Rejected in §4, and it is the trap rather than a trade: five call sites read it, and two of them — the amber cues and the day connector — would change wrongly and silently.
- **Add `query` to `cameraSignal` behind a debounce.** Rejected **for now**, and kept as the named lever if §5's read fails on a phone. A debounce is a second timing mechanism, and the two controls that frame a match already exist.
- **Gate the fit on submit** (an explicit "search" action). Rejected: a live filter has no submit, adding one would make every keystroke feel provisional, and it contradicts the reveal, which is live by construction (ADR-0120).
- **Give `PlacePickerSheet` its own canvas** so `＋ הוספת מקום` never leaves its layer. Rejected in §10 on two grounds: a second live map instance is a **billed** load (ADR-0121 §4), and a canvas inside a sheet is the small-map-small-list failure ADR-0122 exists to undo.
- **Reverse-geocode a dropped pin** so it arrives named. Rejected in §9: it is paid, for a name the user is standing next to and can type, on the one add-a-place route that otherwise costs nothing.
- **Use a second tap, or a dedicated "drop a pin" control, instead of a long press.** Rejected: a second tap needs tap-count state (ADR-0129's own rejection, ADR-0122 §9's general refusal), and a control re-clutters the row §1 just filled and the band ADR-0126 just measured. A long press is the map idiom and costs no chrome.
- **Have a row tap or a selection close the query.** Rejected: the query is the tab's view state, and a filter that cleared itself when you acted on a result would make the second result unreachable.

## Consequences

- **This is no longer a small build, and the estimate should say so.** §1–§7 are a day's work on one screen; §8 is a re-parent plus a mode flag; **§10 is the expensive one** — an errand channel above the Shell with a return that has to re-open a `Modal` the URL does not address.
- **Touched:** `constants.ts` (the disclosure state's named constant, `MAP_ROW_DISCLOSURE`), `screens/Map.tsx` (the disclosure, the query's second consumer in `pinsNow`, the `half` normalisation, `PlaceResearch`'s new host, the errand banner, the long-press card), `screens/map.css` (`.map-querystrip`, ~25 lines), `lib/map-pins.ts` (`PinContext`'s flag, three query-aware readers, `PIN_TIER_CLASS`'s paint/ratio split), `ui/domain/MapPane.tsx` (the class split, the long-press gesture, one new callback), `state/map-scope-state.tsx` (the errand + return), `state/nav-state.tsx` (one `resolveBack` rule), `ui/BookingDetail.tsx` + `ui/IndexBookingsView.tsx` (the errand's origin and its return landing), `i18n/he.ts`. **No new component file.**
- **`SearchOverlay` keeps one caller**, the Index, and is not edited. ADR-0101's §2 reusability claim is unaffected: this is a caller leaving, not the primitive narrowing. **`PlaceResearch` is not edited either** — it changes parent, which is the payoff of ADR-0115 §7's reuse audit.
- **`MapPane`'s memo survives.** The query never reaches the pane as a prop — it reaches `pinsNow`, already memoized on a content key (`pinsKey`), so a query that does not change the set produces **no marker diff**. The long press adds one `useCallback(…, [])` over a latest-ref, the discipline ADR-0126's build log fixed in place. A re-instantiation is billed (ADR-0121 §4).
- **`MAP_CONTROLS_H` stays 46 and `MAP_FIT_PADDING.top` stays 118.** The field is 44 _inside_ 46, so no camera constant moves and no test in `lib/map-camera.test.ts` changes.
- **The cost surface widens by one screen and by nothing else** (§8). Same SKU, same relay, same per-member·trip guard and daily cap. The one-boolean lever back to Plan-only is named.
- **Two shipped controls get re-coloured, and it is a rule fix rather than a restyle** (§8): `.map-arm` and `.map-addmaybe` move from `--plan` to `--cta`, because plan violet on a Trip-mode surface is mode identity used as a button colour (root `CLAUDE.md` rule 4, and `tokens.css`'s own comment). Plan mode is affected too, and correctly so.
- **Most of this is testable with no Google in the process** (`frontend/CLAUDE.md`): the query's effect on the pin set, the aside promotion and the three predicates that read it, and — the property that matters — that the amber guard and the connector are **byte-for-byte unchanged** under a query. Assert across **both day scopes**, since the promotion only exists in the day-scoped one. At the screen level: opening from each extreme normalises to `half` and a drag afterwards does not; the errand's banner names its target and its cancel assigns nothing; and `PlaceResearch` renders in the sheet in **both** modes, which is the mode gate's regression net.
- **`Map.test.tsx` runs with no build config on purpose**, which is the list-only path (ADR-0122 §8). The row renders `position: static` there, the query field renders in flow above the list, the normalisation is a no-op, and the long press does not exist — one component, two positionings, still never two components.
- **A rule the next thing to take that row inherits:** the controls row has **one** disclosure with N occupants, and adding one is a value in a named constant.
- **Phase 6a and 6b both shrink.** 6a keeps only the preview-before-pick cost call; 6b keeps only its data-model questions. Both are stated in §12 rather than absorbed.

## The device pass, and what it owns

These rest on how the surface **reads**, not on how it computes, and they are stated as such rather than asserted. One of them is the heaviest question in the file.

- **The real keyboard height, and what iOS does with focus inside a `100dvh` PWA.** §2's argument is measured against an _approximated_ 336px band over a _faked_ base. In a standalone iOS PWA the layout viewport does not shrink for the software keyboard — the visual viewport does — so the browser may scroll the document to reveal the focused field, and the sheet is what would move out from under it. The mockup cannot answer this at all, and it is the one number §2 depends on. It also decides how usable §8's Google results are while typing.
- **Whether a long press works over Google's own tiles at all**, and how it feels against a pan that starts on move. Some platforms raise their own context menu on a long press over a map, which is neither detectable nor preventable from every browser. §9 is the only decision here that could be **blocked** by a device rather than tuned by one.
- **Whether a 44px field reads as a field over real cloud-styled tiles**, or as chrome that landed on the map. It is the row's one filled member and the row at rest is transparent.
- **Whether a promoted ghost reads as "this is what you searched for, and it is another day's"** or as a contradiction. ADR-0130 §4 showed that looking at pin geometry in a renderer changed three numbers that were wrong on paper; this is the same kind of question, and the mockup answers only that the two states are visibly distinct at the 0.72 ratio.
- **Whether a camera that does not move reads as quiet or as broken** when every match is off-screen. The lever is named in §5.
- **Whether the arm card is discoverable below several trip matches** (§8). The ordering is defended on paper for the case that matters — no trip matches means the arm is first — but "did anyone scroll to it" is a question a phone answers and a mockup cannot.

## What the mockup checked against a renderer, and what it did not

Following ADR-0130 §4's precedent, and with the same narrowness. `mockups/map-search-v1.html` was rendered in a headless Chromium against the **shipped** stylesheets inside the real layout tree, at 390×844 / 390×734 / 360×640, and it is what produced the Context table, §1's 44-in-46, §2's keyboard arithmetic and §3's match set. It also caught three things the reasoning did not have. Two are fidelity slips inherited from the Phase-8 file (ghost pins drawn with glyphs they do not carry, and the Map's retired one-off `.map-addbtn` where the shared `AddLocationButton` now sits), both fixed in the drawing rather than reasoned around. **The third is a real defect in the design as first written:** §8's Google half rendered in Trip mode is `--plan` violet on a Trip-blue surface, which is root `CLAUDE.md` rule 4 broken by a scoping change rather than by a styling choice. Nothing in the prose would have caught it; the colour did.

**This is not a claim that the surface has been seen on a phone over real tiles.** The base is faked, the keyboard is drawn, and a long press cannot be evaluated in a fake canvas at all. It is the narrower claim that the **geometry was checked against a renderer instead of against arithmetic**, and that the number which killed this phase's leading candidate is a measurement rather than an estimate.
