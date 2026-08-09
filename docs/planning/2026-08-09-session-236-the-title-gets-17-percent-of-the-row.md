# Session 236 — the title gets 17% of the row

**2026-08-09 · design session, nothing built.**
Deliverable: [`mockups/plan-row-title-overflow-v1.html`](../../mockups/plan-row-title-overflow-v1.html)
(+ its catalog entry, + a backlog line). **No ADR yet** — the layout half is a fork
put to the owner, and writing the ADR before that answer would be inventing the
decision rather than recording it.

## The report

A screenshot of Plan mode's day builder, two flight rows deep: `קפלאוויק ← פרנקפורט`
running straight under `00:20–05:50`, and the same on the row below it.

> in plan day see screenshot, there's text overflowing to the time box. Let's think
> how to handle this gracefully (preferably not folding text to three dots ... to
> hint that's there's more). I'm not sure how to handle this though, there could be
> even longer texts

## What was drawn first, and why it was rejected

A first draft answered exactly that question — how should the text behave when it
does not fit — with three CSS rules that let the route reflow: `flex-wrap: wrap` on
`.route`, `overflow-wrap: anywhere` on its endpoints, a two-line clamp behind them.
Rendered, they do stop the overflow, and they produce `קפלאווי / ק`: a place name
broken across two lines mid-word.

> Your suggestions look really bad. You're an expert ui ux designer and your
> suggestions are subpar and not up to our standards. Lets think outside the box and
> resolve this. We could consider wrapping the text and adding 3 dots when truly
> necessary.

**The correction is the useful part of this session, so the draft is drawn in the
file's §6 rather than deleted.** The mistake is not that the rules are wrong — they
survive as the backstop — it is that they answered the question as asked instead of
the question under it. Line-breaking inside 48px is a correct answer to the wrong
question.

## The reframe, measured

`§1` of the mockup reads the row's own budget off the DOM at 360px:

|                                                 |                |
| ----------------------------------------------- | -------------- |
| row content box                                 | 302px          |
| badge 36 + lock anchor 22 + ⋯ 32 + four gaps 40 | 130px          |
| **the time column**                             | **124px**      |
| **what is left for the title**                  | **48px · 17%** |
| what the reported route asks for                | 129px          |

The time column is worth pausing on: `.bld-time` is `flex: 0 0 auto`, so its width is
its widest line, and on a zone-crossing flight the widest line is the **second** one —
`3:30 שע׳` beside the shift pill measures wider than the `00:20–05:50` it annotates.
A fact the row exists for is sized by its own footnote.

**Single-line tuning was then measured and killed by its own numbers.** Stacking that
footnote and deleting the redundant `קשיח` chip take the title from 48px to **71px**.
The chip in particular buys **zero width** — it is a flex sibling that already wraps
to its own line, so it costs height, not width. Against 129px, the single line is not
short of calibration; it is short by a factor of two.

## What the file promotes

**The row gets a second line.** A three-column grid —
`'badge title menu' / 'badge when menu'` — with the time on the second row.

- Title **48px → 214px** (17% → 71% of the row; 244px at 390px).
- Row height **88px → 69px**. The height objection closes on measurement rather than
  argument: today's row is 88px _because_ the `קשיח` chip wraps inside `.bld-t`, so
  two lines are already paid for and are being spent on a tag.
- The time stays `button.bld-time` — same target, same meaning, ADR-0161 §7 intact
  (a row's time is what you press to move the event). It changes cell, not identity,
  and gains room to read as a sentence: `00:20–05:50 · 3:30 שע׳ · ⏱ +2 ש׳`.
- `justify-self: start` aligns it under the title, which is the single-column scan the
  trailing-time layout is usually defended for and does not actually deliver — its
  position moves with every row's height.
- The `…` survives **as a backstop and only that**, at two lines. The file counts how
  often it fires by reading `scrollHeight > clientHeight`: **0 of 4** across the stress
  set, including a 24-character unbreakable Icelandic place name. What makes it
  admissible at all is recent — ADR-0174 §4 made the row's tap a _read_, so the full
  title is one tap away; it was not when this row was designed.

## Both modes move together (mockup §5)

Mid-session, on seeing the proposal drawn for the builder row alone:

> Make sure that your design for plan and trip mode's are aligned

Correct, and the file had it wrong: the two day surfaces already share `.route`,
`routeDisplay`, `PlaceBadge`, the tag chips and the zone pill, so **shape was the one
thing about to diverge** (rule 8 / ADR-0096). The grid now applies to `.wp-event-face`
as well, and both titles land at **214px / 213px**. What stays different stays different
deliberately: Plan's time is a `button` wearing ADR-0161 §7's hairline chip and Trip's is
a readout, the badge is 36px against 40px. The layout is aligned; the density is not.

## The correction the owner caught, and the instrument that came out of it

> the 3 dots button on the left, it overflows there even in your suggestions

Right, and it was in the **proposal**, not the before frames. The first drawing spanned
the ⋯ down both rows and left the when line the title's column alone — 214px for a
sentence measuring 247px — so `⏱ +2 ש׳` ran into the ⋯ at 360px. It rendered clean at
390px, which is how it survived.

**The measurement table is what let it through.** Every reading watched `.bld-main`, so a
proposal that fixed the reported overflow and introduced a new one 30px away reported
`0px`. Two rules, now built into the file as a sweep rather than written down as advice:

- **A fix that moves an element measures the element it moved**, not only the one that
  was reported.
- **An overlap check is two-dimensional.** The first re-measure still said "23px" because
  it compared x-axis extents, and one axis cannot tell _passes beneath_ from _collides
  with_.

The sweep runs over every pair of boxes in every frame, at both widths, in both modes.
It immediately found a second collision — in §3's own control frame, where the restored
lock landed on the badge.

## The fork left to the owner (mockup §3)

Hard/soft is drawn **three times**: `.bld-anchor`'s lock, the `🔒 קשיח` chip, and the
border (solid against soft's dashed — whose own CSS comment says the dashed border
carries the soft cue). The proposal keeps one and moves it into the when line, where
ADR-0011 says it belongs: a hard event is a commitment about its **time**, so
`🔒 00:20–05:50` says once, beside the fact it is about, what the row said in three
places.

This is the only part of the proposal that removes something a reader can see — a soft
row is then marked by its dashed border and the absence of a lock rather than by the
word `גמיש`. Every frame in the file carries a hard row and a soft row side by side so
it can be judged rather than described, and §3 draws the same layout with both marks
put back.

## Four shipped defects the file names

1. **`.route` is an atom.** `display: inline-flex` (screens.css:2799), default `nowrap`,
   two single-word `<bdi>` children — no break point and no shrink point at any width.
   A 16-character route spills the moment the row is narrower than it. This is not a
   length problem and never was.
2. **The code already documented the opposite behaviour.** `route-display.tsx`'s header
   says "Nothing here truncates: both layouts wrap rather than clip". The inline layout
   it describes cannot wrap. The file states the intent correctly and the CSS one
   directory over does not implement it, which is why no threshold, test or review ever
   caught this.
3. **The same atom is in `EventCard`, and it is already failing there.** Behind a comment
   reading "anything else may wrap freely" sits the same `.route`; measured with the same
   flight, the day card's title box is **97.8px against a 129px route — −37px**. A first
   pass in this session called it "latent" on a reading of 69px of headroom, which had
   been taken against a route long enough to trip `routeDisplay`'s destination-primary
   fallback — so it measured the short title the fallback produces, not the reported one.
4. **The obvious cheap fix is actively harmful on the reported surface.** Lowering
   `ROUTE_INLINE_MAX_CHARS` falls back to a destination-primary title and hands the
   origin back as `meta`. The Trip card renders that meta; the builder row does not —
   `PlanDay.tsx:1773` passes `title` alone, because ADR-0174 §8 took names off this row
   on purpose. So here the origin does not move to a second line, it is **deleted**.
   The threshold does not move, and `routeDisplay` keeps returning the same thing on
   both surfaces: **identical content, local layout**, which is what reconciles all of
   this with ADR-0059 §3 — what that ADR rejected was per-row _content_ divergence, not
   per-surface line counts.

## Owed next

- The owner's answer on §3 (the visible deletion) and on §2's scan claim.
- Whether the when line wrapping to two lines on zone-crossing rows reads as two facts
  or as the footnote this proposal took off the time column — it is the one row shape
  the alignment work introduced.
- Then the ADR, with ADR-0161 §7 amended **in place** rather than rewritten, and
  ADR-0011's marks noted where they now sit.
- Three device-pass questions the file cannot settle (ADR-0017): whether a soft row
  still reads as soft from the dashed border alone; whether the title-aligned time
  column really scans better than the trailing one; and whether 214px of title reads as
  calmer or emptier.
