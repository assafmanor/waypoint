# The enrichment surface, used: three fixes and one design question

**Date:** 2026-08-05
**Scope:** [ADR-0167 §16](../decisions/0167-the-badge-is-the-thumbnails-frame.md) (all four reports), [ADR-0166 §17](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) (the delivery hole behind report 1).
**Follows:** [before-you-save](2026-08-05-place-enrichment-before-you-save.md), merged, and then used on a device.
**Owner's report:** _"Merged, working. for issues: 1. An enriched search result is saved to the shelf, and it doesn't retain the enrichment. Not even after waiting. 2. Going from map to list (or half view) doesn't scroll to the details. 3. I would like clicking on the summary to also expand, not only when clicking on עוד. 4. Map pins should also show the thumbnail (think how to do this aesthetically)."_
**And two more, on the same surface, an hour later:** _"1. The text חזרה לפרטי המקום isn't line aligned correctly. 2. Still cutoff when opening to half map half list."_ — §5 and §6 below.

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

## 4. A photograph on the pin — measured, then built

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

## 5. The way back was 14px above its own line

`.map-know-more` carries `align-self: flex-start`, and that is correct for its **first** host: inside `.map-sum` it sits beside baseline-aligned prose and has to hug the first line, or it drifts down a two-line block. Its second host is `.map-backrow`, where its neighbour is a 30px pill — so the same declaration pushed it **14px above the line**, which is what the owner saw.

`frontend/CLAUDE.md` names this exact shape ("reusing a component onto a surface unlike the ones it grew up on, and inheriting its DEFAULTS with it"), and the fix it prescribes is to answer the default at the new host rather than to restyle the control: `.map-backrow .map-know-more { align-self: center }`.

**Measured in a browser, and the measurement was checked against the defect**: 14px apart before, ≤1px after. jsdom cannot see this — it is two boxes' centres — so the assertion lives in `e2e/place-know.spec.ts`, and it was run against the reverted CSS to confirm it fails there.

## 6. The expansion still opened below the fold

Report 2's first round fixed the **stop change**; this is the other half of the same problem and it was still open. Expanding adds a 130px hero, a credit and the whole summary — some 300px — to a row inside a scroller that at `half` is about 380px tall, so the way back and `עוד בגוגל` opened under the tab bar (the owner's screenshot).

The selection reveal already had this problem and [ADR-0135](../decisions/0135-a-place-becomes-an-event-or-a-booking.md) §8 answered it — `nearest`, deferred a frame, because _"the action would be the half you cannot see"_. The mode change is a bigger version of the same growth and inherited none of it. So the scroll helper now takes its **block mode** as a parameter and has three callers: `center` for a pin tap and for the stop change (the row may be anywhere), `nearest` for a row that just grew (it is already on screen; only what appeared below it needs bringing in).

At the `map` stop this is a no-op by construction: the expansion happens on the canvas card, which is not in the sheet's scroller at all — and that card is bounded and scrolls itself (the `:has(.map-hero)` rules).

## 7. …and the scroll still did not work, because I tested the call instead of the outcome

The owner, after §6 shipped: _"it still doesn't auto scroll on the list when selecting or moving from map to half/full list. Important point: **it should auto scroll to the top of the card**, it's much better when the card is too big to display fully."_

**The wiring was right and the alignment was wrong**, which is why every test passed while nothing worked:

- **`nearest` is a no-op on a box taller than the scrollport.** Per spec it scrolls the minimum needed to bring the element into view, and an element that already spans the whole port needs nothing. The selection card stopped fitting the moment it grew a summary, a hero and a note section — so the reveal scrolled **not at all**, exactly as reported.
- **`center` on a card taller than the port centres it**, which puts the identity row — the name, the badge, the address — above the fold. You get the middle of a card whose top you cannot see.
- **`start` is the only alignment correct at every card height**, and the only one that survives being called mid-transition: the sheet's height animates over `--t-base`, and a row's top aligned to the scroller's top stays true as the box grows.

So there is now **one mode, `start`, for all three callers** — which supersedes ADR-0135 §8's `nearest` and the `center` §6 shipped with. The 8px of air above the card is `scroll-margin-top` on `.place`, because that is a property of the row's box rather than a number for the screen to carry.

**What I got wrong methodologically**, and it is the lesson worth keeping: the unit test asserted that `scrollIntoView` **was called, with a mode** — which it was, both times. It could not assert _where the card ended up_, because jsdom has no layout. The defect lived entirely in the gap between those two statements. It is now measured in a real browser (`e2e/place-know.spec.ts`), and the measurement immediately paid for itself twice:

- **The first version of that spec failed for a reason that was not the bug**: with two rows in the fixture, `scrollTop` maxed out 102px short of the top. That is the scroll extent's limit, not the alignment's — so the fixture gained four filler rows, and the spec now expresses the case it claims to.
- **The fixture's own time formatting broke** on the sixth place (`0${5 + i}` → `T010:00`), which crashed the app into an error boundary. Padded.
- **And CI caught the guard being both too tight and untrue.** The spec asserted "the card is taller than 60% of the port" — 422px against 709px locally, and **3px short on the runner**, which is the same environment-specific assertion ADR-0167 §13 already records once (a Hebrew-metrics-dependent footer). Worse than flaky: at 844px with an ordinary extract the card **fits**, so the spec was not exercising the reported state at all. It now boots at the **small end of ADR-0017's band with the longest measured extract** (1,321 characters is §11's maximum) and asserts `height > portHeight` outright — the state in which `nearest` provably scrolls nothing.
- **Then CI corrected the same premise a second time, in the other direction**: it does not hold for the **collapsed** card at all, because that summary is clamped to two lines however long the extract is (327px against a 505px port). Too-tall is a fact about the **expansion**, so the height assertion now lives only in the expansion test; what discriminates the selection test is the alignment itself — the card's top landing at the scroller's top, which neither `nearest` nor `center` produces.

**Two more things the round turned up, both real rather than test hygiene:**

- **The list-only path never scrolled at all.** `showRowInList` scoped its query to `sheetRef`, which is null when there is no sheet — the graceful-absence path (no Maps key, or offline) renders the list straight into the shell's scrolling body. It falls back to the document there, which is also what makes the behaviour reachable by the hermetic e2e at all.
- **A pending frame could outlive its transition.** Only one scroll is ever in flight now (cancel-before-schedule) and it is cancelled on unmount. Found because leaked frames from earlier tests were landing in a later one and calling `scrollIntoView` six times where it asserted none — the test was right and the code was sloppy.

## 8. The pins came back empty, and the reason was two rules disagreeing about one element

Reported with a screenshot of a country-zoom Iceland: full-size pins, a thin category ring, no glyph and no photograph inside them. The owner's own second sentence is the whole diagnosis — _"even when zoomed out the pins are full size, and in these cases there's no thumbnail"_ — because it separates the **pin's size** from the **pane's zoom**, which §4 had folded together.

- **`data-pins='dot'` is the pane's state; being a dot is the pin's.** The tier is scoped (ADR-0128 §1): day scope degrades only `.aside` pins, all-days spares the amber ones. Hiding the photograph off the pane's attribute therefore took it off pins that stayed whole teardrops.
- **And hiding an element does not retract the rules that exist because it is there.** `:has(.pin-photo)` is true whether or not the photo is drawn, so the pin kept the photographed paint — `--card` fill, hue ring, glyph dropped — with nothing in it. That is the sentence worth carrying out of this session; it is not specific to photographs.
- **The photograph now drops in the very rules the glyph drops in**, and a pin that stops drawing it takes its hue back (a dot with a card-coloured face is a hole in the canvas).

**A defect nobody reported turned up in the same read, and it is the more serious of the two.** `:has()` carries its argument's specificity, so the photographed ring (four classes) outranked `.map-pin.nextstop .pin-b` (three): a photographed next stop was drawing a **category** ring where ADR-0109 §6 spends the canvas's one amber cue. The ring now yields to both time cues by name.

**What let both of them through is the shape, not the two rules.** A pin's hue was written fifteen times — five fills, five rings, five ghost outlines — so there was nowhere to look at "what colour is this pin" and see one answer. It is `--pin-hue` now, which is what `.map-badge` has done with `--badge-ring` since §1.

**And I had written that none of this was testable.** That claim was in ADR-0167 §16, and it was the reason a container query, a `:has()` and a specificity tie shipped with nothing checking them. What needs a Maps key is the **canvas**; the **rules** need a browser and two stylesheets. `e2e/map-pin-photo.spec.ts` loads `tokens.css` + `map-pane.css` over markup mirroring `MapPane`'s pin — **five of its nine assertions fail against the shipped CSS**, which is how the amber defect was found rather than guessed.

## Where the tests are

- `enrichment.service.spec.ts` (+1) — a pass that fetches nothing still nudges the trips that hold the place, carrying the client read model. It is the one test here that needs a real `Place` row, because the store has no `tripId` (§1) and the fan-out is the only thing that can be observed.
- `PlaceKnowledge.test.tsx` (+2) — the block opens the card and does not also fire the row's tap; the two densities with nowhere to go stay inert.
- `Map.embedded.test.tsx` (+5) — the stop change centres the selected row and scrolls nothing without a selection; an expansion scrolls its own row with `nearest`; and the pin gets the row's photo, with a picked icon still winning (§2 on the canvas).
- `MapPane.test.tsx` (+1) — the photograph's markup: clipped by an inner element (`.pin-b` must stay unclipped or the counter is cut), decorative, and the glyph left in the DOM for CSS to swap.
- `e2e/map-pin-photo.spec.ts` (new, 9) — the pin's photograph in a real engine, with no app and no Maps key: the app's own stylesheets over `MapPane`'s markup. It pins the size gate both ways, the reported case (a zoom-out that does not make this pin a dot), the fill coming back with the photo's absence, the amber cue outranking the category ring, the errand's demotion, and the one hue reaching fill and ghost outline alike. **The control run is the point**: five fail against the shipped CSS.
- `e2e/place-know.spec.ts` (+3) — the way back centred against the Google exit, **verified against the reverted CSS** (14px apart before, ≤1px after); and the selected card's top landing at the scroller's top, on selection and on expansion, with the card asserted to be **taller than the port** so the case is the reported one. The fixture gained four filler rows because `start` needs content below the row to scroll into.

## Still open

- **Report 4 shipped after the fixes merged**, so it is a second change rather than part of this one: `MapPin.photoUrl` (from the
  same `badgePhoto` the badge uses), the photo clipped inside `.pin-b` by an inner element, the hue moving from fill to ring, and the
  gate as a `@container (min-height: 436px)` query — 48px of pin. Dropped at the **dot** tier for the same reason the glyph is.
  ~~**The one thing no test can reach**: the gate is a container query and a rendered canvas needs a Maps key.~~ **Refuted the same
  day by §8** — the canvas needs a key, the rules do not. What is left for the device is 35px legibility, which was always its.
- **The device pass** still owes the one question no mockup can answer: whether a real Commons photograph reads at 40px in the list — and now at 35px on a pin.
