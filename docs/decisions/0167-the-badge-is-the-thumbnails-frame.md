# 0167 — The badge is the thumbnail's frame, and selection is where a place says more

**Status:** Accepted, and **BUILT** (design; owner sign-off 2026-08-05 on three forks; §1–§11 shipped across build-plan Phases 4–6). **AMENDED ELEVEN TIMES — read §11 first: it supersedes §10, §9 supersedes §3 for a committed place, §17 corrects §16 twice over (the pin's photo gate has two axes, and its "no test can see this" was too generous to itself), and §18 then retires one of those two axes outright — a pin now draws its photograph wherever it draws its glyph, the canvas-height gate having been a right measurement with a wrong conclusion. §12–§16 record what the build measured** — where §1's row numbers came from, the attribution gap §4 was resting on (now closed), and the two parts of this ADR that were dead by the time it was built. Hours (§7, §9.2) are the one section still unbuilt, blocked on ADR-0166's OSM provider. §15 is the last piece of §9 to ship: the **deciding card**, now that ADR-0166 §17 lets the pipe reach a place nobody has added — the same component as the committed card, at a third density. §16 opens the canvas half of §1 (a **photograph on the pin**) with a measured mockup and one fork left for the owner. The first mockup was drawn against a stripped-down row and the owner rejected it as incomplete; the real card is a grid with one scrolling track and four pinned rows. §9 has the redesign: hours ride the meta line at 0px, the summary gets a pinned two-line expandable block, and the hero leaves the committed card for the deciding one.
**Date:** 2026-08-05

**Design reference:** [`mockups/place-enrichment-v1.html`](../../mockups/place-enrichment-v1.html) — rendered and measured in Chromium at 390×844 (DPR 2), in both themes. Every place name, summary, credit, opening-hours string and aspect ratio in it is real data from the [coverage spike](../planning/2026-08-04-session-213-place-enrichment-coverage-spike.md); **the photographs are synthetic** (see §8).

**Closes** [ADR-0166](0166-place-enrichment-is-a-multi-source-pipe.md) §10, which gated Phase 1 on a design pass and named two questions; §11.5 added a third and §13 a fourth. All four are answered here.
**Refines:** [0121](0121-embedded-map-phase-6-design.md) §8 (the row's selection reveal gains a block; the row's one Google exit is unchanged — §6), [0147](0147-a-place-is-made-on-the-canvas.md)/[0165](0165-a-place-says-what-it-is.md) (a picked icon's standing, now tested against a fetched photo — §2)
**Applies unchanged:** [0004](0004-integrations-are-pipes.md) (no new screen), [0017](0017-mobile-first-device-targets.md), [0028](0028-plan-violet-color-budget-dark-ready.md) (no new hue), [0109](0109-map-tab-design.md) §7 (we do not offer what we do not have), [0118](0118-numbers-in-hebrew-bidi.md) (and §8 records the mirror-image bug it did not cover), [0158](0158-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md)

## Context

ADR-0166 decided the enrichment pipe and then stopped, because **there is no image anywhere in this app today** — the hero (ADR-0160) lifts a horizon, not a picture — so where a thumbnail goes was not an architecture question. Two measured facts from the spike frame every decision below:

- **Coverage is lopsided.** Landmarks scored 14 of 14 for images; **Tokyo restaurants scored 0 of 7**. So the design's common case is a place we know nothing about, and an image-led layout would be wrong for most rows in a real itinerary.
- **Attribution is the default, not an exception.** 27 of 32 files require visible credit.

And the surface is tight: `.place` is a **73px** row whose every slot ADR-0147 already called "measured-spent".

## Decision

### 1. The badge becomes the thumbnail's frame — no new slot

The row already leads with a **40×40, `border-radius: 12px`** badge that is always filled and is already the tap target for framing the pin ("the way to the pin", ADR-0121 §8). A photo fills its **interior**; nothing else moves.

- **The category hue survives as a ring**, not a fill — so no hue leaves ADR-0028's budget, and the row keeps saying what kind of place it is even when a photograph is showing.
- **Rows without an image are unchanged.** That is the point: with restaurants at 0 of 7, a dedicated thumbnail slot would be empty on most rows and the list would go ragged. Here the slot is always full — with a glyph, as today, or with a photo.
- **Measured: collapsed rows stay at 69–71px.** The badge-as-frame costs nothing, which was the whole claim and is now checked rather than asserted.

Rejected: **a separate thumbnail beside the badge** (costs width on a 360px screen and goes ragged on the majority of rows), and **no thumbnail in the list at all** (safest for density, but it discards most of what "images, also used as thumbnails" asked for).

### 2. A picked icon beats a fetched photo

Resolution order for the badge's fill: **a picked icon → a fetched photo → the derived glyph.**

ADR-0147 stores `Place.icon` only when a **human picked it**, and ADR-0166's founding line is that the trip's opinion is never overwritten by the world's facts. A photo silently replacing a glyph someone chose is that rule broken on the most visible pixel in the row — and it would be broken automatically, by a background fetch, on a surface the person did not touch. The photo is still one tap away on the card (§3).

This is the same boundary ADR-0166 §1 draws between `Place` and `PlaceEnrichment`, applied to a 40px square: **if a human said it about this trip, it wins.**

### 3. Enrichment lands in the selection reveal, in a fixed order

Everything enriched renders in **`.map-refs`** — the full-width third line that already appears on selection and already carries its own `border-top` (ADR-0121 §8). An unselected row pays nothing, which is exactly the bargain `.map-rename` already struck one slot over.

The order is fixed, and it is the order of decreasing certainty: **hero → credit → summary → hours → way-through.**

- **The hero is 132px**, full row width, `object-fit: cover`.
- **The summary is clamped to three lines.** Real extracts run from 86 to 1,321 characters (ADR-0166 §11), so an unclamped extract would destabilise the card by an order of magnitude between two places.
- **Measured: a fully enriched card is 392px — 46% of a 390×844 viewport.** The empty one is 134px. Both are stated so the build inherits a number rather than a surprise.

### 4. Attribution renders on the card, under the image

Photographer `·` license, 11px, muted, directly beneath the hero. Not overlaid on the photograph: an overlay fights whatever is behind it (a bright sky) and has to be re-solved for dark mode, whereas the card surface is stable in both themes.

**The 40px badge carries no credit and needs none.** CC permits attribution in a manner reasonable to the medium, including via the resource the image leads to — and the badge leads to the card, one tap away, where the credit is. This is the standard thumbnail-plus-detail reading and it is why §1 is possible at all: a credit line cannot exist in a 73px row.

Nine distinct license strings appeared across 32 files (`CC BY-SA 3.0 de`, `CC BY-SA 2.5`, GFDL, CC0, PD…), so the line renders **the stored string**, never a normalized label — which is also why ADR-0166 §4 stores it per file.

### 5. An English summary is marked, and marked in one word

`באנגלית`, a `.map-tag`-grammar chip inline before the text. No new component, no new hue, no second treatment of the prose itself.

This exists because the owner chose to keep summaries in Phase 1 with an `he` → `en` fallback (ADR-0166 §11.5) and Hebrew covers only 9 of 27 Tokyo places — so **most places that get a summary at all will show English** in a Hebrew RTL app. The marker is what keeps that honest rather than jarring.

The prose itself takes `dir="auto"` and nothing else. It is third-party text that can carry any script — the sample includes Japanese inside Hebrew — and the browser's bidi algorithm orders embedded runs correctly once the paragraph direction is right (§8).

### 6. `עוד בגוגל` is always present, and is never `ניווט`

The way through to Google (ADR-0166 §13) sits in the reveal's footer, on the **selection card only**.

- **The collapsed row keeps exactly one Google exit** — `ניווט` — so ADR-0121 §8's density argument holds precisely where it was aimed.
- **The label carries the difference.** `עוד בגוגל`, never `מפה` or `צפה`, because a second control that reads as "view the location" is the competing destination §8 refused. This one answers _what does Google know_, which our map does not.
- **When we know nothing, it is the only thing in the block** — and that is the majority case (0 of 7). So the empty card is not an empty state to apologise for; it is a card whose whole content is the way to the answer. Nothing is drawn where a summary would be (ADR-0109 §7: we do not offer what we do not have).

### 7. Hours carry an "as of"

Hours are the one semi-volatile field (ADR-0166 §3), and a stale `open until 18:00` read at 17:50 is this feature's worst possible failure. So the line always states its own freshness, and the **raw OSM expression is what is stored** — 13 distinct syntax shapes appeared across 15 values, including seasonal overrides and past-midnight ranges, so no display may be derived from a seven-row weekly model.

## What rendering it found

Two defects that reading the CSS would not have produced, and both will recur in the build.

**1. The hue ring did not survive the photo.** An `inset` box-shadow paints above the background and **below** the element's children, so the image covered it completely and the badge silently lost its category — the exact thing §1 claims survives. It needs an overlay `::after` above the image (which also buys a hairline, so a dark ring holds against a bright sky). The first draft of §1 was wrong in a way only a browser could say.

**2. The credit line orphaned itself to the wrong edge.** It is Latin, so `dir="auto"` made the **whole element** LTR: correct internal ordering, then aligned left while every other line in the card sits right, visually detached from the image it credits. The element must stay RTL and isolate the Latin run inside it — the `ltrIsolate` half of ADR-0118, not the `dir` half. Worth naming because ADR-0118's guard reads `dir="ltr"` attributes and cannot see this: it is the **mirror** of the bug that ADR was written for, and it will appear on every enriched Latin string (`Kakidai · CC BY-SA 3.0`, an English summary, a place name).

**And one measurement that changed a decision.** Shrinking the hero from 132px to 96px moves the card only 392 → 356px, because the height is five stacked elements rather than the image. The hero looked like the lever and is not, so it keeps its size — a better picture for 36px.

## Consequences

- **No new slot, no new hue, no new component.** The badge, `.map-refs`, `.map-tag` and the existing button grammar carry all of it. The two new declarations are the badge's photo ring and the enrichment block's own layout.
- **`נווט` is untouched and the collapsed row is untouched.** Every claim in ADR-0121 §8 that this does not revise stays true by construction.
- **The build inherits numbers, not intentions:** 69–71px collapsed, 392px enriched, 134px empty, 132px hero, three-line clamp.
- **Two bugs are pre-empted** (§8) that the frontend lint guard cannot catch.
- **New Hebrew copy:** `באנגלית`, `עוד בגוגל`, `שעות פתיחה`, and an "as of" phrasing — all in `i18n/he.ts`, all obeying the separator rule (`·`, no em dashes).

### 9. Amendment (2026-08-05, same day) — v1 designed against the wrong card

**The owner rejected v1 as incomplete, correctly.** It drew a stripped-down row. The real selection card carries an order counter, a lock, a rename, three meta tags, a notes section with its own header and list, one or two reference rows with their settle pairs, a primary `שיבוץ ליום` and a delete — and, decisively, **it is a grid with exactly one scrolling track**. Four of its five rows are pinned by the owner's own rule, quoted in `map.css`: _"only the notes themselves should be scrollable, everything else is locked."_ Bolting §3's 132px hero and 3-line summary onto **that** would have made a capped card ~538px, **64% of the screen**.

The redesign is in [`mockups/place-enrichment-v2.html`](../../mockups/place-enrichment-v2.html), and the owner's brief for it was explicit: the summary must be **included and very easy to reach** (1–2 lines, expandable), rearranging what is already there is fair game, and _"I'm not afraid of drastic changes, the app is not GA yet."_

**1. The governing principle: enrichment is for deciding, and once you have decided it compresses.** A photo and a summary of a place you have already committed to — whose booking you hold, whose notes your group has written — competes with content the traveller needs more. So the two surfaces diverge:

- **A place you are still deciding on** (a Google result, a shelf idea) has no notes, no references and no schedule action, so the **hero and the summary get the room they are actually for**. Measured: 361px.
- **A committed place** compresses. This is where the owner's brief bites, and it is answered by two rearrangements rather than by finding a corner.

**2. Hours ride the meta line, and therefore cost nothing.** `פתוח עד 17:00` becomes another tag on the row's existing wrapping meta line beside the time and the area. **Measured: the meta line is 17px with or without it — 0px.** §7's own pinned line was costing 19px when it fitted and **43px when the freshness tail wrapped**, which is more than the hours were worth. The "as of" detail moves to the expanded state.

**3. That buys the summary a pinned two-line block under the identity.** Always visible, `עוד ›` to expand. **Measured: 64px collapsed, 108px expanded** — and the extra 44px is borrowed from the **notes scroller**, which is the flexible track, so nothing is lost and the notes still have 114px at a 420px cap. The credit line appears with the expansion, where there is room for it.

**4. The committed card gets no hero.** The badge already carries the photograph at zero cost (§1), and 132px of picture on a place you have already chosen is the least valuable block on a capped card. The hero stays on the deciding surfaces.

**5. `פתקים` keeps its name and its scroller.** The rejected alternative put the summary _inside_ the scrolling track and renamed the section to `מה ידוע` — which costs no pinned height but makes the group's own writing share a region with fetched text, on a surface the owner specified personally. The pinned block keeps that boundary intact.

**One more defect rendering caught**, and it is a specificity fight rather than a layout one: `.summary`'s `-webkit-line-clamp: 3` silently overrode the two-line clamp because it is declared later, so the "two-line" block rendered three lines and measured 20px more than designed. A clamp that varies by state has to be written on the compound selector, not as a sibling class.

### 10. Amendment (2026-08-05, third) — the full picture is FULL SCREEN, and one bug of my own

The owner tested v2 on a real phone and asked for two things: the misalignment fixed, and _"a way to view the full picture even for saved places … let's get creative here."_

**1. The misalignment was a bug I introduced, and its lesson is narrow.** When the summary moved inside the pinned `.sumblock` (§9.3) I stripped its `grid-column: 1 / -1`. On the _deciding_ card the summary is still a **direct grid child**, so it landed in column 1 — an `auto` track — and squeezed the `1fr` name/meta column to **zero width**, which is why the identity row came apart character by character. Measured before and after: **name width 0px → 223px.** The rule worth keeping: **a full-row span belongs to the host that places the element, not to the text's own class** — the same class now serves two contexts, and only one of them is a grid child.

**2. A bigger thumbnail inside the card does not work, and it is measured, not asserted.** The obvious reading of "view the full picture" is to reveal a hero on expansion. Built and measured: a 116px hero inside the expanded block leaves the notes scroller **31px**, which is unusable. The card is capped by the canvas, so anything the picture takes comes straight out of the group's own notes.

**So the full picture is the app's existing zoomable image preview, at full screen** — which is more than a hero would ever have given, and adds no surface: ADR-0062 permits zoom in exactly one place, an image preview, and that surface already exists with a travel-from-the-tapped-element entrance and a back-stack contract.

**3. Its entry point is the credit line, which licensing requires anyway.** The expanded block's credit becomes a row: `Kakidai · CC BY-SA 4.0` at the start, `⤢ תמונה מלאה` at the end. **0px** — the line already had to be there for the 84% of files that demand attribution (§4), so the way to the picture and the obligation to name its author are the same line. Progressive disclosure lands at three levels, none of which costs pinned height beyond §9's 64px: **badge photo → two-line summary → expanded summary → full-screen preview.**

**One build question this raises rather than answers** (ADR-0096): `DocumentViewer` is **document-shaped** (`doc: DocumentSummary`), not image-shaped. Reaching it for an enrichment photo means generalizing it, which may be a small extraction or a substantial refactor — so the build should look and **ask** before either widening it or adding a second viewer beside it.

### 11. Amendment (2026-08-05, fourth) — expanding is a MODE CHANGE, and the badge must not clip

Two owner notes on the v2 build, and the first replaces §10.

**1. Expanding a saved place shows the research card. One presentation, not two.** §10 made expansion reveal a bigger picture; the owner's proposal is better and supersedes it: **expanding shows the same card an un-added research place gets** — hero, full summary, credit, hours — with a way back to the itinerary detail.

Why it is better, stated plainly because it corrects my own design: §9 had left the app with **two card designs** for the same entity, a committed one and a deciding one, differing in which enriched fields they show. This collapses them. The deciding card _is_ the expanded state, so there is one presentation to build, test and keep consistent, and the compressed state is a **collapse of it** rather than a second design. It also answers "view the full picture" more completely than §10 did: you get the picture _and_ the full summary _and_ the credit in one move, in a shape already seen elsewhere in the app.

And it dissolves §10's measured problem instead of working around it. §10 found that revealing a 116px hero _inside_ the card leaves the notes scroller **31px**, because the card is capped and the picture eats the group's own notes. That only bites if expansion is **growth**. Making it a **mode change** means the notes, references and schedule footer are not on screen at the same time as the hero — you are looking at the place as a subject rather than as an itinerary item, and you go back to see the itinerary. Measured: the expanded state is **342px** against the research card's **361px**, i.e. the same card.

The full-screen zoomable preview (§10's ADR-0062 reuse) is **not retired** — it stays as the level below, reached from the hero on the expanded card. What is retired is §10's credit-line entry point, which existed only because the picture had nowhere else to go.

**2. The badge must not clip its own children — and this would have shipped.** The owner spotted "a white quarter circle on the top right" of a thumbnail. It is a bug, and its cause is the design: I rounded the photo with `overflow: hidden` **on the badge**, and the badge hosts children that **deliberately overhang it** — the order counter at `-6px`, and the ring overlay. Clipping the badge clipped the counter to a quarter-circle in the corner. The shipped `.map-badge` carries **no `overflow`** at all, which is precisely why.

So the photo clips on an **inner element** and the badge stays unclipped. The general rule, worth more than the fix: **`overflow: hidden` on a positioned host silently truncates anything designed to overhang it** — and on this badge the overhang is a numbered pin, so the failure looks like a rendering artifact rather than a layout decision, which is why it survived my own render pass and needed a human eye on a real device.

### 12. Amendment (2026-08-05, fifth) — what the build measured, and where §1's numbers came from

§1 and §2 are **built** ([session note](../planning/2026-08-05-place-enrichment-phase-4-built.md)). Three corrections, all found by measuring the shipped surface rather than by reading:

**§1's "collapsed rows stay at 69–71px" is the MOCKUP's box, not the app's.** A real `.place` measures **64px**, and two adjacent rows are **73px** apart — the box plus its 9px `margin-bottom`, which is the 73px §Context already cites for the shipped row. Both numbers are right about different things, and the ADR did not say which was which. The e2e spec asserts the **pitch** and the two rows' equality; a future phase inheriting a number from `mockups/` should re-derive it the same way (`docs/design/mockups.md` says exactly this, and it is what found this).

**§11.2's ring is a real element, not an `::after`.** Both of this badge's pseudo-elements are already spoken for — `::before` is the order counter and `::after` is the hit-area expander that makes the badge tappable at 40px. Same stacking, one more element.

**Clearing the category fill takes a rule in the HOST's stylesheet too.** `background: none` on `[data-photo].map-badge` ties with `.map-badge.cat-food` on specificity — one class plus one class — so import order decides it, and `map.css` loads later. Only visible with an alpha thumbnail, which is why it needed a test rather than an eye.

### 13. Amendment (2026-08-05, sixth) — the collapsed card, and the footer the mockup drew smaller than it is

§9.3, §5 and §6 are **built** ([session note](../planning/2026-08-05-place-enrichment-phase-5-built.md)). Two corrections and one gap this ADR created and has not yet closed.

**§6's third footer control leaves the footer full.** Measured against the shipped stylesheets: `שיבוץ ליום` 118px + `עוד בגוגל` 83px + `מחיקת המקום` 116px + two 16px gaps = **349px** against **332px** of footer at 390px and **302px** at 360px. At 360 `.map-refs-foot` wraps and costs a second 44px row; at 390 it is marginal enough to go either way on font metrics alone — it wrapped locally and fit in CI. v2 drew all three on one line because **its delete is a bare `🗑` glyph** where the shipped one is a labelled 44px control (ADR-0157 §2 chose the label). Shipped as-is, because when it does wrap the control that drops is the **destructive** one, which thereby gains distance from the primary rather than sitting 16px from it. The owner's alternatives are recorded in the note: accept it, unlabel the delete, or move the way through out of the footer. **Same class of finding as §12's row height — a number inherited from a mockup whose CSS is not the app's** — with a second lesson attached: **a layout that is one label's width from wrapping cannot be asserted as wrapping**, because Hebrew metrics differ per machine. The spec asserts the floors, the containment and which control drops.

**§5's marker is a sibling of the prose, not inline inside it.** Either reason settles it alone: `dir="auto"` sniffs the first strong character, so a Hebrew chip inside the prose element lays an English extract out RTL — the inversion §5 exists to prevent; and the two-line clamp needs `display: -webkit-box`, which lays element children out as boxes, so the chip would eat one of the two lines.

**And the attribution gap this ADR opened: §4's argument for a credit-free badge is not true yet.** §4 permits the 40px badge to carry no credit because _"the badge leads to the card, one tap away, where the credit is"_ — and §9.3/§10.3 then moved the credit to the **expanded** card, which §11.1 made a mode change that is Phase 6's. So from Phase 4 until Phase 6 the app renders CC BY-SA photographs and prose with **no attribution anywhere**, against 84% of measured files requiring visible credit. Nothing here is wrong on its own; the three amendments moved the credit without re-checking what §4 was resting on. Phase 6 closes it, and this is the reason it is the next phase rather than a later one.

### 14. Amendment (2026-08-05, seventh) — the card is built, and two things in this ADR were dead by the time it was

§10–§11 are **built** ([session note](../planning/2026-08-05-place-enrichment-phase-6-built.md)). Three notes for whoever reads this ADR next.

**§10's credit-line entry point was already retired, and the mockup proves it twice.** §11.1 says so in words, and `mockups/place-enrichment-v2.html` says so in code: its `.creditrow` and `.full` rules exist in the stylesheet and **no markup uses them**. Building `⤢ תמונה מלאה` from §10.3 would have shipped a control this ADR had withdrawn. The hero is the way to the picture.

**The expanded card needs its own grid, which §11 did not anticipate.** The collapsed card's grid is selected by `:has(.note-sec)`, and the mode change stops rendering the notes — so every block would be unplaced. It gets a `:has(.map-hero)` shape whose flexible track is the **summary**, the one thing that can grow without bound in that state, exactly as the note list is in the other.

**The expansion owes the back stack a layer**, and nothing in §11 says so. It is a state a mounted screen enters and leaves, with a visible way out, which is the case `frontend/CLAUDE.md` names — so back peels expansion → selection → tab. Worth adding here because the next surface built as "a mode of an existing screen" inherits the same obligation and the ADR that designs it will be as silent about it as this one was.

**And the attribution gap §13 recorded is closed by this phase**, which was the reason it went next.

### 15. Amendment (2026-08-05, eighth) — the deciding card ships, and it is the same component

§9.1 designed the deciding card and measured it at 361px, and until now it could not exist: enrichment reached only places the trip holds. [ADR-0166 §17](0166-place-enrichment-is-a-multi-source-pipe.md) extended the pipe to a candidate, and this is what the surface did with it.

**One presentation, and the rule that says so is §11.1's.** §11.1 kept the collapsed and expanded place cards as one component because the collapsed card is a collapse of the other. The two rows are a harder case for the same rule — `PlaceRow` and `ResultRow` are genuinely different components — so the three blocks became **`ui/domain/PlaceKnowledge`**, which both render. It emits a **fragment**, not a wrapper: each block is a child of the row's own layout (a wrapping flex line in the list, a grid row in the bounded card), which is the mockup's own note in its own stylesheet — _"the span belongs to the host, not the text."_ Copying the blocks into `ResultRow` would have been the fourth entry in root rule 8's list of parallel copies somebody later had to collapse.

**Three densities, and the deciding one is the mockup's own numbers.** `collapsed` (two lines and `עוד ›`), `expanded` (hero, credit, released summary), `deciding` (hero, credit, **three** lines). The three-line clamp is not a new choice: `.summary` in `place-enrichment-v2.html` is `-webkit-line-clamp: 3` and its `.clamp2` variant is the _committed_ card's. It stays clamped rather than expandable because this card has nothing to swap off — there is no notes section, no reference list and no schedule footer to trade for the room, which is the whole of §9.1's inversion — so the third line is the floor and the way to the rest of the text is the row's existing Google exit.

**Two things in the mockup's deciding column were deliberately not built**, and both are controls rather than content: it draws `ניווט` in the trailing slot and moves `＋ אולי` into a footer beside `עוד בגוגל`. [ADR-0134](0134-the-map-is-where-a-forms-place-comes-from.md) §5 settled those two controls for this row _after_ the mockup was drawn — the icon-only Google exit beside one labelled verb, measured, with stacking rejected at 106px vs 68px per row. This change is about the enrichment blocks; re-opening the row's control set would be a different decision with its own measurement.

**And a latent defect of §14's, found by building beside it.** §14 gave the expanded card a `:has(.map-hero)` grid — but `display: grid` was only ever set by the collapsed card's `:has(.note-sec)` selector, which the mode change stops matching, so both of that state's rules were **inert declarations on a flex row** and the card's height bound did not apply to it either. Its summary is the one unbounded thing in the app's most space-constrained surface, so it is now inside the same arithmetic as the note list. The deciding card is excluded from all of it on purpose: a fixed hero, one credit line and a three-line clamp have no track that needs to be the flexible one.

### 16. Amendment (2026-08-05, ninth) — three fixes from the live build, and the canvas half of §1 is open

The owner used the shipped surface and reported four things. Three were defects with one right answer each, fixed and tested; the fourth is a design question this ADR had left for later, and it now has a measured mockup.

**1. A place saved off the shelf lost its enrichment** — _"Not even after waiting."_ Not a surface bug: `EnrichmentService.enrich`'s early return, the one that **is** the negative cache (ADR-0166 §6.4), returned without notifying. A pass runs on every pick, and a picked place very often has nothing to fetch — its row was stored before it was added (the deciding surface asked for it, §15) or another trip already holds it — so the client that had just created the `Place` learned nothing until its next snapshot. The fresh path now nudges too. Worth recording as a shape rather than a typo: **the pre-save trigger did not create this hole, it made the common case land in it.** Two trips adding the same place had it from the day the store went global.

**2. Leaving the map extreme left the selection wherever the list happened to be.** A selection made at the `map` stop cannot scroll anything — there is no list on screen, which is exactly why `select` returns early there and why the place surfaces as a card on the canvas (ADR-0122 §7). Switching to `רשימה` then showed the list at its old offset with the selected card, now carrying a summary and a note section, clipped by the tab bar (the owner's screenshot). The centring is now a function with two callers: a pin tap at a list stop, and the **stop change** itself.

**3. The summary opens the card, not just `עוד ›`.** Owner: _"I would like clicking on the summary to also expand."_ The clamped text is the thing you are trying to read, so it is the target; `עוד ›` stays as the named, focusable control, and a `role="button"` around the block would have nested one interactive element inside another for no gain.

**4. `Map pins should also show the thumbnail (think how to do this aesthetically)` — mockup, not code yet.** §1 put the photograph in the badge and ADR-0109 §3 calls the pin the badge on the canvas, so this is the same decision one surface over. [`mockups/place-pin-thumbnail-v1.html`](../../mockups/place-pin-thumbnail-v1.html) draws three treatments against the real pin CSS and measures them:

- **A — the photo fills the teardrop**, hue moving from fill to ring (the badge's own move). **21px of photograph at a 34px pin, 35px at 56px.**
- **B — A, gated on the size the canvas resolves**: photo at the map extreme, glyph at `half`.
- **C — a second silhouette** (the badge's rounded square with a hue pointer): **31% more picture** at the same pin height, and the canvas stops being one shape.

**The number that decides it is 34px.** Pin size is a share of the canvas (ADR-0123), so at the `half` stop — where the list is the surface and the canvas is a strip — a photo is 21px, which is a texture: you can tell a bright building from a dark interior and nothing else. The category glyph carries more meaning than that. At the map extreme the head is 35px, which is the size §1 already accepted a photograph at.

**The owner took B** (_"definitely not C, leaning B"_) and it is **built**. Three things about the build are worth carrying, because each is a decision the next person would otherwise re-take:

- **The gate is a `@container` query, not a prop.** The pane already declares `container-type: size` and the pin's size is already `clamp(34px, 11cqh, 56px)`, so "is this pin big enough to read a photograph" is a question CSS can answer on its own: `@container (min-height: 436px)` — 48px of pin. A stop change therefore draws or drops every photograph with **no re-render, no new `MapPane` prop and no marker re-diff**, which is the cost ADR-0121 §4 exists to avoid.
- **The photograph is the same one the row's badge shows**, resolved by the same `badgePhoto`. That is not tidiness: §2's rule (a picked icon beats a fetched photo) would otherwise hold in the list and not on the canvas, and the same place would say two different things about itself.
- **The clip goes on an inner element.** `.pin-b` carries no `overflow` on purpose — the order counter overhangs it — so clipping the head would cut that counter into a quarter-circle, which is §11.2's trap and cost a release once already.

**And the inconsistency B was suspected of is grammar this canvas already had:** every pin degrades to a **dot** below `MAP_ZOOM.DOT_BELOW`, so "the pin says less when it is smaller" predates the photograph. The gate joins that ladder rather than starting one.

**Two more reports came in on the same surface** and both are the same class of thing as §14's inert grid — a rule that is right in one host and wrong in the second:

- **The way back was 14px above its own line.** `.map-know-more` carries `align-self: flex-start`, which is correct inside `.map-sum` (it hugs the first line of baseline-aligned prose) and wrong in `.map-backrow`, where its neighbour is a 30px pill. Answered at the new host, not by restyling the control.
- **The expansion still opened below the fold at `half`.** §11.1's mode change adds ~300px to a row in a ~380px scroller, and the selection reveal's own answer to exactly that (ADR-0135 §8: `nearest`, deferred a frame) had never been extended to it. The scroll helper now takes its block mode as a parameter — `center` when the row may be anywhere, `nearest` when it is on screen and only what grew below it needs bringing in.

**And a third round on the same scroll, which is worth recording as a method note rather than a fix.** §6's answer (`nearest` for a grown row, `center` for a distant one) did not work, and every test passed while it did not: `nearest` is a **no-op on a box taller than the scrollport**, and `center` puts a tall card's identity row above the fold. The owner asked for the top of the card and that is now the single mode — **`start`, superseding both ADR-0135 §8's `nearest` and §6's `center`** — with the air above it as `scroll-margin-top` on the row. The lesson: the unit test asserted that the scroll was **called, with a mode**, which was true both times; it could not assert **where the card ended up**, and the defect lived entirely in that gap. Alignment claims belong in a rendered browser, which is the same rule this ADR already learned about box numbers (§12).

**What no test can see, and the honest limit of this build:** the gate is a container query and the canvas needs a Maps key, so neither jsdom nor the hermetic e2e can render a photographed pin. What is asserted is the markup and the resolution (which photo, and a picked icon still winning); the mockup carries the measurement, and whether a real Commons photograph reads at 35px on a moving map is the device pass.

### 17. Amendment (2026-08-05, tenth) — the gate has two axes, and §16's "no test can see it" was too generous to itself

The owner opened the tab on a real trip and the pins were **empty**: a full-size numbered stop, its head the card colour, a thin category ring around it, no glyph and no photograph in it. Reported as _"the thumbnails aren't rendering into the pins … I think that only when zoomed out. There are scenarios, for example when filtered for today, that even when zoomed out the pins are full size, and in these cases there's no thumbnail."_ The second sentence is the diagnosis: it separates the pin's **size** from the pane's **zoom**, which is exactly what §16 had conflated.

**The gate has two axes and §16 built one.** Whether a photograph can be read is a question about the pin's size — that is the container query, and it was right. Whether the pin is a **dot** is a second question, and it is not the pane's to answer: `data-pins='dot'` says the zoom is below `MAP_ZOOM.DOT_BELOW`, but the tier that follows from it is **scoped** (ADR-0128 §1, amended twice) — in day scope only the `.aside` pins degrade, in all-days everything but the amber ones does. §16 hid the photograph off the pane's attribute alone, so a stop that stayed a full teardrop lost its picture.

**And losing the picture did not undo the paint, because `:has()` tests presence, not display.** The photographed treatment — hue from fill to ring, glyph dropped — keys on `:has(.pin-photo)`, which is true whether or not that element is drawn. So the pin kept the frame and lost the photo: an empty head. That is the general trap, and it is worth more than this fix: **a rule that hides an element does not retract the rules that were written because the element is there.** Both now hang off the same condition — the photograph drops in the very rules the glyph drops in, and a pin that stops drawing it takes its hue back.

**A second defect fell out of the specificity, unreported and worse.** `:has()` carries its argument's specificity, so `.map-pin:has(> .pin-b > .pin-photo) .pin-b` (four classes) silently outranked `.map-pin.nextstop .pin-b` (three): **a photographed next stop lost its amber outline** — the single accent ADR-0109 §6 spends the canvas's whole budget on, traded for a category ring by an accident of selector arithmetic. The category ring now yields to the two time cues explicitly. Note which way the error ran: the newest rule won, quietly, over the oldest and most important one.

**The five-rules-per-consumer shape is what let both through.** The hue was written once as a fill, once as a ring and once as a ghost's outline — fifteen rules for one fact — so nothing about a pin's colour was in a single place to be reasoned about. It is now `--pin-hue`, the same move `.map-badge` already makes with `--badge-ring` (§1), and a sixth category is one line instead of three blocks.

**§16's closing paragraph was wrong, and it mattered.** It said neither jsdom nor the hermetic e2e can see any of this, and treated that as the end of the argument — which is how a container query, a `:has()` and a specificity tie shipped with no test between them. What cannot be tested is the **canvas**: the Maps key, the tiles, the moving map. The **rules** need none of that. [`e2e/map-pin-photo.spec.ts`](../../frontend/e2e/map-pin-photo.spec.ts) loads the app's own `tokens.css` and `map-pane.css` over markup mirroring `MapPane`'s pin and measures it in Chromium: five of its nine assertions fail against the shipped stylesheet, including the amber one nobody had reported. The device pass keeps only the question it always owned — whether a real Commons photograph reads at 35px on a moving map.

### 18. Amendment (2026-08-06, eleventh) — the size axis is retired: a pin draws its photograph wherever it draws its glyph

> _"On half mode (both on map and map search), the pins don't render the thumbnail image. This was
> chosen and implemented this way intentionally, but after playing with that I realized that the
> experience is worse and confusing, so I think that we need to be more consistent and render
> thumbnails when displaying a pin. When the pin becomes a small circle, then we can stop rendering
> the thumbnail image, same way it is with place icons."_ — owner, 2026-08-06

**§17 said the gate has two axes. It has one.** The pin's TIER survives; the canvas's HEIGHT is gone, and `@container (min-height: 436px)` goes with it.

**What is being reversed is not the measurement but the conclusion drawn from it**, and that distinction is the whole of this entry. §16's number was sound: 436px of pane is 48px of pin, 48px is where the head clears ~30px of picture, and at `half` a phone canvas is ~300px → a 34px pin → **~21px of photo**, which the mockup read as a texture rather than a subject. All of that is still true. What it got wrong is that it weighed a single pin in isolation, and the cost it missed is only visible in use: **a pin that shows a photograph at one sheet stop and a glyph at the next is the same object changing what kind of thing it is, on a drag.** That inconsistency costs more than a small picture gains, and no mockup of one pin at one size could have produced that finding — only using the surface could.

So the rule is the axis the owner named, and it is the one this canvas already had before the photograph arrived: **the photo drops exactly where the glyph drops.** One threshold, `MAP_ZOOM.DOT_BELOW`, expressed in the very same rules — not a second, differently-shaped one beside it. "The pin says less when it is smaller" survives; what it did not need was two definitions of smaller.

Three consequences worth stating:

- **The trap §17 named is still live and now has a single guard.** Any rule that hides the photograph must also hand the head its hue back, because the photographed paint keys on `:has(.pin-photo)` — presence, not display. The dot tier's own `background: var(--pin-hue)` is that guard, and it is the only place that needs it now.
- **`--pin-base`'s floor becomes load-bearing for legibility, where before the container query was.** A 34px pin is the smallest a photograph is ever drawn at, so if a photo at that size turns out to be noise on a real screen, the answer is ADR-0123's floor, not a new gate here.
- **[`e2e/map-pin-photo.spec.ts`](../../frontend/e2e/map-pin-photo.spec.ts) keeps both heights** rather than collapsing to one. `SHORT` is the canvas that used to withhold a photograph, so it is the sharpest place to assert both halves of the new rule: the photo IS drawn there, and the dot tier still takes it away there. §17's lesson about what a test can reach applies unchanged — the container query is gone, the `:has()` and the specificity tie are not.

## What this does not settle

- **Whether a real photograph is legible at 40px.** The mockup's images are synthetic (§Design reference), so crop _geometry_ is honest and _content_ is not. This is a device pass with real Commons files, and it is the one question the file cannot answer.
- **Where the thumbnail goes on the app's other surfaces** — shelf ideas, event rows, the Index, the hero. This ADR covers the place row and its selection card, which is where enrichment is reached from today; the rest is a second pass once the badge's behaviour is real.
- **The empty card's exact chrome.** 44px of `.map-refs` for a single button is measured but not tuned, and it is the majority case, so it deserves a look on a device.

### 19. Amendment (2026-09-05) — the day rows join §1, and §4 gets its second half ([ADR-0219](0219-a-day-is-a-place-you-can-see.md))

**§1's frame was built for one host and left unfilled on the two that see it most.** `PlaceBadge` has taken `photoUrl` since Phase 4 and only `Map.tsx` passes it; `EventCard` (both variants) and Plan's `BuilderRow` render the same badge with nothing in it. ADR-0219 §1 has them pass it — measured at ⁦0px⁩ (event card ⁦71px⁩ → ⁦71px⁩, builder row ⁦69px⁩ → ⁦69px⁩), with **no category ring** (those badges were always `--paper`) and with §2's rule widened one level: an icon a human picked **on the event** beats the photo exactly as one picked on the place does. `TransitionRow`, `StayRow` and `MaybeCard` deliberately do not join — a 32px circle-dot (ADR-0210 §1), no tile (§4 there), and no box at all, respectively.

**Built 2026-09-05 (ADR-0219 phase 1).** The rule is one function — `lib/place-photo.ts`'s `rowPhoto`, which asks §2's question at both levels and resolves the event's OWN place (never the booking's endpoints, which `eventPlaceId` would fall back to). `EventCard` and `BuilderRow` take a `photoUrl` string and decide nothing; `chosenIcon` keeps a stored `📌` from counting as a pick, which would otherwise have suppressed the photo on most rows. No geometry moved, so no number here changed.

**§4 said "under the image, never over it" and the reader then shipped the credit over it** (ADR-0213 §5, a scrim). Both are right, for different pictures, and §4 now says which is which: **on the photograph under a scrim when the photograph is a band with nothing beneath it** (the reader's day card, ADR-0219 §3's day head — the scrim is black over the picture in both themes, so the dark-mode objection does not reach it, and it costs 0px where a line costs ~16px), and **under the photograph in the surface's ink when prose follows it** (`PlaceKnowledge`, on the Map and, per ADR-0219 §6, in the event read). The credit is **composed once** — `placeCredit` moves to `packages/shared` and the reader's server-side join is deleted — because rendered side by side the two compositions put the photographer at opposite ends of the line.
