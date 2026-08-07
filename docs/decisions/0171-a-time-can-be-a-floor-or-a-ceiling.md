# 0171 — A time can be a **floor** or a **ceiling**, and one connection is one stop

**Status:** Accepted, **and built 2026-08-07** — everything except the one item §10c leaves open. §4 is **dead**, replaced by §10a/§10a-i/§10b: the owner produced a day it does not survive, and the premise under it went with it. What shipped is §1, §2, §3, §5, §6, §7, §10a, §10a-i and §10b — **in both modes, from one derivation** (§10e). **Not built:** the two-numbers path (§10's treatment ה), which is still the owner's call and the only stored field this ADR would need.
**Date:** 2026-08-07
**Design reference:** [`mockups/a-time-without-a-position-v1.html`](../../mockups/a-time-without-a-position-v1.html) — five treatments against the same three days (§10), the class drawn with both its members (§10a), the deadline intersect and the Iceland numbering case (§10b). Measurements below are read from that file's live DOM.

**Extends** [0063](0063-category-time-behaviour-profile.md) — the time-behaviour profile gains its fourth behaviour, and it is read off the `midSpan.kind` that profile already carries rather than off a new field.
**Amends [0121](0121-embedded-map-phase-6-design.md) §6's 2026-08-06 amendment** (§7 below), which made "a place visited twice is two stops" the rule. That rule stands for a genuine revisit and is **reversed for exactly one case**.
**Refines** [0159](0159-the-day-says-what-is-between-two-events.md) §1 (what bounds a gap), [0164](0164-a-spans-own-edge-is-something-you-can-still-miss.md) (when an edge stops being ahead of you).
**Applies unchanged** [0011](0011-hard-soft-event-model.md) (hard/soft is the **commitment** axis and nothing here touches it — see §1's guard), [0018](0018-timeline-data-model-shape.md) (derive, don't store), [0038](0038-icons-and-canonical-category.md)/[0162](0162-a-car-hire-is-transport-you-drive-yourself.md) §3 (a glyph refines its category's whole time profile), [0109](0109-map-tab-design.md) §7 (no routing, and no travel-time model), [0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §10 (the day list is an **ordering**, not a proportional timeline), [0163](0163-a-hire-is-not-a-journey.md) §4 (holding a car is not being in transit).
**Answers** field reports #16, #17, #18 and #10 from the [session 216 triage](../planning/2026-08-07-session-216-field-reports-triage.md) — Workstream F.

## Context

Day view, 11 September, in the order it rendered on the owner's phone:

| row              | reads           |
| ---------------- | --------------- |
| flight           | `15:30–18:15`   |
| hotel check-in   | `15:00`         |
| flight           | `21:00–23:20`   |
| a band before it | `פער של 3 שעות` |

**You cannot be at the hotel at 15:00 when you land at 18:15**, and the app said you could. The check-in is a real, unmovable commitment with a real number on it — and the number does not mean what every surface in the app assumed it means. `15:00` on a check-in is the hour the room becomes **available**; the app read it as the hour you **arrive**, sorted the day on that reading (`mergeDayEntries` orders transition points by instant, ADR-0064 §B), and printed a sequence that is physically impossible.

The `~3 שעות` band is the same defect one surface over, which is why it is not fixed here as its own bug: report #16 is a **witness**, not a cause. Patching the number would have made the day agree with a reading of `15:00` that is wrong.

**And the app has no word for any of this.** ADR-0011 types every event `hard` or `soft`, and a check-in is emphatically `hard` — guarded on edit, never auto-moved, excluded from ripple, all correct. Hard/soft was simply never asked "what does the number mean", because until a booking's time could be a **floor** the question had one answer everywhere.

**Bundled in: one connection consumes two stop numbers** (report #10). Ben Gurion `1`, Vienna `2`, Keflavik `4` — the missing `3` is Vienna counted twice, once as the connection's arrival and once as its departure. It is here rather than in its own session because it is the same question in the other axis: **what is one moment and what is two**, asked of a place instead of a clock.

## Decision

### 1. A timestamp has a MEANING, and it is a third axis

```
exact       the instant IS the commitment          a flight departs, a landing lands, a table is booked
not-before  the instant is the EARLIEST it can be  a room from 15:00, a hire counter opening at 10:00
not-after   the instant is a DEADLINE              out by 11:00, the car back by 18:00
```

**The guard, stated once and load-bearing everywhere below: hard/soft answers whether a commitment can be moved or skipped. exact/not-before/not-after answers what the number on the row means.** They are independent and they compose freely. A hotel check-in is **hard and not-before** — it cannot be dragged, skipped or rippled, _and_ `15:00` is a floor. Nothing in this ADR makes a hard event soft, and nothing in it moves a hard event: §4 moves a **row**, never an instant.

That is the third axis, after ADR-0011's commitment axis and ADR-0063's time-presentation axis (bracketed / ambient / typical length). ADR-0063 §5 already said those two "compose freely — a `hard` `transport` flight is bracketed-not-ambient". This is the same sentence with one more column.

### 2. It is DERIVED, and it is already in the profile under another name

Owner's call: derived from the category and the edge, not stored, not authored. `CATEGORY_TIME_PROFILE` (ADR-0063) is where "how a kind of thing behaves over time" lives, and **the fact is already there** — it is `midSpan.kind`, added in session 215 and refined per glyph in ADR-0162 §3:

| `midSpan.kind` | what the span is    | start edge   | end edge    |
| -------------- | ------------------- | ------------ | ----------- |
| `journey`      | you are in transit  | `exact`      | `exact`     |
| `held`         | you hold a resource | `not-before` | `not-after` |
| absent         | an ordinary point   | `exact`      | `exact`     |

**This is not a coincidence to be exploited, it is the same fact.** A journey leaves at a moment and arrives at a moment. A resource you hold is **available from** a time and **due back by** one — that is what holding something means. Writing it a second time as an `edges` field beside `midSpan` would be two sources for one fact, which is exactly the shape ADR-0162 §2 refused when it made `durationUnit` optional rather than restating every category's answer.

So: **one resolver, `edgeMeaning(event, edge)`**, reading `timeProfileFor(event)` — the resolution that already exists, so a mode never reads its wording from the glyph and its meaning from the category. Everything falls out with no new table:

- **A hotel:** `lodging` is `held` → check-in `not-before`, check-out `not-after`. The reported case.
- **A car hire:** `transport` by category, but `🚗` refines `midSpan` to `held` (ADR-0162/0163) → pick-up `not-before`, return `not-after`. Which is the right answer, and nobody had to think about cars: a counter that opens at 10:00 and a car due back at 18:00 are a floor and a deadline. ADR-0164's own trigger was a car hire, and it called those two "timed obligations that can be breached" — a deadline in as many words.
- **A flight, a train, a bus:** `journey` → both ends `exact`. Unchanged, which is most of the app.
- **Everything else** — a museum, a meal, a soft idea — `exact`. Unchanged.

**No migration, no schema change, no new field on an entity, and it works for manual non-booking events** (ADR-0063 §4), which is the whole reason the profile is keyed on category rather than `BookingType`.

**The extension seam is named rather than built.** If a mode ever disagrees with its `midSpan.kind` — a check-in a hotel really does hold to the minute — it states an explicit `edges` in its `ICON_TIME_PROFILE` row and `edgeMeaning` reads that first. One line, the same shape as every other refinement in that table. We do not add the field before something needs it.

### 3. The row says which it is, in one token

> **Built as written; the placement question it depended on is answered in §10a.** The wording is the least contested part of this ADR and survived every treatment §10 drew. Where each word lands: a **floor** is on a row that has left the list (`UnplacedCommitment` in the strip), a **ceiling** on the transition row that stayed (`TransitionRow`), and `exact` is unmarked, which is most of the app.

`15:00` becomes `מ-15:00`. `11:00` becomes `עד 11:00`. `exact` is unmarked, because it is the default and marking it would put a word on nearly every row in the app to say "normal".

That is the smallest change that stops the lie, and on its own it would already answer half of report #17. It is not enough on its own — see §4 — but it is what makes §4's move readable rather than mysterious: a row that has moved still carries the number it was authored with.

### 4. A row moves only when its stated time is **impossible**, never when it is merely uncertain

> **DEAD — this section does not survive the owner's counter-example, and §10a/§10b replace it. Not built, and nothing in the code implements it.** Kept in full rather than deleted, because §10's whole argument is what this rule gets wrong and a reader cannot check that against a blank. **One half of it did survive, in §10b:** the intersect for a `not-after` edge, which the counter-example never touched.

This was the one question the owner did not sign off as first put (_"sometimes it's obvious on a rolling trip where you move from one place to another, or you check in after a flight, and sometimes it's not obvious at all"_), and the hesitation was right about the first proposal, which slid a flexible edge past any transport on the day. **The distinction the owner was reaching for is impossible vs. unknown**, and the app can tell them apart without guessing:

> **A `not-before` edge is placed after the last `journey` on its day that ENDS after its nominal time. A `not-after` edge is placed before the first `journey` on its day that STARTS before its nominal time. Otherwise nothing moves.**

Both halves say one thing: **you cannot be at a place while you are in transit somewhere else.** If the day's last flight lands at 23:20, `15:00` is not when you reach the hotel — no reading of the clock makes it so, and the app is not guessing which hour you will actually check in, it is refusing to state one it knows is false.

| day                                                                 | result                                             |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| 11 September (flights to `18:15` and to `23:20`, room from `15:00`) | check-in moves below both flights                  |
| land `10:00` · museum `12:00` · room from `15:00` · dinner `20:00`  | **nothing moves** — no journey ends after 15:00    |
| room until `11:00` · breakfast `09:00` · flight `14:00`             | **nothing moves** — no journey starts before 11:00 |
| room until `11:00` · flight departs `10:00`                         | check-out moves above the flight                   |

**Why a journey and not "any commitment".** A dinner reservation at 20:00 is exact and it is a real commitment, and it says nothing about whether you can check in at 15:00 — you would obviously check in first. A journey is the one commitment the app knows **takes you somewhere else and holds you for its whole span**, and ADR-0163 §4 already drew that line for its own reasons: holding a car is not being in transit, so a hire on the day moves nothing. The same `midSpan.kind` that decides §2 decides this, which is why there is one property here and not two.

**Three properties this move has, and each is a constraint on how it is built:**

- **It is a POSITION, not a time.** The day list is an ordering, not a proportional timeline (ADR-0161 §10), so placing a row lower claims nothing about the clock. The row still reads `מ-15:00`; the app does not invent `23:20` for it and must not.
- **The stored instant is never rewritten.** This is what keeps ADR-0011 whole: a hard event is never auto-moved, and nothing here moves one. The placement is derived at render, from data that is already there — the same posture ADR-0159 §3 took for the connection and ADR-0063 for the profile itself.
- **The moved row names its anchor** (owner's call): `צ׳ק-אין · מ-15:00 · אחרי הנחיתה`. A row that is not where its clock says it is must not be a mystery, and the word comes from the anchoring journey's own `eventTransitionKeys` end key — so a train reads `אחרי ההגעה` and a flight reads `אחרי הנחיתה` with nothing hard-coded. **A row that did not move says nothing extra**, which is the majority of them.

### 5. A flexible edge does not bound free time

Free time is time between **commitments**. A room available from 15:00 does not consume any particular hour, so it neither opens nor closes a gap: **`freeBetween` measures between `exact` edges** (ADR-0159 §1's derivation and `GAP_MIN_MINUTES` floor are otherwise untouched, in both modes, so the two still cannot disagree about what a hole IS).

Report #16 is then answered without a patch of its own. With the check-in out from between the two flights, they are **adjacent**, and whatever ADR-0159 §2 says about them is what the day draws.

**And that adjacency is worth more than it looks.** `dayBlocks` sets `prevEnd = null` on any entry that is not a leaf event, so today a transition row sitting between two legs **suppresses the join between them entirely** — no gap, no connection band, nothing derived at all. The misplaced check-in was not only stating a false order, it was hiding whatever was really true of that window.

### 6. A floor passing is not the thing happening

ADR-0164 counts an ambient span's own edge in `נותרו היום` while `t.atMs > nowMs`. Under §1 that test means different things at the two ends, and the owner's call splits them:

- **A `not-after` edge stays as it is.** Check-out by 11:00 stops being ahead of you at 11:00, because at 11:01 it is not pending, it is missed. Unchanged.
- **A `not-before` edge stays counted until it is settled or its day ends.** 15:01 does not mean you have checked in. ADR-0164's question is _"how many things ahead of you today can still be missed"_ and an un-checked-into hotel at 19:00 is exactly one.

**ADR-0164's rejected alternative stays rejected.** It refused to count only the END transitions, on the grounds that _"a 15:00 check-in with luggage is equally missable"_ — and it was right; this section makes the check-in count for **longer**, not less. Its `isAmbient` double-counting guard (§3 there) is untouched, so a same-day journey still contributes one.

### 7. One connection is one stop (reversing part of ADR-0121 §6's amendment)

**Merge exactly when the two moments are the two ends of ONE derived connection** — the arrival of a leg and the departure of the next leg of the same journey, which `connectionMinutes` already answers and `connectionStops` already keys by place **and day**. Vienna is then one stop and Keflavik is `3`.

**Anything else keeps its own number**, including two moments at one place with nothing else drawn between them: landing at an airport in the morning and returning a car there at 18:00 is a genuine revisit, and adjacency in the day's stop list is not evidence that it was one visit.

**What ADR-0121 §6's amendment claimed, and what survives.** It said, correctly, that _"a day is a sequence of STOPS, and a place you go to twice is two of them"_ — and it was reasoning about a place whose landing was at 02:00 and whose car was due back at 18:00, which is a real revisit. The reversal is narrow and its scope is the whole of it: **a derived arrival-plus-departure of one connection is not going somewhere twice, it is waiting.** Everything else that amendment decided is preserved, and preserving it is a constraint on the build rather than an afterthought:

- The stop sequence is still built and numbered **with no clock**, so a tick can never renumber a pin.
- A place visited once still cannot move — nearly every pin on the canvas.
- A genuine later revisit still consumes its own number.
- Gaps in the numbering are still correct and informative where a filter hides a stop.

**And the merge reads the derivation the surfaces already share.** The pin's word, the day's band and the Map row all come from `connectionMinutes` (ADR-0159 §6), so the number now comes from it too — the same property, extended: one derivation, rendered wherever it is asked. A stop merged into one number is precisely a stop already wearing the connection word instead of `נחיתה`.

### 8. Deliberately not doing

- **No travel-time model, no routing, no "can you make it".** ADR-0109 §7 stands, and ADR-0159/0161 both refused a crow-flies number in this exact slot for the reason that decides it again: a number that looks like an answer is worse than none. §4 never says how long it takes to reach the hotel; it says only that you were not there yet.
- **No per-event override, and no authoring question.** §2's seam is named and left unbuilt. Asking someone to classify the time they just typed for a museum is a worse form than the defect.
- **No new hue and no new row shape.** `מ-`/`עד` and the anchor phrase ride the existing transition row's own slots.
- **Not the round-trip/multi-city authoring axis**, and not ADR-0159 §7's legs on different days. Untouched.

## Consequences

- **`CATEGORY_TIME_PROFILE` gains its fourth behaviour and no fourth field.** `edgeMeaning(event, edge)` joins `eventTransitionKeys` / `eventMidSpan` / `bookingTypeDurationUnit` as a reader over one resolution, and a new category or mode declares nothing new to get the right answer.
- **Three surfaces stop asking the clock a question it cannot answer**: the day's entry order (`mergeDayEntries`), the gap derivation (`gaps.ts` / `day-joins.ts`), and `נותרו היום` (`buildDayGlance`). Each consumes §1 rather than growing its own special case, which is the routing the triage note asked for.
- **A suppressed join becomes derivable.** Once the check-in leaves the middle of the two flights, `dayBlocks` can measure between them for the first time on that day — see §5.
- **The ordering rule is testable without a device**: §4's table is four fixtures, and the clock-pinning rule (`setSimulatedNow`) already applies to every one of them.
- **Report #16 gets no code of its own**, and that was the point of holding it. If the band still reads wrong after §4 and §5, it is a different defect (see below), not this one.
- **`buildPinOrderIndex` takes a dependency on the journey derivation** it did not have — the pin number now reads `connectionMinutes` like the pin's word already does. That is one more caller of a shared rule, not a new rule.
- **Two ADRs are refined in place rather than superseded**: 0164's count question keeps its answer at one end and gains a longer tail at the other; 0121 §6's amendment keeps everything except the one case §7 names.

## What this does not settle

- **Whether the 11 September flight pair derives as a connection at all.** `connectionMinutes` requires `from.toPlaceId === to.fromPlaceId`, and two separately-authored bookings can name one airport through two different `Place` rows. If they do, §5 leaves a correct-but-thin `פנוי · 2:45 שע׳` where a layover band belongs — which would be **its own defect**, in the place-identity axis, and should be filed as one rather than folded in here. The build session should check this first, on the owner's real data, because it decides whether §5's outcome on the reported day is a band or a gap.
- **Whether `צ׳ק-אין · מ-15:00 · אחרי הנחיתה` fits a phone row.** Three tokens in a slot ADR-0161 §7 measured to the pixel. This is a mockup question at 360px and 390px, and it is why §9 exists.
- **Whether a moved row needs anything at its nominal position** to say "it was here". Probably not — nothing else in the day leaves a trace of where it is not — but it is judged from a render, not from here.

## Alternatives considered

- **Overload hard/soft.** Rejected in the handoff and again here: it is the axis ADR-0011 built the whole app on, "can this move" and "what does this number mean" are different questions, and a check-in answers `no` and `a floor` at the same time. Conflating them would make the one primitive rule 1 protects mean two things.
- **Store the meaning on the booking, authored per event.** Rejected (owner's call): a migration, a write path, a new field on a shape ADR-0018 keeps derived, and a form question nobody wants for a museum. The lookup answers every real case, including manual non-booking events, which a booking column cannot.
- **A fourth explicit `edges` field on the profile beside `midSpan`.** Rejected as two sources for one fact (§2) — the same argument ADR-0162 §2 made against restating `durationUnit` on every row. Named as the seam if a mode ever disagrees.
- **Wording only, no ordering change** (`מ-15:00` and leave every row where it is). Genuinely defensible, and rejected: 11 September still lists a check-in above a flight that lands eight hours later, and an honest label on a false sequence is still a false sequence.
- **Always slide a flexible edge past the day's transport.** The first proposal, rejected by the owner's hesitation and then on its own merits: it moves rows on days where nothing was wrong.
- **Pin every `not-before` edge to the foot of its day.** Predictable and needs no rule at all, and wrong on the common day where 15:00 genuinely is when you check in, between the museum and dinner.
- **Slide past any exact commitment, not only a journey.** Rejected on the dinner case (§4): being booked for 20:00 says nothing about whether you can be at the hotel at 15:00.
- **Compute when you can actually reach the hotel** (travel time from the airport). Rejected: it is routing, the app has none by decision, and the honest weaker claim — "not before you land" — is the one that needs no data we do not have.
- **For #10: merge any two adjacent moments at one place.** Cheaper, no journey derivation, and it merges the morning landing with the evening car return whenever nothing else was drawn between them. Adjacency is not evidence of one visit.
- **For #10: one place, one number per day.** Simplest rule in the file, and it drops the distinction the owner asked for by name: a genuine later revisit loses its own number.

## §9 — What the build session needs before it renders anything

A phone-sized day-timeline mockup, at 360px and 390px, in both themes, with **11 September as a mandatory case**. It was drawn (`mockups/a-time-without-a-position-v1.html`), and drawing it did not settle the render questions above — it reopened the section they belonged to. See §10.

## §10 — Reopened the same day: §4 does not survive the owner's own day

**The counter-example, in the owner's words:**

> Check in from 15:00 · Flight lands at 21:00 · Car rental at 22:00 — _"what we're gonna do in practice is that we're gonna check in at the hotel only after the car rental, and end our day there. In other cases maybe we'll actually check in as soon as possible."_

§4 places a `not-before` edge after the last **journey** of the day that ends after its floor. A car hire is `held`, not a journey (ADR-0163 §4, which §4 leans on deliberately) — so the rule lands the check-in **after the flight and before the car**, which is not this day.

**And no repair helps, which is the finding.** Extending the anchor to `held` rows would fix this day and break "check in as soon as possible" on the next one. The two sentences above describe **the same data with two different answers**, so no derivation over that data can produce both. §4's own distinction — impossible vs. unknown — was right as far as it went and simply does not reach: 22:00 is not impossible at 15:00, it is _unknown_, and §4 has nothing to say about unknown except "leave it where it is", which is where the reported defect lives.

**So the premise under §3/§4 is what is being reconsidered, not the rule.** Owner: _"maybe these kinds of events/bookings couldn't be numbered and couldn't reliably be ordered on the day schedule."_ That is the reopening: **does a `not-before` edge have a position in the day at all** — and if it does not, a number on the Map is the same claim in another host (ADR-0121 §6), which is why the numbering half rides along.

**Five treatments are drawn**, each against the **same three days** — the counter-example, an ordinary day nobody complained about, and 11 September — because a treatment that reads well on one is not an answer:

|       | treatment                                     | order claim?           | costs                             | survives 3/3            |
| ----- | --------------------------------------------- | ---------------------- | --------------------------------- | ----------------------- |
| **א** | today's instant interleave                    | yes, sometimes false   | —                                 | no (1/3)                |
| **ב** | §4's impossible-only slide                    | yes                    | derived, no field                 | no (2/3)                |
| **ג** | leaves the list for `.day-ambient`            | no                     | reuses the stay backdrop          | yes                     |
| **ד** | an unplaced tail under one hairline           | no                     | one line                          | yes                     |
| **ה** | two numbers: reservation floor + day position | only when a human said | **a nullable column + migration** | yes, and answers _when_ |

_(§10a-i revises this table: **ג** and **ד** were never rivals. Each is half of the answer — the strip for commitments, the tail for ideas — and the mockup's `ג+ד` frames are what the session actually landed on.)_

Three things the drawing established that the prose could not:

- **א is not a rule, it is a coincidence.** It is correct on exactly one of the three days. That is the sharpest statement of the original defect in the file.
- **ג and ד both already exist as shapes.** `.day-ambient` is the backdrop a multi-night stay's _middle_ days already render as; the untimed tail is where ADR-0161 §10 already puts "today, but no position". Neither is a new grammar — which is the whole reason they are the cheap answers.
- **ה is the only treatment that can answer _when_, because it is the only one that stops asking one number to be two facts.** `15:00` is a fact about the **reservation**; the position is a **plan**. ADR-0047 §1 makes the Event the sole time authority, so today there is one number and placing the row at 22:40 destroys the floor. That is a stored field and a migration — the thing §2 rejected on the owner's own call in the previous round, reopened only because the instruction this round was explicitly not to force the answer into the existing solution.

**Measured from the mockup's live DOM at 360px:** `ד`'s hairline is **13px**, the whole of what it adds to a day. `ה`'s second number doubles the time slot (**15px → 30px**) and the row does **not** grow — a transition row's height comes from its badge, not its text — but the slot widens **38px → 46px**, and that 8px comes off the title.

### 10a. The owner generalized it, and the generalization decides the pick

Owner, on the treatments: _"we should think if we should generalize this not-before / not-after behaviour and the 'without a position' for other events that don't have times."_ **Signed off: one class.**

**They are the same thing, and the test is the width of the window.** An entry holds a position when its window is narrow enough to place it:

| entry                  | window                                    | position?     |
| ---------------------- | ----------------------------------------- | ------------- |
| `exact`                | an instant                                | yes           |
| `not-after` (deadline) | \[morning, 11:00] — closed where you act  | yes, see §10b |
| `not-before` (floor)   | \[15:00, end of day] — open where you act | **no**        |
| no clock at all        | the whole day                             | **no**        |

**And the app already renders the second unpositioned kind, silently.** `DayView`'s `{untimed.map(…)}` puts untimed events at the tail of `.day-list` with no separator and nothing saying they hold no position — so an untimed event just looks like the last thing of the day. That is the reported defect exactly, already shipped and never reported, presumably because nobody expected the tail to mean anything.

**Two things follow, and the second was got wrong once before the owner corrected it:**

1. **The tail treatment stops being an addition.** It is the tail that already exists, finally named — root rule 8's "generalize the one-off", not a second tail beside it.
2. **It isolates where the stored field is actually needed.** An untimed row's number slot is **free**, so setting its time _is_ the placement — ADR-0161 §7's `＋ שעה` already is that control, on that row, today. Only a `not-before` edge has already spent its one number on the floor. So the migration is required for **flexible edges only**, not for the class.

### 10a-i. One class, but TWO placements — and the discriminator is hard/soft

**The first draft of §10a concluded that one class means one tail, and that was wrong.** Its argument was that a backdrop can carry a stay and cannot carry `קניות לדירה`, therefore both belong in the tail. The observation is right and the conclusion inverted it. Owner:

> _"I'm not sure that untimed events and commitments without a hard time should be classified as the same and shown as the same category. Untimed commitments maybe should be on top?"_

**Correct, and the reason is the axis this ADR spends §1 promising not to collapse.** A shopping errand does not belong in the backdrop because it is **not a commitment** — not because the backdrop is the wrong host. "Holds no position" is one **derivation**; it is not one **category on screen**. Within it, `hard` and `soft` are still as different as ADR-0011 says they are, and a hard commitment buried at the foot of the day under an optional errand is the demotion that rule exists to prevent.

> **One derivation, two placements.** `hard` + no position → the **top**: a claim on your day, which you carry all day. `soft` + no position → the **tail**: spare capacity.

Three consequences, all owner-signed-off in the same round:

- **The top is the `.day-ambient` strip that already exists**, not a new band. A multi-night stay's middle days already render there, off the counted schedule, saying "true of this day" rather than "happening now" — so a stay reads the same way on **every** day of itself, edges included, and no grammar is added.
- **A strip row must be tickable `היינו`.** ADR-0164 counts a check-in in `נותרו היום` until it is settled (§6 above), so a host that cannot be settled leaves that number stuck all evening. _Built 2026-08-07 with **no** new density, correcting this section as first written: it said "a fourth density", and `SettleControl` already had four (`prompt`/`sheet`/`compact`/`board`). `compact` — icon-only beside a label that needs the width — is exactly this shape, so the strip reuses it. A fifth density would have been the pile-up `frontend/CLAUDE.md` warns about, arrived at by not counting._
- **An untimed `hard` event goes to the top too** — a booking with no clock at all, not only an edge with a floor. The discriminator is **commitment**, not "does it carry a number", so two hard things that both lack a position cannot render in different places.

**And this retires the argument the previous draft used to pick between the two treatments.** They were never rivals; each was half. The `היינו` question that was going to decide it is now a requirement on the top host instead.

### 10b. A deadline keeps a position, and still earns no number

The owner's case: _"there could be a flight before the max checkout time."_ Correct, and it is why a deadline's position is not simply its ceiling.

**Why a deadline is decidable where a floor is not.** A floor is **open on the side you act** — "from 15:00" means any time after, so the app would have to guess which, and cannot. A ceiling is **closed on the side you act** — "by 11:00" means before, full stop — so it can be **intersected** with the day's other hard bounds. There is no reading of the data in which you check out after you have flown.

> **A `not-after` edge sits at the earlier of its ceiling and the first journey that departs before that ceiling.** Two hard bounds, the earlier wins, nothing guessed. On a day with nothing to intersect against, it sits at its ceiling and does not move — the same test that broke §4, applied from the other side and passing.

**But the owner then split the two claims, and this is the sharper half:**

> _"it shouldn't be numbered and ordered as if it was a normal event, because then on the map weird things could happen (you're back in Iceland after landing in Tel Aviv for example)"_

Check out of Reykjavik by 11:00, fly, land in Tel Aviv. Number the check-out from its ceiling and the day's stops read Keflavik → Ben Gurion → the Reykjavik hotel. **A position in the list and a number on the map are two different claims**, and the intersect only earns the first: it works when there is a departure to intersect against, and on a day without one ("out by 11:00" against "museum at 10:00") the order is genuinely unknown while a number would assert one anyway.

**So the Map rule is stronger than "no position, no number":**

> **A stop number is only ever the index of a moment the app actually knows.** `exact` moments are numbered. A floor, a ceiling and a row with no clock are not — the slot stays so the list keeps its alignment, the mark leaves.

**This also catches a shipped defect nobody reported** (owner signed off on fixing it here rather than filing it separately): an untimed event's place is numbered today. `place-usage.ts` gives it `prominence: 'edge'` with `at: undefined`, so `hasScheduleSlot` passes, and `buildPinOrderIndex` sorts it after the timed stops and numbers it regardless. One rule covers it and the layover both.

### 10e. Plan mode: the same fact, without the offer

**Found by the owner off the shipped build**: _"in plan mode it's still ordered by time and not displaying the החל מ"_. Correct — §10a's split ran in `DayView` only, so Plan kept interleaving a check-in at its floor. The two modes were saying different things about one booking.

**That is the one difference that is not allowed.** ADR-0159 §1 settled the shape of mode difference and this is the case it was written for: the modes differ in **posture**, never about a **fact**. "15:00 on a check-in is a floor" is a fact about the booking, not about the screen reading it — so both modes make the same split, from the same `placeDayEntries`, and Plan's day is now identical to Trip's in what it _claims_.

**What differs is what you can do about it, and in Plan the answer is currently nothing** (owner's call). Plan's posture is to _offer_ — its gap is a `שבץ` control where Trip's is a statement — and the offer this row wants is "place it", which is §10's treatment ה and needs the stored field that is still undecided (§10c). So Plan gets the placement and no control, which is honest rather than provisional: there is nowhere to put an answer if it asked for one.

Three consequences, all signed off in the same round:

- **The strip row carries no settle pair in Plan.** Plan settles through a sheet off the row menu and never inline (`SettleControl variant="sheet"`), and `נותרו היום` — the number that made settling load-bearing on Trip's copy (§6) — is a Trip-mode number. One component, its control optional.
- **The tail's line sits BELOW the "after the last event" drop slot.** A drop slot is a position; everything that has one stays above everything that does not.
- **Plan's gap logic needed nothing.** It already measures between consecutive event groups only, so a flexible edge has never bounded a position there — §5 was already true in that mode by construction.

### 10d. Built — what shipped, and the three things the code taught

_2026-08-07, in one pass over `@waypoint/shared`, `lib/` and two screens._

- **`edgeMeaning(event, edge)`** lands beside `eventTransitionKeys` / `eventMidSpan` / `eventDurationUnit`, reading the same `timeProfileFor`. `isExactEdge` rides with it, because the day's ordering and the map's numbering must ask the _same_ predicate or a row can hold a position its pin refuses to number.
- **`placeDayEntries`** does the split, and **the order of the two calls is the fix**: it runs before `dayBlocks`, so the check-in leaves the list and the two flight legs become adjacent for the first time. Its own test asserts that adjacency rather than the check-in's absence, because that is the part a future refactor could silently undo.
- **A deadline pinned to a departure needed a tiebreak nobody predicted.** `mergeDayEntries` puts an event group _before_ a transition at a shared instant — right for every other transition and backwards for exactly this one, since "be out by then" means before. The intersected edge carries a rank so it sorts above the flight it was pinned to. Found by a test, not by reading.
- **§5 turned out to have a second half.** Taking the floor out of the list fixes the check-in; a **ceiling** stays in it, and any transition used to null `prevEnd` and end the measurement. So a flexible edge is now _transparent_ — it neither bounds a gap nor hides one — and an exact transition still ends the run, unchanged.
- **The count needed the settled check spelled out.** §6 assumed `bookingTransitionsOnDate` drops settled events; it drops only `SKIPPED`. A check-in you have actually done is precisely why that branch is settleable, so `DONE` is checked explicitly.
- **One shipped spec was rewritten, not relaxed** (ADR-0164's own discipline): `Map.test.tsx`'s _"a check-in day is an ordinary NUMBERED row"_ asserted the number §10b removes. The distinction it protected — an edge day is not an ambient night — survives on firmer ground than a digit: the edge still passes `hasScheduleSlot`, so its tier is `upcoming`, and its row still carries the check-in word a middle night has none of.
- **What is NOT verified:** the render on a real phone. Every decision here is covered by unit tests with no DOM layout, and the two new pieces of CSS (`.day-unplaced`, the strip's settle cluster) have been seen only in the mockup. That is ADR-0017's device pass, and §10c's open question is the one to answer on it.

### 10c. What is still open

**Nothing above changes §1, §2, §5, §6 or §7**: the three values, where they are derived from, that a flexible edge bounds no gap, that a floor passing is not the thing happening, and that one connection is one stop.

**One thing remains the owner's to say:**

1. **Is the two-numbers path worth its column?** It is the only route to "when" for a flexible edge, and after §10a it is the _only_ place in this ADR that needs a stored field — an untimed row reaches the same outcome through a control that already ships. Everything else in §10a/§10b is signed off.

**And one question the mockup cannot settle**, for the device pass: whether `ללא מיקום ביום` reads as a boundary or as an accusation. An untimed event is a legitimate way to say "sometime today", and a line that reads as _"you failed to schedule this"_ would be a new defect in place of the old one.
