# 2026-08-26 — the day's head reads in the order it happened

Two field reports off the ADR-0209 deploy, both about the **first two rows of a day**, both cases of
one derivation answered two ways on the two day surfaces.

> - It doesn't handle a car rental late at the night before. Should be handled like the map handles
>   this
> - check out before the day's first stop is treated like you don't have enough time and not like
>   we've agreed it should behave

## What was actually wrong

**Both screenshots are Plan mode** — the `שבץ` chips and the drag handles give it away — and reading
them as Trip mode would have sent the first hour into `DayView`, which was right about both facts.

### 1 · `אין זמן לדרך` on the walk out of the bed

`PlanDay`'s `planJourney` passed `departAfterMs: from.endsAt ?? from.startsAt` **unconditionally**.
For the day's first leg `from` is the stay you woke in, so its `endsAt` is the **check-out ceiling**:
an 11:00 "be out by" became "you cannot leave before 11:00", measured against a 07:15 waterfall, and
the row reported a journey nobody can make. On a middle night the same line reads next Wednesday.

Trip mode has omitted that input since ADR-0206 §AD. The repair is Plan asking the question it
already had the answer to — `stayRowIds.has(from.id)` — so the flag cannot be forgotten at a call
site. **§AF3 amended in place**, because it already said "there is no window out of a bed"; what it
did not say is that only one surface was doing it.

The sharpest detail: `planJourney`'s own docblock cites `frontend/CLAUDE.md`'s _"changing a
day-surface derivation in `DayView` only"_ — for `flexibleArrival`, added in the same session, **one
line below** the departure that had never been ported. Citing the rule beside one line does not
apply it to the others.

### 2 · The midnight car pickup below the bed

The map fixed this exact day one day earlier (ADR-0054's 2026-08-26 amendment, from the owner's own
_"we rent the car at 00:00 and then go to check in at the hotel"_): a moment **before dawn** whose
instant the app does **not know** is what brought you in through the night, so it sorts before the
bed. The day list knew nothing about it and drew the hotel first with a 25 km journey block out to
the counter beneath it.

**ADR-0209 is what surfaced it.** Before it there was no first row on an edge day for anything to
sort ahead of; giving the day a head created the ordering question the route had already answered.

So `early` left `map-pins.ts` and became `broughtInOvernight` in `place-usage.ts` beside the
`knowsMoment` it asks — one predicate, three readers, unchanged semantics.

**In the list it is a bucket, not a comparator**, and the reason is worth keeping: only
**transition** entries are diverted, and a span edge is never a leg's endpoint (a flexible one is
already transparent to `prevEnd`, ADR-0171 §5), so no gap, journey or adjacency can move. A re-sort
would have had no such guarantee. The one thing that had to follow the entry is the ambient strip's
sentence, which reads the **placed** edge — hence `placedEdgeOf`, or a midnight pickup silently fell
back to `יום 1 מתוך 10`.

**No journey block into the bed above it**, deliberately: the drive from the counter to the hotel
really happened and the app cannot say when, so the day says the two rows in the right order and
nothing about the road between them.

## One thing changed that was not reported

Plan's `פנוי לפני · 3 שעות · שבץ` strip now sits **below** the stay row. It was above it only
because ADR-0209 inserted a first row underneath an element that had been the head of the list — a
drop target for the morning reading above the bed it belongs after. Naming it here rather than
leaving it to be re-reported.

## Evidence

`main` was red on three of the new specs and green on two of them; both counts are in the spec
comments, because a guard labelled as a report is a lie about what was broken.

| spec                                                        | `main`  |
| ----------------------------------------------------------- | ------- |
| Plan · states when to leave for a stop before the check-out | **red** |
| Plan · puts a midnight pickup above the stay row            | **red** |
| Trip · puts the pickup row above the stay row               | **red** |
| Trip · the strip still says the pickup clock                | green   |
| Trip · no journey between the pickup and the stay row       | green   |

Plus five pure cases on `placeDayEntries` covering both halves of the predicate — a pre-dawn floor,
a pre-dawn **exact** moment (a 06:30 flight, which the bed still leads), a floor after dawn, no dawn
supplied at all, and a stay with a row of its own, which stays a stay row.

**4722 frontend tests in 270 files pass** (4711 at branch point). `format`, `typecheck`, `lint`,
`build` green.

**A harness bug found on the way, worth knowing about:** `useDayTravelReads` skips any leg whose two
ends do not both resolve to coordinates, so a fixture missing one place produces an **absent**
journey block rather than a failure — the spec then asserts against `null` and reads as a code bug.
`PlanDay.travel.test.tsx`'s `places` is mutable now, like its `DayView` sibling's.

## Still open

- **ADR-0209's per-day totals are the mockup's**, not the shipped app's, and the e2e pass over the
  five day shapes is still owed. Unchanged by this.
- **Whether the app should ever _suggest_ the return stop** (ADR-0209 §5) — the owner's.
