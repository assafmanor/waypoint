# 0176 — A date reads **day-first**, wherever you open the app

**Status:** Accepted and built (session 234, 2026-08-09) — **§2 amended in place 2026-08-11** (session 250, field reports #36/#38): the face steps aside for a keystroke rather than for focus, and a date the platform reports as empty is a cancellation
**Date:** 2026-08-09
**Session note:** [`planning/2026-08-09-session-234-a-date-reads-day-first.md`](../planning/2026-08-09-session-234-a-date-reads-day-first.md), amended by [`planning/2026-08-11-session-250-the-one-date-control-under-a-real-device.md`](../planning/2026-08-11-session-250-the-one-date-control-under-a-real-device.md)

**Reverses:** [`planning/2026-07-15-session-14-date-picker-bugs.md`](../planning/2026-07-15-session-14-date-picker-bugs.md) §3's fix — the `DEVICE_LOCALE` constant pinned as `lang` on every native date input. That session's other three fixes (the `min`/`max` floors, the out-of-range guard, the server-side range rule) stand untouched; only the choice of _whose_ convention formats a date is reversed.
**Relates:** [0009](0009-docs-english-ui-hebrew.md) (the UI is Hebrew, the docs are English — the premise this rests on), [0083](0083-whenfield-datetime-standard.md) (the WhenField standard whose native date field this keeps), [0118](0118-numbers-in-hebrew-bidi.md) (a numeric run in an RTL flow), [0150](0150-a-form-refuses-in-place.md) (the refusal mark now rides the box), [0039](0039-trip-settings-admin-governed-data-plane.md) §4 and [`architecture/app-shell.md`](../architecture/app-shell.md) (both amended in place), [0028](0028-design-language.md), [0096](0096-domain-claude-md-files.md) (rule 8 — six copies became one primitive)

## Context

Owner report, with a screenshot of the booking sheet: the check-in date read **`08/09/2026`** for August 9th. Hebrew reads a date day-first (`09.08.2026`), and so does every other date the app draws — `formatTripDates` has printed `DD.MM` off one `he-IL` formatter since it consolidated four drifted copies. The form was the one surface disagreeing with the rest of the app.

The cause is that the form's date is a native `<input type="date">`, and **the platform formats it, not the page**. Session 14 hit this and answered it with `DEVICE_LOCALE` — `Intl.DateTimeFormat().resolvedOptions().locale`, pinned as the input's `lang` — so the field would render "in the device's own convention". Two things are wrong with that answer:

1. **The device is the wrong authority.** This app has one language. A phone whose region is the US does not make a Hebrew form a US form; it makes it a Hebrew form printing a date in an order its reader does not use. And the reader cannot tell: `08/09` is a real date either way, so a wrong order is not visibly wrong — it is quietly wrong, which is worse in the one place a date is being _committed_.
2. **`lang` does not carry.** Chromium honours it; **WebKit ignores it** and follows the OS region setting. The reported device was an iPhone, so moving `lang` to `he-IL` — the obvious one-line fix — would have left the reported screen exactly as reported.

Sweeping for "everywhere else a date is drawn" (the report said _seek everything_) found the same drift in five more places, all invisible to the test suite:

- the birth board's first flap built its date by string surgery — `startDate.slice(5).replace('-', '.')` — printing **`09.12`** for a September 12th departure, the one surface showing a reversed date **inside** the app's own numeric shape;
- three fallbacks in the booking/event detail sheets rendered the raw ISO day (`2026-09-11`) whenever the row had no clock, beside timed rows reading `יום ו׳, 11 בספט׳`;
- the day strip's weekday letter was formatted in the **trip** zone from a **UTC** midnight, so for any zone west of UTC every pill named the day before;
- the same weekday formatter existed twice, byte-identical, in the two day screens;
- and thirteen bare `'he-IL'` / `'en-US'` literals with no name behind them, against the repo's own "no magic values" rule.

## Decision

### 1. One locale, and it is the app's

`APP_LOCALE = 'he-IL'` in `frontend/src/constants.ts` — the single name behind every `Intl` formatter (dates, times, money) **and** the `lang` on the native date/time controls. `DEVICE_LOCALE` is deleted; nothing about how this app reads is the device's call. The device's _timezone_ is a different question and `DEVICE_TIMEZONE` keeps answering it.

This is what "locale-aware" means here: not a hardcoded `dd.mm.yyyy` template, but one locale constant that every formatter derives its order, separators and month names from. A second UI language becomes a change to that constant's source, not a hunt through thirteen literals.

### 2. The value on screen is ours: `ui/primitives/DateField`

The sibling of `TimeField`, and the only place an `<input type="date">` is written now. The wrapper wears the host's chrome and the box has two layers:

- a **face** — the value through `formatDayMonthYear` (`09.08.2026`), or the placeholder when empty;
- the **native input**, absolutely positioned over the whole box at `opacity: 0`.

Invisible, not absent: the input still takes the tap, the focus, the `min`/`max`, the calendar and the keyboard, and it is still what a test or a form addresses. Only its platform-formatted text is hidden — because the face says the same thing in the order the reader uses, on **every** browser, which is the half `lang` could not reach.

**Being typed into, the native control comes back** (`opacity: 1`, face hidden). That is deliberate: a keyboard edit is when the segments must be editable and legible. What is fixed is what the field reads **at rest** — which is when you check the date you just entered.

> **Amended 2026-08-11 (session 250, field report #36): the trigger is a keystroke, not focus.** As shipped this rule keyed on `:focus-within`, on the reasoning that "on a phone, focus is also the moment the platform's picker owns the screen". That is true while the picker is up and **false the moment it closes**, because the input keeps focus — so on a phone the field spent the rest of its life reading the platform's format, which is the one thing this ADR exists to prevent. The owner reported it as two symptoms (`שבת, 12 בספטמבר` reading `12.9.2026`, and the value clipped at a larger system font) and they are one cause: a native date is a single unwrappable line inside a box the face sized, so it clips where the face would wrap. `DateField` now sets `data-typing` on the first keystroke and drops it on blur, and the CSS keys on that. A touch user never types a segment, so on a phone the face never steps aside at all; the picker's own surface keeps its native presentation, which was always the part that was not ours to argue with.

**A date the platform reports as empty is a cancellation, not a value** (field report #38, same session). `<input type="date">` has a Clear on Android and reports itself empty mid-keyboard-entry, and either one used to be forwarded as `''`. `DateField` swallows both: a Clear restores the date that was showing when the picker opened — in the control, and upward too when a tentative pick had already committed one — and an incomplete keyboard entry is simply held on the control until it is complete or the field is left. Every host of this field requires a date, so this is one answer here rather than a prop per host; a host that ever needs a different one takes an `onClear`, which is `TimeField`'s existing shape for exactly this. What made it urgent rather than tidy: an `''` reaching `EventForm` was handed to `authoringZone` → `zonedIso('')` on **every render**, and the `RangeError` that throws in a render unmounted the whole app, there being no error boundary anywhere in `frontend/src`. `lib/time.ts`'s `isCalendarDay` now states that precondition, and `authoringZone` answers the trip's primary zone for a day it cannot read rather than throwing.

`dir="auto"` on the face and nothing else (ADR-0118): a numeric date is a neutral run reading left-to-right, a Hebrew placeholder reads right-to-left, and each aligns exactly as the `TimeField` beside it aligns its own value.

### 3. Six copies became one, and the box moved

Trip creation (2), trip settings (2) and `WhenField` (2) each hand-rolled the same `<input type="date" lang=…>`; all six now call `DateField` (rule 8). The consequence to know: **the box is the wrapper, not the input**. Host chrome (`.field .df`, `.set-fld .df`, `.wf-date`, `.wf-date-val`) and the ADR-0150 refusal mark land on `.df`; `form-errors.css` lists it beside the other non-input controls, and `:focus-within` replaces `:focus-visible` wherever the box is styled — the box is never itself the focused element now.

**And the mark had to get heavier, which is the one thing to remember here.** Moving the box from an `input` to a `.df` wrapper moved it into the same specificity bracket as the shell chrome that paints it: `.field .df` and its teal `.field .df:focus-within` are (0,2,0)/(0,3,0), where `.field input` had been (0,1,1) and the mark beat it outright. Measured in a real browser: the refused end of a trip's date range painted **teal**, and the day field kept its neutral border under the ring. So `.df` has its own rule in `form-errors.css`, a class heavier, and it keys on **`:focus-within`** — the box is not focusable, the input inside it is, so the `:focus-visible` half of the rule above can never match. The span leg is excluded there (`:not(.wf-date-val)`): its `.tp-field` cell is the box that reddens, and a ring inside that cell would be two refusals for one field. `form-refusal.spec.ts` now asserts the painted colour on both hosts — every unit test stayed green through the whole thing, because jsdom reports no colour at all.

### 4. Every app-rendered date comes out of `lib/time.ts`

`formatDayMonthYear` (the field face), `formatDayDate` (a named day with no clock), `formatDayTime` (moved out of `ui/BookingDetail`, where a formatter sat in a component that a second component imported it from), `weekdayName` and `weekdayLetter` (the two duplicates, and the strip's letter now read in **UTC** like every other calendar-date helper here). The birth flap's string surgery is `formatDayMonth`; the three raw-ISO fallbacks are `formatDayDate`.

## Alternatives considered

- **Just set `lang="he-IL"`.** The one-line fix, and it fixes Chromium only. The reported device is WebKit, which reads the OS region — so this closes the report on paper and not on the reporter's phone. Rejected for that alone; it is also still the device deciding, one indirection later.
- **Format by the device's region, but in Hebrew words.** Rejected with §1: a one-language app has one date order. There is no reader for whom `08/09/2026` in a Hebrew form is the right answer.
- **A custom date panel** (ADR-0083 §"Alternatives" rejected this once). Still rejected, and this decision is careful not to become it: the native calendar is genuinely better for a far-off date, and it stays — the input is intact and only its text is overdrawn.
- **Hide the input completely behind a button + `showPicker()`.** Rejected: `showPicker()` needs a fallback per browser, and a fully hidden input has no keyboard entry at all. Keeping the real control under the face costs nothing and loses nothing.
- **Leave the face up while focused, so the app's order shows during entry.** Rejected: typing into `<input type="date">` is segment-by-segment and emits nothing until the whole date is valid, so a face left up during entry would show a stale date while you type into it. (The 2026-08-11 amendment keeps that rejection exactly — the face still steps aside for an **entry** — and only stops treating focus as evidence that one is happening.)
- **Hide the platform's Clear control.** Rejected by the owner when #38 was routed, and it is the wrong shape anyway: the app cannot reach inside the OS picker, so this would be a bet on which controls a given Android build draws. The empty is handled where it arrives.

## Consequences

- A date reads the same way in the form, on the board, in the sheet and on the strip, on every device — and the app no longer has a surface whose format is set by a setting the reader never associated with it.
- Tests and e2e address the input **inside** the box (`.wf-date input`, `.date-row .df input`); five specs were updated, and the birth-board spec's expectation flipped from `09.12` to `12.09` — it had been asserting the bug.
- One weekday-letter bug fixed on the way, for trips west of UTC. It had no test and no report; it was found by consolidating the two formatters.
- The empty state now says which end it is (`יציאה` / `חזרה` on creation, `הוסף תאריך` elsewhere) instead of the browser's `mm/dd/yyyy` hint — the creation form's two boxes have no captions of their own.
- Not done, deliberately: `en-US`/`en-CA` inside `lib/time.ts` stay. They are not display — `en-CA` is the ISO-day trick behind `todayInTz`, `en-US` is a parts/offset probe — and renaming them to the app locale would change what they return.
