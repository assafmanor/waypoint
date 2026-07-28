# Session 159 — the device answered, twice

**Date:** 2026-07-28
**Kind:** build, from an Android device pass on the surface session 158 shipped. Two of the owner's four reports are fixed here; two are a design session and are on the backlog as one line.
**Records:** [ADR-0131](../decisions/0131-map-search-is-a-control-not-a-screen.md)'s device-pass section.

## What the phone said

Four reports off one screenshot, keyboard up:

1. The header and the tab bar are both still on screen while searching, and the canvas is a ~170px sliver between them. "Looks awful. We should design this."
2. At the maximized map there is no way to see results — "maybe we shouldn't allow this."
3. The event/booking place picker was not built at all.
4. Unsaved Google results should be pins on our map, with their own pin design.

(2) and (3) are fixed. (1) and (4) are designed together, because (4) changes the surface (1) is laying out.

## The one worth recording: I reasoned from the wrong platform

ADR-0131 §2's whole argument was that the keyboard "eats the sheet and the pins survive" — the inversion of the failure ADR-0101 recorded, and the thing that justified moving the query into the row rather than keeping a full-screen overlay. I measured it in a mockup against an **iOS** model, where the layout viewport does not shrink for the software keyboard, so the canvas stays where it is and the keyboard covers the sheet.

**Android resizes the layout viewport.** So the whole shell compresses into what is left above the keyboard; the ~490px header and ~130px nav keep their sizes because they are fixed content; and the split — the only flexible region — absorbs the **entire** loss. The conclusion was right about which half survives on one platform and simply does not describe the one the owner uses.

What makes this worth more than a correction: **the device pass entry I wrote named this exact risk and I still shipped the optimistic reading.** ADR-0131's cluster said "the real keyboard height, and what iOS does with focus inside a `100dvh` PWA… the mockup cannot answer this at all, and it is the one number §2 depends on." Naming a risk is not the same as not depending on it. The honest version of §2 would have been "this holds on iOS and is unknown on Android", and the mockup could have drawn both.

And the fix is the trade ADR-0101 made in the other direction: it chose a `Modal` variant precisely because chrome-hiding came **free** with z-index, and rejected threading a search-mode flag through `AppShell`. ADR-0131 threw that virtue away along with the defect it came bundled with. What is wanted is the virtue without the defect — reclaim the chrome, keep the canvas — which is the backlog's own chrome-condensing question with a concrete instance attached.

## §6 reversed: the count was the wrong shape, not merely too small

The owner asked about the maximized map during the design session, I moved the sheet from both extremes, they told me not to, and I replaced it with a count-as-button. The phone says that was wrong, and the reason is worth being precise about: **the problem at that stop is structural, not spatial.** The sheet shows no rows there, so a coordless match has no pin _and_ no row, and after §8 every Google result is a row with no pin. A control that buys "canvas plus a way out" answers a question about space; the question was about whether the answer exists on screen at all.

So the axis itself loses its bottom stop while a query is live. `SnapSheet` already takes `order` as a prop, so **one narrowed array closes the toggle, the drag and the arrow keys together** — three routes to the same stop, shut by one change rather than three guards that can drift. The toggle's `מפה` option is absent rather than disabled, which is the rule this tab already runs everywhere. And the count is deleted with the mechanism it existed for, its string with it.

## §10's picker half: it removes a cost

`PlacePickerSheet` now has `בטיול` above `מגוגל`. Worth stating plainly because it is unusual: **this makes the app cheaper.** The most common add — the hotel, the station, the restaurant someone shelved — was buying a paid Autocomplete session to find something the trip was already holding, because the picker only knew how to ask Google.

Three things the build settled that the design left open:

- **The third verb needs no cleanup.** Pointing a reference at an existing place is neither enrich nor mint; the caller writes a different `placeId` and the abandoned coordless Place-lite is simply unreferenced, which ADR-0112 already makes harmless. No confirm, no sweep.
- **Only places that can supply a location are offered**, and never the one you are replacing — a coordless Place-lite would offer the problem back on the surface whose job is to fix it.
- **The free half answers below the min-chars floor.** The floor is a cost control and there is no cost on this side. That asymmetry is the clearest argument for modelling two corpora rather than one.

## What (4) turned out to cost, and the call

"Show unsaved Google results on our map" cannot be built on the Autocomplete relay at all: a prediction carries no coordinates. Three shapes, costed with the owner — Details-per-tap (one call per candidate, and free in the case that ends in an add), Details-per-result (N calls per typing pause, which ADR-0115 §2 called the opposite of dedup-before-spend), or **Text Search**, which returns coordinates with the results so every pin costs one call instead of N.

**The owner chose Text Search**, and the pin is to be **designed fresh** rather than inheriting the dashed "listed, not yet ours" mark. Both go into the same design session as the chrome, and the sequencing matters: results that are pins are visible at the map extreme, so (4) may reopen the stop this session just closed.
