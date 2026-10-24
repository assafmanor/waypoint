# Which end of the day the hotel was — two reports off the shipped bookends

**Date:** 2026-08-26
**Kind:** implementation (follow-up to M7c)
**Decides:** [ADR-0054](../decisions/0054-ambient-span-events-off-the-day-schedule.md) — two amendments, both in place
**Board:** [routes epic](2026-08-24-routes-epic-milestone-board.md) — M7c

## What prompted it

M7c shipped and the owner ran it. Two reports:

> You can't see from the map where you check in or out from (unless you connect the lines). This is
> tricky because deciding to number hotels means that when you stay on the same hotel … the same
> hotel is going to be numbered twice which is weird.

> An edge case where we rent the car at 00:00 and then go to check in at the hotel. Then it shows
> the hotel as starting before the car rental.

## Report 2 — the ordering, and why it is not a Pandora's box

The owner's instinct was that this opens a general problem: _"I'm feeling like the second issue opens
a Pandora's box to many ambiguities as to what comes before what."_ Worth taking seriously, and the
answer is that it does not — but establishing that took **three readings of the data, two of them
wrong**, and it is the reason this note exists.

A probe over `buildDayStopSequence` with the same midnight car pick-up against three shapes of the
same trip:

| shape                                                     | sequence before the fix                                 |
| --------------------------------------------------------- | ------------------------------------------------------- |
| **A** booked as the night of D-1, in **02:00**, out 10:00 | `hotel@10:00 → depot@00:00 → museum#1@11:00` ❌         |
| **B** booked wholly on D (a same-day stay)                | `depot@00:00 → hotel@02:00 → museum#1` ✅ already right |
| **C** ordinary stay, nominal 15:00 floor on D-1           | `hotel@10:00 → depot@00:00 → museum#1`                  |

Two guesses preceded that table. The first assumed a check-**in** day and could not reproduce it at
all; the second found a middle night that matched the symptom and was still the wrong branch. Only
the owner's correction — _"we're checking in super late at night (like 2am) and checking out in the
morning of that same day"_ — identified **A**, where the day reads as a check-**out** because that is
how a hotel counts a 02:00 arrival. **The reproduction was the deliverable; the fix was four lines.**

**The rule: nothing whose instant precedes the stay's own check-in can sort after it.** Deliberately
_not_ a dawn cut-off, which was drafted first and would have needed a zone to apply. Instant against
instant, so:

- **A** is fixed: `depot@00:00 → hotel → museum#1`.
- **C** is left exactly as it was, on purpose. The arrival was genuinely yesterday afternoon, so a
  00:00 errand may equally have been a trip out and back — the data does not settle it, and inventing
  an answer is precisely how a bookend becomes a general theory of what precedes what.

That is what keeps the box shut: **the rule only fires where the data already decides.** The
hotel-change day the owner raised next (_"check in at a different hotel at the end of the day"_)
needed nothing at all — each span answers only about itself, so the compressed stay takes the head
and the new one the tail.

## Report 1 — three swallows, and none of them was the design

The owner rejected numbering, correctly, and gave the reason that turned out to be diagnostic: on a
middle night one pin would wear **two numbers**. A number is an ordinal and one pin cannot hold two.
But _which end of the day this is_ is not an ordinal — and "both ends" is one coherent state. So the
answer was never a new mark; it was the word slot ADR-0141 already built. Three separate things were
eating it:

1. **A zoom rule that asked about the pane when the question was about the pin.**
   `.map-pane[data-pins='dot'] .map-pin .pin-tag.plain { display: none }` dropped the neutral tag in
   **every** scope, reasoning that "a text-scale claim on a ⁦5px⁩ dot" is a smudge. The dot tier is
   **scoped**, though: in day scope only `.aside` degrades. So a full-size numbered stop below ⁦zoom
   11⁩ — a ~⁦30km⁩ span — kept its size and lost its word, which is exactly the owner's _"only when
   you're very much zoomed to the hotel"_. **Deleted, not rescoped:** the corrected rule is inert,
   because the only day-scope pin that becomes a dot is `.aside` and `Map.tsx` withholds the word
   from aside pins outright.
2. **`behind` silenced the check-out you had already done.** Right for a word meaning _what happens
   next here_; wrong for a stay, whose word says which END of the day this place was, which the
   afternoon does not falsify. A stay is exempt; every other tier stays silent.
3. **A middle night had no word to un-silence.** It takes one of its own — `לינת לילה`, the owner's
   wording, neutral rather than amber because it is where you are sleeping and not a commitment on
   the clock.

**The owner's own call closed it without a mockup:** _"maybe it should just read as a different
label … then nothing needs mocking up"_. That is right, and it is worth naming why — a **word** in an
existing slot spends no new axis, where a mark would have spent one on a ladder
[ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) §AC3 already recorded as
full.

## What is not covered by a test, stated rather than implied

**(1) is CSS at a zoom tier and jsdom applies no CSS.** It was established by reading the `--pin-u`
rules it sits beside — which is what showed the premise was false — not by a spec. The two
`map-pane.css` contract tests parse the file but assert nothing about this rule, and `MapPane`'s own
dot-tier specs deliberately assert **markup** (they say so: _"Which pins actually shrink is a CSS
question, and jsdom applies no CSS"_). So the deletion is argued, not proven, and the argument is
recorded in the CSS where the next reader will meet it.

(2) and (3) are `pinTransition` and are specced.

## Two specs changed sides rather than being deleted

The third and fourth time on this branch, which makes it the local idiom rather than a one-off:

- `a strictly-middle stay night says nothing day-scoped` → `says לינת לילה`. Its old comment argued
  the silence was correct _"exactly as the row is"_. The row can afford it; the canvas cannot,
  because this is the one pin sitting at both ends of the route.
- The `behind` silence keeps its spec **and gains its counter-example** — a departed flight still
  says nothing, so the exemption is visibly the stay rather than the tier.

## Corrected the same day: the rule above used a number that proves nothing

The ordering fix shipped in [#710](https://github.com/assafmanor/waypoint/pull/710) and the owner ran
it: _"the route shows it before the car pick up"_ — unchanged.

**`startsAt` is not the arrival.** A lodging start is a floor, which is the one thing ADR-0171 §10b
exists to say is not a moment; the rule then compared against it as though it were. On the real
booking the room was available from 15:00 the previous afternoon while they were in the air until
23:20, so every stop of the day fell after it and nothing moved. Table A in the section above is
still a true reading of the data — the fix built on it was not.

**The specs stayed green through all of it, and that is the part worth carrying.** The fixture
carried a 02:00 check-in _on the day itself_, because that was the shape the rule was reasoning
about — so it proved the rule against the rule. And the spec covering the owner's real shape existed,
asserting `moves NOTHING`, with a comment arguing the ordering was genuinely unknown. **A fixture
built from the rule proves the rule; take the shape from the report.**

The replacement is the dawn boundary this session had drafted and discarded, plus the half that makes
it safe: a stop sorts ahead of the stay when it is **before dawn** _and_ **not a moment the app
knows**. A car "available from 00:00" is a floor and moves; a 06:30 flight is exact and does not, so
the early-departure morning still reads `hotel → flight`. Dawn arrives as an instant from the screen
(`dayWindowMs`, lifted out of `Home.tsx` so the glance's rail and the route share one boundary),
because a wall-clock hour needs a zone and this file holds none. ADR-0054 carries the trade it costs.

**And the label was never wrong.** The same report asked why the pin read `צ׳ק-אאוט` instead of
`לינת לילה`: the stay is one night, so that day is the check-out day and `צ׳ק-אאוט` is the true word.
`לינת לילה` belongs to a strictly middle night. Two screenshots settled it in one reading — day 11
shows `צ׳ק-אין 15:00`, day 12 shows `צ׳ק-אאוט` — which is worth noting because the previous three
rounds of this bug were all lost to guessing at the data instead.
