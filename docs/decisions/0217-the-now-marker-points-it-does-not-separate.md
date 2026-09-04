# 0217 — The now-marker points; it does not separate

**Status:** Accepted 2026-09-02, on the owner's approval of the mockup. **Built** the same day —
see the build log at the foot, which records what building it changed and the one part deliberately
left for a follow-up.
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
immediately and intuitively understand"_ — and twice more against the built drawing:
_"just make sure to you fix the issue where the playhead is going over the text… Other cases looked
great as is"_, and, after a translucent band was tried in its place, _"I actually preferred much
better when it didn't go over the event rows, like you originally did"_
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
the list, with a **⁦2px⁩ solid amber rule** running out of it across the full width of the screen and
disappearing behind the row that holds the moment. It has no height in the flow, it never separates
two cards, and it can land **inside** one.

- **`.now-here` wraps whichever row holds the moment** and carries `--thru`, the fraction of that
  row behind us. The wrapper is `.day-thread`'s arrangement exactly (ADR-0212 §1) — a positioned
  sibling whose child paints over it — reused rather than invented, and it is also what lets the
  rule pass behind the row.
- **The occlusion is the sentence.** A rule you can see runs _between_ things; a rule that
  disappears behind a row runs _through_ it; the arrow says at what height. Nothing is captioned.
- **The two boxless families occlude it with their TEXT, not with a box**, and this is the one
  correction the built drawing needed. Owner: _"just make sure to you fix the issue where the
  playhead is going over the text … Other cases looked great as is"_, against a screenshot of a
  **gap**. Occlusion had exactly one mechanism — a card's opaque background — and ADR-0210 §3/§4
  took the box away from a leg and a bracket on purpose, so the rule ran straight through
  `1:15 שע׳ פנויות` and the leg's own two lines.

  **The answer is already shipped one selector over, in that very row family.**
  `.day-trv-ic .icon` carries `background: var(--screen)` and a ⁦4.5px⁩ halo because _"the glyph
  rides ON the track, so the rule stops behind it instead of running through it. The halo is the
  LIST's ground and not `--card`."_ Same problem, same answer, one row down: the glyph already
  stopped the rule for free and only the words were left out. The gap's label and glyph, and the
  leg's **inner** text runs, now carry the same halo — inner and not the wrappers, because
  `.day-trv-hd`/`.day-trv-meta` are column-width blocks and a halo on those masks the rule across
  the whole row. All of it scoped under `.now-here`, so it costs nothing on a row the moment is not
  in. It inherits the halo's one known mismatch: a leg inside a `.journey` block sits on `--card`
  while the halo is the list's `--screen` — which the shipped glyph already does, so this records it
  rather than solving it.

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
change — the arrow's fill becomes violet, the band's core becomes a dashed violet, and the remaining
time becomes `--plan`.

Plan's rule is occluded by the row exactly as Trip's is, and carries the same halo on the two
boxless families — the difference is ink, not mechanism, which is what ADR-0159 §1 means by a
difference in posture. **ADR-0043 §5 says "hollow marker" and a border-triangle cannot be hollow**, so
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
- **Cutting the rule at the row's edge** (an opaque/transparent mask). Built, drawn, refused: this
  is what the owner saw and called _"totally cutoff"_ — on a ⁦40px⁩ leg carrying two lines of text it
  leaves two ⁦16px⁩ stubs and no line at all.
- **A translucent band over everything** — an ⁦18px⁩ amber wash at ⁦12%⁩ with a ⁦2px⁩ core, solid in the
  margins and ⁦22%⁩ across a row. Also built and drawn, and it does solve both complaints at once:
  continuous, and light rather than ink. Refused because it crosses the event rows, which is the
  thing the owner did not want — _"I actually preferred much better when it didn't go over the event
  rows, like you originally did"_. Recorded because it is the obvious next idea and this is the
  answer to it.
- **A halo on the leg's block wrappers** rather than its inner text runs. `.day-trv-hd` and
  `.day-trv-meta` are column-width, so the halo masks the rule across the whole row — the stubs
  again, by a different route.
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

- **`מעל השורה`, the third arm**, drops both the z-index and the halo so the rule crosses
  everything: Google Calendar's own answer, which the owner named. It is drawn so the strike-through
  it pays for is visible rather than argued about; it is not the default.
- **The arrow's size.** ⁦18px⁩ is the recommendation; ⁦14⁩ and ⁦22⁩ are drawn. It sits flush against
  the screen's inline edge, which a device with a safe-area inset may want inset by a pixel or two.
- **`--gpm` for §6.** ⁦0.3px⁩ a minute is the recommendation.
- **`נותרו 1:10 שע׳` or `1:10 שע׳`.** §3 recommends the bare rung on two measurements; the word is
  ⁦19px⁩ on one row per day if the owner wants it said out loud.
- **A genuinely hollow arrow for Plan**, per §5's literal reading of ADR-0043 §5.

## Build log (2026-09-02)

Built as decided, with **one reuse finding that changed the shape of the change**, one deliberate
deferral, and a coverage hole the build had to close before it could be trusted.

### 1 · There were THREE now-marks, and that is what made this a rule-8 job

The ADR was written about a placement. The build found the app had **three implementations of one
fact**, none shared:

| host              | mark             | took                          |
| ----------------- | ---------------- | ----------------------------- |
| `DayView`         | `.nowline`       | a `Date` + a `tz`             |
| `PlanDay`         | `.nowref`        | epoch ms + a `tz`             |
| `SharedItinerary` | `.nowline` again | a pre-formatted `HH:MM` label |

And the third one's own comment said why: _"`DayView`'s `NowLine` is not imported because it is
that screen's local component and takes …"_. **What kept them apart was not the look, it was the
shape of the input.** The shared reader has no instants at all — the public projection
deliberately ships formatted labels so two renderers cannot format one instant two ways (ADR-0213
§11) — so any component taking a `Date` locks it out by construction.

So the mark is now one component, `ui/domain/NowMarker.tsx`, and it **takes a formatted `label`**,
which all three hosts already have (`formatTime` / `shareTimeLabel`). Formatting stays where the
zone knowledge is. `.nowline` and `.nowref` are replaced; `.nowref` is deleted outright.

Two forms, one component, one prop apart: pass `children` + `thruFrac` and it wraps the row the
moment is inside; pass neither and it is the zero-height boundary mark. Every number a denser host
would need to move is a custom property with the day list's value as its default —
`--now-bleed`, `--now-tab`, `--now-ground`.

### 2 · The placement rule is split from both derivations, for the same reason

`lib/now-inside.ts` is new, pure and **unit-agnostic**: spans in, the innermost holder and a
fraction out. The day surfaces pass epoch milliseconds; the shared reader will pass `dawnOrder`'s
minutes-from-the-share's-own-dawn, which is a different unit and identical arithmetic. That split
is what lets `lib/share-now-line.ts` keep its own walk — it compares labels, not instants — while
sharing the RULE, which is exactly what its own comment asks for: _"unify it with the app's when
`nowLinePlacement` grows its `inside` shape."_

`nowLinePlacement` keeps `index` unchanged (a boundary still needs it) and grows `inside`.

**What the shared reader's task is now**, stated so the next session does not re-derive it: build
`NowSpan[]` from each section's events under `dawnOrder`, call `nowInside`, and replace that
screen's local `NowLine` with `<NowMarker label={nowLabel} …>`. Its `.sh-day-body .nowline` margin
rule becomes a `--now-bleed` (the day body's rhythm is tighter than the day list's). No new
mechanism, and `shareNowLine`'s deliberate end-based boundary — which exists because a shared
day's first row is routinely an all-day container — becomes moot for the case it was a compromise
about, because the marker lands inside that container instead of above it.

### 3 · A hole holds the moment, and it needed no second rule

ADR §4's gap case is derived at the render site rather than in `nowLinePlacement`, because a hole
is not an entry — `dayBlocks` measures it between two of them, after the placement exists. It
needs no second rule all the same: **a hole is precisely where no row holds the moment**, so
`inside === null` at that index already identifies it, and the two answers cannot disagree.

### 4 · The coverage hole that let the whole mark be replaced with a green suite

The first build ran 5211 tests green having deleted both markers and rewritten their placement,
because **neither day surface asserted anything about the mark, in either scope**. That is the
`frontend/CLAUDE.md` anti-pattern with no test to catch it. Closed: six specs on Trip and four on
Plan, asserting the fact (same row, same fraction, one derivation) and the posture separately, plus
the both-day-scopes rule and the settled-row case. They live in the two `*.travel.test.tsx` files
because the ~110-line `vi.mock` harness does, and a second copy of that is the duplication rule 8
forbids — `docs/backlog.md` carries the line to extract it when a third spec wants it.

### 5 · A transparent wrapper breaks every child combinator it lands inside

The mark wraps the row the moment is inside, and **four shipped rules reach a row through a child
combinator** — so the wrapper silently stopped them matching. Found by grepping the stylesheets
for `> .wp-event` / `> .day-trv` / `> .journey` over the families the mark can wrap, which is root
`CLAUDE.md`'s "count the call sites before claiming what a derivation does" applied to CSS:

- `.journey > .wp-event` (and `.soft`) strips a leg's border, radius and ⁦10px⁩ margin so it reads
  as a **row of** the block (ADR-0159 §3). A wrapper in between hands all three back, inside the
  block.
- `.day-thread > .wp-event` lifts a carried card above the thread's own rule so the line paints
  **behind** it (ADR-0212 §1). Without the wrapper in that list the thread paints over the card.

**ADR-0212 §6's build log records the identical defect one rule away, from the identical cause** —
_"The rule named `.wp-event` alone, which is true while a run is one card and false the moment two
legs group inside `.journey`"_ — which is what makes this a counting failure rather than a
knowledge one. Both lists now name `.now-here`, and a fifth family added later fails
`styles/now-marker.contract.test.ts` instead of failing on a phone. jsdom loads no CSS, so nothing
else in the suite can see this class of bug at all; the contract test was verified to go red when
the repair is reverted.

The same grep found the clipping: `.journey` carries `overflow: hidden` for its own radius, so a
mark reaching past its box is a mark with **no arrow**. Inside a journey block the mark takes
`--now-bleed: 0` and the arrow lands in the card's own face padding. That rule replaces the dead
`.journey .nowline` margin, which said the same thing about a rule laid between two legs.

### 6 · Deferred on purpose: §6, the proportional gaps

**§6 is not built.** It is the "longer events look longer" half, it is orthogonal to the marker,
it changes the height of every day, and it lands in two different components (`JoinRow` and Plan's
gap control) rather than in the mark. The owner has approved it on a desktop render and not on a
device, and `--gpm` is explicitly a feel number. It has a backlog line; the marker did not need to
wait behind it.

### 7 · Taking a row out of the list moved every gap chip, and one drag was resting on one

The only red this build produced was in `e2e/shelf-drag.spec.ts` — the day page-turn under a live
drag — and nothing about the drag changed. Plan's now-reference stopped being a **row**, so every
chip below it moved ~30px up, and one spec's release point stopped landing on nothing and started
landing on a gap chip. The commit that followed wrote into a slot on the day the turn had just left.

The defect is `PlanDay`'s and predates this ADR: a drop target lives on the day surface, and the
surface turns. It is fixed and written up where the mechanism lives —
[ADR-0116](0116-day-aware-shelf-and-idea-target-day.md)'s 2026-09-02 amendment — with the case
re-aimed at a chip deliberately and its premise asserted, since the old spec's premise was
inherited from a reason that had not been true for a month.

**The lesson for the next row this repo deletes:** a list's heights are an input to every gesture
hit-tested against it, and the specs that encode a height do not say so. Grep the e2e suite for the
surface, not just the class.

## Amendment (2026-09-02, the same evening) — the boundary form reserves its own room, and carries the clock

Owner, from a phone at ⁦00:17⁩ on a day whose first event is at ⁦02:00⁩ — so the moment is before
everything and the mark is in the boundary form §4 describes:

> I'm not sure about the day start and end boundaries. It looks kind of awkward sitting there
> hugging the event card with no space at all.

Drawn and measured in
[`mockups/where-the-marker-stands-when-nothing-holds-it-v1.html`](../../mockups/where-the-marker-stands-when-nothing-holds-it-v1.html).

**It is not the edges, it is every boundary — and the measurement is the argument.** The day list
separates its rows with **bottom** margins only (`.wp-event` ⁦10px⁩, `.day-gap` ⁦9px⁩,
`.transition-row` the same) and nothing in it carries a `margin-top`. A zero-height mark inserted
between two rows therefore lands ⁦10px⁩ below the row above and **⁦0px⁩** above the row below, always.
Measured on the reported day:

| where the mark is                                  | above · below, as shipped |
| -------------------------------------------------- | ------------------------- |
| the day's head (the report)                        | ⁦11 · 0⁩                  |
| **between two ordinary cards**                     | ⁦10 · 0⁩                  |
| the day's tail, after the sleep bookend            | ⁦10 · 12⁩                 |
| `.day-unplaced`, the day's OTHER line between rows | ⁦10 · 9⁩                  |

Three things fall out of that table. The head is not special — it is where nothing softens the
defect, because the only thing above it is `.sec-title`'s ⁦11px⁩. **The between-two-cards case is the
same defect and was never reported**, because a rule on a card's top border reads as the card's own
edge rather than as something wrong; a fix aimed at "the edges" would have missed it. It is reached
whenever a hole is under `GAP_MIN_MINUTES` (⁦60⁩) — `gapBetween` is floored, so a ⁦20⁩-minute hole
draws no row at all. And **the tail is already fine**, so nothing is done to it.

### The room is not ours to choose

`.day-unplaced` — ADR-0171 §10a's _"the other thing a line between rows can say"_ — takes
`margin: 9px 0`, symmetric, at the day list's own rhythm. The boundary mark is the same shape and
did not take the same number. So it takes it now, as `margin-block` on `.now-here.edge` and nothing
else. `margin-block` and not `padding`, because adjacent margins collapse: above a card already
spending ⁦10px⁩ the mark costs nothing, and the day grows by ⁦9px⁩ — once, and only on a day whose
mark is at a boundary. The nailed form is untouched and still takes zero height; it is inside a row
and the row owns the space.

### And at a boundary the mark carries the clock

§1 dropped the caption for a stated reason: _"the running row's own `עכשיו` chip says the word"_. At
a boundary **there is no running row**, so that premise is simply absent and the only now-signal
left on the screen is an unlabelled amber rule — against the owner's own criterion from the round
that produced the arrow (_"as long as it's clear that it indicates to when we are in the day"_). The
boundary form therefore renders one child: `.nowline-chip`, **the chip `screens.css` still ships for
the public reader**, so the day surface and the shared page say `now` in one voice and
`now-marker.css` mints nothing (rule 8). At the **trailing** edge, because in RTL the leading edge is
the ⁦40px⁩ badge's column and the arrow's own margin — the first pass of the previous mockup put a
chip there and drew it on the glyph.

Measured: the mark goes ⁦0px⁩ → ⁦19px⁩ and the day ⁦392px⁩ → ⁦401px⁩ with the room alone, ⁦420px⁩ with the
chip.

### Rejected, and each is a thing that could reasonably be proposed again

- **The head hole as a real gap row**, so §4's "a gap absorbs the marker" would apply and the head's
  boundary case would disappear. **Refused on a fact, not on taste.** A gap row must state a length,
  and the head hole is the one hole in the day with no start: `dayBlocks` computes a join only when
  `prevEnd && start`, and before the first row there is no `prevEnd` — not because anyone forgot,
  but because nobody knows when the day began. The mockup draws it with the honest `? שעות פנויות`
  and an arrow whose height is computed from midnight, a start nobody told the app about. What is
  kept from it: the observation that the head boundary is really a hole, which is what the clock
  answers there ("how early am I").
- **No mark at all before the first row.** Cheapest, and it deletes the only signal on a day whose
  events are all still ahead — at ⁦00:17⁩ no row is running, no card carries `עכשיו`, and the screen
  would say nothing about where we are. Drawn anyway, because it is the honest floor if the chip
  fails a device pass.
- **A bigger number than ⁦9px⁩.** ⁦6⁩/⁦12⁩/⁦14⁩ are controls in the mockup. ⁦9⁩ ships because it is the
  one the app already uses for this exact shape; a different number here would mean two lines
  between rows spending two different amounts of the same rhythm.

### What rendering it found, and one of them is about mockups rather than about this app

- **`.nowline-chip` is a ⁦12%⁩ translucent fill, so the rule struck through the clock.** It was
  designed to sit BESIDE a hairline, never on one — and `.now-here > *`'s z-index lifts a child
  above the rule without making it opaque. The fix was already in the same sheet: `--now-ground`
  and the ⁦3.5px⁩ halo the gap's label and the leg's inner runs carry. Invisible in the CSS,
  obvious in one screenshot.
- **The first draft of this file put the room on the "as shipped" columns too**, because the
  proposed rule was written unscoped — and the measurement table dutifully reported the defect and
  the fix as the same ⁦10 · 9⁩. A before/after file has to be able to draw the before; the frame
  carries the proposal now, not the page.
- **And why the FIRST mockup could not have found any of this.** Every frame in
  `the-now-line-is-inside-something-v1.html` starts at the day's first row: `.sec-title` appears in
  that file's inlined CSS and never once in its rendered tree, and neither does `.day-unplaced` or
  the shelf heading. **A boundary is a statement about both of its sides**, so a frame cropped to
  the rows can draw the day's head and show nothing wrong with it. That is a rule for the next
  mockup of a list, not a note about this one.

### Open, and the owner's call

Whether the tail mark should sit **after** the sleep bookend, as it does today, or before it. The
bookend carries no clock at all (ADR-0210 §4), so neither position is derived from a fact — after
it reads as "everything the day listed is behind us", before it as "the night is still ahead". Left
as a question rather than decided quietly.

### Built the same evening, and the one thing the drawing left to the build

_"Alright let's go"_ — so ⁦9px⁩ of room plus the clock, as drawn.

`.now-here.edge` takes `--now-room` (⁦9px⁩, `margin-block`), `display: flex` and
`justify-content: flex-end`; `NowMarker`'s boundary form renders one child, `screens.css`'s
`.nowline-chip`, grounded with `--now-ground` and its ⁦3.5px⁩ halo. The nailed form is byte-for-byte
what §1 shipped.

**Plan's chip was the open one, because `.nowline-chip` is amber by construction.** §5 drew Trip
and Plan with the same chip and said so rather than pretending otherwise; a build has to choose,
and an amber clock on a drafting table is precisely what ADR-0043 §5 forbids. It ships re-inked —
`color: var(--plan)` on the chip, `background: var(--plan)` on its dot — which is colour only,
alongside the three properties that already differ. The difference between the two surfaces stays
ink and never a fact (ADR-0159 §1), so both boundary marks carry the clock and both screen specs
assert it.

**What the specs can and cannot see.** The chip and the label are DOM, so
`NowMarker.test.tsx` asserts the split directly — nailed to a row it renders no text, at a boundary
it renders the clock — and each day surface asserts its own boundary mark carries a clock
**formatted in the trip's zone** (`ZONE` is UTC+2 there, so a UTC ⁦14:00⁩ reads ⁦16:00⁩; that shift is
the assertion, not an inconvenience — it is what proves the mark takes a formatted label rather
than an instant, which is ADR-0213 §11's whole reason). The room and the halo are CSS and jsdom
loads none, so they are in `styles/now-marker.contract.test.ts` with the rest of this sheet's
invisible contract — three specs, verified red against the un-amended sheet before being trusted.

## Amendment (2026-09-02, the same evening) — the shared reader is the mark's third host

The owner named this follow-up when the marker was first built: _"my next task to you would be
to (design first of course) and then build the corresponding now line for the live sharing
screen"_. Drawn and measured in
[`mockups/the-shared-reader-gets-the-playhead-v1.html`](../../mockups/the-shared-reader-gets-the-playhead-v1.html).

**`lib/share-now-line.ts` asked for this by name.** It deviated from `nowLinePlacement` on
purpose — comparing an event's START where the app compared its END — and closed the argument
with _"unify it with the app's when `nowLinePlacement` grows its `inside` shape"_. It has, so
this is that sentence being cashed.

**And the start-based rule had its own half of the same defect, which nothing had written
down.** The end-based rule dragged the boundary to the top of any day whose first row is an
all-day container; the start-based one puts the marker BELOW every row that has begun — so on
a day with a ⁦10:00–16:00⁩ tour and a ⁦14:00–15:00⁩ shrine, at ⁦14:30⁩ the page tells a reader
following along that two things happening right now are behind them. That is the original
report (_"giving the wrong impression that the event isn't taking place yet"_) with the sign
flipped. Neither side was right, because both were answers to a question that had no third
option until §1 gave it one.

### What the page contributes, and it is four variables

`ui/domain/NowMarker` renders unchanged. `lib/now-inside.ts` runs unchanged — it was written
unit-agnostic for exactly this, and here it takes `dawnOrder`'s **minutes** where the day
surfaces hand it epoch milliseconds. The spans come from events carrying **both** labels: a
`startLabel` alone is a point, and ADR-0217 §4 already says a point cannot hold a moment, so
here that falls out of the data rather than out of a rule. Midnight needs no case either —
`dawnOrder` adds a day at both ends alike, so a ⁦22:00–01:30⁩ event measures ⁦210⁩ minutes.

`shared-itinerary.css` sets four numbers and nothing else:

|                |                                                 |                                                                                                                                                                                    |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--now-bleed`  | ⁦11px⁩                                          | `.sh-day-body`'s own inline padding, and a **ceiling**: `.sh-day` carries `overflow: hidden` for its radius, so more is a mark with no arrow — `.journey`'s trap, one surface over |
| `--now-tab`    | ⁦15px⁩                                          | ⁦18⁩ draws a ⁦13px⁩ triangle into an ⁦11px⁩ gutter and reaches over the row's edge; ⁦15⁩ is ⁦10.8px⁩ and fits                                                                      |
| `--now-ground` | the body's own `color-mix(--paper 34%, --card)` | never `--screen`; the halo paints what the mark stands on, and `now-marker.css` said so in advance                                                                                 |
| `--now-room`   | ⁦6px⁩                                           | this sheet's rhythm is tighter than the day list's (⁦7px⁩ between rows), so it is this host's equivalent of ⁦9px⁩ rather than a second opinion about one gap                       |

The three refusals are untouched and each is still an answer rather than a gap: a day crossing
a zone (its labels resolve per event, so the comparison is against two clocks), a day with no
timed row, and a day that is not today. `inside` cures none of them, because none was about
having no shape to draw.

### And the row says the word, which is what keeps the mark a shape

**§1's "no caption" has a premise, not a preference:** _"the running row's own `עכשיו` chip
says the word"_. True of `EventCard`. **Not true here** — this page marked a running row not at
all — so the nailed arrow was the only thing on screen saying anything, and an arrow says no
time. The same premise had already failed once, one surface over, for the boundary form.

Two ways to close it, and the render chose. Putting the clock on the **mark**, at the arrow's
height, is refused by measurement: the gutter is ⁦11px⁩, so a chip there lands ON the row's own
title and clock — the defect the owner rejected twice while this ADR was being drawn (_"fix the
issue where the playhead is going over the text"_). Drawn as §6ג so the refusal is a picture.
So the **row** says it, exactly as `EventCard` does, through `.sh-event-now` and `t.common.now`
— the word this page already rendered inside the now-line it is replacing, so no new
vocabulary, which is the axis ADR-0139 found drifts first when a small widget is copied.

**The rule generalises rather than gaining an exception:** the mark is a shape wherever the row
it is in says the word, and says the time itself only where no row is involved at all.

### Consequences

`.nowline`, `.nowline-rule` and `.nowline-lbl` are deleted from `screens.css` — the row they
belonged to is now gone from all three hosts. `.nowline-chip` and `.nowline-dot` stay, under
their old names deliberately: they are the same object doing the same job, and renaming them
would be a diff across three surfaces that changes nothing a reader sees.

`shareNowLine`'s return grew `inside` and keeps `daypart`/`index`, which still name where a
boundary WOULD go — the screen falls back to it whenever nothing holds the moment, and one of
the derivation's own tests reads it.

## Amendment (2026-09-03) — the mark is a fraction of the EVENT, not of the drive into it

Owner, with the shared page and the day view side by side, on a real trip at ⁦12:12⁩:

> _"Looks like the line isn't on the currently happening event on the live sharing page. See
> the difference between the sharing page and the day view"_

Both screens agreed about everything except where the arrow was. The day view nailed it inside
the ⁦12:00–13:00⁩ coffee; the shared page drew it on the ⁦14⁩-minute drive above the card — and
the card underneath still wore its own `עכשיו` chip, so the page said "now" and "not yet" in
the same breath. That contradiction is the one §1 set out to end, arriving through a door §1
did not think to close.

### The defect is the SCOPE of the wrapper, not the fraction

`--thru` is a percentage of the marked box's height, and the previous amendment's host wrapped
what it called "the row". On this page a row is not always one box: `EventRow` returns a
FRAGMENT, and an event carrying a stored journey (ADR-0205) renders the drive into it as a
sibling `.sh-journey` line **before** its `article.sh-event`. So the wrapper spanned the pair
and the fraction was measured over both. Measured in a browser on the shipped code: ⁦30⁩ minutes
into a ⁦90⁩-minute event the arrow landed at ⁦y=178.1⁩ against a card starting at ⁦y=189.8⁩ —
⁦11.7px⁩ above the box it was supposed to be inside, which is exactly a drive-line's height.

**`DayView` never had this**, and the reason is the fix: a join there is its own row with its
own mark when the moment is in the gap (`joinThru`), so no wrapper ever spans a travel line and
a card. The repair is to match that scope, not to adjust a number.

So the nailing moved **into `EventRow`**, which is the thing that already knows which of its
three shapes is the row's own box — the summary row, the `Trek` container (a chained journey IS
the event, so it takes the mark whole), or the article with its drive line left outside. The
host now hands down a `nowMark` and stops deciding what a box is.

### Why every test passed, and where the new one lives

This is a geometry defect, and **in jsdom every box is ⁦0px⁩ tall** — so no fraction of anything
is distinguishable from any other, and the unit suite could not have seen it at any level of
diligence. The suite that could is the one the repo already keeps for exactly this class
(`playwright.config.ts`: _"an asset path, a chunk boundary and a worker URL are all build-time
facts, and a dev-server suite asserts none of them"_ — a rendered fraction belongs in the same
family).

Two tests, at the two altitudes that can each say something:

- **`e2e/shared-itinerary.spec.ts`** reads `--thru` off the mark, computes the arrow's own `y`,
  and asserts it lies inside the card's rect **and** below the drive's — the second clause
  stated separately because a card grown tall enough to swallow the drive would satisfy the
  first without the defect being fixed. It fails on the old scope with the numbers above.
- **`SharedItinerary.test.tsx`** asserts the invariant underneath the geometry, which jsdom
  _can_ see: the journey line is outside `.now-here` and the card is inside it. It fails on the
  old scope with `expected <div class="sh-journey"> to be null`.

### What this does not change

The placement derivation is untouched: `shareNowLine`, `nowInside` and `dawnOrder` all return
what they returned, and `thruFrac` was right the whole time. Nothing about the boundary form
moves, and `NowMarker` itself is unchanged for the third time running — which remains the point
of it being one component.

## Amendment (2026-09-04) — a hole is two rows, and so are the day's two ends

Owner, with a screenshot of the reported day at ⁦13:01⁩ — an ⁦07:00–08:00⁩ event, an ⁦08:00–17:00⁩
hole holding a ⁦9⁩-minute drive, and the arrow lying across the drive:

> _"we're not yet in the driving time (leave before 16:46), so the line should be before it —
> unless someone marked it as 'on the way' (which I don't see)"_

The block under the arrow said `יציאה עד 16:46 · הגעה ~16:55` while the arrow said we were in it,
three and three-quarter hours early. Same contradiction as the previous amendment's, same cause,
one host over.

### The previous amendment named this defect and cleared the wrong host of it

Yesterday's write-up says, in as many words: _"`DayView` never had this, and the reason is the
fix: a join there is its own row with its own mark when the moment is in the gap (`joinThru`), so
no wrapper ever spans a travel line and a card."_ That is true of the card and false of the join.
Since ADR-0206 §AH3 a hole draws **two** rows — the free time first, then the journey out of it
(`free-time-comes-before-the-leave-by-v1.html`) — and `JoinRow` returns them as a **fragment**,
which is exactly the shape the shared reader was corrected for.

So `--thru` was measured over strip-plus-block, and where the arrow landed was decided by how
those two divide the pixels rather than by the clock: ⁦56%⁩ of a ⁦20px⁩ strip above a ⁦58px⁩ block is
inside the block, whatever the hour. This is the "count the call sites" rule in root `CLAUDE.md`
applied to a claim rather than to a derivation — one `grep` for what `JoinRow` returns would have
found the second box.

### The repair is intervals, because the two boxes ARE two intervals

`lib/now-line.ts` grows `nowInJoin`, and it is the same `nowInside` over spans everything else
uses: the free time runs from the hole's start to the **departure**, the journey runs from the
departure to the row below. The mark is nailed to the one that holds the moment and the other is
left alone — which also stops the halo (`.now-here .day-trv-leave` and friends) painting behind
a row the rule does not cross.

- **The departure is `leaveByMs` and nothing else.** The arms that state none (§AA4/§AM10/§AU1/
  §AZ1) leave the hole undivided and the free time keeps it: the block prints no departure there
  either, and the app must not claim a drive has begun on a number it does not have. Same for a
  flexible destination, whose "leave now to arrive then" is the hole's own start (ADR-0206 §AJ1)
  and would hand the journey the whole afternoon.
- **`ON_WAY` is the owner's own exception** and needs no second rule: a claim that somebody is
  moving ends the free time wherever the clock stands (ADR-0207 §2), so the departure becomes the
  hole's start and the journey takes all of it. Detecting the same thing without a claim stays
  out of scope, as the report says.
- **The buffer belongs to the journey.** From the leave-by to the row below is the walk plus
  §D5's five minutes; you are not in the room until it starts.
- **A connection band is one box** over a stop you are inside for the whole of it, and it never
  draws a journey beside it. Unchanged.
- **The split is `JoinRow`'s to make, not the screen's** — the same move `EventRow` took
  yesterday. `DayView` says only that the hole holds the moment; the row that knows how many
  boxes it is drawing says which one.

### And the same defect was at both ends of the day, where there is no join at all

`wakeJourney`, `arriveJourney` and `homeJourney` render **outside** the block loop, because §AD
and ADR-0209 §1 give them no join to hang off — so the boundary mark had exactly one position
against all three: below. At ⁦05:00⁩ that says an ⁦07:47⁩ drive out of the hotel is already behind
us, and after the day's last row it says a drive you have not started is done.

`nowInJourney` and `journeyIsAhead` answer it off the leg's own interval, recovered from the two
fields the row already ships (`arriveAtMs - travelSeconds`, which is `dayJourney`'s `goesAtMs`) so
the marker and the words under it cannot disagree. The mark stands **above** a leg still ahead, is
**nailed inside** one under way, and keeps its shipped place **below** one that is behind us. A
leg that predicts no arrival — the no-estimate arms, and `claimDenied` (ADR-0208 §2) — moves
nothing: with no interval there is no claim to make.

**§4's open question is untouched.** Where the tail mark sits relative to the sleep bookend is
still undecided (`docs/backlog.md`), and it still ships after it; what moves is only the case
where the home leg is a fact about the clock rather than a matter of taste.

### The tests that can see it, and the one that cannot

jsdom reports every box as ⁦0px⁩ tall, so the fraction is invisible here as it was yesterday — but
**which element the wrapper contains is not**, and that is the whole defect. Five specs in
`DayView.travel.test.tsx`, red on the shipped code:

- the strip is inside `.now-here` and the block is **not**, at ⁦14:00⁩ in a ⁦2:40⁩ hole with a
  ⁦40⁩-minute walk — two clauses, because a mark wrapping both satisfies the first
- the block is inside it and the strip is not, past the leave-by
- and the block takes it early once somebody is on the way
- the head leg's mark is **before** it in document order at ⁦05:00⁩, and inside it at ⁦07:51⁩

The rule itself is exhaustive and pure in `lib/now-line.test.ts`, including that every instant of
a hole belongs to exactly one of its boxes.

## Amendment (2026-09-05) — the hole counts down, and the offer starts from now

Owner, against the same day at ⁦16:10⁩ with the previous amendment shipped:

> _"I want to improve the free time between events: while during the free time, you should be
> able to see the updated free time according to the time elapsed. Also when choosing to fill the
> gap, it should fill from now and so on, not to suggest on time that has already passed"_

The marker was in the right box by then. The box itself was still describing a hole nobody was
standing in: `8:46 שע׳ פנויות` is what that window held at ⁦08:00⁩, and the `＋` beside it opened
a sheet headed `08:00 – 09:00`.

### §4 said this and the build did not do it

_"A gap holds the moment like anything else and the arrow lands in it. Its label states what is
left of the hole (`freeTimePhrase`), which is the useful half of 'what next'."_ What shipped
passes `freeTimePhrase` the hole's own length, so the sentence was true of the function and false
of the number. This is that line, built.

### One narrowed object, not a corrected label — for §V1.1's own reason

ADR-0206 §V1.1 already made this mistake once at the other end of the same window and recorded
the fix: `travelFreeMinutes` corrected a NUMBER and left the slot beside it raw, so _"the chip's
label shrank by the walk while the sheet it opened, the block a pick wrote and the drop key all
still described the whole hole"_. A label is not the offer.

So `narrowGapToNow` (`lib/gaps.ts`) is `narrowGapForTravel`'s mirror: it moves the window's START
to the clock and returns one `Gap`, whose `minutes` the strip states and whose `fill` the sheet
header, the feasibility floor (`shelfForSlot`), the block a pick writes (`ideaBlock`) and a fresh
event's prefill all read. Both halves of the report are the same edit.

- **It rounds INWARD**, like the bound at the other end — ⁦13:02⁩ offers ⁦13:05⁩, never ⁦13:00⁩ — and
  states the minutes from the CLOCK, so the countdown does not tick in fives.
- **The window's end becomes the block's ceiling** (`Gap.until`), which the hole did not always
  carry: without it the ⁦≤4⁩ minutes the start just rounded away could be spent past the row below.
- **It is a no-op unless the moment is INSIDE the window.** That is what keeps it off every other
  day and off today's earlier holes — a hole behind you is where you record the lunch you had at
  ⁦12:00⁩, and clamping it would take backfilling away to fix a slot nobody is standing in.
- **`null` once nothing is left**, which is the strip's cue to draw nothing: a hole whose free
  time is spent is not a hole with `0 דק׳ פנויות` in it.

### Two thresholds would have been one too many

`FREE_TIME_MIN_MINUTES` (⁦15⁩) is a judgement about whether a hole counts as free time **at all**
— the owner's own _"a gap below say 15 minutes is not really free time"_ — and it is asked of the
PLAN. Re-asking it of the remainder retires the strip a quarter of an hour early, which is not
only wrong copy: `statesHole` was the strip, so the marker's own box went with it and the arrow
jumped onto a drive fifteen minutes before its leave-by. Worth stating is the plan's question;
what is left is the clock's.

### The instant is shared, so the strip and the marker cannot disagree

`holeDepartsMs` (`lib/day-joins.ts`) is the previous amendment's private split rule, exported and
read by both: the free time the strip counts down to ends exactly where `nowInJoin` hands the hole
to the journey. Derived twice, the two would have drifted by the ⁦≤4⁩ minutes `Gap.until` is floored
by, and the arrow would have wanted a strip that had already gone.

### And `nowInJoin` stopped being told what was drawn

Taking a `statesHole` argument, it made the journey's span the **whole hole** whenever the hole
drew no row of its own — so the arrow entered a ⁦45⁩-minute drive two-thirds of the way down it,
and jumped there the moment the strip retired. A journey's box means the journey at every hour.
The rule now answers which box, never whether that box exists, and the caller handles the one case
that leaves: the hole's own part holds the moment and nothing is drawn for it — a hole too short
to state free time in (§AG6's ⁦45⁩-minute hole holding a ⁦40⁩-minute walk), or one the clock has
spent. There the mark takes its **boundary form above the block**, which is the answer the
previous amendment already gave the day's edge legs. One less argument, one more case covered.

### Plan mode is untouched, and that is the posture rule doing its job

ADR-0159 §1 forbids the two day surfaces differing about a **fact**, and the hole's planned length
is one — which is why `narrowGapForTravel` is shared. "How much of it is left right now" is not a
fact about the plan, and Plan's chip is a live **drop target** whose `gapKey` identity would move
under a resting drag every minute (ADR-0116's 2026-09-02 amendment is the last time a slot moved
under a gesture). Trip mode answers "what now"; Plan drafts. If the `שבץ` chip should clamp on
today, that is its own call.

### Tests

Three screen specs in `DayView.travel.test.tsx`, red on the shipped code: the strip states what is
left while the hole behind it keeps its own length; the `＋` opens on the window that is left; and
the mark stands above the block where the hole states no free time at all. Eight unit specs on
`narrowGapToNow` in `lib/gaps.test.ts` carry the arithmetic, the inward rounding, the ceiling, the
`null`, and — the half a label could never reach — that `blockFor` moves with it.
