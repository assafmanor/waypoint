# 0041 — Parallel / overlapping-time events: a containment forest, rendered as nests and clusters

**Status:** Accepted
**Date:** 2026-07-15
**Refines:** [0011](0011-hard-soft-event-model.md) (hard vs. soft — soft overlap is sanctioned, only hard-vs-soft is flagged), [0018](0018-timeline-data-model-shape.md) (no stored `now` — derived), [0028](0028-plan-violet-color-budget-dark-ready.md) (color budget, mode identity), [0036](0036-event-time-setter.md) (the time-setter the resolve falls back to), [0016](0016-plan-trip-modes-one-surface.md) (mode-emphasis, not different screens)

## Context

Every timeline surface assumed time is strictly sequential. Events were sorted `byStart` into a flat list, so two events sharing a time slot rendered as consecutive rows with no signal they run in parallel; Plan mode's gap chips and drag-reorder "soft slots" assumed no overlap; and `deriveNow` returned exactly one `now` / one `next`, so a second concurrent event was invisible.

But overlap is a **real, sanctioned state** (ADR-0011: two soft events overlapping is fine — only hard-vs-soft is flagged). Real sources: a long "envelope" soft event (a museum pass, a beach day) with specific things happening inside it; the ~5-friends group splitting up; incidental collisions. Design was worked out in session 22 (`docs/planning/2026-07-15-session-22-parallel-events.md`, mockup `mockups/parallel-events-v1.html`).

## Decision

**1. The structure is a containment forest with per-level clustering — not one flat decision.** Given the day's timed, planned events as intervals:

- **Parent = the _smallest_ event that strictly contains it** (ties: earliest start, then `sortOrder`). Roots are events nothing contains. This is a forest.
- **Among siblings at every level, events that _partially_ overlap** (overlap but neither contains the other) group into a **cluster** (connected components of the overlap graph).
- **Nesting and clustering compose, recursively:** a nest can hold a cluster (**overlap within containment** — a beach day holding two things that clash), and a cluster member can itself be a nest (**containment within overlap**). A chain A ⊃ B ⊃ C is parent→child→grandchild.

Primitives (pure, in `frontend/src/lib/time.ts` `buildTimeTree`): `spanContains(a,b)` requires one strict edge, so **equal spans are cluster peers, never nested**; `spansOverlap` is strict, so **`end === start` (back-to-back) is not overlap**. Events without `endsAt` are treated as zero-width points (containable, never containers); non-`PLANNED`/unscheduled events are excluded.

**2. Concurrency is shown with structure + neutral ink, never a new hue.** Amber stays time/now, violet stays plan (ADR-0028). Hard/soft grammar (solid+🔒+code vs dashed+hatch) is preserved inside nests and clusters. A single non-overlapping event stays a plain row.

- **Containment → nesting** is identical in Trip and Plan (a container is usually intentional — nothing to resolve): container row + contents indented, "כולל N".
- **Partial overlap → cluster** is the _only_ mode difference (ADR-0016 emphasis, not different screens): **Trip** = a quiet neutral side brace + "בו-זמנית" header; **Plan** = a bound plan-violet group with a header **"הזז"** control and a seam tag.

**3. In Plan, an overlap must read as the opposite of a gap.** A gap is empty time you add into (an airy dashed pill _between_ separated rows); an overlap is events _bound_ in the same time. So the overlap cluster is a bound group with **no between-row pill / flanking lines** — it can never be misread as a gap.

**4. Render depth is bounded even though the model isn't.** Indent caps at ~2 levels; anything deeper flattens into its deepest rendered container as an expandable "כולל N". Long titles get `min-width:0` + single-line ellipsis, the time column stays fixed-width, the indent step shrinks with depth, and tag chips drop first when space is tight — so nesting never collapses the row on a ~360px phone (ADR-0017).

**5. "הזז" is the ripple engine, inverted.** Ripple asks "you moved X, shift the soft events it now overlaps?"; "הזז" asks "these overlap, shift one soft event to clear it" — same shift math, optimistic + undo.

- **The mover is always soft** (hard = anchor, never moves). When a cluster has several soft events, the resolve sheet first lets you **choose which** to move; hard members appear as **disabled anchors** (🔒). Entry points: the header "הזז" opens the chooser; a card's seam tag opens straight to that event.
- Picking a mover offers one-tap **clean slots** snapped to the anchor's edges ("אחרי · <end>" / "לפני · <start>") plus **"זמן אחר…"** → the ADR-0036 time-setter. **Duration is preserved** (move, not resize). Same-day only (ADR-0036); no moving into the past (ADR-0029), so "לפני" is offered only when that slot exists today and isn't past.
- **A move that creates a _new_ overlap is not blocked or warned** (soft overlap is sanctioned, ADR-0011): offered slots prefer genuinely clean gaps, but any move just **re-clusters and re-renders** — the new state is visible, not hidden. The move's own `rippleSuggestion` handles a downstream chain. The only warning stays the existing amber ⚠️ line, and only when a soft event lands overlapping a **hard** one. Two overlapping _hard_ events get that ⚠️ line and **no "הזז"** (neither can move — a real double-booking to fix in reality).

**6. The board shows one loud hero + "ועוד N".** `deriveNow` now returns `nowAll[]` / `nextAll[]` (the full concurrent sets) alongside the primaries `now` / `next`, still **derived from the clock, never stored** (ADR-0018). The **primary** is chosen by `byPrimaryNow`: **hard > ends-soonest > starts-first > sortOrder**. The other concurrent events collapse into a quiet, expandable "ועוד N עכשיו", preserving "one loud element" (ADR-0028). When there's no clear primary (≥2 concurrent soft events, group-split), a distinct "עכשיו · במקביל" variant shows them as equals.

## Consequences

- **One pure helper feeds every surface.** `buildTimeTree` (day view, recursive render) and `deriveNow`'s `nowAll`/`nextAll` (board, flattened) are pure and unit-tested (containment forest, chain, overlap-in-containment, containment-in-overlap, back-to-back non-overlap, equal-span peers, primary ordering). No new stored state.
- **Group membership ("who's in which group") is deferred.** The board's group-split variant keys purely off "≥2 concurrent soft events, no clear primary"; per-member-per-event membership is a larger data-model question, out of scope here.
- **`parentId` is O(n²)** over a day's timed events — trivial at real sizes (a handful per day); chosen for a correct-by-definition "smallest container" over a fragile stack sweep.
- **Doubly-contained children attach to the smaller container** and are not cross-clustered against the other overlapping container's peers — a deliberate simplification that keeps the render a tree (matches the "containment within overlap" mockup).
- **Cross-midnight interaction with ADR-0037:** the tree operates on a day's list, so an overnight event clusters within its start night only — consistent with 0037's "filed under the start night". The board's `nowAll` is instant-based, so a still-running overnight still surfaces live past midnight.

## Alternatives considered

- **A two-axis calendar grid (side-by-side columns).** Rejected — hostile on a phone (~360px), fights RTL and one-handed use, and over-serves ~5 friends. A single-column forest reads at a glance.
- **A proportional "time-rail" gutter** (each event a bar sized by its span). Explored in the mockup, not chosen — richer but busier; the quiet bracket carries the concurrency signal with less noise.
- **Flag every overlap as a conflict to resolve.** Rejected — contradicts ADR-0011 (soft overlap is sanctioned) and would scold intentional envelopes.
- **One binary decision per group ("contains all → nest, else flat").** Rejected mid-design — it collapses chains and can't express overlap-within-containment or containment-within-overlap. The recursive forest is the correct model.
