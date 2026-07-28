# 0130 — A maybe is not a past place: Plan mode has no past, and a maybe is textured rather than faded

**Status:** Accepted — authored and built 2026-07-28 (session 156), from two owner reports made while using the map. The pins were **rendered and looked at** in a headless browser against the real stylesheets (see §4), so §2's two hatch numbers are seen rather than derived. That is not a device pass and does not stand in for one — the shipped canvas over real tiles is still unseen (ADR-0121 §13).
**Date:** 2026-07-28
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§6** — its prominence ladder gains a rung and its "the ghost tier covers _another day_ **and** _no day at all_" is withdrawn (§3) — and its **behind-you tier becomes Trip-mode only** (§1). Also amends [0123](0123-map-pin-size-is-a-share-of-the-canvas.md)'s `GHOST_SCALE`, renamed `ASIDE_SCALE` because it now has two wearers.
Relates [0109](0109-map-tab-design.md)'s 2026-07-27 amendment (whose "desaturation on this canvas means BEHIND YOU" is the rule this applies twice), [0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §1 (the dot tier, whose day-scope selector this simplifies), [0117](0117-map-place-outcome-states.md) §2/§4 (what closes a place), [0011](0011-hard-soft-event-model.md) + [`design-language.md`](../design/design-language.md) (the hard/soft grammar this restores on the pin).

## Context

Two reports, one sentence each, made while looking at the shipped map:

1. **"Past places shouldn't be faded on Plan mode."**
2. **"Maybes (for today or general maybes) should be represented differently than how past events are. I want to be able to visually distinguish between somewhere I've already been to and somewhere I'm considering."**

Then, mid-build, the constraint that decides §3's shape: **"a normal trip could have tens of maybes but only a handful of maybe-todays, so maybe-todays should be more prioritized."**

A third item in the same message asked whether Plan mode always shows full pins in day scope. **It already does, and nothing here changes it** — session 155 scoped the dot tier so that in day scope only the out-of-scope pins degrade, and that rule is mode-independent. Stated because it was asked as if it were open.

**The second report is the interesting one, because the code did draw a distinction and the distinction did not work.** A maybe was the category hue at 55% toward the card; a passed stop is the hue desaturated and at 0.62 opacity. Two different declarations — **on the same axis**. Both read as _washed out_, which is why the two most different things on the canvas were being confused for one another. The lesson generalises: _a distinction that exists in the CSS is not a distinction until it is on a different axis from its neighbour._

## Decision

### 1. Plan mode has no past

**In Plan mode nothing is demoted for having passed.** The `behind` tier is Trip-mode only, joining `nowStop` and `nextStop` — which are Trip-only for the mirror-image reason ("a live _next_ says nothing while you're planning"). ADR-0121 §10 already drew this line for the day connector: it is Plan-only "because in Trip mode you are living the day". The same argument runs backwards. **A day you are arranging has no past** — you are looking at its shape, and the stops you can least afford to have faded are the ones you came to rearrange.

**The clock is still passed, and that is the load-bearing part.** `planning` withdraws exactly one verdict, not the clock: in all-days scope `placeDay` needs `nowMs` to resolve which day a place is **live** on (ADR-0124's fix — otherwise a hotel is read off `days[0]` and a mid-stay night reads as its arrival). Dropping the clock in Plan mode would have quietly changed which day multi-day stays are read as, in the mode whose default scope is all-days. So the flag is a flag, not an absence.

**The screen decides it, the lib takes the answer** — the same division as the amber cues. `PinContext` gains one optional boolean; nothing else in the pin grammar learns about modes.

One consequence to state rather than discover: in Plan mode a stop a human marked `היינו` or `דילגנו` also draws as an ordinary stop. That is consistent rather than new — the canvas never drew the human outcome (ADR-0121 §6: "every behind-you pin looks the same whatever closed it"), and now it draws neither reading of "closed". **The row still carries both**, in the day view's own words, which is where the outcome belongs.

### 2. A maybe keeps its colour and loses its solidity; a passed stop keeps its solidity and loses its colour

**The design language already had the answer, and the pin was the surface that dropped it.** `design-language.md`'s hard/soft grammar: "**Soft** — dashed border, **diagonal-hatch background**, lighter type." The row (`.place.soft`) hatches. The badge under it hatches. The teardrop substituted a tint — a hue at 55% — and that tint is what collided with the desaturation next door.

So the hatch comes back and the tint goes:

|                 | Colour            | Fill                | Number     |
| --------------- | ----------------- | ------------------- | ---------- |
| **A stop**      | full category hue | solid               | numbered   |
| **A maybe**     | full category hue | **hatched**, dashed | unnumbered |
| **A past stop** | **grey**          | solid               | numbered   |

Two axes, and neither can be mistaken for the other: _vivid but unresolved_ against _definite but spent_. **The primary read is colour vs. grey**; the hatch is the confirmation. Worth stating explicitly, because it means the device pass can thin the stripes — or drop them — without giving back the distinction they were added for.

**Everything about the hatch is a ratio, for ADR-0123's reason.** One stripe is `0.08 · --pin-u`, so it re-derives under the aside ratio and the dot tier instead of smearing on a 56px pin and smudging on a 22px one. The angle is stated in the **pin's own frame**: `.pin-b` is rotated 45°, so `90deg` — vertical stripes locally — lands as the design language's `-45deg` hatch on screen. That is the kind of thing that looks like a typo in six months, so it is commented at the declaration.

**And the five per-category tint overrides are deleted, not rewritten.** The hue now comes from the base `.cat-*` rule and the hatch is a `background-image` over it, so `.soft` needs one declaration where it had six. Net less CSS for a better distinction.

### 3. A dayless maybe is _nowhere_, not _elsewhere_ — and today's maybes outrank it

**The defect found while designing §2:** in day scope, a shelf maybe with no day at all was drawn as a **ghost** — a hollow, glyph-less outline whose whole meaning is "this belongs to another day". ADR-0121 §6 said so in as many words ("it covers 'another day' **and** 'no day at all'"), and treating the two as one population is wrong about the second: **a place no day has claimed is not busy elsewhere — which is exactly what leaves it available today.** It was being drawn as the opposite of what it is.

So the ladder gains a rung. There are **two ways to be out of the day**, and they are different claims:

- **`ghost` — pencilled for another day.** Hollow, unchanged. Hollow is the point: there is nothing of this day in it.
- **`shelf` — on the shelf, on no day.** It wears the **maybe's own paint** — dashed, hatched, filled, its category glyph — and takes only the subordinate **size**. So the paint says _what it is_ and the size says _how much it is claiming_.

**The owner's "tens versus a handful" is what makes the size the right lever.** A real trip accumulates tens of general maybes and holds a handful earmarked for today, so the two cannot be peers on the canvas — and the prioritisation has to be something that survives tens of pins in view. Three things separate them, all of them already in the grammar:

- **size** — full pin against the subordinate ratio (0.72);
- **z-order** — a maybe you pencilled onto _this_ day sits above one you pencilled nowhere (below `ambient`, because a night you are sleeping somewhere is a commitment and an idea is not; above `behind`, because considering outranks having passed);
- **the dot tier** — in day scope the aside pins are exactly what degrades at wide zoom, so tens of general maybes become dots while today's handful stay full pins. That is the density mitigation the tier was invented for, now pointing at the population that actually has the numbers.

**No third paint for "maybe today", deliberately.** It would need a fourth for the next case, and the distinction is already carried by size, stacking and presence rather than by inventing texture. The tab also already has a control for making the maybes the _subject_ — the `אולי` facet (ADR-0119) — so "I want to look at my maybes" is answered by a chip, not by a pin treatment.

**`.aside` is its own class, and that is a simplification rather than a third class for its own sake.** The ratio is what both tiers share; the paint is what differs. Because the ratio has a name, the dot tier names the pair in one selector where it previously listed `ghost` twice, and `isAsidePin` replaces a `!== ghost` that the split would otherwise have had to change in five places — the amber-cue guard, the camera's fit, the connector, the area readout and the tap that surfaces a missing row. **Every one of those five is "the day scope did not choose this place", not "this is another day's"**, which is why keying them on the reason is what kept the split from being five silent behaviour changes.

### 4. The pins were rendered, and looking at them changed three things

The one process note worth keeping. ADR-0121 §13 and every ADR since has said the canvas is a human pass; this session put the real `map-pane.css` and `tokens.css` in front of a headless Chromium at 3–5× with the pin markup and the tier classes, at the floor, at the cap, and at dot size. **Three of the numbers in §2/§3 were wrong on paper and are right now only because of that:**

- **The first hatch was 82% card over the hue at a `0.12` stripe. It read as a barber pole** — a maybe visibly _louder_ than a committed stop, which inverts the whole ladder. A four-by-three dial sweep put it at **45% at `0.08`**: textured, unmistakably still its category hue, quieter than the numbered stop beside it.
- **At dot size the dashed edge is under a pixel**, so it stopped reading as _provisional_ and started reading as a **ragged rim**. It now goes solid there, with the glyph and the number, for their reason — ADR-0128's "demote what claims precision". The hatch stays, because it is what still tells a maybe from a passed stop at 20px.
- **The `aside` ratio is legible at both extremes**, which was the open question in §3's "is 0.72 enough" — at the 34px floor a subordinate maybe is 24px and still carries its glyph.

This is not a claim that the surface has been seen on a phone over real tiles; the device-pass cluster is untouched and one item is added to it. It is the narrower claim that **the geometry was checked against a renderer instead of against arithmetic**, and that doing so caught an inverted ladder before it shipped.

## Alternatives considered

- **Gate `.skipped`'s desaturation on `[data-mode='trip']` in CSS**, the way ADR-0128 §1 keys the dot tier on `data-scope`. Rejected: the tier would still _be_ `behind`, so the z-order would sink a Plan-mode stop under coincident pins and the DOM class would claim what the paint denies. The precedent fits a _degradation_; this is a withdrawal of a claim.
- **Stop passing `nowMs` at all in Plan mode**, which needs no new field. Rejected in §1: `placeDay` reads the clock to pick which day a place is live on, so this would silently change how multi-day stays are read in Plan's default scope. A quiet second effect is worse than an explicit flag.
- **Keep the tint and push the past further** (full grey, lower opacity). Rejected: two points on one axis are still one axis, and the report is that the two are confusable, not that one is insufficiently faded.
- **A `?` in the number corner for a maybe.** Tempting — the corner is genuinely free on an unnumbered pin, and it reuses `.pin-n`'s geometry. Rejected: a glyph at that size is the same noise the dot tier exists to drop, and the hatch is the grammar the app already speaks for exactly this. Inventing a second mark for a distinction the design language had already made is how surfaces drift apart.
- **Give a dayless maybe its own smaller ratio**, below the ghost's. Rejected: one rung is what makes it a ladder; the paint already separates the two tiers on it.
- **Hide dayless maybes in day scope.** Rejected: "the café you are standing next to" is the tab's own argument (ADR-0121 §6), and the `אולי` facet already exists for making them the subject.
- **Leave the dayless maybe a ghost and accept it.** Rejected once the owner's "tens versus a handful" landed: the population that needs the most careful prioritisation was the one being drawn as somebody else's day.

## Consequences

- **`PIN_TIER` has six rungs**, and `isAsidePin` is the one predicate the five out-of-scope call sites read. The `ghost` split would have been five separate edits without it; naming the reason is what made it one.
- **`MAP_PIN.GHOST_SCALE` → `ASIDE_SCALE`, `--pin-ghost-scale` → `--pin-aside-scale`.** A shared ratio named after one of its two wearers is exactly the thing a future reader gets wrong. ADR-0123's own text is annotated.
- **`.map-pin.soft` loses five per-category overrides** and the dot tier loses a duplicated selector. The diff is a net simplification of the pin CSS despite adding a tier.
- **The behind tier is now unreachable in Plan mode**, so anything later keyed on `PIN_TIER.behind` has to know it is asking a Trip-mode question.
- **Tested in the pure layer, where the decisions actually live:** the tier split (dayless-on-shelf vs. pencilled-elsewhere vs. dayless-not-on-shelf), the `planning` withdrawal in both scopes and the fact that it withdraws _only_ that verdict, the six-rung z-order, and that neither aside tier can pull the camera — plus screen-level assertions that the same stop is `behind` in Trip and `upcoming` in Plan at the same instant, and that a dayless maybe in Rome does not reframe a day in Tokyo.
- **Two look questions join the device-pass cluster**: whether the hatch reads as texture over real map tiles at the 34px floor, and whether 0.72 separates a handful of today's maybes from tens of general ones when they are actually all on screen at once. §4 checked both in a renderer; neither has been seen on a phone.
- **The dot's touch target is unchanged and still open.** A dot is roughly 14–22px against ADR-0017's 44×44 floor; that finding stands on the backlog with its two conflicting candidate fixes, and this ADR deliberately does not pick one.
