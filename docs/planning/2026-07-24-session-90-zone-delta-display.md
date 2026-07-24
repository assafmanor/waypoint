# Session 90 — Zone display becomes a time-shift delta (+ Plan mode wired)

**Date:** 2026-07-24
**Kind:** Design revision of the multi-zone slice-2 display, from user feedback on the shipped build.
**ADRs:** revises [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) (session-90 amendment supersedes the session-89 `· city` label rule).

## Why

A screenshot of the shipped slice-2 row (a real trip, TLV → Reykjavik) showed the `· city` label was wrong twice over: the IANA city is **English** (`Atlantic/Reykjavik` → "Reykjavik") inside a Hebrew RTL row, and two city names + a range + `+1` **wrapped** in the narrow time cell. The reframe from the review: **what a traveler wants from a zone crossing is how far the clock jumps** — the time difference — not the zone's name.

## Change

The `· city` label is replaced by a **signed time-shift delta pill**, amber (a time concept):

- `🕐 +6 ש׳` (Tokyo 6h ahead), `🕐 −3 ש׳` (Reykjavik 3h behind), `🕐 +5:30` (fractional zones — the colon says "hours", no unit). Minus sign is `−`, never a hyphen or em dash.
- Sits **under** the numeric time, so the time cell stays clean and the English city name is gone (origin/destination identity is already in the Hebrew route title).
- **The shift is the signal, and it drives visibility:** for a crossing it's destination-clock − origin-clock; for a single-zone event it's that zone − the **day's ambient** zone. A **zero** shift shows nothing — single-zone trips stay bare, and two differently-named zones sharing an offset don't nag. (Subsumes the session-89 name-based suppression.)

**Plan mode is now wired too.** `PlanDay`'s `BuilderRow` and its `TransitionRow`s use the same per-day ambient (segment-at-noon), so both day surfaces read consistently. The **board hero** (`GlanceCard` now/next) is still deferred to slice 3 (its zone is the live-"now" context).

## Mechanics

- `lib/time.ts`: `zoneOffsetMinutes(at, zone)` (signed minutes, DST-correct) + `formatZoneDelta(minutes)` (the `H ש׳` / `H:MM` token).
- `lib/places.ts`: `eventZones → { startZone, endZone, deltaMinutes? }` and `eventEdgeZone → { zone, deltaMinutes? }` — `deltaMinutes` omitted when the shift is 0.
- `EventCard` / `TransitionRow` / `PlanDay`'s `BuilderRow` render the pill under the time when `deltaMinutes` is set; optional props, so single-zone trips + un-wired surfaces are unchanged.

## Direction set for slice 4 (authoring)

The user's model, confirmed here: **each time field is entered in its own endpoint's zone** — a flight's departure in origin (Tel Aviv) time, arrival in destination (Tokyo) time; a single-place event in its place's zone; a placeless one in its segment/primary zone. The delta + a per-field `🕐 city ▾` chip must show **in the add/edit forms** so the zone a typed time means is never ambiguous. That's slice 4 (the `zonedIso`-at-save switch from `trip.timezone` to the per-field zone, plus the §8 keep-wall-clock-on-place-attach edge).

## Verification

- `lib/time.test.ts`: `zoneOffsetMinutes` (Tokyo/Jerusalem/Reykjavik/NY/Kolkata) + `formatZoneDelta` (whole hours, fractional, minus sign).
- `lib/places.test.ts`: `eventZones`/`eventEdgeZone` return the right `deltaMinutes` (crossing = dest−origin; single = vs ambient; 0 → undefined).
- `EventCard.test.tsx`: no pill without `zones`; a crossing shows both times each in its zone + a `+6` pill + `+1`; zero shift shows no pill.
- `typecheck` + `lint` (0 errors) + `build` green; full frontend suite **732** passes; `pnpm format` clean.
