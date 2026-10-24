# The third time the row vanished — ADR-0206 §AW

**Date:** 2026-08-31
**Subject:** one owner report on the day's transit row, and the sentence in it that decided the shape of the fix.

## What came in

> _"Bug found in the transit row (walking, driving, cycling…). The journey from Katla Ice Cave to
> the supermarket was set to walking (1 minute, 50 meters) and I changed it to driving. Then the row
> vanished and could not be returned. That happened before on different causes."_

The screenshot is the Iceland day: `Katla Ice Cave 15:00-18:30` above `קניות בסופר 18:30-20:00`, and
between them nothing at all where every other hole on the day draws a journey.

## The arithmetic, which took one grep and no reproduction

⁦50 m⁩ clears `ROUTE_MIN_CROW_M` (⁦10 m⁩), so the pair is routed and every mode answers. On foot that
is ~⁦37⁩ seconds → ⁦1 דק׳⁩, which is what the owner was reading. By car it is ~⁦12⁩ seconds → **nought
minutes**, and `dayJourney`'s 2026-08-26 floor answers `null` below half a minute. The mode control
renders on the journey block, so the block going away took the way back with it.

## The report's last sentence is the whole design decision

_"That happened before on different causes."_ It had: §AM6 (a declared תחב״צ leg), §AM10 (a mode past
its ceiling), §AU1 (a number still being computed). Three sessions, three arms, each argued from its
own cause — and each ADR section says, in its own words, that the block is the only thing carrying
the control. **The rule had been written three times and never generalised.**

So this one is keyed on the input the three share and none of them named: **somebody picked the
mode.** A leg the app guessed keeps the floor exactly as it was aimed (a ⁦20 m⁩ hop still draws
nothing); a leg a person chose keeps its row whatever the app has to print in it.

## Which is what found the fourth member, before it was reported

Stating it over the choice rather than over the number made a second path into the same failure
visible with no report behind it: a chosen mode with **no estimate at all**. The server's gate can
refuse a mode the client cannot refuse — `sameClusterOnly` against a point missing from the cluster
set, whose own docblock admits _"a point in no cluster at all answers `false`"_ — so `refusedFor` is
false, `warmingFor` goes false when the day stops asking, and that leg fell through the same floor.
That is §AM10's original report (_"I changed a drive to a walk and the route simply disappeared"_)
with the half nobody had reached, and it is fixed here by arriving inside the rule rather than beside
it.

**The class:** a floor that suppresses noise has to ask who made the noise. The app's own guess and a
person's choice are not the same input, and a surface that took a choice owes the way back.

## One extraction, for one reason

`legTravelMode` puts the derivation behind the override, which makes a leg's mode one answer — and
makes a derived drive and a declared drive indistinguishable at every call site. The new read needs
the other question, so the loop moved into `legModeOverride` (newest row wins, canonicalised pair)
and `legTravelMode` is three lines over it. **Deliberately the presence of the ROW, not
`modeFor !== defaultModeFor`:** since §AU2 the default moves with the distance, so an override can
come to agree with it and is still a row somebody wrote — still clearable only through the control
the block carries.

## What the suite said

Nothing inverted; every existing spec was untouched, including the 2026-08-26 floor's own, which now
reads as the "nobody chose this" half of a pair. The new coverage is in five files, and the two
screen specs are the ones that matter: `frontend/CLAUDE.md`'s both-day-surfaces rule is also §AM9's
own lesson, and §AM9 exists because M8b shipped this control in `DayView` alone.
