# Session 127 — an undated place is not in the past

**Date:** 2026-07-26
**Branch:** `claude/maps-maybes-display-bugs-pbmgse`
**ADR:** [0109](../decisions/0109-map-tab-design.md) (session-127 amendment), following [0119](../decisions/0119-map-maybes-facet-is-the-shelf.md)

Owner report, straight after session 126 shipped: "maybes that aren't in any day still
show up as 'in the past' on the place list."

## What was actually happening

Nothing on the row said "past" — the **header above it** did. Two decisions that were
each fine alone combined into a false claim:

- ADR-0109's session-110 amendment put a reference with no day at all **last, in
  neither block**;
- the list marks only **where a block starts** (`מה שמאחורינו` at the first behind row),
  so everything below that point inherits it.

An undated group with no header of its own, sitting below the behind block, is
therefore rendered _as_ the behind block. Session 126 made this louder rather than
causing it: `אולי` now finds more rows, and in all-days scope the dateless ones land
right there.

Worth naming as a class, since it is the second time this list has produced it: a
**boundary marker is not a group label**. It only reads correctly while every group
below the boundary belongs to it.

## What shipped

**The blocks are a named vocabulary, read by both the ordering and the headers**
(`PLACE_BLOCK` / `placeBlock` in `lib/place-usage.ts`). A header can no longer claim a
row the comparator put somewhere else, which is the actual defect.

**Three blocks, in reading order:** `מה שלפנינו` → `ללא יום` → `מה שמאחורינו`. The
undated group sits **between** the two rather than under them: nothing about it has
passed, so it is not behind you, and it makes no claim on the near future either, so it
cannot lead. That revises session 110's ordering call — which existed to stop dateless
rows floating to the **top** (the session-106 bug), a fix that survives intact here.

**A one-block list renders no header at all**, generalizing ADR-0117 §3's ahead-header
rule instead of adding a second special case beside it. Near-me is untouched: it labels
the whole list by distance and shows no schedule blocks.

Relabelling alone was considered and rejected — it would have answered the words of the
report while leaving a live "someday" candidate below every stop of a finished week.

## Tests

`place-usage.test.ts`: an undated place ordered between ahead and behind with a clock,
`placeBlock` returning each of the three for the same fixture, and still last when no
clock is passed (the no-clock path must not change).

`Map.test.tsx`: a new session-127 block asserting the rendered **sequence** (headers
included) in all-days scope, the same list day-scoped (where an undated row isn't
present at all), and an all-undated list carrying no header. Clock pinned.
