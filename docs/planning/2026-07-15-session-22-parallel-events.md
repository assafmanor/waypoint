# Session 22 — Parallel / overlapping-time events (design)

**Date:** 2026-07-15
**Status:** Design decided (visual). ADR + implementation next.
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

## Decisions (session 22, owner-confirmed)

1. **Meaning = mix, shown calmly.** Support envelope, group-split, and incidental
   overlap; never scold soft-soft overlap.
2. **By mode:** Trip shows concurrency calmly; **Plan** flags it as resolvable.
3. **Board:** one loud `now` hero + a quiet **"ועוד N עכשיו"** expander; a
   distinct **group-split** variant when there's no clear primary. (Approved.)

### The concurrency cluster (day view)

Consecutive time-overlapping events merge into a single-column **cluster** with a
shared window header. Concurrency is shown with **structure + neutral ink**,
never a new semantic hue (amber stays time/now; violet stays plan).

**Trip = quiet ("Treatment A"):** a small muted header + a hairline neutral side
brace, rows nested. No box, no fill — grouping reads without shouting. (The
proportional "time-rail" variant B was **not** chosen.)

Hard/soft grammar is preserved **inside** the cluster (solid+🔒+code vs
dashed+hatch). A single non-overlapping event stays a plain row (no cluster).
`end === start` (back-to-back) is **not** an overlap.

### Plan mode — overlap must be VISUALLY DISTINCT from a gap

Owner call: an overlap must not share the gap chip's grammar — they are opposites
(gap = empty time to add into; overlap = events bound in the same time). So:

- **Gap** keeps its grammar: an airy dashed pill centered between two separated
  rows, flanked by hairlines ("＋ שבץ") — additive.
- **Overlap** is the same cluster as Trip but rendered as a **bound** group: a
  plan-violet tinted container + a solid **violet side brace**, a header-level
  **"הזז" resolve control**, and a small violet **seam tag** ("⧉ חופף 45 דק׳") on
  the lower card of an overlapping pair. Crucially **no between-row pill / flanking
  lines** inside it, so it can never be misread as a gap.

Drag-reorder still acts on soft slots; hard events stay pinned anchors. "הזז"
offers to nudge a soft event to break the overlap. The existing amber
hard-vs-soft ⚠️ conflict line is unchanged.

### Board

Primary `now` chosen by: **hard > ends-soonest > starts-first**. Others collapse
into "ועוד N עכשיו". Group-split variant (no primary): two equal rows under
"עכשיו · במקביל".

## Data-model implication

`deriveNow` returns single `now`/`next` today. To support this it should return
`nowAll: TripEvent[]` / `nextAll: TripEvent[]` (concurrency groups), still derived
from the clock, never stored (ADR-0018). A shared `mergeOverlaps`/`clusterByTime`
helper feeds both the day view and the board.

## Open question (deferred)

- Group-split: is "who's in which group" data we track, or just two events at the
  same time? Per-member-per-event membership is a bigger data-model question —
  **deferred**. The board's group-split variant is driven purely by "≥2 concurrent
  soft events with no clear primary" for now; group labels are illustrative.

## Next step

Write an ADR (day-view concurrency cluster + Plan overlap-vs-gap distinction +
board concurrency), then: extend `deriveNow` to `nowAll[]`/`nextAll[]`, add a
shared `clusterByTime` helper (`packages/shared` or `lib/time`), implement in
`DayView`/`PlanDay`/`Home`, and test cluster merging, back-to-back non-overlap,
and primary-`now` selection (hard > ends-soonest > starts-first).
