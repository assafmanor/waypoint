# Place enrichment Phase 5 — the collapsed card

**Date:** 2026-08-05
**Scope:** [ADR-0167](../decisions/0167-the-badge-is-the-thumbnails-frame.md) §9.3 (the pinned two-line summary block), §5 (`באנגלית`) and §6 (`עוד בגוגל`). Frontend only.
**Follows:** [Phase 4](2026-08-05-place-enrichment-phase-4-built.md) (the badge as the frame).
**Plan:** [`2026-08-05-place-enrichment-build-plan.md`](2026-08-05-place-enrichment-build-plan.md) Phase 5.
**Aligned to:** [`mockups/place-enrichment-v2.html`](../../mockups/place-enrichment-v2.html) — the collapsed card, column 1.

## What shipped

| Piece                                                 | Where                                |
| ----------------------------------------------------- | ------------------------------------ |
| Which summary variant a reader gets, and its marker   | `frontend/src/lib/place-summary.ts`  |
| `עוד בגוגל`, on the existing universal-URL builder    | `lib/places.ts` (`mapsKnowledgeUrl`) |
| The block, the marker chip and the footer link        | `screens/Map.tsx` (`PlaceRow`)       |
| Its own full-width line, and row 2 of the card's grid | `screens/map.css`                    |
| New Hebrew copy (`באנגלית`, `עוד בגוגל`)              | `i18n/he.ts` (`t.map.know`)          |
| The geometry, measured in a real browser              | `e2e/place-know.spec.ts`             |

- **The resolution was already shipped.** `resolveTextVariant` + `SUMMARY_LANG_PREFERENCE` landed in Phase 1, so `placeSummary` is thin: it picks the variant and looks up the one word that marks it. The marker is a **lookup, not a derivation** — a language we have no Hebrew word for gets no marker rather than an invented one, and only `he` → `en` can arrive from today's providers.
- **`עוד בגוגל` widened the existing builder** rather than adding a second one (§6): `mapsKnowledgeUrl` is the third wrapper over the private `mapsSearchUrl`. `query_place_id` opens Google's own panel for a place we picked from Google; a hand-dropped pin is disambiguated by its address, else by its point. Never null — §6 wants it present exactly when we know nothing.
- **Not the retired `mapsPlaceUrl` coming back.** That meant "view the location", which is our map's job since ADR-0121 §8. This answers a different question, which is what the label carries.

## Two things measuring found

**The footer's third control does not fit, and the mockup hid it.** Measured at the shipped stylesheets: `שיבוץ ליום` 118px + `עוד בגוגל` 83px + `מחיקת המקום` 116px + two 16px gaps = **349px** against **332px** of footer at 390px and **302px** at 360px. So `.map-refs-foot` wraps to a second line (which it has always been allowed to do — `flex-wrap: wrap` predates this) and costs a second 44px row plus the gap.

v2 drew all three on one line because **its delete is a bare `🗑` glyph**; the shipped one is a labelled 44px control ADR-0157 §2 chose deliberately. Same class of finding as Phase 4's row-height number: the mockup's CSS is hand-written and not the app's, and `docs/design/mockups.md` says to re-check exactly this.

**The wrap falls in the right place, which is why it ships as-is.** The primary and the way through share line 1; the **destructive** control is the one that drops — so it gains distance from the primary rather than sitting 16px from it, which is the hazard `.map-refs-foot`'s own gap comment was written about. The e2e asserts that arrangement, so a reordering that leaves the delete beside the primary fails. **It is still the owner's call** (see "Still open").

## Three implementation decisions worth knowing

**The marker is a sibling of the prose, not inline inside it.** Two independent reasons, and either alone settles it: `dir="auto"` sniffs the first strong character, so a Hebrew chip inside the prose element would lay an English extract out RTL — the exact inversion §5 exists to avoid; and `-webkit-line-clamp` needs `display: -webkit-box`, which lays **element** children out as boxes, so the chip would eat one of the two lines. So `.map-sum` is a flex row: chip, then the clamped prose.

**The prose keeps `dir="auto"` and nothing else** (§5), which means an English extract is bidi-ordered correctly and stays **aligned with the rest of the card**. That is §8.2's lesson applied before it could bite: the credit line's bug was making the whole element LTR, which orphaned it to the opposite edge from everything around it.

**The block gets its own grid row on the bounded card** (`grid-row: 2`, between the identity and the notes header), and the row is `auto`, so it collapses to 0 when we know nothing — which is the common case, and makes the card byte-identical to before on those places. The notes list stays the single `minmax(0, 1fr)` track: the group's own writing does not share a region with fetched text (§9.5).

## Where the tests are

- **`lib/place-summary.test.ts`** (4) — Hebrew preferred and unmarked, English marked, a third language unmarked rather than mislabelled, and absent when we know nothing.
- **`lib/places.test.ts`** (2 new) — the place panel via `query_place_id`, and the two fallbacks.
- **`screens/Map.embedded.test.tsx`** (5 new) — which rows get a block (selected only), the marker's words and position, nothing at all when we know nothing, the footer link's target/panel, and its withdrawal under an errand.
- **`e2e/place-know.spec.ts`** (10) — the geometry, at 390 and 360: exactly two lines with a real 260-character extract truncated, its own full-width line with no reflow above it, the marker on the prose's first line at no height cost, and the footer's three floors.

**What the e2e cannot reach, stated rather than implied:** the bounded card's grid only exists on a rendered canvas, and the hermetic run has no Maps key — the same wall Phase 4 hit for the way to the pin. So the card's **pinning** (this block staying visible while the notes scroll) is asserted as DOM order in jsdom and remains a device question.

## Still open

- **The footer, for the owner.** Three ways forward and the choice is not mine: accept the wrap (shipped, and the destructive control lands on its own line), unlabel the delete to an icon as v2 drew it (ADR-0157 §2 chose the label deliberately), or move the way through out of the footer.
- **`עוד ›` and the credit line are Phase 6's, and one of them is a licensing gap.** §9.3's `עוד ›` opens what §11.1 made a **mode change** to the research card, so shipping the control here would mean shipping the mode too — or an inert control. It waits. But §4's argument for the badge carrying no credit is that _"the badge leads to the card, one tap away, where the credit is"_, and that card does not exist yet: **between this phase and Phase 6 the app renders CC BY-SA photographs and prose with no attribution anywhere.** 84% of the measured files require visible credit (§4). Phase 6 must close it, and it is the reason not to leave Phase 6 for later.
- **Hours are blocked upstream, not skipped here.** §9.2's `פתוח עד 17:00` tag is Phase 5's cheapest win at 0px, and there is no value to put in it: no OSM provider exists (ADR-0166 Phase 2), the store holds the **raw** `opening_hours` expression by design (§7 — 13 syntax shapes in 15 values), and deriving a display from it is that phase's work, not this one's. The delivered read model already carries the field, so the tag is a small addition once a value exists.
