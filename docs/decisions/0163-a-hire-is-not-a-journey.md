# 0163 — A hire is not a journey

**Status:** Accepted. **Built 2026-08-04.**
**Date:** 2026-08-04

**Amends** [0059](0059-booking-presentation-on-home-and-index.md) §3 — _"a transport booking has no name; its title is DERIVED from its endpoints"_ — which is right for a flight and wrong for a car hire. See §3.
**Completes** [0162](0162-a-car-hire-is-transport-you-drive-yourself.md), which gave a hire its own `BookingType` and left every surface still describing it as a journey.
**Rides** [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §2's profile table for the third time, and §3's extracted `RouteField` for its second shape.
**Applies unchanged** [0048](0048-index-build-data-model-refinements.md) (route xor single place — nothing here moves a column), [0054](0054-ambient-span-events-off-the-day-schedule.md) (a multi-day hire is a backdrop), [0134](0134-the-map-is-where-a-forms-place-comes-from.md) §2 (the per-field place errand), [0102](0102-search-mode-scope-and-multi-field-matching.md).
**Drawn first** in [`mockups/car-hire-form-and-ambient-v1.html`](../../mockups/car-hire-form-and-ambient-v1.html), whose §4 offered three options; the owner took the first.

## Context

Four owner reports against the 0162 build, in the owner's words:

1. _"the booking form should be different: right now it's the same as any transit: it has a route with from and to, it should be like איסוף and have a toggle for same place or different for החזרה"_
2. _"there's no option to write the car rental company (hertz, europcar, etc.)"_
3. _"the ambient text in the day view says 'לילה 2 מתוך 4' which fits well for hotels, but this is not a hotel"_
4. _"the ambient text also shows the route, which is really uninteresting for a rental car"_

**Three of the four are one mistake.** 0162 gave the hire its own type — its own profile row, its own pill, its own timing labels — and changed nothing about how it is _described_. So `BookingSheet` still handed it the generic `RouteField` (מוצא → יעד, with a `החלפת כיוון` swap), and `finalTitle` still derived its name from those two endpoints. A hire collected and returned at one airport was therefore **titled `נריטה ← נריטה`**, and that title is what the day's ambient strip prints — which is report 4. Report 2 is the missing half of the same thing: with no company field there was nothing else the title _could_ be.

**Report 2 is not a model gap, and that is the interesting part.** `Booking.provider` has been in the schema since it was written, and `BookingDetail` has always rendered it as `ספק`. No form has ever written it. `booking-draft.ts` even documented the assumption in an exhaustive `Record<keyof Booking, …>` coverage table: `provider: 'unused'`, commented _"never surfaced in the sheet — an importer's name for where a booking came from."_ The value was displayable and unenterable at the same time, for every type: an airline and a hotel chain were as unenterable as a rental company.

## Decision

### 1. A hire's two ends are counters, and the form asks accordingly

`RouteField` gains a `shape` prop. `'journey'` is unchanged. `'hire'` asks `איסוף 🔑`, then **whether the return is somewhere else** — defaulting to the same counter, which is the common case — and only then offers a second picker, labelled `החזרה 🏁`. It has no swap: you cannot reverse a pick-up and a return.

**A variant rather than a sibling component**, for what the two genuinely share — two `PlacePicker`s over the same two `Booking` columns with 0134 §2's per-field errand plumbing. A copy would fork that, and the errand is the part that was hard to get right.

**Nothing in the model moves.** `fromPlaceId` is the pick-up and `toPlaceId` the return, exactly as before, so 0048's invariant holds and every reader of those columns — map pins, per-end zones, the server's `assertPlaceShape` — needs no case for a hire. "Same place" writes `to = from` rather than leaving it blank, because `undefined` is indistinguishable from "not answered yet", and because an equal pair is what makes every existing reader correct by default.

**The toggle is local state seeded from the props, not derived**, and this is the one subtle thing in the change. Choosing "elsewhere" clears the return so the picker opens empty; a toggle derived from `to === from` would read "same" again on the very next render and the second picker would vanish under the finger that asked for it. The seed is what lets the field hold an answer the data cannot yet express.

### 2. The company is a form field, for every type

One input, above the code — you remember the company and look up the code. Its **label** is a `Record<BookingType, string>` (`חברת ההשכרה` / `חברת התעופה` / `המפעילה` / `ספק`) with real brands as placeholders, because a single generic `ספק` is how a field stops getting filled in.

Collected for **every** type, not just cars: the column and the read-out were never car-specific, and withholding the input from the other types was the actual defect. The coverage table's `provider` line moves `'unused'` → `'form'`.

### 3. A hire is named by its company. **This amends 0059 §3.**

0059 §3 established that a transport booking has no name and derives its title from `origin ← destination`. That reasoning is sound and stays for `flight`, `train` and `transit`: nobody names a flight, so the route _is_ its name.

A hire is called Hertz. So `BookingTypeProfile` gains **`titleFrom: 'route' | 'name'`**, and `titlesFromRoute` is the question every title site now asks — where it used to ask `carriesRoute`, which happened to give the same answer for every type that existed before the hire.

**Separating the two axes is the whole fix.** A hire carries a route _and_ has a name; asking the route question to decide the title is what saved `נריטה ← נריטה`. With no company entered the title falls back to the **type label** (`השכרת רכב`), which says what the row is, where a bare counter name does not.

This deletes the route from every surface that receives only a title — the ambient strip, the change feed, the hard-edit confirm, the conflict flag — with no per-surface work, which is the same property 0059 §3 was written to get.

### 4. The ambient strip counts in the span's own unit

`לילה 2 מתוך 4` becomes `יום 2 מתוך 5` for a hire, and is unchanged for a stay. The unit comes from `eventDurationUnit`, i.e. from 0162's profile tables, so this is not a second place deciding what a type is measured in.

**Chosen from three options** the mockup drew side by side, and the alternatives were not wordings — they answered different questions. The **return deadline** (`עד יום ו׳ 10:00`) is more actionable, and was rejected because the two rows in one strip would then say different kinds of thing; `הרכב איתנו` as a fact about the day was the most readable and the furthest from the shipped row. One grammar for both rows won.

**Home's mid-stay strip needed the same fix and was not reported.** It fires for any ambient event whose span contains the clock, so a hire reached it and read `שוהים ב־Hertz · לילה 2/5` — wrong on the verb as well as the unit. A stay keeps `שוהים ב־` and its nights; anything else states its own name with no prefix, because a hire whose company was never entered is titled `השכרת רכב` and `הרכב מ־השכרת רכב` is worse than nothing.

### 5. One span derivation, where there were three

`stayNight`/`stayNights` existed as hand-copied pairs in `DayView`, `PlanDay` and `Home` — identical arithmetic, three call sites, no tests. They are now `ambientSpanPosition` + `ambientSpanLabel` in `lib/glance.ts`, beside `ambientEventsOnDate`.

This was a **prerequisite, not a tidy-up**: three copies means three places to thread a per-type unit through, and three chances for one of them to keep saying "night". It is ADR-0096's shape and the fourth such collapse this area has needed (0078, 0079, 0094, 0095, 0162's `BOOKING_TYPE_CATEGORY`).

## Amendment (2026-08-04, same day) — §3 applies to the DISPLAY derivations, not just the stored title

Shipped incomplete, and the owner caught it immediately: _"the title for a booking is now the '&lt;pickup location&gt; -&gt; &lt;dropoff location&gt;', and even worse when it's the same location, then it becomes '&lt;pickup location&gt; -&gt; -'"_.

§3 changed what the form **stores**. It did not change the two derivations that **rebuild** a route for display from the place FKs, ignoring the title entirely:

- `lib/places.ts`'s `eventRoute` — read by `EventTitle`, the day rows in `DayView`/`PlanDay` via `routeDisplay`, and Home's in-transit hero.
- `ui/BookingTitle.tsx` — read by the Index bookings row, the row-manage sheet, and the Index landing tile.

Both gated on the **category** / `carriesRoute`, which is exactly the conflation §3 exists to undo — so a hire drew `נריטה ← נריטה` no matter what its title said. The dash is the same bug's second face: `RouteLabel` fills a missing endpoint with `-` (its documented "no value" placeholder), and a hire's return place is often unset, so it rendered `נריטה ← -`.

**Both now ask `titlesFromRoute`.** The lesson worth carrying: introducing an axis is not the same as applying it. The grep that would have caught this is for the _old_ predicate at every site that renders a name — `carriesRoute` and `categoryForBookingType(...) === 'transport'` — not for the new one.

**And the missing return is fixed at the source too.** `HireEndsField` writes the two ends equal while the answer is "same counter", but only when the toggle or picker is touched — so a place arriving from a **map errand** (which assigns `draft.fromPlaceId` directly) and a pre-0163 row opened and saved untouched both left it null. `BookingSheet` now normalises on read (`toPlaceId ?? fromPlaceId` for a hire), which makes the gap unrepresentable rather than patching each writer.

**Three test files gained the coverage whose absence let this ship**, and one of them (`BookingTitle.test.tsx`) did not exist at all — a component deciding a title's whole shape, with no test.

## Consequences

- **`carriesRoute` is no longer the question a title site asks.** Four axes now hang off `BOOKING_TYPE_PROFILE` — `places`, `schedule`, `legs`, `titleFrom` — and 0154 §2's claim that they are separate on purpose has now been _needed_ three times rather than argued once.
- **The journey-chain save path had to learn the rule too**, and this is where the change nearly shipped half-done: a hire is route-shaped and span-scheduled, so it is written through `legBooking` as a one-leg "journey", and that function derived each leg's title from its two points. Fixed there as well as in `finalTitle` — the test that caught it asserted the saved payload, not the form.
- **The title-row preview was the last surface still asking a hire for a route.** It showed 0059 §3's ghost, `בחרו מוצא ויעד`. It now shows the title the form will actually save — the company, or the type label until one is typed. Found by reading the rendered sheet, not the diff.
- **`provider` is `dir="ltr"` on its input**, which ADR-0118 permits only on an `<input>` — and needs, since these are latin brand names and `auto` would left-anchor the Hebrew placeholder.
- **The ambient strip's arithmetic has tests for the first time**, including the clamps at both ends of the span: nothing pinned `stayNight` in any of its three homes.
- **A hire still has no notion of the vehicle** — class, transmission, seats. Deliberately out: none of it changes what the app shows you on the ground, which is where the car is and until when.

## Alternatives considered

- **A separate `HireField` component** instead of a `shape` variant. Rejected in §1: it would fork 0134 §2's per-end errand plumbing, which is the part with the sharp edges.
- **`places: 'single'` for a hire** now that the return is usually the same counter. Rejected — it was rejected in 0162 §1 for the same reason and the toggle makes it worse: a one-way drop would become unrepresentable, and 0048's invariant means the column could never be added back.
- **Leave `to` blank when the return is the same counter.** Rejected in §1: indistinguishable from "not answered yet", and every existing reader of the pair would need a hire-shaped special case.
- **Add `provider` for `car` only.** Rejected in §2 — the column and the detail read-out were never car-specific, so this would have left the real bug (no form writes it) in place for six types while fixing it for one. It is also _more_ code than doing it for all.
- **A generic `ספק` label for every type.** Rejected in §2: you know you booked with Hertz, and calling that a "supplier" is how the field stays empty.
- **The return-deadline wording for the ambient strip.** Rejected in §4 by the owner's call, and worth recording because it is the more _useful_ option: it loses one grammar across the strip's two rows.
- **Derive the hire's toggle from `to === from`** and keep the field stateless. Rejected in §1 — it cannot represent "elsewhere, not yet said where", which is every moment between the two taps.
