# Session 93 — Flight/zone-crossing view legibility: duration + long-name clamp

**Date:** 2026-07-24
**Kind:** Frontend display polish on the day timelines, from user feedback.
**ADRs:** implements the "view legibility" item under [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md); duration ladder per [0084](../decisions/0084-booking-duration-display.md)/[0114](../decisions/0114-elapsed-duration-ladder.md).

## Why

With a zone shift, the day-view row's raw range misreads the real span: a flight `07:15 → 11:00` with a `−3` shift looks like 3h45 but is actually 6h45. And a long route title (two full airport names) blew the card up across several lines.

## Change

- **Duration on the row.** `EventCard` (Trip mode) and `BuilderRow` (Plan mode) gain a `duration?` label, shown on a meta line with the shift pill under the time. The screen passes it via `eventDurationLabel(event, booking, zones)` (`lib/places.ts`), which shows a duration when the event is **transport** (always — travelers want the flight length) or carries a **zone shift** (its raw times can misread), and otherwise omits it (a same-zone event's range is self-evident). Instant-based, so zone-independent; phrased per the event's category unit (`hours` for transport, ADR-0084).
- **Long-title clamp.** `EventCard`'s title is wrapped in `.wp-event-title-txt` and clamped to two lines (`-webkit-line-clamp`) with an ellipsis, so a route name like `נמל התעופה בן גוריון ← נמל התעופה הבינלאומי קפלאוויק` can't blow up the card. The hard/soft tag is a sibling flex child, so it's never clipped — it flows to the next line when the title is long. Short titles are unaffected.

## Mechanics

- `lib/places.ts`: `eventDurationLabel(...)` + exported `isTransportBooking(...)`; imports `formatDuration` (`lib/duration`) + `eventDurationUnit` (`@waypoint/shared`).
- `EventCard`/`BuilderRow`: `duration?` prop; a `.wp-event-timemeta` / `.bld-timemeta` row holds `[duration][shift pill]`, right-aligned under the time.

## Scope

- The **board hero** (`GlanceCard` now/next) is still on the single trip zone — its zone (and any duration there) is the live-"now" context, so it lands with slice 3.
- The **place nickname** (short local labels for long names) stays deferred — Google has no POI short-name field; the clamp is the interim guard.

## Verification

- `lib/places.test.ts`: `eventDurationLabel` shows for transport + zone-shifted rows, omits for a same-zone non-transport row and when there's no start+end span.
- `ui/domain/EventCard.test.tsx`: the duration label renders when passed.
- `typecheck` + `lint` (0 errors) + `build` green; full frontend suite **750** passes; `pnpm format` clean.
