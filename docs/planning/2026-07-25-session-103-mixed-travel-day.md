# Session 103 — Settling the mixed travel day: the pill baseline stands, the read-only gate was broken

**Date:** 2026-07-25
**Kind:** Investigation + one bug fix + one recorded non-change.
**ADRs:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) **session-103 amendment**, [0029](../decisions/0029-trip-mode-day-scope-gating.md) (its gate, refined again).

## Why

Two things were left open about a day whose events span several zones: whether the shift pills should keep basing against the crossing-derived segment, and whether anything else keyed to it was wrong. Rather than reason from the outside, I probed the real resolvers with the reported trip reconstructed from the screenshots.

## Finding 1 — the pill baseline is already right (no change)

Day 24 of the reported trip resolves to `Atlantic/Reykjavik`, which is where the traveler is from 11:00 onward, and the pills read: Iceland event **bare**, flight **−3** (its own crossing), Copenhagen **+2**, Israeli restaurant **+3**. Those last two genuinely _are_ elsewhere, so their pills are correct — my earlier "you may still find this debatable" was over-flagging on my part.

Two alternatives, both rejected on the data:

- **Duration-weighting** the day's events picks _where the longest event is_, not where you are — it elects Copenhagen on day 24, which is worse than the segment answer.
- **Chaining** each event against the previous one's zone replaces one comparable baseline with relative deltas (`+2`, then `+1` — from what?). Harder to read.

One wart recorded rather than fixed: the ambient samples noon **in the trip primary zone**, so the sampling instant moves with the primary and a midday departure can land on either side of its crossing depending on it. Bounded to one day's baseline; every fix I tried was worse.

## Finding 2 — the read-only gate was locking a day you're still inside (fixed)

Session 96 moved the gate from the live zone to the day's ambient precisely to stop a mid-flight lock. On a travel day that isn't enough, because the ambient _is_ the eastward destination. Probe:

```
Tel Aviv → Auckland, departing 02:00 on the 7th, landing the 8th
  now: 18:00 on the 7th where they departed — still airborne
  ambient: Pacific/Auckland → 03:00 on the 8th
  readOnly → TRUE     ← the day they are inside, locked
```

That is the exact hazard session 96 set out to prevent, surviving in the case it didn't cover.

**Fix:** a day is over only when it is over in **every** zone it touched — the clock that ends it last (smallest UTC offset among the day's zones: its events' known zones, both ends of a crossing since you were in each, plus the ambient as a floor). `isDayOver(date, evidence, nowMs)` owns it, so the screen no longer assembles the rule. The day-scope **label** still follows the live zone; only the gate is generous.

## Verification

`lib/places.test.ts` (+5): the Auckland travel day is **not** locked mid-flight (with an assertion that its ambient really is `Pacific/Auckland`, so the test would fail if the fix silently changed the ambient instead); it locks once Jerusalem — the last clock — passes midnight, and not an hour earlier; a single-zone day behaves exactly as before; same-offset zones collapse (a Nicosia + Jerusalem day gains no phantom hour); a day with no zone-bearing events falls back to the ambient. Suite **844** passes; `typecheck` + `lint` (0 errors) + `build` green.
