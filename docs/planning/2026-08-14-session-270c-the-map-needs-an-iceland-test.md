# Session 270c — the map needs an Iceland test

**Date:** 2026-08-14
**Branch:** `staging`

## Report

The first working MapLibre map was too dark and its terrain bands too close together. The owner
required the light map to move with dark, then asked the sharper acceptance question: an upcoming
Iceland trip needs lakes, fjords, glaciers, fields, barren volcanic ground and other terrain to be
easy to distinguish.

## What the question found

`map-style.ts` overrode Protomaps' top-level close-up flavour but inherited its nested regional
`landcover` object unchanged. At z5–7 that object draws grassland, barren ground, urban area,
farmland, glacier, scrub and forest. The existing dark values were clustered around nearly the same
black, so fixing only the visible close-up palette would have left the Iceland promise false.

The archive still has no elevation source. Lakes, rivers, fjords, bays and sea share water styling;
glaciers and the seven cover classes are distinct; peaks can be labelled. Mountains and volcanoes
cannot gain relief, contours or a dedicated landform fill from a palette change.

## Decision and build

`mockups/map-basemap-ours-v2.html` compares current and proposed palettes at 360 and 390 in both
themes, using the app's real pin CSS and a fixed SVG stress field. The second field exercises the
regional Iceland classes. It reports Lab/chroma measurements from its painted values and rendered
all four theme×width combinations with the correct webfonts and no console errors.

The owner approved the direction. The accepted palette lifts the dark land from L* 14-ish to L* 20,
widens water/built/natural/road steps, and rebalances light to the same hierarchy. Every terrain
stays below chroma 14, the light floor stays above L* 78, and the minimum pairwise regional
separation is ΔE 4.7 dark / 4.8 light. Unit tests read the generated `landcover` expression so a
future Protomaps flavour change cannot silently collapse the regional map again.

## Still open

Relief shading or contours would require an elevation dataset, a second tile/storage budget and an
offline pipeline decision. It is not smuggled into the MapLibre migration as a colour adjustment.
Field report #35's original cause remains unknown; this pass fixes migration styling only.
