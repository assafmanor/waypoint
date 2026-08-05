# The enrichment surface, used: three fixes and one design question

**Date:** 2026-08-05
**Scope:** [ADR-0167 §16](../decisions/0167-the-badge-is-the-thumbnails-frame.md) (all four reports), [ADR-0166 §17](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) (the delivery hole behind report 1).
**Follows:** [before-you-save](2026-08-05-place-enrichment-before-you-save.md), merged, and then used on a device.
**Owner's report:** _"Merged, working. for issues: 1. An enriched search result is saved to the shelf, and it doesn't retain the enrichment. Not even after waiting. 2. Going from map to list (or half view) doesn't scroll to the details. 3. I would like clicking on the summary to also expand, not only when clicking on עוד. 4. Map pins should also show the thumbnail (think how to do this aesthetically)."_

## 1. The place lost what we already knew about it

**Not a surface bug, and not the pre-save trigger's fault either.** `enrich()`'s early return — the one that **is** the negative cache (ADR-0166 §6.4) — returned the stored row **without notifying anybody**. Every trigger paths through it:

| trigger         | reaches the early return                   | who needed the nudge                        |
| --------------- | ------------------------------------------ | ------------------------------------------- |
| snapshot read   | never (it only schedules **stale** places) | —                                           |
| a pick          | **very often**                             | the client that just created the `Place`    |
| a candidate tap | when we already hold a fresh row           | nobody (it gets the answer in the response) |

So the hole only ever bit the pick — and the pre-save work made the pick's row fresh **almost always**, because the deciding surface had just fetched it. That is why a hole that existed from the day the store went global (two trips adding the same place) showed up as a new bug.

The fresh path now nudges, which is one `await this.notify(...)` and a comment explaining why a path that fetched nothing still has something to say. **"Not even after waiting" is the part that identifies it**: a delivery bug looks exactly like this — nothing arrives, and nothing ever will, because the only thing that would have delivered it already ran.

## 2. Leaving the map extreme left the selection behind

Selecting at the `map` stop cannot scroll anything: there is no list on screen, which is why `select` returns early there and why the tapped place surfaces as a card on the canvas instead (ADR-0122 §7). Switching to `רשימה` then rendered the list at whatever offset it was left at, with the selected row — now carrying a summary, a note section and a footer — wherever it happened to be. In the owner's screenshot it is clipped by the tab bar.

The centring became a function with **two callers** rather than a second copy: a pin tap at a list stop, and the **stop change**. Keyed on the stop and nothing else, deliberately: a change of _selection_ is `select`'s own business, and re-running there would scroll the same row twice — the second time with `center`, undoing the `nearest` a row tap chose on purpose so it would not shove the row you are looking at.

## 3. The summary is the target, not just `עוד ›`

The clamped text is what you are trying to read, so tapping it is the way in. `עוד ›` stays as the block's **named, focusable** control: the tap target grows and the accessible control does not move. A `role="button"` wrapper would have nested one interactive element inside another to say something the inner button already says — and `.place` already sets `cursor: pointer`, so there was no CSS to add at all.

Only the collapsed density opens: the expanded card is already open, and the deciding card has nothing to swap off.

## 4. A photograph on the pin — measured, not built

§1 put the photograph in the badge, and ADR-0109 §3 calls the pin "the badge on the canvas", so this is the same decision one surface over. It is also the one report with a taste component, so it got a mockup rather than a commit: [`mockups/place-pin-thumbnail-v1.html`](../../mockups/place-pin-thumbnail-v1.html), against the app's **real** pin CSS.

- **A — the photo fills the teardrop**, hue from fill to ring: **21px of photograph at a 34px pin, 35px at 56px.**
- **B — A, gated on the size the canvas resolves**: photo at the map extreme, glyph at `half`.
- **C — a second silhouette** for photographed places: **31% more picture**, and the canvas stops being one shape.

**The deciding number is 34px**, because pin size is a share of the canvas (ADR-0123): at `half` a photo is a texture — a bright building versus a dark interior and nothing more — and the category glyph carries more meaning than that. At the map extreme the head is 35px, which is what §1 already accepted a photograph at.

**The owner took B** (_"definitely not C, leaning B"_), and two facts make it cheaper and less inconsistent than "the pin changes with the stop" sounds:

- **The canvas already changes pin content by size.** Below zoom 11 every pin degrades to a dot (`MAP_ZOOM.DOT_BELOW`), so "the pin says less when it is smaller" is grammar this surface already has.
- **The gate is pure CSS.** Pin size is already declarative (`clamp(34px, 11cqh, 56px)`, resolved against a pane that carries `container-type: size`), so the photo hangs off a `@container` height query — no new prop to `MapPane`, no state, and no marker re-diff on a gesture (ADR-0121 §4). Threshold: the pin's own **≥48px**, which puts photos at the map extreme and glyphs at `half` with room either side. The **selected** pin at `half` stays a glyph too: its card is already on screen with the picture, so 21px of texture adds nothing.

**Two things the render corrected in my own file**, both of which the paper version had wrong, and both worth keeping because the next person will make them too:

- **A 45°-rotated element's client rect is its bounding box** — √2 too big. The first pass reported A as buying 28px where it buys 21px, which is the difference between "small" and "a texture". Measure `offsetWidth`.
- **A board mixing 34px and 56px pins is a state the app cannot be in.** Size is per-stop, not per-pin, so the gate is a property of the canvas — drawing it per-pin made B look like a different feature than it is.

## Where the tests are

- `enrichment.service.spec.ts` (+1) — a pass that fetches nothing still nudges the trips that hold the place, carrying the client read model. It is the one test here that needs a real `Place` row, because the store has no `tripId` (§1) and the fan-out is the only thing that can be observed.
- `PlaceKnowledge.test.tsx` (+2) — the block opens the card and does not also fire the row's tap; the two densities with nowhere to go stay inert.
- `Map.embedded.test.tsx` (+2) — the stop change centres the selected row, and scrolls nothing when there is no selection.

## Still open

- **Report 4's build** follows on the owner's pick of B — the mockup and the ADR carry the decision, the code does not yet.
- **The device pass** still owes the one question no mockup can answer: whether a real Commons photograph reads at 40px in the list — and now at 35px on a pin.
