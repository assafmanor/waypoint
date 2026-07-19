# 0085 — Relative-day phrasing for booking rows and countdowns

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates:** [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) / [0059](0059-booking-presentation-on-home-and-index.md) (the Index booking row + schedule line this rewords), [0084](0084-booking-duration-display.md) (the booking-duration read-out, whose one-night wording is refined here), [0045](0045-trip-home-real-data-only.md) (the board hero's next-event countdown), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber = time & commitment — the surfaces this touches)

## Context

Two rough edges in the Hebrew time copy, both about **how a day is named**:

1. **The Index booking rows** (ADR-0053/0059) printed a booking's day as its **trip day-number** — "יום 7", "יום 3". That answers "which day of the trip" but not the question a traveller on the ground actually asks: _how far off is this?_ "מלון · צ׳ק-אין · יום 7" makes you count; "מלון · צ׳ק-אין · מחר" doesn't.
2. **The countdown surfaces** — the board hero's next-event countdown, the trip-list "בעוד …" chip, the header "יוצאים בעוד …", the join ticket, the Plan-mode departure count — all bottomed out at a bare "יום" / "יומיים" for the one- and two-day cases (via `dayCount`). "בעוד יום" is clumsy where Hebrew has a word for it: "מחר".

Hebrew names the near days in **both** directions (מחר/מחרתיים ahead, אתמול/שלשום behind), and only counts from three out. The copy should use those words.

A subtlety made this worth a decision rather than a find-replace: **relative-day naming is calendar-based** (target date vs. today), while the board hero's countdown is **duration-based** (minutes to the next event). An event 37 h out is calendar-"מחרתיים" but duration-"יום" — so the hero can't just relabel its minute-count; it has to read the event's date.

## Decision

**One relative-day vocabulary, applied by two helpers in `lib/time.ts`; durations stay counts.**

- **`relativeDay(delta)`** — a standalone label from a whole-day offset (target − today): `היום` / `מחר` / `מחרתיים` / `עוד N ימים` ahead, `אתמול` / `שלשום` / `לפני N ימים` behind (dual/plural via `dayPhrase`). The **Index rows** read this: `dayLabel` now diffs the booking's calendar day against today instead of the trip start, so both the upcoming rows and the "כבר מאחוריכם" ones read relative.
- **`countdownParts(days)`** — a forward countdown split for display: `{ value, unit, prefix }`. The next calendar day is `מחר`, the one after `מחרתיים` — standalone words with an empty `prefix` (there is no "בעוד מחר"); from three days up it's a numeral count with `prefix: 'בעוד'`, rounding to months past `COUNTDOWN_MONTHS_THRESHOLD` (folding in the old `formatDaysUntil`). The numeral stays separable so the surfaces that style it LTR still can. `countdownText(days)` is the same, joined, for text-only callers.
- **The board hero reads calendar days, not its minute-count, past a day.** Under a day out it still shows minutes / `H:MM` hours (`formatCountdown`, unchanged); at/over a day it switches to `countdownParts(delta)` where `delta` is the next event's trip-tz calendar day minus today — so "מחר"/"מחרתיים" are correct, not a floor of the hour-count.
- **Durations are left as counts.** A booking's length ("3 ימים"), a trip's length ("יומיים"), a WhenField span read-out — all still go through `dayCount`/`formatCountdown`/`dayPhrase`. "מחר" is a point in time, not a length; only the "when is this / when does it start" surfaces went relative.
- **One-night clarity (refines ADR-0084).** `nightCount(1)` now reads **"לילה אחד"** rather than a bare "לילה" — clearer next to a check-out ("צ׳ק-אאוט · לילה אחד"). Two nights up is unchanged ("2 לילות").

## Consequences

- The Index answers "how far off" at a glance, in both directions, with no trip-day arithmetic. `t.index.dayN` / `t.index.today` are gone.
- The five countdown surfaces share one vocabulary: "מחר" / "מחרתיים" for the near days, "בעוד 3 ימים" (or months) beyond. The `בעוד` connective lives with the count now, so callers that had it baked into a label ("היציאה בעוד" → "היציאה", "בעוד" prefix on the join ticket, `t.shell.join.countdownPrefix`) drop it and let `countdownParts` supply it.
- Duration vs. relative-day are now two clearly separate concerns in the code: `dayCount`/`dayPhrase` for lengths, `relativeDay`/`countdownParts` for "when". A future surface picks the right one by asking "am I naming a length or a day?".
- The hero's flip point (a day out) is unchanged; only what it prints past that flip changed — no new "when does the widget switch" behaviour to reason about.

## Alternatives considered

- **Relabel the hero's duration-count** (map its day-count to מחר/מחרתיים). Rejected — wrong at the edges (a 37 h gap is calendar-"מחרתיים", duration-"יום"); the hero must read the date.
- **Relative for upcoming Index rows only, keep trip day-number for past.** Rejected in favour of relative both ways (product call): אתמול/שלשום/לפני N is more informative than "יום 3" for a booking behind you, and one vocabulary is simpler.
- **Switch the 3+ countdown wording to "עוד N ימים" too** (matching the Index). Left as "בעוד N ימים" for the countdown surfaces — that copy wasn't the complaint, and "בעוד" is the established connective there; only the יום/יומיים → מחר/מחרתיים swap was asked for.
