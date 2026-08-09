# 0178 — A day row says **what**, then **when**

**Status:** Accepted (2026-08-09) — design accepted by the owner; **not built yet**. Build follows this ADR.
**Date:** 2026-08-09
**Session note:** [`planning/2026-08-09-session-236-the-title-gets-17-percent-of-the-row.md`](../planning/2026-08-09-session-236-the-title-gets-17-percent-of-the-row.md)
**Mockup:** [`mockups/plan-row-title-overflow-v1.html`](../../mockups/plan-row-title-overflow-v1.html)

**Amends in place:** [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §7 — the row's time **stays** the button that moves the event. It changes cell, not meaning.
**Relates:** [0011](0011-hard-soft-event-model.md) (hard/soft, and where its mark belongs), [0059](0059-booking-presentation-on-home-and-index.md) §3 (the inline route and its destination-primary fallback, both kept), [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §4 + §8 (the row's tap is a read — which is what makes an ellipsis admissible — and the row carries no names or ids), [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6c (a stub is noise, not information), [0017](0017-mobile-first-device-targets.md) (360px is the design width), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber is the clock's), [0096](0096-per-domain-claude-md-guides.md) (rule 8 — two day surfaces, one shape)

## Context

Owner screenshot of Plan mode's day builder: a flight row's `קפלאוויק ← פרנקפורט` painted straight under `00:20–05:50`, on both flight rows of that day.

> in plan day see screenshot, there's text overflowing to the time box. Let's think how to handle this gracefully (preferably not folding text to three dots … to hint that's there's more). I'm not sure how to handle this though, there could be even longer texts

The first drawing answered exactly that question — how should text behave when it does not fit — with three flow rules. Rendered, they stop the overflow and produce `קפלאווי / ק`: a place name broken across two lines mid-word. The owner's rejection is what produced this ADR, and it is kept as §6 of the mockup rather than deleted, because the mistake is easy to repeat: **it answered the question as asked instead of the question underneath it.**

Read off the rendered DOM at 360px, the row's real budget:

|                                                 |                |
| ----------------------------------------------- | -------------- |
| row content box                                 | 302px          |
| badge 36 + lock anchor 22 + ⋯ 32 + four gaps 40 | 130px          |
| **the time column**                             | **124px**      |
| **left for the title**                          | **48px · 17%** |
| what the reported route asks for                | **129px**      |

The time column deserves its own sentence: `.bld-time` is `flex: 0 0 auto`, so its width is its **widest line**, and on a zone-crossing flight the widest line is the second one — `3:30 שע׳` beside the shift pill measures wider than the `00:20–05:50` it annotates. A fact the row exists for was sized by its own footnote.

Single-line tuning was then drawn and **killed by its own numbers**: stacking that footnote and deleting the redundant `קשיח` chip take the title to **71px**. (The chip buys **zero** width — it is a flex sibling that already wraps to its own line, so it costs height.) Against 129px the line is not short of calibration; it is short by a factor of two. Line-breaking inside 48px is a correct answer to the wrong question.

Four shipped defects surfaced on the way, none of which any test could see:

- **`.route` is an atom.** `display: inline-flex` (`screens.css:2799`) — default `nowrap`, two single-word `<bdi>` children. No break point and no shrink point at any width, so a **16-character** route spills the moment the row is narrower than it. This was never a length problem.
- **The code documents the opposite behaviour.** `route-display.tsx`'s header says _"Nothing here truncates: both layouts wrap rather than clip"_. The inline layout it describes cannot wrap. The file states the intent correctly; the CSS one directory over does not implement it.
- **The Trip-mode day card is already broken too, not merely at risk.** `EventCard`'s `.wp-event-title-txt` carries the same `min-width: 0` and a comment reading _"anything else may wrap freely"_ around the same `.route`. On the reported flight its title box is **97.8px against 129px — −37px**. An earlier reading in this session called it "latent" on 69px of headroom; that had been measured against a route long enough to trip 0059 §3's destination-primary fallback, so it measured the short title the fallback produces rather than the reported one.
- **The obvious cheap fix is actively harmful on the reported surface.** Lowering `ROUTE_INLINE_MAX_CHARS` falls back to a destination-primary title and returns the origin as `meta`. The Trip card renders that meta; the builder row does not — `PlanDay.tsx:1773` passes `title` alone, because [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §8 took names off this row deliberately. So here the origin does not move to a second line: **it is deleted.**

## Decision

### 1. The row says one thing per line: **what**, then **when**

Both day rows become a grid rather than a flex line.

```
'badge title menu'      .bld           — Plan's builder row
'badge when  menu'

'badge title check chev'   .wp-event-face — Trip's day card
'badge when  check chev'
```

`minmax(0, 1fr)` on the title column is the `min-width: 0` the flex version already carried, said once and in the place that owns the width. The `check` track is the day card's settled ✓; an `auto` track with nothing in it is 0px, so an ordinary card lays out exactly like the builder row.

The title stops competing with the time and gets the row: **48px → 214px** (17% → 71% of the content box; 244px at 390px). The reported route fits **on one line at the design width**, and nothing about it is hidden, shortened or truncated to achieve that.

**`ROUTE_INLINE_MAX_CHARS` does not move, and `routeDisplay` is untouched.** This is what reconciles the decision with 0059 §3, which rejected per-row measurement: what that ADR refused was **content** that varies by surface — the two modes showing different routes for one flight. Here both modes receive identical content and only the line count is the browser's. **Identical content, local layout.**

### 2. Both day surfaces change together

Owner, mid-session, on seeing it drawn for the builder row alone:

> Make sure that your design for plan and trip mode's are aligned

The two rows already share `.route`, `routeDisplay`, `PlaceBadge`, the tag chips and the zone pill. Shape was the one thing about to diverge, which is rule 8 ([0096](0096-per-domain-claude-md-guides.md)) at the layout layer. Under the proposal both titles land at **214px / 213px**.

What stays different stays different **deliberately**, and is not drift: Plan's time is a `button` and wears 0161 §7's hairline chip, Trip's is a readout; the badge is 36px against 40px; the type ramps differ. **The layout is aligned; the density is not.**

### 3. The time keeps being the control it is, and gains room to be read

Still `button.bld-time`, same target, same meaning — 0161 §7 is **amended in place, not reversed**: a row's own time is what you press to move the event, and it changes cell, not identity. What changes is that its two cramped stacked lines become one line with room: `00:20–05:50 · 3:30 שע׳ · ⏱ +2 ש׳`. The duration and the zone pill stop being a footnote squeezed under a number and become peers in a sentence.

`justify-self: start` keeps it under the title's start edge. That is the single-column scan the trailing-time layout is usually defended for and does not actually deliver — its position moves with every row's height.

**The when line may wrap** (`flex-wrap: wrap` on the time element). This is load-bearing rather than defensive; see §5.

### 4. One lock, beside the thing it locks

Hard/soft is drawn **three times** today: `.bld-anchor`'s lock at the row's start, the `🔒 קשיח` chip inside the title's flex line, and the border (solid against soft's dashed — whose CSS comment already says _"the dashed border carries the soft cue"_). Two go.

The survivor moves **into the when line**, where it means something: [0011](0011-hard-soft-event-model.md)'s hard event is a commitment about its **time**, and the time is now a sentence with a subject. `🔒 00:20–05:50` says once, beside the fact it is about, what the row was saying in three places.

This is the only part of the decision that removes something a reader can see, and it was put to the owner as an explicit fork with both versions drawn side by side (mockup §3), hard row beside soft row in every frame. **Accepted.** A soft row is henceforth marked by its dashed border and the absence of a lock, not by the word `גמיש`.

### 5. Wrapping to two lines, then `…` — and only then

The owner ruled the ellipsis out as an **answer** and then admitted it as a last resort:

> I don't like the safety net, I would prefer two lines or a fold to 3 dots… when necessary

So, in order: **the route may break at its own boundary** (`flex-wrap: wrap` on `.route` — the one rule that stops it being an atom); **a word is never broken** (the earlier `overflow-wrap: anywhere` is rejected outright — it is the textbook rule for making overflow impossible and it is what produced `קפלאווי / ק`; a place name split across a line break is not a place name); **two lines**; then `…`.

`text-overflow: ellipsis` rides the clamp for the one case the clamp alone cannot fold: a single word longer than the line has no break opportunity, makes one over-wide line, and would otherwise be clipped with no hint at all.

**Two lines and not one** — one line ellipsises the reported route, which is the bug. **Two and not three** — past two the row stops being scannable, and the builder is a list you reorder by eye. What makes the `…` admissible at all is recent and is the reason this reads differently than it would have six months ago: [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §4 made the row's own tap a **read**, so the full title is one tap away. It was not, when this row was designed.

Measured across the stress set — four titles up to a 24-character unbreakable Icelandic place name — the fold fires on **0 of 4** at both widths. It is a defined worst case, not a strategy.

## Consequences

**Heights, measured rather than argued.** The flight row is unchanged at **88px** (its when line wraps on zone-crossing rows); a plain soft row goes **65px → 69px**; the long-title row **117px → 87px**. The obvious objection — "a second line makes every row taller" — does not survive the measurement, because today's row is already 88px _for the wrong reason_: the `קשיח` chip wraps inside `.bld-t`. Two lines of height are already being paid for and are being spent on a tag.

**A new row shape exists and is the one thing to watch on a device**: on zone-crossing rows the when line wraps to two lines. It is the closest surviving relative of the footnote this decision took off the time column, and whether it reads as two facts or as clutter is an [0017](0017-mobile-first-device-targets.md) device-pass question.

**Rejected, each drawn in the mockup so the rejection is checkable:** the ellipsis as the answer rather than the backstop (§6b — it cuts the reported route); the same clamp with the ellipsis suppressed (§6c — the cleanest-looking option, and it deletes the end of a title with no sign anything is missing); single-line calibration (§6a, with the 71px that killed it); lowering `ROUTE_INLINE_MAX_CHARS` (Context, fourth defect); and mid-word breaking (§5).

**Untouched, and recorded as where the width is if the row ever needs more:** `.bld-icon` (32px) and `.bld-bd` (36px). Each is another ADR's decision ([0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md)'s menu, [0121](0121-embedded-map-phase-6-design.md) §8's badge) and neither is needed for the route to fit.

**Two process rules came out of this session's own mistake, and both are now instruments in the mockup rather than advice.** The first proposal fixed the reported overflow and created a new one 30px away — the when line had the title's column alone, 214px for a 247px sentence, so it painted over the ⋯ at 360px and not at 390px. The measurement table reported `0px`, because every reading watched `.bld-main`. The owner caught it by eye.

- **A fix that moves an element measures the element it moved**, not only the one that was reported.
- **An overlap check is two-dimensional.** The first re-measure still said "23px" because it compared x-axis extents, and one axis cannot distinguish _passes beneath_ from _collides with_.

The mockup now sweeps every pair of boxes in every frame at both widths in both modes; it immediately found a second collision, in the file's own §3 control frame. Any future row-layout mockup should carry the same sweep.
