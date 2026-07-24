# Session 98 — Slice 4b: the editable zone chip and the `displayTimezone` override writer

**Date:** 2026-07-24
**Kind:** Implementation slice (the last of ADR-0107, and the only one that writes).
**ADRs:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) §6-7 (slice 4b, recorded in the status line), [0110](../decisions/0110-maps-and-places-frontend-architecture.md) §94-99 (override, not cache), [0113](../decisions/0113-trip-destination-place-and-primary-timezone.md) §6 (the shared `ZonePicker` this reuses).

## What this closes

ADR-0107 §6: **"the resolved zone is always a visible, editable field."** Until now the zone was inferred and silent — and `EventForm` didn't even use the inference: it read and wrote every event in `trip.timezone`, so a pre-departure event on a multi-zone trip was authored in the destination's clock. Slice 4a fixed exactly this for bookings; this is the event half, plus the correction the ADR asks for.

## What shipped

**1. `EventForm` authors in the event's resolved zone.** Same priority the day view renders by (override > place > itinerary segment > trip primary), so the form and the view finally agree for events as they already do for bookings. An existing event's times are read back in that zone too.

Resolving a _placeless_ event's zone needs its segment, which needs an instant, which needs a zone. The form resolves twice: once interpreting the typed time in the trip primary, then again in the zone that produced. Two passes reach the fixed point everywhere except a time sitting within a few hours of a crossing — documented at the call site rather than pretended away.

**2. `ui/primitives/ZoneChip`** — states the zone under the time fields (`🕐 Tokyo · GMT+9 ▾`) and opens the **shared `ZonePicker`** (ADR-0113 §6) on tap. Mounted through a new optional `zone` prop on `WhenField`'s day variant, so it arrives via the "when" standard rather than beside it. Suggested zones are the ones the trip actually touches (its places' zones + its primary), not the raw IANA list.

It is **read-only when a place is picked**: a placed event's zone follows its place, and correcting it there is the honest edit (§3). The override exists for the placeless case, where only the segment/primary fallback would otherwise decide.

**3. A pick is an override, not a cache** (ADR-0110 §94-99). Picking writes `displayTimezone`; the reset (`חזרה לאזור אוטומטי`) writes **`null`**, handing the event back to the derivation — so adding the outbound flight later still re-orients an un-pinned time. Three states, three wire values, and the distinction is load-bearing:

| chip state | sent               | meaning                                                           |
| ---------- | ------------------ | ----------------------------------------------------------------- |
| untouched  | _(absent)_         | leave it alone — never freeze today's derived zone onto the event |
| picked     | `"Asia/Jerusalem"` | pinned, honoured forever                                          |
| reset      | `null`             | clear, go back to derived                                         |

Changing the zone keeps the typed **wall-clock** and re-interprets it on save (§8: you meant the time _there_) — the same rule slice 4a applied to a changed place pick.

**4. `displayTimezone` widened to `timezoneSchema.nullish()`** (`packages/shared`). Nullable so the reset has a representation an absent key can't express, and validated as a real IANA zone now that a user picks it — a bad value is a 400 at the edge instead of a `RangeError` deep inside `Intl.DateTimeFormat` on the next render. The backend already passed the field through on create/update; a spec now pins that `null` clears and an absent key doesn't.

**5. One coercion for every clearable field.** `null` on the wire has to become `undefined` locally (entity types use `undefined` for absent), and this was the trip-destination bug from ADR-0113 all over again. Rather than a second one-off: `coerceTripPatch` generalized into **`coerceClearedFields<T>`**, and applied **inside `applyToRow`** — the one merge every cached entity goes through — so no entity's cleared field can persist a `null` the schema rejects on the next cold load. The optimistic event dispatch in `verbs.ts` routes through it too. `coerceTripPatch` survives as a bound alias, so the trip call sites are untouched.

Also threaded so a created event keeps its zone: `toCreateEventInput` was silently dropping `displayTimezone`, and `ScheduleFields` (schedule-from-the-shelf) now carries it.

## Verification

- `ui/primitives/ZoneChip.test.tsx` (5): a city label rather than a raw IANA id; a pick writes the zone; the reset appears **only** while pinned and sends `null` (not the derived zone); read-only without `onChange`; the pinned marker.
- `ui/EventForm.test.tsx` (+6, a `the zone chip` block): states the trip primary when nothing anchors the event; states the **segment** zone for a time before the outbound crossing; a pick pins and saves the override; the typed `09:00` is interpreted in the **picked** zone (`06:00Z`, not re-rendered as another Tokyo time); an existing override reads back pinned with its `09:00` and the reset patches `displayTimezone: null`; an untouched chip sends nothing at all.
- `ui/primitives/WhenField.test.tsx` (+1): the chip appears only when a `zone` is passed, and is a statement (no button) without an `onChange`.
- `lib/cache.test.ts` (+1): a cleared **event** field caches as `undefined`, not `null` — the generalization, pinned by a test that would have failed before it.
- `backend/src/events/events.service.spec.ts` (+1): `null` clears the override; an absent key leaves it.
- Frontend suite **781** passes (81 files); `typecheck` + `lint` (0 errors) + `build` green; `pnpm format` clean. Backend integration specs run in CI (no local Postgres).

## Where ADR-0107 stands

Every slice of the multi-zone model is now built except the board hero's per-event zones (shipped in parallel as session 97). The three roles the ADR separated are all real: authoring (4a bookings, 4b events + the chip), sticky display (2, 3b), and the live "now" (3).
