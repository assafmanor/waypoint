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
