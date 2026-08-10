# Session 240 — stepping through a day of stops

**2026-08-10 · design session, nothing built.**
Deliverable: [`mockups/map-stop-traversal-v1.html`](../../mockups/map-stop-traversal-v1.html)
(+ its catalog entry, + backlog line **J** rewritten) → **[ADR-0182](../decisions/0182-a-day-is-a-sequence-you-can-step-through.md), Accepted the same day**, once the owner had answered all three forks. It was deliberately not written before that: this repo's convention is to record a decision, not to invent one. All three answers were the session's recommendation — flexible **interleaved**, the **dot rail**, the nudge at **6px**. The build follows, and it is not done without a device pass.

Then the owner reviewed the rendered file and sent back one correction that reshaped §2 rather than restyling it. It is the most useful thing in this note, so it has its own section below.

## The brief

`docs/backlog.md` item **J — Sequential place traversal on the full-map day view**, from field
report **#25 / ADD-04**
([`2026-08-08-session-224-…-addendum`](2026-08-08-session-224-incremental-field-reports-addendum.md) §5).
Swipe **and** explicit prev/next arrows on the Map's selected place card, so a day's stops can be
stepped through in sequence instead of re-picked one at a time from the list.

Owner-decided before the session and not reopened: the full-map view with a day selected; **both**
gestures; the unit is a **logical map stop** per Workstream F's one-connection-one-stop rule
([ADR-0171](../decisions/0171-a-time-can-be-a-floor-or-a-ceiling.md) §7,
[ADR-0121](../decisions/0121-embedded-map-phase-6-design.md) §6); untimed/flexible items
after the timed portion; selection pans; navigation wraps; consecutive-same-Place consolidation is
the confirmed **minimum**, with broader grouping explicitly left to a future session.

Note on citation, since the two ranges overlap: field reports **#22–#26** are the addendum's own
numbering and are unrelated to the Map epic's internal **#1–#23** used inside `docs/backlog.md`'s
Map-tab section. This is addendum **#25**, not Map **#25**.

## The reversal: the brief's data-shape question has a different answer than it expected

The brief framed the core work as "combine `buildPinOrderIndex`'s numbered timed stops with
`placeDayEntries`'s untimed tail into one navigable list", and flagged that this might need a third
derivation. Reading both primitives says something sharper.

**1. The ordered sequence already exists, and is thrown away.**
[`lib/map-pins.ts`](../../frontend/src/lib/map-pins.ts)'s `buildPinOrderIndex` builds `stops` →
sorts them → collapses adjacent same-Place connection moments into `merged` → filters to
`numbered` → and then returns a `Map<placeId, number>`. **`merged` is the traversable sequence,
already carrying exactly the rule the owner decided**, and it is a local `const` that never leaves
the function. So the work is not a second itinerary algorithm and not a concat: it is a **small
extraction** — `buildDayStopSequence(usages, ctx) → Stop[]`, which `buildPinOrderIndex` then
consumes itself. That is root rule 8's "generalise the one-off", and it is a few lines.

There are already **three** call sites wanting "the day in order" and each reconstructs it
differently: `buildPinOrderIndex` internally, `screens/Map.tsx`'s `orderedStops` (which re-derives
it from `pin.order` and throws away place identity, keeping only `{lat, lng}` for the connector),
and `mapsDayRouteUrl` downstream of that. The extraction is overdue independent of this feature.

**2. `placeDayEntries` is not a tail primitive**, and calling it one is the brief's one wrong
premise. Its `DayPlacement` is a **three-way split on the hard/soft axis**
([ADR-0011](../decisions/0011-hard-soft-event-model.md)): unpositioned **commitments** go to a strip
**above** the list, unpositioned **ideas** to the tail **below** it. Concatenating "its tail" after
the Map's timed stops would put an unpositioned hard commitment **last**, where the day view
deliberately puts it **first**. It is also event-shaped (`UnplacedRow` carries a `TripEvent`) where
a map stop is place-shaped (`{usage, day, moment}`). The two do not compose, and the Map must not
read it.

**3. The two primitives already disagree about a flexible time, on purpose.** `placeDayEntries`
parks a floor (`מ-15:00`) out of the sequence entirely — ADR-0171 §10a: a floor is open on the side
you act, so it holds no position. `buildPinOrderIndex` keeps it **in** the list at its floor
instant and only takes its number away — §10b, in its own words: _"The unknown ones keep their
place in the list and lose the mark."_ Both are right for their surface. The traversal order has to
pick one, **and the owner's rule as written picks neither exactly** — it says flexible goes after
the timed portion, which is `placeDayEntries`'s instinct, on a sequence whose numbers come from
`buildPinOrderIndex`. That is fork ⓐ below, and it is the session's real open question.

**4. The tail's population is filtered out at step one.** `hasScheduleSlot` requires
`prominence === 'edge'` **and** an `eventId`, so an idea pencilled to the day with no event never
enters `buildPinOrderIndex` at all — while the list shows it, because the list asks `inDayScope`, a
much wider question. The populations nest: numbered ⊂ merged ⊂ `hasScheduleSlot` ⊂ `inDayScope`.

So the sequence is **`merged`, then the `idea`-tier places**, and `ambient` is excluded — not by a
new predicate but by a decision already written: `PIN_TIER.ambient` is _"a strictly-middle night of
an ambient stay: backdrop, not a stop."_ Every line of the derivation comes from a rule that
already exists.

## The gesture conflict is narrower than the brief feared, and the reason is structural

`.map-placecard` is a **sibling** of `<MapPane>` inside `.map-split`, not a descendant —
`screens/Map.tsx`'s own comment says why (wrapping the pane remounts it, and a remount is a billed
map load, ADR-0121 §4). `useCanvasGestures` attaches its capture-phase listeners to the **pane**
element. **A pointerdown on the card therefore never reaches the canvas recogniser at all**, so the
fifth gesture does not join the existing four-way arbitration over pan/pinch/long-press/menu — it
sits beside it.

What is real, measured off the rendered frames at 360×640:

|                                                           |           |                                                                           |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| the card's inline gutter of bare canvas, each side        | **8px**   | why arrows floating on the canvas (option ג׳) are refused                 |
| the seam from the card's bottom edge to `SnapSheet`'s top | **30px**  | `--map-attr-h` 22 + 8, and the sheet's top region is `touch-action: none` |
| free canvas above the card                                | **146px** | what pan, pinch and the long press are left                               |
| the selected card itself                                  | **177px** | 147px row + 30px rail                                                     |

The 30px seam is the one that decides the mechanism. It is under the 44px floor, but it is a
_margin_ and not a control, so the conclusion runs the other way: a finger starting there is
already on a region carrying `touch-action: none`, which the browser will not hand back. So the
swipe must take the pointer (`setPointerCapture`) the moment it is recognised — which is not a new
idea to invent but **the arbitration ADR-0145 §A2 already fixed between the two existing drags**:
_"Both drags take capture at drag start, which is the whole of the arbitration between them."_
Plus one CSS declaration, `touch-action: pan-y`, because the card can hold a note list that scrolls
(ADR-0153 §8) and `maybe-card.css`'s session-114 scar is explicit: _"`none` killed the strip's
swipe; `pan-x` then killed the page's."_

## What the drawing settled, against what it was expected to

- **Option ב׳ (arrows inside the name row) dies on the render.** `.map-t` already holds the name,
  the lock mark and the rename pencil, and the name is the row's one flexible column — two 30px
  arrows in it truncate `שוק צ׳אטוצ׳אק` to `שוק צ׳אטו…`. Drawn, visible, not argued.
- **Option ג׳ (arrows on the canvas) dies on one number.** The gutter is 8px, so a control meeting
  the 44px floor there either covers the card or eats the strip where a pan starts. The frame shows
  it overlapping `2.6 ק״מ` and the way-in block.
- **A traversal counter would contradict the badge under it.** Numbers are dense over _known_
  moments only, so on the fixture day the airport you return a car to is pin **5** and the **6th**
  thing you traverse. A `6 · 8` readout beside a badge stamped `5` is exactly the
  screen-contradicts-itself defect ADR-0121 §6's 2026-08-06 amendment was written to end. Drawn
  with the real numbers, not a convenient example.
- **A dot rail is the indicator that cannot lie** — it claims order and nothing else. Its first
  draft marked the tail's dots as hollow rings, reasoning correctly from the `idea` tier's dashed
  pin; the render says a 1px ring inside a 5px circle is not a distinction at phone scale. It is a
  gap and a hairline now.
- **The wrap nudge has a ceiling of 8px**, and this was a bug in the file's own first draft. The
  card is `inset-inline: 8px` inside a `.map-split` carrying `overflow: hidden`, so a translate
  past that gutter is not an overshoot — it is a clipped corner. 10px clipped by 2px. The control
  now offers 4/6/8 and the table prints the overhang; which of them _feels_ like coming round is
  the device pass's.
- **The rail's honest price is 30px out of 146px** of remaining canvas at 360×640 — a fifth of
  what pan, pinch and the long press have left. Worth stating rather than discovering later.

## A shipped defect, found by rendering and unrelated to any of this

[`screens/map.css:88`](../../frontend/src/screens/map.css) opens a selector list and puts a
17-line comment **inside** it, so the list parses as
`.map-controls > .map-search-btn, .map-controls > .map-controls > .map-querystrip`. The second
matches nothing. The first — which was never meant to be in this rule at all; the comment above it
says search _"sits at the row's fixed end"_ — quietly collects `flex: 1 1 auto; min-width: 0`,
outranks the button's own `flex: 0 0 auto; width: 34px` on specificity (0,2,0 over 0,1,0), and
stretches a 34px square to **178px**, the whole free end of the controls row. The query strip
escapes only because the entire block is **duplicated** at line 216 and that copy is well-formed —
which is also the fingerprint of how it happened. The mockup carries a control toggling the break
against the one-line repair. Fix belongs in `screens/map.css`, not in this feature.

## The correction, and why it made the proposal smaller

> _"The bottom rail is rounded but the place card itself is rounded as well · that makes it look
> awkward and not related."_

Right, and **structural rather than cosmetic**. The rail was drawn as a **sibling** of `.place`
inside `.map-placecard` — and `.place` is a self-contained card: its own ground,
`border-radius: 16px`, hairline, `.map-placecard .place`'s floating shadow, and `.selected`'s 2px
ring, which stopped halfway down the card and made the fault visible in the owner's screenshot.
**Nothing outside that box can read as part of it.** No amount of matching radii fixes that; two
elements pretending to be one card would still have left the selection ring around only the first.

The fix was already written in the app, three times. `.map-refs`, `.place > .note-sec` and
`.place > .docr-sec` are the **same five declarations** for "a full-width line inside the card", and
`.place` is `flex-wrap: wrap` _precisely_ so such a line can exist — its own comment says so. The
rail is that grammar's fourth tenant, so the file's proposed CSS **lost** declarations: ground,
radius, shadow, clip and the selection ring are all inherited now.

This is the shape the skill warns about from the other side — a long hand-written CSS block usually
means a primitive went unused, and here the block shrank when the primitive was found. It is also
the reason the first draft looked wrong at all: drawing a _new mechanism_ (a footer) where the app
already had one (a line) is exactly how a duplicate gets born.

Two things the move surfaced that the source hides:

- Those five declarations now appear **four** times in `map.css`. One `.place > .place-line` class
  is the obvious collapse (rule 8). **Flagged, not taken** — it is not this feature's job.
- Their `margin-top: 8px` is invisible spend. `.place` is `gap: 11px` and flex gap applies between
  **wrapped lines**, so those blocks are separated by 19px and the margin is a third separator. The
  rail drops it and reads identically, which is 8px back on a card that needs it.

And the honest number moved with it. **The rail costs 50px** — its own 39px box plus the 11px
wrapped-line gap — of a card whose free canvas above it is **~126px** at 360×640. That is what the
feature is bought with, and it is stated because the alternatives measured worse, not because it is
cheap. The card's existing `max-height` arithmetic in `map.css` already turns an over-tall card into
a scroll rather than a clip, so it degrades gracefully.

## The three forks put to the owner — all answered, all as recommended

- **ⓐ Where a flexible time sits in the traversal order.** _Interleaved_ at its floor instant,
  which is where `buildPinOrderIndex` leaves it today and therefore what the pins on the same
  canvas already imply — or _in the tail_ after the timed run, which is how the owner's rule reads
  and what ADR-0171 §10a does on the day view. Session recommendation: **interleaved**, because the
  numbers are visible on the pins and on the card's own badge, and a traversal order contradicting
  them is the defect §6's amendment closed. The word "flexible" in the owner's rule most likely
  meant _clockless_, which the tail already covers. **Owner: interleaved.**
- **ⓑ The indicator.** Dot rail · numeric · none. Recommendation: **dot rail**. **Owner: dot rail.**
- **ⓒ The wrap feedback.** The nudge motion at 4/6/8px, or nothing but the indicator's own jump.
  Recommendation: **the nudge at 6px**, with the final value owned by the device pass. **Owner: 6px.**

## Not decided here, deliberately

Broader grouping than "two adjacent moments of one place in one connection" — the owner set that
aside for a future session and this file assumes nothing about it.

## The second correction, and it blocks the build

> _"There could be cards with enrichment data or multiple bookings of events so they could be much
> higher, did you take that into account with your design?"_

**No.** §2–§6 were all reasoned on the **minimum** card: one reference, no enrichment, no notes. The
loaded card breaks two ways, neither caused by this feature, and one of them makes this feature
invisible.

**The bounded card clips its pinned rows.** With notes or a hero present, `map.css` caps the card and
`.place` becomes a grid in which only `.note-sec-list` scrolls. At 360×640 with three references plus
enrichment, the **pinned rows alone** overrun that cap by **83px** — measured on the frame,
intersected with the card's clip box:

|                                              |                          |
| -------------------------------------------- | ------------------------ |
| `.note-sec-list`, the one scrolling track    | **0px**                  |
| `.map-refs-foot` — `שיבוץ ליום`, `עוד בגוגל` | **10 of 44px**           |
| the traversal rail                           | **39px tall, 0 visible** |

ADR-0148 §1 promised _"the shortfall becomes a SCROLL instead of a clip"_ — and that holds only while
the shortfall is in the note list. Nothing bounds the pinned rows, so past a certain load the card
drops them from the bottom, and the selected row's primary actions go first.

**The unbounded card clips the other end.** The `max-height` fires only on `:has(> .map-draft)`,
`:has(.note-sec)` and `:has(.map-hero)`. A place with several bookings and no notes and no enrichment
is bounded by **nothing**: anchored to the split's bottom, it grows **up** past the floating controls
row, which paints after it in the JSX and therefore over it — **~15px of the identity row ends up
behind the chips.** ADR-0148 §1's own words for that shape: _"what survived was the actions row and
what died was the title, which is the worst way round."_

**Both are filed as their own backlog lines and both block J.** The build order is now fixed: the
card's bound is fixed first, then the rail. Shipping the other way round puts a navigation control on
a card that does not draw it.

**And the method lesson, which is the part worth keeping.** Six of the file's seven sections measured
**heights**, and a height cannot see a clip — `.place` carries `overflow: hidden` on the bounded
variants, so every rect reads healthy while content is gone. `frontend/CLAUDE.md` names this exact
trap ("Reading a rect and calling it visibility") and lists two evenings where it bit this same card.
§7 now intersects each section's rect with the card's clipping box and draws the cut line on the
frame. The instrument was wrong, not the numbers.

**One option the question surfaced, and it is the ADR's one open item.** `.map-refs-foot` is already
the card's pinned bottom row, already on every selected place, and its children are already 44px — so
arrows inside it cost **0px**, and pushed to the row's outer edges they measure **16.9px** from the
nearest verb, clearing ADR-0157 §2's 16px. It is not chosen outright because it only reduces the
overrun (83px → 44px) rather than removing it, and because the foot holds `שיבוץ ליום` and the
delete: a stop-to-stop arrow is not a verb about this place, and that spacing rule exists because a
mis-press there is destructive. Both numbers are in §7; the seat goes to the owner.

## The third correction, and it deleted most of the design

> _"That begs the question, do we even want the rail if it adds that much pixels. Maybe we should do
> the wanderlog approach, show just a little of the next card. And lose the circularity, maybe it's
> not that important."_

The right conclusion from the previous section's numbers, and **v1 had already drawn it and rejected
it** — §6, the scroll-snap carousel, refused on exactly one argument: a snap scroller is a line with
two ends, and wrapping means jumping `scrollLeft` while momentum is still running. **Wrap was the
only blocker.** Offering to drop it changes one input, not the taste, and then the carousel wins
outright. Drawn in [`mockups/map-stop-traversal-v2.html`](../../mockups/map-stop-traversal-v2.html);
v1 stays as the record of what was decided before.

What it deletes rather than restyles: the rail (**50px → 0px**), the whole pointer-gesture apparatus
(`scroll-snap-type: x mandatory` is the browser's, so no `setPointerCapture`, no slop threshold for
the device pass, no `touch-action` puzzle, no `armClickSwallow`), the indicator **and** its badge
contradiction (a peek asserts no ordinal), and the wrap nudge with its 8px ceiling (no peek on a side
**is** the end). Measured at 360×640: track 342px, slide 286px, peek 28px per side.

**It is cheap because of the card's own rule.** A peek slide is the collapsed 73px `.place` row —
every heavy block is revealed by selection and absent otherwise — and the selection↔scroll coupling
is `lib/useCenterSelected.ts` on the `inline` axis, already built, already carrying the mandatory-snap
trap this needs.

**Two corrections the render forced on the amendment's own first draft**, and they are the useful
part:

- **The bound must move from the card to the slide.** `overflow-x: auto` with `overflow-y: visible`
  is not available — the used value becomes `auto` — so a track scrolls on both axes. Unbounded, the
  slide measured **422px inside a 315px track**, its top **53px above the split**, the identity row
  **82px behind the controls row**: _worse_ than the rail, and exactly the second failure mode from
  the previous section. `align-self: stretch` on the selected slide binds it (a percentage
  `max-height` computes to `none` against an indefinite-height parent), which is the pair `map.css`
  already writes one element out. **So the peek does not remove the card-bound prerequisite; it needs
  it.**
- **The "0px" arrow seat is not 0px.** `.map-refs-foot` is `flex-wrap: wrap` with a 16px gap and two
  44px verbs, and the slide is narrower than the card by the peek — so the foot breaks to two lines:
  **44px → 82px, i.e. 38px** against the rail's 50px. Not cheap enough to justify putting navigation
  in the row that holds delete.

And a third, smaller: the file had to **centre the selected slide itself**, and until it did, every
peek reading came off a track resting at `scrollLeft: 0` — the table printed a peek of **−238px**. A
negative measurement is the file catching itself, the same class as v1's seam reading an entrance
animation instead of the resting box.

**Answered: no arrows.** _"No arrows, only peek."_ So the proposal's whole surface is a track and a
slide — no `.map-stopnav`, no `NavArrow` on this card, nothing added to `.map-refs-foot`. The 38px
measurement stands as the reason rather than being deleted with the option.

**And one more correction, which fixed something the amendment had asserted.** _"In the mockups only
one card was expanded. I want them all to be expanded the same way (as if you clicked on the place
pin), that makes it look more balanced."_ Right — with collapsed neighbours the peek showed the edge
of a **64px** row floating at the bottom of a **209px** card: a sliver, not a card edge. Equal
density measures the neighbour at **209px** against the selected slide's 209px.

It needs `expanded` to split from `selected`, which are one fact today (`Map.tsx` passes the notes,
references and summary only for the selected row; `.map-rename` is CSS-gated on `.place.selected`). A
track is the first surface wanting one density across all slides with exactly one selection. What is
deliberately not done is making them all _look_ selected — that trades the imbalance for an
ambiguity about which card you are on, so the border and ring stay on one.

**And it costs the amendment its own cheapness argument.** "The peek is cheap because neighbours are
collapsed rows" is no longer true: **three full cards** are mounted. Three, not N — a peek shows one
neighbour either side. That is a mounting cost on a screen that re-renders every second, not a pixel
cost; the proposal still adds **0px** of pinned height.

**Still open:** wrap — the word was _"maybe"_, and §2 draws its absence so it can be judged on sight.

## Verification still owed

A **real-device pass** is not optional for this one. The original report is a mobile-ergonomics
report, and the two questions that decide whether the feature is good — does the swipe fight the
map's own pan, and does wrap read as coming round or as a glitch — cannot be answered from a
desktop screenshot. `frontend/CLAUDE.md`'s testing section and the ADR-0126 / ADR-0171 device-pass
precedents are the standard. The slop threshold (⁦36px⁩ default) and the nudge (⁦6px⁩ default) ship as
recommendations for that pass to settle, not as decisions this session made.
