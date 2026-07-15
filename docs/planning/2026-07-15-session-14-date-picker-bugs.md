# 2026-07-15 · Session 14 — Date-picker bugs

**Outcome:** Four date-input fixes across trip creation and the event form. No ADR — these are bug fixes, not new decisions; they tighten existing behavior (`createTripSchema`, ADR-0032 creation form, ADR-0011/T-047 event form). Implemented on `claude/date-picker-bugs-1e2to1`.

## Problems (reported)

1. **Past dates on trip creation** — `/new` let you pick a start/end that had already gone by.
2. **Out-of-range event dates** — the event form's date input wasn't bound to the trip's `[startDate, endDate]`, so events could land outside the trip.
3. **mm/dd/yyyy on the native date input** — Chromium formats `<input type="date">` by the browser's _UI language_, not the document `lang="he"`, so an Israeli device on an English browser showed U.S. order.
4. **Edge cases** — the end-date picker didn't floor to the chosen start; the `endDate ≥ startDate` rule lived only in the client (bypassable); a typed value could sit outside a native `min`/`max`.

## Fixes

- **Past dates (1):** `CreateTrip` derives device-local `today` (`todayInTz` + `getNow`) and sets `min={today}` on start, `min={startDate || today}` on end. A start/end before today flags `datesInvalid` and shows a new `datePast` message. A trip already under way (start ≤ today ≤ end) is still allowed.
- **Out-of-range (2):** `EventForm`'s date input gets `min={trip.startDate}` / `max={trip.endDate}`, plus a submit-time guard (`date < startDate || date > endDate` → `dateOutOfRange`) since a typed value can bypass the native bounds. Overnight events on the last day still file under that day (ADR-0037), so the max is `endDate` inclusive.
- **Format (3):** new `DEVICE_LOCALE` constant (`Intl.DateTimeFormat().resolvedOptions().locale`); pinned as `lang` on every `<input type="date">`, mirroring TimePicker's `lang` on native time inputs. The input now renders in the device's own convention.
- **Edge cases (4):** `createTripSchema` gains a `.refine(endDate ≥ startDate)` so client and server reject an inverted range identically (ADR-0023 pattern, matching `createEventSchema`); the end picker's `min` links to the chosen start.

## Files

- `packages/shared/src/schemas.ts` — `createTripSchema` → `.refine` (now a `ZodEffects`, same shape as `createEventSchema`; backend `createZodDto`/`ZodValidationPipe` unaffected).
- `frontend/src/constants.ts` — `DEVICE_LOCALE`.
- `frontend/src/screens/CreateTrip.tsx` — today floor, past-date guard, `min`/`lang` on inputs.
- `frontend/src/ui/EventForm.tsx` — `min`/`max`/`lang` on the date input + range guard.
- `frontend/src/i18n/he.ts` — `newTrip.datePast`, `eventForm.dateOutOfRange`.

## Notes / deferred

- Past-date prevention on trip creation is a **client UX guard** (min attr + disabled CTA), not a schema rule: the shared schema has no "now" and a trip legitimately starting yesterday-but-ongoing shouldn't be rejected server-side.
- Native `<input type="date">` `lang` formatting is honored by Chromium (the phone-primary target); Firefox/Safari follow OS locale regardless — acceptable, and still device-driven.
