# 0164 — A span's own edge is something you can still miss

**Status:** Accepted. **Built 2026-08-04.**
**Date:** 2026-08-04

**Amends** [0054](0054-ambient-span-events-off-the-day-schedule.md) and [0077](0077-unified-glance-rail-annotation-grammar.md) — specifically 0077's _"marking a transition is not counting a block"_, which was applied to the **count** as well as to the rail. The rail part stands; the count part does not.
**Refines** [0045](0045-trip-home-real-data-only.md)'s `נותרו היום`, whose whole job is "what can you still miss today".
**Applies unchanged** [0041](0041-parallel-overlapping-events.md) (the count runs on top-level groups, so overlaps never inflate it), [0063](0063-category-time-behaviour-profile.md) (`isAmbient`/`isBracketed` are read, not re-derived), [0037](0037-overnight-events.md) (an overnight tail with no `endDate` is an ordinary block and was always counted).
**Found by** the owner while checking ADR-0163's car hire: _"i noticed that it doesn't count in the glance 'נותרו להיום' - do you think that it shouldn't count? what about check in/check out, flights, trains, etc.?"_

## Context

The question was about a car hire and the answer turned out to have nothing to do with cars. Measured before changing anything:

| case                                  | counted in `נותרו היום` | amber anchor |
| ------------------------------------- | ----------------------- | ------------ |
| same-day flight / train / hire        | **1**                   | yes          |
| overnight flight (no `endDate`, 0037) | **1**                   | yes          |
| ordinary museum                       | **1**                   | —            |
| hotel check-in day                    | **0**                   | yes          |
| hotel middle night                    | **0**                   | —            |
| hotel check-out day                   | **0**                   | yes          |
| car hire pick-up day                  | **0**                   | yes          |
| car hire middle day                   | **0**                   | —            |
| car hire return day                   | **0**                   | yes          |

So the hire was never singled out. One line in `buildDayGlance` decides all of it:

```ts
const sameDay = dayEvents.filter((e) => !isAmbient(e)); // → tree → remaining
```

Anything spanning **more than one day** is backdrop and counts nothing; anything on one day counts. A multi-day hire behaved exactly like a hotel stay, which is 0054 working as designed — its comment says _"so a multi-night stay can't distort the day"_, and that reasoning is correct.

**What the measurement exposed is the edge days.** The middle days are right: nothing about the room or the car needs doing on them. But a **15:00 check-in with luggage**, an **11:00 check-out**, a **10:00 pick-up** and a **10:00 return** are timed obligations that can be breached — and a day whose only real commitment was returning the car read **`0 נותרו היום`**. That is the opposite of what the number is for.

## Decision

`remaining` counts **top-level blocks still now/upcoming, plus an ambient span's own edge that lands today and has not been reached yet.**

```ts
const remainingEdges = transitions.filter((t) => isAmbient(t.event) && t.atMs > nowMs).length;
const remaining = remainingBlocks + remainingEdges;
```

Three things this deliberately keeps:

1. **The rail is untouched.** 0054's real protection is that a multi-night stay draws no block and does not stretch the window. It still draws none. Only the _number_ changed.
2. **Middle days still count nothing**, which is what makes this a refinement of 0054 rather than a reversal of it.
3. **`isAmbient` is the guard against double-counting**, and it is the reason the rule is phrased over spans rather than over transitions. A same-day flight is _already_ a block in `tree` **and** has two anchors; counting its transitions as well would report 2 for one journey. Only the spans 0054 **excluded** can add themselves back — which also means this needs no per-type branch, and a future ambient category inherits it.

Each edge counts **one**, because each is one thing to do. A stay whose check-in and check-out fall on the same day is not a case: that is not multi-day, so it is an ordinary block.

## Consequences

- **`נותרו היום` now answers one question consistently**: how many things ahead of you today can still be missed. Before, it answered "how many same-day blocks", which happened to coincide on days with no multi-day edge — most days, which is why it went unnoticed until a hire made the empty day obvious.
- **Two shipped specs asserted the old number and were rewritten, not relaxed** — `excludes an ambient hotel span from the rail + remaining` went 2 → 3, and `is not empty on a day carrying only a transition marker` went 0 → 1. A third had `uncounted` in its **name** and passed anyway because it never asserted the count; renaming it was the point, since a green test with a lying name is worse than a red one.
- **The count can now exceed the number of rail blocks**, and on a check-out-only day it is non-zero with an empty rail. That pairing is correct and was already reachable (0077 made such a day non-empty so its marker renders); the number now agrees with the marker instead of contradicting it.
- **Flights and trains are unchanged in practice.** They are `ambientWhenMultiDay`, so a flight given an explicit multi-day `endDate` gains the same treatment — but an overnight flight follows 0037 and carries no `endDate`, so it stays a single counted block. Nothing about the common case moves.
- **A skipped span contributes nothing**, for free: `bookingTransitionsOnDate` already drops skipped events, which is the same rule 0077 relies on.

## Alternatives considered

- **Leave it as is.** Defensible — "remaining" would keep meaning one simple thing (same-day blocks), and multi-day bookings speak through the amber anchor and the ambient strip. Rejected because the anchor and the number then disagree on the day it matters most: the anchor says "be out by 11:00" and the number says nothing is left.
- **Count only the END transitions** (check-out, car return) as the deadlines you can actually breach, not the arrivals. Rejected: a 15:00 check-in with luggage is equally missable, and the asymmetry is a rule a reader has to hold in their head for no gain.
- **Count the whole ambient span once per covered day.** Rejected — it re-creates exactly the distortion 0054 exists to prevent: a four-night stay would add 1 to every day whether or not anything needed doing.
- **Count transitions for every bracketed event rather than only ambient ones.** Rejected in §3: it double-counts every same-day journey, which is the majority of them.
