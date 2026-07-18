# Session 37 — Glance transition markers de-cluttered + flights read as a route on the hero

**Date:** 2026-07-18
**Branch:** `claude/glance-timeline-layout-guv3ao`
**Touches:** ADR-0054 (amendment — marker layout), ADR-0059 §3 (shared route grammar extended to the board hero)

## What prompted it

Assaf's on-the-ground screenshot of "היום במבט" showed three separate problems:

1. **Transition markers collide.** A flight's departure + arrival (or a hotel's check-in/out) close in time drew their amber chips on top of each other, and a chip near the rail edge clipped off-screen. The dedicated marker lane (ADR-0054 amendment) kept labels off the _blocks_ but never handled markers colliding with _each other_ or running past the rail edge.
2. **A flight doesn't read as a route on the hero.** The board hero showed the flight event's _title_ (a name), not its origin→destination — even though the Index row and the booking detail already read as `from → to` (ADR-0059 §3 shared grammar).
3. **A flight doesn't need a name — just from/to.** Same root cause as (2): the hero wasn't on the shared route grammar.

## What changed (frontend + derivation only, no data-model/backend change)

### Markers (issue 1) — `lib/glance.ts` + `Home.tsx` + `screens.css`

- **Transition instants now fold into the window bounds.** `buildDayGlance` derives `bookingTransitionsOnDate` _before_ the window math and includes each transition's `atMs` in `windowStart/EndMs`. An **ambient** booking (an overnight flight, a hotel) contributes no counted block to stretch the window, so a late-night departure/arrival marker used to land past `frac 1` and clip. Its instant is now always inside `[0,1]`.
- **A day carrying only a transition marker is no longer "empty".** A hotel whose check-out lands on a day with no other events previously read as empty and silently dropped the marker.
- **Colliding chips stack into lanes.** New pure `assignMarkerLanes` (width-independent, `MARKER_MIN_GAP_FRAC = 0.28`) puts each marker in the lowest lane whose last chip is far enough away, else a new lane. `GlanceMarker.lane` + `DayGlance.markerLaneCount` drive the render; the CSS sizes the lane band from `--lanes`, lifts each chip by `--lane`, and grows the stem so every chip still connects to the bar.
- **Edge chips anchor inward.** `markerAnchor(frac)` tags a chip near either rail edge `at-start` / `at-end`; the CSS zero-width flex box then anchors the chip's edge to the point and lets it extend inward, so it can't clip. The old direction-sensitive `translateX(50%)` centering (a likely cause of the observed clip) is gone.

### Flight route on the hero (issues 2 & 3) — shared grammar

- **`lib/places.ts` `eventRoute(event, bookings, places)`** — the single derivation that resolves a transport-linked event to its `{from, to}` place names (or `null` → fall back to the title). Keys on `categoryForBookingType(booking.type) === 'transport'`, so it generalizes past flight/train.
- **`ui/RouteLabel.tsx`** — `RouteLabel` lifted out of `BookingDetail.tsx` into its own shared component (Index + detail + hero now import the one component).
- **`ui/EventTitle.tsx`** — renders an event's board/timeline label: a route for a transport booking, the title otherwise. Applied to every hero title site in `Home.tsx` (NOW, NEXT, in-transit, group-split, also-now).
- **In-transit progress ends** now read `time · from` / `to · time` with the countdown in the middle (replacing a redundant double end-time), matching `booking-presentation-v1.html`.

## Verification

- `pnpm --filter @waypoint/frontend typecheck` + `test` (369 pass, incl. new `places.test.ts` and glance lane/window/empty tests) + `build` all green; `pnpm format` + lint clean (only pre-existing warnings).
- Rendered the real `screens.css` against the actual DOM (headless Chromium): the red-eye's two close markers stack cleanly, edge markers stay on the rail, and the hero (NEXT + in-transit) reads `נתב״ג ← נריטה` with the progress ends anchored by place.
