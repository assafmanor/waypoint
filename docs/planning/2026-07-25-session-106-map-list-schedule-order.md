# Session 106 — The map list reads in trip order, and the banner stops lying

**Date:** 2026-07-25
**Kind:** Behaviour fix + one derivation extension (Maps & Places follow-up).
**ADRs:** [0109](../decisions/0109-map-tab-design.md) **session-106 amendment** (§1 gains a stated order), [0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md) (why an ambient night sinks), [0043](../decisions/0043-day-view-now-line-and-derived-phases.md) (`sortOrder`, the tie the clock can't break).

## Why

Asked for "sort by event/booking precedence" as a **second** sort next to near-me, with a mockup for the two-sorts problem. Checking what the list actually ordered by first turned that around: there was no schedule sort to add alongside near-me, because the **default** wasn't one.

`byName` sorted by `days[0].date`, then place name. In Trip mode's default scope — today — every place shares that date, so today's map was **alphabetical**. And §6's shipped denied-banner copy already said `הרשימה ממוינת לפי לו״ז` ("sorted by the itinerary"): true across days, false within one. So this was a live mismatch between shipped copy and shipped behaviour, not a missing feature.

That reframing made the design question answer itself: with the default honest, the tab still has **one** ordering toggle (near-me on/off), so there is no two-sorts problem, no sort picker, and no mockup needed. Confirmed with the user before building.

## Change

**`lib/place-usage.ts` — `DayUsage` gains the day's position.** Per anchored date: `at?` (the earliest referencing moment there, as an **absolute instant**) and `sortOrder?`. The instants come from the span's edges — a stay's first day is due at check-in, its last at check-out, the same two moments the day view draws as transitions — and a strictly-middle night gets none. Two references landing on one date merge to the loudest prominence and the **earliest** moment.

**A transport event's endpoints now carry their own moments** — origin at departure, destination at arrival — so a flight's two ends never tie and always list in travel order. Previously both inherited the departure instant.

**`comparePlacesBySchedule` — the order, beside the derivation, not inline in the screen.** Within a day it reuses **the day view's own vocabulary**: start instant, then `sortOrder`, untimed after the clocked ones exactly as `DayView` renders them. That is deliberate — the ADR-0107 session-102 lesson was that a shared _resolver_ with per-screen _inputs_ is not shared behaviour, and two surfaces disagreeing about the same day is precisely the bug class. Three tiers sink below the schedule: untimed → ambient backdrop → no day at all. Place name is the final tiebreak, so the order is total and stable.

**A second fix fell out of that last tier.** Dateless places (an unlinked booking, a shelf idea) previously sorted to the **top** of the all-days list, above everything scheduled, because an empty date string compares first. They now sink last, where "no schedule position" belongs.

**Near-me is unchanged as a feature** but now falls back to schedule order for ties and unmeasured rows instead of the alphabet.

## Deliberately not done

- **No sort control.** With the default honest, a picker would add surface without answering a question the two existing orders don't already cover. Recorded in the amendment as considered-and-rejected, not overlooked.
- **No commitment-ranked sort** (hard → soft → idea), the other reading of "precedence". The hard/soft grammar already marks commitment on every row (🔒, dashed), so ranking by it would restate what the row already says. `place-usage` computes the weight already if this is ever wanted.
- **No mockup.** The change removes UI surface rather than adding it; there is nothing to mock.

## Verification

- `lib/place-usage.test.ts` (+8, 2 updated): a day orders by the clock where alphabetical would be its exact reverse; a same-instant tie breaks on `sortOrder`; an untimed event sinks below the clocked ones; a mid-stay ambient base sits below the day's schedule **and** leads its own arrival day; a flight's endpoints read in travel order though alphabetical would reverse them; a dateless place sinks last; across days it reads earliest-day-first. The two existing `days` assertions now project `{date, prominence}` instead of deep-equalling the whole row, so they stop breaking every time `DayUsage` grows.
- `screens/Map.test.tsx` (+2): the rendered list reads `zoo · market · bar` where the alphabet would say `bar · market · zoo`; a flight's endpoints render departure-then-arrival.
- `typecheck` + `lint` (0 errors) + `build` + `format:check` green; frontend suite **887** passes (878 → +9).

## Next

Unchanged: **Phase 5** (Plan-mode research) is unblocked and needs no human step; **Phase 6** (rendered map) still waits on the Google Cloud slice — Maps JS + Routes enabled, Routes added to the server key, the referrer-locked browser key minted, the daily quota caps set, and current Maps pricing re-confirmed.
