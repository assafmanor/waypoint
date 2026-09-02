# 0217 — The now-marker points; it does not separate

**Status:** Proposed
**Date:** 2026-09-02
**Reported:** the owner, against the Day view and Plan day — _"The day view / plan day shows an
indicator or where we currently are in the day 'עכשיו' … The problem with it is what happens when
we are during an event. Today the now line appears before the event, giving the wrong impression
that the event isn't taking place yet … maybe making longer events longer rows or something to
indicate that they're longer (think how Google calendar looks basically). There are some edge cases
and things to think about: overlapping events, driving times, day start and end, etc."_ — and then,
against this ADR's first draft: _"I don't think that this indication is good. Let's think outside
the box. We don't **have** to keep a row saying what's now. We can do an arrow or idk, as long as
it's clear that it indicates to when we are in the day and is prominent enough so that people
immediately and intuitively understand"_
**Drawn in:** [`mockups/the-now-line-is-inside-something-v1.html`](../../mockups/the-now-line-is-inside-something-v1.html)
**Session note:** [2026-09-02](../planning/2026-09-02-the-marker-points-it-does-not-separate.md)
**Refines:** [0043](0043-day-view-now-line-phases-and-archive-chrome.md) §1/§5 (the now-line and
Plan's static reference — this changes its **posture**, on the owner's instruction, and keeps its
one-live-mark rule), [0041](0041-concurrency-model-nests-and-clusters.md) (the containment forest,
which is why the marker cannot be an index), [0210](0210-a-day-is-points-lines-and-envelopes.md)
(points, lines and envelopes — the marker must not become a sixth box),
[0211](0211-a-gap-has-a-character.md) (a gap has a character; here it gets a length),
[0212](0212-a-flight-is-a-line-that-is-also-a-commitment.md) §1/§2 (`--trv-track`, measured at the
badge's centre — the reason a bead on the day's thread was rejected),
[0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md) §11 (the shared
reader's own placement, which this unifies). **Constrained by**
[0028](0028-plan-violet-color-budget-dark-ready.md) rule 4 and [0017](0017-mobile-first-phone-primary.md).

## Context

### 1. The app wrote this bug down, in the file that causes it

`lib/now-line.ts`'s own header: _"the answer is an index, and a row that is currently running gets
the line above it rather than through it … 'now' is often genuinely INSIDE something — a flight you
are on, a dinner you are at, the layover between two legs — and the honest marker would say so."_
`NowLinePlacement` returns an **object with one field** for exactly this reason, and
`docs/backlog.md` carries the item twice (lines 44 and 431) dated 2026-08-02. The derivation seam
was cut two months ago; what was missing was the drawing.

The screen also contradicts itself today, in two adjacent rows: `EventCard` puts the shipped
`עכשיו` chip on the running card (ADR-0178 §4 kept it deliberately — _"`softNow` is not the kind,
it is `עכשיו` — the fact this whole tab is read for"_) while the line above the same card says the
event has not started.

### 2. A marker _between_ rows cannot answer this — by construction

ADR-0041's forest means a moment can be inside **two rows at once**: an envelope (a festival
16:00–20:00 holding a concert 17:00–18:00) at 17:30, or a cluster of two partially-overlapping
peers. An index into a flat list has one value. So this is not a placement bug with a better
placement available; the marker has to stop being a slot.

### 3. Two shipped surfaces already disagree

`lib/share-now-line.ts` (ADR-0213 §11) places the marker **after** a row that has started;
`DayView` places it **before**. `docs/backlog.md:44` names the split and asks for one rule.

### 4. "Google Calendar" is refused by a measurement the app has already taken

`.wp-event-face` is a 40px badge inside 14px of padding — a ~70px floor before a word of content.
Drawn proportionally at ⁦0.8px⁩ a minute (the mockup's §4א), a 30-minute event comes out **⁦24px⁩
tall** and clips; the day grows ⁦742px⁩ → ⁦838px⁩ to buy it. Extending the same rule to a travel leg
would also undo ADR-0210 §3's ⁦58px⁩ → ⁦40px⁩ — the inverted hierarchy that ADR fixed.

## Decision

### §1 · The marker is a playhead, and it replaces `.nowline` rather than joining it

A **solid amber arrow** pinned in the day's own margin at the exact height of `now`, pointing into
the list, with a **⁦2px⁩ solid amber rule** running out of it across the full width of the screen.
It has no height in the flow, it never separates two cards, and it can land **inside** one.

- **`.now-here` wraps whichever row holds the moment** and carries `--thru`, the fraction of that
  row behind us. The wrapper is `.day-thread`'s arrangement exactly (ADR-0212 §1) — a positioned
  sibling whose child paints over it — reused rather than invented, and it is also what lets the
  rule pass **behind** the card.
- **The occlusion is the sentence.** A rule you can see runs _between_ things; a rule that
  disappears behind a card runs _through_ it; the arrow says at what height. Nothing is captioned.
- **The arrow stands in the margin, never on the card.** In RTL a card's leading edge is the 40px
  badge's own column — this file's first pass put a time chip there and drew it on top of the
  glyph. Measured: the arrow is ⁦12×18px⁩ in ⁦16px⁩ of `.body` padding.
- **It is a triangle from one logical border** (`border-inline-start`), so it points into the list
  in both directions with no sign written anywhere — the discipline `ui/Icon.tsx`'s `MIRRORED` set
  follows, and the reason it is not a `‹` character (`Bidi_Mirrored`, ADR-0118).
- **It keeps the day's one leading edge at any depth.** `--now-bleed` is overridden inside
  `.nest-kids` (⁦32px⁩) and `.cluster-kids` (⁦18px⁩) so a nested row's arrow does not stand ⁦32px⁩
  further in than its parent's. `.day-trv-ic`'s own rule, one column over.
- **Measured cost: zero height, and the day gets shorter.** The running card is ⁦72px⁩ with the
  playhead and ⁦72px⁩ without it; the day is **⁦742px⁩ against ⁦772px⁩** with the shipped row, because
  `.nowline` costs ⁦19px⁩ plus its ⁦11px⁩ bottom margin.

**This changes a posture ADR-0043 §1 set, and says so out loud.** There the marker was _"a quiet
time reference, deliberately below the live event in the visual hierarchy … no pulse"_, and its
Alternatives rejected _"a vivid, pulsing, board-styled now-line"_. The owner's instruction —
_"prominent enough so that people immediately and intuitively understand"_ — reverses that. What is
**not** reversed is the one-live-mark rule (`hero-lift.css` §D6: _"the app has one live mark,
`.nowline` is it"_): the playhead **is** that mark, drawn louder. No pulse, no second mark, no new
hue — amber is the clock (ADR-0028 rule 4).

### §2 · Who holds the moment is already answered, and stays answered

`nowLinePlacement` grows `inside: { key, thru }` — the innermost holder and how far through it is.
Everything else that holds the moment keeps the **shipped `.wp-event.now` ring**, untouched. Ring =
_who_ (plural, which is what overlap needs); playhead = _exactly where_ (singular, which is what an
arrow can be).

**"Innermost" is one comparison and it covers both shapes of overlap:** the row that started most
recently, and the shorter of two that started together. For an envelope that is containment (the
concert is inside the festival and started later); for a cluster, where neither peer contains the
other and containment has no answer, it is "the thing you most recently walked into".

### §3 · What is left, on the row that is running

The running row's `.wp-event-timemeta` shows **what is left instead of the total** —
`.when-dur`'s exact shape (mono, 700) re-inked `--amber-deep`. The range above already says how
long; inside the thing you want what remains.

**The bare rung, not `t.travel.remaining`'s `נותרו …`, and both reasons are measurements.** The
full wording is ⁦123.4px⁩ against the duration's ⁦61.9px⁩, which wraps the `when` cell and charges the
card **⁦72px⁩ → ⁦91px⁩** at ⁦360px⁩; and it prints a whole Hebrew word inside `--font-mono`, which this
repo forbids (`board.css`: _"mono is for their numeric run, never for Hebrew beside it"_). The bare
rung is the same width as what it replaces — zero px, zero new copy. The mockup draws both behind a
control; if the owner wants the word, it is ⁦19px⁩ on one row per day.

### §4 · A gap absorbs the marker; a point and a bookend never hold it

- **A gap holds the moment like anything else** and the arrow lands in it. Its label states what is
  left of the hole (`freeTimePhrase`), which is the useful half of "what next". No second line
  under it: a gap **is** a line, and two would be one fact drawn twice.
- **A point cannot hold it.** A check-in, a landing, a car pick-up is an instant (ADR-0210 §1) —
  it is ahead of us or behind us, never around us.
- **A bookend stay cannot either**, because it carries no clock at all (ADR-0210 §4).
- **A settled row stops holding it.** Once you have answered "we were there", "how far through" is
  not a question — so the arrow drops to the boundary below the row, which is where it already was.
  The row keeps its place above the marker, because it did start.
- **Where nothing holds the moment** — before the day's first row, after its last, and inside the
  head hole `dayBlocks` draws no row for (a join is computed only when `prevEnd && start`) — the
  arrow attaches to the **boundary** of the row it is next to, as a zero-height wrapper. One
  mechanism, not two.
- **Midnight is free**: the fraction is computed on instants, so a ⁦22:00–01:30⁩ event with ADR-0037's
  `+1` needs no special case.

### §5 · Plan gets the same derivation and a different ink

ADR-0043 §5 stands: in Plan this is a **static reference**, never a live signal. Three properties
change — the arrow's fill becomes violet, the rule becomes dashed violet, and the remaining time
becomes `--plan`. **ADR-0043 §5 says "hollow marker" and a border-triangle cannot be hollow**, so
what ships is a low-contrast violet fill with the identical silhouette; a genuinely outlined arrow
costs a `clip-path` plus one more pseudo-element and is the owner's call.

### §6 · "Longer events look longer" — the proportion goes into the holes

**Gap rows become proportional to the hole they state**, floored at their shipped height and capped:
`clamp(20px, minutes × --gpm, 104px)` with `--gpm` at ⁦0.3px⁩ a minute. The floor is the _measured_
shipped height and not a chosen number — at ⁦0.3px⁩ the first draft floored at ⁦13px⁩ and made every
short hole **shorter** than it ships, trading the list's rhythm away to buy the thing this is for.
**A hole may grow; it may not shrink.**

Measured on the reported day: the ⁦140⁩-minute hole goes **⁦20px⁩ → ⁦42px⁩** and the day grows ⁦742px⁩ →
⁦764px⁩ — ⁦22px⁩ for a day that now _looks_ like it has a two-hour hole in it, with every card
untouched. `--gpm` is a feel number and a device pass owns the final value.

## Alternatives, and the measurements that killed them

All four are drawn in the mockup's §7 and stay there, because for three of them the measurement
**is** the argument.

- **The shipped hairline, moved below every row that has started.** The cheap floor: one comparison
  in `nowLinePlacement`, no CSS, and it would have unified the two hosts on its own. Rejected
  because it answers "has it started" and not "where are we" — and because it keeps a row, which
  is what the instruction removed.
- **The hairline laid across the card (Google Calendar's literal answer).** Not tunable:
  `--thru` is the clock, so in every event there is a moment when the rule lands on the text and
  reads as a strike-through on the time. It works in Google Calendar because a block there is
  mostly empty; a card here is a title, a clock and a badge.
- **A ⁦4px⁩ gauge on the card's leading edge.** Zero height, and the only candidate that works on
  two rows at once. Rejected because it is **not prominent** — it is precisely the whisper the
  instruction cancels, and at ⁦3px⁩ (its first draft) it could not be found without looking for it.
  Its idea survives in §2's division of labour: the ring is the "which rows" half.
- **A bead on the day's own thread.** Looked right until it was drawn: `--trv-track` is ⁦36px⁩ —
  the **badge's centre**, where ADR-0212 §2 measured it deliberately — so the bead sits on the
  tile, and layering only trades a collision for a disappearance behind the card, which is exactly
  what `.day-thread > .wp-event` guarantees. Extending the thread down the whole day would also
  erase ADR-0212 §1's distinction (the thread is for what **carries** you,
  `spendsSpanInMotion`). On a leg it is right, and there the playhead already lands on the leg's
  own line.
- **A vertical proportional rail beside the list** (a day mini-map). The closest thing to Google
  Calendar here, and a second surface: its blocks cannot align with non-proportional cards, and
  what it adds — "how full is this day" — is what `DayGlance` / `lib/day-track.ts` already answer
  on Home and the night board. Two places saying it is a duplicate, not a layer.
- **A pulse on the marker.** ADR-0043 rejected it and nothing here changes that: the app has one
  live mark and its movement down the list is the liveness. Prominence is bought with shape and
  weight.
- **True proportional row height (§4א).** The measured refusal above: a 30-minute card at ⁦24px⁩,
  ⁦96px⁩ of day, and ADR-0210 §3 undone for legs.
- **Stepped row height (§4ב).** Cheap and it works, but it charges ⁦88px⁩ of day height on exactly
  the days that already hurt, and a ⁦72⁩/⁦86⁩/⁦102px⁩ spread is a difference that needs a ruler —
  which ADR-0210 already rejected once for badge sizes.
- **A capped length bar in the leading column (§4ד).** Zero height, and it stops answering "how
  long" at the cap, which is where the question starts.

## Consequences

- **Frontend only, no data-model change.** `nowLinePlacement` grows `inside`; `DayView` and
  `PlanDay` render `.now-here` around the holder instead of interleaving `NowLine`;
  `lib/share-now-line.ts` reads the same shape, which closes `docs/backlog.md:44`. The `.nowline`
  block in `screens.css` is replaced, not extended.
- **Touching `nowLinePlacement` means touching both day surfaces and the shared reader.** ADR-0171
  §10e is the repair for a split shipped in `DayView` only; `frontend/CLAUDE.md` names it as an
  anti-pattern. Three consumers, one derivation.
- **The day gets shorter** — ⁦30px⁩ on any day with a "now" — which was not the goal and is worth
  stating beside ADR-0210's own ⁦1154px⁩ → ⁦1058px⁩.
- **Colour budget unchanged:** amber = time, `--plan` = Plan. No hue is minted and none is spent
  decoratively.
- **`prefers-reduced-motion` is not in play**: the playhead has no animation, and its movement is
  a re-render on the clock tick like the line it replaces.
- **Accessibility:** `.now-here` carries the `aria-label` `.nowline` used to
  (`t.day.nowLineAria`), and the arrow and rule are `pointer-events: none` with no touch target —
  so ADR-0017's ⁦44px⁩ floor does not apply to them and nothing new competes for a tap.

## Open, and the owner's call

- **Does the rule pass behind the cards or over them?** Behind is the default and the honest one
  (the occlusion is the sentence); over is Google Calendar's own answer, which the owner named, and
  it pays a strike-through on text once per event. A control in the mockup, and a phone decides.
- **The arrow's size.** ⁦18px⁩ is the recommendation; ⁦14⁩ and ⁦22⁩ are drawn. It sits flush against
  the screen's inline edge, which a device with a safe-area inset may want inset by a pixel or two.
- **`--gpm` for §6.** ⁦0.3px⁩ a minute is the recommendation.
- **`נותרו 1:10 שע׳` or `1:10 שע׳`.** §3 recommends the bare rung on two measurements; the word is
  ⁦19px⁩ on one row per day if the owner wants it said out loud.
- **A genuinely hollow arrow for Plan**, per §5's literal reading of ADR-0043 §5.
