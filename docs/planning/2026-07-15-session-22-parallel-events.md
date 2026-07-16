# Session 22 — Parallel / overlapping-time events (design)

**Date:** 2026-07-15
**Status:** Design decided → [ADR-0041](../decisions/0041-parallel-overlapping-events.md) written; pure-logic foundation landed (`buildTimeTree` + `deriveNow` sets, unit-tested). UI wiring next.
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

### The model is recursive (day view, both modes)

Overlap isn't one binary decision per group — the correct structure is a
**containment forest with per-level clustering**, decided the same way in both
modes:

1. **Containment forest.** For each event, its parent is the _smallest_ interval
   that strictly contains it (stack/interval-tree build over events sorted by
   start asc, end desc). Roots = events nothing contains.
2. **Per-level clustering.** Among siblings at any level (roots, or the children
   of one node), events that **partially overlap** (overlap but neither contains
   the other) group into a **cluster**.
3. **They compose, recursively.** A nest can hold a cluster (**overlap within
   containment** — e.g. a beach day holding two things that clash), and a cluster
   member can be a nest (**containment within overlap** — two partially
   overlapping events, one of which is itself an envelope). A **chain** A ⊃ B ⊃ C
   is just parent→child→grandchild.

Primitives: `contains(A,B)` = `A.start ≤ B.start && A.end ≥ B.end && A≠B`;
`partialOverlap(A,B)` = overlap **and** neither contains the other; **equal
spans** = cluster peers (not arbitrary nesting), tie-broken by `sortOrder`.
`end === start` (back-to-back) is **not** overlap.

**Rendering is bounded even though the model isn't.** Indent caps at ~2 levels;
anything deeper flattens into its deepest rendered container as an expandable
"כולל N" (no Russian-doll on a 360px phone). Concurrency is shown with
**structure + neutral ink**, never a new hue (amber stays time/now, violet stays
plan). Hard/soft grammar is preserved inside nests and clusters. A single
non-overlapping event stays a plain row. (The proportional "time-rail" variant
was **not** chosen.)

- **Containment → nesting** is identical in Trip and Plan (usually intentional —
  nothing to resolve): container row + contents indented, "כולל N".
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
- **Choose which event to move.** When a cluster has several soft events, the
  sheet first lists them ("מה להזיז?"); hard members appear as **disabled
  anchors** (🔒 עוגן) so it's clear why they can't move. Entry points: the header
  **"הזז"** opens the chooser; a card's **seam tag** opens straight to that event.
- Picking a mover reveals its one-tap **clean slots** snapped to the anchor's
  edges — "אחרי · &lt;end&gt;" / "לפני · &lt;start&gt;" — plus **"זמן אחר…"** →
  the ADR-0036 time-setter seeded with the nearest free slot. **Duration is
  preserved** (move, not resize).
- **Optimistic + undo**, like every verb. If the move creates a _new_ downstream
  overlap, the move's own `rippleSuggestion` handles the chain ("push the rest
  too?"). Resolve one collision at a time; re-cluster after.
- **Same-day only** (ADR-0036); no moving into the past (ADR-0029), so "לפני" is
  offered only when that slot exists today and isn't past.

### Board

Primary `now` chosen by: **hard > ends-soonest > starts-first**. Others collapse
into "ועוד N עכשיו". Group-split variant (no primary): two equal rows under
"עכשיו · במקביל".

## Data-model implication

`deriveNow` returns single `now`/`next` today. To support this it should return
`nowAll: TripEvent[]` / `nextAll: TripEvent[]` (concurrency groups), still derived
from the clock, never stored (ADR-0018). A shared pure helper — e.g.
`buildTimeTree(events)` → a forest of `{ event, kind: 'nest'|'cluster'|'leaf',
children }` — feeds both the day view (recursive render) and the board (flatten
the "now" set, pick the primary). The board doesn't need the tree shape, only the
concurrent set + primary rule.

## Open question (deferred)

- Group-split: is "who's in which group" data we track, or just two events at the
  same time? Per-member-per-event membership is a bigger data-model question —
  **deferred**. The board's group-split variant is driven purely by "≥2 concurrent
  soft events with no clear primary" for now; group labels are illustrative.

## Next step

**Done:** ADR-0041; `buildTimeTree` + `deriveNow`(`nowAll`/`nextAll`, `byPrimaryNow`)
in `lib/time.ts`, unit-tested (containment forest incl. chain / overlap-in-
containment / containment-in-overlap, back-to-back non-overlap, equal-span peers,
primary-`now` ordering).

**Remaining (UI):**

1. **Trip `DayView`** — recursive render of `buildTimeTree`: quiet nest + quiet
   cluster; long-text ellipsis + depth-capped indent; preserve `now` ring.
2. **Plan `PlanDay`** — same tree, violet overlap cluster with "הזז"; keep gap
   chips only where there's a real gap (not inside clusters); drag-reorder intact.
3. **`Home` board** — primary hero + "ועוד N עכשיו" expander + group-split
   variant, off `nowAll`/`nextAll`.
4. **"הזז" resolve sheet** — mover chooser (soft only; hard = disabled anchor) →
   clean-slot picker (before/after anchor + exact-time fallback); wire to the
   move verb (optimistic + undo; existing ripple handles downstream chains).
5. CSS + i18n strings; component tests; verify in the running app.

Respect ADR-0040: Trip mode only renders in the live window; a finished trip is
a read-only archive (no "הזז"/resolve affordances there).
