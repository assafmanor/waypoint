# Session 102 — The session-100 fix didn't reach Plan mode, because each screen built its own zone context

**Date:** 2026-07-25
**Kind:** Bug fix + the consolidation that prevents the next one.
**ADRs:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) **session-102 amendment** (and the session-100 one it completes).

## The report

Plan mode still showed the bug session 100 fixed: on the Cyprus/Israel day, the Nicosia taverna and the Israeli restaurant each drew a `+3 ש׳` pill. And the sharper question with it — **"why aren't they behaving the same in the first place? Shouldn't they share the same logic?"**

## Diagnosis

They did share the logic. They did not share the **input**.

`PlanDay` derived **its own** `tripZoneCrossings(events, bookings, places)` and **its own** ambient (`segmentZoneAt(dayNoon)`), then hand-assembled a `ZoneContext` from them. Session 96 had centralised the crossings for the Trip-mode view; session 100 moved the ambient rule to the day's own events — and both times Plan mode's private copy went on doing the old thing. Four hand-assembled contexts existed across three screens (`DayView`, `PlanDay`, `Home` ×2).

So the pill machinery, `eventZones`, `EventCard`/`BuilderRow` — all shared, all correct. The two day surfaces disagreed anyway, for a release, because "shared logic" with per-screen inputs is not shared behaviour. This repo has been here before: the width-measured route layout (ADR-0059 session-95), the parallel change-appliers (ADR-0094), the copy-pasted shift pill (session 97).

## The fix

**Two builders are now the only sanctioned way to get a `ZoneContext`** (`lib/places.ts`), both over the single `ZoneEvidence` that `trip-state` memoizes:

- `dayZoneContext(date, evidence)` — a **day** surface (Trip day view, Plan builder, glance rail): ambient = that day's own zone.
- `liveZoneContext(nowMs, evidence)` — a **live** surface (the board hero): ambient = where you are now, so a shift reads "not where I am" rather than "not this day".

`PlanDay` no longer derives crossings or an ambient; `DayView` and `Home` stopped destructuring `zoneCrossings` entirely. Recorded in `frontend/CLAUDE.md`'s anti-pattern list, since the mistake is invisible in review — the diff looks like shared code.

Plan mode's own ADR-0107 §4 distinction is untouched: its base framing zone is still the trip primary and its now-reference is still a drafting guide, not a live clock. What it now shares is what it always should have — the per-day zone evidence behind the pills.

## Verification

- `lib/places.test.ts` (+4): a day context resolves the reported day to `Asia/Nicosia` and is `toEqual`-identical for the same input (the property that keeps the two day surfaces in step); **both reported pills resolve to `undefined`** (no pill); a live context resolves to the same zone at 00:31 local; the builder passes the shared evidence through by reference rather than re-deriving it.
- Full suite **826** passes (82 files); `typecheck` + `lint` (0 errors) + `build` green.

## Second half: the clock stopped depending on the mode (revises §4)

Reported in the same breath, and correct: _"if you're on the trip and now is X in Trip mode and you switch to Plan mode, now should show the same time."_ §4 had specified exactly that split — the live segment zone in Trip mode, the trip primary in Plan mode — and it doesn't survive being stated plainly. What time it is is a fact about the trip and the clock; the mode decides what you can **do**.

- **`liveToday(nowMs, evidence)`** joins `liveZone` in `lib/places.ts`, and both are **mode-free**. The day-strip anchor, the Trip-mode day view, the Plan-mode builder's now-reference and `defaultDay` all read them; the `mode === 'trip' ? … : trip.timezone` branch in `App.tsx` and `PlanDay`'s `todayInTz(trip.timezone, …)` are gone. Four call sites had been repeating `todayInTz(liveZone(…))` — now there is one function, and it takes no mode.
- Plan mode's now-reference still means the same thing (a static drafting guide, ADR-0043 — not a live signal). It just no longer prints a different time than the day view did a tap earlier.
- What legitimately stays per-surface: the base display zone for an event with no resolved zone, and Plan mode's absence of live verbs. Neither is a clock.

Tested at the lib level (`liveToday` rolls with the live zone rather than the trip primary; and `liveToday.length === 2` — there is no mode to pass), since the screens have no render harness in this repo.
