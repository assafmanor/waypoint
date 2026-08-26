# 2026-08-26 — a claim stands on something (M6d)

**Milestone:** M6d of the routes & travel-time epic ·
[board](2026-08-24-routes-epic-milestone-board.md) ·
**Decides:** [ADR-0208](../decisions/0208-a-claim-needs-something-to-stand-on.md) ·
**Amends:** [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) §AE1 / §AE3 ·
**Extends:** [ADR-0207](../decisions/0207-a-fix-may-withdraw-a-claim-it-may-not-make-one.md)
**Branch:** `claude/m6b-hero-read-routes-wlxj67`

> Orientation only. The decision is ADR-0208 and the status is the board (root `CLAUDE.md`,
> _durable vs. scratch_).

## Three reports, two mistakes

M6c deployed and three things came back in one message. Two of them turned out to be one habit: **the
app asserting what it had not earned.**

1. `15 · מהיציאה` — the word chosen in the morning, reported as unclear by the afternoon.
2. On the way after a **skip** — the leg measured out of a place nobody went to.
3. `נדחה` on a move the server refused.

## The one that is worth remembering

**A skip says nothing about place in either direction.** That single sentence decides the whole of
report 2 — including the repair that looks obvious and is worse. You may have skipped the café while
standing outside its door, or skipped it from three neighbourhoods away; so the skipped stop is not
somewhere you are, and the stop **before** it is not somewhere you are either. Walking back trades a
wrong claim for a stale one, and it errs in the dangerous direction: a longer leg is an earlier
leave-by is a **more confident** late mark.

So the origin is neither trusted nor replaced. It is reported **denied**, and a denied claim licenses
nothing on its own — which is the same §D4 absence the surface already treats as ordinary. A device
fix stands it back up, which is ADR-0207's thesis with a settle mark as a second input.

## The word, and why the reversal is not a fork

§AE1 refused `באיחור` this morning on v2 §3's ground — the app cannot know whether you are late or
walking. That was true of a surface with nothing but a clock and it is no longer true of this one:
the tile prints only after `בדרך`, a device fix and the plan's own claim have each had a chance to
withdraw it. The owner asked for the word and the ground for refusing it had already moved; the
distinction that keeps §Z5 §M4 intact is that `אתם באיחור` is a sentence about people and `באיחור` in
the unit slot is a measurement, like `לסגירה` and `ליציאה` beside it.

**And the word alone was not enough** — reported within the hour, and the second report is the
sharper one: _"15 what? Minutes? And what does this mean — that the event started 15 minutes ago or
that we should've left?"_

Both questions are one defect seen from two sides. The unit slot has always carried **either** the
measure (`דקות`, arm 1) **or** the referent (`ליציאה`, arm 2), never both — and `באיחור` carried
neither, so the number floated against the board's default referent, which is the next event. That
is the wrong reading, and it is the reading the tile invited.

So the arm spends a second unit line and says all three parts: `15 · דקות באיחור · ליציאה`. Two
rules came out of building it. The measure word is **`formatCountdown`'s own**, because a hardcoded
`דק׳` labels `1:10` as minutes the first time a drive is an hour late — and the spec asserts the
word _changes with the rung_ rather than asserting the word. And the two lines are **explicit**
rather than a `max-width` and a hope, because wrapping-by-width lands wherever a font fallback puts
it.

**Measured at 360 against the real stylesheet, which is what chose the axis.** One line was the
first instinct and the numbers killed it: the tile's content box is ⁦48px⁩, `באיחור ליציאה` is
⁦63.56px⁩ of ink (an ⁦89.56px⁩ tile — ⁦16px⁩ off the title) and the full sentence ⁦81.73px⁩ (⁦107.73px⁩).
Height was the cheap axis: `דקות באיחור` ⁦55.63px⁩ / `שעות באיחור` ⁦56.39px⁩ takes the tile to
⁦81.63/82.39px⁩ wide and ⁦55→68px⁩ tall, which is **⁦6px⁩ of board height and ⁦7.6px⁩ of title** in this
arm — and nothing at all where the title already wraps, since the row is ⁦86px⁩ either way.

Worth keeping for the next copy question in this slot: the tile was measured with the app's own
`board.css` and `tokens.css` **loaded**, not with values copied into a scratch page. Seven phrasings
were rendered, and the four that read best were the four that did not fit.

## Two specs that were passing for the wrong reason

Making `applyDelay` report its own failure turned two green specs red immediately, and both were
green for reasons that had nothing to do with what they claimed to test:

- **The mocks returned a bare event** where `moveEvent` parses a `{ event }` envelope, so `zod` threw
  on every "successful" move. The verb swallowed it and `applyGuardedDelay` returned a hardcoded
  `true` — so the spec asserted a successful apply against a response that **fails in production**.
- **The clock was never pinned**, so the new past-target guard refused every fixture nudge. That is
  `frontend/CLAUDE.md`'s own rule and this is exactly the failure it describes: fixtures carry fixed
  instants, so an unpinned spec means something different every day it runs.

The lesson is the shape rather than the two bugs: **a verb that cannot report failure makes its own
tests unfalsifiable.** The false toast was the reported symptom; the untestability was the cost.

## What refused the postpone, which is not what the report guessed

The owner read the refusal as adjacency — _"it's next to a later event with no gap at all"_. There is
no such rule anywhere: the backend computes a **ripple suggestion** for an overlap and `DayView`
already renders it with yes/no, so an overlapping nudge succeeds and offers to push the chain. What
refused this one was `MOVE_INTO_PAST`, on a stop whose start had already gone by — and
`t.toast.moveIntoPast` has said so in as many words since T-010, where nobody could read it because
the success toast landed on top of it.

**And allowing it is a real option that is not taken.** Re-anchoring the nudge to the clock would make
the commonest press work instead of refusing — the reason it is deferred is ripple, which shifts each
following event by the **mover's own delta** (the thing that preserves the gaps between them). A delta
measured from now rather than from a stale start can be hours, so one tap would push the rest of the
day into tomorrow. Ripple has to learn a clearing delta first. On the backlog.

## Checks

`pnpm format` / `lint` / `typecheck` / `build` clean. **Frontend 267 files / 4597 tests**, all green
— **14 new** against `main`'s 4583: `hero-travel` +4 (the denied claim, and that it does not walk
back), `Home.leave-by` +7 (the reported case end to end, the fix standing it back up, `done`
changing nothing, the three-part sentence, and an hour-plus lateness labelled in hours), `Board` +1
and `HeroLift` +1 (both unit lines, on both elevations), and `verbs` +2 whose file count nets out
against the two mocks they corrected (the refusal before the queue, and a failed write reported as
one).
