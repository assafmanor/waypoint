# 2026-08-26 — a floor is not a deadline, and a clamped departure is one the app may state

Three reports in one evening, all on the same 200 lines of `dayJourney`, and the shape of the
session is that **two of the three were things I had shipped hours earlier and defended in writing.**

> 1. _"It shipped but with a bug on the day prior to the car rental … we're checking in technically
>    the day after check in day, at like 2am and also after the car rental at 00:00"_
> 2. _"Why does it sometimes say יציאה ב and some other times הגעה ב? Don't we prefer consistency?
>    Maybe we should show both?"_
> 3. _"And btw it should also show the way from the car rental to the hotel, right?"_

ADR-0206 §AJ holds the decisions; ADR-0054's amendment is reversed in place. This note is what the
session cost and what to carry.

## 1 · An open floor is a deadline the app does not have (§AJ1)

Day 1 lands at `23:20`; the hotel opens `מ-15:00`. The fit measured the 1:42 drive against **15:00
the same morning** — a deadline eight hours behind its own origin — and the one leg of the day nobody
can be late for read `אין זמן לדרך`.

I shipped that line six hours earlier as the FIX for the same mistake one case over, and wrote the
wrong half into the comment: _"a floor with no close keeps the opening, which is all the app knows
about it."_ The counter-argument was already in the repo, in `windowClosesMs`' own docblock, one
function away: _"absent on an open floor, **which can be missed by nothing**."_

**Carry this:** when a fix introduces a fallback (`?: arriveByMs`), the fallback is a second
decision and it does not inherit the argument for the first. I wrote a ternary and reasoned about
one branch.

The repair names the two ideas apart — `deadlineMs` (what the journey must beat) versus
`statesLeaveBy` (whether the app will advise a departure at all) — and `undefined` is a real answer
for the first. The same read also fixes `PAST`, which was keyed on the floor's hour: at 20:00,
airborne, the block went quiet because the desk had opened at 15:00.

## 2 · The `יציאה` / `הגעה` question, and a claim I made from memory (§AJ2)

The owner's first read was that this was an inconsistency. My first answer was that the difference
is principled and that "show both" was impossible — **and I got the diagnosis of their screenshot
wrong**, saying Blue Lagoon's edge was flexible when it is a hard `15:00` commitment. They pushed
back; the actual branch is §AI2's clamp, four lines down in the same expression.

`statesLeaveBy` has two clauses. I read the screenshot against the first and never checked the
second. **The arithmetic was checkable off the screenshot the whole time** — a 60-minute hole, a
`~59 דק׳` drive, so the buffered departure is `13:56` and the church runs to `14:00`.

Once diagnosed, the owner was right on the substance too: `הגעה` was serving **three** situations
(no deadline, a window, and a leg with no slack), and the third is a _warning_ that read exactly
like the first, which is _reassurance_. So §AI2's deliberately-open question is closed by its third
option: the departure is pulled forward to the origin's own end and the arrival rides beside it —
`יציאה 14:00 · הגעה ~14:58`. `PASSED` is measured against the **clamped** instant, which is the
only reason the clock may be printed at all.

**And the width argument I gave was wrong.** I told the owner two clocks "is not close" to fitting,
from §AF4's remembered `180.75px`. Measured in Chromium on the real CSS: the box is **206.95px** at
360 and the combined sentence is **140.06px** — while the widest sentence _already shipping_ in that
slot is **171px**. §AF4's figure was measured with the free-time run and the acts mark in the same
line, i.e. a different line.

**Carry this:** a measurement is about a configuration, and quoting it outside that configuration is
memory, not evidence. Re-measuring took four minutes.

## 3 · The leg into the bed (§AJ3)

I refused this row in the morning, in an ADR amendment, with the word `deliberately`, and the
argument was: a stay has no per-day arrival instant, so the only bound available is yesterday's
check-in floor. That argument is an accurate description of **what §AI's code did to such a leg** —
`אין זמן לדרך` — and it is not a reason to withhold a row. §AJ1 removes it, so the leg is drawn and
says `הגעה ~00:31`.

**Carry this, and it is the sharpest thing in the session:** a design decision whose only argument
is "the derivation cannot express this" is a bug report wearing a decision's clothes. It read as
settled for six hours because it was written in an ADR.

Two things the leg needs that no other leg did, both now on `DayLeg` — the **edge's** own instant
(a hire's `endsAt` is its return nine days out) and which **end** of the span it leaves from
(`endpointPlaceId(from, 'leaving')` answers the _destination_, right for a flight you got off and
wrong for a hire you just collected). The second is invisible whenever a pickup and a return share a
counter, which is exactly the trip it was found on.

## A spec of mine that was vacuous, and passed for the wrong reason

`draws no journey between the pickup and the stay row` asked
`node.querySelector('.day-trv')` over the nodes between the two rows. `querySelector` does not match
the node itself — so a `JourneyRow` sitting right there answered `null`. It would have gone on
passing after the leg was added. It is now the inverted assertion, written with
`classList.contains(…) || querySelector(…)`.

## Evidence

Red before the fixes, green after: three on `dayJourney` (the fit, the `PAST` gate, the clamped
departure and its two-sided late mark), one on each day surface for the reported day-1 shape, and
three on `JourneyRow` pinning which of the three sentences each situation gets. One existing spec
changed its expectation on purpose — §AI2's `withholds a departure it could not have been made
from` — and says why in place.

`format:check`, `typecheck`, `lint`, `build` green; full frontend suite green.

## Still open

- **ADR-0209's per-day totals are the mockup's** and the e2e pass over the five day shapes is owed.
  Unchanged by this, and now one row wider on an edge day.
- **`TRAVEL_BUFFER_SECONDS` is still an untuned placeholder** (§D5), and §AJ2 is the first case that
  makes its value visible in a sentence: the buffer is what withdrew the advice on the reported row.
  A device pass should tune it against a tight leg, not an empty afternoon. Deferred, not decided.
- **Whether the app should ever _suggest_ the return stop** (ADR-0209 §5).
