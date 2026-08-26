# 0209 — A stay is named once, in the day it belongs to

**Status:** Proposed 2026-08-26. **Nothing built.**
**Date:** 2026-08-26
**Reported:** the owner, off the shipped M6a build — _"When we know that a day starts or ends at a
hotel (most days), the hotels should be added as rows at the start and end of the days. Maybe even
suggests when to check in? Maybe you could even slot it and be done with the ambiguity? … Then we'll
also gain the ability to say at what time we should leave (and check out on edge days?) … Then the
'checkout until X' / 'check in from Y' could be quieted and not appear as rows."_
**Drawn in:** [`mockups/a-day-starts-and-ends-at-a-hotel-v1.html`](../../mockups/a-day-starts-and-ends-at-a-hotel-v1.html)
**Refines:** [0054](0054-ambient-span-events-off-the-day-schedule.md) (the "sequence only, no new
rows" call this reverses, and §2's exclusions it keeps),
[0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) §10 (an edge holds a position),
[0184](0184-an-edge-can-be-a-window.md) (a closed window is placeable; the board's `missed`),
[0206](0206-a-travel-time-belongs-between-two-points.md) §AD (the bookend leg that has no origin
row), [0011](0011-hard-soft-event-model.md) (why a check-in time is not slotted)

## Context — the ask, and the three things reading the code changed about it

### 1. The owner answered this question the other way, one day earlier

ADR-0054's 2026-08-25 amendment records it verbatim: asked directly whether the day timeline should
grow a row for the stay, the answer was **_"sequence only, no new rows"_**. The stay went onto the
map's stop sequence and deliberately not into the list. Every amendment since is an attempt to make
it legible **on the map** instead — `לינת לילה` as a pin word, the un-silenced `behind` tier, the
bookend-versus-car-hire sort.

The question returning is the evidence that the map-only answer did not cover the need. That is a
reason to reverse it, not a reason to pretend it was never taken; this ADR is the reversal and
ADR-0054's amendment should be read first.

### 2. M6a made "no rows" incoherent on this surface specifically

ADR-0206 §AD built the day's **first leg out of the stay you woke in**, because it is the one leg
you are certain to make. So the shipped list can draw `נסיעה · ~7 דק׳ · יציאה 06:18` at the very top
of a day whose origin is **nowhere on screen** — a journey block with a visible leg and an invisible
start. "No new rows" was coherent before the day had routes in it. It is not now.

### 3. A stay is already named twice on one screen, and that is the defect under the ask

In the owner's screenshot `Lækjaborgir Guesthouse` appears in the `.day-ambient` band _and_ as a
`צ׳ק-אאוט · עד 09:40` row. The band's own comment says why the two agree — its sentence comes from
the day's **placed** entry (`edgeSentence`) so band and row cannot print two clocks for one edge —
which means the band entry is already a bookend row in everything but position.

So the shape of the fix is a **subtraction**, and the ask is better read as one: not "add rows" but
**one stay, one row, in the day it belongs to**.

## Decision

### §1 · Two facts about a stay are certain, and only those get a position

The app knows, for any day of a stay, exactly two things it can stand behind: **you started the day
there**, and/or **you end the day there**. It does _not_ know when you checked out or checked in — a
ceiling says "out by 09:40", a window says "in from 17:00", and where in the day you actually walked
through the door is not a fact we hold.

So the two are split, and that split is the whole decision:

> **Where the day starts and ends is positioned. When you check out or in is not.**

- The stay is the day's **first row** where it covered last night, and its **last row** where it
  covers tonight — `dayBookendStays`' `{woke, sleeps}`, which the map already reads.
- **It carries no clock.** The row is the place and, **quietly**, the stay's own bound
  (`צ׳ק-אאוט עד 09:40`, `צ׳ק-אין 17:00–20:00`) — which **positions nothing**.
- **The leg stays an ordinary journey block**, above the row or below it like every other leg in the
  day (§3). The times live there: the departure where the destination has a deadline, the predicted
  arrival where it has a window.
- **No label.** `TransitionRow`'s label slot is dropped here, because the row's position and its
  bound each already say which end this is (owner: _"do we really need the label? what's its
  purpose?"_).
- The positioned edge row is **gone from the list**, which is the owner's _"quieted and not appear
  as rows"_ — and with the band entry gone too, one stay is named once per day.

The band keeps every ambient span that is not a stay with a row — the car hire's `יום 5 מתוך 10` is
neither end of anything and stays exactly where it is.

**The day's own events never move.** Nothing here re-sorts a stop.

**Nothing new is minted.** The row is `TransitionRow`'s shipped tree minus its label; the quiet
sentence is the band's own `ambientSpanLabel`, relocated rather than reworded; the leg is
`JourneyBlock`; the authored return is an `EventCard`. Proposed CSS: **two rules**, and the shrinking
across the drafts is the argument — every version that added structure was defending a claim the app
cannot make.

**One control has to move with the row.** ADR-0184 §2 gave a _floor_ its settle pair in the list
(`היינו` on a check-in, which is what clears it out of `נותרו היום` — ADR-0171 §6). With the edge row
gone, that pair belongs on the stay's own row. A build that drops it re-opens the report ADR-0184
§2 fixed.

### §2 · ADR-0054 §2 is kept in full — a stay's row is not a schedule block

No block, no rail width, nothing added to `נותרו היום`. A stay is not something you _perform_ at a
point in the day, so the row carries no settle pair and no amber on a middle night. This is the half
of ADR-0054 that was never in question and the half most easily lost by a build that treats the new
row as an event.

### §3 · The day draws a leg one way, and the stay row carries no clock

**Reversed from draft 3 by the owner's question** — _"why don't we get a `נסיעה` row after the morning
and before svartifoss? or a row before the check in?"_ Draft 3 had folded the leg's three facts into
the stay row to stop two rows printing two clocks for one departure. But the day already has exactly
one way to draw a leg, so folding one in means two adjacent holes on one screen use two different
grammars — and the fold is unnecessary the moment the row has no clock to contradict.

So: **the stay row states no time.** The journey block above or below it is an ordinary journey block,
and the leg's own times live there:

- **into a deadline** — a departure, as today (`יציאה 06:18`);
- **into a floor or a window** — the **predicted arrival** (`הגעה ~17:02`), never a departure, which
  is ADR-0206 §AI1: a check-in window's opening is not a deadline and counting back from it advises
  leaving in time to arrive the instant the door opens.

**The residual ambiguity is authored, not guessed.** Where a day really does go back — coffee, then
back to check out — that return is an **ordinary stop at the stay's own place**, so it arrives with
the leg, the polyline, the gap arithmetic, the leave-by and the settle pair already attached. Owner's
call, chosen over marking a planned check-out instant on the stay, which buys a clock and costs a
Prisma migration, a DTO field, a shared-schema change, a `CACHE_CHANNELS` mirror and a ripple rule —
and would be a second, weaker way to say what the stop says fully (ADR-0079/0094/0095).

**It is offered by controls that already exist**, not by new chrome on the stay row: the gap strip is
tappable and prefills its own slot (ADR-0161 §9), and `＋ אירוע חדש` is the universal fallback. A
draft that put a `חזרה למלון` button on the row was refused for the right reason — it rendered an
_offer_ as a _statement_, present on the day you do not go back and absent from the day you do.
Whether the app should ever **suggest** the return is left open rather than answered with persistent
chrome.

`edgeAt` is left **unchanged**, and it is worth recording why it looked like the culprit: it pulls a
ceiling back to `Math.min(atMs, ...departures, ...)` — _a check-out cannot sort after your flight
left_ — where a departure is the start of a booked **journey group**. ADR-0206 added a departure the
app **derives**, which `edgeAt` cannot see. The rule survives untouched because nothing is positioned
by a bound any more.

### §4 · The check-in window gets a **predicted** arrival, not a slotted one

New, and the one genuinely new capability here: the day's last stop plus the leg gives the arrival,
so the check-in row can say `הגעה ~17:02` inside the window, or `הגעה ~20:32 · אחרי סגירת החלון` in
`--miss` ink when the plan lands after it shuts. Readable at breakfast.

**This is not what `hero-booking.ts` already does.** That computes `missed` off the **clock**
(`CHECKIN_GRACE_MIN`, ADR-0184 §3) — a countdown on the board that fires once it is already too
late. This is a prediction from the day's own travel, before the day runs, on the surface that holds
the plan.

**And a leg into a window states no departure at all**, which is the other half of the same owner
report and is a **shipped defect in M6a**, recorded as ADR-0206 §AI: `dayJourney` reads
`arriveByMs` from the destination's `startsAt` unconditionally, so a check-in window's `17:00`
_opening_ is used as a deadline and the block printed `יציאה 16:18` — leave in time to arrive the
instant the door opens, when nothing was due until `20:00`. That clock also landed **inside** the
previous stop, which ran to `16:40`, because `leaveBy` has no clamp against the origin. A floor has
nothing to count back from; the arrival is the whole statement.

**The check-out day needs nothing new for the owner's _"say at what time we should leave"_:** the
journey block below the check-out row already prints `יציאה 09:27`, derived from the next stop's own
start. Worth recording so a build does not add a second statement of it.

### §5 · The ambiguity is resolved by being told, not by a new field

The owner's opening suggestion was _"maybe you could even slot it and be done with the ambiguity"_.
The ambiguity **is** resolved here — §3's authored stop — and the thing refused is only the _storage_
of a chosen instant on the stay.

For a check-in the same rule applies symmetrically: if you want to pin when you will arrive, add the
stay as a stop at that time and it becomes an ordinary part of the day, with a leg, a line on the map
and a place in the arithmetic. What the app offers unasked is the **prediction** (§4), which is a
statement it can stand behind rather than a plan it invented.

A stored intention is not refused on principle — it is refused on what it buys. If a real day shows
the stop is too much friction to author, the marked instant is the fallback, and it should then
**replace** the stop rather than sit beside it (ADR-0079/0094/0095: two ways to say one thing is what
each of those exists to undo). Backlogged in that form.

## Consequences

**Measured at 360 in Chromium, both themes, off the mockup's own DOM** — re-read after each of the
five drafts:

| day shape        | height today → proposed         | hotel mentions |
| ---------------- | ------------------------------- | -------------- |
| check-in day     | ⁦422px⁩ → ⁦358px⁩ (**−⁦64px⁩**) | ⁦2⁩ → ⁦1⁩      |
| change of hotel  | ⁦675px⁩ → ⁦615px⁩ (**−⁦60px⁩**) | ⁦4⁩ → ⁦2⁩      |
| no hotel         | ⁦339px⁩ → ⁦339px⁩ (no change)   | ⁦0⁩ → ⁦0⁩      |
| check-out day    | ⁦393px⁩ → ⁦397px⁩ (+⁦4px⁩)      | ⁦2⁩ → ⁦1⁩      |
| **middle night** | ⁦485px⁩ → ⁦644px⁩ (+⁦159px⁩)    | ⁦1⁩ → ⁦2⁩      |

**Every day that names a hotel twice today names it once, and the two that named it most get shorter
doing it.** The **middle night is the cost, ⁦+159px⁩**: it gains four boxes it has none of today — where
you woke, the leg out, the leg back, where you sleep — and it is the shape a long trip has most of.

**⁦74px⁩ of that was available and is refused.** Draft 3's fold bought it back by putting each leg
inside its stay row; that is rejected in §3 because the day would then draw a leg two ways in two
adjacent holes. **If ⁦159px⁩ has to come down, the lever is the stay row's own height (⁦60px⁩ measured),
not the grammar.**

**A middle night names the stay twice, and that is not the duplication §1 removes.** Its two rows are
the day's two ends, which is what ADR-0054's map amendment already decided a middle night is — the
band's single entry was the thing that could not express "both ends". Dropping one end would make the
list disagree with the canvas about one night, the defect ADR-0107 session-102 and ADR-0171 §10e were
each written to repair.

**The band shrinks on every edge day** — ⁦90px⁩ → ⁦41px⁩ measured — which is where the subtraction
lands.

**Open, and the owner's:** the two labels. `בוקר` and `לינה` are nouns because every other label in
that row is one (ADR-0206 §D10) and the position says which end. Neither word is load-bearing; the
structure is.

**Not verifiable in the suite:** every number above is a rendered box, so jsdom can see none of it.
The build owes an e2e measurement of the day surface at 360 across the five shapes, in the shape
`e2e/measure.ts`'s `stableBox` already provides.

## Alternatives rejected

- **A new row component for the bookend.** The band's entry already names the stay and already
  borrows the placed edge's sentence so the two cannot disagree; a second row shape for one fact is
  the duplicate root rule 8 exists to stop. Hence `TransitionRow` and three CSS rules.
- **Storing a slotted check-in time** — §5.
- **Draft 1 · the check-out row left at its bound** — the bound then sits above a derived departure
  that precedes it, and reads as a return trip.
- **Draft 2 · the check-out ROW given the day's first position** — refused on the owner's two
  counter-examples: coffee at 08:00 with a check-out at 11:00; a check-in at 15:00 followed by an
  attraction and dinner. Its supporting "third mention" argument was also a **miscount**: §1 has
  already removed the band entry, so it is one row either way.
- **Draft 3 · the merge alone, position untouched** — better, and still read as a return trip,
  because the merged row still sat after the morning's first stop. All three failed the same way:
  each tried to position _the moment of checking out_, which the app does not know. §1's split is
  what is left once that is given up.
- **Marking a planned check-out instant on the stay** — §3, refused against the authored stop.
- **Teaching `edgeAt` about the derived leave-by** rather than moving the row. It would place a row
  by an **async** fact, so the row would jump when the travel matrix lands — on the densest surface
  in the app, and against §D4's requirement that absence cost nothing.
- **The morning bookend alone on a middle night** — refused on the map/list disagreement above, not
  on its ⁦133px⁩ saving.
- **Quieting the edge rows and keeping the band**, which is the ask read literally. It moves the
  duplication rather than removing it, and it leaves the stay named in a strip above the day whose
  own clock the day cannot act on — the band has no journey block, no leave-by and no arrival.
