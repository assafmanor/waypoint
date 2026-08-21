# 2026-08-21 — Offline archives get a vintage

**Built.** The follow-on to [the bare online map](2026-08-21-live-map-build-resolved-not-pinned.md), from the owner, once the live source stopped being pinned to a build:

> _"I guess that offline maps have to be updated too then, not because they won't work but because we prefer updated maps."_

Amendment: [ADR-0186 §6 (2026-08-21)](../decisions/0186-the-map-is-ours-and-it-works-on-a-plane.md).

## What was actually true before this

Two frozen things, and the second is worse than the first:

- **On the device:** `map-archive-cache.ts` keys archives by URL and `useMapArchives` downloaded only what was _missing_. So the first world layer and extract a device ever stored were the ones it kept — for as long as it kept them. ADR-0186 §6 has five retention rules and every one is about deleting (trip end, trip delete, byte budget, eviction, survive-it-being-gone). None was about **age**, because until the live source stopped being pinned nobody had asked.
- **At the origin:** `WORLD_KEY` was a single fixed string, so the shared world layer was cut **once per deploy** and never re-cut. A device could not have fresher ground even by asking — the server had none. That one is not a preference, it is a bug that had been invisible because the whole archive was pinned to one build anyway.

## The mechanism: one 30-day vintage, and the key does the work

The temptation is a refresh clock, a staleness sweep, a background job. None of that exists here. The build id already invalidates the _live_ source by being in the URL; the offline artefacts get the same trick on a slower clock:

- `mapArchiveVintage(build, now)` → `v7`: whole 30-day windows since a fixed epoch, taken from **the build's own date** (a mirror's name says nothing about its data, so an undated source falls back to the cut date).
- The server puts it in the storage key (`map_world-z6_v7.pmtiles`, `map_<tripId>_<sig>_v7.pmtiles`). A rolled vintage is therefore a **plain cache miss**, and the existing "serve what is stored, cut in the background, `503` + `Retry-After` meanwhile" flow does the refresh with no new machinery.
- `/me` states it (`map.archiveVintage`, beside `liveBuild`), the device stores it with the bytes, and `isMapArchiveStale` compares.

**Why 30 days and not the build's own daily cadence.** Because the honest arithmetic is 42.7 MB (world) + ~23 MB (a city) **per device per day**, and §5's whole subject is that an automatic download must not be able to surprise someone abroad. Two clocks, and the slow one is the one that touches a data plan.

## The two guards, which are the actual design

Both exist because "prefer fresher" is easy to say and expensive to implement naively:

1. **A device replaces a copy only when it is a vintage behind AND older than the window.** Without the age half, a download late in one window is chased by the next window days later — 80 MB for a few days of OSM edits. With it, a refresh lands at most once per window and usually less.
2. **A refresh never asks and never spends metered bytes.** §5's one-time prompt is earned by a _missing_ archive: that is the difference between having a map on the plane and not. A stale archive already works, so where metering cannot be known (Safari has no `navigator.connection`) what is on the device stays, silently. A prompt offering to re-download 80 MB of a map you already have is a nag with a progress bar.

And the property that makes both safe: the refresh reuses the **same URL**, so the old bytes answer every read until the new ones are completely stored. §6 rule 5's spirit, restated — you cannot lose your map to a refresh.

## Verified

Backend against real upstream: boot logged `live map source is planet build 20260821 (v7)` and cut `map_world-z6_v7.pmtiles`; `/me` answered `{ liveBuild: '20260821', archiveVintage: 'v7' }`. Specs cover the window arithmetic (one value per window, rolls with the window, takes the build's date, falls back for a mirror), the service (serves the stored archive while its vintage is current; on a roll, cuts to the **new** key and leaves the old one alone), and the device's four decisions: current vintage → nothing; superseded and old → replaced quietly with the new label; superseded but three days old → **not** replaced; superseded on an unknown connection → not replaced and not prompted. 1002 backend + 4156 frontend tests pass.

## Named rather than skipped

**Nothing tells a person how old their map is.** §5's manage surface lists size, not age. That row is where an _asked-for_ refresh would belong if silent-on-wifi turns out not to be enough, and it is on the backlog rather than guessed at here.

Also noticed and not fixed: `retryAfterSeconds` reads a `Retry-After` header that CORS does not expose (no `exposedHeaders` in `enableCors`), so in a deployed cross-origin build every "still being cut" retry waits the 5s default rather than the server's 15. Harmless, two lines, and on the backlog — but it is a header the client believes it is reading and is not.
