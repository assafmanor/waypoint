# 0159 — The day says what is **between** two events, and a connection is not free time

**Status:** Accepted (owner sign-off 2026-08-02, on the mockup). **Built 2026-08-02.**
**Date:** 2026-08-02
**Design reference:** [`mockups/day-gaps-and-layovers-v1.html`](../../mockups/day-gaps-and-layovers-v1.html) — two rounds the same day, the second from two owner reports read on a phone. Every measurement below is read from that file's live DOM.

**Closes [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §7's "connections and multi-city"**, which named the shape and deliberately left it unbuilt: _"a layover is a **sequence**, a round trip is a **mirror**. `legs` is the axis that would carry it."_ It is that axis, populated.
**Extends** [0116](0116-day-aware-shelf-and-idea-target-day.md) §5 / `lib/gaps.ts` (Plan's gap, read a second way), [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §2/§5/§6 (the profile table, the derived relation, the note's host), [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md) §5 (a leg is what a step is for), [0141](0141-the-pin-says-which-transition-is-next.md) (the pin's word), [0134](0134-the-map-is-where-a-forms-place-comes-from.md) §2 (the errand channel gains an index).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (each leg is its own hard commitment), [0047](0047-booking-event-linkage-and-notes.md) §1 (one booking, one event), [0092](0092-unsynced-treatment-and-change-groups.md) (one save, one change group), [0107](0107-per-place-timezones-and-multi-zone-time.md) (a leg reads in its own two zones), [0114](0114-elapsed-duration-ladder.md) (one elapsed ladder), [0150](0150-a-form-refuses-at-the-field.md) (a refusal lands on the field it is about), [0028](0028-plan-violet-color-budget-dark-ready.md) / root rule 4 (no new hue).

## Context

Two complaints, one shape.

**The day view draws nothing between two events.** 10:30, then 16:00, and the four hours in between are whitespace. Plan mode does draw them — `.gap`, a violet pill saying `שבץ`, also a drop target (ADR-0116 §5) — but that is a **control**, and it belongs to the mode that builds the day. On the ground the same fact is **information**: what you have, not what you could add.

**And a journey with a stop cannot be authored or read at all.** A flight with a layover is two bookings typed twice, and two unrelated hard rows with an unexplained hole between them. The app has no idea they are one thing, so the Index shows two flights, the map shows a landing where you are actually waiting, and the day shows a gap where nothing is free.

The second is a special case of the first, which is why they are one ADR: **the slot between two rows is the same slot**, and what differs is what is true of it.

## Decision

### 1. Trip mode takes Plan's gap slot, with the control removed

Same flex row, same dashed hairline, same 9px rhythm, same `GAP_MIN_MINUTES` floor, same `gapBetween` derivation — a `<span>` where Plan has a `<button>`, `--faint`, no border, no fill, no drop target.

**The floor is shared deliberately.** "Is there a real hole here?" is the same question in both modes; only what you can do about it differs. A second threshold would mean two screens disagreeing about a fact.

**The read-out is not shared, and that is also deliberate.** `PlanDay`'s `gapLabel` rounds to whole hours (2:40 reads `שעתיים`) — fine for an affordance offering to fill roughly two hours, wrong for a statement you are about to plan lunch around. Trip reads through `hoursPhrase` (ADR-0114's one ladder): `פנוי · 2:40 שע׳`. **A statement has to be a measurement.**

The wording is `פנוי · <length>` rather than `<length> פנויות` because Hebrew makes the adjective agree with a number the phrase does not expose (שעה פנויה / שעתיים פנויות / 45 דקות פנויות). Plan's own edge chips already dodge it the same way.

### 2. A connection is the opposite fact, and must not share a shape

Two legs of one journey are never free time, however long the wait. So the connection **ignores the gap floor** — §3c's 12-minute change of train is the join you most need to see and the one no free-time threshold would ever surface — and it takes a different shape:

**a gap is a hairline ACROSS the list; a journey is one BLOCK with a band inside it.**

The first draft drew a dotted rail in the badge column and the owner read it on a phone: _"the striped line in the layover gap does not sit well between the flights"_. Correct, and specifically: a rail is a **connector**, so it has to touch both things it connects, and one that keeps the list's 9px rhythm floats 9px clear at each end — then a now-line lands between the legs and cuts it in half, which is the normal state on the ground, not an edge case.

So the legs go **inside** one container (`.journey`) that owns the border, the radius and the rhythm; the legs give theirs up and become rows of it; the band spans edge to edge between them. Nothing is being asked to sit between two cards, because there are no longer two cards — there is one object with parts, which is what a connection is. A now-line inside it is a row of the block.

Amber, because a connection is time inside a **commitment** (rule 4's own words) — but amber-deep **text** on a tinted ground, never a filled pill: an amber pill on a line is `.nowline`, and the app gets one live mark.

### 3. The relation is DERIVED, exactly like the pair

`connectionMinutes(a, b, when)` in `@waypoint/shared`, beside `roundTripPartner` in the file the pair already lived in (renamed `booking-journey.ts`, because a file called `booking-pair` holding a three-leg chain is a small lie). Four conditions:

1. Comparable — the same route-shaped type.
2. `a` arrives where `b` departs.
3. **`b` does not end where `a` began.** A journey that returns to its origin is a MIRROR. Without this rule a same-day out-and-back reads as a layover at the far end, and the two relations become one blur.
4. The gap is not negative and is inside the type's own window.

An unscheduled leg answers `null` — not a hole in the rule but the rule: a sequence is an order in time, unlike a round trip, whose unplaced return is still the other half of the purchase.

**A connecting leg is not a return, and that check comes first.** One PNR across both legs is exactly what a through-ticket has, so without it `sharesCode` would pair the two halves of an outbound journey and call the second one "the return". `journeyLegs` walks both ways from any leg (with a visited set as the cycle guard) so the middle leg of three finds the whole.

The three reasons a `pairId` column was rejected in ADR-0154 §5 all still hold, and the third decides it again: a stored id would only know about journeys created through the one control that writes it.

### 4. The window is a **per-type** entry in the profile table

`BOOKING_TYPE_PROFILE.legs` widens from `'single' | 'mirrored'` to `{ mirrored: boolean; sequence: ConnectionWindow | null }` — one axis carrying the capability **and** its parameters, so "this type has connections" and "this is what one is" cannot disagree. A split hotel stay later is `places: 'single'` with a `sequence`, which is the extension ADR-0154 §2 kept the axis separate for.

| type            | max gap | tight  |
| --------------- | ------- | ------ |
| flight          | 24h     | 90 min |
| train · transit | 6h      | 20 min |

24 hours is the aviation line between a layover and a stopover. A train or bus stop measured in hours is a visit to the city, not a change of platform — and what counts as **short** differs for the same reason: 90 minutes with bags and a terminal, 20 minutes on a platform. `tight` is descriptive and never `--miss`: the app does not know your terminal, so it says the join is short and stops there.

### 5. Authoring: a **stop** on the route field, and a **leg per step**

`RouteField` gains `stops` — a third picker in the stack, indented because a waypoint is not an endpoint. Two things the drawing settled:

- **A stop has no remove control of its own.** The picker's `✕` clears the place, and a stop with no place is not a state worth keeping, so clearing IS removing. A second ✕ was drawn and deleted.
- **The swap stays where it is** and reverses the whole sequence, which is exactly what `החלפת כיוון` already promises.

`MAX_ROUTE_STOPS = 3`: past a few this is an itinerary, and the trip itself is the itinerary.

**A leg is a step** (ADR-0155 §5). Two stops is two more steps, not a form three times as long — which is the same 492px-per-schedule ADR-0154 §4 measured and stepping exists to avoid. `מה ואיפה` → `מתי · קטע 1` → `מתי · קטע 2` → `פרטים`, and a one-way single-leg form keeps today's three words exactly.

**The return moved onto its own step**, which is a change to ADR-0154 §4's shipped flow (it shared the last step with the shared fields). A step count that depends on whether the return happens to be one leg is the special case that makes the code branch; the leg is the unit.

**The cross-leg refusal is the argument for stepping.** "A departure before the previous arrival" needs the leg before it, so it is a cross-STEP dependency — which ADR-0155 §5 names as the strongest reason to step a form at all. It lands on the departure that is wrong (ADR-0150) and names the stop where it can, because with three legs "the previous arrival" is one question too many.

One save writes a booking + linked event per leg inside one `withChangeGroup`, so a three-leg journey is one pending change and one undo. Everything non-schedule is shared by construction; each leg's route, title (ADR-0059 §3 — nobody types a name) and two zones come from the two points it runs between. **The note's host is the first leg**, ADR-0154 §6 generalised, and assigned once rather than left to the last statement.

### 6. The map says it too, in the same word

A connection stop takes over the pin's tag and the row's meta word (ADR-0141's slot). `נחיתה` at a place you leave again in two hours is true and misleading, and the pin has room for one word.

It is keyed by place **and day** — an airport you change planes at on the way out is a plain destination on the way home — and it comes from the same `connectionMinutes` the day's band does, so the pin, the row beneath it and the day view cannot make three different claims about one place. That is ADR-0141's own property, extended: one derivation, rendered wherever it is asked.

### 7. What this does not do

- **Legs on different days.** A red-eye lands tomorrow, so the two legs sit on two day lists and there is no adjacency to draw a block from. The connection is still derived (the map and the detail both say it); only the block needs both rows present. ADR-0064's transition rows are where that would be answered.
- **Plan mode is untouched.** Its chip still offers to fill a long layover, and that is right — seven hours in Dubai is genuinely plannable time. It just will not know the word for it.
- **The Index gains nothing**, holding ADR-0154 §5's line for the same reason: the row's meta line is measured full, and the question is answered by the detail.

## Consequences

- **`legs` stops being a string.** Every reader goes through `authorsRoundTrip` / `connectionWindow` / `isTightConnection`, and a new `BookingType` still fails to build until its profile row exists.
- **A round trip is four steps, not three.** One more `הבא`, and the last step is details only.
- **`booking-pair.ts` → `booking-journey.ts`** in both packages, and the frontend hook file with it. One `BookingWhen` provider replaces `BookingStartAt`, because the pair orders by starts and a connection measures from arrivals — two providers would eventually disagree about when one booking happens.
- **The errand channel learned about lists** (`target.index`), which is the smallest extension that lets a stop survive a trip to the Map. It knows a field is a value or a list; it still knows nothing about the shape of a form.
- **The now-line's placement moved to `lib/now-line.ts`** — one derivation with two hosts (Trip's live line, Plan's static reference, which had inline copies in two spellings), returning an object rather than a number so the owner's next ask — the marker saying where we actually are, **inside** a running event — is an extension rather than a rewrite. Backlogged, with the seam named.
- Measured at 390px from the mockup's live DOM: the gap strip is **17px** (~24% of an event row), the band **30px**, and the row height is unchanged. A six-event day with two real holes gains **52px** at the 60-minute floor, 104px at 30.

## Alternatives considered

- **The dotted rail in the badge column** (v1). Rejected after a phone read: a connector that does not touch, and cut in half by the now-line. Kept drawn and corrected in the mockup's §3א so the comparison stays honest.
- **An amber pill on the hairline.** That is `.nowline` almost exactly — same 12% fill, same `--amber-deep`, same 999px chip on a rule. The app gets one live mark.
- **A crow-flies distance in the gap strip** ("12 ק״מ ליעד הבא"). `lib/distance.ts` already exists and it is cheap, but a straight line does not answer the only question a gap raises — is 40 minutes enough — and the app has no routing by decision (ADR-0109 §7). A number that looks like an answer is worse than none.
- **A live countdown in the strip.** The now-line and Home's glance already own the clock; two live counters on one screen disagree by a second and read as broken.
- **Edge strips** (before the first row, after the last). Plan has them because they can be filled. "The day starts in 3 hours" adds nothing to the time printed on the first row.
- **One booking with several legs.** ADR-0047 §1 rejected 1:many `Booking→Event` and the reason is unchanged: these are independent hard events with their own instants, arrivals, zones and `done`/`skipped`.
- **A separate `Connection` entity, or a `journeyId` column.** Same three costs as ADR-0154 §5's `pairId`, plus a migration for a fact that is already in the data.
