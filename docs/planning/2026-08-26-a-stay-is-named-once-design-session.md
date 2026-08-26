# 2026-08-26 — where a stay is named in the day, and how many times (design session)

**Decides:** [ADR-0209](../decisions/0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) (new) ·
[ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) **§AI** (amended in place)
**Drawn in:** [`mockups/a-day-starts-and-ends-at-a-hotel-v1.html`](../../mockups/a-day-starts-and-ends-at-a-hotel-v1.html)
**Reverses:** [ADR-0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md)'s 2026-08-25
_"sequence only, no new rows"_ — partially, and §2 of it is kept in full
**Branch:** `claude/a-stay-is-named-once`

> Orientation only. The decisions are ADR-0209 and ADR-0206 §AI (root `CLAUDE.md`, _durable vs.
> scratch_). Nothing here is authoritative.

## The forks put to the owner, and the answers

**1 · Should this be drawn at all?** Asked, because the previous round's answer was _no_ (three of
five field reports were already-drawn states, so a new mockup would have re-decided settled things).
Here: yes — nothing in `mockups/` drew a stay's row, it changes the structure of the densest surface
in the app one round after a whole round on its density, and it reopens two ADRs. **Answer: yes.**

**2 · How should the app take "we're going back to check out at 09:20" from you?** Put as a fork.
**Answer: as a stop you add** — an ordinary event at the stay's own place, offered from the stay row.
It needs no schema change and arrives with the leg, the polyline, the gap arithmetic, the leave-by and
the settle pair already attached; a marked instant on the stay buys a clock and costs a migration, a
DTO field, a cache mirror and a ripple rule. Backlogged only as a fallback that would _replace_ the
stop.

**3 · What does the stay row's own time say by default?** Put as a fork. **Answer: the leg's
departure or predicted arrival** — the time the day actually gives you — with the stay's bound quiet
beside it.

**4 · Where does the row go?** Four drafts, three killed by the owner reading the drawing. This is the
session's actual content; the table below is the route and ADR-0209 §1/§3 is the result.

## What the render found, which is the whole reason for the format

**Two errors in this file's own frames, both of which flattered the proposal**, caught by rendering
rather than by reading:

- the middle-night "today" column omitted the wake journey block that ADR-0206 §AD **ships** —
  overstating the cost by ⁦58px⁩ and hiding the finding that motivates the file (a leg whose origin row
  does not exist);
- the hotel-mention counter included the car hire, which sits in the band on both sides, burying the
  one number the section is about.

**Three defects in shipped code**, all read off the drawing by the owner:

1. **A check-out row sorts below the stop before it and above a journey that departs earlier**
   (ADR-0209 §3). `edgeAt` pulls a ceiling back before a **booked** transport departure; ADR-0206
   added one the app _derives_, which it cannot see.
2. **A leave-by counted back from a check-in window's opening** as though a floor were a deadline —
   `יציאה 16:18` to arrive the instant the door opens, with nothing due until ⁦20:00⁩
   (ADR-0206 §AI1).
3. **A leave-by with no clamp against its own origin**, landing at ⁦16:18⁩ inside a stop running to
   ⁦16:40⁩ (ADR-0206 §AI2) — and §AH2's newly widened tolerance is what uncovered it, because the
   2-minute shortfall that used to read as `OVERRUNS` (printing no leave-by at all) now reads as
   fitting.
4. **And the late mark that follows from (2)**, which the owner caught before it could be written
   down wrong: withholding the printed departure would have left `arm: PASSED` firing off the
   invented deadline, so the row goes `--miss` at ⁦16:19⁩ and the board says `באיחור`. The gate is on
   the leave-by, not the sentence — §AI1's second half.

## The path through the three drafts, kept because the wrong answers were wrong the same way

| draft | what it said                                                              | what killed it                                                                                                               |
| ----- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | leave the check-out at its bound; the map carries "you started here"      | reads as returning to the hotel after driving away — owner: _"the checkout row sits below svartifoss, which makes no sense"_ |
| 2     | a check-out is the day's first row, a check-in its last                   | owner's counter-examples: coffee at 08:00 then a check-out at 11:00; a check-in at 15:00 then an attraction and dinner       |
| 3     | **no position changes; the row and its journey merge into one statement** | stands — and is the cheapest of the three                                                                                    |

The generalisation the owner's counter-examples force, and the sentence the ADR turns on: **the app
does not know when the transition happens**, so every position is a fiction and choosing a different
fiction is not a fix. What contradicts is two rows about one event printing two clocks.

## What the BUILD found, after the owner approved the drawing

Both ADRs shipped the same day. Two things the drawing could not have told us:

- **A third face of §AI1's mistake**, found by a spec that would not go green: the **fit** measured
  to the window's OPENING as well, so `אין זמן לדרך` fired about a check-in you had three more hours
  to make — and "arrives after it closes" was unreachable, because `OVERRUNS` got there first. The
  fit measures to the close now.
- **§AG6 was only half fixed, and Plan had been right all along.** It recorded the sub-hour hole as
  solved by setting `DayBlockEntry.from` on every adjacency; the leg was derived and then not
  rendered, because Trip's list read `{join && <JoinRow/>}` and `gapBetween` is floored. Plan gates
  on `prevEnd`, so it had been drawing that leg since M6a — the two day surfaces disagreeing about a
  fact, which is what ADR-0159 §1 forbids. **Checking both surfaces is what found it**, which is the
  rule `frontend/CLAUDE.md` states and the reason it is stated.

Four fixtures were wrong before they were right, and all four were wrong by asserting against the
design rather than by sloppiness: one expected a leave-by from a hole whose leave-by is behind its
own origin; one stretched an event until it contained the check-in it measured to, so the two
clustered and there was no leg; one expected two journey blocks where the new return leg makes three;
one passed an id to a helper that takes only a partial.

## For the next session

- **The day-level measurements in ADR-0209 are still the mockup's.** The shipped row is measured
  (⁦54px⁩, constant across all four bound states); the per-day totals are not, and an e2e pass over
  the five shapes is owed.
- **Open, and the owner's:** whether the app ever _suggests_ the return stop, rather than leaving it
  to the gap strip and `＋ אירוע חדש`.
- **The row has no label**, on the owner's question — position and bound each already say which end
  it is. If a build re-adds one, that is a reversal and wants a reason.
- **Open, deliberately:** whether the app ever _suggests_ the return stop, rather than leaving it to
  the gap strip and `＋ אירוע חדש`. A draft answered it with a button on the stay row and that was
  refused for rendering an offer as a statement.
- **One control has to move with the removed edge row:** ADR-0184 §2 gave a _floor_ its settle pair in
  the list (`היינו`, which clears `נותרו היום` — ADR-0171 §6). It belongs on the stay row now.
