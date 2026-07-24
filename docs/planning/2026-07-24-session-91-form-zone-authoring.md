# Session 91 — Per-endpoint form zone authoring (slice 4a)

**Date:** 2026-07-24
**Kind:** Frontend correctness fix — the booking form now enters each time in its own endpoint's zone, so the form and the day view agree.
**ADRs:** implements [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) §2 (authoring default) — slice 4a. Follows the session-90 view redesign.

## The bug (from a real screenshot)

A TLV → Keflavik flight entered as arrival **14:00** showed **14:00** in the booking form but **11:00** on the day view. The form read/wrote **every** time in `trip.timezone` (Israel), while the day view (session 90) renders the arrival in the **destination** zone. 14:00 Israel = 11:00 Keflavik — same instant, two displays, and the form gave no hint which zone you were typing in.

## Fix

**Each time field is entered and read in its own endpoint's zone** (ADR-0107 §2):

- **Transport:** departure in the origin (`fromPlace`) zone, arrival in the destination (`toPlace`) zone.
- **Single-place booking:** in its place's zone.
- Fallback to the trip primary zone when no place resolves a zone.

So the form now shows the arrival as **11:00** (Keflavik) — matching the day view — and a read-only **`ZoneNote`** under the schedule spells it out: `🛫 שעון Ben Gurion · 🛬 שעון Keflavik · −3`, so which zone a typed time means is never ambiguous.

## Mechanics

- `lib/places.ts`: `placeTimezone(places, placeId)` is now **exported** (was the private `placeZone`) — the form's per-endpoint zone lookup.
- `lib/booking-edit.ts`: `buildSpanSeed(input, timeZone, endTimeZone = timeZone)` — the end leg resolves in `endTimeZone`, so a cross-zone flight's arrival lands on the right instant. A single-zone span (hotel) is unchanged (endTimeZone defaults to timeZone).
- `ui/primitives/WhenField.tsx`: `WhenSpan` gained an optional `endTimeZone`, used only for the elapsed-duration read-out so it's correct across a crossing (6h45, not the 3h45 the raw wall-clocks suggest). Reduces to today's behaviour when omitted.
- `ui/BookingSheet.tsx`: resolves live `startZone`/`endZone` from the current picks; threads them through the initial read (`isoToTimeInput`/`isoToDateTimeLocal`), the end-before-start check, and `buildSpanSeed`/`buildEventSeed` at save; passes `timeZone`/`endTimeZone` to the span `WhenField`; renders `ZoneNote`. Changing a pick keeps the typed wall-clock and re-interprets it in the new zone on save (§8).

## Scope / caveats

- **No editable override chip yet** (slice 4b): the zone is derived from the picked place and shown read-only. Choosing a zone for a **placeless** event (writing `displayTimezone`) is 4b.
- The `ZoneNote` shows only when it's non-trivial — a zone crossing, or a single-place zone differing from the trip primary — so a single-zone trip's form stays bare.
- Deferred, filed to backlog: **duration on zone-shifted view rows** + **long-name clamp** (near-term view polish), and a **place nickname** (Google has no short-name field for a POI).

## Verification

- `lib/booking-edit.test.ts`: `buildSpanSeed` resolves each leg in its own zone (07:15 IDT + 11:00 GMT → the right instants, 6h45 elapsed); single-zone default unchanged.
- `ui/BookingSheet.test.tsx`: a cross-zone flight renders the `ZoneNote` with both zone cities + the `+6` shift (queried via the document, since the sheet is a Modal portal).
- `typecheck` + `lint` (0 errors) + `build` green; full frontend suite **734** passes; `pnpm format` clean.
