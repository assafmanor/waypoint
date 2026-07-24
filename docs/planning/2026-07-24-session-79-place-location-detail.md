# Session 79 — place location on detail/card surfaces: navigate + view

**Date:** 2026-07-24
**Kind:** Feature follow-up on Phase 2 (session 78), from user feedback on two screenshots.
**ADRs:** amends [0109](../decisions/0109-map-tab-design.md) (new 2026-07-24 amendment); upholds [0106](../decisions/0106-maps-and-places-epic-scope-and-phasing.md) §F (turn-by-turn always deep-links out).

## Feedback

Two requests on the shipped Phase-2 surfaces:

1. **Booking detail** should show the **location like the rest of the details**, with options to **navigate** and **show on maps**.
2. **Events** should also have an **open-on-maps** option (they only had `ניווט`/directions).

Plus an architectural note from the user: once we have our own map view (Phase 3/6), the **view** action should open **our** in-app map, not Google — so the current Google view-link is temporary.

## Changes

- **Two labelled location actions** everywhere a place appears: `ניווט` (directions) + `מפה` (view). Labelled, so this is _not_ the unlabelled eye/compass glyph pair ADR-0109 §1 rejected — see the amendment. `מפה` kept to one word so the pair stays compact in the crowded `EventCard` row (user flagged "הצג במפה" as too long).
- **`lib/places.ts`:** added the view peers `mapsPlaceUrl` consumers — `eventPlaceUrl` / `bookingPlaceUrl` — alongside the existing directions helpers. All still return `null` for a coordless Place-lite.
- **`EventCard`:** new `onShowOnMap?` callback; a shared `mapActs` fragment renders `ניווט` + `מפה` in all three phase branches (each gated on its handler). `DayView` feeds both via `navigateHandler` / `showOnMapHandler`.
- **`BookingDetail`:** removed the Phase-2 top-actions `ניווט` link; the place is now a **`מיקום` detail row** (`LocationFact`) showing the name/address with the two teal links beneath, matching the other facts. Value = `address ?? name`; the row is skipped when there's neither a map link nor an address to add. `.bk-head` padding reverted (top actions are edit-only again).
- **Copy:** `t.actions.showOnMap = 'מפה'`; `t.index.detail.location = 'מיקום'`.

## Interim: `מפה` → Google is a stopgap (TODO phase-3)

Recorded per the founding principle so it isn't silently permanent:

- **`ניווט` (directions)** deep-links to Google Maps **forever** — we never rebuild turn-by-turn (ADR-0106 §F).
- **`מפה` (view)** deep-links to the Google Maps place view **only until the Map tab (Phase 3) exists**; then it should focus our in-app map on the place. Tagged `TODO(phase-3)` on `mapsPlaceUrl` in `lib/places.ts`, captured in the ADR-0109 amendment and a backlog line.

## Verification

`pnpm format` + `typecheck` + `build` green; frontend suite green (added `eventPlaceUrl`/`bookingPlaceUrl` cases to `lib/places.test.ts`; `EventCard` tests for the `מפה` button + both-buttons-drop-when-no-location). Lint clean. Backend unaffected.
