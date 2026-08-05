# 2026-08-05 · session 214 — what an enriched place looks like (design session)

**Outcome:** [ADR-0167](../decisions/0167-the-badge-is-the-thumbnails-frame.md) + [`mockups/place-enrichment-v1.html`](../../mockups/place-enrichment-v1.html) and **[`v2`](../../mockups/place-enrichment-v2.html), after the owner rejected v1 as incomplete — see the last section**, rendered and measured in Chromium at 390×844 in both themes. Closes [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §10, which had been gating Phase 1. Three forks approved; **nothing built**.

## What the session had to answer

Four questions, accumulated across three ADR-0166 amendments rather than asked at once: **where a thumbnail goes** and **where attribution renders** (§10), **how an English summary is marked** (§11.5, after the owner kept summaries in Phase 1 against the spike's advice), and **where the way through to Google sits** (§13).

It also had two measured facts it could not design around:

- **Tokyo restaurants scored 0 of 7** for image, summary and match, against 14 of 14 for landmarks. The common case is a place we know nothing about.
- **27 of 32 image files require visible credit.** Attribution is the default line, not an exception to accommodate.

## What reading the tree changed

**There is no separate place-detail screen, and that turned out to be the good news.** `.map-placecard` renders the _same row component_ as the list, promoted onto the canvas — so "the place detail surface" ADR-0166 §13 named is the selection card, and the selection card is the row. That collapsed two design problems into one.

**The row already has both slots this needed.** The badge is a **40×40 `border-radius: 12px`** square that is always filled and is already the tap target for framing the pin; `.map-refs` is already a full-width third line that appears on selection with its own `border-top`. So the thumbnail needed no new slot and the enrichment block needed no new mechanism — which is the difference between a design that fits a 73px row and one that argues with it.

## The decision, in one line

**The badge is the thumbnail's frame, and selection is where a place says more.**

## Forks put to the owner, and the answers

| Fork                             | Answer                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Where the thumbnail lives        | **The badge becomes the frame** — no new slot, hue moves from fill to ring           |
| A picked icon vs a fetched photo | **The picked icon wins** — a human's choice is not overwritten by a background fetch |
| Where attribution renders        | **On the card, under the image** — the 40px badge leads there and carries none       |

The second is the one worth remembering: it is [ADR-0166](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md) §1's boundary between the trip's opinion and the world's facts, applied to a 40px square. A photo replacing a glyph someone picked would be that rule broken automatically, by a fetch, on a surface nobody touched.

## What the mockup found by being rendered

Two defects, neither reachable by reading the CSS, and both of which would have shipped:

- **The hue ring did not survive the photo.** An `inset` box-shadow paints above the background and **below** the children, so the image covered it completely and the badge silently lost its category — the exact property §1 claims survives. It needs an overlay `::after`, which also buys a hairline so a dark ring holds against a bright sky.
- **The credit line orphaned itself to the wrong edge.** It is Latin, so `dir="auto"` made the **whole element** LTR: correct internal ordering, then aligned left while every other line in the RTL card sits right, visually detached from the image it credits. This is the **mirror** of the bug [ADR-0118](../decisions/0118-numbers-in-hebrew-bidi.md) was written for — its guard reads `dir="ltr"` attributes and cannot see an element that flipped itself — and it will recur on every enriched Latin string: a credit, an English summary, a place name.

And one measurement that changed a decision, plus one that confirmed the claim:

- **The hero looked like the height lever and is not.** Sweeping 132 → 96px moves the card only 392 → 356px, because the height is five stacked elements rather than the image. So it keeps its size: a better picture for 36px.
- **Collapsed rows measure 69–71px.** The badge-as-frame costs nothing, which was §1's whole claim and is now checked rather than asserted.

Numbers the build inherits: **392px** enriched (46% of a 390×844 viewport), **134px** empty with a 44px refs block, **132px** hero, three-line summary clamp, no horizontal overflow at 390.

## What it deliberately draws

The file's §3 is the majority case, not the happy one: a restaurant we know nothing about, whose entire reveal is `עוד בגוגל`. That is the shape ADR-0166 §13 chose — a free deep link instead of a paid API fallback — and putting it in the mockup is what makes the 0-of-7 finding a design input rather than a caveat. Nothing is drawn where a summary would be (ADR-0109 §7).

## What it cannot settle

**Whether a real photograph is legible at 40px.** The session still could not reach `upload.wikimedia.org`, so the images are CSS gradients at the real files' aspect ratios, composed sky-above-structure so a crop's damage shows. Crop geometry and density are honest; content is not. That is a device pass with real Commons files, and it is the last thing standing between this design and a build.

Also open, and recorded rather than forgotten: **the app's other surfaces** (shelf ideas, event rows, the Index, the hero) get a second pass once the badge's behaviour is real, and **the empty card's 44px of chrome for one button** is measured but not tuned — which matters more than it sounds, because it is the majority case.

## The owner rejected v1, and the second pass is the real answer

_"Currently places look like this. Your mockup is missing existing information, so it's incomplete. The challenge is fitting everything in a pleasant way for saved places, not just search results."_ — with a screenshot of the shipped card.

**The criticism was right and it was structural, not cosmetic.** v1 drew a stripped-down row. The real card carries an order counter, a lock, a rename, three meta tags, a notes section with its own header and list, one or two reference rows with their settle pairs, `שיבוץ ליום` and a delete — and it is a **grid with exactly one scrolling track**, four of five rows pinned by the owner's own rule, which `map.css` quotes: _"only the notes themselves should be scrollable, everything else is locked."_ v1's hero plus summary on that card measures **~538px, 64% of the screen**.

I had read `renderRow` and the row CSS and still missed this, because I stopped at the list row and never looked at what `.map-placecard:has(.note-sec)` does to it. The lesson is narrow and worth keeping: **a component that renders in two densities has two anatomies, and the crowded one is the one to design against.**

**The owner's brief for the second pass** was to include the summary and make it _very easy to reach_ (1–2 lines, expandable), with permission to rearrange: _"I'm not afraid of drastic changes, the all is not GA yet."_ Both of my proposed options were refused — one dropped the summary from a committed place, the other renamed `פתקים`.

**What answered it was giving up a row I had assumed was necessary.** Hours do not need a line of their own: `פתוח עד 17:00` becomes another tag on the meta line that already wraps them, and the meta line **measures 17px with or without it — 0px**. That mattered more than it sounds, because the pinned hours line had been costing 19px when it fitted and **43px when the freshness tail wrapped**. Spending nothing there buys the summary a **pinned two-line block** under the identity at **64px**, expanding to **108px** by borrowing from the notes scroller — which still holds 114px.

**And the principle that fell out is the one worth keeping from this whole session: enrichment is for deciding, and once you have decided it compresses.** A deciding card (a Google result, a shelf idea) has no notes, no references and no schedule action, so the hero and summary have their room. A committed card gets the badge photo, the hours tag and two lines of summary — and **no hero**, because 132px of picture on a place you have already chosen is the least valuable block on a capped card.
