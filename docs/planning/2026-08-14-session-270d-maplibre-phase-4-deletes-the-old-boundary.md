---
date: 2026-08-14
session: 270d
topic: MapLibre Phase 4 — delete the old renderer boundary
adr: ADR-0186
branch: staging
---

# Phase 4 deletes the old renderer boundary

Phase 3d was not built. The owner verified on staging that revisiting researched ground is immediate
both within the mounted map and after switching tabs. The existing MapLibre tile cache, page-global
PMTiles registry and browser HTTP cache satisfy the observed session requirement; a separate range
LRU remains evidence-triggered, not roadmap ceremony.

Phase 4 removes the obsolete Google renderer configuration and dependencies: `MapsConfig`, the
three frontend Maps build variables, the tuner fields that reported Map IDs/vendor schemes,
`@vis.gl/react-google-maps`, and `@types/google.maps`. The backend Places key and navigation deep
links are unrelated and remain. Offline never disables the Map canvas.

The same pass fixed an intermittent false terminal error. A local/remote archive switch could reject
after MapLibre had already constructed a working instance; the broad startup catch then declared the
canvas unavailable even while it could paint. Once an instance exists, archive/style-switch errors
now stay on the diagnostic channel and preserve the current map. The first-tile timeout was not
increased or removed: it is a slow-loading notice, not the source of the terminal wording, and a late
paint already retires it.

Archive switches are also latest-wins. A delayed older registration can finish after a newer style
has already rendered, but it is no longer allowed to apply that stale style to the live map.

Production truth remains the preview suite and the real-archive render spec. A dev-server pass cannot
verify emitted assets, lazy chunks or the worker URL.

The full preview gate also made an existing shelf-drag flake deterministic under parallel load. Its
seam assertion confused Chromium scroll anchoring with layout movement, and the drag ghost measured
its grab offset after the hold instead of at pointer-down. The assertion now uses scroller-relative
geometry and the gesture carries its pointer-down box through the hold. Ten parallel repeats and the
full preview pass are green.

Field report #35's original cause remains unknown. The migration's defects are not evidence that the
swap cured it.
