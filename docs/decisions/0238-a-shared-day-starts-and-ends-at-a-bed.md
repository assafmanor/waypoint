# 0238 — A shared day starts and ends at a bed, on every night it covers

**Status:** Accepted 2026-09-21. **Built** the same day.
**Date:** 2026-09-21
**Reported:** the owner — _"The live sharing schedule + pdf don't take hotels check in / check out
transits into account like the day view / plan day screens do, where the day starts and ends with
going from / to the hotel. Thinking of it, I'm not even sure that it works correctly on ambient days
(not check in / out days)."_
**Drawn in:** [`mockups/a-shared-day-starts-and-ends-at-a-bed-v1.html`](../../mockups/a-shared-day-starts-and-ends-at-a-bed-v1.html)
**Extends:** [0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) (the app-side rule this
carries to the two shared renderers), [0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)
(the projection contract and the two renderers that consume it),
[0206](0206-a-travel-time-belongs-between-two-points.md) §AD/§AS (the bookend legs),
[0232](0232-a-journey-is-between-two-placed-stops.md) (the chain that already runs between placed
stops), [0048](0048-index-build-data-model-refinements.md) (the cleared `Event.placeId` that
three of the findings below come back to)

## Context

### The probe first: the day surfaces are right, including on an ambient day

The report's own doubt is answered before anything is changed, because it decides whether this is
one defect or two. **`DayView` and `PlanDay` handle a middle night correctly**, and they do it
without a rule for it:

`dayBookendStays(events, date)` (`lib/glance.ts`) asks two independent questions over the ambient
spans covering that date — `woke` is the stay whose span began **before** today, `sleeps` the one
whose span runs **past** tonight. A check-in day answers only `sleeps`, a check-out day only `woke`,
**a middle night answers both with the same stay**, and a hotel-change day answers each from its own
span. There is no third branch, so there is no ambient case to get wrong. Both day screens read that
one function (`DayView.tsx:909`, `PlanDay.tsx:428`), and `DayView.travel.test.tsx`'s whole
_"the walk out of the bed"_ suite is fixtured on a stay running `2026-08-01 → 2026-08-05` asserted
on `2026-08-03` — _"a strictly middle one: ambient in both directions, and the case no edge row can
stand in for"_. It asserts three journey blocks (out of the bed, on to the theatre, back into the
bed) and what the third one says. 184 tests green on this branch before a line was changed.

So the ambient day is not the defect. **Sharing is**, and on three counts.

### F1 · A shared day has no bed at either end, and no leg to one

Both shared renderers already draw a travel leg: `journeyLookup` reads the **cached** route between
consecutive placed stops and hands it to the destination row, which prints it as `.sh-journey` /
`.pdf-journey` (`נהיגה · 34 דק׳ · 41 ק״מ`). What the chain has never had is an **end**: it starts at
the day's first scheduled row and stops at its last. The two movements the app calls the most
certain — out of the bed you woke in, and back into the bed you sleep in ([ADR-0206](0206-a-travel-time-belongs-between-two-points.md)
§AD and §AS, `DayView.tsx`'s `wake` and `home` legs) — are drawn on neither surface.

They could not be, because the bed is not on the page as a position. `SharedDay.stay` is a **name in
the day's header**, put there by [ADR-0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
fourth amendment for a good reason (as a row it sorted into the afternoon by its check-in hour and
printed `15:00–11:00` across midnight) — and that is the same objection [ADR-0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md)
answered for the app, by splitting the two facts apart rather than by removing the row. The app's
answer has been shipped since 2026-08-26 and sharing never received it.

### F2 · A stay frames one night out of N, and the check-out prints on the wrong morning

This is the half of the report the owner was unsure about, and it is real — in the projection.

`groupByDay` files every event into exactly one bucket, keyed off `event.date`; its own comment says
so (_"An ambient multi-day span is listed on the day it starts, once"_), and that is correct for the
**schedule**. But the frame is derived from the same buckets: `stayRows[i]` is
`dayEvents.find(event => event.booking?.type === HOTEL …)`. So for a stay checked into on the 1st and
out of on the 5th:

| day             | `day.stay` | `day.checkOut`                 |
| --------------- | ---------- | ------------------------------ |
| 1st (check-in)  | the hotel  | —                              |
| 2nd             | **absent** | **`עד 11:00`** ← wrong morning |
| 3rd, 4th        | **absent** | —                              |
| 5th (check-out) | **absent** | —                              |

`stayMoments` computes the check-out from `stays[index - 1] && previous !== stays[index]` — "last
night you slept somewhere else" — which is true of the **2nd** once the frame vanishes after day one.
It then reads the instant off that row's own `endsAt`, which is the real check-out four days away, and
prints its `HH:MM` on a card four days early. A reader of an eleven-night trip sees the hotel named
once and is told to check out of it on the second morning.

It also silently starves the one derivation documented to read this per night: `tripShapeOf` is
_"the run-length encoding of `day.stay`"_, and it survives only because the encoding skips absent
entries — a star trip and a rolling trip produce the same array of one.

### F3 · Every booked stop is invisible to the travel chain

The projection knows about [ADR-0048](0048-index-build-data-model-refinements.md)'s cleared
`Event.placeId` in four places and says so in each (`stopEventOf`: _"Not `event.placeId` — ADR-0048
clears it on every booking-backed row, so reading it alone put the day's hotels, restaurants and
tickets at nowhere"_; `settledLabel`, `photoEventOf`, `projectEvent` the same). **`journeyLookup` is
the fifth call site and the one that does not**: it resolves each end as
`event.placeId ?? event.booking?.fromPlaceId` / `?? event.booking?.toPlaceId`. A non-transport
booking carries its place on `booking.placeId`, which neither branch reads.

So a booked restaurant, a ticketed attraction and a hotel all resolve to **nothing**, the pair is
skipped, and — because `prevId` is only advanced by a row that resolved — the chain carries the row
**before** it forward and prints the next leg from the wrong origin. A day of four booked stops shows
no legs at all; a day that alternates draws a leg across a stop the reader can see. This is
load-bearing for §1 below rather than a drive-by: a hotel is a booking-backed row, so the bed has no
coordinates at all until it is fixed.

## Decision

**One rule, and it is [ADR-0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md) §1 applied
to a second pair of renderers:** where the day starts and ends is certain and gets a **position**;
when you check out or in is a bound and gets a **quiet annotation that positions nothing**.

### §1 · The shared day's schedule opens and closes at a bed

`SharedDay` replaces `stay` + `checkIn` + `checkOut` with two symmetric frames:

- **`wokeIn`** — the stay whose span began before today. Absent on the trip's first morning.
- **`sleeps`** — the stay whose span runs past tonight. Absent on the last night out.

Each carries the place name, and (Full and above) the stay's own bound in the existing `SharedTime`
shape — a check-out ceiling on `wokeIn` (`עד 11:00`), a check-in floor or window on `sleeps`
(`מ-15:00`, `17:00–21:00`). **On a middle night the two name the same hotel and the day prints it
twice, because those are the day's two ends** — the same answer ADR-0209 §1 took for the list and
ADR-0054's amendment took for the map, and `DayView`'s shipped test asserts by name (_"names the
stay as the day's two ends, and not in the strip as well"_).

The derivation is the app's, not a second one: `wokeIn` is `date > stay.date`, `sleeps` is
`date < stay.endDate`, asked of the spans covering the day — `dayBookendStays`' two comparisons,
which is why an ambient day needs no case here either. The projection's **buckets do not change**;
what changes is that the frame is asked of the spans covering a date rather than of the one bucket
the span was filed in, which is also F2's fix: the check-out prints on the morning you leave.

A stay is still **not a schedule row** (ADR-0209 §2, ADR-0054 §2): it sorts into no daypart section,
opens no daypart heading, and counts toward nothing.

### §2 · The leg at each end is the journey line the page already draws

Nothing new is minted for the movement. `SharedEvent.journey` — mode, minutes, km, read from the
cache and never computed — is extracted to `sharedJourneySchema` and reused:

- **The leg out of the morning bed** rides the day's **first scheduled row**, because `journey`
  already means _the leg INTO this row_ and that is exactly what it is. The chain is seeded with
  `wokeIn`'s place instead of starting empty.
- **The leg into the evening bed** rides **`sleeps.journey`**, the one new place it can live,
  measured from where the chain stands after the day's last placed row.

The chain rule is unchanged — [ADR-0232](0232-a-journey-is-between-two-placed-stops.md)'s placed-stop
carry-forward, so a placeless row between the last stop and the hotel is crossed rather than breaking
the drive home, the same way the app's `run.tail` does it.

**The cache is the honest limit, and it is stated rather than worked around.** `/s/<code>` is
unauthenticated, so the projection reads stored legs and never asks a provider (that rule predates
this and stands). A bed leg nobody has looked at in the app has no line, and the frame prints its
name alone — the same degradation every other leg on the page already has.

### §3 · `journeyLookup` resolves a stop the way the rest of the file does

Both ends go through `eventStopPlaceId(event, event.booking)`, the shared derivation the other four
call sites in that service already use. F3's defect is one expression, and fixing it is what gives
§2 a hotel with coordinates.

### §4 · Paper states the same two facts, in paper's own grammar

The PDF prints the frames as the first and last **row** of the day block rather than as a clause in
its header, so the day reads bed → stops → bed on A4 as it does on the phone. Both renderers consume
the same two fields; neither reformats the other's markup ([ADR-0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)
§4). The stay keeps its teal (it is a **place**, ADR-0028) and its bound keeps amber (a **time**);
the row adds no third hue.

This costs paper, and the cost is the measurement the mockup exists to produce — see the table in
§Consequences. It is taken for the reason ADR-0213's own §7 lesson gives: the reader page and the
PDF diverging about **what is stated** is how the teal route strip kept printing for a week after it
was deleted from the page, _"the same defect one renderer behind"_.

### §5 · Summary keeps the frames and loses the clocks

`wokeIn`/`sleeps` publish their **names** at every level — where you sleep is the shape of a trip,
which is Summary's whole job, and it is already published today. The bound and the journey are Full
and above, with every other clock and every other leg. No new field is sensitive, and none is added
behind a toggle.

## Consequences

- **The contract breaks, deliberately.** `SharedDay.stay`/`checkIn`/`checkOut` are gone rather than
  kept beside the new pair: two ways to say where you sleep is what ADR-0079/0094/0095 each exist to
  undo, and `strictObject` turns a stale renderer into a parse failure rather than a silent omission.
  `tripShapeOf` now reads `sleeps` per night and its docblock stops describing something that was not
  happening.
- **Touches:** `packages/shared/src/sharing.ts` (the two frames, `sharedJourneySchema` extracted),
  `backend/src/sharing/sharing-projection.service.ts` (the frame derivation, the seeded/closed chain,
  `journeyLookup`'s resolution), `frontend/src/screens/SharedItinerary.tsx` + `shared-itinerary.css`,
  `backend/src/sharing/itinerary-pdf.template.ts` + `.copy.ts`, `frontend/src/i18n/he.ts`. No
  migration, no new query, nothing stored.
- **A day gains up to two rows on both renderers, and the cost is measured rather than estimated.**
  Off the mockup's own DOM, at 360 and 390 (identical at both) and in both themes:

  | day shape       | reader card                | hotel mentions |
  | --------------- | -------------------------- | -------------- |
  | middle night    | ⁦540px⁩ → ⁦706px⁩ (+⁦166⁩) | ⁦0⁩ → ⁦2⁩      |
  | check-out day   | ⁦540px⁩ → ⁦601px⁩ (+⁦61⁩)  | ⁦0⁩ → ⁦1⁩      |
  | check-in day    | ⁦540px⁩ → ⁦645px⁩ (+⁦105⁩) | ⁦0⁩ → ⁦1⁩      |
  | change of hotel | ⁦540px⁩ → ⁦706px⁩ (+⁦166⁩) | ⁦0⁩ → ⁦2⁩      |
  | no hotel        | ⁦540px⁩ → ⁦540px⁩ (⁦0⁩)    | ⁦0⁩ → ⁦0⁩      |

  **Today's column is `0` mentions on every shape but the check-in day**, which is F2 measured
  rather than argued: the card that names the hotel is the one the span was filed in, and the other
  four name it nowhere. A bed row is ⁦55px⁩ — `.sh-event`'s own geometry, no new shape — and the
  journey line above it is the shipped ⁦36px⁩ `.sh-journey`.

  The middle night's +⁦166px⁩ is the same trade [ADR-0209](0209-a-stay-is-named-once-in-the-day-it-belongs-to.md)
  measured at +⁦159px⁩ for the app's middle night, and it is taken for the same reason: the four boxes
  buy the two legs.

  **On paper a day block is ⁦245px⁩ → ⁦320px⁩ (+⁦75px⁩)**, so ⁦900px⁩ across a twelve-day trip against a
  ⁦1071px⁩ A4 column — roughly four tenths of a page at two-column density. ADR-0213 §4's targets are
  density targets and not truncation rules, and this is inside that allowance.

- **The bed row is quieted rather than drawn as an ordinary card** (`.sh-bed`, three declarations;
  `.pdf-bed`, one). Position alone says "this is the edge of the day" on a day that has stops; on a
  day whose schedule is otherwise empty it does not, and a frame that reads as a stop somebody
  scheduled is the wrong claim. Both arms are a control in the mockup.
- **F3's fix changes legs on days this ADR is not about.** A day of booked stops that drew no journey
  lines will draw them, and a day that drew one across a booked stop will draw two shorter ones. That
  is the defect being fixed, and it is called out because the diff for §1 does not explain it.

## Alternatives considered

- **Keep the stay in the day header and add a `לינה ← לינה` clause.** Rejected: it states the two
  beds without stating the day's shape, and it leaves the two legs with nowhere to hang — which is the
  whole report.
- **Name the hotel once on a middle night.** Tempting, and it is the direction every other ADR-0213
  amendment has gone (_"eleven `לינה` lines is the wall of text"_). Rejected for ADR-0206 §AD's
  argument, which is why ADR-0209 reversed the same instinct for the app: a leg drawn out of an
  origin that is not on the page is a journey with an invisible start. The repetition buys the two
  legs; without them there is no reason to draw it twice.
- **Compute the missing bed legs server-side when the cache has none.** Rejected outright: `/s/<code>`
  is an unauthenticated route, and a page that can make the server fetch is a rate-limited outbound
  amplifier behind an 8-character credential. The existing read-only rule is not weakened for a
  prettier day.
- **Expand an ambient span into one bucket per night in `groupByDay`.** Rejected: it fixes the frame
  by breaking the schedule — a four-night stay would become four rows, which is precisely what that
  function's comment was written to prevent. The frame asks about coverage; the schedule asks about
  filing. Two questions, one bucket list.
- **Put the check-out on the row it belongs to and leave the frame alone.** Rejected: there is no row.
  ADR-0213's fourth amendment removed it, correctly, and this is what the frame is for.

## CORRECTED 2026-09-21, same day — a stay is named once, and the row carries no label

The owner, on the built page: _"make it read once on a middle night"_, and _"I see that it says
`מלון קליפורניה` /new line/ `לינה` which looks odd. Should at least be the other way around, or
let's think what exactly it should read."_

**Both corrections are subtractions, and ADR-0209 had already made both of them for the app.**
That is the finding worth recording: §1 carried the app's rule to two new renderers and then
spent two decisions the app had already spent the other way.

### §1a · Where both ends are the same stay, only the foot is published

`wokeIn` and `sleeps` are a real pair of facts and stay a real pair of fields — but on a middle
night they are the **same stay**, and that is exactly the day on which the head frame carries
nothing the foot does not: the same name, and no bound at all, because a middle night is neither
edge of its stay. Two rows, one name between them, no clock on either. So the projection publishes
only `sleeps` there — the end the day reaches, and the one the drive home lands on.

**What the head row was load-bearing for survives the subtraction.** ADR-0206 §AD's argument — a
leg drawn out of an origin nobody can see is a journey with an invisible start — is answered by
naming the origin instead of drawing it: `SharedJourney` gains **`from`**, set on exactly one leg
(the walk out of that bed), and printed with the same word and the same binding the app already
spends on the same situation (`t.travel.from`, [ADR-0232](0232-a-journey-is-between-two-placed-stops.md)
R3's `מ־{origin}`). So the day opens `מ-מלון קליפורניה · נהיגה · 7 דק׳ · 2.4 ק״מ` and closes on
the bed itself.

A day whose two ends are **different** stays still draws both rows: a hotel change names two
hotels, which is not repetition.

### §1b · The row carries no label, and its bound brings its own noun

The row shipped as `.sh-event`'s grammar whole — including `<b class="sh-kind">לינה</b>` under the
name. That is the **event** row's caption on a row that is not an event, and ADR-0209 §1 had
refused exactly this label on exactly this row: _"No label … because the row's position and its
bound each already say which end this is (owner: 'do we really need the label? what's its
purpose?')."_ What it left was a line holding one word, on every night with no bound to put beside
it — which is what the report is pointing at.

So the label goes, and the second line states the **edge this day is**, which is the app's own
`edgeSentence` (`lib/transitions.ts`): `צ׳ק-אאוט · עד 11:00` at the head, `צ׳ק-אין · מ-15:00` or a
window at the foot. Neither word is new — they are the day header's own two moments, which §1
moved onto the rows. **A day that is neither edge of its stay has no second line at all**, and a
middle night's row is then its glyph and its name: `🏨 מלון קליפורניה`.

Paper states the same two facts and differs only in **layout**, which is ADR-0213 §4's rule: the
clock stays in the column that is for clocks, so the copy column carries the noun alone.

### What it cost, re-measured off the revised drawing

Both corrections make the feature cheaper, which is the honest argument for them:

|                      | first build                              | corrected                                  |
| -------------------- | ---------------------------------------- | ------------------------------------------ |
| middle night         | ⁦540px⁩ → ⁦706px⁩ (+⁦166⁩), ⁦2⁩ mentions | ⁦540px⁩ → ⁦632px⁩ (+⁦92⁩), **⁦1⁩ mention** |
| A4 day block         | ⁦245px⁩ → ⁦320px⁩ (+⁦75⁩)                | ⁦245px⁩ → ⁦278px⁩ (**+⁦33⁩**)              |
| twelve days on paper | ⁦900px⁩ of a ⁦1071px⁩ column             | **⁦396px⁩**                                |

The check-out, check-in and no-hotel days are unchanged (+⁦61⁩ / +⁦105⁩ / ⁦0⁩), and the hotel-change
day keeps its two rows and its +⁦166px⁩ — it is the one shape where two rows name two things. The
one number that grew is the journey line, ⁦36px⁩ → ⁦42px⁩, on the single leg per day that now carries
an origin: at ⁦360px⁩ that name wraps it to two lines. Taken, because the alternative is the leg
with no origin the correction exists to avoid.

## Build log — four things the build decided, and one it found in its own diff

**A collapsed card keeps the bed on its header.** The drawing shows an open day, and the reader
page is an **accordion**: every card but one is its header alone, so the header is the scanning
surface for a twelve-day document. Dropping the bed from it would cost a reader the one fact they
scan for. Shipped: the header names `sleeps ?? wokeIn` when the card is **closed** and steps back
to the day's summary when it is open, where the two rows say it with their legs attached. One
hotel is therefore named once on a closed card and twice on an open one, never three times.

**Summary draws no bed rows, and the render is what decided it.** They first shipped at every
level and `pdf-browser.service.spec.ts`'s real Chromium pass put the nine-day reference trip onto
**two** pages, against [ADR-0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)
§4's one. §1's argument for giving a bed a position is that a leg drawn out of an invisible origin
is a journey with no start — and Summary has no legs, no clocks and no addresses, so there is
nothing for the position to serve. §5 stands as written for the **fact**: it publishes at every
level, and below Full it publishes where it always did, on the day header's own line.

**`stayEndKey` widens `dayBookendStays`, knowingly.** The app's version gates on `isAmbient`, which
needs `isMultiDay` (`endDate > date`), so a one-night booking recorded as `17:00 → 13:00 tomorrow`
with no `endDate` is not a bookend there and stays an ordinary row in the day list. Here it cannot
be: every hotel row is lifted out of the schedule before the sections are built, so a stay this
rung did not cover would vanish from the page entirely — and that is the reference trip's own
guesthouse, caught by an existing assertion rather than by review. The honest fix is on the data
(a stay crossing midnight should carry `endDate`), which is ADR-0063's territory; backlogged there
rather than answered with a third derivation.

**A bound exists only on the day its edge does.** `bedTime` is asked for the START edge on the
evening bed and the END edge on the morning one, and both are gated on the date actually being
that edge's own day. Without the gate a middle night's morning bed printed the span's `endsAt` —
an hour that happens on a different date, which is this ADR's own defect one day out instead of
four.

**And the `15:00–11:00` defect came back the moment the stay did.** `sharedTimeOf`'s `exact` arm
appends the event's `endsAt`, which for a stay is a check-out days away and reads backwards
because the span crosses midnight — the exact reversed range ADR-0213's fourth amendment pulled
stays out of the schedule for. A bed's check-in now takes only its own bound, and a closed window
keeps its own ceiling (ADR-0184 §1) because that arm sets it itself. Guarded in the derivation
rather than in the fixture: a stay with no `category` is a real row, and a fixture that dressed
one up would have asserted the right clock for the wrong reason.

**And the first push went red, on the one suite that compiles the e2e fixtures — which is
nothing.** `frontend/tsconfig.json` is `include: ["src", "vite.config.ts"]`, so `e2e/` is outside
the program: retiring `SHARE_DAY_SUMMARY_KIND.STAY` left `e2e/shared-itinerary.spec.ts` serving a
day whose `kind` was `undefined`, the reader's own parse refused the projection, and **twelve
specs timed out waiting for a `.sh-page` that never rendered** — after typecheck, build and 7,936
unit tests had all gone green. The fixture now carries `sleeps` instead, so the e2e suite also
covers the new rows. Closing the gap itself is one line and 18 pre-existing errors in five other
spec files, so it is backlogged rather than ridden in here; the rule it leaves behind is that **a
change to this contract is not verified until the e2e suite has run**.

### What was verified

A real Postgres and the repo's own seed, so the projection's **integration** spec ran rather than
being written blind — which is the whole point here, since all three findings are about what a
query returns. Four new specs over a two-night stay with a booked dinner: the frame on all three
days, the check-out on the morning you leave and **on no other**, both legs (with the morning bed
carrying none), and the booked stop back on the chain. Backend 1406 passed, frontend 5918 passed,
shared 612 passed; the A4 smoke render is one page at Summary and two at Full.
