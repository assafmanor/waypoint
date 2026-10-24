# 2026-08-29 — A flight is a line (design session)

Promotes [ADR-0212](../decisions/0212-a-flight-is-a-line-that-is-also-a-commitment.md), drawn in
[`mockups/a-flight-is-a-line-v1.html`](../../mockups/a-flight-is-a-line-v1.html). **Approved and built
the same day** — the ADR's build log is the record of what changed on the way.

## What was asked

The owner, the day after ADR-0210 shipped, with the Iceland day-1 screenshot:

> We've recently added a new design for driving/walking etc. between stops. Now I want to add a
> similar design for flights. It doesn't have to include time estimates for now (but distance why
> not). Do we need mockups for this?

Then, unprompted, in the next message:

> Yes and thinking of it of course we have times, because the flights have estimates when filling it

## The answer to "do we need mockups", and why it was split

**Distance on the flight card: no.** `haversineMeters` and `formatDistance` already exist, are pure
and work offline. One value on a row that already renders is an adjustment, not a decision — root
`CLAUDE.md`'s "write only what a future reader would otherwise get wrong".

**A flight drawn as a line: yes**, on four grounds, and the first is the one that settles it:
ADR-0210 §1 hands the box to commitments _on purpose_, so this is an amendment to a decision
accepted the previous day rather than an extension of it. Also: ADR-0210's taxonomy names a flight
only as a point; a flight is a booking (a card with a lock, a code, documents, tasks, a detail
sheet) where a drive is a derived row with none of those; and a flight-shaped line already
half-exists as `.journey` + `ConnectionBand`, so root rule 8 says extend that rather than add a
second — but _which_ of the two it extends is exactly what a drawing settles and prose does not.
ADR-0206 §M also states outright that nothing in this domain ships without one.

## The correction, and how it was taken

The owner's second message withdrew their own caveat. Per root `CLAUDE.md`'s "a correction is not a
fork", the duration was drawn **into** the recommendation rather than offered beside it — and it
turned out to be the sharpest rule in the file. ADR-0206 §D5 is always read as "hedge what you
computed"; read from its other end it says "do not hedge what you were told". A drive's `~52 דק׳` is
an estimate; a flight's `4:20 שע׳` is two clock faces a person typed. Same row, opposite confidence,
and the tilde is the whole difference.

## What reading the code changed

1. **The ask is an amendment, not an extension** — above. This reframed the file from "draw the
   flight as a line" to "draw four candidates and measure what each costs".
2. **The solid/dashed grammar was already decided twice** and fits exactly. `DayConnector` reserved
   solid+amber in writing; ADR-0206 §D1 spent it on the routed map line. Dashed = guessed, solid =
   somebody can stand behind it. A booked flight needs no new paint at all.
3. **The day's total breaks the moment a flight carries a distance.** `dayTravelTotal` sums
   unconditionally: ⁦69 ק״מ⁩ → ⁦5,362 ק״מ⁩, 78×.
4. **The total's glyph would become the second false claim of its own docblock**, which already
   refuses a mode glyph in as many words.
5. **`formatDistance` has never seen four digits** — `2931 ק״מ`, no separator.

## What the render found that the reading did not

**The two icon columns are ⁦5px⁩ apart, and the code says ⁦4px⁩.** `--trv-track` is `12+19`, the event
badge centre is `15+20`; the live measurement is ⁦5px⁩ because `.wp-event` also carries a `1px`
border the face's padding starts inside. Rendered, a track through both columns is not a line but
two parallel ones — which kills the recommended candidate outright until the columns align. It
became a control in the file, and §2 of the ADR.

`.day-trv-ic`'s own comment claims the day has _"ONE leading edge for icons"_. At ⁦5px⁩ that was true
enough for two badges sitting still, and false for the first thing that had to travel between them.
This is the same class of defect ADR-0210 exists to remove — a rule that reads correct and paints
wrong — found the same way, by drawing it.

## Forks left open for the owner

1. Which candidate (ב recommended; א, ג, ד measured and rejected in the file).
2. Whether a flight enters `dayTravelTotal` at all — split line recommended, ground-only drawn
   beside it as the zero-work answer.
3. Which side the ⁦5px⁩ closes on — the drive's track recommended, as one declaration against every
   event badge in the app.

## The second correction, mid-session

The file's first draft copied the screenshot and put a gap chip between the two flights. The owner:

> It shouldnt show that there's a gap, unless the gap it's between flights (in layovers)

Taken as a correction rather than a fork again: every frame from §2 on now draws a layover, the two
card candidates group inside `.journey` (the container that has held a multi-leg flight since
ADR-0159 — root rule 8), and the track spans the **run** rather than one leg. §1 keeps the gap chip
because §1 is the defect.

This also promotes the flagged item below by half. `joinBetween` already asks for a connection
before a gap and lets it win outright, in its own words so that _"a seven-hour layover"_ is never
_"an empty afternoon"_ — so the app already agreed with the owner and something is stopping it.

**The behaviour is a confirmed defect; the cause is still a hypothesis.** Every condition in
`connectionMinutes` holds except `a.toPlaceId !== b.fromPlaceId` — two different Vienna place
records. Not verified against the owner's data, and a data/picker question rather than a design one
if it is real. Worth one look before anything is built on the grouping.

## And one the drawing nearly shipped

The bead wrapper's z-index rule named `.wp-event` only. That was true while a flight run was one
card and false the moment two legs group inside `.journey` — the rule stops matching and the track
paints over the cards instead of behind them. Caught by looking at the render, which is the same way
ADR-0210's specificity tie was caught, and it is in the ADR as §6 so a build states both children.

## The third correction, and the build

The owner took all three recommendations (candidate ב, the split total, the ⁦5px⁩ closing on the
leg's column) and asked for it in the same PR. One more correction came with it:

> Don't call it קומה, call it עצירת ביניים, like the other vocabulary used on the app

He was right twice. `t.day.join.word.flight` has read `עצירת ביניים` since ADR-0159 — with `החלפה`
for a train and a bus, one word per mode — and `t.day.join.text` orders the parts
`word · place · length`, which is not what the drawing did either. So the mockup had invented
vocabulary the shipped copy already had. **Nothing in the app changed for it**; the mockup now
copies the composer instead of paraphrasing it, which is the same rule that makes these files
inline the real stylesheets rather than hand-copy token values.

**The most useful thing the build changed** is that "is it a flight" became `spendsSpanInMotion`
everywhere. That predicate already separates a carried leg from a car hire for ADR-0061's
bed-shaped gap, so a train and a bus now get the thread, the distance and the air total by being
what they are. The ADR is written about flights because that is what was reported; the code is
about being carried.

**And the ⁦5px⁩ turned out not to be a rule you can move on its own** — `--trv-track` positions the
track, while the glyph sits at the face's padding plus half the mark, so moving the rule alone
would have slid the line off the glyph it runs behind. The column moves as one thing.

Full list in the ADR's build log, including what was deliberately **not** built: the thread is
Trip mode's only, because Plan's rows sit inside the reorder/drag machinery that no drawing has
covered yet. Plan gets both facts, since ADR-0159 §1 forbids the two surfaces disagreeing about
one.
