# Session 157 — search is a control, not a screen (Phase 10, design)

**Date:** 2026-07-28
**Kind:** design session, paper only. Output is [ADR-0131](../decisions/0131-map-search-is-a-control-not-a-screen.md), [`mockups/map-search-v1.html`](../../mockups/map-search-v1.html), and this note. No feature code.
**Phase:** 10 of the map panel's third pass (report #18). Build pending.

## What the phase was, and what it turned out to be

**As briefed:** the Map tab's search is `SearchOverlay` — ADR-0101's opaque full-screen `Modal` — so on the one tab whose question is _"where is this?"_ the answer renders as a list with the canvas hidden. Move the query onto the canvas.

**As it ended:** the Map tab becomes the place where a place is **found or made**, from three sources — the trip, Google, and the canvas itself — with one destination rule. That is roughly twice the phase the brief described, and the widening came from the owner mid-session (below).

## Three things I got right by measuring, and one I got wrong by reasoning

### The phasing note's leading candidate died on a measurement

The note's best idea was _"make the query just another list-changing control at the `half` stop"_. It was written when the controls row held three controls at rest. Measured against the real tree in the mockup:

| Screen · mode          | Spare inline width at rest |
| ---------------------- | -------------------------- |
| 390 · Trip · day scope | **163.5px**                |
| 390 · Plan · day scope | **12.8px**                 |
| 360 · Trip · day scope | **133.5px**                |
| 360 · Plan · day scope | **−17.2px**                |

A usable field wants ~150. In Plan mode + day scope the free `מסלול היום בגוגל` link rides along and **the row already overflows at 360 today**. So the field cannot join the row — it **takes** it, as the second occupant of the disclosure slot `סינון` already covers the row with. Same slot, same pinned `✕`, one three-valued state, 44px inside a 46px row so the split pays nothing.

The brief warned me to re-measure before assuming there was room. There wasn't, and the shape that replaces it is better: it removes a mechanism (the overlay on this tab) instead of adding one.

### The keyboard was the whole argument, and no mockup in this epic had ever drawn it

ADR-0101 killed search-in-place because _"once the on-screen keyboard opens it covers most of the remaining screen, hiding almost every result."_ That is the strongest possible objection to what I was proposing, and it is **true** — because on the Index the results sit **below** the field.

Here the field is at the top of the split and the canvas is **directly under it**. The keyboard eats from the bottom, so what it takes is the **sheet**, and what survives is the **pins** — which is the entire point of the phase. Measured at 390×844 `half` with an approximated 336px keyboard: its top edge is at 945 against a pane bottom of 894, so **the whole 250px canvas is still on screen**. Against 0px today.

So I drew the keyboard, and I drew the shipped overlay beside it, and the report and its answer are one toggle apart in the same tree. **The element that overturned ADR-0100 §3 had never been on a mockup page in this epic.** That is the process finding worth keeping.

### The pin ladder needed no new mark, and the trap had an answer already in the repo

The ladder is full — six tiers, two amber `box-shadow` cues, selection as an `outline` deliberately shaped to compose with them, a zoom-keyed dot degradation. There is no free axis. **So there is no match cue: a query is a filter, and the matches are the pins that remain.**

The trap the brief named is real. `searchRows` spans `allUsages`, so in day scope a match from another day is already `ghost` — hence `aside`: smaller, out of the camera, a numberless dot at wide zoom. The thing you searched for arrives wearing the paint that means _not what you are looking at_.

**ADR-0130 §3 had already written the answer for a different case:** _"the paint says what it is and the size says how much it is claiming."_ So the ghost paint stays (it is the answer to _which day_) and the `aside` ratio comes off. One clause, and because three call sites read the same predicate it reaches the ratio, the dot tier and the camera's fit for free.

**And it must not reach two others**, which is the part that would have shipped as a silent bug: the amber cues (`עכשיו`/`היעד הבא` are claims about **time** — a pin from a day you are not looking at must not make one) and the day connector (a Friday match is not on Wednesday's route). ADR-0130 said naming the reason is what kept a five-call-site split from being five silent behaviour changes; this phase reaches three of them and the ADR says which.

### What I got wrong: I answered a scoping question the owner had not asked

My first draft moved the query onto the canvas, kept `SearchOverlay` for Plan mode, and called the Trip/Plan split the scoping decision the backlog asked for. The owner rejected it in three sentences:

1. _"There are actually two modes of searching: places on the map and places from Google Maps."_
2. _"How does adding places from events/bookings work with this?"_
3. _"Adding a place by long clicking on the map."_

**All three are about _adding_ a place, and together they say the draft had the wrong subject.** I asked _which mode gets which search surface_. The real question is _where does a place come from_ — a property of the tab, not of a mode.

The draft was also wrong about the app as shipped: `＋ הוספת מקום` on a placeless booking is reachable **in Trip mode** and opens a paid Autocomplete picker there today. "Adding a place is Plan mode's business" was never true.

## The three answers

**§8 — two corpora, one control, two surfaces.** The split between the two searches is not a mode, it is **whether the thing has coordinates yet**. A trip place already carries `lat`/`lng` (that is what pinned it), so it can be a pin. A Google prediction carries **none** until the pick (ADR-0115 §2), so there is nothing to draw. **So the free half goes on the canvas and the paid half goes in the sheet**, and ADR-0115 §1's _"one control, two halves"_ becomes true for the first time on a surface that has a map. `PlaceResearch` is **re-parented, not rewritten** — it already took only `query`/`usageIndex`/`offline`, which is ADR-0115 §7's reuse audit paying off years-of-effort cheap.

ADR-0115 §6's "Plan mode only" is withdrawn, and this is the ADR §6 asked for. Its worry — a paid call on the surface people use while walking around — is answered by the **arm**, which is the control that already exists: walking and typing cost nothing, and the first paid call is a deliberate tap. Its other worry, the nearby/open-now SKU, is **not added here**. What genuinely widens is the number of surfaces from which a member can arm a session, one to two; the bounds are per-member·trip and do not move. **The lever back is one boolean and the ADR names it.**

**§9 — a place can be made.** A press-and-hold on the canvas background drops a nameless pin: no Autocomplete session, no Details call, and deliberately **no reverse geocode** (paid, for a name you are standing next to). It is the only add-a-place route that spends **nothing**. The naming step is `.map-placecard`, the host ADR-0122 §7 already built for "the row, wherever the sheet cannot show it" — and a pin that does not exist yet is the sharpest case of that. The gesture is distinguished by **hold**, so ADR-0122 §7's canvas tap keeps clearing the selection and Google's own POI tap (ADR-0125 §6) stays a different act. Phase 6b keeps its data-model questions.

**§10 — `＋ הוספת מקום` is an errand, and I had overstated the constraint.** My draft said a navigation would need a remembered return target that ADR-0090 forbids. It does not: ADR-0090 bans **reading** history, and its own Alternatives names this exact extension point (_"explicit app state feeding the snapshot — a localized, additive change to the provider + one rule in `resolveBack`"_).

And the mechanism already exists one field narrower: `MapScopeProvider` sits above the trip Shell precisely so surfaces can talk to the tab, and `useShowPlaceOnMap` already hands over a `focusPlaceId`, lands through `tabTarget('map')` with `replace`, and is consumed once. An errand is that **with a return address**. The map comes to the tab rather than the tab's map to the picker because a second live `google.maps.Map` is a **billed** load (ADR-0121 §4) and a canvas inside a sheet is the small-map-small-list failure ADR-0122 spent a session undoing.

**§11 — the rule that stops three sources becoming three flows:** the **errand** decides the destination, not the source. No errand → the shelf, as an uncategorised `MaybeItem` (ADR-0115 §3, unchanged). Errand live → assigned to the target, and the tab returns.

## What rendering it caught that the prose did not

Following ADR-0130 §4's precedent, and with the same narrowness: the mockup was rendered in headless Chromium against the **shipped** stylesheets in the real layout tree, at three phone sizes.

1. **A rule-4 violation created by my own scoping change.** `.map-arm` and `.map-addmaybe` are painted in `--plan`. That was **legitimate** while research was Plan-only. The moment §8 renders them in Trip mode it is plan violet on a Trip-blue surface — mode identity used as a button colour, which `tokens.css` forbids in its own comment ("amber/teal/plan are semantic, never CTAs"). Both move to `--cta`. **Nothing in the prose would have caught this; the colour did.**
2. **Two fidelity slips inherited from the Phase-8 file**: ghost pins drawn with glyphs `MapPane` does not give them (a ghost has no fill for one to sit on), and the Map's retired one-off `.map-addbtn` (`＋ מיקום`) where the shared `AddLocationButton` (`＋ הוספת מקום`) now sits — the latter being the very affordance §10 settles, so it had to read the way it ships.
3. **An ordering consequence worth stating rather than discovering**: the `מגוגל` group sits below the trip matches, so with several matches the arm is below the fold. That is the case where you have probably already found what you wanted; with **no** trip matches — the state you are in when adding a new place — the arm is the first thing on screen.

**This is not a device pass.** The base is faked, the keyboard is drawn, and a long press cannot be evaluated on a fake canvas at all.

## What I did not touch, deliberately

**The day-scoped-grammar defect on this exact surface.** `searchRows` reads `allUsages` but `renderList` blocks it with the **day's** `orderCtx` and renders rows without `forceDay`, so another day's hit is filed under `ללא יום` — a claim about the place where it is a fact about the scope. `renderRow` already accepts the `forceDay` that fixes it, which is what makes it look like a two-line freebie.

It ships on its own branch. The backlog says in as many words not to let it become the excuse to reshape the overlay in one session. **And I did not design around it either:** the mockup draws the rows as the corrected renderer renders them (the Friday match carries `שישי`), and correct rows are what §4 and §6 assume.

## For the build

The estimate should say out loud that this is no longer small. §1–§7 are a day on one screen. §8 is a re-parent plus removing a mode flag. **§10 is the expensive one** — an errand channel above the Shell whose return has to re-open a `Modal` the URL does not address, which makes it a third consumer of a hand-over-and-consume-once pattern the app already runs twice. Generalising the pair into one named errand channel is the right build (rule 8), not a third copy.

Two things the build must not take for granted, both rule 8's escape hatch: whether the shelf's `useHoldToDrag` extracts cleanly for a canvas long press (ADR-0121 §5 already set the policy — **ask first** if it means a substantial refactor), and that `isAsidePin` must **not** simply become query-aware, because two of its five readers would change wrongly and silently.

## Device pass

Five items, and one of them could **block** rather than tune: whether a long press works over Google's own tiles at all, against a pan that starts on move and a platform context menu that is neither detectable nor preventable everywhere. The other four are the real keyboard height and iOS's focus behaviour inside a `100dvh` PWA (the heaviest question in the ADR — the layout viewport does not shrink there, only the visual one), whether a 44px field reads as a field over real tiles, whether a promoted ghost reads as "what you searched for, from another day" or as a contradiction, and whether a camera that does not move reads as quiet or as broken.
