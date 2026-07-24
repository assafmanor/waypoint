# Session 97 — The hero and the glance read per-event zones; the shift pill becomes one component

**Date:** 2026-07-24
**Kind:** Implementation slice (finishes the multi-zone **read** surfaces) + one extraction.
**ADRs:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) (slice 3b, recorded in the status line), [0096](../decisions/0096-per-domain-claude-md-guides.md) (reuse before adding).

## What this closes

Sessions 89–96 made the day timelines and the live clock zone-correct, but Home was still painting **every** time in one zone — the departure-board hero and the day-at-a-glance rail both took a single `tz`. On a zone-crossing trip that is exactly where it shows worst: a flight in the air drew its departure and its landing on the same clock, so a 6h45 flight read as 3h45.

Every read surface now renders each event in **its own** display zones (ADR-0107 §2-3, sticky display), with the amber shift pill where the two clocks meet.

## What shipped

**1. The board (`Board` + `Home`).** Each slot resolves its own zones through the shared `eventZones`:

- **in-transit** — departure in the origin's zone, landing in the destination's, with the shift pill at the **destination end of the progress rail**, where the two times are read together. That placement is the point: the pill has to sit where the misreading would happen, not on a separate meta line.
- **next** — in the zone of the instant it shows, and correctly the **end** zone when the next item is a check-out (an end transition `deriveNow` can't surface).
- **now / also-now / group-split rows** — the "until" end time in that event's end zone.

The board's ambient — what a shift is measured _against_ — is the **live** zone (`currentZone`), because the board is where you are standing right now.

**2. The glance rail (`buildDayGlance` + `GlanceCard`).** `buildDayGlance` takes an optional `ZoneContext`; each anchor then carries its own zone(s) and delta (`zones` on a span, `zone`/`deltaMinutes` on a point). Three consequences worth naming:

- The span anchor's **"+1" is now decided per-zone** (`crossesMidnightZoned`). A 3h westbound hop leaving 23:00 Jerusalem lands 23:00 Reykjavik — the same local day — and no longer gets a false next-day marker it would earn if both ends were painted in the origin's clock.
- The glance measures shifts against the **day's** ambient zone, not the live zone. It is a day surface: keying it to the live zone would put a pill on every anchor of a day you are merely browsing.
- Passing no context leaves every anchor zone-less and the card renders exactly as before, so nothing had to migrate at once.

`GlanceCard`'s two renderings of an anchor (the positioned band and the collapsed legs line) were duplicated markup; they now share one `AnchorPill`, so they cannot disagree about the same anchor. A test asserts their text is identical.

**3. The shift pill is one component (`ui/ZoneShiftPill`).** It had been copy-pasted onto three surfaces — `.wp-event-tzdelta`, `.tr-tzdelta`, `.bld-tzdelta`, identical but for half a pixel of font-size — and the board plus the glance would have made five. One component + one CSS rule now; surfaces pass `className` for their own spacing, the dark board passes `on-dark` (the one place the amber wash has to invert), and inside an amber anchor pill it drops to a bordered token so a wash doesn't sit on a wash. This is the ADR-0096 rule applied before the copies piled up, not after.

**4. `dayAmbientZone(date, crossings, primaryZone)` (`lib/places.ts`).** "The zone this day is framed in" was being computed inline in `DayView` and about to be copied into `Home`. It is now one function beside `currentZone` — the two are easy to confuse and now sit together, documented as _where the day is_ vs _where you are_. Its noon sample is the named `DAY_NOON`, shared with the day heading's weekday label.

**5. Place names on the board shorten** (`shortPlaceLabel`), like every other glanceable surface since session 95 — the in-transit rail's origin/destination were still full official names.

## Verification

- `ui/ZoneShiftPill.test.tsx` (3): signed LTR rendering + the shift title; a real minus sign, never a hyphen; the base class survives a surface class (and a fractional zone keeps its minutes).
- `ui/domain/Board.test.tsx` (+3): the in-transit shift sits at the destination end and the origin end stays bare (stated once, not per end); the next slot carries its own shift and a single-zone next carries none; the now slot + the also-now rows carry theirs.
- `ui/domain/GlanceCard.test.tsx` (+4): a crossing span renders `09:00` Jerusalem → `23:00` Tokyo with `+6`; a point anchor renders in its edge zone (15:00 Tokyo → 08:00 Paris) with `−7`; a zone-less anchor stays in the card zone with no pill; the band and the legs line render byte-identical pill text.
- `lib/glance.test.ts` (+4): both ends' zones + the shift attach to a crossing span; no context → `zones` undefined (un-wired callers unchanged); the per-zone "+1" (zoned `false` vs flat `true` on the same event); a point anchor's edge zone + its shift vs the day ambient.
- `lib/places.test.ts` (+4): `dayAmbientZone` frames a pre-crossing day in the origin and a later day in the destination; noon sampling keeps a 23:00 crossing's own day on the origin; primary-zone fallback; and the one that states the distinction — mid-flight `currentZone` is Tokyo while `dayAmbientZone` is still Jerusalem.
- Full frontend suite **786** passes (81 files); `typecheck` + `lint` (0 errors) + `build` green; `pnpm format` clean.

## Still open

**Slice 4b** — the editable zone chip (`WhenField`/`TimeField`'s `🕐 HH:MM · city ▾` → the shared `ZonePicker`) writing the `displayTimezone` override for placeless events, with the schema widened to nullable so the override can be cleared back to derived (ADR-0107 §6). That is the last slice of the model, and the only remaining one that writes.
