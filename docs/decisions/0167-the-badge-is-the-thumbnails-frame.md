# 0167 — The badge is the thumbnail's frame, and selection is where a place says more

**Status:** Accepted (design; owner sign-off 2026-08-05 on three forks. **Nothing built** — this is the surface ADR-0166's Phase 1 fills in.) **AMENDED the same day — §9 supersedes §3 for a committed place.** The first mockup was drawn against a stripped-down row and the owner rejected it as incomplete; the real card is a grid with one scrolling track and four pinned rows. §9 has the redesign: hours ride the meta line at 0px, the summary gets a pinned two-line expandable block, and the hero leaves the committed card for the deciding one.
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

## What this does not settle

- **Whether a real photograph is legible at 40px.** The mockup's images are synthetic (§Design reference), so crop _geometry_ is honest and _content_ is not. This is a device pass with real Commons files, and it is the one question the file cannot answer.
- **Where the thumbnail goes on the app's other surfaces** — shelf ideas, event rows, the Index, the hero. This ADR covers the place row and its selection card, which is where enrichment is reached from today; the rest is a second pass once the badge's behaviour is real.
- **The empty card's exact chrome.** 44px of `.map-refs` for a single button is measured but not tuned, and it is the majority case, so it deserves a look on a device.
