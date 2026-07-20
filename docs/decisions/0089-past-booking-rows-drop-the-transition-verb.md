# 0089 — Past booking rows drop the transition verb

**Status:** Accepted (2026-07-20)
**Date:** 2026-07-20
**Refines:** [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) (the row's type-labelled timing fact — המראה/נחיתה, צ׳ק-אין/צ׳ק-אאוט — this narrows to upcoming rows only), [0085](0085-relative-day-phrasing.md) (the same past/upcoming Index rows, whose day it made relative), [0059](0059-booking-presentation-on-home-and-index.md) / [0063](0063-category-time-behaviour-profile.md) (the transition-wording grammar the verb comes from) **Relates:** [0049](0049-index-tab-mode-and-lifecycle.md) (the during-trip past/upcoming split — "כבר מאחוריכם"), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber = time & commitment — the surface this touches)

## Context

The Index booking row leads its schedule line with the transition **verb** for the booking's type (ADR-0053 revision): a flight reads _המראה / נחיתה_, a hotel _צ׳ק-אין / צ׳ק-אאוט_, other transport _יציאה / הגעה_, an activity _התחלה / סיום_. The verb names the actionable moment — useful while the moment is still **ahead** of you ("צ׳ק-אין · מחר · 15:00" tells you what to do and when).

In the **"כבר מאחוריכם"** (already-behind-you) list, that verb is noise. Reviewing the live Index (screenshot, 2026-07-20), the past rows read _נחיתה · אתמול · 53:30 שע׳_, _צ׳ק-אאוט · שלשום · 3 לילות_, _יציאה · אתמול · 10:30_ — naming an action you've already completed. Once a booking is behind you the question is only _when was it_, which the relative day (ADR-0085) and the duration (ADR-0084) already answer; the verb adds a word without adding information.

## Decision

**A booking's schedule line drops the transition verb once the booking is past; upcoming and in-progress rows keep it.**

- "Past" is the **same edge `splitBookings` files on** (ADR-0049) — `isEventPast(event, now, tz)`: a flight at landing, a hotel at check-out, an untimed booking at midnight. So a row shows the verb exactly while it sits in the upcoming list and drops it exactly while it sits in "כבר מאחוריכם"; the two never disagree.
- **In-progress is not past.** A hotel mid-stay (checked in, not yet checked out) and a flight in transit are still not past, so they keep the verb — the transition ahead of you (the check-out, the arrival) is still the useful thing to name. Only when the closing edge itself has passed does the verb drop, even if that happened earlier the same day (checked out at 11:00, now 12:00 → _היום · 11:00_, no verb).
- **Everything else on the row is unchanged:** the relative day (ADR-0085), the transition **time**, and the duration read-out (ADR-0084) all stay. A past flight reads _אתמול · 53:30 שע׳_; a past hotel _שלשום · 3 לילות_; a past same-day flight _לפני 3 ימים · 02:10 · 1:01 שע׳_. Only the leading verb is gone.
- The row's edge selection is untouched: a multi-day booking still reads its **check-out** side once the check-in day has passed (ADR-0053), so a past stay shows the check-out day, just without the "צ׳ק-אאוט" word.

## Consequences

- **`scheduleLabel` (`lib/index-bookings.ts`) only** — it already had `now` and the trip tz; it now computes `isEventPast` and omits the verb when past, joining the remaining parts with the app separator (`·`) so no dangling separator is left where the verb was. No new inputs, no caller change, no data-model/backend touch. `timingLabels` / `plainTimingLabel` and the detail-view/hero wording are unchanged — the verb still labels the fact everywhere the moment is live.
- The past list reads as a **log** ("when was it") and the upcoming list as a **prompt** ("what's next, and what is it") — the verb is what separates the two voices, which matches the ADR-0049 past/upcoming intent.

## Alternatives considered

- **Keep the verb everywhere** (status quo). Rejected — naming a completed action on a row explicitly labelled "already behind you" is redundant; the complaint that prompted this.
- **Drop the verb _and_ the time on past rows** (day only). Rejected — the time is still a useful fact for a log ("landed at 02:10"), and the duration already reads off it; only the action word is noise.
- **Past-tense the verb instead of dropping it** (נחת / צ׳ק-אאוט בוצע). Rejected — more words, not fewer, and it invents a second per-type vocabulary to maintain beside `timingLabels`; the day already carries the pastness (אתמול/שלשום).
- **Gate on the past/upcoming list at the call site** (pass an `isPast` flag from `Index.tsx`). Rejected — `scheduleLabel` already knows `now` and derives the edge; deriving pastness from the same helper `splitBookings` uses keeps the one source of truth and can't drift from which list the row landed in.
