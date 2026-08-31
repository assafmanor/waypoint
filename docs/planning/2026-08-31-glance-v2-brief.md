# Glance v2 — the brief, and the plan for getting there

**Date:** 2026-08-31
**Status:** brief only. **Nothing drawn and nothing built** — this is the task plan the owner asked
for alongside the tomorrow-lookahead build, to be picked up as its own session.
**Asked for:** _"a followup task plan for the glance line, also in the home screen. I want to design
and build a glance section v2 that looks upgraded, less condensed, more visually pleasing, possibly
giving more information or losing information for a better look. It very well may draw inspiration
and share common ideas from the tomorrow lookahead glance, that really makes sense imo."_
**Read first:** [ADR-0214](../decisions/0214-the-night-board-has-one-subject-and-it-is-tomorrow.md)
(§5 is the shared track this inherits, and §2/§3 are the hierarchy method), the
[tomorrow-lookahead note](2026-08-31-tomorrow-lookahead-design.md) (three rounds of corrections, and
what each measured), plus [ADR-0045](../decisions/0045-trip-home-real-data-only.md) (the card's
charter), [ADR-0077](../decisions/0077-glance-rail-annotation-grammar.md) (the anchor grammar, and
the lanes this may withdraw) and [ADR-0041](../decisions/0041-parallel-overlapping-events.md) (why a
composite is one block).

## What the surface is today

`GlanceCard` (`ui/domain/GlanceCard.tsx`, `glance-card.css`, derived by `lib/glance.ts`) sits under
`היום במבט`, third section on Trip Home. It draws, top to bottom:

- an **anchor band** — amber pills for bracketed edges, stacked into **lanes** when they would
  collide, collapsing to a flow "legs line" past `MAX_ANCHOR_LANES` (ADR-0077 §D);
- a **⁦14px⁩ rail** of proportional blocks, phase-coloured (done green / passed grey / now amber /
  upcoming hollow / skipped hatched), composites carrying `×N` / `כולל N` under a layered top edge,
  plus the amber now-marker;
- **rail ends** (⁦07:00⁩ / ⁦23:00⁩);
- a **lead** — the big `נותרו היום` count and the next hard anchor;
- a **foot** — `פנוי עד HH:MM · מסתיים ~HH:MM`.

It is honest and dense. Its problems are the ones the owner named for the night board one round
earlier, and the same instrument will find them.

## The three things this brief asserts before any drawing

**1 · Run the census first, not the redesign.** v2 of the night board began by counting what the eye
has to rank off the _rendered_ card — runs, distinct type levels, the biggest bucket, head-font
titles, monospace runs, filled chips — and the numbers are what turned "feels condensed" into a
decision. `mockups/tomorrow-lookahead-v2.html` §1 carries that instrument; **copy it into the glance
mockup and point it at `.glance-day`**. Expect it to report a big bucket: five phase colours, two
count words, three time runs and a lead numeral all live in one card.

**2 · Half the redesign is already written and shared.** ADR-0214 §5 split the geometry out
precisely so this session is a re-skin rather than a rewrite:

| take unchanged                                                                      | from                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trackBlocks(segs, meta, {isCue, include})`                                         | `lib/day-track.ts`                                                                                                                                    |
| `trackMarks` (a mark sits over its block's middle)                                  | same                                                                                                                                                  |
| `thinMarks` — generic over any positioned mark                                      | same                                                                                                                                                  |
| `trackBlockClass` / `trackBlockStyle`                                               | same                                                                                                                                                  |
| the whole shape: floor, hairline, point tick, next-day fade, vertical cue, mark row | `styles/day-track.css`, by setting `--track-fill` / `--track-strong` / `--track-ground` (+ optional `--track-point` / `--track-cue` / `--track-dash`) |
| the four numbers, and what each answers                                             | `constants.ts`'s `DAY_TRACK`                                                                                                                          |

**Note the inks are the part to think about, not the geometry.** The board's are amber on a dark
ground because a day's shape is the clock's (rule 4). The glance is **paper** and it carries
_phases_, which the board's strip has none of — so the tokens are per-phase and the first question is
whether `--track-fill` should vary per block (a phase palette) or whether v2 drops phase colour from
the rail and says it another way. That is a real fork and it belongs in the mockup.

**3 · "More information or less" is decided by what the neighbours already say.** The night board's
biggest win was subtraction, and every removal stood on a surface that already carried the fact —
the code was ⁦240px⁩ from its copy in a quick tile; the day token was ⁦20px⁩ from the label that says
it. Do that audit here before adding anything: **the board above this card already says what is now,
what is next, its countdown and (since ADR-0214) tomorrow's shape.** So the glance's job is what a
board cannot do — the whole day at once, and what is left of it — and anything it prints that the
board prints too is a candidate for removal.

## The candidate moves, in the order a session should try them

Each is a hypothesis the mockup should measure, not a decision.

1. **The lanes come off, and thinning replaces them.** ADR-0077 stacks colliding anchor pills into
   lanes, so a busy day grows a band and a very busy one collapses to a legs line — three behaviours
   for one question. `thinMarks` is the shipped alternative (ADR-0214 §4), and the precedent for
   dropping a gloss rather than finding it room is `showCount`, which is already in this file.
   **Measure:** the card's height across a quiet / normal / busy / crowded day, and how many anchors
   survive. Expect the win here to be the largest single one.
2. **The anchor pill and the mark become one idea.** Today an edge is an amber pill above the rail
   with a stem; the night strip's mark is the event's own emoji over its block. Two vocabularies for
   "what is this block" on two surfaces one screen apart. **Fork:** keep pills for _edges only_
   (they carry a transition word the emoji cannot) and use marks for blocks; or go emoji-first and
   let the edge word live in the day view.
3. **The rail gets room.** ⁦14px⁩ with `×N` chips _under_ it and pills _above_ it is a three-storey
   band in a card that also carries a lead and a foot. Try ⁦18–20px⁩ with the chips gone, and put the
   height back into whitespace rather than content — "less condensed" is mostly a spacing decision,
   and this is the one place the card has slack.
4. **The lead stops being a numeral and starts being a sentence.** `0 · נותרו היום` reads oddly at
   the end of a day (it is the common case in the evening, and the night board now covers that
   moment). Candidates: a plural sentence in the app's voice, or the count only while it is
   non-zero, or the count moving into the rail's own end.
5. **`פנוי עד` and `מסתיים` are audited against the board.** Both are also derivable from what the
   board says; `פנוי עד` in particular duplicates the gap's `עד HH:MM` (ADR-0211 §5) two inches up.
   One of the two surfaces should own it.
6. **Then, and only then, additions.** Two are cheap and real if the census says there is room:
   **where the day starts and ends** (`dayBookendStays` — already derived, and the night strip's bed
   line is the precedent) and **the day's travel total**, which `DayTravelTotal` already computes for
   the day view. Both are facts the app holds; neither needs a pipe. **No weather** — ADR-0045, and
   ADR-0180 §4 already says weather returns as its own card.

## The edge cases this must survive, and they are the same six

The night strip's `mockups/tomorrow-lookahead-v3.html` §3 asserts, over every pair of rendered boxes,
that no two blocks and no two marks touch — ⁦0⁩ · ⁦0⁩ · ⁦0⁩ in all four theme × width runs. **Copy that
assertion.** The six days that break strips are already written down and probed (v3's header): a
partial overlap, a containment, three events on one minute, a twelve-item day, a zero-length event, a
tail across midnight. The glance rail today fails two of them and the fixes are one line each:

- **adjacent segments merge** — `.seg` has `min-width: 6px` and **no separator**, and
  `buildDayGlance` returns back-to-back events sharing a boundary exactly, so a busy day draws them
  as one continuous bar. The track's ⁦1px⁩ ground hairline is the fix, and it is already written.
- **a zero-length event is invisible** — `endsAt === startsAt` arrives with `point: false` and no
  width, so `.seg.point`'s ⁦4px⁩ tick never applies. `trackBlocks` already reads both shapes as a
  tick.

Both are open backlog lines. **Fix them as part of v2 rather than before it**, so the change lands
with a drawing that shows what it looks like.

## Plan, as steps

1. **Backlog check + read** — this brief's "Read first", plus `frontend/CLAUDE.md` as a design
   document. (~½ session.)
2. **Probe before drawing.** A throwaway `vitest` over `buildDayGlance` for the six days at the
   glance's own window, and a census of the shipped card. Delete the probe; keep the numbers in the
   mockup. This is what stops v2 being a taste argument.
3. **Draw `mockups/glance-v2.html`** — the census in §1, then one section per candidate move above
   with its "without" column rendered from the file's own block, then the six stress days at one
   height, then the collision assertion. Both themes, ⁦360⁩/⁦390⁩, and a control for every number that
   is a feel call. Reuse the app's real CSS through the `APP-CSS` manifest (add
   `styles/day-track.css` to it).
4. **Put the forks to the owner** — the phase-palette question (move 1's inks), pills vs marks
   (move 2), and what the lead becomes (move 4). These three change what the card _is_; the rest are
   measurements.
5. **Build behind the answers**, in this order: adopt `day-track` for the rail (which fixes the two
   defects), then the spacing, then the lead/foot copy, then any addition. Each step is independently
   shippable, and the specs for the first are mostly written already (`day-track.test.ts`).
6. **ADR + catalog entry + this note updated in place**, and the two backlog lines pruned.

## What would make this fail

- **Redesigning before counting.** The night board's answer was "the hierarchy already exists and is
  aimed at the wrong slot", and no amount of drawing would have found that — reading `board.css`
  did. The equivalent here is that `glance-card.css` already has a five-step phase palette and a
  count grammar; v2 should first ask what those are _for_.
- **Adding a second track mechanism.** If the drawing ends up with its own block CSS rather than
  `day-track.css` plus three custom properties, that is the duplication ADR-0214 §5 was written to
  prevent — and the mockups skill's own warning: a large hand-written CSS block is the tell.
- **Spending a new colour.** The card is paper and it already carries five phase fills plus amber
  anchors. Rule 4 has no room for a sixth meaning here.
