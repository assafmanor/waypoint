# 0203 — A journey has **one date**, its arrival is a **clock plus a relative day**, and a suggestion is a **table of sources**

**Status:** Accepted (owner sign-off 2026-08-23). **Partly built 2026-08-23** — §2, §4, §5's and §8's machinery and §8's search-kind axis are in; §1/§3/§6/§7/§9 are drawn, componentised and specced but **not wired into `BookingSheet`**. See the build log at the foot, which records what the wiring turned out to need and the one design finding that stopped it.
**Date:** 2026-08-23
**Design reference:** [`mockups/a-journey-has-one-date-v1.html`](../../mockups/a-journey-has-one-date-v1.html) — every number below is read from that file's live DOM in a headless browser, at 360px and 390px, in both themes. **It falsified this ADR's first §7 and its own first draft of §4; both corrections are recorded here rather than quietly applied.**
**Session note:** [`planning/2026-08-23-the-arrival-was-read-as-a-return.md`](../planning/2026-08-23-the-arrival-was-read-as-a-return.md)

**Reverses** [0159](0159-the-day-says-what-is-between-two-events.md) §5's "a leg is a step" — see §7, which is the one section here that undoes a signed decision rather than extending it.
**Amends** [0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md) §4 (the return's route stops being **derived** and becomes **seeded** — §6) and [0177](0177-a-when-reads-as-a-sentence.md) (the span's second leg stops being a second date — §2; the sentence grammar itself is unchanged and is what this is built out of).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) / [0171](0171-a-time-can-be-a-floor-or-a-ceiling.md) §1 (no clock is ever guessed on a hard commitment), [0037](0037-overnight-events.md) (an end that cannot follow its start is the day rolling over — §2 is that rule one level up), [0150](0150-a-form-refuses-at-the-field.md) (the refusal lands on the value), [0017](0017-mobile-first-device-targets.md) (the 44px floor — three new controls measured against it), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber is the clock's, and a relative day is a word not a hue), [0192](0192-a-form-has-bands-and-its-content-sections-have-one-look.md) §3 (where before when, which is why §4 belongs to the route step), [0134](0134-the-map-is-where-a-forms-place-comes-from.md) §1 (a place field is an errand), [0107](0107-per-place-timezones-and-multi-zone-time.md) (per-endpoint zones, which §2's derivation runs on).
**Relates** [0155](0155-a-stepped-form-is-one-primitive-and-it-commits-once.md), [0159](0159-the-day-says-what-is-between-two-events.md) §3 (`.journey` — the object §3 reuses), [0061](0061-plan-home-readiness-rework.md) (`hasOutbound`/`hasReturn`, whose predicate §5 exports), [0096](0096-per-domain-claude-md-guides.md) / root rule 8.

## Context

An owner-relayed field report on the shipped `מתי` step of a flight:

> _"choosing the times is confusing: I got a feedback saying that because the departure and arrival of a flight both have a date and a time, they thought that the latter was the return flight."_

With two asks alongside it: suggest the "to the destination" and "to home" dates, and make adding a layover — **and removing one** — more intuitive.

Reading the code first changed the diagnosis, the scope and one of the answers.

**The misread is not only symmetry — the words do not disambiguate either.** `WhenField variant="span"` draws two structurally identical blocks, each a date token and a time token, and at the moment of the report both are empty. The labels are `המראה` and `נחיתה` — and **a return flight also has a `המראה`**. Neither block names the place it is about, though the step before it collected both: `bs-leg-head`'s `RouteLabel` renders only when `multiLeg || twoLegs`, which is precisely not the reported case. And the one thing that ties the two blocks together, the `משך:` read-out, appears only once both clocks are in — absent exactly when the confusion happens.

**The app already decided that transit is a moment plus a length, and this one form disagrees.** `booking-timing.ts`: _"transport → hours (a flight reads in hours, even a red-eye that crosses days)"_. `booking-prefill.ts`: _"No clock may be guessed, but the DAY still may"_. ADR-0037 made an event's end overnight-aware off a **single** date. `hotel` is the only profile whose end lands on another day by convention, and `bookingSpanDayOffset` reads that off `nights`. So the two-absolute-dates shape is right for a stay and wrong for the type it was reported on.

**An empty stop cannot be removed. That is a shipped defect, not a design gap.** `+ עצירת ביניים` appends `undefined` to `stops`; a stop is removed by `setStop(i, undefined)`, whose only caller is `PlacePicker`'s `pp-clear`; and that button renders `{current && …}`. So the one row that needs removing is the one row with no remove control, and tapping it launches a Map errand that unmounts the sheet. ADR-0159 §5 decided _"clearing IS removing"_ and deleted a second ✕ — correctly. The gap is that the first ✕ is absent exactly when there is nothing to clear.

**The mirror is not in the model.** `legBooking(side, i, times)` writes **one `Booking` per leg**, with its own `fromPlaceId`/`toPlaceId` and its own route-derived title. The only thing forcing a round trip to be a mirror is `const reversed = [...routePoints].reverse()` — four call sites, all authoring state. The owner's objection to the mirror (_"lots of times the to and from are a little different — not the same airport, different layovers"_) therefore costs no migration and no payload change.

**And the app can already tell an outbound from a return, in exactly one corner, and the form cannot see it.** `readiness.ts`'s `reachesDestination` decides it on three tiers — the place **is** the destination, its **zone** is the destination's, its **name** contains it — for `hasOutbound`/`hasReturn`. It is module-private. That is ADR-0154's own founding observation one function over: it said _"the app knows what a round trip is, in exactly one corner, and the form it would help never hears about it"_ about `PlanHome`.

## Decision

### 1. The defect is the shape, and symmetry is only half of it

A journey is drawn as **one object with parts**, and every moment in it **names its place**. `נחיתה · קפלוויק` cannot be a return leg's departure, because a return departs from the other end — so the place name is doing disambiguating work that no amount of re-weighting the two blocks would do. It is free: both places were collected on the step before.

Tidying the two boxes was rejected, and it is the same rejection ADR-0177 §1 already recorded against itself (_"Tidying is not designing"_): four boxes can be misaligned, one sentence cannot; and two well-aligned boxes are still two boxes.

### 2. One absolute date per journey. Everything after it is a **clock plus a relative day**

The journey's first departure carries a real `DateField`. Every later moment carries a clock and a **relative-day word** — `באותו יום` · `למחרת` · `+2 ימים` — derived, and tappable to override.

**A return flight would need its own absolute date, and there is exactly one on screen.** The misread stops being possible rather than becoming less likely, which is the property this whole ADR is bought for.

**The word is `ValueToken`'s existing `vt-word` tone**, which `value-token.css` already describes as _"a value that is a word rather than a figure"_. Zero new mechanism for the load-bearing control.

**The derivation runs on INSTANTS, not wall clocks**, through each endpoint's own zone — the same pair `WhenSpan` already builds with `zonedIso(day, time, tz)`. This is load-bearing and not pedantry: **Tel Aviv 23:40 → Reykjavík 23:55 is the same calendar day**, because the flight also crossed three hours westward. A wall-clock comparison gets that case right by luck and the eastbound one wrong. The rule is: the smallest day offset, at or after the previous moment's, that puts this clock after the previous moment.

**Every offset is counted from the journey's one date, never from the node above it.** Chaining `למחרת` off each predecessor makes the words relative to each other and the journey unreadable.

**The override is the escape, and it is the only thing the derivation cannot see:** a single leg longer than 24 hours (a sleeper train, a ferry). One tap for `+2 ימים`. Same posture as ADR-0036 §2a's `nearestRoundSlot` — it suggests, it never cages. **An override the clocks contradict is dropped, not kept** — the rule `WhenSpan`'s `endFloor` already follows, which never offers an end before its own start.

**And this retires a refusal.** `legBeforeArrival` — _"היציאה לפני ההגעה ל…"_ — exists because two absolute dates let you enter a departure before the previous arrival. With one date and every later moment resolved to the **nearest forward instant**, 19:05 after a 19:40 landing is not an error: it is tomorrow, and the segment states what that costs. **Prevented rather than refused**, which is ADR-0150 §8's own rule (_"the impossible bound is PREVENTED rather than refused"_) and the one `minTime` already follows in the time field. `returnBeforeArrival` survives unchanged: the return carries an absolute date **of its own**, so it genuinely can depart before the outbound lands.

The cost of prevention over refusal is that a mistyped clock produces a very long leg instead of a complaint. That is why the segment's duration read-out is not decorative: a 23-hour hop between two airports says so in the place a reader is already looking, and the derivation has picked the _shortest_ interpretation consistent with what was typed. A plausibility note keyed on the type's own `maxGapMinutes` (ADR-0159 §4 has the number) is the obvious follow-up and is deliberately not in this ADR.

**Whether the word shows when it is `באותו יום` is a control in the mockup, not a decision here.** It ships **always**, for two reasons — the word is what replaces the date, and without it a bare clock reopens "which day is this"; and it is the only affordance for the >24h case — but it is a legibility question that wants glass, so the ADR hands it to a device pass.

### 3. The journey is the `.journey` block the day view already ships

`day-join.css`, in its own words: _"One object with parts… a connection is not a mark BETWEEN two cards, it is the inside of one thing."_ The read surface has this shape; the authoring surface splits the same journey across N unrelated steps. ADR-0192 §3's own rule is that the app must not teach one order for authoring and another for reading.

So the `מתי` step draws a rail — a node per point, a segment between them carrying what the leg costs — and a stop's wait is **`ConnectionBand` itself, unchanged**: same element, same classes, same words per transport mode, same `tight` rule. **The wait is stated while you type it**, which no pair of steps can do.

A stop node holds an arrival, the band, and a departure — and **the departure needs no label of its own**, because the band directly above it says `עצירת ביניים · 1:15 שע׳`. The node then reads as one sentence: land at 19:40, wait 1:15, leave 20:55. Measured at 25px a stop, which is what brings a two-stop journey inside the fold.

New CSS is a **rail and two controls**. Everything inside a node is shipped: `.wf-line` (ADR-0177), `.df.vt.vt-date`, `.vt.vt-time`, `.vt.vt-word`, `.zchip`, `.journey-stop`. It lands in a new `ui/domain/journey-field.css` beside `route-field.css` — `JourneyField` is the schedule's counterpart to `RouteField`, over the same points.

### 4. A stop is inserted **on the segment** and removed by `pp-clear` **made unconditional**

Both on the `מה ואיפה` step, because a stop is a **place** (ADR-0192 §3) and inserting one from the schedule step would mean a Map errand mid-schedule.

- **Insert**: a quiet `--cta` `＋ עצירת ביניים` on the rail segment where the stop will appear, so the row arrives where you tapped rather than above a button at the foot of the stack.
- **Remove**: `PlacePicker` takes a `removable` role and stops hiding its ✕. **Not a second control** — the first draft of the mockup drew one beside the picker and it is in that file's rejected list, because it is exactly the copy ADR-0159 §5 refused. Two lines of shipped CSS: the picker's ✕ gains ADR-0017's reach (it measures **32px** today, a pre-existing miss), and a stop's is never hidden.

**The swap stays where ADR-0154 §3 put it** — between the ends it exchanges, i.e. on the first segment — and still reverses the whole sequence. The mockup drew it as a trailing row first, which moved a decided control for no reason.

### 5. **At most one** date suggestion, and `reachesDestination` decides which

`Trip.startDate`/`endDate` are non-null before any booking exists, and offering a **day** is the sanctioned side of a line the app already drew (`booking-prefill.ts`: no clock may be guessed, the day may).

**Which edge, decided by the function that already answers it.** The journey's destination reaches the trip's destination ⇒ this is the way there ⇒ `תחילת הטיול`. Its origin does ⇒ the way home ⇒ `סוף הטיול`. **Both ends inside** ⇒ an internal hop, for which the trip's edges are precisely the wrong answer ⇒ **nothing**. Neither placeable ⇒ nothing, and the traveller types the date exactly as today.

This is the owner's correction to the first draft, which offered both pills on every leg. It also halves what §5 costs, which is why the proposal's empty step measures **238.5px against the shipped 241.5px** instead of more.

`reachesDestination` is **exported from `@waypoint/shared`** — one line in a file that already owns the question — so the form and the Plan readiness check cannot disagree about which leg is the outbound.

**Its degradation posture is what makes the filter safe.** That function _"cannot answer NO: a place no route can place is unconfirmed"_. So the filter can only ever **remove** a suggestion, never add a wrong one.

**A suggestion is a pill, never a pre-fill.** A date that appears by itself on a hard commitment looks answered, and a wrong one that is never read puts a flight on the wrong day. The relative day of §2 is safe for the opposite reason: it is derived from something a human typed. The mockup draws the pre-filled alternative so the trade can be looked at.

### 6. A round trip is **seeded**, not derived — and this corrects ADR-0154 §4

That ADR said the return's route _"is **derived**, never picked again; its zones are the outbound's, swapped"_. The owner's report is that a round trip often is not a mirror: a different airport, different layovers.

`הלוך ושוב` therefore **seeds** a second journey holding the reversed points — because that _is_ the common case — and every node on it is a real editable `PlacePicker`, latched per node, with **its own stops list and its own leg count**. Diverging costs exactly the divergence.

**While it is still an exact mirror the heading says so** — `חזרה · אותו מסלול בהיפוך` — and the clause leaves the moment anything changes. One derived sentence, not a second control, and it is how you can tell the app assumed Keflavík rather than you having picked it. Giving the seeded value a "suggested" look was rejected: the value **is** what will be saved, and dressing saved data as tentative is how a form starts lying.

**What it costs, stated:** `legCount` stops being one number for both journeys, and `roundTripPartner` will pair a diverged return only through the shared confirmation code — which ADR-0154 §5 already writes as an **or**, and which is exactly what one ticket has.

**Whether `הלוך ושוב` is pre-offered is left to a device pass**, wired as a control in the mockup. The proposal is to derive it from `hasOutbound`/`hasReturn` rather than fix a default: a trip with no transport offers the round trip, a trip that already has an outbound offers one-way. The owner's approval was conditional on §6 (_"if you could think of an easy way to round trip without assuming that the journeys are identical then yeah maybe"_), and a "maybe" is not settled from a desktop browser.

### 7. One step per **journey**, not per leg — and the mockup falsified this section's first version

ADR-0159 §5 chose "a leg is a step" out of a constraint, not out of content: it points at the **492px per schedule** ADR-0154 §4 measured. When an arrival is a clock and a relative day, a leg costs two lines.

**The first version of this section claimed a three-leg journey fits one step. Rendered, it measured 708px against 675px of visible sheet — over.** After the stop node gave up its second label, the journey block measures **220px** with no stop, **396px** with one, **607px** with two — all inside — but **the whole step with two stops is 720.5px** and does scroll. That is the honest claim, and it is stated because the alternative is a design decision resting on a number nobody read.

**Two arguments hold regardless of the fold, and they are the real ones — but not the two this section was first written with.**

- **The layover's wait is stated while you type it.** Two steps cannot do this: the legs are never on screen together, so `1:15 שע׳ · עצירת ביניים קצרה` is something you discover on the day instead of while committing.
- **A hard commitment can be reviewed whole before it is signed.** ADR-0155 §1 lists that as chunking's third cost and calls it unmitigated; this returns it, for the one form that measured long enough to need paging in the first place.

**The argument this section originally leaned on is gone, and §2 is what removed it.** ADR-0159 §5 called the cross-leg refusal _"the cross-step dependency ADR-0155 §5 names as the strongest reason to step a form at all"_, and the first draft here claimed stepping per journey turns it into an in-step refusal. It does not: under §2 that refusal **cannot fire**. The mockup drew a frame captioned "the refusal, in-step" and the render showed the derivation quietly rolling the day instead — the file contradicting its own design until it was looked at. Recorded because a future reader would otherwise re-derive the old justification from ADR-0159 and find it no longer applies.

The sheet has always scrolled with a pinned footer, which ADR-0155's own alternatives list records as _"already the case"_ — so a two-stop journey scrolling is the existing behaviour, not a regression this introduces. **§9 then removes the need for it entirely**, on the owner's report against this drawing: a filled node summarises to one line, and the whole step at `MAX_ROUTE_STOPS` comes in at 548.5px against 675px. Read §7's ladder as the _all-open_ case and §9 as what actually ships.

### 8. A suggestion is a **table of sources**, and a place is its second consumer

Owner, on the place half: _"at least we can for example suggest the arrival airport for the return flight if we have the flight to the destination"_ — and then, on the shape: _"add infra for future improvements if we decide"_.

So the mechanism, not the feature. One suggestion shape, and an **ordered list of sources per field**. "At most one suggestion" becomes a property of the mechanism — take the first source that answers — rather than a rule each call site remembers. This is the idiom ADR-0154 §5 already chose, in its own words: _"a table of relation rules rather than a hard-coded `||`, so a second relation is an entry."_

**Date sources**: the previous leg's landing day (the rule `BookingSheet`'s `defaultDate: previous?.end` already follows inside one form, read off the trip's own legs instead), then §5's trip edge.

**Place sources**: the mirror of an existing leg. Its pill names the place and says which leg it came from — **`מההלוך` / `מהחזרה`**, the pair ADR-0154 §6 already made one const in `he.ts` because the leg headings write it. The first drawing said `מהטיסה לכאן`, which the owner could not parse, and it was wrong three ways: `לכאן` has no antecedent, it was the same string on two fields carrying opposite facts, and it named a flight where the type may be a train. A leg reaching the destination is the way there (`hasOutbound`'s own test), so a journey authored while one exists is probably the way back — its origin is that leg's landing, its destination is that leg's start. **Read off the trip's existing legs**, so it works for a return authored weeks after its outbound, in a different form, with no round-trip control involved. And it **avoids the Map errand entirely**: one tap in the form, no unmount, no network call.

**A source may answer null, and all of them answering null is the ordinary case** — a form with nothing to infer from shows no pill and behaves exactly as today. **A suggestion can only ever be added to an empty field**, never corrected onto a filled one.

**What is already shipped, and the gap its own comment names.** `PlaceErrand.kind` + `PLACE_SEARCH_KIND.AIRPORT` already tell the Map _"a flight's leg wants an airport, so the tab's search asks Google for airports and stops offering the terminal, the car park and the hotel next door"_. But that enum has exactly **one** member, and `findPlace`'s comment says why that matters: _"a train's stop is a station this restriction has no type for yet"_. So a train or bus endpoint searches the whole corpus. One enum row plus one axis on `BOOKING_TYPE_PROFILE` — which already answers every other per-type question — and `findPlace`'s `type === FLIGHT` conditional disappears into the table.

**Three things deliberately left out, each with its reason**, so a later session does not re-derive them: auto-running a seeded Places search on errand arrival (`PLACE_SEARCH_MIN_CHARS` exists so a paid call is never made unasked — ADR-0131 §8b; if it is added it is a tappable chip in the empty state, not an auto-run); bundling an airport dataset (Places already holds it, and it is wrong for train/bus/ferry); and **"the airport you usually fly from"**, which needs a user-level place record where `Place` is `@@unique([tripId, googlePlaceId])` and the schema states the deliberate reason — _"a chosen icon is data about this trip's view of the place, not about the entity Google describes"_. That last one is its own ADR, and the owner's own note is what narrows it: once a trip has one leg, this section answers the rest. What is left with no source is only the very first endpoint of the very first trip — which is one more row in the table.

### 9. A filled node **summarises to one line**, and that is what makes §7 hold at any stop count

Owner, on the drawing: _"the form for filling out time etc could be very long if there are several layovers, so let's make sure that it doesn't exceed the page size and instead becomes scrollable? Or do you suggest a better ui/ux solution for that?"_

**Scrolling already exists and needs no change** — `.booking-sheet` scrolls and its footer pins, which ADR-0155's own alternatives list records as _"already the case."_ But scrolling is the wrong answer _here_, and §7 is why: the argument for one step per journey is that a hard commitment can be reviewed **whole**, and a journey that scrolls three screens loses exactly that.

**So a node that has been filled swaps its controls for the line they read as** — `אמסטרדם · 19:40 · יציאה 21:45 · המתנה 2:05 שע׳` — one node stays open (the first still missing a time), and tapping a summarised row reopens it. The rail, the place names and the times all stay on screen, so the journey reads whole while a part of it is being filled, and the layover's wait is still visible. When everything is filled everything is summarised, which makes the state just before `שמירה` the best review surface the form has ever had.

**The measurement is the argument, and it is measured at BOTH screens — which corrected an over-claim this section made first.** A sheet shows ~675px of itself on a 390×844 phone and ~512px on a 360×640 one, and 360 is ADR-0017's **design width**, not the stress case. The whole step, including the step bar and the footer:

| stops                 | all open | summarised  | 390×844 (fold 675)   | 360×640 (fold 512) |
| --------------------- | -------- | ----------- | -------------------- | ------------------ |
| 0–1                   | —        | —           | inside               | inside             |
| 2                     | 718.5px  | **537.5px** | inside, 160px spare  | over by 25.5px     |
| 3 (`MAX_ROUTE_STOPS`) | 894px    | **609.3px** | inside, 88.5px spare | over by 97.3px     |

So: summarising makes **every** stop count fit on a 390×844 phone, and on a 360×640 one it cuts the overflow by **75–88%** without closing it — two and three stops still scroll there. The honest claim is that the common cases (0–1 stops) fit on every screen and the deep ones stop being three screens of scrolling. The first draft of this section said "every case fits" and was measuring the 844 fold at both widths, because the mockup drew a constant 675px line; the fold now follows the selected screen and the table states which one it compares against.

**A summary must not swallow the journey's one date.** The first render of this section did — the absolute date lives on the first node, so collapsing that node hid the single fact §2 is built on. It reads in the compact numeric form when summarised and the named form when open; ADR-0176 sanctions both, and a summary is what the numeric one is for.

**A summarised row is still a control, and it has to look like one.** The first drawing made it a bare `<button>` — no border, no ground, a 30px target and no reach overlay: behaviour without affordance, which on a form is the worse half to get wrong, and a rule this app has already written down in `ValueToken`'s docblock (_"a tappable thing inside a line has to look tappable… hence a resting hairline rather than bold text that happens to open a panel — which is the variant ADR-0177 drew and rejected"_). So the value run **is** a `ValueToken`, at the composite density that primitive already sanctions, inside a `.wf-line` — ADR-0177's grammar unchanged, prose as the ground and the value as a token. It measures 31.8px with a **45.8px** reach, the primitive's own number.

Two things took three attempts, both because the token's box was being re-decided rather than inherited: shrinking it to keep the row short put the reach at 39px, and the `time` tone put Hebrew words in the mono face (which has no Hebrew, so a fallback with different metrics) and left it at 43px. It is the `word` kind, which `ValueToken` keeps for exactly that, and the box is the primitive's. **The place name is deliberately outside the token** — a place is edited on `מה ואיפה` and a time on `מתי` (ADR-0192 §3), so the summary makes exactly the editable half tappable.

**And this is deliberately not `Collapsible`** (ADR-0098, four call sites), which is the obvious candidate. That primitive animates `max-height`, and ADR-0155 §4 forbids animating height inside a form step — it is ADR-0152 §6's clip, where `.wp-event-actions` tweens to a **fixed** cap and truncates silently. A leg's height is bounded today, which is precisely the reasoning that produced that clip. So this reuses the step primitive's **posture** rather than the component: swap the content, let the sheet resize, animate no height. The same trade ADR-0155 §4 already accepted and wrote down.

## Measurements

Read from `mockups/a-journey-has-one-date-v1.html`'s live DOM at 360×640, light. Every one re-measured when a control changes; the ceiling is ADR-0155's 675px of visible sheet and the floor is ADR-0017's 44px.

|                                 |                              |                                                                                                        |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `מתי` step, shipped, empty      | 241.5px                      | the two identical blocks that were read as two flights                                                 |
| `מתי` step, proposed, empty     | 238.5px                      | a place name on every moment **and** a suggestion pill, for 3px less — §5's filter is what pays for it |
| journey, 0 stops                | 220.5px                      | inside, 454.5px to spare                                                                               |
| journey, 1 stop                 | 396px                        | inside, 279px to spare                                                                                 |
| journey, 2 stops                | 607.5px                      | inside, 67.5px to spare (`MAX_ROUTE_STOPS` is 3)                                                       |
| whole `מתי` step, 2 stops       | 720.5px                      | **over by 45.5px** — it scrolls, and §7 says so                                                        |
| shipped `מתי · קטע 1` of 3      | 354.5px                      | fits easily, ×3 steps, and the journey is never seen whole                                             |
| endpoint node                   | 96.8px                       | place name + prose line + zone chip                                                                    |
| stop node                       | 150.5px                      | arrival + wait band + departure, no second label                                                       |
| segment                         | 25px                         | duration only on the when step                                                                         |
| `.vt-word` (the relative day)   | 72×31.8px, target **45.8px** | via the existing `.vt::after`, which grows no row                                                      |
| `pp-clear` on an empty stop     | 32×32px, target **44px**     | 32px since it shipped; the reach is the proposal's                                                     |
| `.jf-insert`                    | 22px, target **44px**        | −11px, because −8px measured 38px                                                                      |
| `.jf-offer` pill                | 27px, target **44px**        | −8.5px, because −7px measured 41px                                                                     |
| journey, 3 stops, all open      | 783px                        | over at both folds                                                                                     |
| journey, 3 stops, summarised    | 475.5 / 498.3px              | inside both — 199.5 / 13.7px spare                                                                     |
| whole step, 3 stops, all open   | 894px                        | over by 219 / 382px                                                                                    |
| whole step, 3 stops, summarised | 586.5 / 609.3px              | **inside** at 844 · over by 97.3px at 640                                                              |
| whole step, 2 stops, summarised | 514.8 / 537.5px              | **inside** at 844 · over by 25.5px at 640                                                              |
| summarised node                 | 46.8px                       | against ~150px open                                                                                    |
| summary token `.vt-word`        | 31.8px, target **45.8px**    | the primitive's own number, not a new box                                                              |
| `.journey-stop`                 | 31px                         | not restyled — the day view's own component                                                            |

## Consequences

- **`WhenField variant="span"` keeps every current caller.** A stay and a hire genuinely have two calendar dates; nothing here touches them. What changes is that transport stops using that variant.
- **Nothing is an entity, a table or a migration**, exactly as ADR-0154 could say: a round trip stays two `Booking`s, a journey stays one per leg, and §6 changes only which points authoring holds.
- **`reachesDestination` gains a second consumer**, which is the point — a derivation with one caller in one corner is the shape both ADR-0154 and this ADR were written about.
- **Three shipped defects are fixed on the way**, each measured rather than inferred: the unremovable empty stop, `pp-clear`'s 32px target, and the unfiltered place search for a train or bus endpoint.
- **Every stop count fits on a 390×844 phone after §9**, and on a 360×640 one the deep journeys still scroll — 75–88% less than before. Both numbers came from the owner reading the drawing rather than from the measurement pass, and the second only appeared once the drawn fold stopped being a constant.
- **The mockup carries three device questions**, wired as controls with the recommendation as the default: whether `באותו יום` shows always, whether the date suggestion is a pill or a pre-fill, and whether `הלוך ושוב` is pre-offered from the trip's readiness.
- **ADR-0159 §5 is reversed and ADR-0154 §4 is amended in place.** Neither is deleted: the costs they measured are real and are now costs this app has stopped paying, which is only legible with both sides written down.

## Alternatives considered

- **Regularise the two date/time blocks.** Rejected in §1 — ADR-0177 §1's own "tidying is not designing", and two aligned boxes are still two boxes.
- **Enter the arrival as a duration**, as ADR-0036 §3 chose for an event. Rejected: the ticket in your hand says a landing time, not "3:45", so this would force mental arithmetic on every flight. The duration stays a **read-out** on the segment, which is what it is.
- **A second ✕ on a stop.** Rejected in §4 — it is the copy ADR-0159 §5 refused, and the actual defect is that the first ✕ hides itself.
- **A dotted rail in the badge column.** Rejected: ADR-0159 §3 already tried exactly that on the day list and the owner read it on a phone — a rail is a connector, so it has to touch. Here it runs inside the block and is clipped only at the journey's two ends.
- **Merging the `מה ואיפה` and `מתי` steps, since both draw one rail.** Rejected: a place field is a Map errand (ADR-0134 §1) and ADR-0192 §3 puts where before when because the place derives the zone the times are read in. The rail is a shared **spine** across two steps, not one step.
- **A `ChoiceGrid` for the two trip edges.** Rejected: they are not two values of one field but two shortcuts to one — and after §5's filter there is only ever one.
- **Pre-filling the date with a latch.** Not rejected on merit — drawn in the mockup, and left to the device pass. The recommendation is the pill.
- **Giving a diverged return's seeded values a "suggested" look.** Rejected in §6.
- **Auto-running a seeded Places search, bundling an airport list, and a cross-trip "home airport".** Each rejected or deferred with its own reason in §8.

## Build log — 2026-08-23

**What is in**, each with its own commit and its own specs:

- **§8's search-kind axis.** `BOOKING_TYPE_PROFILE.searchKind`, `PLACE_SEARCH_KIND` widened with `train_station`/`transit_station`, and `findPlace`'s `type === BOOKING_TYPE.FLIGHT` conditional gone. The axis keys on `spendsSpanInMotion`, **not** `carriesRoute`, and a car hire is why: it has two route endpoints and they are rental counters, so asking Google for a station there would exclude the only right answers. A spec pins the iff.
- **§5's predicate.** `reachesDestination` exported, with its degradation clause pinned directly rather than only through `computeReadiness` — with two consumers, "can say yes or cannot confirm, never no" is a contract a form depends on.
- **§4's defect.** `PlacePicker` takes a `removable` role, so a stop the `＋` just added can be removed. Three of the four specs verified to fail without it. The ✕ also gained ADR-0017's reach; it had been 32px since it shipped.
- **§2's derivation.** `lib/journey-days.ts`, on instants, with the westward-crossing case as a spec beside the eastbound one a wall-clock rule passes by luck.
- **§5/§8's infra.** `lib/form-suggest.ts` — the source table, with "at most one" as a property of the mechanism.
- **§1/§3/§9's component.** `ui/domain/JourneyField` + `journey-field.css`, 15 specs.
- **`destinationRefOf`**, extracted rather than copied into a second caller.

**Three things the build found that the design had not:**

- **The compiler caught the backend half of §8.** `google-places.client.ts`'s `Record<PlaceSearchKind, string>` stopped compiling until the proxy answered the two new kinds — which is exactly the property ADR-0154 §2 built that table for. The single-type constraint bites harder on the ground modes (Google lists train, subway, light-rail, bus and ferry separately) and the empty-answer fallback written for the airport case already covers it.

- **§2's own implementation had a bug its specs caught.** An override was applied as `max(override, previousOffset)` — which constrains the OFFSET and says nothing about the INSTANT, so an arrival overridden to the same day at an earlier clock resolved to a moment _before_ its departure. A journey running backwards. An override is a floor on where the forward search starts, not an answer replacing it.

- **A sharp edge in `reachesDestination`, pinned rather than fixed.** Its name tier matches by substring in both directions, so a one-character Place-lite "reaches" almost any destination (`'a'` is inside `'Iceland'`). Shipped behaviour the readiness count depends on, so narrowing it is not this ADR's business — but it bounds §5's safety claim to endpoints that are really placeable. On the backlog.

### What the wiring needs, and the finding that stopped it

§1/§3/§6/§7/§9 are **not** wired. The step change and the rail were written, typechecked clean, and then failed 32 of `BookingSheet`'s 86 specs — and reading those failures found a design error in this ADR rather than a defect in the code:

**A hire renders through the same branch, and a hire is not a journey.** `isSpan && isTransport` is true for `car`, because a hire carries a route. So the rail would have claimed it — and dropped ADR-0184 §2's `＋ עד` window control, which a held edge offers and a journey never has. ADR-0163's own title says the thing this ADR should have read before drawing: _a hire is not a journey_. **The branch must be `isSpan && titlesFromRoute(type)`** — a journey — with a hire and a hotel keeping `WhenField`'s span, its two absolute dates (a stay genuinely has two calendar days) and its windows. That correction belongs in §3 and is the first thing the wiring does.

What remains, in the order it should be taken:

1. **Narrow the branch** to a journey, per the finding above, and keep the span path whole for hire and hotel.
2. **Rewrite the journey-specific specs** against the rail's markup. Most of the 32 are one repeated shape — a spec that filled two date inputs per leg now fills one per journey and its clocks through `TimeField` — but they include the save path, the note host and the per-end zones, so each needs reading rather than a sweep.
3. **§6's independent return** is the largest remaining piece and touches three layers this ADR did not count: `PlaceErrandField` needs names for a return's places, `bookingSheetDraft` needs to carry them, and `legBooking` needs `returnPoints` instead of `reversed`. The model is already right — one `Booking` per leg with its own two points — so none of it is a migration, but it is not the one-line change §6 implies.
4. **§8's place suggestion in the form**, which needs the trip's existing transport legs derived and passed to `PLACE_SOURCES`.
5. **§9's open-node state** on the form, once the rail is mounted.

The mockup remains the build spec and its measurements stand.
