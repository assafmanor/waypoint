# Session 107 — What's behind you sinks: the next stop stops being last

**Date:** 2026-07-25
**Kind:** Behaviour refinement (follow-up to session 106, from a real screenshot).
**ADRs:** [0109](../decisions/0109-map-tab-design.md) **session-107 amendment**, [0043](../decisions/0043-day-view-now-line-and-derived-phases.md) (`eventPhase`'s boundary, and the now-line this list has no axis for), [0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md) (the ambient tier it sinks past).

## Why

Session 106 gave the list trip order. A screenshot of the shipped result showed the ordering was right about sequence and wrong about priority: at **14:11**, the day read

```
Tavernaki Filippos        (visited)
Avram's Grandson          (visited)
מערת הקרח בקאטלה   היעד הבא · 17:00   ← last
```

The one row the user actually needed — the stop they were heading to, already ringed amber by Phase 4b — was at the bottom, under two places they'd been. On Trip mode's live surface the question is what's ahead.

## Change

**`DayUsage` gains `until`** — when the place stops being current on that day, the **latest** end among its references there (a place is behind you only once everything there is). It's `endsAt ?? startsAt`, the same boundary `eventPhase` uses, stamped on every day a span touches.

**`comparePlacesBySchedule` takes a context object** (`{ nameOf, onDate?, nowMs? }`) rather than a growing positional tail, and gains one tier: with `nowMs`, a place whose moment has passed ranks last within its day. Within-day order is now **ahead (clocked) → untimed → ambient backdrop → behind you**.

**`isDayUsagePast` + `placeDay` are exported** so the screen can partition without re-deriving the rule — the screen asks the same function the comparator does.

**The block is labelled `כבר היינו`**, reusing near-me's `.map-grouphead`. This was the part worth not skipping: without a label the list silently reorders as the clock passes each stop, and the rows carry no time of their own, so there'd be no on-screen answer to "why is that down there."

**Trip mode only** — Plan mode passes no clock.

## The principle this bends, and why it still holds

Session 106's amendment argued the map and the timeline "cannot disagree about the same day," and this partitions where the timeline doesn't. The resolution recorded in the ADR: **within each tier the day view's vocabulary is untouched**, so the two surfaces order the same events the same way. What differs is how they express "done vs ahead" — the timeline has a **now-line** (position = time), and the list has no time axis to hang one on, so it partitions instead. Same information, different available grammar.

## Judgment calls, stated

- **In-progress is not behind you.** A 13:00-18:00 event at 14:00 keeps its chronological lead; sinking what you're inside of would be the same class of bug as session 103's mid-flight day lock.
- **An untimed event outranks a visited one** — nothing about it says it's done.
- **The sunk block stays chronological**, so the day reads "what's left, in order" then "what happened, in order" rather than zigzagging most-recent-first.
- **A wholly-past day is unaffected** — everything lands in one tier, so its order is exactly what it was.

## Verification

- `lib/place-usage.test.ts` (+6): the reported day resolves `ice-cave · morning · lunch` with the clock and stays chronological without it (so both modes are pinned in one test); the sunk block stays chronological; an in-progress event leads; a stay is not behind you until check-out passes but is after; an untimed event outranks a visited one; a wholly-past day is unchanged.
- `screens/Map.test.tsx` (+2): the rendered Trip-mode list leads with the next stop and shows the `כבר היינו` header; Plan mode keeps the true sequence with no header.
- `typecheck` + `lint` (0 errors) + `build` + `format:check` green; frontend suite **895** passes (887 → +8).

## Next

Unchanged, and one item newly worth doing: Map-tab follow-up **(c) richer `<time> · <what>` row meta** would make this partition self-evident (each row would state its own time), and it was unblocked when the ADR-0107 display track finished. **Phase 5** (Plan-mode research) is unblocked; **Phase 6** still waits on the Google Cloud slice.
