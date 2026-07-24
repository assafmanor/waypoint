# Session 88 — Multi-zone time model, slice 1 (data model + resolver)

**Date:** 2026-07-24
**Kind:** Foundation slice of the multi-zone display track — the `Event.displayTimezone` override field + the pure per-event zone resolver. No visible UI change yet.
**ADRs:** implements [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) (→ Accepted, building in slices) with §7's store-vs-derive resolved per [0110](../decisions/0110-maps-and-places-frontend-architecture.md) §94-99. Builds on the transport-as-places data (session 86) that gave every booking endpoint a real place + zone.

## Why now

The last data prerequisite landed in session 86 (transport endpoints are picked places with timezones). So the model can finally derive "which zone is this event shown in." This slice lays the foundation — the field and the derivation — with no rendering change, so it's a self-contained, fully-tested base for the display/now/chip slices.

## What shipped

**`Event.displayTimezone` — the manual-override slot (nullable).** Across `@waypoint/shared` (`tripEventSchema` + the event field schema), `schema.prisma` + migration `20260724170000_event_display_timezone_adr0107`, `toEventDto`, and `EventsService` create/update passthrough. Per ADR-0110 §94-99 it is an **override, not a cache**: null trusts the derived zone; non-null is a user-pinned zone. Its only writer is the zone chip (slice 4) — so this slice keeps the **input schema plain-optional** (matching the entity); slice 4 widens it to nullable to clear an override.

**The resolver (`lib/places.ts`) — pure, clock-free, unit-tested:**

- `tripZoneCrossings(events, bookings, places)` → the trip's zone crossings in departure order. A transport-linked event whose `fromPlace`/`toPlace` zones are both known **and differ** makes a crossing at its departure instant. Same-zone or coordless hops make none.
- `segmentZoneAt(instantMs, crossings)` → the itinerary-segment zone at an instant (ADR-0107 §3 step 2): the origin zone before the first crossing, the destination zone at/after each crossing (so a mid-flight instant reads the destination, §8). Undefined when nothing anchors the timeline.
- `eventDisplayZones(event, { bookings, places, crossings, primaryZone })` → `{ start, end }`. Priority: **override > attached place** (transport renders start in `fromPlace`, end in `toPlace`; any other place drives both ends) **> itinerary segment > trip primary zone**. `start`/`end` differ only for zone-crossing transport.

## Scope / caveats

- **No display wiring.** `formatTime`/day-framing still use `trip.timezone` at their call sites — threading the resolver in is slice 2, which also brings the non-trivial-chip suppression rule (a zone label shows only when it differs from the ambient zone of its context).
- **Override for both ends.** A `displayTimezone` pin applies to the whole event; the per-leg transport override (two chips, one field) is a slice-4 concern.
- The now/next engine and stored UTC instants are untouched (instants are absolute, ADR-0018).

## Verification

- `lib/places.test.ts`: `tripZoneCrossings` (differ → crossing; same-zone/coordless → none; sort), `segmentZoneAt` (origin/destination/none), `eventDisplayZones` (override wins; transport split; single place; placeless segment before/after; primary fallback; coordless place) — 13 new cases, 27/27 in file.
- Backend `events.service.spec`: `displayTimezone` persists on create + update (CI-only, needs Postgres).
- `typecheck` + `lint` (0 errors) + `build` green across shared/backend/frontend; full frontend suite **719** passes; `pnpm format` clean.
