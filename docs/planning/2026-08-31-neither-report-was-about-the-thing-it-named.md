# Neither report was about the thing it named — ADR-0213 §14

**Date:** 2026-08-31
**Subject:** two owner reports on the shared reader, and the fact that both diagnoses moved once the code was read.

## What came in

> _"the day titles has gotten a little messy: too many line breaks, questionable ordering of the
> details. Let's discuss and fix. This applies to both the live sharing page and the pdf"_

> _"between day parts (morning, noon, afternoon, evening, night), the transit line (driving,
> walking...) gets omitted. It should be there (on the most fitting part of the day)"_

Both arrived with screenshots. Both name a **layout** as the problem, and neither problem is one.

## The first: a combinator, and the third thing it caught

`.sh-day-copy span` is (0,1,1) and sets `display: block; color: var(--muted)`. That is right for the
header's three lines and it also describes every span **nested** inside one — which for a week
nothing was, and then two amendments in two days put spans inside a line: the twelfth gave the
frame a `.sh-stay-when`, the thirteenth gave `SharedTimeText` a `.sh-said`/`.sh-time` pair so the
Hebrew would stop printing as tofu in a mono face. `צ׳ק-אאוט עד 11:00` was thereafter six grey
blocks stacked down the card.

**The part worth keeping:** the sheet already documented this selector catching two other things it
never meant to (`.sh-stay .icon` losing its `gap`; `.sh-stay-when` written (0,2,0) to outrank it),
and both times the repair worked _around_ the specificity and left the wide selector where it was.
The first two repairs are why there was a third.

There was one real ordering fault under the mess, and it is a deletion: the check-out named the
hotel being **left**, so the card read future → past → future with a place painted amber inside the
clock's run.

## The second: not a daypart bug, and the fixture is the proof

The sections a shared day renders are cut from the same rows `journeyLookup` walks, so a section
boundary cannot lose a line — which is the first thing to check and rules the report's own
diagnosis out in one read. What the pairing did was `events[i - 1] → events[i]`, so a row with **no
place at all** broke the chain on both sides. The owner's screenshot has two such rows (`Katla Ice
Cave`, `צפייה בזוהר הצפוני`), and the one leg that survived is the one whose two ends are both
placed.

The spec's fixture is placed → placeless → placed with a stored leg for the two **ends** and none
for either adjacent pair, so it can only pass if the middle row was skipped. Sabotaging the
carry-forward turns it red — which is the check that separates a spec that pins the fix from one
that merely runs beside it.

## What was put to the owner, and what was not

The header change was put as a recommendation and taken (_"I agree with your recommendation - do
it"_). The journey pairing was not put at all: it has a cost, but the alternative to paying it is
printing nothing, so there is no fork — the cost is written into the ADR (§3) and into the backlog
line for the app's identical gap instead. **A correction is not a fork**, and neither is a
trade-off with only one side.

## What the mockup was for, given both fixes were already decided

`mockups/the-day-frame-says-three-things-v1.html`, and its proposed-CSS block is empty on purpose:
the fix is `>` in four rules and a deleted field. What the file draws by hand is the **regression**,
scoped to a `.mk-was` column at (0,2,1), so the defect stands beside its repair on one page and the
numbers are read rather than claimed — ⁦180px⁩ → ⁦107px⁩, `rgb(97,104,122)` → `rgb(145,94,30)`,
0 journey lines → 1.

## Addendum, 2026-09-01 — the wrap the permission bought

> _"The check in text and check in time are separated by a line. It currently reads
> `Check out <time> · check in` / `<time>` … I guess because of line wrapping. I think that it
> should read `Check out <time>` / `Check in <time>`"_

This one names its own cause and names it right. §2 of the amendment gave the clock line permission
to wrap (`white-space: normal`) precisely so a bounded pair would not be cut — and permission to
wrap is permission to wrap **anywhere**, which at 360 meant between a noun and the time it names.
Two blocks put the break at the only place a reader can predict, at identical height (⁦42px⁩ either
way, because a transfer day was already two lines).

**Paper was left alone, and that was wrong.** §2 had already measured the longest possible pair at
⁦106px⁩ of ink in a ⁦295.5px⁩ box on A4, so the joined run provably never wraps there — from which I
concluded there was no defect on paper and left the `·`. The owner's next line was
_"you straight up didn't do what I asked. I wanted a line break between the check out and check in
times"_.

The measurement was correct and it answered the wrong question. The break is **how the two moments
read**, not a wrap being repaired — so "does paper suffer the wrap?" was never the test, and the
previous report's own words (_"this applies to both the live sharing page and the pdf"_) had already
said which surfaces a change to this line covers. Root `CLAUDE.md` names this exact move: measure
the trade to show the cost of the change you made, not to avoid making it.
