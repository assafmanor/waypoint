# 0114 — One elapsed-time duration ladder: rounding is by elapsed length, not calendar crossings

**Status:** Accepted (2026-07-24)
**Date:** 2026-07-24
**Relates:** [0084](0084-booking-duration-display.md) (the per-category duration read-out this fixes and standardizes — its per-kind units stand, its `auto` rounding is replaced), [0063](0063-category-time-behaviour-profile.md) (the `CategoryTimeProfile.durationUnit` this consumes), [0085](0085-relative-day-phrasing.md) (the sibling "when is this" concern — relative-day/countdown — deliberately left out of this ladder), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber = time & commitment — the surfaces this touches)

## Context

Reported by Assaf (2026-07-24) with a screenshot: a restaurant booking running **23:00 → 00:00** — one hour — displayed its duration as **"יומיים"** (two days). More broadly: durations that cross a date boundary were rounding to days no matter how short the elapsed time, and there was no single, documented rule for _when_ a duration steps up to a bigger unit.

The cause was in `formatBookingDuration` (ADR-0084): the `auto` unit decided days-vs-hours from a **calendar-date difference** (`dayDiff` over `YYYY-MM-DD` strings), then printed `dayPhrase(spanDays + 1)`. So a booking touching two calendar dates read as "days" — and an _inclusive_ count at that — even when only minutes of real time elapsed. A midnight crossing is not a duration.

The phrasing was also copied three times and had already drifted: `booking-timing.hoursPhrase` ("5:45 שע׳"), the `WhenField` span read-out (via `formatCountdown` → "5:45 **שעות**"), and `TimePicker.durationPhrase` — three near-identical hour/minute formatters, exactly the parallel-copy smell ADRs 0078/0079/0094/0095 exist to prevent.

Assaf's ask: **decide one boundary standard for when a duration rounds to days / weeks / months / years, and make it a common thing** — while keeping that different booking kinds read in their natural unit (hotels in nights, etc.).

## Decision

**One elapsed-time duration ladder, in `frontend/src/lib/duration.ts`, that every "how long is this" read-out formats through. The rounding unit is chosen by _elapsed time_, never by how many calendar dates a span touches.**

- **`formatDuration(minutes, unit)`** expresses an elapsed length in the **largest rung it fills**, the count **rounded to nearest**:

  | Rung         | Elapsed range     | Example                         |
  | ------------ | ----------------- | ------------------------------- |
  | minutes      | 1–59 min          | `45 דק׳`                        |
  | hours (H:MM) | 1 h – <1 day      | `שעה` / `שעתיים` / `5:45 שע׳`   |
  | days         | 1 day – <1 week   | `יום` / `יומיים` / `3 ימים`     |
  | weeks        | 1 week – <1 month | `שבוע` / `שבועיים` / `4 שבועות` |
  | months       | 1 month – <1 year | `חודש` / `חודשיים` / `5 חודשים` |
  | years        | ≥1 year           | `שנה` / `שנתיים` / `3 שנים`     |

  Rung boundaries are the named constants `MINUTES_PER_HOUR` / `MINUTES_PER_DAY` / `DAYS_PER_WEEK` / `DAYS_PER_MONTH` / `DAYS_PER_YEAR` (`constants.ts`). The hours rung shows exact `H:MM`; every larger rung shows a rounded whole count via the Hebrew dual/plural grammar (`hebrew.ts` — `dayPhrase`/`weekPhrase`/`monthPhrase`/`yearPhrase`, with `weekCount`/`yearCount` added here).

- **Two per-kind overrides stand (ADR-0084), applied by the caller, not the ladder:**
  - **`nights`** (lodging) — a stay is counted in **calendar nights** (check-in → check-out days), never elapsed hours. A stay always crosses days; nights is the traveller's unit.
  - **`hours`** (transport) — a flight/train stays in **hours even past a day** (`unit: 'hours'` pins `formatDuration` to the hours rung): a 30 h journey reads "30 שעות", not "יום".
  - **`auto`** (everything else) — the full ladder above.

- **The `auto` path reads elapsed time from the two instants.** With both `startsAt` and `endsAt`, `formatBookingDuration` computes elapsed minutes and hands them to `formatDuration`. The old `dayDiff`-based `spanDays + 1` is gone.

- **One documented exception keeps a calendar count:** a **date-only** multi-day span (an all-day event with `endDate` but no clock times) has no elapsed time to measure, so it still reads in **inclusive calendar days** ("3 ימים"). This is the only place a calendar span is the right signal — there's nothing else to count.

- **The three copies collapse to one.** `hoursPhrase` + `formatDuration` in `duration.ts` are the single source; `formatBookingDuration`, the `WhenField` span read-out, and `TimePicker` all read them. This also removes the `formatCountdown` "שעות"/"שע׳" drift in the edit form.

- **Out of scope — the "when is this" surfaces (ADR-0085).** The relative-day labels (`מחר`/`לפני N ימים`) and the forward **countdown** (`formatCountdown`, `countdownParts` — "time _until_ the next event") are a separate concern with their own phrasing and calendar semantics; they are not a _length_ and do not route through this ladder. This ladder governs **duration** ("how long _is_ it"), not **countdown** ("how long _until_ it").

## Consequences

- The reported bug is fixed: a 23:00 → 00:00 booking reads **"שעה"**. A 30-minute booking reads "30 דק׳"; a red-eye flight still "3 שעות"; a hotel still "3 לילות".
- One behaviour change beyond the bug: a **timed** multi-day activity now reads its true elapsed length (a 30 h activity is "יום", not the old inclusive "יומיים"). The test that encoded the old value was updated; a date-only multi-day activity still reads inclusive days ("3 ימים"), and that timed-vs-date-only distinction is intentional and documented.
- There is now **one** duration ladder to reason about and extend; a new surface that needs a length calls `formatDuration` and gets the standard for free. The hour/minute drift between the detail view and the edit form is gone.
- The upper rungs (weeks/months/years) round coarsely by largest-unit — invisible in practice, since a single booking's length never reaches them; they exist so the standard is complete rather than bottoming out at days.
- Elapsed is measured from absolute instants (DST-correct); nights/date-only use UTC-anchored calendar days (also DST-safe). No schema, backend, or data change — pure display.

## Alternatives considered

- **Keep the calendar-date count, just cap it.** Rejected — the defect _is_ that a midnight crossing is treated as duration; capping ("only round to days past N dates") still measures the wrong thing.
- **Cap the ladder at days.** Rejected per Assaf's call — the standard should name the full progression (days/weeks/months/years) even if the top rungs are unreachable for trip data, so "what unit does a long duration use" is never an open question.
- **Fold the board countdown into the same helper.** Rejected — the countdown is "time until" with its own calendar-day phrasing (ADR-0085) and a deliberately fuller wording on the hero; unifying it would change hero copy for no correctness gain. The boundary between _duration_ and _countdown_ is kept explicit.
- **A compound read-out ("יום ו-6 שעות").** Rejected — a single largest-unit phrase matches every existing count surface (`dayPhrase`/`nightPhrase`) and the at-a-glance intent; compound precision isn't wanted for a preview.
