# Session 185 — the pin says what happened, and the ghost was the point (2026-07-30)

[ADR-0137](../decisions/0137-the-pin-says-what-happened.md), built. Two mockups:
[`map-pin-outcome-v2.html`](../../mockups/map-pin-outcome-v2.html) is the design,
[`map-pin-outcome-v1.html`](../../mockups/map-pin-outcome-v1.html) is superseded and kept for
what it got wrong.

> _"On the map icons, currently past or skipped events all render with ghost icons on the map
> (correct me if I'm wrong), I think that we can differentiate between regular ghosts (passed,
> not marked skipped or consumed), skipped, and consumed."_

## The repo had already promised this, in writing

[ADR-0117](../decisions/0117-map-place-outcome-states.md) named the three states and built
them into the **list** in session 112. Its Consequences then said:

> **Phase 6 inherits it**: the same outcome drives the rendered pin's treatment when the map
> lands, with no second derivation.

It didn't, and `map-pane.css` had been carrying the admission for two months — _"every
behind-you pin looks the same whatever closed it."_ Which makes this less a feature than a
**debt with a comment on it**. Worth noticing as a pattern: a deferred promise that names its
own successor phase is easy to write and easy to never come back to. The comment is what made
it findable, so the comment did its job.

## I answered the wrong population, twice over

My first pass corrected the owner's vocabulary — a `ghost` on this canvas is a place pencilled
for **another day**, not a past place — and then built for the tier I had just named instead
of the one they meant:

> _"I was talking about ghosts. A ghost could be unmarked, skipped, or consumed."_

They meant the ghost. And the ghost is the better answer on every axis, which I had argued
myself into missing:

- **It is the pin with a free centre.** Hollow by design: no fill, no glyph, no number. A
  centred mark costs it nothing, and it gets the largest mark on the ladder — on the smallest
  pin on the ladder.
- **It is the pin where the mark is worth most.** A ghost is context, and the only question
  context raises is _do I still need to care about this?_ A hollow pin with a ✓ says we did
  that one, on another day.

v1's argument for a **silent** ghost — that it reports on a day you are not looking at — reads
now as taking the ghost's one advantage and filing it as a defect. The lesson is narrow and
reusable: **when a correction is right, check whether the thing being corrected was also
right.** I used the vocabulary fix as licence to redirect the feature.

The second half of the same reply killed v1's other choice:

> _"Regarding non ghost pins … they should retain their icons so it's easier to distinguish."_

v1 traded the category emoji for the mark, on the reasoning that in front of a place you have
finished with, _what happened_ outranks _what kind of place it is_. True of one pin. False of
five grey ones side by side, which is the case the tab exists for.

## The constraint I stated as a law was a property of my own layout

I told the owner, twice and confidently, that the canvas could not use `--ok`/`--miss`: the
`behind` tier is defined by `saturate(.3)`, so a green ✓ and a red ✕ both arrive as one olive.
Then they asked for green and red anyway — and it just works, because that filter is on
**`.pin-b`** and neither mark is inside it. A ghost has no filter at all; the shoulder badge
is `.pin-b`'s sibling.

So the constraint was real right up until the placement moved, and **moving the mark out of
the body dissolved it rather than working around it**. The generalisation worth keeping: I had
promoted "true of the thing I built" to "true of the surface", and the tell was that I said it
without re-deriving it the second time.

## Then the owner made it simpler than I had it

> _"maybe when marked it should replace the number as it has become irrelevant anyway, and
> more importantly the look is much cleaner"_

I had the mark as a **second** badge on the free shoulder, with a pleasing story about a pair
(`where it is in the day` · `what happened there`). Both clauses of the reply beat it. The
number is the index in the day's sequence, and once a human settles a stop you are not going
to it in any order — so it is **spent**, not merely redundant. And two badges on a 34px
teardrop are its third and fourth floating object.

The tell that this was the right shape is that it **deleted machinery**: no second geometry,
no second corner, no extra entry in either of the two places that already hide `.pin-n`'s
siblings. When the owner's simplification also shrinks the CSS, the earlier version was
carrying a story rather than a requirement.

Note what survives from the shipped comment it contradicts — _"behind you KEEPS its number …
#1 is still true after you have been there."_ That is about the **clock's** partition and it
stays true, for the passed-but-unsettled pin. What spends the number is a **human**. The
comment was not wrong, it was narrower than it read.

## Rendering it caught four things reasoning did not

This is the session's strongest argument for screenshotting your own work: every one of these
was invisible in the code and obvious in the image.

1. **White marks vanish on a pastel body.** v1 drew the mark in `--card`, reasoning from
   `.pin-n`, which stamps white and is legible. `.pin-n` is legible because it sits on
   `--ink`; a pin's body is a pastel. Rendered across all five hues at the 34px floor, white
   on the food hue was nearly gone.
2. **`.pin-n`'s corner was an accident.** It positions with `inset-inline-start` **and**
   carries `dir="auto"` — and `auto` over digit-only content resolves to **LTR**, so the badge
   has been sitting on the left in an RTL app for as long as its content stayed numeric. Put
   an SVG in the same slot and it inherits the page's RTL and flips shoulders. Found twice:
   first as two badges stacking on one shoulder, then again when the mark moved into the
   number's slot. Now pinned with physical `left` — identical pixels, stated reason.
3. **My specimens were flattering the design.** I had paired green category hues with ✓ and
   reddish ones with ✕, so every sample agreed with itself. The pairing that decides it is the
   **mismatch** — a green ✓ inside the reddish food outline. It holds, but I only know that
   because the mockup now draws it. A demo that cannot fail is not evidence.

4. **The right token at the wrong amount.** Asked point-blank whether the palette usage was
   sound, I went to check instead of answering — and a **mostly-settled day** is what refuted
   it. `--ok`/`--miss` neat put six saturated discs on the canvas, louder than the one amber
   next-stop cue, which breaks two rules already in the repo: ADR-0130 §3's axis (_"a passed
   stop keeps its solidity and **loses its colour**"_ — grey is what behind-you means here) and
   ADR-0109 §6's _"never a second accent on every pin"_. The badge now steps toward `--muted`,
   the way the numeral on that tier already does. The reusable bit: **"this hue is sanctioned
   for this meaning" does not settle how much of it a subordinate tier may carry.** I had
   checked the token and not the quantity, twice — first arguing colour was impossible here,
   then using it neat.

One more from a test rather than a screenshot: settling a stay settles **every** day of it
(ADR-0117 §2 outranks the clock), so a done hotel's strictly-middle night resolves to `behind`
rather than `ambient` — which means the ambient suppression cannot live on the tier and has to
read the day's own prominence. Caught by asserting the wrong tier, which is the useful kind of
red.

## The gap this makes visible, and deliberately does not close

The Map can now **read** an outcome and still cannot **write** one: settling lives in the day
view's settle strip (ADR-0043) and the event card. So an unmarked passed pin is now a visible
open question with no answer available where it is asked. Backlogged as its own design pass at
the owner's request — the interesting part is not the button but _which event_ on a place with
several on one day, which is the same all-references rule ADR-0117 §5 already states for
reading it.

Also backlogged and **not** added: a line for this session's own work. It ships here, so its
record is the ADR and this note; a backlog entry for it would be the status
[ADR-0046](../decisions/0046-retire-the-task-board.md) keeps out of that file. Caught by the
owner — _"Why backlog? Aren't you building everything now?"_ — after I had written exactly
that line.
