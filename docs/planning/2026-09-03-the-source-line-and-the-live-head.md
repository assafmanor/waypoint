# The source line, and what the head speaks for — two owner reports off the shipped weather card

**Date:** 2026-09-03 · the day [ADR-0218](../decisions/0218-a-forecast-expires-and-the-widget-goes-rather-than-lies.md) shipped (PR #791)
**Mockup:** [`mockups/a-card-carries-its-own-source-v1.html`](../../mockups/a-card-carries-its-own-source-v1.html)
**Status:** drawn, measured, and **built the same day** — the owner took all three forks (_"let's build everything discussed here (the mockup, according to your recommendations), and the weather follows you"_). Recorded as ADR-0218's 2026-09-03 amendment §A/§B/§C, which also amends ADR-0180 §9.

## What came back

The owner opened the merged build on a phone and reported three things. One is a
defect and is **fixed in this change**; two are design and are drawn rather than decided.

1. **The day strip printed `ש׳׳`.** A defect — see below.
2. _"The 'data from MET Norway', 'rates by exchange rate api' are fine, but I think that they
   should be inside the card itself, otherwise it looks a little bit out of place. Let's mock
   this up to figure out what looks best."_
3. _"Today's weather should update based on where we are right now or where we're headed. Not
   the start of the day."_

## The defect, and why no test caught it

`t.weather.weekday(letter)` appended a geresh to `weekdayLetter(date)`. ICU's Hebrew
`weekday: 'narrow'` **already returns one** — `ש׳`, not `ש` — so the strip rendered `ש׳׳`.

**The spec asserted the bug.** `WeatherCard.test.tsx` queried
`t.weather.weekday('ש')` and the component rendered `t.weather.weekday(weekdayLetter(date))`;
both sides went through the same wrapper, so the test agreed with the code about a fact
neither of them had checked. Querying by `t.*` is the right rule (`frontend/CLAUDE.md`) and it
does not protect a **derived** string — only a literal one. What would have caught it is the
thing that did: rendering it. `App.tsx`'s day pills have always called `weekdayLetter` bare,
so the app already contained the answer.

Fixed by deleting the wrapper. The geresh is ICU's, not the app's grammar.

## Fork A — where the source line lives (report 2)

**[ADR-0180](../decisions/0180-currency-is-derived-and-a-rate-is-a-glance-card.md) §9 already
drew "inside the card" and rejected it**, on a structural ground rather than a visual one:
`RateCard` is one `<button>`, an `<a>` inside a `<button>` is invalid markup, so "inside" was
never a placement — it was a decision to drop a link the source's terms require. It then died
on the render as well, wrapping to three lines.

**Half of that constraint is gone.** ADR-0218's build log made `WeatherCard` a plain region
(v1 has nothing to open), so an `<a>` inside _it_ is valid today. The question the owner is
asking has genuinely changed since it was last answered, which is why the mockup is a v1 of
its own rather than a re-run of §9.

Three placements drawn, measured at 360 and 390 in both themes:

|        | what it is                                                | cost                                        |
| ------ | --------------------------------------------------------- | ------------------------------------------- |
| **א׳** | a line under each card — what ships                       | the baseline                                |
| **ב׳** | inside for weather, outside for the rate                  | **+0px**, and one section with two grammars |
| **ג׳** | inside for both, `RateCard` split into box + inner button | **+1px** a card, **+2px** the section       |

**The recommendation is ג׳**, and ב׳ is the trap rather than the cheap option: it puts one
source inside a card and another outside it, side by side, with no rule a reader could state.
That is the split ADR-0078/0079/0094/0095 exist to undo, and on screen it is obvious.

**What ג׳ costs, stated rather than smoothed:** `RateCard` stops being one `<button>`. ADR-0180
§3's decision survives in substance — one target for the whole card, still opening the
converter — but the box and the press stop being the same element, and that is exactly what
buys the legal link.

**A measurement that changed the design mid-file.** The first render put ג׳ at **+9px a card**,
because the foot brought its own padding while the card kept its own. Paying for the foot out
of the padding the card was _already holding_ (the strip's trailing `12px`, the rate row's
`--space-3`) takes it to **+1px**. The 44px touch floor is met by the same `::after` overlay
`.fx-attr-link` already ships — measured at **47.2px** against a **15.2px** visible line.

## Fork B — the head follows the clock (report 3)

**This is not a defect in `dayAnchorCoord`.** That function is a whole-day consensus _by
construction_ — the coordinate sibling of `dayAmbientZone`, built for daylight, where one
sunrise serves the whole day. What the report asks for is the sibling that does not exist: the
coordinate twin of `liveZone`.

So the derivation is `liveAnchorCoord(nowMs, evidence, destination)`, on the same `ZoneEvidence`
bundle, mirroring `liveZone`'s three rules — **with one inversion that is easy to miss**:
`dayAnchorCoord`'s `eventKnownCoord` _abstains_ on a crossing booking, because a thing that
moves you between two places cannot testify about where the day sits. The live answer is the
opposite: mid-transit reads the **destination**, which is ADR-0107 §8's standing rule
(_"mid-flight belongs to where you're heading"_) and is also the half of the report that says
_"or where we're headed"_. `liveZone`'s 12-hour window covers the rest of it — an hour before
the drive, the next place is already the answer.

**Only the live day moves.** A Saturday three days out has no "now", and its whole-day
consensus is exactly right, so the rest of the strip stays on `dayAnchorCoord`.

**The head has to name its place, and the drawing is what establishes that.** Today the head
carries no place name at all. Anchored live and unnamed, a travel day would show `22°` over a
היום tile reading `31°` — two true facts that read as a contradiction with nothing on screen to
explain it. The mockup therefore moves the head **and** the היום tile together, and puts the
place into the head's existing `.wx-cond` run as `place · condition` rather than adding a fifth
element: measured **46px → 46px**, so the name is free.

This promotes the brief's **W6** (_"forecast at the next place, not just this one"_), which the
feature list had as a `Could` and the backlog deferred. The owner's version is sharper than the
one recorded there: not "the next day's anchor" but the live one.

## Fork C — found by rendering, in neither report

With the head naming its place, §4's frames make something visible that **is already in the
shipped card**: the head and the first strip tile are the same day at the same place, so they
print **the same number twice, 60px apart**. That is precisely the duplication ADR-0214
measured (a confirmation code twice) and ADR-0215 measured again (`19:00` four times), each
time removing it.

Drawn as §5: the strip starts at **מחר**. Cost **+2px** (a dashed beyond-tile's border), and it
brings one further day onto the screen without scrolling.

**This one is genuinely the owner's** and is not a correction being handed back: the היום tile
also carries the place name, which the head only gains if fork B is taken. The two stand or
fall together.

## What is NOT in the mockup, deliberately

The daylight widget is a labelled dashed box at its measured `105px`, not a drawing. It has no
source and therefore no attribution line, so it is not part of this question — and the sibling
file already paid for the alternative: an earlier version of
`weather-as-a-glance-card-v1.html` hand-wrote that widget and the owner read the stub as a
second _design_.

## What the build found that the drawing had not

**One, and it changed the shape of the head.** §4 drew `place · condition` and measured it free
(46px → 46px). It never drew `place · condition · **amount**`, which is the real worst case on a
rainy day — and at 360px that overflows, 149px into 127px. With `.wx-cond` as a single
ellipsising run, the run that disappears is the **amount**: last in the string, and the one fact
W4 exists for (_"the single most actionable fact; the reason 'do I need an umbrella' beats 'what
is the weather'"_).

So the head ships as three flex items — place, separator, detail — and **only the place may
shrink**. Context gives ground; the answer does not. Added to the mockup as §6, which now reports
`תקין · השם מקצר, הכמות שלמה` at 360 and `שום דבר לא מקוצץ` at 390.

The general lesson is the one `frontend/CLAUDE.md` already states under "when a value gets WIDER":
the row shape is a decision, not an inheritance. What is new is that it applies to a run **inside**
a slot as much as to a slot inside a row — and that the ellipsis picks its victim by source order,
which is not where the importance is.
