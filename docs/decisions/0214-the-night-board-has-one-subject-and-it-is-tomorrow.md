# 0214 — The night board has one subject, and it is tomorrow

**Status:** Accepted (owner: _"Looks great. Let's build this!"_) and **built 2026-08-31**, the same
day it was drawn. Read the **Build log** at the foot before changing any of it: four things the
running app changed about the drawing, and two of them are visible.
**Date:** 2026-08-31
**Design reference:** [`mockups/tomorrow-lookahead-v1.html`](../../mockups/tomorrow-lookahead-v1.html)
(five options), [`v2`](../../mockups/tomorrow-lookahead-v2.html) (the hierarchy, and its census),
[`v3`](../../mockups/tomorrow-lookahead-v3.html) (the edge cases, and the collision assertion).
Session note: [2026-08-31](../planning/2026-08-31-tomorrow-lookahead-design.md), three rounds.

**Extends** [0160](0160-the-hero-lifts-and-shows-a-horizon.md) (the lift's foot gains the strip and
one hand-off; §4's "no nested button" is why the strip is a readout below and a control above) and
[0211](0211-a-gap-has-a-character.md) (whose `day-done` character is this board's gate, and whose §4
reasoning about a rail with nothing to measure is applied to a slot).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (solid = hard, and a soft stop never
borrows it), [0017](0017-mobile-first-phone-primary.md) (⁦44px⁩ on the one new control),
[0028](0028-plan-violet-color-budget-dark-ready.md) / root rule 4 (amber only — a day's shape is a
fact about the clock), [0041](0041-parallel-overlapping-events.md) (the containment forest, which is
why nothing here has an overlap rule), [0045](0045-trip-home-real-data-only.md) (no fixtures — no
weather),
[0050](0050-home-quick-access-deep-links-and-empty-states.md) (the quick tile that already carries
the code; the `day` deep link),
[0064](0064-day-transition-entries-and-home-band-trim.md) (no fourth Home band),
[0085](0085-relative-day-phrasing.md)/[0176](0176-a-date-reads-day-first-wherever-you-open-it.md)
(`dayLabel` says which day, never a literal), [0096](0096-per-domain-claude-md-guides.md) / root rule
8 (the shared track below), [0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) (the bed is
named once) and [0077](0077-glance-rail-annotation-grammar.md) (whose lane band is the thing this
deliberately does not do).

## Context

The owner asked for a **tomorrow lookahead** on Home once the day's plan is done — _"if they opened
the app and instantly got the idea at a glance of where they're headed, what's planned, it would be
perfect"_ — and, in a second message, that it read **friendly and inviting**.

The first finding is that the ask was already half-shipped, and it took a throwaway `vitest` against
the real derivations to see it: `deriveNow` carries no date filter, so `הבא בתור` has crossed midnight
since the first build and says which day it means since ADR-0211 §6. **The lookahead is a POINT; what
is missing is a SHAPE** — how full tomorrow is, when it really starts, where it ends up. A point is a
title and a time, and no amount of that becomes a shape.

The second finding is the slot to put it in. `gapDrawsDayRail('day-done')` returns `true`, so at
⁦22:40⁩ on a finished day the board draws a knob at ~⁦98%⁩ under the word `עכשיו` — a progress bar for a
day that is over. ADR-0211 §4 took the rail off for `at-the-stay` and `empty-day` on exactly that
reasoning ("absence beats a pinned lie") and never asked `day-done`.

Then the owner corrected the first drawing twice, and both corrections are in this decision rather
than after it: _"some parts are packed with too much info and everything is represented on the same
level of importance visually"_, and _"overlapping events … shouldn't run over each other (visually
and logically), shouldn't overpack the area again … this has to stay minimalistic"_.

## Decision

### 1. The overlap half is inherited, and that is why nothing here decides it

The strip draws `DayGlance.segs`, which are the containment forest's **roots** (ADR-0041) — never
raw events. Probed against the real `buildDayGlance`, six ways:

| case                                            | what comes back                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| ⁦10:00–12:00⁩ + ⁦11:00–13:00⁩ (partial overlap) | **one** segment · composite · `count: 2`                                |
| ⁦10:00–14:00⁩ containing ⁦11:00–12:00⁩          | **one** segment · envelope                                              |
| three events starting on one minute             | **one** segment · `showCount: false` (its own too-narrow rule)          |
| a twelve-item day                               | ⁦12⁩ segments · **⁦0⁩ overlaps** · two pairs sharing a boundary exactly |
| an event with `endsAt === startsAt`             | a zero-**width** segment with `point: false`                            |
| a tail across midnight                          | `endFrac` clamped to ⁦1⁩ · `nextDay: true`                              |

**Two events cannot be two blocks if they overlap.** So the rule is a rule about what to consume:
anything drawing a day as a track takes segments, and a consumer that reaches for events instead has
re-opened a solved problem. What is _not_ inherited is the drawing at ⁦3px⁩ — §4.

### 2. The ranks swap, and the hierarchy needed no new token

`board.css` already separates its two slots on **three channels at once**:

|        | label             | title                            |
| ------ | ----------------- | -------------------------------- |
| rank 1 | `--amber`         | `--text-h2` · `--on-dark-strong` |
| rank 2 | `--on-dark-faint` | `--text-h3` · `--on-dark`        |

That ranking is good, and at night it was aimed at the wrong slot: rank 1 held `סוף היום` — a
statement about what is **not** happening — in the largest type and brightest ink on the app's
loudest surface, while rank 2 held the only thing anybody could act on. So:

> **At night the board has one subject, and it is tomorrow.**

`[data-rank]` hands the existing treatments to whichever slot holds tomorrow. An attribute rather
than a class (ADR-0160 §C: `.lead` and `.back` are the record of what an unprefixed modifier costs
here), and rather than reordering the DOM — reordering would move the countdown into a different flex
row to express a change of emphasis.

**The rule generalises, which is why there are three shapes and not three branches about the clock:**

- **a planned tomorrow** lives in `deriveNow`'s next, so the next row takes rank 1 and keeps its
  countdown, and the day's-closure words are not drawn at all;
- **an unplanned tomorrow** is not a point, so the now-slot carries it (`מחר` + `emptyDay`'s own
  `יום פנוי`) with a dashed strip under it, and the far point keeps rank 2 **with** its day token;
- **no tomorrow** leaves the board exactly as it ships.

### 3. Four runs come off, and one of them depends on the swap

- **The confirmation code.** A measured duplication: the `הכרטיס הבא` quick tile carries the same
  string ⁦240px⁩ lower on the same screen, and that tile is the surface ADR-0050 built for it.
- **The `קשיח` lock.** A commitment you cannot act on for eight hours decides nothing at ⁦22:40⁩. It is
  on the point in the lifted hero, one press away.
- **The day token on the meta row** — and this one is only legal **because of §2**: the rank-1 label
  now says `מחר` itself, so keeping both prints one word twice ⁦20px⁩ apart. That is ADR-0211's own
  build-log rule (it refused `לילה` in the badge _and_ the label) paying out in reverse. Where the
  label still reads `הבא בתור` — the unplanned-tomorrow board, and both slots of the lift — the token
  **stays**, exactly as §6 built it.
- **`סוף היום`.** A board whose whole subject is tomorrow has said the day is over by not talking
  about it: ADR-0211 §4's "absence beats a pinned lie", applied to a slot instead of a rail. It comes
  back in the one state that has no other subject.

Measured on the drawing: the board goes ⁦273px⁩ → ⁦195px⁩, information runs ⁦16⁩ → ⁦9⁩, the biggest
type bucket ⁦2⁩ → ⁦1⁩, head-font titles ⁦2⁩ → ⁦1⁩, monospace runs ⁦5⁩ → ⁦2⁩, filled chips ⁦3⁩ → ⁦2⁩. **The night
board is shorter than the one that shipped**, and it is the only one of the three that says anything
about tomorrow's shape.

### 4. The four numbers a ⁦3px⁩ track needs, and marks thin rather than stack

`constants.ts`'s `DAY_TRACK`, named for the track rather than for tomorrow (§5):

- **`BLOCK_MIN_PX: 4`** — `glance-card.css`'s own `.seg.point` width, not a new value. A ⁦15⁩-minute
  event is ⁦4.5px⁩ of a ⁦290px⁩ track, so without a floor the short things on a busy day are the ones
  that vanish; it is also what draws a zero-length event at all, which the shipped rail does not.
- **A ⁦1px⁩ hairline** of the host's own ground between blocks, as a `box-shadow` and **never** a
  `margin`: a margin moves a block off the time it represents, and the position is the datum. Probe
  D is why it exists — back-to-back events come back sharing a boundary exactly, and the shipped
  ⁦14px⁩ rail has no separator at all, so it draws them today as one continuous bar.
- **`MARK_MIN_PX: 16`** — a collision fact (a ⁦13px⁩ glyph's box plus air), divided by
  **`NARROWEST_TRACK_PX: 290`**. Dividing by the smallest screen is the decision, not the
  arithmetic: a wider phone keeps the same marks rather than finding room for more, so one day reads
  one way on every device.
- **`MARK_CAP: 5`** — not a collision fact at all. It is the "stay minimalistic" half of the
  correction, and the only one of the four that is taste. It wants a device pass.

**Marks thin in two passes, and merging them is a bug this file already made.** With one greedy step
a cap of ⁦5⁩ became a ⁦1/5⁩ spacing across the whole window, so a day whose five stops sit inside three
hours kept **one** mark. A cap limits a count; it says nothing about spacing. So: pass 1 is the
collision rule, pass 2 samples that set evenly and always keeps the **first** (the block a header
names) and the **last** (the evening, which "keep the first N" silently drops).

**Thinning is the alternative to ADR-0077's lane band, not a cheaper version of it.** A lane buys
room with height on every busy day, which is precisely what the correction forbids. The precedent for
dropping a gloss instead is shipped one layer down: `GlanceSeg.showCount` turns the NUMBER off on a
too-narrow composite because "the exact count is one tap away".

**And the cue is a vertical halo on the block**, not a marker on the track. Two reasons, and the
first is semantic: `.wp-board-progress .knob` means **now** everywhere else in the app, and a future
day has none — `buildDayGlance` returns `nowFrac: null` for one, by construction. The second is
measured: drawn as a ⁦3px⁩ halo in every direction it reached a **neighbouring** block on two of six
stress days. A shadow offset on the block axis with no spread copies the box up and down and never
sideways, so the cue cannot touch anything by construction, and the block a header names reads as the
thicker one — a rank rather than an ornament.

### 5. The geometry is shared, because the second consumer was asked for before the first shipped

`lib/day-track.ts` + `styles/day-track.css` hold everything above that is about **a day drawn as a
proportional strip**; `lib/tomorrow.ts` holds only what is about tomorrow (which block a header
names, and that a stop nobody has lived cannot have been skipped). Every ink comes from a
`--track-*` custom property the host sets, so the board's dark ground and a paper rail are the same
rules with different values.

This is root rule 8 spent deliberately rather than defensively: the owner asked for a **glance
section v2** in the same breath as this build, and named the reason — _"make sure that you're
building with a reusability and generic enough mindset so that we could later easily adapt the useful
stuff to the glance v2"_. The precedent for the split is `lib/edge-fade.ts` +
`styles/edge-fade.css`, which `frontend/CLAUDE.md` cites for exactly this failure: three strips each
wrote the fade out, and the condition they all lacked then had to be added three times.

What a v2 of the glance can therefore take without touching this file: `trackBlocks`, `trackMarks`,
`thinMarks` (generic over any positioned mark), `trackBlockClass`/`trackBlockStyle`, and the whole of
`day-track.css` by setting three custom properties. What it must decide for itself: its cue, its
phases, and whether it keeps ADR-0077's lanes.

One extraction came with it: `buildDayGlance`'s private icon resolver is now `eventDisplayIcon`,
because the strip needed the same answer and a second copy is how two surfaces start disagreeing
about which glyph an event has.

### 6. The lift carries the same strip, plus the one control the board cannot

The lifted hero's foot pins `TomorrowStrip` — the component, imported, not redrawn: ADR-0160's own
amendment had to repair exactly that drift once, when the day rail shipped as a hand-written copy in
`Home.tsx`. Above it sits the one thing the collapsed board cannot carry: **`ליום של מחר`**, a
hand-off to the Day tab at tomorrow's date through the same `?day=` deep link every other Home
hand-off uses.

The board cannot carry it for a mechanical reason rather than a hierarchical one, and ADR-0160 §4 is
the record: the board is a `<button>`, and Chrome closes it at a nested one and reparents everything
after it (⁦1 of 4⁩ children left inside, measured). So the split is the one `ועוד N עכשיו` already
took — a readout below, the control above. The chip takes ⁦44px⁩ rather than `.hero-act`'s ⁦34px⁩,
because that value is licensed for a row of two or three chips whose row padding carries the reach,
and this is one control alone on its line.

**And the lift drops the gap slot when tomorrow is the subject** — see the build log. One object at
two elevations (ADR-0160 §1) means the subject is the same at both.

### 7. A third slot was still missing the day token, and drawing the card is what found it

`heroTravel` hangs off the same `horizon.next`, so on a finished evening the journey line already
prints a leave-by for **tomorrow**: `צאו ב־06:40`, a bare clock ⁦40px⁩ under a meta row reading
`07:12 · מחר`. One card, two clocks, one of them qualified. ADR-0160 §M named that ambiguity for the
in-transit landing and ADR-0211 §6 fixed it for `הבא בתור`; this is the same shape a third time.

`HeroLiftTravel.leaveDay` carries `dayLabel`'s answer, read off **the leave-by's own instant** rather
than the event's date — those differ exactly when it matters, since a ⁦00:20⁩ departure is left for the
evening before.

### 8. What this does not do

- **No weather.** The first instinct for a lookahead card, and the app has no pipe; ADR-0045 makes
  Home real-data-only and ADR-0180 §4 already says weather returns as its own glance card.
- **No suggestions on an unplanned tomorrow** (ADR-0211 §8): `GlanceCard` is Home's "what could we
  do" surface. The empty arm is a readout plus, one elevation up, the hand-off to the day itself.
- **No composite marking.** A block that is three concurrent things stays one block with no count:
  the number is chrome this design just removed, `.seg.multi`'s layered edge is ⁦3px⁩ inset on a ⁦14px⁩
  rail and would be the whole block here, and three things at once genuinely are one occupied slab of
  time. `TrackBlock.composite` is carried for a consumer with room.
- **No new band on Home** (ADR-0064) and **no fifth quick tile** (ADR-0050's tiles are deep links to
  data; a day is not a datum).
- **Nothing in Plan mode.** The parallel question there is readiness (ADR-0193).
- **`סוף היום` in both slots on the trip's last night** is still open, as it was after ADR-0211.
  `סוף הטיול` is drawn in v1 §3 and remains a backlog line.

## Consequences

- **Two new lib files and one new stylesheet**, and the split between them is load-bearing rather
  than tidy (§5). `Board` gains one prop and one exported component; `HeroLift` gains two props and
  one string; `Home` gains one derivation it feeds from `buildDayGlance`.
- **The board's markup is unchanged in every state that has no tomorrow.** Every existing spec for
  those states passes untouched; the two that changed are listed in the build log.
- **A third consumer of `buildDayGlance` exists**, and it reads a date the screen is not showing.
  That is deliberate and it is `today + 1`, never `activeDate + 1`: swiping the day strip must not
  change what the live surface says about the minute you are in (ADR-0211's own rule).
- **The strip's height does not grow with the day.** A ⁦2⁩-item day and a ⁦12⁩-item one draw at the
  same height, because nothing here is ever laned — and on a day the bed does not move that height is
  ⁦23px⁩, the day rail's own, measured live in v3.
- **Two defects in the shipped glance rail are now written down** and deliberately not fixed here
  (`docs/backlog.md`): it has no separator between adjacent segments, so a busy day draws
  back-to-back events as one bar; and a zero-length event is invisible on it.
- **`MARK_CAP` and `MARK_MIN_PX` are device reads.** Both look right in the render and in the running
  app, and both are the kind of number a phone in a hand settles better than a screenshot.

## Alternatives considered

- **The shipped `GlanceCard`, re-derived for tomorrow** (v1's ג׳). The cheapest reuse in the file,
  and rejected on a measurement: it lands ⁦212px⁩ below the fold at ⁦360×640⁩, against an ask whose
  words are "instantly … at a glance". Its lead copy is also `נותרו היום` — date-bound, not merely a
  now-marker. What survived from it is §5: the derivation it is built on is the one this uses.
- **A board that flips to a tomorrow face** (v1's ד׳). Three collisions, none of them taste: the
  board's tap already belongs to the lift; a rotated box breaks the FLIP's origin measurement, since
  `getBoundingClientRect` on a rotated element is the rotation's bounding box and that is exactly
  what `useLiftFlight` measures; and under `prefers-reduced-motion` a flip degrades to a face swap,
  i.e. an overlay. It did prove a full-board tomorrow is worth having — which the lift already is.
- **One warm sentence in a band under the board** (v1's ה׳). The friendliest wording of the five, and
  rejected **as a band**: ADR-0064 removed a band of exactly this shape from exactly this position.
- **Moving the whole thing into the lifted hero only** (the owner's own third option, drawn in v3
  §4). Rejected on the ask's own words: a tap is not a glance. The measured price of keeping the
  shape is ⁦57px⁩ on a board still shorter than today's.
- **A `+1` chip on a tail across midnight**, as the rail does. Rejected as chrome on a surface nine
  runs were just removed from; the trailing ⁦10px⁩ fades instead — shape rather than text, ⁦0px⁩ of
  height.
- **A `מוקדם` tag** when tomorrow's first departure is early (v1's own invention, needing a new
  `EARLY_START_HOUR`). **Withdrawn** by v2: the ribbon's first block sits hard against the leading
  edge and the meta row says the time, so the tag was a third way of saying one fact.
- **Lanes for colliding marks** (ADR-0077's answer). §4.
- **Drawing the cued block solid** so the cue needs no ink. Refused: solid means **hard**
  (ADR-0011), and a soft stop wearing it would be a lie about commitment to save a shade.

## Build log (2026-08-31) — four things the running app changed

The mockups were drawn, rendered and measured; these four are what came out of running the built
code against the seeded trip at ⁦22:40⁩ with the clock pinned, and none of them was visible in a
drawing.

1. **The cue was invisible on a SOFT block.** v3 drew it on a hard one — solid `--amber` — where a
   dim halo reads as a thickening. The first real day the strip met was all-soft, and a ⁦0.3⁩-alpha
   halo around a ⁦0.42⁩-alpha fill is a tenth of an alpha apart. `--track-cue` is now ⁦0.62⁩: it has to
   out-value what it rings.
2. **The lift still led with `סוף היום · עד 09:00`.** With the board re-ranked, pressing it opened a
   card whose first and largest line was the non-fact the board had just stopped saying — plus a bare
   clock that was in fact tomorrow's. The lift now drops the gap slot when tomorrow has blocks, and
   ADR-0160 §S's invariant is restated rather than dropped: the two elevations still say the same
   thing about one minute, and what they agree on is the point.
3. **The unplanned arm drew two spent bands.** Its dashed strip sits above the divider, so keeping
   the day rail below it drew a tomorrow with nothing on it AND a progress bar pinned at ~⁦98%⁩. The
   rail comes off in that arm too; ADR-0211 §4's own `:last-child` padding rule is what keeps the
   card's bottom edge right without one.
4. **A mark sits over its block's MIDDLE, not its start instant** (owner, on the built strip: _"the
   emojis are too much to the right instead of being centered to their line"_). Right, and the reason
   is what a mark is: the block carries the time, so the glyph is a label on the thing and belongs
   over the thing. The midpoint is computed in the derivation rather than in CSS, because `thinMarks`
   spaces marks by `frac` and a mark drawn elsewhere would be spaced against a position it does not
   occupy. The same round added an edge clamp, since a mark centred at the window's very end
   overhung the track.

**v3's drawing therefore differs from the shipped strip in two visible ways** — the cue's alpha and
the marks' anchor — and the mockup is **not** retrofitted: it is the dated record of what was decided
then, and `docs/design/mockups.md` names both differences.

Verified: `pnpm typecheck`, `pnpm build` and `pnpm lint` clean, and the full frontend suite green —
⁦281⁩ files, ⁦5075⁩ tests, of which **⁦42⁩ are new**: ⁦28⁩ on the two derivations (including the six
overlap cases probed above, pinned so §1's inheritance cannot quietly stop being true), ⁦6⁩ on the
board's three shapes, ⁦6⁩ at the Home seam (one of them a rewrite — see the build log) and ⁦2⁩ on the
leave-by's day token. Looked at in the running app in both arms at ⁦390×844⁩, with the clock pinned to
⁦22:40⁩ against the seeded trip.
