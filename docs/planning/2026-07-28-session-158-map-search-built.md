# Session 158 — the query takes the row, built

**Date:** 2026-07-28
**Kind:** build. [ADR-0131](../decisions/0131-map-search-is-a-control-not-a-screen.md) §1–§8b, with its [build log](../decisions/0131-map-search-is-a-control-not-a-screen.md#build-log-2026-07-28-session-158) carrying the findings.
**Not built, and why:** §9 (the long press) is **blocked** on Phase 6b — `createPlace({ name })` is the only create path, so a coordinate-bearing place needs a backend + `@waypoint/shared` change. §10 (the picker's `בטיול` half, then the errand) is the separable tier the ADR's Consequences already ordered. Both are on the backlog as Phase 10's remainder, with everything already decided about them.

## What shipped

The Map tab's search stops being ADR-0101's full-screen overlay and becomes the second occupant of the controls row's one disclosure. `SearchOverlay` is untouched and keeps the Index. `PlaceResearch` is re-parented into the sheet in **both** modes, with no arm, and `PLACE_SEARCH_MIN_CHARS` is 3.

**The change that actually retires the overlay is not the field — it is that two arrays became one list.** `searchRows` existed _because_ the query rendered somewhere else; with the query as a control on this row it is the same list narrowing, so there is one predicate, one count, one empty state and one renderer, and a row that stops matching collapses in place through the shared reveal exactly as a chip's does. The two-array shape could not animate across that boundary, which is the mechanical form of the design's own point: the query was a screen, and it is now a control.

## The finding worth the session

**`isAsidePin` has five readers and the ADR's table enumerated three.** §4 was careful about which readers should follow a live query — the ratio, the dot tier and the camera yes; the amber cues and the day connector deliberately no — and it was right about all five it named. But two more read the tier in the code, for a **different question**: `setGhostId` and `ghostsInArea` ask _"is this pin's row absent from the list?"_, not _"is this subordinate?"_. Under a query the list is trip-wide, so the answer is uniformly no, and both had to change for a reason the promotion does not supply.

Left alone: tapping a match would have surfaced a `.map-ghostrow` duplicating a row already on screen, and the area banner would have claimed `N מקומות באזור אינם ביום הזה` over a list that was showing them. Neither is a crash; both are the surface quietly contradicting itself.

**The generalisable bit:** ADR-0130 named that predicate after its _reason_ ("the day scope did not choose this place") and said naming it is what kept a five-call-site split from being five silent behaviour changes. That worked — and this build shows the next hazard, which is that a well-named predicate accumulates readers asking **adjacent** questions. The name stops you changing them wrongly; it does not stop you missing them.

## Four smaller ones

- **`aside` had to join `pinsKey`.** The pin array is memoized on a content key so a clock tick diffs to nothing; a promotion that changed a rendered class but not that string would keep the old ratio. The pin _set_ usually changes with the query too, so the bug would have been **intermittent** — the worse kind.
- **`MapPin.aside` defaults from the tier when absent**, which was not in the design. It is what keeps the flag a _withdrawal_ rather than a field every caller must remember, and it is what let `MapPane`'s own tier-only tests stay tier-only.
- **A third rule-4 violation, deleted rather than re-coloured.** `.map-instate.shelf` was plan violet and Plan-only until §8 put Google's half in both modes. The two chips it distinguishes say `כבר בטיול` and `על המדף`, so the words already carry it. (`.map-tag.mbadge` is the same family but **pre-existing** — shelf rows have rendered in Trip mode for a long time — so it is backlogged as a deliberate design-language call rather than fixed in passing.)
- **The floor's test fixtures are now derived from the floor.** Three cases were on a literal 2-char query, which at a floor of 3 does not fail — it goes inert and keeps passing while testing nothing. Both sides read the constant now, so the next change to it cannot silently disable a test. §8b's Consequences predicted this failure mode; it is now structurally impossible rather than merely fixed.

## One assertion I got wrong on paper

The day connector under a query does not "stay the same" — it **empties**, because it follows the filtered set exactly as it does for a category chip. The invariant worth testing is narrower: a promoted ghost never **joins** the route. Worth recording because the wrong version passed review in my own head twice.

## Unchanged, and stated rather than implied

The rendered canvas was **not** seen. `MAP_CONTROLS_H` stays 46 and the camera's top inset stays derived from it at 118, so no camera constant moved and no test in `lib/map-camera.test.ts` changed. `MapPane`'s memo is intact: the query reaches `pinsNow`, never the pane as a prop. ADR-0131's device-pass cluster is untouched — including the one item that could **block** rather than tune, which belongs to the unbuilt §9.
