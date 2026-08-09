# Session 234 — a date reads day-first, wherever you open the app

**Date:** 2026-08-09
**Outcome:** [ADR-0176](../decisions/0176-a-date-reads-day-first-wherever-you-open-it.md) accepted and built. Session 14's `DEVICE_LOCALE` fix **reversed**; [ADR-0039](../decisions/0039-trip-settings-admin-governed-data-plane.md) §4 and [`architecture/app-shell.md`](../architecture/app-shell.md) amended in place.
**Branch:** `claude/date-format-localization-07tz2o`.

## What the owner reported

A screenshot of the booking sheet's check-in step, with:

> "Event and booking forms (possibly also in other places, seek everything) format dates in mm/dd/yyyy, which isn't the standard in Hebrew and not the app standard … Fix this, keep this locale aware as well as the other app dates areas."

The screenshot reads `08/09/2026` for August 9th — the day the screenshot was taken, in a form whose every other number is Hebrew-ordered.

## Why the obvious fix would not have fixed it

`<input type="date">` is formatted by the platform. Session 14 already met this and pinned the input's `lang` to a new `DEVICE_LOCALE`, so the field would render "in the device's own convention". So the one-line answer available today was `lang="he-IL"` — and it would have closed the report without changing the reporter's screen: **Chromium honours `lang` on a date input; WebKit ignores it and follows the OS region.** The screenshot is an iPhone.

That is what pushed the fix from an attribute to a primitive. `DateField` draws the value itself (`formatDayMonthYear`, off the one app locale) and keeps the real `<input type="date">` underneath at `opacity: 0` — tappable, focusable, bounded, testable — swapping back in on focus, where the segments have to be editable and where the platform's picker owns the screen anyway. The full reasoning, and the four alternatives, are in the ADR.

## "Seek everything" — what the sweep found

The report guessed there was more, and there was. None of it was reachable from the reported screen, and none of it had a failing test:

| Where                                  | What it drew                                                  |
| -------------------------------------- | ------------------------------------------------------------- |
| `CreateTrip`'s birth board, first flap | `09.12` for a September 12th departure — an ISO string sliced |
| `BookingDetail` ×2 / `EventDetail` ×1  | the raw `2026-09-11` whenever the row had no clock            |
| `App.tsx`'s day strip                  | the weekday letter, trip-zone formatter over a UTC midnight   |
| `DayView` + `PlanDay`                  | the same weekday formatter, twice, byte-identical             |
| 13 sites                               | bare `'he-IL'` / `'en-US'` literals with no name behind them  |

The day-strip one is a real bug for any trip west of UTC (every pill named the day before) and had no report — it surfaced only because the two duplicate formatters were being collapsed into one.

## What moved

- `constants.ts` — `APP_LOCALE` in, `DEVICE_LOCALE` out.
- `ui/primitives/DateField.tsx` + `date-field.css` (+ test) — the new primitive; six hand-rolled date inputs (creation ×2, settings ×2, `WhenField` ×2) now call it.
- `lib/time.ts` — `formatDayMonthYear`, `formatDayDate`, `formatDayTime` (moved out of `ui/BookingDetail`), `weekdayName`, `weekdayLetter`.
- Chrome moved from the input to the box: `field.css`, `App.css`, `screens.css`, `when-field.css`, `form-errors.css` (`.df` joins the marked controls; `:focus-within` where the box is styled).
- Five specs updated to address the input inside the box — including the birth-board one, which had been **asserting** `09.12`.

## Not done, deliberately

`en-CA` / `en-US` inside `lib/time.ts` stay: they are the ISO-day trick behind `todayInTz` and a parts/offset probe, not display. Renaming them to the app locale would change what they return.
