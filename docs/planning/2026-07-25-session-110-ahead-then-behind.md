# Session 110 — Two blocks: what's ahead, then what's done newest-first

**Date:** 2026-07-25
**Kind:** Bug fix + one reversed design call (Map ordering, third pass).
**ADRs:** [0109](../decisions/0109-map-tab-design.md) **session-110 amendment**, superseding the session-107 one.

## Why

Session 107 sank what's behind you _to the bottom of its day_. Reported as still wrong, and it was, in two distinct ways.

**A bug.** The comparator ordered by **date before** the ahead/behind rank, so the sink only ever operated **within** one day. In all-days scope the list still opened on the trip's earliest day — last Tuesday above the stop you're heading to this evening. Day-scoped it looked correct, which is why it survived three sessions and two review passes: every test I wrote for it was day-scoped.

**A wrong call.** Session 107 kept the sunk block chronological, arguing "same rule, lower tier". That was tidy and unhelpful: the stop you just left is the one you might still want, and the trip's opening day is the least interesting row on screen. Newest-first is right.

## Change

The list is **two blocks, and the split is the outermost key — above the date**:

1. **Ahead of you** — next and coming up, earliest first, whatever day it falls on. Within a day, still the day view's start-then-`sortOrder` vocabulary, so the two surfaces cannot disagree about a day; a mid-stay **ambient** night still trails as backdrop (ADR-0054).
2. **Behind you** — **newest first**, by date then instant. No within-day hierarchy here: everything is equally done, so untimed and ambient rows stop being ranked and simply trail the timed ones — a row with no clock can't claim recency.

A reference with no day at all still comes last, in neither block.

**Two further reversals of session 107:**

- **Both modes now.** 107 gated it to Trip mode, reasoning that Plan drafts the sequence. A list that opens on last Tuesday is wrong while planning too, and the gate bought nothing — the clock is always passed now. A future trip in Plan mode is unaffected, since nothing is past.
- **A whole passed day counts as behind you** (`isDayUsagePast` gained `today`). Otherwise an untimed event on a finished day floats into the **ahead** block for want of a clock — the same class of error this session exists to fix.

## What the failing tests exposed

Four screen tests broke in a way worth recording: their fixtures sit on a fixed date (`2026-07-20`) but they never pinned the clock, so they had been silently reading against the real system time. Once the ahead/behind split became the primary key, "when the suite runs" started deciding the expected order. They now pin a `DAWN` constant, and the ordering block states its own "now" instead of inheriting the wall clock. That was a latent flaw in the tests, not a symptom of this change.

## Verification

- `lib/place-usage.test.ts` (+2, 2 updated): **ahead beats behind across days** (`tonight · next-week · yesterday · last-week` in all-days scope — the exact reported bug); an untimed event on a passed day sinks **only** once `today` is supplied, pinning both halves of that rule; the sunk block reads newest-first; a wholly-past day is one block and reads newest-first throughout.
- `screens/Map.test.tsx` (+1, 4 updated): the rendered all-days list leads with tonight and ends on the oldest day, with the `כבר היינו` header marking the boundary; Plan mode splits the same way (was: asserted it didn't).
- `typecheck` + `lint` (0 errors) + `build` + `format:check` green; frontend suite **905** passes (902 → +3).

## Next

Epic status unchanged: **Phase 5** (Plan-mode research) unblocked; **Phase 6** waits on the Google Cloud slice, and with it follow-up (d).
