# 0131 — The Map tab's search is a control, not a screen: the query takes the row, and the tab becomes where a place is found **or made**

**Status:** Accepted (design) — authored 2026-07-28 (session 157). **Paper only: the build is pending.** The rendered canvas has still not been seen (ADR-0121 §13) and nothing below claims otherwise; the closing sections name what was measured against a renderer and what was not.
**Date:** 2026-07-28

**Amends** [0101](0101-index-search-mode-and-header-titles.md) — the Map tab stops using `SearchOverlay` **in both modes** (§1, §8). The primitive is unchanged, gains no variant, and keeps the Index.
**Amends** [0122](0122-map-split-controls-over-the-canvas.md) **§1/§2** (the controls row's disclosure slot gains a second occupant) and **§7** (its sheet-normalisation rule runs in a fourth case, and for the first time in both directions).
**Amends** [0115](0115-plan-mode-place-research.md) **§6** — "Plan mode only" is withdrawn: the Google half is available in **both** modes (§8) — and **§1**, whose arm is withdrawn on this surface by owner call (§8a) and whose "armed by intent" is replaced by **fetched on demand** (§8b). This is the "own ADR and own cost line" §6 demanded.
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

### The owner's second correction: one search, not two

Reviewing the design above, the owner pushed three more times, and all three say the same thing — **the two corpora must read as one search**:

1. **"We don't have to gate search with a `חיפוש בגוגל` button. We'll live with the expenses."**
2. **"I still don't understand how searching for places works when the map is maximized."**
3. **"Searching for new places from Google should be easy and seamless, almost the same as searching for saved places, but differentiated visually somehow."**
4. **"Adding places to events/bookings should be really easy and not refer you to the map if you want a place that already exists — it only refers you to the map when you want to add a place that doesn't."**

Then, on the redesign, a fifth: **"can we work around 'every search costs' while keeping it seamless — call Google only when there are no results, or only when there are not enough, so the user cannot see that Google results aren't there?"** That is §8b, and it is the second half of the arm's removal rather than a reversal of it.

(1) and (3) are one decision: **the arm goes** (§8a). (2) is a fair challenge to the draft's own answer, and the draft was wrong — it normalised the sheet to `half` from **both** extremes, which at the maximized map means _search shrinks your map by half_. That is a milder form of the very defect the phase exists to remove. §6 is rewritten. (4) overturns §10 outright, and for the same reason as everything else here: **the corpus decides the surface.** An existing place is answerable in place; only a place that does not exist yet needs the canvas.

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

### 6. At the maximized map, search leaves the map alone. Only `full` moves

The owner's second correction, and the draft's own answer was wrong. It normalised the sheet to `half` from both extremes, which at the `map` stop means **search shrinks your canvas from 517px to 250px** — a milder form of exactly the defect this phase removes. One rule per stop instead:

| Stop at the open tap | What happens                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **`map`**            | **Nothing moves.** 517px of canvas, and the canvas is what answers.                                                        |
| **`half`**           | Nothing moves. Both halves are already on screen.                                                                          |
| **`full`**           | **Drops to `half`**, because at `full` the pane is `visibility: hidden` and a search that shows no canvas _is_ the report. |

**Why `map` is right, stated properly this time.** At that stop you have 517px of map and a query that filters the pins live. If one pin remains and it is in view, **that is a complete answer and the list was never needed** — which is the best outcome this phase can produce, and the draft threw it away by forcing `half`. ADR-0121 §5's reason the sheet always peeks was never that the list must be _showing_; it is that the list must be **reachable**, and its head row is on screen the whole time.

**What makes it honest is the count, and the count becomes the way in.** The field carries the number of matches; at the `map` stop that number is legitimately larger than the pins you can see — a coordless match has no pin, and after §8 **every Google result is a row with no pin at all**. So the gap between the count and the canvas is the signal, and **at the `map` stop the count is a button that raises the sheet to `half`.**

That is not a new control: it is ADR-0126 §4's shape exactly, one more caller. The visible number stays the accessible **name** (a voice-control user must be able to say what they can see, WCAG 2.5.3) and "show the list" is the **`title`**, an accessible description. And it is a button **only where it has something to do** — at `half` and `full` the list is already on screen, so the count is a plain readout there. That is the derived-affordance rule this tab runs everywhere (`אולי`, `מה נשאר`, `באזור`'s zero state, `frame` with nothing to frame).

**`full` keeps the drop, and it is ADR-0122 §6's rule verbatim** — "a question about a map you cannot see lowers the sheet enough to see it", which is also ADR-0126 §7's third case. So the rule the tab now runs is sharper than the draft's: **a control moves the sheet only when its answer is somewhere you cannot see it.** At `map` the answer is on the canvas; at `full` there is no canvas.

**It fires on the open tap, never per keystroke**, and a drag afterwards is left alone — a sheet that moved while you typed would relayout the canvas under a typing finger, the one thing ADR-0121 §5 shaped the stops to avoid.

**At `full` after the drop, and at `half`, the query field is the list's search field** as well as the canvas's — ADR-0122 §1 already makes the row read as the list's own header at `full`.

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
- **There is no arm** (§8a). One query feeds both halves live: the trip half filters, and past the min-chars floor the Google half searches, pause-gated, on one session token per **search session** (closing the disclosure retires it, exactly as closing the overlay does today). `usePlaceSearch` is untouched.
- **The differentiation is visual, and it already exists** — the owner's third point needs no new vocabulary. At the **group** level, the two shipped `.map-grouphead`s (`בטיול` / `מגוגל`) draw the boundary. At the **row** level, a Google result wears `.map-badge.result`, the dashed neutral pin that is already the app's "listed, not yet ours" reading (ADR-0109 §3's coordless Place-lite badge), against a trip row's solid category badge — and a result already in the trip states `כבר בטיול` through the dedup the hook already does. Grouped rather than interleaved, because "is this already ours" is the most important fact about a result and a header answers it once instead of per row.
- **A picked result becomes a pin immediately**, because the pick is what resolves coordinates: `＋ אולי` creates the uncategorised idea (ADR-0115 §3), the reference is what makes the place "in the trip" (ADR-0112), so the row flips state and a pin appears on the canvas in the same pass. The camera frames it once through `framePlace` (§5). **That is "see where it is" without a single extra call** — which is the part of Phase 6a's problem this ADR can honestly close, and §12 says which part it cannot.

### 8a. The arm is withdrawn — owner call, and what remains of the cost controls

**"We don't have to gate search with a `חיפוש בגוגל` button. We'll live with the expenses."** Taken as decided. Two things make it more principled than a cost concession, and one thing it genuinely costs.

**The arm existed to separate two intents on one field, and the owner's position is that there is only one.** ADR-0115 §1's reasoning was: _"filtering your own list and buying an Autocomplete session must not be the same gesture"_ — true when the field's default meaning was "filter", and the arm is what told the app which of two things you meant. Under §8's framing the user has **one** intent, "find a place", and which corpus it comes from is where the app looks rather than something the user decides. An arm then asks for a distinction the user does not have.

**And the app already agrees, on the surface that has only one intent.** `PlacePicker` — the in-form picker, `PlacePickerSheet` behind it — has **never** had an arm: it fires on typing, because its field means exactly one thing. The Map tab's field now means one thing too. So this is not a new posture in the app; it is the picker's posture arriving where the ambiguity that justified the exception has gone.

**What remains, and it is most of the machinery:** `usePlaceSearch`'s **min-chars floor**, its **pause-gated debounce**, **one session token** per search session, **dedup-before-spend** (a `googlePlaceId` already resolved in this trip costs zero on the pick, server-side), `PlacesThrottlerGuard` per member·trip, and ADR-0108 §6's budget alert + **daily quota cap**. Offline the Google half is still absent rather than disabled (ADR-0115 §5), and a 429 is still soft.

**What it costs, stated plainly so the decision is findable later:** with no gate, a search on the Map tab spends in both modes, on the surface people use while walking around — which is precisely the exposure ADR-0115 §1 and §6 were each built to prevent, and both are overruled here. The daily cap is the backstop, not the gate.

**Most of that exposure comes back in §8b, and through the floor rather than through a control** — which is the one lever that costs the user nothing at all.

**And the exposure is taken back by the floor rather than by a control — `PLACE_SEARCH_MIN_CHARS` goes from 2 to 3** (owner's number). §8b is the whole argument, including why gating on the trip's match count is the wrong trade.

**Two things drawing this in Trip mode produced, neither of which was in the reasoning:**

- **`.map-addmaybe` is painted in `--plan`, and that becomes a rule violation the moment it renders in Trip mode.** `tokens.css` says it outright — `--plan` is the "plan-mode accent, plan/builder actions only" and `--cta` is the "neutral primary button; amber/teal/plan are semantic, never CTAs" — which is root `CLAUDE.md` rule 4. The violet was **legitimate** while ADR-0115 §6 kept research Plan-only; on a Trip-blue surface it is mode identity used as a button colour. **It moves to the neutral `--cta`**, so Plan mode loses a violet it should not have had on a control and nothing else changes. This is the whole reason to draw a surface against the shipped stylesheets: a colour-budget violation shows up as a colour rather than as a claim. (`.map-arm` had the same problem and is moot — §8a deletes it.)
- **The `מגוגל` group sits _below_ the trip matches, and the ordering works for the case that needs it.** At `half` the sheet's viewport is ~266px against ~82px a row, so with several trip matches the Google group is below the fold. That is the case where you have probably already found what you wanted. When there are **no** trip matches — exactly the state you are in when adding a place that is not in the trip — the `מגוגל` header and its first result are the top of the list. Stated so the scroll is a consequence rather than a discovery.

**ADR-0115 §6's "Plan mode only" is withdrawn, and this is the ADR it asked for.** §6's reason was that Trip-mode research "would put a paid call on the one surface people use while walking around", and that it "earns its own ADR and its own cost line". Three things answer it:

1. **The arm is exactly the control that makes the worry not bite.** Walking around and typing costs nothing; the first paid call is a deliberate tap, and the same rule the tab already applies to the geolocation permission (ADR-0109 §6).
2. **The app already contradicts the scoping.** `＋ הוספת מקום` on a placeless booking is reachable in Trip mode (ADR-0121's session-148 amendment) and it opens a **paid** Autocomplete picker there today. Trip mode has had a paid place search since that shipped; what it lacked was a map.
3. **The SKU worry is unchanged and untouched.** §6's "different query shape on a different SKU" was about **nearby / open-now** discovery ("what's open near me right now"). This ADR does not add that. It is the same Autocomplete relay in both modes, which is why it needs no new cost line beyond the wider surface.

**What genuinely widens, stated plainly for the owner rather than buried:** the number of surfaces from which a member can arm a paid session goes from one to two. The bounds do not change — `PlacesThrottlerGuard` per member·trip, the Phase-0 budget alert and the daily quota cap (ADR-0108 §5/§6) are all per-member and per-trip, not per-surface. **If this is not wanted, the lever is one boolean** (`research = mode === 'plan'` as it reads today), and everything else in this ADR is unaffected.

### 8b. The exposure comes back through the **floor**, not by withholding results

The owner asked whether "every search costs" can be worked back without putting a control back on screen: **(A)** call Google only when the trip has no matches, or **(B)** only when it has "not enough", so the absence is invisible.

**Both are rejected, and the reason is upstream of the mechanism: the count of trip matches is not evidence about relevance.** A trip match is not necessarily _the_ match, and the app cannot tell the difference. The case that decides it — call it the **near miss**: you search `בלו בוטל`, the trip has _Blue Bottle Kiyosumi_ saved, and you want the Shibuya one. Under A and under B the app stays quiet, and you reasonably conclude there is nothing else. That is **a wrong conclusion caused by the withholding**, on a surface whose entire job is to find a place. **A is the worse of the two** for the same reason sharpened: it withholds precisely when the trip has one weak match, which is the most confusable case there is.

So the answer to the owner's question — _would it be better that the user got Google results even when searching for something already saved?_ — is **yes**, and it settles the design: **the Google half fetches on every pause past the floor, in both modes, with nothing hidden.**

**The saving is taken from the floor instead, and it is a strictly better lever.** `PLACE_SEARCH_MIN_CHARS` goes from **2 to 3** (owner's number). Two characters of Hebrew match a large fraction of a city, so a 2-char query is a paid request that **cannot** return a useful answer — and it fires on the way to every single query that follows it. Against a count gate it is:

|                                         | Raise the floor  | Gate on the trip's match count              |
| --------------------------------------- | ---------------- | ------------------------------------------- |
| Order of saving                         | comparable       | comparable                                  |
| UX cost                                 | **none**         | the near miss (above)                       |
| Risk of an absence read as "no results" | **none**         | real                                        |
| New mechanism                           | **none**         | an `IntersectionObserver` (the app's first) |
| Surface area                            | **one constant** | a sentinel, an observer, a fetch state      |

The saving was never in "did we ask Google when the trip already answered". It is in **how many requests a session makes**, and the floor removes the ones that were structurally useless.

**Blast radius, because the constant is shared and that is deliberate.** Three hooks read it — `usePlaceSearch` (the Map tab's search and the in-form picker) and `useDestinationSearch` (the trip's destination, ADR-0113). All three are the same Autocomplete relay, so the floor is a win on all three and needs **no per-surface fork**. One build note: **`lib/usePlaceSearch.test.ts` fixtures three cases on `setQuery('sh')`**, a 2-char query that activates today and would go inert at 3 — those need a 3-char fixture, and the change is a silent test failure rather than an obvious one.

**What is deliberately NOT bought with this:** the arm does not come back (§8a), nothing is hidden, and no result is withheld from a user who is looking at the list.

#### The deferral, kept as the named lever rather than shipped

If the bill argues otherwise, the mechanism is designed, drawn and verified rather than left to be re-derived. **The trigger for pulling it is ADR-0108 §6's budget alert** — real spend data, which exists — not a guess.

**And "not enough" would have to be the fold, not a count.** Measured against the real tree, the number of trip matches it takes to push the `מגוגל` header below the fold:

| Screen · stop    | List viewport | Rows that fit (82px each) | A threshold would be |
| ---------------- | ------------: | ------------------------: | -------------------: |
| 390×844 · `map`  |           4px |                         0 |                **1** |
| 390×844 · `half` |         264px |                       3.2 |                **4** |
| 390×844 · `full` |         470px |                       5.7 |                **6** |
| 390×734 · `half` |         205px |                       2.5 |                **3** |
| 390×734 · `full` |         361px |                       4.4 |                **5** |
| 360×640 · `half` |         152px |                       1.9 |                **2** |
| 360×640 · `full` |         267px |                       3.3 |                **4** |

**There is no single N** — 1 through 6 across the stops and screens this tab already supports, and it moves again with a wrapped two-line row. The screen also cannot measure its own viewport to derive it: `screens/Map.tsx` re-renders every second, which is why ADR-0121 §5 forbids `--sheet-h` depending on a layout read and ADR-0122 §3 refused to derive the stops at runtime.

**So the shape, if it is ever needed:** a sentinel at the end of the trip's matches and one `IntersectionObserver` — visible on arrival means the matches did not fill the list, so fetch; scrolled into view, fetch; never visible, the trip answered and nothing is spent. That is **demand**-gated rather than count-gated, which matters: the signal is the user's own behaviour, and **the gesture that would reveal the gap is the gesture that fills it**. It is also a _deferral_ rather than a _gate_ — it asks the situation, not the user, and puts no control on screen. It still carries the near-miss cost, which is why it is a lever and not the design.

**Two build notes from wiring it, which only matter if it ships, and are recorded because both cost a debugging round to find:**

- **"Did the trip's matches fill the list" cannot be answered on the frame the query changed** — the reveal **animates** (ADR-0120's `0fr`/`1fr` grid track), so rows that just stopped matching still hold their old height. An `IntersectionObserver` is asynchronous and re-fires as layout settles, so it is right **by construction**; a hand-rolled snapshot reads the wrong layout and decides not to fetch. That is a second, independent argument for the observer over a scroll listener plus arithmetic.
- **The one scroll region is `.wp-snapsheet-body`, not `.map-sheet-scroll`** (`snap-sheet.css`: "the sheet's body, never the page"). The inner element only carries padding, so an observer given the wrong root sees the sentinel never intersect and the deferral silently never fires.

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

### 10. `＋ הוספת מקום` answers in place. The canvas is the exception path, not the route

The owner's fourth correction, and it overturns this design's own §10 twice over. The first draft reached for a reason not to build the map route at all; the second sent **every** add-a-place through the Map tab. Both were wrong, and the rule that fixes it is the one §8 already runs: **the corpus decides the surface.**

> _"Adding places to events/bookings should be really easy and not refer you to the map if you want a place that already exists — it only refers you to the map when you want to add a place that doesn't."_

**So `＋ הוספת מקום` opens a sheet over the surface that asked, and it answers both corpora there.** `PlacePickerSheet` — which ADR-0121 §5 shipped as the "honest interim" — is the right host, and what it gains is the half it was missing:

| The list in the picker's sheet         | Cost                               | Result of a pick                            |
| -------------------------------------- | ---------------------------------- | ------------------------------------------- |
| **`בטיול`** — the trip's own places    | **zero**, pure derivation, offline | assign, close, done — **no navigation**     |
| **`מגוגל`** — Autocomplete predictions | paid, un-gated (§8a)               | resolve + assign, close — **no navigation** |

That is the same two-corpus list, the same group headers and the same dashed-badge differentiation as §8's, in a second host. **One grammar, two hosts** — the rule ADR-0122 §7 already established when the place card became "the row wherever the sheet cannot show it."

**The common case stops being a round trip, and it also stops costing money.** A placeless booking's place is very often already in the trip — the hotel, the station, the restaurant someone shelved. Today that needs a **paid** Autocomplete session, because the picker only knows how to ask Google. With the trip's own places above the predictions, the most common add is **free, instant and offline-capable**, and it is one tap with nothing unmounting. That is a real cost **reduction**, and it partly offsets §8a's exposure.

**The canvas becomes the exception path, reached by one affordance at the foot of the sheet.** Its job is the two things a list genuinely cannot do: **see where a candidate is** before committing (Phase 6a's preview, still cost-gated and still 6a's), and **make a place that is not in Google at all** (§9's long press). That — and only that — starts the errand:

- **The errand:** `{ target, returnTo }`, set by the affordance, consumed once by the Map tab, with a `StatusBanner` naming the target in the reference's own words (`eventEdgeTransition` / `shortTitleText`, ADR-0121 §8's vocabulary) and `ביטול` beside it.
- **The mechanism exists one field narrower.** `MapScopeProvider` sits just above the trip Shell precisely so "the surfaces that need to talk to the tab can", and `useShowPlaceOnMap` already hands over a `focusPlaceId`, lands through `tabTarget('map')` with `{ replace: true }`, and is consumed once so a later visit cannot re-fire a stale intent. An errand is that **with a return address**.
- **ADR-0090 permits it, and the draft overstated the constraint.** That ADR bans reading the browser history stack and `navigate(-1)`; its own Alternatives names this exact extension point — _"explicit app state feeding the snapshot — a localized, additive change to the provider + one rule in `resolveBack`, still never touching the triggers, the executor, or the browser history stack."_
- **The return is a navigation to `returnTo`** with `{ replace: true }`, and `ביטול` and back both run it, so there is exactly one way out. Cancelling assigns nothing.

**Why the map comes to the tab rather than a canvas going into the picker**, for the exception path: a second live `google.maps.Map` is a **billed** load (ADR-0121 §4 — one instance per tab visit), and it would be a small canvas over a small sheet, the failure ADR-0122 spent a session undoing.

**And the phasing falls out, which it did not before.** The picker's trip-places half is **free, offline, needs no nav change, and answers the common case** — so it can ship first and on its own. The errand is a narrow exception path, so its cost (a return that has to re-open a `Modal` the URL does not address, making it a third consumer of the app's hand-over-and-consume-once pattern) is paid for the case that needs it rather than for every add. **That reorders the build: the picker's second half is the cheap win, the errand is the follow-on.**

**One build question this ADR does not answer, because it is a data question:** `PlacePickerSheet` already distinguishes _enrich this coordless Place-lite in place_ from _mint a new place_ (`enrichPlaceId`). A trip-places section adds a third verb — _point this reference at a place that already exists_ — which is a reference change rather than an enrich or a mint. Naming it is this ADR's job; deciding what happens to a coordless Place-lite that is then pointed at an existing place is the build's, and it should be settled before the picker's half ships.

### 11. Three sources, two destinations — one table, so the composition is not re-derived

|                    | Trip's own places | Google (armed)            | Long press on the canvas |
| ------------------ | ----------------- | ------------------------- | ------------------------ |
| Cost               | free              | **paid** (session + pick) | **free**                 |
| Where it renders   | pins **and** rows | rows in the sheet         | a card on the canvas     |
| Has coordinates    | already           | on the pick               | immediately              |
| Needs a name typed | no                | no                        | **yes**                  |
| Offline            | works             | absent (ADR-0115 §5)      | absent (no canvas)       |
| Camera             | `frame` / badge   | `framePlace` on the pick  | `framePlace` on the drop |

**Destination, and the invocation decides it, not the source:** picked in the Map tab with no errand live, a new place goes to the **shelf** as an uncategorised `MaybeItem` (ADR-0115 §3, unchanged, including its toast and undo). Picked in the picker's sheet (§10), or in the Map tab with an errand live, it is **assigned to the target** — the picker closes, or the tab returns.

That single rule is what keeps three sources and two hosts from growing five flows.

### 12. What this phase does not do, and to whom it belongs

- **Phase 6a's cost decision is untouched.** §8 closes the part of "search needs a map" that costs nothing extra: a **picked** place is on the canvas immediately, because the pick already pays for coordinates. What 6a still owns is whether a prediction can be **previewed** on the map before the pick — which needs a Details call against a Pro-tier mask **before** you commit (ADR-0111), and is the fact that blocked it. That is a cost call and it is not made here.
- **Phase 6b's data-model questions are untouched** (§9): the nullable `@@unique` assumption, and the exact write path for a coordinate-only place.
- **Phase 6c is unaffected.** A tap on one of Google's own POI icons stays its own item, and §9 is deliberately a different gesture so the two do not collide.
- **The picker's coordless-Place-lite question is the build's** (§10): pointing a reference at a place that already exists is a third verb beside enrich and mint, and what happens to the abandoned Place-lite is a data decision, not a design one.

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
- **Send every `＋ הוספת מקום` through the Map tab** (this design's own second draft). **Overturned by the owner:** _"not refer you to the map if you want a place that already exists."_ Rejected in §10 — the common case is a place the trip already has, and a tab round-trip for it is heavy, slower, and paid, since the picker as it ships can only ask Google. The corpus decides the surface, one level up.
- **Give `PlacePickerSheet` its own canvas** so the exception path never leaves its layer. Rejected in §10 on two grounds: a second live map instance is a **billed** load (ADR-0121 §4), and a canvas inside a sheet is the small-map-small-list failure ADR-0122 exists to undo.
- **Leave the picker Google-only and add a "pick from the trip" affordance beside it.** Rejected: two lists for one question, and it makes the user classify their own place before searching for it — the same thing §8a's arm was doing one surface over.
- **Reverse-geocode a dropped pin** so it arrives named. Rejected in §9: it is paid, for a name the user is standing next to and can type, on the one add-a-place route that otherwise costs nothing.
- **Use a second tap, or a dedicated "drop a pin" control, instead of a long press.** Rejected: a second tap needs tap-count state (ADR-0129's own rejection, ADR-0122 §9's general refusal), and a control re-clutters the row §1 just filled and the band ADR-0126 just measured. A long press is the map idiom and costs no chrome.
- **Keep ADR-0115 §1's arm** (this design's own draft, and ADR-0115's decision). **Overturned by the owner** — _"we'll live with the expenses"_ — and §8a records why it is more than a cost concession: the arm separated two intents on one field, and under §8 the user has one intent. The in-form picker has never had an arm for exactly that reason. What it costs is stated in §8a rather than smoothed over, and the mitigation (`PLACE_SEARCH_MIN_CHARS` is 2) is recommended rather than assumed.
- **Normalise the sheet to `half` from the `map` stop too** (this design's own draft). **Rejected in §6 after the owner asked what happens at the maximized map:** it shrinks 517px of canvas to 250px for a query the canvas can often answer outright, which is a milder form of the defect the phase removes. The count-as-button is what makes staying honest.
- **A separate search stop, or a sheet height driven by the number of results.** Rejected: ADR-0122 §3 refused a selection-driven stop for the same reason ("it gives the minimum stop two heights, which the drag then has to reason about"), and a height that changed per keystroke is the relayout-under-a-typing-finger that §6 exists to avoid.
- **A floating results dropdown under the field**, the way a desktop map app does it. Rejected: it is a second list surface on a tab that has one, it grows along the block axis ADR-0126 §1 just ruled out for canvas furniture, and at the `map` stop it would cover the pins it is describing. The sheet is the list, and the count is the way to it.
- **Interleave Google results with trip matches** in one flat list. Rejected in §8: "is this already ours" is the most important fact about a result, and a group header answers it once instead of per row.
- **Delay the Google call until the sheet is up** — this design's own first answer to the spend, and **it was the wrong version of the right idea**. A _stop_-gated delay makes raising the sheet feel slow and leaves the count unable to advertise what it had not fetched, which is why it was rejected. The owner's proposal is _demand_-gated, and it answers both objections: the wait attaches to a scroll rather than to a raise, and the count objection dissolves once the count means "what has been found" (§8b).
- **A count threshold — call Google only when the trip returns fewer than N matches.** Rejected twice over (§8b): on **UX**, because the count is not evidence about relevance and the near miss then reads as "there is nothing else"; and on **measurement**, because N would have to be 1, 2, 3, 4, 5 or 6 depending on the stop and the screen, and it moves again with a wrapped row.
- **Call Google only when the trip returns nothing at all** (the owner's option A). Rejected as the special case rather than the rule: it is §8b with the threshold pinned at 1, so it under-fetches in exactly the case that most wants Google — one weak trip match sitting where a new place was the intent.
- **Defer the Google fetch until the trip's matches fail to fill the list** (the demand-gated form of the owner's option B; designed, drawn and verified in the mockup). **Not shipped**, and kept as §8b's named lever: it still carries the near-miss cost, it needs the app's first `IntersectionObserver`, and it introduces a visible wait where there is none — while raising the floor saves a comparable order at none of those. ADR-0108 §6's budget alert is what would justify pulling it.
- **Have a row tap or a selection close the query.** Rejected: the query is the tab's view state, and a filter that cleared itself when you acted on a result would make the second result unreachable.

## Consequences

- **The build has three tiers, and §10 reordered them.** §1–§7 are a day's work on one screen. §8 + §8a are a re-parent, a deleted arm and a removed mode flag. **§10's picker half is the cheap win and should ship first** — the trip's own places above the predictions is free, offline, needs no nav change, and answers the common add. **§10's errand is the expensive follow-on** — an errand channel above the Shell whose return has to re-open a `Modal` the URL does not address — and it is now a narrow exception path rather than the route, so its cost is paid for the case that needs it.
- **Touched:** `constants.ts` (`MAP_ROW_DISCLOSURE`), `screens/Map.tsx` (the disclosure, the query's second consumer in `pinsNow`, `full`'s drop, the count's button/readout split, `PlaceResearch`'s new host, the errand banner, the long-press card), `screens/map.css` (`.map-querystrip`, the drop-pin name field, `.map-addmaybe`'s colour), `lib/map-pins.ts` (`PinContext`'s flag, three query-aware readers, `PIN_TIER_CLASS`'s paint/ratio split), `ui/domain/MapPane.tsx` (the class split, the long-press gesture, one new callback), `screens/PlaceResearch.tsx` (the arm branch deleted), `ui/primitives/PlacePicker.tsx` (§10's trip-places half), `state/map-scope-state.tsx` (the errand + return), `state/nav-state.tsx` (one `resolveBack` rule), `ui/BookingDetail.tsx` + `ui/IndexBookingsView.tsx` (the errand's origin and its return landing), `i18n/he.ts`. **No new component file.**
- **`SearchOverlay` keeps one caller**, the Index, and is not edited. ADR-0101's §2 reusability claim is unaffected: this is a caller leaving, not the primitive narrowing.
- **`PlaceResearch` gets simpler, not just re-parented.** §8a deletes its `armed` state and its arm branch, so it becomes "feed the hook the query and render what comes back". `t.map.research.arm` / `armBody` / `armAria` are **deleted, not orphaned** (the pattern ADR-0126's build log set for `t.map.scopeAll`/`scopeDay`), and `.map-arm` / `.map-arm-g` / `.map-arm-txt` go with them.
- **The count is a button at one stop and a readout at the others** (§6), which is one more caller of ADR-0126 §4's live-region-wraps-a-button shape rather than a new control.
- **`MapPane`'s memo survives.** The query never reaches the pane as a prop — it reaches `pinsNow`, already memoized on a content key (`pinsKey`), so a query that does not change the set produces **no marker diff**. The long press adds one `useCallback(…, [])` over a latest-ref, the discipline ADR-0126's build log fixed in place. A re-instantiation is billed (ADR-0121 §4).
- **`MAP_CONTROLS_H` stays 46 and `MAP_FIT_PADDING.top` stays 118.** The field is 44 _inside_ 46, so no camera constant moves and no test in `lib/map-camera.test.ts` changes.
- **The cost surface widens twice, and this is the ADR that says so.** By one **screen** (§8 — Trip mode gets the Google half; same SKU, same relay, same per-member·trip guard and daily cap, and the one-boolean lever back to Plan-only is named), and by removing the **gate** (§8a — past the min-chars floor every search spends). Neither is a mechanism change; both are exposure changes, and §8a lists exactly what protection is left.
- **The spend is bounded by one constant, and needs no new mechanism** (§8b). `PLACE_SEARCH_MIN_CHARS` 2 → **3**, read by `usePlaceSearch` (the Map tab and the in-form picker) and `useDestinationSearch` (ADR-0113) — the same Autocomplete relay in all three, so one number and no per-surface fork. **`lib/usePlaceSearch.test.ts` fixtures three cases on `setQuery('sh')`**, which activates at 2 and goes inert at 3; they need a 3-char fixture, and it fails silently rather than loudly. The deferral stays designed and unshipped as the named lever.
- **One shipped control gets re-coloured, and it is a rule fix rather than a restyle** (§8): `.map-addmaybe` moves from `--plan` to `--cta`, because plan violet on a Trip-mode surface is mode identity used as a button colour (root `CLAUDE.md` rule 4, and `tokens.css`'s own comment). Plan mode is affected too, and correctly so. (`.map-arm` had the same problem and is deleted by §8a.)
- **Most of this is testable with no Google in the process** (`frontend/CLAUDE.md`): the query's effect on the pin set, the aside promotion and the three predicates that read it, and — the property that matters — that the amber guard and the connector are **byte-for-byte unchanged** under a query. Assert across **both day scopes**, since the promotion only exists in the day-scoped one. At the screen level: opening from each extreme normalises to `half` and a drag afterwards does not; the errand's banner names its target and its cancel assigns nothing; and `PlaceResearch` renders in the sheet in **both** modes, which is the mode gate's regression net.
- **`Map.test.tsx` runs with no build config on purpose**, which is the list-only path (ADR-0122 §8). The row renders `position: static` there, the query field renders in flow above the list, the normalisation is a no-op, and the long press does not exist — one component, two positionings, still never two components.
- **A rule the next thing to take that row inherits:** the controls row has **one** disclosure with N occupants, and adding one is a value in a named constant.
- **Phase 6a and 6b both shrink.** 6a keeps only the preview-before-pick cost call; 6b keeps only its data-model questions. Both are stated in §12 rather than absorbed.
- **The picker's own frame is not drawn.** The mockup is the Map tab's surface, which is the phase — and because §10's list is the **same** two-corpus grammar the sheet renders, the mockup covers the grammar even though it does not draw that host. If the picker's half ships on its own, it is worth its own frame; saying so here rather than implying the surface has been seen.

## The device pass, and what it owns

These rest on how the surface **reads**, not on how it computes, and they are stated as such rather than asserted. One of them is the heaviest question in the file.

- **The real keyboard height, and what iOS does with focus inside a `100dvh` PWA.** §2's argument is measured against an _approximated_ 336px band over a _faked_ base. In a standalone iOS PWA the layout viewport does not shrink for the software keyboard — the visual viewport does — so the browser may scroll the document to reveal the focused field, and the sheet is what would move out from under it. The mockup cannot answer this at all, and it is the one number §2 depends on. It also decides how usable §8's Google results are while typing.
- **Whether a long press works over Google's own tiles at all**, and how it feels against a pan that starts on move. Some platforms raise their own context menu on a long press over a map, which is neither detectable nor preventable from every browser. §9 is the only decision here that could be **blocked** by a device rather than tuned by one.
- **Whether a 44px field reads as a field over real cloud-styled tiles**, or as chrome that landed on the map. It is the row's one filled member and the row at rest is transparent.
- **Whether a promoted ghost reads as "this is what you searched for, and it is another day's"** or as a contradiction. ADR-0130 §4 showed that looking at pin geometry in a renderer changed three numbers that were wrong on paper; this is the same kind of question, and the mockup answers only that the two states are visibly distinct at the 0.72 ratio.
- **Whether a camera that does not move reads as quiet or as broken** when every match is off-screen. The lever is named in §5.
- **Whether the count reads as tappable at the `map` stop** (§6). It is the one thing standing between "the canvas answered you" and "there are five more in the list", and ADR-0126's device pass already carries the same question about `באזור` — a pill among round controls. If it does not read, the lever is the sheet moving after all, which is the draft's answer and is still available.
- **Whether the `מגוגל` group is discoverable below several trip matches** (§8). The ordering is defended on paper for the case that matters — no trip matches means the Google group is at the top — but "did anyone scroll to it" is a question a phone answers and a mockup cannot.

## What the mockup checked against a renderer, and what it did not

Following ADR-0130 §4's precedent, and with the same narrowness. `mockups/map-search-v1.html` was rendered in a headless Chromium against the **shipped** stylesheets inside the real layout tree, at 390×844 / 390×734 / 360×640, and it is what produced the Context table, §1's 44-in-46, §2's keyboard arithmetic and §3's match set. It also caught three things the reasoning did not have. Two are fidelity slips inherited from the Phase-8 file (ghost pins drawn with glyphs they do not carry, and the Map's retired one-off `.map-addbtn` where the shared `AddLocationButton` now sits), both fixed in the drawing rather than reasoned around. **The third is a real defect in the design as first written:** §8's Google half rendered in Trip mode is `--plan` violet on a Trip-blue surface, which is root `CLAUDE.md` rule 4 broken by a scoping change rather than by a styling choice. Nothing in the prose would have caught it; the colour did.

**This is not a claim that the surface has been seen on a phone over real tiles.** The base is faked, the keyboard is drawn, and a long press cannot be evaluated in a fake canvas at all. It is the narrower claim that the **geometry was checked against a renderer instead of against arithmetic**, and that the number which killed this phase's leading candidate is a measurement rather than an estimate.
