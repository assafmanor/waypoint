# Session 22 — Parallel / overlapping-time events (design)

**Date:** 2026-07-15
**Status:** Design exploration — not yet decided. No ADR yet.
**Mockup:** [`mockups/parallel-events-v1.html`](../../mockups/parallel-events-v1.html)

## Problem

All three timeline surfaces assume time is strictly sequential, so overlapping
events render wrong:

- **Day view (Trip `DayView.tsx` + Plan `PlanDay.tsx`)** — events are sorted
  `byStart` into a flat list. Overlapping events become consecutive rows with no
  signal they run in parallel. Plan additionally computes gaps between rows and
  drag-reorders "soft slots" — both assume no overlap.
- **Home Now/Next (`Home.tsx` + `deriveNow`)** — `deriveNow` returns exactly one
  `now` and one `next`; a second concurrent event is invisible.

Overlap is a **sanctioned** state, not an error: ADR-0011 says two soft events
overlapping is fine (only soft-vs-hard is flagged, via the existing amber
conflict warning). Real sources of overlap: a long "envelope" soft event (museum
pass 11:30–17:30) with specific things inside it; the ~5-friends group splitting
up; incidental collisions.

## Proposed direction (defaults pending owner confirmation)

The clarifying questions didn't reach the owner (tool error); these are the
recommended answers, used to build the mockup. **Confirm/redirect before code.**

1. **Meaning = mix, shown calmly.** Support envelope, group-split, and incidental
   overlap; never scold soft-soft overlap.
2. **By mode:** Trip shows concurrency calmly; **Plan** adds a gentle "these
   overlap" affordance (it's the builder — where you'd resolve it).
3. **Board:** one loud `now` hero + a quiet **"ועוד N עכשיו"** expander; a
   distinct **group-split** variant when there's no clear primary.

### The concurrency cluster (day view)

Consecutive time-overlapping events merge into a single-column **cluster** with a
shared window header. Concurrency is shown with **structure + neutral ink**,
never a new semantic hue (amber stays time/now; violet stays plan). Two
treatments in the mockup:

- **A — bracket cluster:** header + hairline vertical bracket, rows nested.
  Minimal, low-risk. Recommended baseline.
- **B — time rail:** a proportional gutter where each event is a bar sized by its
  span, so an envelope reads as a tall bar and nested events as short bars; amber
  now-line. Richer; better for envelope-heavy days.

Hard/soft grammar is preserved **inside** the cluster (solid+🔒+code vs
dashed+hatch). A single non-overlapping event stays a plain row (no cluster).
`end === start` (back-to-back) is **not** an overlap.

### Plan mode

Same cluster + a violet **overlap chip** replacing the gap chip when spans
overlap ("חופף ב-45 דק׳ · הזז"). Drag-reorder still acts on soft slots; hard
events stay pinned anchors.

### Board

Primary `now` chosen by: **hard > ends-soonest > starts-first**. Others collapse
into "ועוד N עכשיו". Group-split variant (no primary): two equal rows under
"עכשיו · במקביל".

## Data-model implication

`deriveNow` returns single `now`/`next` today. To support this it should return
`nowAll: TripEvent[]` / `nextAll: TripEvent[]` (concurrency groups), still derived
from the clock, never stored (ADR-0018). A shared `mergeOverlaps`/`clusterByTime`
helper feeds both the day view and the board.

## Open questions for the owner

- Treatment **A vs B** for the day view (or A now, B later)?
- Confirm the three defaults above.
- Group-split: is "who's in which group" data we track, or just two events at the
  same time? (Membership-per-event is a bigger data-model question — deferred.)

## Next step

On confirmation: write an ADR (day-view concurrency + board concurrency), extend
`deriveNow` + add the cluster helper in `packages/shared`/`lib`, implement in
`DayView`/`PlanDay`/`Home`, tests for cluster merging and primary-now selection.
