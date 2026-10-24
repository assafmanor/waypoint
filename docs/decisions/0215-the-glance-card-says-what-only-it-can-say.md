# 0215 — The glance card says what only it can say

**Status:** Accepted
**Date:** 2026-08-31
**Refines:** [0045](0045-trip-home-real-data-only.md) (the day-at-a-glance card, its proportional rail and its `נותרו` count — this reworks all three and keeps its charter), [0077](0077-unified-glance-rail-annotation-grammar.md) (**withdraws** the amber pill band, the lane stacking and the crowded-day legs line from the Home rail; the grammar's own record stands and its `bracketed` derivation is untouched), [0214](0214-the-night-board-has-one-subject-and-it-is-tomorrow.md) (§5's shared geometry, whose second consumer this is), [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) (§6's Home ordering rule, applied to the next surface), [0041](0041-parallel-overlapping-events.md) (the containment forest the rail inherits), [0011](0011-hard-vs-soft-events.md) (the commitment axis this puts on the rail for the first time), [0164](0164-a-spans-own-edge-is-something-you-can-still-miss.md) (the counted edge that forced the tick), [0212](0212-a-flight-is-a-line-that-is-also-a-commitment.md) (§3's air half, which is the one addition that costs nothing), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget every ink here obeys)

**Drawn in:** [`mockups/glance-v2.html`](../../mockups/glance-v2.html) — the census (§1), the anchor band (§2a), the inks (§2b), the subtraction (§2c), the lead and the addition (§2d), the six stress days with the collision assertion (§3), and the placement (§4).
**Session note:** [`planning/2026-08-31-glance-v2-brief.md`](../planning/2026-08-31-glance-v2-brief.md) — the brief, then every measurement, amended in place.

## Context

The owner asked for a v2 of Home's `היום במבט` card in the same breath as the night board:
_"upgraded, less condensed, more visually pleasing, possibly giving more information or losing
information for a better look."_

The card is honest and dense: an anchor band of amber pills that stack into lanes, a ⁦14px⁩ rail of
phase-coloured blocks with `×N` chips under it, the window's own `07:00`/`23:00`, a ⁦32px⁩ mono
`נותרו היום` count beside a hard-anchor readout, and a `פנוי עד HH:MM · מסתיים ~HH:MM` foot.
Measured off the rendered card: **⁦8⁩ text runs, ⁦7⁩ distinct type levels, ⁦5⁩ monospace runs, ⁦184px⁩.**

**What actually changed is not the card — it is the board above it.** ADR-0214 gave the board what
is now, what is next, how long until it, where we are, and the shape of tomorrow. So the question
this ADR answers is not "how should the card look" but **what work is left for it**, and the answer
is the one thing no other surface can do: **the whole day at once, and what is left of it.** Every
decision below is that sentence applied.

## Decision

### 1. The card moves up one slot, because its slot was never chosen

Home's order was: board · `ChangeFeed` · tasks band · `גישה מהירה` · **`היום במבט`** · `מבט מהיר`.
The card sits below four tiles because ADR-0045 deleted the fixture weather/FX/budget row and put
the derived card **"in its place"** — the position came with the row it replaced, and nobody ever
asked where a whole-day view belongs.

The one ADR that did ask drew the line exactly where this card wants to be. ADR-0188 §6, on the
tasks band: _"above quick-access on purpose: this answers 'what do I owe today', which belongs with
the board's what-now/what-next rather than beside a WiFi code."_ The day's shape is the same class
of fact, and more so — the board and this card are both **derived time surfaces** (ADR-0018/0045),
while `גישה מהירה`'s tiles are **deep links into stored data** (ADR-0050). A WiFi code was sitting
between the two halves of one subject.

So `היום במבט` renders **above `גישה מהירה`**, below the tasks band. Measured on the rendered column
at ⁦360⁩: **⁦464px⁩ → ⁦301px⁩** from the top of the scroll column, i.e. ⁦163px⁩ less scrolling before
the day's shape is on screen. **On an ordinary day this IS "directly under the board"** — the change
feed collapses when no peer has edited anything and the tasks band is absent when nothing is due
(both by design, ADR-0045) — which is why ADR-0188 §6's ordering survives intact rather than being
argued with: what is live and owed first, then the day's shape, then the shortcuts.

`HomeSkeleton` moves with it. A skeleton that disagrees with the order the screen resolves into
moves the card the moment the data lands.

### 2. The rail is the shared track, and a bracketed edge with no block is a tick

The ⁦14px⁩ `.rail`/`.seg` renderer is replaced by `styles/day-track.css` + `lib/day-track.ts` at
this host's own height (⁦18px⁩) and inks — the split ADR-0214 §5 made for exactly this second
consumer. The floor, the ⁦1px⁩ ground hairline, the zero-length tick, the midnight fade and the mark
row all arrive by using it, and §7's two shipped defects are fixed on the way in.

**ADR-0077's pill band comes off, and the reason is measured rather than aesthetic.** That grammar
answers colliding anchors in three behaviours — centre on the instant, stack into lanes, collapse to
a flow legs line past two lanes — and a probed real arrival day (check-out ⁦10:00⁩ · taxi
⁦11:30→12:10⁩ · flight ⁦14:00→17:00⁩ · check-in ⁦20:00⁩) returns **⁦4⁩ anchors in ⁦3⁩ lanes**, so
`anchorsCollapsed` fires and **the positioned band is not drawn at all**. Three behaviours for one
question, and the day the card matters most gets the fallback: two rows of heavy pills, ⁦46px⁩, on a
⁦242px⁩ card.

**What replaces it is an instant, not a deletion**, and that distinction is load-bearing.
`buildDayGlance` excludes an ambient span from the counted rail (ADR-0054), so a stay's check-out
has an anchor and **no segment** — while ADR-0164 counts that edge in `remaining`. Dropping the
pill alone would have left the card saying `2` and showing one thing. So `GlanceAnchor.standalone`
(true exactly when the event is ambient — resolved in `buildDayGlance`, the only place that knows
both halves) marks the anchors the rail must draw itself, and `lib/glance-track.ts` merges them in
as **hard point ticks** at their own instants. Every standalone anchor is a bracketed booking's own
edge, which is ADR-0011's commitment however the event's `kind` was typed.

**One edge is dropped rather than drawn, and the running app is what found it.** An instant that
falls **inside** an occupied stretch is not a separate stretch: on the seeded arrival day the
hotel's check-in (⁦15:00⁩ — the hour the door opens, ADR-0171's floor) lands inside the long-haul
flight's own block, so the tick drew amber on amber, invisible, and produced the one thing this
design forbids — a touching pair, measured ⁦1⁩ where every drawn day had ⁦0⁩. The tick exists because
a moment **nothing else occupies** would otherwise be missing; a moment already covered by a block
is on the rail, and `remaining` is unchanged either way. A boundary does not count as covered: an
edge at a block's own start or end still has its instant to itself.

A tick's phase is **`upcoming`, never the clock's answer**: a check-out at ⁦10:00⁩ is behind you at
noon, but the stay is not, and `remaining` keeps counting the edge until it is settled or the day
ends. Greying it at ⁦10:01⁩ would contradict the number on the same card.

**What the words cost.** The transition word, the time and each edge's own zone with its shift pill
(ADR-0107) leave this rail. They are not lost: the board's next slot carries the next event's shift,
and the day's own rows — `TransitionRow`, untouched by this change — carry all of it, one tap away,
where there is room. The alternative that keeps them on the card is
drawn (§2a's third column: `.glance-legs` promoted from crowded-day fallback to the only rendering,
+⁦56px⁩ measured) and can be adopted without re-deciding anything else here.

The lane machinery itself is deleted rather than left unread: `lane`, `anchorLaneCount`,
`anchorsCollapsed`, `assignAnchorLanes`, `MARKER_MIN_GAP_FRAC`, `MAX_ANCHOR_LANES`. It existed only
to place pills. The **facts** on an anchor — its instant, its word, its icon, its zones — all stay.

### 3. The fill is spent-vs-ahead on one channel and hard-vs-soft on the other

The old rail had five phase fills (done green · passed filled grey ⁦30%⁩ · now amber · upcoming
hollow ⁦1.5px⁩ at ⁦24%⁩ · skipped hatched) and **no channel at all for hard vs soft** — ADR-0011, the
app's core primitive, was invisible on the surface that draws the whole day.

And the ranking was inverted. Ink mass (a rendered box's area × its background alpha, so a filled
grey and a hollow ring compare on one scale), same day, same width:

|         | behind the clock | the block we are in | ahead of the clock                  |
| ------- | ---------------- | ------------------- | ----------------------------------- |
| shipped | ⁦383⁩            | ⁦383⁩               | **⁦0⁩** — a hollow ring has no fill |
| this    | ⁦89⁩             | ⁦168⁩               | **⁦657⁩**                           |

The card whose lead number is _what is left_ was drawing the half you can do nothing about at full
strength (`--ok` is alpha ⁦1⁩) and the half that remains as an outline. So:

- **soft and ahead** — neutral `--ink` at ⁦34%⁩ (`--track-fill`)
- **hard** — `--amber`, solid; amber is time and commitment and nothing else (ADR-0028)
- **behind the clock** — `--track-spent` at ⁦18%⁩, and `--track-spent-hard` at amber ⁦34%⁩
- **skipped** — the shipped hatch, ink handed to the host
- **an instant nobody committed to** — neutral ⁦55%⁩; a bracketed edge takes amber through
  `.point.hard`

**The three neutral steps are ⁦7%⁩ · ⁦18%⁩ · ⁦34%⁩ and the spread is the dark theme's.** `--ink`
inverts, so the first draft's ⁦9%⁩ spent block over a ⁦5%⁩ ground was a ⁦4%⁩ delta and **vanished** on
a dark card while reading fine on paper. A light-only pass would have shipped it.

**`--ok` green leaves the card**, and that is the priced cost of the channel: at the ⁦4.6–27px⁩ block
widths measured here nobody was reading green against grey, and the settle state lives on the day's
cards, where its control is. A composite keeps its layered top edge and **loses its number** —
`showCount` is the shipped precedent for dropping a gloss rather than finding it room, and at ⁦18px⁩
a ⁦3px⁩ inset has room to read (which ADR-0214 §8 explicitly did not have at ⁦3px⁩).

The clock keeps the amber `.nowmark` unchanged: a vertical line among horizontal blocks is how two
legitimately amber things stay apart by **shape** rather than by a sixth hue.

### 4. Two lines of words, and everything the board already says comes off

`0 · נותרו היום` in ⁦32px⁩ mono is the common reading all evening, and a huge number saying nothing
is the opposite of inviting. The lead becomes **one sentence** — `נותרו ⁦N⁩ דברים היום` /
`נותר דבר אחד היום` / `זה הכל להיום` — which keeps the card's own verb, so nobody relearns the
number, and goes **quiet** at zero rather than announcing an absence, because the night board now
speaks for that moment. `דברים` deliberately: `עצירה` is spent on a layover (ADR-0159), and this
count is not events either — it counts the containment forest's **roots**, so three things at once
are one of them.

Three runs come off, each measured against the surface that already carries it:

- **`פנוי עד HH:MM`** — a **documented** double. `BoardGapSlot`'s own docblock says its
  `עד HH:MM` exists because _"the board left a slot empty for a fact `GlanceCard` was carrying two
  inches lower"_ (ADR-0214 §5), and the card kept carrying it. Measured on one screen: **⁦311px⁩**
  apart.
- **the hard-anchor readout** (`🔒 עוגן קשיח HH:MM`) — when the next thing is hard, this is the
  time the board prints with a countdown beside it, **⁦214px⁩** away. On the arrival day the card
  alone printed `14:00` **three** times.
- **the window's own `07:00`/`23:00`** — they describe the drawing, not the day; the window stretches
  to the day's events, so the number moves without anything happening; and the board's rail prints
  the same two labels from `DAY_WINDOW`. Adjacency after §1 makes that plain: **⁦4⁩ hour labels in
  one column, ⁦2⁩ after.**

`מסתיים ~HH:MM` stays. Nothing else says where the day ends.

Census, off the rendered card: **⁦8⁩ runs → ⁦5⁩, ⁦7⁩ type levels → ⁦4⁩, ⁦5⁩ monospace runs → ⁦2⁩, ⁦184px⁩
→ ⁦131px⁩** — and ⁦242px⁩ → ⁦131px⁩ on the arrival day, i.e. **a busy day is now the same height as a
quiet one**, because nothing here lanes.

### 5. Three one-liners the shared geometry owed, and drawing it is what found them

- **`day-track.css` owns the height it declares.** `--track-h` was declared there from the first
  day and the ⁦3px⁩ actually came from `.wp-board-progress .track` in `board.css`, so the second
  consumer got a track with no height at all. `.wp-track > .track { height: var(--track-h) }` there;
  the ground and the corner stay with the host, because "free time is the empty track" (ADR-0045) is
  the glance's statement and not the sheet's.
- **A tick may still be a commitment.** `.wp-track-blk.point` lands after `.hard` and swallowed it —
  invisible on the board, where every ink is amber anyway, and wrong the moment one day carries both
  a check-in and an event with no `endsAt`. `.point.hard` fixes it in the shared sheet.
- **`trackMetaFor` moved out of the screen.** The night board resolved each segment's icon and
  commitment at `Home.tsx`; today's rail wants the identical answer, and two screens-worth of the
  same `Map` read is how a strip and a rail start disagreeing about which glyph one event has.

`DAY_TRACK.MARK_MIN_PX = 16` gains a note rather than a parameter: it **is** the glyph's own
rendered box (measured ⁦16.2px⁩ at ⁦13px⁩, ⁦18.7px⁩ at ⁦15px⁩), which the drawing found by enlarging the
mark for the taller rail and watching its own assertion go red. The glance ships at the shared
⁦13px⁩, so the coupling is documented and no argument is added for a value nobody passes.

### 6. One addition, and the half of it this screen may not ask for

`DayTravelTotal` — the component, not a new line — renders **how far the day flies** in the foot.
`dayAirMeters` is a great-circle sum over stored coordinates: pure, synchronous, offline-safe (rule 5) and free.

**The ground half is deliberately absent.** It is a roll-up of `useDayTravelReads` over every hole
in the day, and Home asks that hook about **one** leg on purpose — its own comment: _"an empty
`legs` asks for nothing at all … a route nobody may be shown is a call against §D8's budget for
nothing."_ Putting every gap of the day behind a provider call on the app's most-loaded screen is a
cost decision rather than a card layout, and offline it would leave the foot flickering between two
shapes. So the line appears on the days the app can measure for nothing, and says nothing on the
rest — `DayTravelTotal`'s own "hidden rather than zero" rule, unchanged.

Its three `.day-total` rules were scoped to `.day-ambient` in `screens.css` and are **unscoped**
(rule 8), with the host-specific inline padding left at the host. The render condition became
`hasTravelTotal`, so the foot's `·` asks the same question the component does and cannot leave an
orphan separator.

### 7. Two shipped defects are fixed by the adoption, not before it

Both were found by probing `buildDayGlance` for `mockups/tomorrow-lookahead-v3.html` and left on the
backlog **for this change**, so they would land with a drawing that shows them:

- **adjacent segments merged.** `.seg` carried `min-width: 6px` and no separator, and the derivation
  returns back-to-back events sharing a boundary exactly — measured twice on a twelve-item day — so
  a busy day drew them as one continuous bar. The track's ⁦1px⁩ ground hairline separates them, and
  it is a `box-shadow` rather than a margin because a margin would move a block off the time it
  represents.
- **a zero-length event was invisible.** `endsAt === startsAt` arrives with `point: false` and zero
  width, so `.seg.point`'s ⁦4px⁩ tick never applied and the rail drew **nothing**. `trackBlocks`
  reads both zero-length shapes as a tick: measured ⁦0px⁩ → ⁦4px⁩.

The collision assertion over every pair of rendered boxes, on all six stress days (partial overlap ·
containment · three on one minute · twelve items · zero length · a tail across midnight), in all
four theme × width runs: **⁦0⁩ blocks touching, ⁦0⁩ marks touching.**

### 8. What this does not do

- **No weather, and no fifth quick tile.** ADR-0045 keeps Home real-data-only and ADR-0180 §4
  already says weather returns as its own card; ADR-0050's tiles are deep links to a datum, and a
  day is not one.
- **Nothing in Plan mode.** `PlanDay` has no glance card; the parallel question there is readiness
  (ADR-0193).
- **The board's day rail is untouched, and that is now a live question.** After §1 the board's knob
  and the card's now-line mark the same instant on the same window ⁦30px⁩ apart, so the ⁦3px⁩
  progress rail is a poorer copy of the ⁦18px⁩ track below it. That slot already changes tenant
  (ADR-0214 gave it to tomorrow at night). Whether it goes empty by day is a decision about the
  board and is left open on purpose rather than smuggled into a card change.
- **No composite count anywhere**, and no `+1` chip: the fade says the same thing in ⁦0px⁩ of height.
- **The empty-day teach state is unchanged** (ADR-0045): a calm invite, never a `0/0` rail.

## Consequences

- **Touched:** `lib/day-track.ts` (the `spent`/`skipped` axis, `trackMetaFor`, `multi` in the class
  builder), `styles/day-track.css` (the height, `.point.hard`, `.spent`, `.skip`),
  **`lib/glance-track.ts` (new)**, `lib/glance.ts` (`standalone` in, the lane machinery out),
  `ui/domain/GlanceCard.tsx` + `glance-card.css` (rewritten around the track and two lines),
  `ui/domain/DayTravelTotal.tsx` (`hasTravelTotal`), `lib/day-joins.ts` (that predicate),
  `screens.css` (`.day-total` unscoped), `ui/feedback/HomeSkeleton.tsx` (shape and order),
  `screens/Home.tsx` (the wiring and the move), `i18n/he.ts` (`leftToday` in; five keys out).
- **ADR-0077's grammar keeps its record and loses this surface.** Its `bracketed`-profile
  derivation, its per-day pairing and its `TransitionRow` rendering are untouched; what is withdrawn
  is the pill band on the Home rail. A future surface that wants positioned pills has the ADR and
  the drawing of what they cost.
- **ADR-0107's per-edge zone display leaves this card.** The shift the traveller wants — how far the
  clock jumps — reads on the board's next slot and on both day timelines' rows. Nothing on Home is
  now the only place a zone is stated.
- **The glance is the third consumer of `--track-*`**, after the board's strip and its own tests, so
  the next surface that wants a day as a strip sets three properties and writes no geometry.
- **The card is `activeDate`-scoped and Home is today-anchored** (`dayCarriedFrom` drops `?day=`,
  ADR-0035 §4), so in practice it always draws today. Unchanged by this ADR and stated because §1's
  rejected alternative turned on it.
- **Specs:** `lib/glance-track.test.ts` (18), `lib/day-track.test.ts` (+7), `lib/glance.test.ts`
  (four lane specs rewritten as `standalone` specs), `ui/domain/GlanceCard.test.tsx` (rewritten, 15),
  `ui/domain/Board.test.tsx` (ribbon fixtures gain the two flags, which is also where the board's
  "tomorrow is never spent" invariant is asserted).

## Alternatives considered

- **Keep the five phase fills on the new geometry** (drawn, §2b's third column). The option that
  gives nothing up, and it hands the fill channel back to the clock — so hard vs soft stays
  invisible and the ink inversion survives. Rejected.
- **Keep the anchor words in one flow line under the rail** (drawn, §2a's third column) — ADR-0077
  §D's collapse promoted from fallback to the only rendering. Costs ⁦56px⁩ and keeps the times. Not
  chosen, and it is the cheapest thing to change one's mind about: it adds no class and no
  behaviour.
- **Keep the ⁦32px⁩ numeral** (drawn, §2d). Rejected on the evening case, which is the common one.
- **Cut the rail at the now-line** ("behind you | ahead of you" as two halves). Rejected by the same
  rule that killed the night strip's disc: the line already IS the boundary, and cutting turns one
  proportional axis into two rulers with no shared scale.
- **Put the card above the board.** It looks like the surface the header's day strip drives — except
  Home is today-anchored, so the strip cannot move it, and the hero has to lead the screen
  (ADR-0018). Gluing a card to a control that cannot change it buys confusion instead of a
  relationship.
- **Wire the day's ground travel total** (§6). Rejected on cost, not on value, and the number is on
  the backlog with the reason.
- **Add tonight's bed to the foot.** Free and offline — and the stay strip at the top of the same
  screen already names it mid-stay, which is the duplication this ADR spent its whole §4 removing.

## Build log (2026-08-31) — what the running app added, and one thing it confirmed

The card was built, then driven in the browser against the seeded Japan trip at three pinned
clocks. Two of the three findings could not have come from a drawing.

1. **An ambient edge inside a block** (§2's last paragraph). The arrival day put the hotel's
   check-in inside the flight, and the collision count went from ⁦0⁩ to ⁦1⁩ — the assertion the
   mockup had been green on for six stress days, red on the first real day, because no drawn
   fixture had an edge inside a span. `coveredBySeg` is the fix and the spec is that exact day.
2. **A spent block can legitimately straddle the clock**, and this is pre-existing rather than
   new: `groupPhase`'s "explicit all-done wins" (ADR-0045) means a composite whose events are all
   settled reads spent even while the clock is inside its span. It looked wrong for a moment and
   is right — the block IS finished. The old rail drew that case a solid green; this draws it
   quiet, which is the better of the two readings.
3. **Confirmed on the seeded data, not just in fixtures:** ⁦128px⁩ card at ⁦390⁩, ⁦18px⁩ track, the
   check-in tick as ⁦4px⁩ amber on the arrival day, `נותרו 4 דברים היום` by day and `זה הכל להיום`
   at ⁦23:30⁩, `מסתיים ~22:15 · ⁦9,203⁩ ק״מ` where the day flies and no travel line where it does
   not, `היום במבט` above `גישה מהירה` in the live DOM, and ⁦0⁩ touching pairs on every clock tried.
