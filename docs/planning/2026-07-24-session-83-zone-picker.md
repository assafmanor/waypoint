# Session 83 — the shared ZonePicker + settings swap (ADR-0113 slice 2)

**Date:** 2026-07-24
**Kind:** Feature slice — the second of three implementing ADR-0113.
**ADRs:** implements [0113](../decisions/0113-trip-destination-place-and-primary-timezone.md) §6 (one shared zone control); the same primitive backs the per-event zone chip ([0110](0110-maps-and-places-frontend-architecture.md) §3) when that lands.

## What shipped

- **`ui/primitives/ZonePicker`** (net-new) — the single "pick a zone" control for all three call sites (ADR-0113 §6). A searchable `Modal` sheet over **`Intl.supportedValuesOf('timeZone')`** — the runtime's complete IANA set, so there's no curated list to ship or age. Each row reads `City · GMT±N` (`zoneCity` + `zoneOffset`, the offset DST-correct for today via the app clock `getNow()`, ADR-0026); **relevant candidates surface first** (a "suggested" group = the device zone + the trip's place zones + the current value), with search matching city / full zone id / offset over the whole set, and a "no results" empty state. It's the sheet only — each call site owns its trigger. Exported `zoneLabel`/`zoneCity`/`zoneOffset` for triggers.
- **Trip settings swap** — the hardcoded 5-item `TZ_OPTIONS` `<select>` (Tokyo/Jerusalem/London/New York/UTC) is gone; the timezone field is now a select-shaped `.set-tz-trigger` button showing `zoneLabel(timezone)` + a caret, opening the `ZonePicker`. Suggested zones = the device zone + the trip's own place zones. `timezoneSchema` already accepted any IANA zone, so no validation change — only the UI widened from 5 zones to the full set (as ADR-0113 §6 called out). `TZ_OPTIONS` removed; `withCurrent` + `CURRENCY_OPTIONS` stay for the currency select.

## Notes

- The picker is the sheet; callers own triggers, so slice 3 (creation) and the later per-event zone chip drop in their own trigger and reuse this verbatim — one primitive, three call sites.
- Offset uses `getNow()` (not `new Date()`) per the repo's ADR-0026 clock rule (lint-enforced).

## Verification

`pnpm format` + `typecheck` + `build` green; frontend suite **700/700** (new `ZonePicker.test.tsx` — helpers + suggested-group + search + pick + empty state, 6 cases). Lint clean. No `TripSettings` test existed to update.

## Next

Slice 3 — the creation-flow destination picker (consumes `/destinations/*` from slice 1, sets the derived-default primary timezone inline, opens this `ZonePicker` for the multi-zone-country edit).
