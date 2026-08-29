# 0212 — A flight is a line that is also a commitment

**Status:** **Proposed.** Drawn, measured and rendered; nothing built. §1's four candidates are a
fork for the owner, and §4 is a question the drawing cannot answer.
**Date:** 2026-08-29
**Reported:** the owner, the day after ADR-0210 shipped — _"We've recently added a new design for
driving/walking etc. between stops. Now I want to add a similar design for flights. It doesn't have
to include time estimates for now (but distance why not)"_ — and corrected in the same breath:
_"thinking of it of course we have times, because the flights have estimates when filling it."_
**Drawn in:** [`mockups/a-flight-is-a-line-v1.html`](../../mockups/a-flight-is-a-line-v1.html)
**Session note:** [2026-08-29](../planning/2026-08-29-a-flight-is-a-line.md)

**Amends** [0210](0210-a-day-is-points-lines-and-envelopes.md) §1 and §3 — it is that ADR's
taxonomy asked about the one row it named only in passing.
**Extends** [0206](0206-a-travel-time-belongs-between-two-points.md) §D1 (spending the
solid/dashed distinction a second time), §D5 (read from its other end) and §V1.9 / §AP (the day's
total).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (a flight is hard, and nothing here
moves it or estimates it), [0028](0028-plan-violet-color-budget-dark-ready.md) rule 4 (no new hue),
[0017](0017-mobile-first-device-targets.md), [0159](0159-the-day-says-what-is-between-two-events.md)
§1 (Trip and Plan differ in posture, never about a fact).

## Context

### 1. This is an amendment to ADR-0210, not an extension of it

The obvious reading of the report is "do to a flight what we did to a drive". The obvious reading
is wrong, and ADR-0210's own §1 is why: a point _"keeps the box … once the other two families give
theirs up it becomes the **only** committed mark in the list, which is what it always meant."_

A flight is the loudest commitment a day holds. Drawing it as a line spends the exact mark that ADR
had just finished reserving — twenty-four hours earlier. So this cannot be a fourth local decision
about one row; it has to answer what the taxonomy does with a row that is **both** families at once,
which ADR-0210 never had to ask. It names a flight only in passing, and only as a point: _"a flight
departure is `exact` — a moment you can miss"_, and _"a landing"_ among the points.

### 2. A flight is a movement AND a commitment, and the day currently draws only the second

Measured on the owner's own Iceland day 1, with the app's own `haversineMeters` over real airport
coordinates: the day moves ⁦5,292 km⁩ by air and ⁦69 km⁩ by road. The ⁦69 km⁩ is the only part of it
the day draws as movement. The other 98.7% renders as two stationary boxes.

### 3. The grammar this needs is already decided, twice

`DayConnector`'s own comment, written before any of this existed: _"Dashed because a straight
segment is not the route you will walk — drawing it solid would claim it is — which also leaves
**solid + amber** unspent for a real Routes polyline later."_ ADR-0206 §D1 then spent solid+amber on
the routed map line.

So the app already says: **dashed is a line we guessed, solid is a line somebody can stand behind.**
A booked flight is the second. The flight's track therefore needs no new hue, no new weight and no
new idea — it is an existing distinction applied to the one row nobody had asked about.

### 4. The owner's correction is the sharpest rule in the file

ADR-0206 §D5 — _"Never state a confidence we do not have"_ — is always read as "hedge what you
computed", which is where `~23 דק׳` comes from. Read from its other end it also says: **do not hedge
what you were told.** A drive's duration is an estimate the app produced; a flight's is two clock
faces a person typed off a booking. Same row, same grammar, opposite confidence:

|          | reads             | why                                               |
| -------- | ----------------- | ------------------------------------------------- |
| a drive  | `נסיעה · ~52 דק׳` | an estimate, hedged (§D5)                         |
| a flight | `טיסה · 4:20 שע׳` | authored, and hedging it would be a false modesty |

The tilde is the entire difference, and it needs no class of its own: the flight's head is
`.day-trv-hd` and its distance `.day-trv-dist`, verbatim.

### 5. Crow-flies is not a fallback here — it is the right number

ADR-0206 §D4 has to call crow-flies _"the floor"_ because a ⁦1.9km⁩ crow leg is a ⁦2.4km⁩ walk. A
great circle **is** roughly the flight path, and `TRAVEL_GATE` refuses flights on purpose
(`admittedTravelModes`' own comment: _"Tokyo→Paris is a flight, and ADR-0011 already says nobody is
estimating a hard commitment"_). That stays true and nothing here asks a provider for anything: the
distance is `haversineMeters` over two coordinates the booking already holds, pure and offline.

## Decision

### §1 · The flight keeps its box and sits on the line — candidate ב

**A bead on a string.** The track runs the full height of a wrapper around the flight card and
overshoots the ⁦10px⁩ gutter at both ends, exactly as ADR-0210 §3's does, so it reaches the row above
and the row below; the card paints over it, so the line is seen in the gutters and the flight keeps
its box, its lock, its confirmation code, its document/task marks and its detail sheet.

Measured, it costs **⁦0px⁩** — the card is the height it already was (⁦90px⁩ at 360, ⁦71px⁩ at 390).

Its track is **solid** where the drive's is dashed, per §Context 3. The result is that the day
becomes one continuous thread that changes texture: solid where it was booked, dashed where it was
estimated.

**The three rejected candidates, and the measurement is the argument for two of them.**

- **א — the flight loses its box.** The most consistent reading of ADR-0210 and the most expensive:
  `.day-trv` carries no lock, no confirmation code, no document or task marks and no detail sheet.
  That is not "a row that looks different", it is deleting four ways in from the surface you are
  standing on when a flight is going wrong. ⁦38px⁩ against the card's ⁦90px⁩.
- **ג — the envelope.** `.journey`'s container around one leg's two ends. Draws well and measures
  **⁦95px⁩**, the tallest row in the day, and the two ends it adds as rows are the two words already
  printed in the card's own title (`routeTitle`) — height paid for information already on screen.
- **ד — a low card.** ADR-0210 already rejected this shape for the drive (_"a shorter box with the
  same tile is the same silhouette"_), and here it also takes height off the day's strongest
  commitment. ⁦72px⁩ / ⁦53px⁩.

### §2 · The two icon columns are ⁦5px⁩ apart, and a track through both forces the fix

**Found by rendering, not by reading, and the reading was wrong.** The stylesheets say ⁦4px⁩:
`.day-trv`'s `--trv-track` is `calc(12px + 19px)` and the event badge's centre is `15px + 20px`.
The live measurement says **⁦5px⁩** — `.wp-event` also carries a `1px` border, and the face's padding
starts inside it.

Nothing has ever had to care, because no line ran through both columns. `.day-trv-ic`'s own comment
claims the opposite in good faith — _"the day has ONE leading edge for icons and this joins it
rather than starting a second"_ — and at ⁦5px⁩ that has been true enough for two badges sitting
still. It is not true for a line: rendered, the hand-off is not a line at all but two parallel ones.

**`--trv-track` moves to the card's column** (`calc(15px + 20px + 1px)`), which is one declaration
and shifts the drive's mark ⁦5px⁩. The alternative moves every event badge in the app.

### §3 · The day's total does not silently absorb the sky

`dayTravelTotal` (`lib/day-joins.ts:744`) sums every journey's metres unconditionally, so the moment
a flight carries a distance the day's total goes **⁦69 ק״מ⁩ → ⁦5,362 ק״מ⁩, 78×**, and the number that
answered _"how far does this day go"_ stops answering it.

**The recommendation is the split line** — ground and air as two numbers in `.day-total`'s existing
row — with ground-only as the live cheap alternative. Combining them is rejected outright: it is not
a preference, it is a number that no longer means what its own row says.

**And the glyph goes with it.** `DayTravelTotal`'s docblock already refuses a mode glyph — _"a
`walking` glyph here would be the same false claim the copy just dropped"_ — and keeps `navigate`. A
total that is 98% airborne under a navigation arrow is that same sentence one row later, so the
airborne half takes `flight`.

### §4 · `formatDistance` has never seen four digits

`lib/distance.ts:20` rounds to whole kilometres above ⁦10 ק״מ⁩ with no thousands separator, because
nothing in this app has ever handed it more than a ring-road leg. A flight prints `2931 ק״מ`. One
`toLocaleString` fixes it, and the mockup's §3 renders both so the difference is looked at rather
than argued.

### §6 · One defect the drawing nearly shipped

The bead's wrapper rule named `.wp-event` only — true while a flight run was a single card, and
false the moment §5 groups two legs inside `.journey`: the rule stops matching, and the track paints
**over** the cards instead of behind them. It is the same class of defect as the specificity tie in
ADR-0210's build log, and it was caught the same way, by looking at the render rather than at the
rule. A build must state both children.

## Open, and the owner's call

- **Which candidate.** §1 recommends ב and measures the other three.
- **Whether a flight enters `dayTravelTotal` at all**, or only the split line's second half. §3
  recommends the split; ground-only is the zero-work answer and is drawn beside it.
- **Which side the ⁦5px⁩ closes on.** §2 recommends moving the drive's track.
- **Whether the Vienna place records are the cause of §5's defect** — worth one look at the data
  before anything is built on the grouping.

### §5 · What sits between two flights is a layover, never a gap

**The owner's correction, mid-session**, on the mockup's first draft, which had copied the
screenshot: _"it shouldn't show that there's a gap, unless the gap is between flights (in
layovers)."_ Two legs of one journey are never free time, however long the wait.

**Nothing in this is new policy — it is the policy `joinBetween` already has.** It asks for a
connection _before_ a gap and lets it win outright, in its own words, _"or asking the gap rule first
would label a seven-hour layover as an empty afternoon"_, and `ConnectionBand` + `.journey` have
drawn exactly that since ADR-0159. So the flight run groups inside the container that already
exists — root rule 8, and the reason nothing here mints a second grouping — and the track spans the
**run** rather than one leg, which is also the honest drawing: one journey, two legs, one line.

**So the behaviour in the screenshot is a confirmed defect.** The _cause_ is not, and is kept as a
hypothesis: every other condition in `connectionMinutes` holds — same type, route-shaped, ⁦3h⁩ inside
the ⁦24h⁩ flight window — which leaves exactly `a.toPlaceId !== b.fromPlaceId`
(`booking-journey.ts:109`), i.e. two different Vienna place records. **Unverified against the
owner's data.** If that is it, the fix is a data or place-picker question rather than a design one,
and it is worth confirming before §1 is built on top of the grouping.
