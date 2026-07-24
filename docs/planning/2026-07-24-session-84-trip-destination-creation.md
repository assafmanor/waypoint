# Session 84 — the creation-flow destination picker (ADR-0113 slice 3, completes it)

**Date:** 2026-07-24
**Kind:** Feature slice — the third and final slice of ADR-0113.
**ADRs:** completes [0113](../decisions/0113-trip-destination-place-and-primary-timezone.md) (§1/§2/§5); consumes slice 1's `/destinations/*` + slice 2's `ZonePicker`.

## What shipped

Trip creation's free-text destination is now a Google Places pick that sets a real primary timezone — the end-to-end payoff of the timezone track's foundation.

- **`lib/api.ts`** — `searchDestinations` + `resolveDestination` calling the trip-agnostic `/destinations/*` endpoints (slice 1).
- **`lib/useDestinationSearch.ts`** — a lighter creation-time counterpart to `usePlaceSearch` (ADR-0113 §consequences left the build choice open): session token + pause-gated debounce (the ADR-0108 §1 cost discipline) but **no trip, no snapshot dedup, no persistence, no outbox** — there's no trip yet at creation. A dedicated hook rather than generalizing `usePlaceSearch` (that would have meant injecting both a search fn and a no-persist mode for little gain).
- **`ui/DestinationPicker.tsx`** — a trigger + search sheet (reusing PlacePicker's `.pp-*` styling and the shared `Modal`) that resolves a destination into `{ name, googlePlaceId?, lat?, lng?, countryCode?, timezone?, candidateZones? }`. A **"use as typed"** fallback keeps creation unblocked when Google returns nothing useful (name only; zone stays the device default).
- **`CreateTrip`** — the destination `<input>` is replaced by `DestinationPicker`. A pick sets the display name + structured fields + the **derived-default primary timezone**, shown inline as a tappable `🕓 City · GMT±N` chip (opens the shared `ZonePicker`, suggested = device + `candidateZones`). A **multi-zone country** additionally shows the soft "spans several zones" note. `createTrip` now sends `destinationGooglePlaceId`/`Lat`/`Lng`/`CountryCode` + the chosen `timezone` (was hardcoded to the device zone). Minimal creation preserved (ADR-0032): still one destination field, timezone a derived editable default, never a required step.

## Notes

- One primitive, three call sites realized: the `ZonePicker` (slice 2) now backs both settings and creation; the per-event zone chip (ADR-0110 §3) is the third, when the multi-zone display layer lands.
- Origin stays derived from the outbound flight (ADR-0107 §3/§5), not stored. Currency-from-country still deferred.

## Verification

`pnpm format` + `typecheck` + `build` green; frontend suite **705/705** (added `api.test` destination cases + a `DestinationPicker.test` mocking the search hook — trigger label, resolve-and-report, use-as-typed). Lint clean.

## Track status

ADR-0113 is **fully implemented**. The multi-zone timezone workstream continues with **transport-as-places** (enrich flight/train endpoints) and then the **ADR-0107 display layer** (per-event sticky zones + the zone chip) — which also unlocks the richer `<time> · <what>` Map-row meta deferred earlier.
