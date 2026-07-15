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

### The unified rule (day view, both modes)

Time-overlapping events merge into a group (interval-merge / connected
component). Then one rule decides the shape, **the same way in both modes**:

- **If a single event contains _all_ the others → NESTING** (envelope + tucked
  contents).
- **Otherwise → a flat CLUSTER.**

Nesting is **one level deep** — a chain (A ⊃ B ⊃ C) flattens to all contents
under the outermost container (no Russian-doll indentation on a phone). If
anything only partially sticks out of the would-be envelope, the whole group
falls back to a flat cluster.

Concurrency is shown with **structure + neutral ink**, never a new semantic hue
(amber stays time/now; violet stays plan). Hard/soft grammar is preserved inside
both nests and clusters (solid+🔒+code vs dashed+hatch). A single non-overlapping
event stays a plain row. `end === start` (back-to-back) is **not** an overlap.
(The proportional "time-rail" variant was **not** chosen.)

- **Containment → nesting** is identical in Trip and Plan (usually intentional —
  nothing to resolve): container row + contents indented one level, "כולל N".
- **Partial overlap → cluster** differs only by mode: **Trip** = a quiet neutral
  side brace + "בו-זמנית" header; **Plan** = the flagged violet group below.

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

Drag-reorder still acts on soft slots; hard events stay pinned anchors. The
existing amber hard-vs-soft ⚠️ conflict line is unchanged.

### "הזז" — the resolve (ripple, inverted)

Overlap resolution is what the ripple engine already does, run the other way:
ripple = "you moved X, shift the soft events it now overlaps?"; "הזז" = "these
overlap, shift one soft event to clear it."

- **Mover is always soft** (hard = anchor, never moves). Two overlapping _hard_
  events → no "הזז", just the ⚠️ line (a real double-booking to fix in reality).
- Tapping "הזז" (or a card's seam tag) opens a resolve **Sheet** scoped to the
  soft mover: one-tap **clean slots** snapped to the anchor's edges — "אחרי · <end>"
  / "לפני · <start>" — plus **"זמן אחר…"** → the ADR-0036 time-setter seeded with
  the nearest free slot. **Duration is preserved** (move, not resize).
- **Optimistic + undo**, like every verb. If the move creates a _new_ downstream
  overlap, the move's own `rippleSuggestion` handles the chain ("push the rest
  too?"). Resolve one collision at a time; re-cluster after.
- **Same-day only** (ADR-0036); no moving into the past (ADR-0029), so "לפני" is
  offered only when that slot exists today and isn't past.
- Multi-mover clusters: "הזז" targets the invoked event; others keep their own.

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
