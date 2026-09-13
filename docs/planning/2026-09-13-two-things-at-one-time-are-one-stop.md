# 2026-09-13 — Two things at one time are one stop

**ADR:** [0225](../decisions/0225-two-things-at-one-time-are-one-stop.md) (Accepted and built the same session — the owner answered the forks with _"Let's build this"_, every recommendation standing)
**Mockup:** [`mockups/two-things-at-one-time-are-one-stop-v1.html`](../../mockups/two-things-at-one-time-are-one-stop-v1.html)

## The ask

Four screenshots of one Iceland morning — Seljalandsfoss and Gljúfrabúi both `08:30–10:00`, then Faxi Bakery Cafe at `10:15` — and one sentence:

> Overlapping events are not handled correctly with regards to timing and order. Let's discuss and mockup how everything should be handled in the map, the day view and the hero (+lifted hero).

## What reading the code changed, before anything was drawn

1. **It is one cause, not four.** ADR-0041 made two overlapping events one cluster; four consumers then broke the tie between its members four ways — `buildTimeTree` (stable / storage order), `buildDayStopSequence` (alphabetical), `byPrimaryNow` (stable), `nextDestination` (first-in-array). Both waterfalls have `sortOrder: 0`, the default every new event gets, so on this day the tail of each comparator was the entire decision.
2. **The map's leg between the two peers is a journey the day never has.** `dayBlocks` refuses a join inside a cluster ("two things at once"); `Map.tsx`'s `dayLegs` walks consecutive pins and drew it anyway, in amber — 0206 D1's hue for a real routed leg.
3. **The day view was already right about entry and exit** (`groupStartEvent` / `groupEndEvent`), the tomorrow strip already draws a cluster as one block (0214 §8). The rule existed in three call sites and no ADR, which is why the map and the hero never inherited it.
4. **A second defect the screenshots could not show:** `deriveNow.nextAll` is "same start", 0041's cluster is "overlaps". Give the second waterfall `09:00–10:30` and the lifted hero says `אחר כך 09:00 Gljúfrabúi` about a thing the day has braced with the first. The mockup's `חופפים חלקית` toggle draws it; the fix is §7.

## What the render found

- The fixture's first draft had the cafe at `10:15` in both cases, so in the partial case the union-find swallowed it into the cluster and `אחר כך` had nothing to name — a real property of the model (a third overlapping thing _is_ a peer), caught by the page throwing rather than by reading. The cafe now follows the stop by 15 minutes in both cases.
- The hotel's `צ׳ק-אאוט` tag sits **above** its pin (`.pin-tag`), so a bookend near the canvas edge clips its own word. Fiction-side in this file (the pin was placed by hand), but the same geometry holds on the real canvas — the camera's fit clearance (ADR-0123) is derived from the pin's size, not the tag's.
- The collapsed board absorbs the peer line at no height: meta `17px → 17px`, board `138px → 138px` at 360. The lift grows `+59px` for one peer.

## Forks put to the owner

- **F1 — the comparator's tail.** `createdAt` (recommended: "the one you added first" is an order a person can reconstruct) vs. alphabetical (the map's today; meaningless over mixed Hebrew/Latin names) vs. storage order (the day's today; not guaranteed to agree between devices).
- **F2 — the tether between peers.** A short dashed neutral line saying "same stop", no time on it (recommended) vs. nothing at all. The mockup's control shows both.
- **F3 — the number.** The same number on every peer (recommended: both places _are_ the N-th stop) vs. the entry peer only (rejected because a bare pin already means "an edge with no known moment", 0171 §10b).

## Not decided here

- Nearest-peer-first as the entry rule when neither `sortOrder` nor time says anything (ADR §5, kept as a later refinement).
- Whether the map's stop traversal (0182) framing both peers in one step reads right on a device.

## The build, same session

Owner, on the mockup: _"Let's build this"_. Twenty files, all under `frontend/src`; the ADR's §10 carries the log. Three things worth keeping here rather than there:

- **The map's clusters are read off `buildTimeTree`, not re-derived.** The first instinct was a union-find over the stops' spans inside `buildDayStopSequence`, which is the tree's own algorithm written a second time (rule 8). The stops' events go through the tree and a walk collects cluster membership at every depth; only a start-edge moment can be a peer.
- **`Home` hands the horizon the whole cluster only when `shownNext` is `deriveNow`'s next.** The board sometimes shows a check-out in that slot (ADR-0224), and a stay's edge has no peers; passing `nextAll` unconditionally would have listed tomorrow's first stop's peers under a check-out.
- **The `HeroLift` test file cleans up per `describe`**, not globally — a new describe that forgets `afterEach(cleanup)` inherits the previous test's portal and every count assertion in the file after it goes wrong by exactly one render. Found by the count, not by the failing test.

Verification: frontend 304 files / 5,555 unit tests green; `tsc` and `vite build` clean; the map, hero and day e2e specs run locally before the push (numbers in the PR).
